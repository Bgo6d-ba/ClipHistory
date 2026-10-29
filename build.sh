#!/bin/sh
# Builds ClipHistory.app (universal: Apple silicon + Intel) and installs it to ~/Applications.
#
# Signing: uses your "Developer ID Application" or "Apple Development" certificate if you have one,
# which enables the desktop widget. Pick a team with TEAM_ID=XXXXXXXXXX ./build.sh.
# Without a certificate the app is signed ad hoc and built without the widget.
set -e
cd "$(dirname "$0")"

identities=$(security find-identity -v -p codesigning 2>/dev/null || true)
if [ -z "$TEAM_ID" ]; then
    TEAM_ID=$(echo "$identities" | sed -nE 's/.*"Developer ID Application: .*\(([A-Z0-9]{10})\)".*/\1/p' | head -1)
    [ -n "$TEAM_ID" ] || TEAM_ID=$(echo "$identities" | sed -nE 's/.*"Apple Development: .*\(([A-Z0-9]{10})\)".*/\1/p' | head -1)
fi
if [ -n "$TEAM_ID" ]; then
    IDENTITY=$(echo "$identities" | awk "/(Developer ID Application|Apple Development): .*\($TEAM_ID\)/ {print \$2; exit}")
    [ -n "$IDENTITY" ] || { echo "No signing certificate found for team $TEAM_ID"; exit 1; }
    GROUP=$TEAM_ID.cliphistory
    echo "Signing for team $TEAM_ID (widget enabled)"
else
    IDENTITY=-
    echo "No signing certificate found: building unsigned, without the desktop widget"
fi

APP=ClipHistory.app
WIDGET=$APP/Contents/PlugIns/ClipHistoryWidget.appex
rm -rf "$APP" build
mkdir -p "$APP/Contents/MacOS" build

# swiftc FILES OUTPUT [EXTRA FLAGS...] for both architectures, then merge into one universal binary
universal() {
    files=$1 out=$2
    shift 2
    for arch in arm64 x86_64; do
        swiftc -O -target $arch-apple-macos14.0 "$@" $files -o build/$arch
    done
    lipo -create build/arm64 build/x86_64 -output "$out"
}

universal "Shared.swift Store.swift SelfTest.swift Demo.swift main.swift" "$APP/Contents/MacOS/ClipHistory"

# The icon source is AppIcon.icon (Icon Composer). Xcode's actool turns it into the Liquid Glass icon for macOS 26
# plus a classic .icns; without Xcode the prebuilt AppIcon.icns from the repo is used.
mkdir -p "$APP/Contents/Resources"
if xcrun --find actool >/dev/null 2>&1; then
    xcrun actool AppIcon.icon --compile "$APP/Contents/Resources" --platform macosx --minimum-deployment-target 14.0 \
        --app-icon AppIcon --output-partial-info-plist build/icon.plist >/dev/null
else
    cp AppIcon.icns "$APP/Contents/Resources/"
fi

plist_head='<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>'
group_key=${GROUP:+"<key>ClipHistoryAppGroup</key><string>$GROUP</string>"}

cat > "$APP/Contents/Info.plist" <<EOF
$plist_head
    <key>CFBundleIdentifier</key><string>local.cliphistory</string>
    <key>CFBundleName</key><string>ClipHistory</string>
    <key>CFBundleExecutable</key><string>ClipHistory</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>1.3</string>
    <key>CFBundleVersion</key><string>4</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>LSUIElement</key><true/>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>CFBundleIconName</key><string>AppIcon</string>
    $group_key
    <key>CFBundleURLTypes</key>
    <array><dict>
        <key>CFBundleURLName</key><string>local.cliphistory</string>
        <key>CFBundleURLSchemes</key><array><string>cliphistory</string></array>
    </dict></array>
    <key>NSServices</key>
    <array><dict>
        <key>NSMenuItem</key><dict><key>default</key><string>Paste from ClipHistory</string></dict>
        <key>NSMessage</key><string>pasteFromHistory</string>
        <key>NSPortName</key><string>ClipHistory</string>
        <key>NSReturnTypes</key><array><string>NSStringPboardType</string><string>public.utf8-plain-text</string></array>
        <key>NSRequiredContext</key><dict/>
        <key>NSTimeout</key><string>120000</string>
    </dict></array>
</dict>
</plist>
EOF

if [ -n "$GROUP" ]; then
    mkdir -p "$WIDGET/Contents/MacOS"
    universal "Shared.swift Widget.swift" "$WIDGET/Contents/MacOS/ClipHistoryWidget" -parse-as-library -application-extension

    cat > "$WIDGET/Contents/Info.plist" <<EOF
$plist_head
    <key>CFBundleIdentifier</key><string>local.cliphistory.widget</string>
    <key>CFBundleName</key><string>ClipHistoryWidget</string>
    <key>CFBundleDisplayName</key><string>ClipHistory</string>
    <key>CFBundleExecutable</key><string>ClipHistoryWidget</string>
    <key>CFBundlePackageType</key><string>XPC!</string>
    <key>CFBundleShortVersionString</key><string>1.3</string>
    <key>CFBundleVersion</key><string>4</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    $group_key
    <key>NSExtension</key>
    <dict><key>NSExtensionPointIdentifier</key><string>com.apple.widgetkit-extension</string></dict>
</dict>
</plist>
EOF

    cat > build/app.entitlements <<EOF
$plist_head
    <key>com.apple.security.application-groups</key><array><string>$GROUP</string></array>
</dict>
</plist>
EOF

    cat > build/widget.entitlements <<EOF
$plist_head
    <key>com.apple.security.app-sandbox</key><true/>
    <key>com.apple.security.application-groups</key><array><string>$GROUP</string></array>
</dict>
</plist>
EOF

    codesign --force --options runtime --timestamp --entitlements build/widget.entitlements -s "$IDENTITY" "$WIDGET"
    codesign --force --options runtime --timestamp --entitlements build/app.entitlements -s "$IDENTITY" "$APP"
else
    codesign --force -s - "$APP"
fi
rm -rf build

mkdir -p ~/Applications
rm -rf ~/Applications/"$APP"
cp -R "$APP" ~/Applications/
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f ~/Applications/"$APP"
[ -z "$GROUP" ] || pluginkit -a ~/Applications/"$WIDGET"
/System/Library/CoreServices/pbs -update
echo "Installed ~/Applications/$APP"
