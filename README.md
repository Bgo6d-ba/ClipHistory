# ClipHistory

A small, free clipboard history app for macOS. It lives in the menu bar, remembers what you copy, and gives
it back with one shortcut.

- **⇧⌘V popup** with Liquid Glass styling on macOS 26 (frosted material on older versions)
- **Categories**: Links, Colors, Images, Code and Text, each with its own colour. Empty categories are hidden
- **Search**, **pin** favourites, **delete** single items (× or ⌘⌫), and **Clear History** with a confirmation
- **Images**: screenshots and copied pictures are kept as well as text
- **Paste from ClipHistory** in the Services menu (right-click → Services) inserts a pick directly into any text field
- **Desktop widget** (small, medium, large) showing your latest clips; click one to copy it
- Unpinned items older than **7 days** are removed automatically; at most **50** unpinned items are kept
- **Private**: everything stays on your Mac. Nothing is sent anywhere, and items that password managers mark as
  concealed are never saved

## Requirements

- macOS 14 Sonoma or later (Apple silicon or Intel)
- Swift 6 toolchain: Xcode or the Command Line Tools (`xcode-select --install`)

## Build and install

```sh
git clone <this repo>
cd ClipHistory
./build.sh
open ~/Applications/ClipHistory.app
```

`build.sh` compiles a universal app, signs it and installs it to `~/Applications`.

- If you have an Apple **Developer ID** or **Apple Development** certificate, it signs with it and includes the
  desktop widget. Choose a team with `TEAM_ID=XXXXXXXXXX ./build.sh`.
- Without a certificate the app is signed ad hoc and built **without the widget**; everything else works.

## Using it

| Action | How |
| --- | --- |
| Open the popup | ⇧⌘V, or click the menu bar icon |
| Move between cards | ← → (also ↑ ↓) |
| Switch category | Tab |
| Copy the highlighted card | Return, or click it |
| Delete the highlighted card | ⌘⌫ or × |
| Pin / unpin | the pin button on a card |
| Close | Esc, or click anywhere else |
| Clear history, Open at Login, Quit | the ⋯ menu in the popup |

**Services menu**: right-click in a text field → Services → *Paste from ClipHistory*. If it is missing, enable it
in System Settings → Keyboard → Keyboard Shortcuts → Services → Text.

**Widget**: right-click the desktop → Edit Widgets → search for *ClipHistory*.

## Where data is stored

- Signed builds: `~/Library/Group Containers/<TEAM_ID>.cliphistory/` (shared with the widget)
- Unsigned builds: `~/Library/Application Support/ClipHistory/`

`history.json` holds the text history and `images/` the copied images. Delete the folder to wipe everything.

## Development

```sh
ClipHistory.app/Contents/MacOS/ClipHistory --selftest   # runs the built-in checks
ClipHistory.app/Contents/MacOS/ClipHistory --show       # opens the popup on launch
```

| File | Contents |
| --- | --- |
| `main.swift` | menu bar app, clipboard polling, storage, popup UI, Services handler |
| `Shared.swift` | code shared with the widget: clip model, categories, thumbnails, Liquid Glass helper |
| `Widget.swift` | desktop widget |
| `build.sh` | build, sign and install |

## License

[MIT](LICENSE)
