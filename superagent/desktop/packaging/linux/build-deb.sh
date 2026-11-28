#!/bin/sh
# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: AGPL-3.0
#
# Builds the Linux packages: a .deb for Debian/Ubuntu and a .tar.gz with an
# install script that asks where to put the program, for every other
# distribution. Neither one carries the runtime; it stays in ~/.ov-superagent,
# as with the one-line installer.
#
#   sh packaging/linux/build-deb.sh <binary> <version> <out-dir>
set -eu

BINARY="${1:?binary}"
VERSION="${2:?version}"
OUT="${3:?output directory}"
ARCH="${ARCH:-amd64}"
NAME="ovsa-desktop"

ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
mkdir -p "$OUT" "$ROOT/opt/openviking-superagent" "$ROOT/usr/bin" \
  "$ROOT/usr/share/applications" "$ROOT/usr/share/icons/hicolor/256x256/apps" "$ROOT/DEBIAN"

install -m 0755 "$BINARY" "$ROOT/opt/openviking-superagent/$NAME"
ln -s "/opt/openviking-superagent/$NAME" "$ROOT/usr/bin/$NAME"

cat > "$ROOT/usr/share/applications/openviking-superagent.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=OpenViking SuperAgent
Comment=Open the local OpenViking SuperAgent console
Exec=$NAME
Terminal=false
Categories=Development;
StartupWMClass=OpenViking SuperAgent
DESKTOP

cat > "$ROOT/DEBIAN/control" <<CONTROL
Package: openviking-superagent-desktop
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Depends: libgtk-3-0, libwebkit2gtk-4.1-0
Maintainer: OpenViking SuperAgent <openviking@bytedance.com>
Description: Desktop shell for OpenViking SuperAgent
 One window that opens the console of the OpenViking SuperAgent installed on
 this machine. The runtime and its configuration stay in ~/.ov-superagent.
CONTROL

DEB="$OUT/${NAME}_${VERSION}_${ARCH}.deb"
dpkg-deb --root-owner-group --build "$ROOT" "$DEB" >/dev/null
echo "$DEB"

# The portable archive: install.sh asks for the directory and nothing else.
PORTABLE="$ROOT/portable"
mkdir -p "$PORTABLE"
install -m 0755 "$BINARY" "$PORTABLE/$NAME"
cat > "$PORTABLE/install.sh" <<'INSTALL'
#!/bin/sh
# Installs the OpenViking SuperAgent desktop shell where you say.
set -eu
PREFIX="${1:-$HOME/.local/opt/openviking-superagent}"
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$PREFIX"
install -m 0755 "$HERE/ovsa-desktop" "$PREFIX/ovsa-desktop"
mkdir -p "$HOME/.local/bin"
ln -sf "$PREFIX/ovsa-desktop" "$HOME/.local/bin/ovsa-desktop"
printf 'installed: %s\nrun: ovsa-desktop  (or %s/ovsa-desktop)\n' "$PREFIX" "$PREFIX"
INSTALL
chmod 0755 "$PORTABLE/install.sh"
TAR="$OUT/${NAME}-${VERSION}-linux-x64.tar.gz"
tar -czf "$TAR" -C "$PORTABLE" .
echo "$TAR"
