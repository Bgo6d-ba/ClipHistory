import AppKit
import Carbon
import CryptoKit
import ServiceManagement
import SwiftUI
import WidgetKit

let limit = 50
// ponytail: fixed 7 days; make it a setting if people want to change it
let maxAge: TimeInterval = 7 * 24 * 60 * 60
// ponytail: images over 20 MB are skipped to keep the history folder small
let maxImageBytes = 20_000_000
let skipTypes: Set<NSPasteboard.PasteboardType> = [
    .init("org.nspasteboard.ConcealedType"),
    .init("org.nspasteboard.TransientType"),
]
let storeFile = sharedDir.appendingPathComponent("history.json")
let legacyDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("ClipHistory")

final class Store: ObservableObject {
    @Published var items: [Clip] = []
    let file: URL
    var imagesDir: URL { file.deletingLastPathComponent().appendingPathComponent("images") }

    init(file: URL) {
        self.file = file
        guard let data = try? Data(contentsOf: file) else { return }
        items = (try? JSONDecoder().decode([Clip].self, from: data))
            ?? (try? JSONDecoder().decode([String].self, from: data))?.map { Clip(text: $0) }
            ?? []
        for index in items.indices where items[index].date == nil {
            items[index].date = Date()
        }
        prune()
    }

    func prune() {
        let cutoff = Date().addingTimeInterval(-maxAge)
        let before = items.count
        items.removeAll { !$0.pinned && ($0.date ?? .distantFuture) < cutoff }
        if items.count != before { save() }
    }

    func add(_ text: String) {
        insert(Clip(text: text))
    }

    func addImage(_ png: Data) {
        let name = SHA256.hash(data: png).prefix(8).map { String(format: "%02x", $0) }.joined() + ".png"
        let url = imagesDir.appendingPathComponent(name)
        if !FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.createDirectory(at: imagesDir, withIntermediateDirectories: true)
            try? png.write(to: url)
            try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        }
        insert(Clip(text: "", image: name))
    }

    func insert(_ clip: Clip) {
        if let index = items.firstIndex(where: { $0.id == clip.id }) {
            if items[index].pinned { return }
            items.remove(at: index)
        }
        items.insert(clip, at: 0)
        var unpinned = 0
        items.removeAll { clip in
            guard !clip.pinned else { return false }
            unpinned += 1
            return unpinned > limit
        }
        save()
    }

    func delete(_ clip: Clip) {
        items.removeAll { $0.id == clip.id }
        save()
    }

    func togglePin(_ clip: Clip) {
        guard let index = items.firstIndex(where: { $0.id == clip.id }) else { return }
        items[index].pinned.toggle()
        save()
    }

    func clear() {
        items.removeAll { !$0.pinned }
        save()
    }

    func save() {
        guard let data = try? JSONEncoder().encode(items) else { return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: file, options: .atomic)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        let keep = Set(items.compactMap(\.image))
        for name in (try? FileManager.default.contentsOfDirectory(atPath: imagesDir.path)) ?? [] where !keep.contains(name) {
            try? FileManager.default.removeItem(at: imagesDir.appendingPathComponent(name))
        }
        WidgetCenter.shared.reloadAllTimelines()
    }
}

final class PanelModel: ObservableObject {
    let store: Store
    @Published var query = "" { didSet { selection = 0 } }
    @Published var kind: Kind? { didSet { selection = 0 } }
    @Published var selection = 0
    @Published var confirmingClear = false

    init(store: Store) { self.store = store }

    var visible: [Clip] {
        (store.items.filter(\.pinned) + store.items.filter { !$0.pinned }).filter {
            (kind == nil || Kind.of($0) == kind)
                && (query.isEmpty || $0.text.localizedCaseInsensitiveContains(query))
        }
    }

    // Keyboard moves scroll the row to the card; mouse hover only highlights, so the row doesn't jump under the pointer.
    @Published var scrollTarget: String?

    func move(_ step: Int) {
        let visible = visible
        selection = max(0, min(selection + step, visible.count - 1))
        scrollTarget = visible.indices.contains(selection) ? visible[selection].id : nil
    }

    var kinds: [Kind] {
        let present = Set(store.items.map(Kind.of))
        return Kind.allCases.filter(present.contains)
    }

