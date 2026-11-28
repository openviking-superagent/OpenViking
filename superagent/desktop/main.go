// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

// ovsa-desktop is the desktop shell for OpenViking SuperAgent: one window that
// shows the console of the instance installed on this machine, and a first-run
// path that installs the runtime and runs its setup when it is missing.
//
// The shell owns no agent state. It reads ~/.ov-superagent (or OV_SUPERAGENT_HOME),
// starts the installed release through the same `ov-superagent` command a terminal
// uses, and points the window at the loopback Web the release serves. Closing the
// window never stops an agent that was running before it opened.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	home := flag.String("home", "", "OpenViking SuperAgent home (default: $OV_SUPERAGENT_HOME, else ~/.ov-superagent)")
	url := flag.String("url", "", "open this URL instead of starting and showing the console")
	noStart := flag.Bool("no-start", false, "do not start the installed release; only show what is already running")
	flag.Parse()

	if os.Getenv("OV_SUPERAGENT_HOME") == "" && *home != "" {
		_ = os.Setenv("OV_SUPERAGENT_HOME", *home)
	}

	d, err := newDesktop(desktopOptions{URL: *url, NoStart: *noStart})
	if err != nil {
		fmt.Fprintf(os.Stderr, "ovsa-desktop: %v\n", err)
		os.Exit(1)
	}
	d.logf("desktop starting: home=%s url=%q", d.home, d.target)
	runWindow(d.adminURL)
	d.stop()
}

// logPath is where the shell keeps its own lines, apart from the release's logs.
func logPath(home string) string {
	return filepath.Join(home, "logs", "desktop.log")
}
