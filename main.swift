import AppKit
import Carbon
import CryptoKit
import ServiceManagement
import SwiftUI
import WidgetKit

final class PanelModel: ObservableObject {
    let store: Store
    @Published var query = "" { didSet { if query != oldValue { selection = 0 } } }
    @Published var kind: Kind? { didSet { if kind != oldValue { selection = 0 } } }
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
                    Picker("Keep History", selection: Binding(
                        get: { Retention.current },
                        set: { retention in
                            Retention.current = retention
                            store.maxAge = retention.maxAge
                            store.prune()
                        }
                    )) {
                        ForEach(Retention.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
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
                                .onHover { if $0 && demo == nil && model.selection != index { model.selection = index } }
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
            if let name = clip.image, let image = store.preview(name) {
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
                    // a link is one long word: keep it on one line, shrink a little, then truncate in the middle
                    .lineLimit(kind == .link ? 1 : 2)
                    .minimumScaleFactor(kind == .link ? 0.75 : 1)
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
    let store = demo?.store ?? Store(dir: sharedDir, key: Vault.loadOrCreateKey(), maxAge: Retention.current.maxAge,
                                     widgetFile: groupID == nil ? nil : sharedDir.appendingPathComponent("widget.json"))
    lazy var model = PanelModel(store: store)
    let panel = NotchPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true)
    var hotKey: EventHotKeyRef?
    var servicePick: Clip??
    var demoBackdrop: NSWindow?

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

        if let demo {
            demo.apply(to: self)
            return
        }
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
        // ponytail: the app in front when the change is noticed (up to 0.5 s later) is taken as the source
        if let source = NSWorkspace.shared.frontmostApplication?.bundleIdentifier, Secrets.ignoredApps.contains(source) { return }
        if let text = pasteboard.string(forType: .string) {
            if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !Secrets.looksSecret(text) { store.add(text) }
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
        let scale = demo?.scale ?? 1
        panel.contentView = NSHostingView(rootView: HistoryView(model: model, store: store) { [weak self] in
            self?.pick($0)
        }
        .frame(width: 520, height: 160)
        .scaleEffect(scale, anchor: .topLeading)
        .frame(width: 520 * scale, height: 160 * scale, alignment: .topLeading))
        let size = NSSize(width: 520 * scale, height: 160 * scale)
        let top = demo == nil ? screen.visibleFrame.maxY - size.height - 8 : screen.frame.midY - size.height / 2
        let frame = NSRect(x: screen.frame.midX - size.width / 2, y: top, width: size.width, height: size.height)
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
        if let name = clip.image, let image = store.imageData(name).flatMap(NSImage.init(data:)) {
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
        for url in urls {
            if let clip = store.clip(forDeepLink: url) { pick(clip) }
        }
    }
}

if CommandLine.arguments.contains("--selftest") {
    selfTest()
    exit(0)
}

let lock = open(NSTemporaryDirectory() + "ClipHistory.lock", O_CREAT | O_RDWR, 0o600)
if demo == nil && flock(lock, LOCK_EX | LOCK_NB) != 0 {
    print("ClipHistory is already running")
    exit(0)
}

// Version 1.0 kept history in Application Support; signed builds now keep it in the App Group container.
let legacyDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("ClipHistory")
let exists = { (url: URL, name: String) in FileManager.default.fileExists(atPath: url.appendingPathComponent(name).path) }
if legacyDir.standardizedFileURL != sharedDir.standardizedFileURL,
   !exists(sharedDir, "history.dat"), !exists(sharedDir, "history.json"), exists(legacyDir, "history.json") {
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