    func cycleKind() {
        let all: [Kind?] = [nil] + kinds
        kind = all[(all.firstIndex(of: kind)! + 1) % all.count]
    }
}

struct HistoryView: View {
    @ObservedObject var model: PanelModel
    @ObservedObject var store: Store
    let pick: (Clip) -> Void
    @FocusState private var searchFocused: Bool

    var body: some View {
        let visible = model.visible

        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Text("Clipboard").font(.system(size: 14, weight: .bold))
                Text("\(store.items.count)")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                Spacer()
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search", text: $model.query)
                        .textFieldStyle(.plain)
                        .focused($searchFocused)
                }
                .font(.system(size: 12))
                .padding(.horizontal, 10)
                .frame(width: 150, height: 28)
                .glass(Capsule())
                Menu {
                    Button("Clear History…") { model.confirmingClear = true }
                        .disabled(store.items.allSatisfy(\.pinned))
                    Toggle("Open at Login", isOn: Binding(
                        get: { SMAppService.mainApp.status == .enabled },
                        set: { on in
                            try? on ? SMAppService.mainApp.register() : SMAppService.mainApp.unregister()
                            model.objectWillChange.send()
                        }
                    ))
                    Divider()
                    Button("Quit ClipHistory") { NSApp.terminate(nil) }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()
            }
            .padding(.leading, 4)

            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ForEach([nil] + model.kinds, id: \.self) { kind in
                        chip(kind)
                    }
                }
                .padding(.horizontal, 2)
            }
            .scrollIndicators(.never)
            .opacity(model.confirmingClear ? 0 : 1)
            .allowsHitTesting(!model.confirmingClear)
            .overlay { if model.confirmingClear { clearBanner() } }

            ScrollViewReader { proxy in
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 8) {
                        ForEach(Array(visible.enumerated()), id: \.element.id) { index, clip in
                            card(clip, selected: index == model.selection)
                                .onHover { if $0 && model.selection != index { model.selection = index } }
                                .id(clip.id)
                        }
                    }
                    .padding(.horizontal, 3)
                    .padding(.vertical, 4)
                }
                .scrollIndicators(.never)
                .onChange(of: model.scrollTarget) {
                    guard let target = model.scrollTarget else { return }
                    withAnimation(.snappy(duration: 0.2)) { proxy.scrollTo(target) }
                }
            }
            .frame(height: 57)
            .overlay {
                if visible.isEmpty {
                    Text(model.query.isEmpty && model.kind == nil ? "Copy something to start" : "Nothing here")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .glass(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .onAppear { DispatchQueue.main.async { searchFocused = true } }
        .onChange(of: store.items) {
            if let kind = model.kind, !model.kinds.contains(kind) { model.kind = nil }
        }
    }

    func clearBanner() -> some View {
        let count = store.items.filter { !$0.pinned }.count
        return HStack(spacing: 10) {
            Image(systemName: "trash")
                .foregroundStyle(.red)
            Text("Delete \(count) item\(count == 1 ? "" : "s")? Pins are kept.")
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
            Spacer()
            Button("Cancel") { model.confirmingClear = false }
            Button("Clear") {
                store.clear()
                model.confirmingClear = false
            }
            .tint(.red)
            .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 12)
        .frame(height: 30)
        .controlSize(.small)
        .glass(Capsule(), tint: .red.opacity(0.15))
    }

    func chip(_ kind: Kind?) -> some View {
        let selected = model.kind == kind
        return Button { model.kind = kind } label: {
            HStack(spacing: 5) {
                if let kind { Image(systemName: kind.icon) }
                Text(kind?.title ?? "All")
            }
            .font(.system(size: 11, weight: .semibold))
            .padding(.horizontal, 10)
            .frame(height: 26)
            .foregroundStyle(selected ? Color.white : Color.primary)
            .glass(Capsule(), tint: selected ? .accentColor : nil)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    func card(_ clip: Clip, selected: Bool) -> some View {
        let kind = Kind.of(clip)
        return ZStack(alignment: .bottom) {
            preview(clip, kind)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
            HStack(spacing: 3) {
                Spacer(minLength: 0)
                if selected {
                    badge("xmark", help: "Delete (⌘⌫)") { store.delete(clip) }
                }
                if selected || clip.pinned {
                    badge(clip.pinned ? "pin.fill" : "pin", tint: clip.pinned ? .orange : .primary, help: clip.pinned ? "Unpin" : "Pin") {
                        store.togglePin(clip)
                    }
                }
                if !selected {
                    Text(shortAgo(clip.date))
                        .font(.system(size: 7.5, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 6)
            .frame(height: 13)
        }
        .frame(width: 78, height: 47)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .glass(RoundedRectangle(cornerRadius: 10, style: .continuous), tint: kind.tint.opacity(0.22))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color.accentColor, lineWidth: 1.5)
                .opacity(selected ? 1 : 0)
        )
        .scaleEffect(selected ? 1.04 : 1)
        .animation(.snappy(duration: 0.15), value: selected)
        .contentShape(Rectangle())
        .onTapGesture { pick(clip) }
        .help(clip.image == nil ? clip.text : "Image")
    }

    func badge(_ icon: String, tint: Color = .primary, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 7, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 13, height: 13)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
    }

    @ViewBuilder
    func preview(_ clip: Clip, _ kind: Kind) -> some View {
        let text = clip.text.trimmingCharacters(in: .whitespacesAndNewlines)
        switch kind {
        case .image:
            if let name = clip.image, let image = thumbnail(store.imagesDir.appendingPathComponent(name), maxPixel: 200) {
                Image(nsImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: "photo").foregroundStyle(.secondary)
            }
        case .color:
            if let swatch = hexColor(text) {
                swatch.color.overlay(
                    Text(text.uppercased())
                        .font(.system(size: 8.5, weight: .bold, design: .monospaced))
                        .foregroundStyle(swatch.light ? .black : .white)
                )
            } else {
                Text(text).font(.system(size: 8.5, weight: .semibold, design: .monospaced)).lineLimit(2).padding(6)
            }
        case .code:
            Text(oneLine(text))
                .font(.system(size: 8, design: .monospaced))
                .foregroundStyle(.primary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .padding(.horizontal, 6)
                .padding(.vertical, 8)
        case .link, .text:
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Image(systemName: kind.icon)
                    .font(.system(size: 7, weight: .bold))
                    .foregroundStyle(kind.tint)
                Text(kind == .link ? linkDisplay(text) : oneLine(text))
                    .font(.system(size: 9.5, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .truncationMode(kind == .link ? .middle : .tail)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 8)
        }
    }
}

final class NotchPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    var onCancel: () -> Void = {}
    override func cancelOperation(_ sender: Any?) { onCancel() }
}

final class App: NSObject, NSApplicationDelegate, NSWindowDelegate {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    let pasteboard = NSPasteboard.general
    lazy var lastChange = pasteboard.changeCount
    let store = Store(file: storeFile)
    lazy var model = PanelModel(store: store)
    let panel = NotchPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true)
    var hotKey: EventHotKeyRef?
    var servicePick: Clip??

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.servicesProvider = self
        NSUpdateDynamicServices()
        panel.onCancel = { [weak self] in self?.hidePanel() }
        item.button?.image = NSImage(systemSymbolName: "doc.on.clipboard", accessibilityDescription: "Clipboard history")
        item.button?.target = self
        item.button?.action = #selector(showPanel)
        item.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])

        panel.isFloatingPanel = true
        panel.level = .popUpMenu
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.delegate = self

        // ponytail: NSPasteboard has no change notification, so poll changeCount
        let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in self?.poll() }
        RunLoop.main.add(timer, forMode: .common)
        registerHotKey()
        if CommandLine.arguments.contains("--show") { showPanel() }
        if CommandLine.arguments.contains("--confirm-clear") { model.confirmingClear = true }
        // ponytail: ←/→ always move between cards, so the caret in the search box can't be moved with arrows
        NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, self.panel.isKeyWindow else { return event }
            if self.model.confirmingClear {
                if event.keyCode == UInt16(kVK_Escape) {
                    self.model.confirmingClear = false
                    return nil
                }
                return event
            }
            let visible = self.model.visible
            let selected = visible.indices.contains(self.model.selection) ? visible[self.model.selection] : nil
            switch event.keyCode {
            case UInt16(kVK_RightArrow), UInt16(kVK_DownArrow): self.model.move(1)
            case UInt16(kVK_LeftArrow), UInt16(kVK_UpArrow): self.model.move(-1)
            case UInt16(kVK_Tab): self.model.cycleKind()
            case UInt16(kVK_Return), UInt16(kVK_ANSI_KeypadEnter):
                if let selected { self.pick(selected) }
            case UInt16(kVK_Delete) where event.modifierFlags.contains(.command):
                if let selected {
                    self.store.delete(selected)
                    self.model.move(0)
                }
            case UInt16(kVK_Escape): self.hidePanel()
            default: return event
            }
            return nil
        }
    }

    func poll() {
        guard pasteboard.changeCount != lastChange else { return }
        lastChange = pasteboard.changeCount
        let types = pasteboard.types ?? []
        if !skipTypes.isDisjoint(with: types) { return }
        if let text = pasteboard.string(forType: .string) {
            if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { store.add(text) }
            return
        }
        if types.contains(.fileURL) { return }
        if let png = pasteboard.data(forType: .png) {
            if png.count <= maxImageBytes { store.addImage(png) }
        } else if let tiff = pasteboard.data(forType: .tiff) {
            // Re-encoding a big screenshot to PNG can take a few hundred ms, so it runs off the main thread.
            DispatchQueue.global(qos: .utility).async { [store] in
                guard let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]),
                      png.count <= maxImageBytes else { return }
                DispatchQueue.main.async { store.addImage(png) }
            }
        }
    }

    func registerHotKey() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, _, context in
            Unmanaged<App>.fromOpaque(context!).takeUnretainedValue().showPanel()
            return noErr
        }, 1, &spec, Unmanaged.passUnretained(self).toOpaque(), nil)
        RegisterEventHotKey(UInt32(kVK_ANSI_V), UInt32(cmdKey | shiftKey),
                            EventHotKeyID(signature: OSType(0x434C4950), id: 1),
                            GetApplicationEventTarget(), 0, &hotKey)
    }

    @objc func showPanel() {
        let mouse = NSEvent.mouseLocation
        guard let screen = NSScreen.screens.first(where: { NSMouseInRect(mouse, $0.frame, false) }) ?? NSScreen.main else { return }
        store.prune()
        model.query = ""
        model.kind = nil
        model.confirmingClear = false
        panel.contentView = NSHostingView(rootView: HistoryView(model: model, store: store) { [weak self] in
            self?.pick($0)
        })
        let size = NSSize(width: 520, height: 160)
        let frame = NSRect(x: screen.frame.midX - size.width / 2, y: screen.visibleFrame.maxY - size.height - 8,
                           width: size.width, height: size.height)
        panel.setFrame(frame.offsetBy(dx: 0, dy: 12), display: false)
        panel.alphaValue = 0
        panel.makeKeyAndOrderFront(nil)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.2
            panel.animator().setFrame(frame, display: true)
            panel.animator().alphaValue = 1
        }
    }

    func write(_ clip: Clip, to board: NSPasteboard) {
        board.clearContents()
        if let name = clip.image, let image = NSImage(contentsOf: store.imagesDir.appendingPathComponent(name)) {
            board.writeObjects([image])
        } else {
            board.setString(clip.text, forType: .string)
        }
    }

    func pick(_ clip: Clip) {
        if servicePick != nil {
            servicePick = .some(clip)
        } else {
            write(clip, to: pasteboard)
            lastChange = pasteboard.changeCount
        }
        hidePanel()
    }

    func hidePanel() {
        panel.orderOut(nil)
        if servicePick != nil { NSApp.stopModal() }
    }

    func windowDidResignKey(_ notification: Notification) {
        hidePanel()
    }

    // Services menu → "Paste from ClipHistory": the calling app waits while the picker is open,
    // then inserts whatever comes back on the service pasteboard.
    @objc func pasteFromHistory(_ board: NSPasteboard, userData: String?, error: AutoreleasingUnsafeMutablePointer<NSString?>) {
        guard servicePick == nil else { return }
        servicePick = .some(nil)
        showPanel()
        NSApp.runModal(for: panel)
        let chosen = servicePick ?? nil
        servicePick = nil
        guard let chosen else {
            error.pointee = "Cancelled"
            return
        }
        write(chosen, to: board)
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme == "cliphistory" && url.host() == "copy" {
            if let clip = store.items.first(where: { $0.key == url.lastPathComponent }) { pick(clip) }
        }
    }
}

