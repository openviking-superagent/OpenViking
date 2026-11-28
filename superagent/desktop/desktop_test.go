// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A machine with no release and no config is offered the installer first, and
// setup only after the runtime exists.
func TestInstalledAndConfigured(t *testing.T) {
	home := t.TempDir()
	d := &Desktop{home: home}
	if d.installed() || d.configured() {
		t.Fatal("an empty home must report no release and no configuration")
	}

	if err := os.MkdirAll(filepath.Join(home, "bin"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, "bin", "ov-superagent"), []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if !d.installed() {
		t.Fatal("a release launcher means the release is installed")
	}
	if d.configured() {
		t.Fatal("a launcher alone is not a configuration")
	}

	if err := os.WriteFile(filepath.Join(home, "config.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if !d.configured() {
		t.Fatal("config.json means the machine is configured")
	}
}

// The page only ever offers an action its phase can carry out.
func TestSnapshotHidesURLUntilReady(t *testing.T) {
	d := &Desktop{home: t.TempDir()}
	d.set(phaseNeedsSetup, "config missing", "")
	if got := d.snapshot(); got.URL != "" {
		t.Fatalf("a page that is not ready must not hand out a URL, got %q", got.URL)
	}
	d.mu.Lock()
	d.state.Phase = phaseReady
	d.state.URL = "http://127.0.0.1:3737/console"
	d.mu.Unlock()
	if got := d.snapshot(); got.URL != "http://127.0.0.1:3737/console" {
		t.Fatalf("a ready page keeps its URL, got %q", got.URL)
	}
}

// The installer is the published one-line command for this platform, never a
// second copy of the install logic.
func TestInstallerCommand(t *testing.T) {
	command := installerCommand()
	if command == "" {
		t.Fatal("every platform answers with an installer command")
	}
	if want := "ovrelease.tos-cn-beijing.volces.com/superagent"; !strings.Contains(command, want) {
		t.Fatalf("installer must come from the published tree %q, got %q", want, command)
	}
}

func TestExcerptKeepsTheTail(t *testing.T) {
	output := ""
	for i := 0; i < 30; i++ {
		output += "line\n"
	}
	output += "the reason\n"
	got := excerpt(output)
	if !strings.Contains(got, "the reason") {
		t.Fatalf("excerpt must keep the last line, got %q", got)
	}
	if n := len(strings.Split(strings.TrimSpace(got), "\n")); n > 12 {
		t.Fatalf("excerpt must stay short, got %d lines", n)
	}
}
