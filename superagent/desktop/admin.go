// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"runtime"
	"time"
)

// routes serves the shell's own page on loopback. It has no authentication
// because it holds no secret: it starts, stops nothing, and only tells the
// window which URL on this machine to open.
func (d *Desktop) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("content-type", "text/html; charset=utf-8")
		w.Header().Set("cache-control", "no-store")
		fmt.Fprint(w, page)
	})
	mux.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) {
		body, err := d.marshal()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("content-type", "application/json")
		w.Header().Set("cache-control", "no-store")
		_, _ = w.Write(body)
	})
	mux.HandleFunc("/api/action", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		var request struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := d.action(request.Name); err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		body, err := d.marshal()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write(body)
	})
	return mux
}

func (d *Desktop) action(name string) error {
	d.mu.Lock()
	if d.busy {
		d.mu.Unlock()
		return fmt.Errorf("上一个动作还在进行")
	}
	d.busy = true
	d.mu.Unlock()
	defer func() {
		d.mu.Lock()
		d.busy = false
		d.mu.Unlock()
	}()

	switch name {
	case "install":
		d.set(phaseNeedsInstall, "安装程序已在终端里打开", "按终端里的提示完成安装；装完 setup 也在同一个终端里。")
		if err := openTerminal(installerCommand()); err != nil {
			d.set(phaseError, "打不开终端", err.Error())
			return nil
		}
		go d.waitFor(10 * time.Minute, func() bool { return d.installed() && d.configured() })
		return nil
	case "setup":
		d.set(phaseNeedsSetup, "配置向导已在终端里打开", "按终端里的提示完成配置；保存后这个窗口会自动继续。")
		if err := openTerminal(shellQuote(d.launcher()) + " setup"); err != nil {
			d.set(phaseError, "打不开终端", err.Error())
			return nil
		}
		go d.waitFor(30*time.Minute, d.configured)
		return nil
	case "open":
		url := d.resolveConsole()
		if !d.ready() {
			return fmt.Errorf("服务还没有就绪")
		}
		return openBrowser(url)
	case "logs":
		return openPath(d.home + stringPathSeparator() + "logs")
	case "retry", "start":
		go d.check()
		return nil
	default:
		return fmt.Errorf("未知动作 %q", name)
	}
}

// waitFor polls a condition after a terminal action and then re-runs the check,
// so the page follows the terminal without the user pressing anything.
func (d *Desktop) waitFor(timeout time.Duration, condition func() bool) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			d.check()
			return
		}
		time.Sleep(2 * time.Second)
	}
}

func shellQuote(path string) string {
	escaped := ""
	for _, r := range path {
		if r == '\'' {
			escaped += "'\\''"
			continue
		}
		escaped += string(r)
	}
	return "'" + escaped + "'"
}

func stringPathSeparator() string {
	if runtime.GOOS == "windows" {
		return "\\"
	}
	return "/"
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}

func openPath(path string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", path).Start()
	case "windows":
		return exec.Command("explorer", path).Start()
	default:
		return exec.Command("xdg-open", path).Start()
	}
}

const page = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenViking SuperAgent</title>
<style>
  :root { color-scheme: light dark; --bg:#f7f7f8; --card:#fff; --text:#1b1b1f; --muted:#6b6b76; --line:#e6e6ea; --accent:#4a5cf5; --danger:#c0392b; }
  @media (prefers-color-scheme: dark) { :root { --bg:#141417; --card:#1c1c21; --text:#f2f2f5; --muted:#a0a0ab; --line:#2b2b33; --accent:#8b95ff; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--text);
         font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  main { width:min(560px, calc(100vw - 48px)); background:var(--card); border:1px solid var(--line); border-radius:14px; padding:28px 30px 24px; }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:18px; }
  .dot { width:10px; height:10px; border-radius:50%; background:var(--accent); }
  .dot.spin { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity:.35 } 50% { opacity:1 } }
  h1 { font-size:17px; margin:0; font-weight:600; letter-spacing:.2px; }
  p.message { margin:0 0 6px; font-size:15px; }
  p.detail { margin:0; color:var(--muted); font-size:13.5px; white-space:pre-wrap; }
  .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }
  button { font:inherit; padding:7px 14px; border-radius:8px; border:1px solid var(--line); background:transparent; color:var(--text); cursor:pointer; }
  button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  button:disabled { opacity:.5; cursor:default; }
  footer { margin-top:18px; padding-top:14px; border-top:1px solid var(--line); color:var(--muted); font-size:12px;
           display:flex; justify-content:space-between; gap:10px; }
  code { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; }
</style>
<div class="brand"><span class="dot" id="dot"></span><h1>OpenViking SuperAgent</h1></div>
<main>
  <p class="message" id="message">正在检查本机安装…</p>
  <p class="detail" id="detail"></p>
  <div class="actions" id="actions"></div>
  <footer><span id="home"></span><span id="version"></span></footer>
</main>
<script>
const actions = {
  'needs-install': [['install','安装 OpenViking SuperAgent','primary'],['retry','重新检查']],
  'needs-setup':   [['setup','打开配置向导','primary'],['retry','重新检查']],
  'starting':      [['retry','重新检查']],
  'error':         [['start','重试启动','primary'],['logs','打开日志'],['open','在浏览器中打开']],
  'ready':         [['open','在浏览器中打开'],['logs','打开日志'],['start','重启服务']]
};
let painted = '';
async function tick() {
  let state;
  try { state = await (await fetch('/api/state')).json(); }
  catch { document.getElementById('message').textContent = '桌面壳已退出'; return; }
  if (state.phase === 'ready' && state.url) { location.replace(state.url); return; }
  const key = JSON.stringify(state);
  if (key === painted) return;
  painted = key;
  document.getElementById('message').textContent = state.message || '';
  document.getElementById('detail').textContent = state.detail || '';
  document.getElementById('home').textContent = state.home || '';
  document.getElementById('version').textContent = state.version || '';
  document.getElementById('dot').className = 'dot' + (state.phase === 'checking' || state.phase === 'starting' ? ' spin' : '');
  const box = document.getElementById('actions');
  box.textContent = '';
  for (const [name, label, kind] of (actions[state.phase] || [['retry','重新检查']])) {
    const button = document.createElement('button');
    button.textContent = label;
    if (kind) button.className = kind;
    button.onclick = async () => {
      button.disabled = true;
      try { await fetch('/api/action', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({name})}); }
      finally { painted = ''; tick(); }
    };
    box.appendChild(button);
  }
}
tick();
setInterval(tick, 1500);
</script>
</html>`