if CommandLine.arguments.contains("--selftest") {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let file = dir.appendingPathComponent("history.json")
    try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try! JSONEncoder().encode(["old"]).write(to: file)
    let summary = { (store: Store) in store.items.map { $0.id + ($0.pinned ? "*" : "") } }
    let store = Store(file: file)
    precondition(summary(store) == ["old"] && store.items[0].date != nil, "old [String] format loads with a date")
    store.togglePin(store.items[0])
    for index in 0..<55 { store.add("x\(index)") }
    precondition(store.items.filter { !$0.pinned }.count == limit, "unpinned capped at limit")
    precondition(summary(store).contains("old*"), "pin survives the limit")
    store.add("x50")
    precondition(store.items.first { !$0.pinned }?.text == "x50", "re-copy moves to top")
    store.add("old")
    precondition(summary(store).filter { $0.hasPrefix("old") } == ["old*"], "re-copy keeps pin")
    store.delete(store.items.first { $0.text == "x50" }!)
    precondition(!summary(store).contains("x50"), "delete removes one item")
    store.clear()
    precondition(summary(store) == ["old*"], "clear keeps pins")
    precondition(summary(Store(file: file)) == summary(store), "saved and reloaded")

    let pixel = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1, pixelsHigh: 1, bitsPerSample: 8,
                                 samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                 colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        .representation(using: .png, properties: [:])!
    store.addImage(pixel)
    store.addImage(pixel)
    let image = store.items.first { $0.image != nil }!
    precondition(store.items.filter { $0.image != nil }.count == 1, "same image is stored once")
    precondition(FileManager.default.fileExists(atPath: store.imagesDir.appendingPathComponent(image.image!).path), "image file written")
    store.delete(image)
    precondition(!FileManager.default.fileExists(atPath: store.imagesDir.appendingPathComponent(image.image!).path), "deleting removes the file")

    let kinds: [(String, Kind)] = [
        ("#FFFFFF", .color), ("#0000c7", .color), ("rgb(1, 2, 3)", .color),
        ("https://meet.google.com/abc", .link), ("meet.google.com", .link), ("www.apple.com", .link),
        ("func a() { return 1 }", .code), ("git status", .code), ("const x = 1;", .code),
        ("Introducing Pulse 1.0", .text), ("hello", .text),
    ]
    for (text, expected) in kinds {
        precondition(Kind.of(Clip(text: text)) == expected, "\(text) should be \(expected)")
    }
    precondition(Kind.of(image) == .image, "image clip is an image")
    precondition(linkDisplay("https://www.meet.google.com/?x=1") == "meet.google.com", "link shows host")

    let month = Date().addingTimeInterval(-30 * 24 * 60 * 60)
    try! JSONEncoder().encode([
        Clip(text: "fresh"),
        Clip(text: "stale", date: month),
        Clip(text: "stale pin", pinned: true, date: month),
    ]).write(to: file)
    precondition(summary(Store(file: file)) == ["fresh", "stale pin*"], "items older than maxAge expire, pins stay")
    try? FileManager.default.removeItem(at: dir)
    print("selftest ok")
    exit(0)
}

let lock = open(NSTemporaryDirectory() + "ClipHistory.lock", O_CREAT | O_RDWR, 0o600)
if flock(lock, LOCK_EX | LOCK_NB) != 0 {
    print("ClipHistory is already running")
    exit(0)
}

if !FileManager.default.fileExists(atPath: storeFile.path),
   FileManager.default.fileExists(atPath: legacyDir.appendingPathComponent("history.json").path) {
    try? FileManager.default.createDirectory(at: sharedDir, withIntermediateDirectories: true)
    for name in ["history.json", "images"] {
        try? FileManager.default.moveItem(at: legacyDir.appendingPathComponent(name), to: sharedDir.appendingPathComponent(name))
    }
    try? FileManager.default.removeItem(at: legacyDir)
}

let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
