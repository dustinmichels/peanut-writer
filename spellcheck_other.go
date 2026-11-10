//go:build !darwin

package main

import "github.com/wailsapp/wails/v3/pkg/application"

// enableSpellcheck is macOS-only: WebView2 (Windows) already checks spelling
// where the editor sets spellcheck="true"; WebKitGTK (Linux) is not handled.
func enableSpellcheck(*application.WebviewWindow) {}
