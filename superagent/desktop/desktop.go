// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Phases the window can be in. The page renders one of these; nothing is
// inferred from a zero value, a phase the shell cannot establish is an error.
const (
	phaseChecking     = "checking"
	phaseNeedsInstall = "needs-install"
	phaseNeedsSetup   = "needs-setup"
	phaseInstalling   = "installing"
	phaseStarting     = "starting"
	phaseReady        = "ready"
	phaseError        = "error"
)

const (
	downloadBase   = "https://ovrelease.tos-cn-beijing.volces.com/superagent"
	defaultWebPort = 3737
	readyTimeout   = 90 * time.Second
	startTimeout   = 120 * time.Second
)

type desktopOptions struct {
	URL     string
	NoStart bool
}

type state struct {
	Phase   string `json:"phase"`
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
	Home    string `json:"home"`
	Version string `json:"version,omitempty"`
	URL     string `json:"url,omitempty"`
}

// Desktop is the shell's own state: where the release lives, what it found on
// the last check, and the loopback page the window loads.
type Desktop struct {
	home    string
	webPort int
	target  string
	noStart bool

	mu     sync.Mutex
	state  state
	logger *log.Logger
	logger_ io.Closer

	admin   *http.Server
	adminURL string

	busy bool
}

func newDesktop(opts desktopOptions) (*Desktop, error) {
	home, err := resolveHome()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Join(home, "logs"), 0o755); err != nil {
		return nil, err
	}

	file, err := os.OpenFile(logPath(home), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	logger := log.New(io.MultiWriter(file, os.Stderr), "", log.LstdFlags)

	d := &Desktop{
		home:    home,
		webPort: webPort(),
		target:  opts.URL,
		noStart: opts.NoStart,
		logger:  logger,
		logger_: file,
		state:   state{Phase: phaseChecking, Home: home},
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	d.adminURL = "http://" + listener.Addr().String() + "/"
	logger.Printf("shell page on %s", d.adminURL)
	d.admin = &http.Server{Handler: d.routes(), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		if err := d.admin.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			d.logf("admin server stopped: %v", err)
		}
	}()

	go d.check()
	return d, nil
}

// resolveHome follows the same order as the release's own platform layer: the
// explicit variable, then HOME, then the account's home directory. A shell that
// guessed differently would look at a home the CLI never uses.
func resolveHome() (string, error) {
	if explicit := os.Getenv("OV_SUPERAGENT_HOME"); explicit != "" {
		return explicit, nil
	}
	if home := os.Getenv("HOME"); home != "" {
		return filepath.Join(home, ".ov-superagent"), nil
	}
	userHome, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot find the home directory: %w", err)
	}
	return filepath.Join(userHome, ".ov-superagent"), nil
}

func (d *Desktop) stop() {
	if d.admin != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = d.admin.Shutdown(ctx)
	}
	if d.logger_ != nil {
		_ = d.logger_.Close()
	}
}

func (d *Desktop) logf(format string, args ...any) {
	d.logger.Printf(format, args...)
}

func webPort() int {
	raw := strings.TrimSpace(os.Getenv("OV_SUPERAGENT_WEB_PORT"))
	if raw == "" {
		return defaultWebPort
	}
	port := 0
	if _, err := fmt.Sscanf(raw, "%d", &port); err != nil || port < 1 || port > 65535 {
		return defaultWebPort
	}
	return port
}

func (d *Desktop) set(phase, message, detail string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.state.Phase = phase
	d.state.Message = message
	d.state.Detail = detail
}

func (d *Desktop) snapshot() state {
	d.mu.Lock()
	defer d.mu.Unlock()
	out := d.state
	out.URL = d.consoleURLLocked()
	return out
}

func (d *Desktop) consoleURLLocked() string {
	if d.state.Phase != phaseReady {
		return ""
	}
	return d.state.URL
}

// launcher is the installed release's own command; the shell never runs the
// daemon's source directly.
func (d *Desktop) launcher() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(d.home, "bin", "ov-superagent.cmd")
	}
	return filepath.Join(d.home, "bin", "ov-superagent")
}

func (d *Desktop) installed() bool {
	if _, err := os.Stat(filepath.Join(d.home, "current")); err == nil {
		return true
	}
	if _, err := os.Stat(d.launcher()); err == nil {
		return true
	}
	return false
}

func (d *Desktop) configured() bool {
	_, err := os.Stat(filepath.Join(d.home, "config.json"))
	return err == nil
}

