import AppKit
import CryptoKit

// Marketing captures of the real popup:
//   ClipHistory --demo [--demo-scale 2.5] [--demo-kind color] [--demo-query fig] [--demo-select 2] [--demo-pin 0]
//               [--demo-backdrop wallpaper.png]
// Runs on a throwaway folder and key filled with sample history. The real history, Keychain item, widget, hotkey and
// clipboard polling are all left alone, and it can run next to the normal copy of the app.
struct Demo {
    let scale: CGFloat
    let kind: Kind?
    let query: String
    let selection: Int
    let pin: Int?
    let backdrop: String?
    let store: Store

    static func fromArguments() -> Demo? {
        let args = CommandLine.arguments
        guard args.contains("--demo") else { return nil }
        let value = { (name: String) in args.firstIndex(of: name).flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil } }
        return Demo(
            scale: CGFloat(Double(value("--demo-scale") ?? "") ?? 1),
            kind: value("--demo-kind").flatMap(Kind.init(rawValue:)),
            query: value("--demo-query") ?? "",
            selection: Int(value("--demo-select") ?? "") ?? 0,
            pin: value("--demo-pin").flatMap { Int($0) },
            backdrop: value("--demo-backdrop"),
            store: sampleStore()
        )
    }

    static func sampleStore() -> Store {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("cliphistory-demo-\(UUID().uuidString)")
        let store = Store(dir: dir, key: SymmetricKey(size: .bits256), maxAge: nil)
        // newest first; nil is the sample photo
        let samples: [(String?, TimeInterval)] = [
            ("figma.com", 20), ("#5B4BFF", 120), ("git push origin main", 300), ("Launch on Friday 🚀", 540),
            (nil, 840), ("github.com", 1860), ("#FF4566", 3600), ("Ship the release notes", 7200),
            ("npm run build", 10800), ("meet.google.com", 14400), ("Dinner at 7pm", 18000), ("#33D9E6", 21600),
        ]
        for (text, ago) in samples.reversed() {
            if let text {
                store.insert(Clip(text: text, date: Date() - ago))
            } else if let png = samplePhoto() {
                store.addImage(png)
                store.items[0].date = Date() - ago
            }
        }
        return store
    }

    // A sunset-over-mountains picture for the image card, drawn so the demo needs no bundled photo.
    static func samplePhoto() -> Data? {
        let w = 1200, h = 800
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        let gradient = { (colors: [CGColor]) in CGGradient(colorsSpace: space, colors: colors as CFArray, locations: nil)! }
        let rgb = { (r: CGFloat, g: CGFloat, b: CGFloat) in CGColor(srgbRed: r, green: g, blue: b, alpha: 1) }
        ctx.drawLinearGradient(gradient([rgb(1.0, 0.62, 0.42), rgb(0.93, 0.36, 0.52), rgb(0.36, 0.25, 0.70), rgb(0.12, 0.13, 0.36)]),
                               start: CGPoint(x: 0, y: 260), end: CGPoint(x: 0, y: CGFloat(h)), options: [.drawsAfterEndLocation, .drawsBeforeStartLocation])
        ctx.drawRadialGradient(gradient([CGColor(srgbRed: 1, green: 0.92, blue: 0.7, alpha: 1), CGColor(srgbRed: 1, green: 0.7, blue: 0.5, alpha: 0)]),
                               startCenter: CGPoint(x: 760, y: 360), startRadius: 0, endCenter: CGPoint(x: 760, y: 360), endRadius: 260, options: [])
        let ridges: [([CGFloat], CGColor)] = [
            ([0, 420, 180, 520, 360, 470, 560, 560, 760, 430, 980, 540, 1200, 470], rgb(0.42, 0.24, 0.52)),
            ([0, 330, 240, 430, 470, 350, 700, 450, 900, 360, 1200, 420], rgb(0.27, 0.16, 0.42)),
            ([0, 230, 300, 310, 600, 220, 880, 300, 1200, 240], rgb(0.14, 0.10, 0.28)),
        ]
        for (points, color) in ridges {
            ctx.beginPath(); ctx.move(to: CGPoint(x: 0, y: 0))
            for i in stride(from: 0, to: points.count, by: 2) { ctx.addLine(to: CGPoint(x: points[i], y: points[i + 1])) }
            ctx.addLine(to: CGPoint(x: CGFloat(w), y: 0)); ctx.closePath(); ctx.setFillColor(color); ctx.fillPath()
        }
        guard let image = ctx.makeImage() else { return nil }
        return NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
    }

    func apply(to app: App) {
        if let backdrop, let image = NSImage(contentsOfFile: backdrop), let screen = NSScreen.main {
            let window = NSWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
            window.level = NSWindow.Level(rawValue: NSWindow.Level.popUpMenu.rawValue - 1)
            let view = NSImageView(image: image)
            view.imageScaling = .scaleAxesIndependently
            window.contentView = view
            window.orderFrontRegardless()
            app.demoBackdrop = window
        }
        app.showPanel()
        if let pin, store.items.indices.contains(pin) { store.togglePin(store.items[pin]) }
        app.model.kind = kind
        app.model.query = query
        app.model.selection = selection
    }
}

let demo = Demo.fromArguments()
