# OpenViking SuperAgent desktop shell

One window that opens the console of the OpenViking SuperAgent installed on this
machine. It is a shell, not a second copy of the product: the runtime, its
configuration and its processes are exactly the ones `~/.ov-superagent` already
holds, so the desktop app and the terminal show the same instance.

## What it does

1. Resolves the home directory (`OV_SUPERAGENT_HOME`, else `~/.ov-superagent`).
2. If no release is installed, offers the platform's published installer and
   runs it in a terminal.
3. If a release is installed but `config.json` is missing, runs
   `ov-superagent setup` in a terminal.
4. Otherwise runs `ov-superagent start`, waits for `http://127.0.0.1:3737/ready`,
   and loads the console: `/console` when the release serves it, `/activity` on
   an older release.
5. Closing the window never stops an agent that was already running.

The window itself is the platform's own webview: WebView2 on Windows 10/11,
WKWebView on macOS, WebKitGTK on Linux. No browser engine is bundled.

## Installers

| Platform | Format | What it asks |
| --- | --- | --- |
| Windows x64 | NSIS setup `.exe` | the program directory, nothing else; per-user, no admin |
| macOS arm64/x64 | `.dmg` with the app and an Applications link | nothing; drag to install |
| Debian/Ubuntu x64 | `.deb` | nothing |
| other Linux x64 | `.tar.gz` + `install.sh <prefix>` | the install prefix |

All of them install only the shell. The runtime is the one the one-line
installer publishes, and it keeps living in `~/.ov-superagent`.

## Build

```sh
cd superagent/desktop
go test ./...
GOOS=windows CGO_ENABLED=0 go build -ldflags "-H=windowsgui" -o ovsa-desktop.exe .   # WebView2, pure Go
CGO_ENABLED=1 go build -o ovsa-desktop .                      # macOS, Linux (GTK + WebKitGTK)

sh packaging/linux/build-deb.sh ./ovsa-desktop 0.1.0 dist
sh packaging/macos/build-dmg.sh ./ovsa-desktop 0.1.0 dist arm64
makensis /DVERSION=0.1.0 /DSOURCE=dist\\ovsa-desktop.exe packaging/windows/installer.nsi
```

Linux distributions that still ship WebKitGTK 4.0 (Ubuntu 22.04, Debian 12)
build with `-tags webkit40`; the default is 4.1.

`.github/workflows/superagent-desktop.yml` builds Windows, macOS (arm64 and
x64) and Linux on their own runners and publishes the installers as a
prerelease of the fork.

## What it does not do yet

- No in-app setup wizard. Setup is the real `ov-superagent setup` in a terminal,
  so a first run is two windows, not one. Moving it into the console needs the
  setup flow split into a headless API first (see `docs/desktop.md`).
- No bundled runtime. The installer therefore needs the machine to have
  reached the published tree once; a machine with no runtime runs the official
  installer, which downloads it.
- No tray icon, no autostart toggle, no self-update of the shell.
- macOS builds are ad-hoc signed, not notarized.
