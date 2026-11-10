package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation
#import <Foundation/Foundation.h>

// WebKit underlines misspellings only when this default is on; Safari sets
// it for itself, but a bare WKWebView app reads it as off. Registering it
// (rather than writing it) leaves the user's own choice in charge.
static void registerSpellcheckDefault(void) {
	[[NSUserDefaults standardUserDefaults] registerDefaults:@{
		@"WebContinuousSpellCheckingEnabled": @YES,
	}];
}
*/
import "C"

// The editor asks for spell checking (spellcheck="true"); on macOS WebKit
// honors it only with continuous spell checking on, so turn it on before the
// webview reads it.
func init() { C.registerSpellcheckDefault() }
