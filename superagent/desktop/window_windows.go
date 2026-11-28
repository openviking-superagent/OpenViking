// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

//go:build windows

package main

import (
	"os"

	webview2 "github.com/jchv/go-webview2"
)

// runWindow shows the shell page in the system's WebView2, the engine Windows
// 10/11 already ships. The shell keeps running while the window is open; the
// window is the only thing it owns.
func runWindow(url string) {
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{
			Title:  "OpenViking SuperAgent",
			Width:  1280,
			Height: 860,
			Center: true,
		},
	})
	if w == nil {
		// Windows 10 without the WebView2 runtime: the shell page still works in
		// the default browser, so the console is reachable and the shell says why.
		os.Stderr.WriteString("ovsa-desktop: WebView2 runtime is not available; opening the default browser\n")
		_ = openBrowser(url)
		select {}
	}
	defer w.Destroy()
	w.Navigate(url)
	w.Run()
}
