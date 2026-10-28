import SwiftUI
import WidgetKit

struct Entry: TimelineEntry {
    let date: Date
    let clips: [Clip]
    let total: Int
}

struct Provider: TimelineProvider {
    func entry() -> Entry {
        let file = sharedDir.appendingPathComponent("history.json")
        let all = (try? JSONDecoder().decode([Clip].self, from: Data(contentsOf: file))) ?? []
        return Entry(date: .now, clips: Array((all.filter(\.pinned) + all.filter { !$0.pinned }).prefix(7)), total: all.count)
    }

    func placeholder(in context: Context) -> Entry {
        Entry(date: .now, clips: [Clip(text: "Copied text shows up here"), Clip(text: "#0000C7"), Clip(text: "meet.google.com")], total: 3)
    }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : entry())
    }

    // ponytail: the app reloads the widget on every change; the 15 min refresh only keeps the "5m" ages fresh
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .after(.now.addingTimeInterval(15 * 60))))
    }
}

struct ClipWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry

    var body: some View {
        let rows = family == .systemLarge ? 7 : 3
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text("Clipboard").font(.system(size: 13, weight: .bold))
                Spacer()
                Text(family == .systemSmall ? "\(entry.total)" : "\(entry.total) items")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 2)
            if entry.clips.isEmpty {
                Spacer()
                Text("Copy something to start")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                Spacer()
            } else {
                ForEach(entry.clips.prefix(rows)) { clip in
                    Link(destination: URL(string: "cliphistory://copy/\(clip.key)")!) {
                        row(clip)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        // ponytail: a material background; macOS swaps it for glass in the Clear and Tinted widget styles
        .containerBackground(.ultraThinMaterial, for: .widget)
        // ponytail: fallback in case a small widget only honours one tap target; row Links still win where supported
        .widgetURL(entry.clips.first.map { URL(string: "cliphistory://copy/\($0.key)")! })
    }

    func row(_ clip: Clip) -> some View {
        let kind = Kind.of(clip)
        let text = clip.text.trimmingCharacters(in: .whitespacesAndNewlines)
        return HStack(spacing: 8) {
            Group {
                if kind == .image, let name = clip.image, let image = thumbnail(sharedDir.appendingPathComponent("images").appendingPathComponent(name), maxPixel: 96) {
                    Image(nsImage: image).resizable().scaledToFill()
                } else if kind == .color, let swatch = hexColor(text) {
                    swatch.color
                } else {
                    Image(systemName: kind.icon)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(kind.tint)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(kind.tint.opacity(0.15))
                }
            }
            .frame(width: 26, height: 26)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

            VStack(alignment: .leading, spacing: 1) {
                Text(kind == .image ? "Image" : kind == .link ? linkDisplay(text) : kind == .color ? text.uppercased() : oneLine(text))
                    .font(.system(size: 12, weight: .semibold, design: kind == .code || kind == .color ? .monospaced : .default))
                    .lineLimit(1)
                    .truncationMode(kind == .link ? .middle : .tail)
                Text(kind.label)
                    .font(.system(size: 8, weight: .heavy))
                    .foregroundStyle(kind.tint)
            }
            Spacer(minLength: 4)
            if family != .systemSmall {
                if clip.pinned {
                    Image(systemName: "pin.fill")
                        .font(.system(size: 9))
                        .foregroundStyle(.orange)
                }
                Text(shortAgo(clip.date))
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 6)
        .frame(height: family == .systemLarge ? 36 : 30)
        .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

@main
struct ClipHistoryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ClipHistoryWidget", provider: Provider()) { entry in
            ClipWidgetView(entry: entry)
        }
        .configurationDisplayName("Clipboard")
        .description("Your latest copies. Click one to copy it again.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
