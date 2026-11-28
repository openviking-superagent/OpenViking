// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

//go:build darwin || linux

package main

import (
	"errors"
	"os/exec"
	"runtime"
)

// openTerminal runs a command in the user's terminal, where the official
// installer and `ov-superagent setup` already know how to talk.
func openTerminal(command string) error {
	if runtime.GOOS == "darwin" {
		script := `tell application "Terminal"` + "\n" +
			`activate` + "\n" +
			`do script "` + appleScriptEscape(command) + `"` + "\n" +
			`end tell`
		return exec.Command("osascript", "-e", script).Run()
	}
	candidates := [][]string{
		{"x-terminal-emulator", "-e", "sh", "-c", command + "; printf '\\n按回车关闭窗口…'; read _"},
		{"gnome-terminal", "--", "bash", "-c", command + "; printf '\\n按回车关闭窗口…'; read _"},
		{"konsole", "-e", "bash", "-c", command + "; printf '\\n按回车关闭窗口…'; read _"},
		{"xfce4-terminal", "-e", "bash -c \"" + command + "; printf '\\n按回车关闭窗口…'; read _\""},
		{"xterm", "-e", "sh", "-c", command + "; printf '\\n按回车关闭窗口…'; read _"},
	}
	var last error
	for _, candidate := range candidates {
		path, err := exec.LookPath(candidate[0])
		if err != nil {
			continue
		}
		if err := exec.Command(path, candidate[1:]...).Start(); err == nil {
			return nil
		} else {
			last = err
		}
	}
	if last == nil {
		last = errors.New("没有找到可用的终端程序")
	}
	return last
}

// appleScriptEscape keeps a shell line safe inside an AppleScript string.
func appleScriptEscape(text string) string {
	out := ""
	for _, r := range text {
		switch r {
		case '\\':
			out += `\\`
		case '"':
			out += `\"`
		default:
			out += string(r)
		}
	}
	return out
}
