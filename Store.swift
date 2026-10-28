import AppKit
import CryptoKit
import Security
import WidgetKit

let limit = 50
// ponytail: images over 20 MB are skipped to keep the history folder small
let maxImageBytes = 20_000_000
let widgetLimit = 7
let skipTypes: Set<NSPasteboard.PasteboardType> = [
    .init("org.nspasteboard.ConcealedType"),
    .init("org.nspasteboard.TransientType"),
]

enum Retention: Int, CaseIterable {
    case day = 1, week = 7, month = 30, forever = 0

    static let defaultsKey = "retentionDays"
    static var current: Retention {
        get { Retention(rawValue: UserDefaults.standard.object(forKey: defaultsKey) as? Int ?? 7) ?? .week }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: defaultsKey) }
    }

    var title: String { self == .forever ? "Forever" : self == .day ? "1 Day" : "\(rawValue) Days" }
    var maxAge: TimeInterval? { self == .forever ? nil : TimeInterval(rawValue) * 24 * 60 * 60 }
}

// The key that encrypts history.dat and the images is kept in the login Keychain. macOS lets ClipHistory read it
// without asking; any other program has to ask the user first.
enum Vault {
    private static let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "ClipHistory",
        kSecAttrAccount as String: "history-encryption-key",
    ]

    static func loadOrCreateKey() -> SymmetricKey? {
        var lookup = query
        lookup[kSecReturnData as String] = true
        var found: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &found)
        if status == errSecSuccess, let data = found as? Data, data.count == 32 { return SymmetricKey(data: data) }
        // Only create a key when there is none. If reading failed for another reason (the user said no, the
        // Keychain is locked), adding fails as a duplicate and history simply stays in memory this session.
        guard status == errSecItemNotFound else { return nil }
        let key = SymmetricKey(size: .bits256)
        var add = query
        add[kSecValueData as String] = key.withUnsafeBytes { Data($0) }
        add[kSecAttrLabel as String] = "ClipHistory encryption key"
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess ? key : nil
    }
}

// Copies that look like credentials are never stored, on top of what password managers already mark as concealed.
// ponytail: known token formats, private keys and card numbers only; a plain-text password copied from a document
// still gets through, which is why the README says so and the "ignored apps" list exists
enum Secrets {
    static let ignoredApps: Set<String> = [
        "com.apple.Passwords", "com.apple.keychainaccess", "com.1password.1password", "com.agilebits.onepassword7",
        "com.bitwarden.desktop", "com.lastpass.LastPass", "com.dashlane.Dashlane", "org.keepassxc.keepassxc",
        "in.sinew.Enpass-Desktop", "com.nordpass.macos.NordPass", "me.proton.pass.electron",
    ]

    private static let patterns = [
        #"-----BEGIN [A-Z ]*PRIVATE KEY-----"#,
        #"\bAKIA[0-9A-Z]{16}\b"#,
        #"\bgh[pousr]_[A-Za-z0-9]{36,}"#,
        #"\bgithub_pat_[A-Za-z0-9_]{40,}"#,
        #"\bglpat-[A-Za-z0-9_-]{20,}"#,
        #"\bxox[abprs]-[A-Za-z0-9-]{10,}"#,
        #"\b[rs]k_(live|test)_[A-Za-z0-9]{16,}"#,
        #"\bsk-(ant-|proj-)?[A-Za-z0-9_-]{20,}"#,
        #"\bAIza[0-9A-Za-z_-]{35}\b"#,
        #"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"#,
    ].map { try! NSRegularExpression(pattern: $0) }

    static func looksSecret(_ raw: String) -> Bool {
        let text = String(raw.prefix(20_000))
        let range = NSRange(text.startIndex..., in: text)
        return patterns.contains { $0.firstMatch(in: text, range: range) != nil } || isCardNumber(text)
    }

    static func isCardNumber(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.allSatisfy({ $0.isNumber || $0 == " " || $0 == "-" }) else { return false }
        let digits = trimmed.compactMap(\.wholeNumberValue)
        guard (13...19).contains(digits.count) else { return false }
        let sum = digits.reversed().enumerated().reduce(0) { total, pair in
            let doubled = pair.element * 2
            return total + (pair.offset % 2 == 1 ? (doubled > 9 ? doubled - 9 : doubled) : pair.element)
        }
        return sum % 10 == 0
    }
}

final class Store: ObservableObject {
    @Published var items: [Clip] = []
    let dir: URL
    let key: SymmetricKey?
    var maxAge: TimeInterval?
    let widgetFile: URL?
    private var previews: [String: NSImage] = [:]

    var file: URL { dir.appendingPathComponent("history.dat") }
    var legacyFile: URL { dir.appendingPathComponent("history.json") }
    var imagesDir: URL { dir.appendingPathComponent("images") }

    // key nil means the Keychain could not be used: history then lives in memory only and nothing is written.
    init(dir: URL, key: SymmetricKey?, maxAge: TimeInterval?, widgetFile: URL? = nil) {
        self.dir = dir
        self.key = key
        self.maxAge = maxAge
        self.widgetFile = widgetFile
        guard let key else { return }

        if let sealed = try? Data(contentsOf: file),
           let plain = try? AES.GCM.open(AES.GCM.SealedBox(combined: sealed), using: key) {
            items = (try? JSONDecoder().decode([Clip].self, from: plain)) ?? []
        } else if let plain = try? Data(contentsOf: legacyFile) {
            items = (try? JSONDecoder().decode([Clip].self, from: plain))
                ?? (try? JSONDecoder().decode([String].self, from: plain))?.map { Clip(text: $0) }
                ?? []
        }
        for index in items.indices where items[index].date == nil {
            items[index].date = Date()
        }
        encryptPlaintextImages()
        prune()
        save()
    }