// check runs the whole first-run decision and is safe to call again from any
// action: it never starts a second copy of what is already ready.
func (d *Desktop) check() {
	d.set(phaseChecking, "正在检查本机安装", "")
	if !d.installed() {
		d.set(phaseNeedsInstall, "这台机器还没有安装 OpenViking SuperAgent", "点下面的按钮，安装包会下载到这里并显示进度，不需要开终端。")
		return
	}
	if !d.configured() {
		d.set(phaseNeedsSetup, "运行时已安装，还没有完成配置", "配置要建机器人、扫码授权，现在还需要在终端里跑一次 setup；完成后这个窗口会自动打开控制台。")
		return
	}
	if d.target == "" {
		d.set(phaseStarting, "正在启动服务", "")
	}
	if err := d.ensureRunning(); err != nil {
		d.set(phaseError, "服务没有就绪", err.Error())
		return
	}
	url := d.target
	if url == "" {
		url = d.resolveConsole()
	}
	d.mu.Lock()
	d.state.URL = url
	d.mu.Unlock()
	d.set(phaseReady, "已连接", "")
	d.logf("console: %s", url)
	version := d.version()
	d.mu.Lock()
	d.state.Version = version
	d.mu.Unlock()
}

func httpx(path string) (*http.Response, error) {
	client := &http.Client{Timeout: 3 * time.Second}
	return client.Get(fmt.Sprintf("http://127.0.0.1:%d%s", webPort(), path))
}

func (d *Desktop) ready() bool {
	response, err := httpx("/ready")
	if err != nil {
		return false
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	return response.StatusCode == http.StatusOK
}

// resolveConsole prefers the console page; a release that predates it serves
// only the message timeline, and the shell says so instead of showing a 404.
func (d *Desktop) resolveConsole() string {
	base := fmt.Sprintf("http://127.0.0.1:%d", d.webPort)
	if response, err := httpx("/console"); err == nil {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		response.Body.Close()
		if response.StatusCode == http.StatusOK {
			return base + "/console"
		}
	}
	return base + "/activity"
}

func (d *Desktop) ensureRunning() error {
	if d.ready() {
		d.logf("web is already ready on port %d", d.webPort)
		return nil
	}
	if d.noStart {
		return errors.New("服务没有在运行，而且这次启动带了 --no-start")
	}
	if !d.configured() {
		return errors.New("还没有配置，无法启动")
	}

	output, err := d.runLauncher("start")
	if err != nil {
		return fmt.Errorf("ov-superagent start 失败：%v%s", err, excerpt(output))
	}

	deadline := time.Now().Add(readyTimeout)
	for time.Now().Before(deadline) {
		if d.ready() {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("等了 %s，http://127.0.0.1:%d/ready 仍然没有就绪%s", readyTimeout, d.webPort, excerpt(output))
}

// runLauncher runs one `ov-superagent` subcommand with the home the shell
// resolved, and keeps its output for the page and the log.
func (d *Desktop) runLauncher(args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), startTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, d.launcher(), args...)
	cmd.Env = append(os.Environ(), "OV_SUPERAGENT_HOME="+d.home)
	combined, err := cmd.CombinedOutput()
	text := string(combined)
	d.logf("ov-superagent %s (exit %v)\n%s", strings.Join(args, " "), err, text)
	return text, err
}

// excerpt keeps the tail of a command's output, which is where the reason is.
func excerpt(output string) string {
	output = strings.TrimSpace(output)
	if output == "" {
		return ""
	}
	lines := strings.Split(output, "\n")
	if len(lines) > 12 {
		lines = lines[len(lines)-12:]
	}
	return "\n" + strings.Join(lines, "\n")
}

// version asks the installed release what it is, for the window's footer.
func (d *Desktop) version() string {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, d.launcher(), "--version")
	cmd.Env = append(os.Environ(), "OV_SUPERAGENT_HOME="+d.home)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	text := strings.TrimSpace(string(out))
	if len(text) > 80 {
		text = text[:80]
	}
	return text
}

// firstLine keeps detail text short enough for the page's one line.
func firstLine(text string) string {
	scanner := bufio.NewScanner(strings.NewReader(text))
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)
	for scanner.Scan() {
		if line := strings.TrimSpace(scanner.Text()); line != "" {
			return line
		}
	}
	return ""
}

func (d *Desktop) marshal() ([]byte, error) {
	return json.Marshal(d.snapshot())
}
