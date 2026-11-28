// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

//go:build !windows

package main

import "os/exec"

// hideConsole has nothing to hide where a child process never gets a console
// window of its own.
func hideConsole(cmd *exec.Cmd) {}
