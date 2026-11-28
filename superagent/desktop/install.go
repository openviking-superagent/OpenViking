// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// The installer runs inside the window: the shell downloads the official
// script, runs it without a console window and without its own setup step, and
// shows its progress lines. The layout it produces is the published one, so a
// later `ov-superagent upgrade` and the updater keep working.
const installTimeout = 20 * time.Minute

func (d *Desktop) install() {
	d.set(phaseInstalling, "正在下载安装包", "从发布地址取安装脚本和安装包，进度会显示在这里。")
	go func() {
		if err := d.runInstaller(); err != nil {
			d.set(phaseError, "安装没有完成", err.Error())
			return
		}
		d.check()
	}()
}

func (d *Desktop) runInstaller() error {
	scriptPath := filepath.Join(os.TempDir(), fmt.Sprintf("ovsa-install-%d", time.Now().UnixNano()))
	var scriptURL, fileName string
	if runtime.GOOS == "windows" {
		scriptURL, fileName = base()+"/install.ps1", "install.ps1"
	} else {
		scriptURL, fileName = base()+"/install.sh", "install.sh"
	}
	scriptPath = filepath.Join(scriptPath, fileName)
	if err := os.MkdirAll(filepath.Dir(scriptPath), 0o755); err != nil {
		return err
	}
	defer os.RemoveAll(filepath.Dir(scriptPath))

	d.set(phaseInstalling, "正在下载安装脚本", "")
	if err := downloadFile(scriptURL, scriptPath); err != nil {
		return fmt.Errorf("下载安装脚本失败：%w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), installTimeout)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-NoSetup")
	} else {
		cmd = exec.CommandContext(ctx, "sh", scriptPath, "--no-setup")
	}
	cmd.Env = append(os.Environ(),
		"OV_SUPERAGENT_HOME="+d.home,
		"OV_SUPERAGENT_LANG=zh",
		"NO_COLOR=1",
	)
	hideConsole(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动安装程序失败：%w", err)
	}
	// The installer's own lines are the progress. Only the last few stay on
	// screen; the whole transcript goes to the shell log.
	lines := make([]string, 0, 6)
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		d.logf("installer: %s", line)
		lines = append(lines, line)
		if len(lines) > 6 {
			lines = lines[1:]
		}
		d.set(phaseInstalling, "正在安装 OpenViking SuperAgent", strings.Join(lines, "\n"))
	}

	if err := cmd.Wait(); err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("安装超时（%s）", installTimeout)
		}
		return fmt.Errorf("安装程序退出：%v\n%s", err, strings.Join(lines, "\n"))
	}
	d.set(phaseInstalling, "安装完成，正在检查", "")
	return nil
}

// base is the published tree. The variable exists for a local mirror and for
// tests, the same one install.sh reads.
func base() string {
	if value := strings.TrimSpace(os.Getenv("OV_SUPERAGENT_DOWNLOAD_BASE")); value != "" {
		return strings.TrimSuffix(value, "/")
	}
	return downloadBase
}

// downloadFile fetches a small text file (the installer script) with a size cap.
func downloadFile(url, target string) error {
	client := &http.Client{Timeout: 60 * time.Second}
	response, err := client.Get(url)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", response.StatusCode)
	}
	file, err := os.Create(target)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = io.Copy(file, io.LimitReader(response.Body, 4<<20))
	return err
}
