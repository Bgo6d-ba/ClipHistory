import CryptoKit
import Foundation
import ImageIO
import SwiftUI

// build.sh writes the App Group into Info.plist when it signs with a team. The widget reads history from that
// shared container; unsigned builds have no group and keep history in Application Support instead.
let groupID = Bundle.main.object(forInfoDictionaryKey: "ClipHistoryAppGroup") as? String
let sharedDir = groupID.flatMap { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) }
    ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("ClipHistory")

struct Clip: Codable, Equatable, Identifiable {
    var text: String
    var pinned = false
    var date: Date? = Date()
    var image: String?
    var id: String { image ?? text }
    var key: String { SHA256.hash(data: Data(id.utf8)).prefix(6).map { String(format: "%02x", $0) }.joined() }
}

enum Kind: CaseIterable {
    case link, color, image, code, text

    var title: String { ["Links", "Colors", "Images", "Code", "Text"][Kind.allCases.firstIndex(of: self)!] }
    var label: String { ["LINK", "COLOR", "IMAGE", "CODE", "TEXT"][Kind.allCases.firstIndex(of: self)!] }
    var icon: String { ["link", "paintpalette", "photo", "chevron.left.forwardslash.chevron.right", "text.alignleft"][Kind.allCases.firstIndex(of: self)!] }
    var tint: Color {
        switch self {
        case .link: Color(red: 0.25, green: 0.6, blue: 1)
        case .color: Color(red: 1, green: 0.27, blue: 0.4)
        case .image: Color(red: 0.95, green: 0.3, blue: 0.85)
        case .code: Color(red: 1, green: 0.62, blue: 0.2)
        case .text: Color(red: 0.2, green: 0.85, blue: 0.9)
        }
    }

    // ponytail: pattern heuristics; a "file.txt" can read as a link and short code as text
    // Every redraw asks for every card's kind, so results are cached by text and the patterns compiled once.
    private static var cache: [String: Kind] = [:]
    private static let colorPattern = try! NSRegularExpression(
        pattern: #"^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(rgba?|hsla?)\([^)]*\))$"#)
    private static let linkPattern = try! NSRegularExpression(
        pattern: #"^(https?://\S+|www\.\S+|[\w-]+(\.[\w-]+)*\.[a-zA-Z]{2,}(/\S*)?)$"#)
    private static let shellPattern = try! NSRegularExpression(
        pattern: #"^(sudo|npm|npx|pnpm|yarn|git|cd|brew|curl|ls|docker|kubectl|python3?|swift|ssh) "#)
    private static let codeHints = ["{", "}", ";", "=>", "->", "</", "/>", "()", "func ", "def ", "const ", "let ",
                                    "var ", "import ", "return ", "#include", "class ", "$ "]

    static func of(_ clip: Clip) -> Kind {
        if clip.image != nil { return .image }
        if let kind = cache[clip.text] { return kind }
        let kind = classify(clip.text)
        if cache.count > 1000 { cache.removeAll() }
        cache[clip.text] = kind
        return kind
    }

    private static func classify(_ raw: String) -> Kind {
        // ponytail: only the first 4000 characters are inspected; a huge paste is judged by its start
        let text = String(raw.prefix(4000)).trimmingCharacters(in: .whitespacesAndNewlines)
        let matches = { (pattern: NSRegularExpression) in
            pattern.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
        }
        if text.count <= 64 && matches(colorPattern) { return .color }
        if !text.contains(where: \.isWhitespace) && matches(linkPattern) { return .link }
        if codeHints.filter(text.contains).count >= 2 || matches(shellPattern) { return .code }
        return .text
    }
}

func shortAgo(_ date: Date?) -> String {
    let seconds = Int(Date().timeIntervalSince(date ?? Date()))
    switch seconds {
    case ..<60: return "now"
    case ..<3600: return "\(seconds / 60)m"
    case ..<86400: return "\(seconds / 3600)h"
    default: return "\(seconds / 86400)d"
    }
}

func hexColor(_ text: String) -> (color: Color, light: Bool)? {
    var hex = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard hex.hasPrefix("#") else { return nil }
    hex.removeFirst()
    if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
    guard hex.count == 6 || hex.count == 8, let value = UInt64(hex.prefix(6), radix: 16) else { return nil }
    let red = Double((value >> 16) & 0xFF) / 255
    let green = Double((value >> 8) & 0xFF) / 255
    let blue = Double(value & 0xFF) / 255
    return (Color(red: red, green: green, blue: blue), 0.299 * red + 0.587 * green + 0.114 * blue > 0.6)
}

func linkDisplay(_ text: String) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: trimmed.contains("://") ? trimmed : "https://" + trimmed),
          let host = url.host() else { return trimmed }
    let path = url.path() == "/" ? "" : url.path()
    return host.replacingOccurrences(of: "www.", with: "") + path
}

extension View {
    // ponytail: Liquid Glass on macOS 26+, frosted material before that
    @ViewBuilder
    func glass<S: Shape>(_ shape: S, tint: Color? = nil) -> some View {
        if #available(macOS 26, *) {
            glassEffect(Glass.regular.tint(tint), in: shape)
        } else {
            background(tint.map { AnyShapeStyle($0.opacity(0.35)) } ?? AnyShapeStyle(.ultraThinMaterial), in: shape)
        }
    }
}

private let thumbnails = NSCache<NSString, NSImage>()

// Decodes a small preview with ImageIO instead of the full image, and keeps it for the next redraw.
func thumbnail(_ url: URL, maxPixel: Int) -> NSImage? {
    let key = "\(url.path)@\(maxPixel)" as NSString
    if let cached = thumbnails.object(forKey: key) { return cached }
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
              kCGImageSourceCreateThumbnailFromImageAlways: true,
              kCGImageSourceCreateThumbnailWithTransform: true,
              kCGImageSourceThumbnailMaxPixelSize: maxPixel,
          ] as CFDictionary) else { return nil }
    let result = NSImage(cgImage: image, size: .zero)
    thumbnails.setObject(result, forKey: key)
    return result
}

func oneLine(_ text: String) -> String {
    text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
}
