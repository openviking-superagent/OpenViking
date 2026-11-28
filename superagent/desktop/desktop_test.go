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

// The published tree is the default, and an explicit variable wins so a
// mirror or a test can answer instead.
func TestDownloadBase(t *testing.T) {
	t.Setenv("OV_SUPERAGENT_DOWNLOAD_BASE", "")
	if got := base(); !strings.Contains(got, "ovrelease.tos-cn-beijing.volces.com/superagent") {
		t.Fatalf("default download base must be the published tree, got %q", got)
	}
	t.Setenv("OV_SUPERAGENT_DOWNLOAD_BASE", "http://127.0.0.1:9/mirror/")
	if got := base(); got != "http://127.0.0.1:9/mirror" {
		t.Fatalf("an explicit base must win and lose its trailing slash, got %q", got)
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
