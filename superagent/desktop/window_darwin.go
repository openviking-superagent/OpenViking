// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

//go:build darwin && cgo

package main

import webview "github.com/webview/webview_go"

// runWindow shows the shell page in the system's WKWebView through the shared
// webview binding: no bundled browser engine, the same view Safari uses.
func runWindow(url string) {
	w := webview.New(true)
	if w == nil {
		return
	}
	defer w.Destroy()
	w.SetTitle("OpenViking SuperAgent")
	w.SetSize(1280, 860, webview.HintNone)
	w.Navigate(url)
	w.Run()
}
