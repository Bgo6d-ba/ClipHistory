import SwiftUI
import WidgetKit

struct Entry: TimelineEntry {
    let date: Date
    let items: [WidgetItem]
}

// The widget never sees the encrypted history: the app writes widget.json with just the rows it shows.
struct Provider: TimelineProvider {
    func entry() -> Entry {
        let file = sharedDir.appendingPathComponent("widget.json")
        return Entry(date: .now, items: (try? JSONDecoder().decode([WidgetItem].self, from: Data(contentsOf: file))) ?? [])
    }

    func placeholder(in context: Context) -> Entry {
        Entry(date: .now, items: [
            WidgetItem(title: "Copied text shows up here", kind: .text, pinned: false, date: .now, token: "a"),
            WidgetItem(title: "#0000C7", kind: .color, pinned: false, date: .now, token: "b", swatch: "#0000C7"),
            WidgetItem(title: "meet.google.com", kind: .link, pinned: false, date: .now, token: "c"),
        ])
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
            Text("Clipboard")
                .font(.system(size: 13, weight: .bold))
                .padding(.bottom, 2)
            if entry.items.isEmpty {
                Spacer()
                Text("Copy something to start")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                Spacer()
            } else {
                ForEach(entry.items.prefix(rows)) { item in
                    Link(destination: link(item)) { row(item) }
                }
                Spacer(minLength: 0)
            }
        }
        // ponytail: a material background; macOS swaps it for glass in the Clear and Tinted widget styles
        .containerBackground(.ultraThinMaterial, for: .widget)
        // ponytail: fallback in case a small widget only honours one tap target; row Links still win where supported
        .widgetURL(entry.items.first.map(link))
    }

    func link(_ item: WidgetItem) -> URL {
        URL(string: "cliphistory://copy/\(item.token)")!
    }

    func row(_ item: WidgetItem) -> some View {
        let kind = item.kind
        return HStack(spacing: 8) {
            Group {
                if let data = item.thumbnail, let image = NSImage(data: data) {
                    Image(nsImage: image).resizable().scaledToFill()
                } else if let swatch = item.swatch.flatMap(hexColor) {
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
                Text(item.title)
                    .font(.system(size: 12, weight: .semibold, design: kind == .code || kind == .color ? .monospaced : .default))
                    .lineLimit(1)
                    .truncationMode(kind == .link ? .middle : .tail)
                Text(kind.label)
                    .font(.system(size: 8, weight: .heavy))
                    .foregroundStyle(kind.tint)
            }
            Spacer(minLength: 4)
            if family != .systemSmall {
                if item.pinned {
                    Image(systemName: "pin.fill")
                        .font(.system(size: 9))
                        .foregroundStyle(.orange)
                }
                Text(shortAgo(item.date))
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