    // Versions before 1.2 stored history.json and images unencrypted; they are encrypted in place on first launch.
    private func encryptPlaintextImages() {
        guard let key else { return }
        for name in (try? FileManager.default.contentsOfDirectory(atPath: imagesDir.path)) ?? [] {
            let url = imagesDir.appendingPathComponent(name)
            guard let data = try? Data(contentsOf: url), data.starts(with: [0x89, 0x50, 0x4E, 0x47]),
                  let sealed = try? AES.GCM.seal(data, using: key).combined else { continue }
            try? sealed.write(to: url, options: .atomic)
        }
    }

    func prune() {
        guard let maxAge else { return }
        let cutoff = Date().addingTimeInterval(-maxAge)
        let before = items.count
        items.removeAll { !$0.pinned && ($0.date ?? .distantFuture) < cutoff }
        if items.count != before { save() }
    }

    func add(_ text: String) {
        insert(Clip(text: text))
    }

    func addImage(_ png: Data) {
        guard let key, let sealed = try? AES.GCM.seal(png, using: key).combined else { return }
        // Named by a keyed hash, so the file name can't be matched against a known picture.
        let name = String(mac(png, key).prefix(16)) + ".img"
        let url = imagesDir.appendingPathComponent(name)
        if !FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.createDirectory(at: imagesDir, withIntermediateDirectories: true)
            try? sealed.write(to: url, options: .atomic)
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

    func imageData(_ name: String) -> Data? {
        guard let key, let sealed = try? Data(contentsOf: imagesDir.appendingPathComponent(name)) else { return nil }
        return try? AES.GCM.open(AES.GCM.SealedBox(combined: sealed), using: key)
    }

    // Decrypting and decoding happen once per image; redraws reuse the preview.
    func preview(_ name: String) -> NSImage? {
        if let cached = previews[name] { return cached }
        guard let data = imageData(name), let image = thumbnail(data, maxPixel: 200) else { return nil }
        let preview = NSImage(cgImage: image, size: .zero)
        previews[name] = preview
        return preview
    }

    // Widget clicks arrive as cliphistory://copy/<token>. The token is keyed with the encryption key, so another
    // app or a web page can't build a link for an item it merely guesses is in the history.
    func token(for clip: Clip) -> String? {
        key.map { String(mac(Data(clip.id.utf8), $0).prefix(12)) }
    }

    func clip(forDeepLink url: URL) -> Clip? {
        let parts = url.pathComponents
        guard url.scheme == "cliphistory", url.host() == "copy", url.query == nil, url.fragment == nil,
              parts.count == 2, parts[0] == "/",
              parts[1].count == 12, parts[1].allSatisfy({ $0.isHexDigit && !$0.isUppercase }) else { return nil }
        return items.first { token(for: $0) == parts[1] }
    }

    func save() {
        guard let key,
              let plain = try? JSONEncoder().encode(items),
              let sealed = try? AES.GCM.seal(plain, using: key).combined else { return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? sealed.write(to: file, options: .atomic)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        try? FileManager.default.removeItem(at: legacyFile)
        let keep = Set(items.compactMap(\.image))
        for name in (try? FileManager.default.contentsOfDirectory(atPath: imagesDir.path)) ?? [] where !keep.contains(name) {
            try? FileManager.default.removeItem(at: imagesDir.appendingPathComponent(name))
            previews[name] = nil
        }
        writeWidgetSnapshot()
    }

    private func writeWidgetSnapshot() {
        guard let widgetFile else { return }
        let shown = Array((items.filter(\.pinned) + items.filter { !$0.pinned }).prefix(widgetLimit))
        let snapshot: [WidgetItem] = shown.compactMap { clip in
            guard let token = token(for: clip) else { return nil }
            let kind = Kind.of(clip)
            let text = clip.text.trimmingCharacters(in: .whitespacesAndNewlines)
            let title = kind == .image ? "Image" : kind == .link ? linkDisplay(text) : kind == .color ? text.uppercased() : oneLine(text)
            let small = clip.image.flatMap(imageData).flatMap { thumbnail($0, maxPixel: 96) }
                .flatMap { NSBitmapImageRep(cgImage: $0).representation(using: .png, properties: [:]) }
            return WidgetItem(title: String(title.prefix(80)), kind: kind, pinned: clip.pinned, date: clip.date,
                              token: token, swatch: kind == .color ? text : nil, thumbnail: small)
        }
        if let data = try? JSONEncoder().encode(snapshot) {
            try? data.write(to: widgetFile, options: .atomic)
            try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: widgetFile.path)
        }
        WidgetCenter.shared.reloadAllTimelines()
    }
}

private func mac(_ data: Data, _ key: SymmetricKey) -> String {
    HMAC<SHA256>.authenticationCode(for: data, using: key).map { String(format: "%02x", $0) }.joined()
}
