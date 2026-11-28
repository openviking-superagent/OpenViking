# 桌面端：把控制台和 setup 装进一个壳

这篇说明 `desktop/` 这个 Go 壳的设计取舍、三个平台各自的安装形态，以及把
`ov-superagent setup` 真正融进界面还缺什么。目标形态是：装的时候只选一次路径，
点开就是控制台，配置也在里面做。

## 现状（v0）

- 一个窗口，显示本机已装运行时的控制台；靠平台自带 webview，不打包浏览器内核。
- 没有运行时或没有 `config.json` 时，把官方安装脚本 / `ov-superagent setup`
  在终端里打开，装完自动回到控制台。这一步是过渡：首次使用仍然是两个窗口。
- 安装包只装壳。运行时还是在 `~/.ov-superagent`，和命令行安装完全一致，
  升级、回滚、`ov-superagent status` 都不受影响。

## 为什么是 Go + 系统 webview

| 方案 | 体积 | 三平台一致性 | 代价 |
| --- | --- | --- | --- |
| Electron | 100MB+ 起 | 最好（自带内核） | 自带一份 Chromium/Node，和已有的 Node 运行时重复；macOS 公证、Windows 签名都要维护两套 |
| Tauri 2 | 壳 5-10MB，仍需外挂 Node | 好 | 引入 Rust 工具链；运行时还是得带 Node 或复用已装的 |
| **Go + 系统 webview** | **2-5MB** | 每个平台用自己的 webview | Linux 要处理 WebKitGTK 4.0/4.1 两代；渲染差异由系统决定 |

选第三个，是因为控制台本来就是给本机 Web 用的 React 页面，壳不需要自己的渲染栈，
而 OVSA 已经有随包发布的 Node。壳要做的事只有：判断装没装、起服务、等 `/ready`、
把窗口指过去。

各平台实现：

- Windows：WebView2（`github.com/jchv/go-webview2`，纯 Go，不需要 cgo，交叉编译可行）。
  Windows 10/11 一般已预装 WebView2 Runtime；没有时壳退回默认浏览器打开同一个页面，
  不会白屏。
- macOS：WKWebView（`webview_go`，cgo）。只在 macOS 上能编译，CI 用 macOS runner。
- Linux：WebKitGTK。自带一份最小的 GTK/WebKit 绑定（`webkit_window.h`），默认 4.1，
  `-tags webkit40` 编 4.0，覆盖 Ubuntu 22.04/Debian 12 和 24.04/Fedora 39+ 两类发行版。

## 三个平台的安装形态

按各平台用户已经熟悉的形状做，不强行统一：

- **Windows**：NSIS 安装包，按用户安装（`$LOCALAPPDATA\Programs`，不弹 UAC），
  只有一个目录选择页，卸载项写 HKCU。选 NSIS 而不是 MSI：按用户安装 + 自定义目录
  在 MSI 里要 per-user 打包和服务配置，收益不明显；NSIS 的目录页就是用户预期的那一步。
- **macOS**：dmg，里面是 `.app` 和 Applications 链接，拖过去就是安装，一个问题都不问。
  这是 macOS 的惯例；真要“选安装位置”，唯一原生做法是 pkg 的 destination 面板，
  但普通用户看到 pkg 反而会犹豫，所以默认 dmg。公证需要 Developer ID，
  当前构建是 ad-hoc 签名，首次打开要右键“打开”。
- **Linux**：`.deb`（`/opt/openviking-superagent` + `/usr/bin` 链接 + desktop 入口）
  给 Debian/Ubuntu；其它发行版给 tar.gz，`install.sh <prefix>` 问一次装到哪里。
  rpm 和 AppImage 是后续可加的形态，前者要维护 spec，后者不适合要常驻服务的应用。

## 把 setup 融进界面，还差什么

现在 `ov-superagent setup` 是 1900 多行交互式 CLI：逐项提问、二维码扫码建飞书应用、
OV 连接检测、写 manifest、起实例。要让它出现在窗口里，不能靠“把终端塞进 webview”，
那只是换了个显示的地方，交互还是终端。

可行的路径是把 setup 拆成两步：

1. **状态机**：新增 `ov-superagent setup --json`，把“当前在问什么、有哪些选项、
   哪些已经确定”以 JSON 吐出来，答案从 stdin 进去。现有 prompt 层（`prompt.mjs`）
   已经是集中处理输入的地方，改造面可控。
2. **界面**：控制台加 `/setup` 路由，逐步渲染这个状态机；二维码这类富内容
   用已有接口转成 SVG 直接画；密钥输入框走隐藏输入，不写日志。

在这之前，壳里的 setup 只能是终端。这也是 v0 首次安装还是两个窗口的原因，
不假装已经合一。

## 进程与更新

- 服务仍由发布的 pm2 管理，壳只调用 `ov-superagent start`，不自己 spawn daemon。
  好处是窗口关掉、壳崩溃都不影响 agent；坏处是壳没有细粒度控制（重启单个实例要另做 CLI 入口）。
- 壳和运行时分开更新：运行时继续走现有 updater（TOS 上的 `releases/<版本>`、`latest`）；
  壳的更新是安装包级别的，需要签名后走各自的发布通道（Windows 的 NSIS 覆盖安装、
  macOS 的 dmg、Linux 的 deb 升级）。两者不要互相触发，避免“更新壳把运行时弄挂”。

## 分阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| v0 | 壳 + 三平台安装包 + 终端接力安装/setup | 本分支 |
| v1 | 运行时随包（Windows 需要先有稳定 win32 产物）、托盘图标、开机自启开关 | 待定 |
| v2 | `setup --json` + 控制台内配置向导，首次使用只开一个窗口 | 需要先改 setup |
| v3 | 壳自更新、系统通知、多实例切换 | 待定 |

## 已知限制

- macOS 构建需要 macOS 机器（cgo + Xcode CLT），当前还没产出。
- Linux 的 WebKitGTK 版本要和构建参数一致，deb 的依赖已按构建时选择写死。
- 控制台本身（PR #7702）还没合入 `feat/vika`；合入前壳打开的是 `/activity` 时间线。
