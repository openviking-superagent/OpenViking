// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

//go:build windows

package main

import "os/exec"

// openTerminal opens a console window kept open after the command ends, so the
// installer's progress and setup's questions stay readable.
func openTerminal(command string) error {
	return exec.Command("cmd.exe", "/c", "start", "OpenViking SuperAgent", "cmd.exe", "/k", command).Start()
}
