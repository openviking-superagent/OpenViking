#!/bin/sh
# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: AGPL-3.0
#
# Builds the macOS disk image: OpenViking SuperAgent.app to drag into
# Applications, which is the install step macOS users already know. No question
# is asked, and nothing outside the .app is touched.
#
#   sh packaging/macos/build-dmg.sh <binary> <version> <out-dir> [arm64|x64]
set -eu

BINARY="${1:?binary}"
VERSION="${2:?version}"
OUT="${3:?output directory}"
ARCH="${4:-$(uname -m)}"

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

APP="$STAGE/OpenViking SuperAgent.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BINARY" "$APP/Contents/MacOS/ovsa-desktop"
chmod 0755 "$APP/Contents/MacOS/ovsa-desktop"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>OpenViking SuperAgent</string>
  <key>CFBundleDisplayName</key><string>OpenViking SuperAgent</string>
  <key>CFBundleIdentifier</key><string>com.openviking.superagent.desktop</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>ovsa-desktop</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSRequiresAquaSystemAppearance</key><false/>
</dict>
</plist>
PLIST

# Ad-hoc signature: a build without a Developer ID cannot be notarized, and an
# unsigned bundle is refused outright on Apple silicon. This keeps it runnable
# for an internal test; a public build signs with the team's Developer ID.
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

mkdir -p "$OUT"
DMG="$OUT/ovsa-desktop-${VERSION}-darwin-${ARCH}.dmg"
rm -f "$DMG"
ln -s /Applications "$STAGE/Applications"
hdiutil create -quiet -volname "OpenViking SuperAgent" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
echo "$DMG"
