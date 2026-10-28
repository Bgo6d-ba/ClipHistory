import AppKit
import CryptoKit

// Run with: ClipHistory.app/Contents/MacOS/ClipHistory --selftest
// Works in a temporary folder with a throwaway key; never touches the real history or the Keychain.
func selfTest() {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    let key = SymmetricKey(size: .bits256)
    let week: TimeInterval = 7 * 24 * 60 * 60
    let summary = { (store: Store) in store.items.map { $0.id + ($0.pinned ? "*" : "") } }
    let fileText = { (url: URL) in String(decoding: (try? Data(contentsOf: url)) ?? Data(), as: UTF8.self) }

    // History, pins, limit
    try! JSONEncoder().encode(["old secret note"]).write(to: dir.appendingPathComponent("history.json"))
    let store = Store(dir: dir, key: key, maxAge: week)
    precondition(summary(store) == ["old secret note"] && store.items[0].date != nil, "1.0 plaintext history loads")
    precondition(!FileManager.default.fileExists(atPath: store.legacyFile.path), "plaintext history.json is removed")
    precondition(!fileText(store.file).contains("old secret note"), "history.dat is encrypted")
    store.togglePin(store.items[0])
    for index in 0..<55 { store.add("x\(index)") }
    precondition(store.items.filter { !$0.pinned }.count == limit, "unpinned capped at limit")
    precondition(summary(store).contains("old secret note*"), "pin survives the limit")
    store.add("x50")
    precondition(store.items.first { !$0.pinned }?.text == "x50", "re-copy moves to top")
    store.add("old secret note")
    precondition(summary(store).filter { $0.hasPrefix("old") } == ["old secret note*"], "re-copy keeps pin")
    store.delete(store.items.first { $0.text == "x50" }!)
    precondition(!summary(store).contains("x50"), "delete removes one item")
    store.clear()
    precondition(summary(store) == ["old secret note*"], "clear keeps pins")
    precondition(summary(Store(dir: dir, key: key, maxAge: week)) == summary(store), "saved and reloaded")
    precondition(Store(dir: dir, key: SymmetricKey(size: .bits256), maxAge: week).items.isEmpty, "a wrong key reads nothing")
    precondition(Store(dir: dir.appendingPathComponent("nokey"), key: nil, maxAge: week).items.isEmpty, "no key, nothing loaded")

    // Images are encrypted on disk and named by a keyed hash
    let pixel = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1, pixelsHigh: 1, bitsPerSample: 8,
                                 samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                 colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        .representation(using: .png, properties: [:])!
    store.addImage(pixel)
    store.addImage(pixel)
    let image = store.items.first { $0.image != nil }!
    let imageFile = store.imagesDir.appendingPathComponent(image.image!)
    precondition(store.items.filter { $0.image != nil }.count == 1, "same image is stored once")
    precondition(!(try! Data(contentsOf: imageFile)).starts(with: [0x89, 0x50, 0x4E, 0x47]), "image file is encrypted")
    precondition(store.imageData(image.image!) == pixel, "image decrypts to the original")
    let unkeyedName = SHA256.hash(data: pixel).prefix(8).map { String(format: "%02x", $0) }.joined()
    precondition(!image.image!.hasPrefix(unkeyedName), "image name is not a plain hash of the picture")
    store.delete(image)
    precondition(!FileManager.default.fileExists(atPath: imageFile.path), "deleting removes the file")

    var legacy = Store(dir: dir, key: key, maxAge: week)
    legacy.items.insert(Clip(text: "", image: "legacy.png"), at: 0)
    legacy.save()
    try! pixel.write(to: store.imagesDir.appendingPathComponent("legacy.png"))
    legacy = Store(dir: dir, key: key, maxAge: week)
    precondition(!(try! Data(contentsOf: store.imagesDir.appendingPathComponent("legacy.png"))).starts(with: [0x89, 0x50]),
                 "1.0 plaintext images are encrypted on launch")
    precondition(legacy.imageData("legacy.png") == pixel, "migrated image still opens")
    legacy.delete(legacy.items[0])

    // Widget snapshot holds only what the widget shows
    let widgetFile = dir.appendingPathComponent("widget.json")
    let widgetStore = Store(dir: dir, key: key, maxAge: week, widgetFile: widgetFile)
    let long = "Long note " + String(repeating: "z", count: 500)
    for index in 0..<12 { widgetStore.add("item \(index)") }
    widgetStore.add(long)
    let snapshot = try! JSONDecoder().decode([WidgetItem].self, from: Data(contentsOf: widgetFile))
    precondition(snapshot.count == widgetLimit, "widget gets only \(widgetLimit) items")
    precondition(snapshot.allSatisfy { $0.title.count <= 80 }, "widget titles are shortened")
    precondition(!fileText(widgetFile).contains("item 0"), "older items stay out of the widget file")

    // Deep links need the keyed token and an exact shape
    let target = widgetStore.items.first { $0.text == "item 11" }!
    let token = widgetStore.token(for: target)!
    precondition(token.count == 12, "token is 12 hex characters")
    precondition(widgetStore.clip(forDeepLink: URL(string: "cliphistory://copy/\(token)")!) == target, "valid link resolves")
    let unkeyedToken = SHA256.hash(data: Data(target.id.utf8)).prefix(6).map { String(format: "%02x", $0) }.joined()
    for bad in ["cliphistory://copy/\(unkeyedToken)", "cliphistory://copy/\(token)?x=1", "cliphistory://copy/\(token)/extra",
                "cliphistory://paste/\(token)", "other://copy/\(token)", "cliphistory://copy/\(token.uppercased())",
                "cliphistory://copy/", "cliphistory://copy/../../etc", "cliphistory://copy/%00%00%00%00%00%00"] {
        precondition(URL(string: bad).flatMap(widgetStore.clip(forDeepLink:)) == nil, "rejects \(bad)")
    }

    // Secret detection. Sample tokens are assembled at run time so secret scanners don't flag this file.
    let secrets = [
        "ghp_" + String(repeating: "a", count: 36), "AKIA" + String(repeating: "Q", count: 16), "sk-ant-" + String(repeating: "x", count: 30),
        "sk_live_" + String(repeating: "9", count: 24), "xoxb-123456789012-abc", "AIza" + String(repeating: "B", count: 35),
        "-----BEGIN OPENSSH PRIVATE KEY-----\nabc", ["eyJ", "eyJ", ""].map { $0 + String(repeating: "x", count: 12) }.joined(separator: "."),
        "4242 4242 4242 4242", "4111-1111-1111-1111",
    ]
    for text in secrets { precondition(Secrets.looksSecret(text), "\(text.prefix(12))… is treated as a secret") }
    for text in ["hello", "891316", "88001122", "1234 5678 9012 3456", "https://github.com", "Date-v2", "sk-short"] {
        precondition(!Secrets.looksSecret(text), "\(text) is not a secret")
    }

    // Categories
    let kinds: [(String, Kind)] = [
        ("#FFFFFF", .color), ("#0000c7", .color), ("rgb(1, 2, 3)", .color),
        ("https://meet.google.com/abc", .link), ("meet.google.com", .link), ("www.apple.com", .link),
        ("func a() { return 1 }", .code), ("git status", .code), ("const x = 1;", .code),
        ("Introducing Pulse 1.0", .text), ("hello", .text),
    ]
    for (text, expected) in kinds {
        precondition(Kind.of(Clip(text: text)) == expected, "\(text) should be \(expected)")
    }
    precondition(Kind.of(Clip(text: "", image: "x.img")) == .image, "image clip is an image")
    precondition(linkDisplay("https://www.meet.google.com/?x=1") == "meet.google.com", "link shows host")

    // Retention
    let month = Date().addingTimeInterval(-30 * 24 * 60 * 60)
    let aged = Store(dir: dir.appendingPathComponent("aged"), key: key, maxAge: nil)
    aged.items = [Clip(text: "fresh"), Clip(text: "stale", date: month), Clip(text: "stale pin", pinned: true, date: month)]
    aged.save()
    precondition(summary(Store(dir: aged.dir, key: key, maxAge: nil)).count == 3, "Forever keeps everything")
    precondition(summary(Store(dir: aged.dir, key: key, maxAge: week)) == ["fresh", "stale pin*"], "old items expire, pins stay")
    precondition(Retention.day.maxAge == 86400 && Retention.forever.maxAge == nil, "retention lengths")

    print("selftest ok")
}
