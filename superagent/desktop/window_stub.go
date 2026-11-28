// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

//go:build !cgo && !windows

package main

import "fmt"

// A build without cgo has no system webview. The shell still runs its checks
// and its local page, which is enough for tests and for a headless machine;
// opening a window says why it cannot.
func runWindow(url string) {
	fmt.Printf("ovsa-desktop: this build has no system webview; open %s\n", url)
	select {}
}
