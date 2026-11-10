package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework WebKit
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

// WebKit starts with continuous spell checking off, so spellcheck="true"
// draws nothing until it's switched on, and the only public switch,
// -toggleContinuousSpellChecking:, flips the state. Saving the default as off
// before any webview exists pins the starting state (WebKit currently ignores
// the default at launch, but would read this off if it ever honors it), so one
// toggle always lands on.
static void resetSpellcheckDefault(void) {
	[[NSUserDefaults standardUserDefaults] setBool:NO forKey:@"WebContinuousSpellCheckingEnabled"];
}

static WKWebView *findWebView(NSView *v) {
	if ([v isKindOfClass:[WKWebView class]]) return (WKWebView *)v;
	for (NSView *s in v.subviews) {
		WKWebView *w = findWebView(s);
		if (w) return w;
	}
	return nil;
}

static void toggleSpellcheck(void *window) {
	id wv = findWebView(((NSWindow *)window).contentView);
	if ([wv respondsToSelector:@selector(toggleContinuousSpellChecking:)]) [wv toggleContinuousSpellChecking:nil];
}
*/
import "C"

import (
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

func init() { C.resetSpellcheckDefault() }

// enableSpellcheck turns on WebKit's spell checking once the window's page
// has loaded. The state is app-wide and the switch is a toggle, so it runs
// once: a reload (as in dev mode) would otherwise turn it back off.
func enableSpellcheck(w *application.WebviewWindow) {
	var once sync.Once
	w.OnWindowEvent(events.Mac.WebViewDidFinishNavigation, func(*application.WindowEvent) {
		once.Do(func() {
			application.InvokeSync(func() {
				if p := w.NativeWindow(); p != nil {
					C.toggleSpellcheck(p)
				}
			})
		})
	})
}
