// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

//go:build linux && cgo && !webkit40

package main

/*
#cgo pkg-config: gtk+-3.0 webkit2gtk-4.1
#include "webkit_window.h"
*/
import "C"

import "unsafe"

// runWindow shows the shell page in WebKitGTK 4.1, the engine current
// distributions ship.
func runWindow(url string) {
	target := C.CString(url)
	defer C.free(unsafe.Pointer(target))
	C.ovsa_open_window(target)
}
