package main

// Updates. Releases are published on GitHub by scripts/release.sh. Builds of a
// release check there at launch and then daily while open, silently unless
// there is a newer release; Check for Updates… in the app menu also says when
// there is none or the check failed. Nothing is downloaded without asking: the
// prompt offers Update, Later and Release Notes. Update opens Wails' update
// window, which downloads Peanut-Writer.zip, checks it against the release's
// checksums.txt, and offers Restart & Apply: that swaps the new app in for this
// one and reopens it. A copy that can't replace itself (opened from the disk
// image, or in a folder the user can't change) offers to download the disk
// image instead.

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

const (
	releaseRepo = "dustinmichels/peanut-writer"
	// updateAsset holds the app alone (scripts/package.sh).
	updateAsset = "Peanut-Writer.zip"
	// diskImageURL is the newest release's disk image.
	diskImageURL        = "https://github.com/" + releaseRepo + "/releases/latest/download/Peanut-Writer.dmg"
	updateCheckInterval = 24 * time.Hour
)

var releaseTag = regexp.MustCompile(`^v[0-9]+\.[0-9]+\.[0-9]+$`)

// releaseVersion is buildVersion without its "v" (1.2.3) in builds of a
// release, and "" in development builds, which never look for updates.
func releaseVersion() string {
	if !releaseTag.MatchString(buildVersion) {
		return ""
	}
	return buildVersion[1:]
}

// updates offers newer releases of the app.
type updates struct {
	app  *application.App
	docs *DocService // for the window the prompts attach to
	// busy is set from a check until its prompt is answered, so checks never
	// stack prompts.
	busy atomic.Bool
}

// startUpdates sets up app.Updater in builds of a release on macOS, and checks
// once the app has started and daily after. It returns nil when it doesn't.
func startUpdates(app *application.App, docs *DocService) *updates {
	version := releaseVersion()
	if version == "" || runtime.GOOS != "darwin" {
		return nil
	}
	src, err := github.New(github.Config{
		Repository:    releaseRepo,
		ChecksumAsset: "checksums.txt",
		AssetMatcher: func(_ updater.CheckRequest, assets []github.ReleaseAsset) int {
			return slices.IndexFunc(assets, func(a github.ReleaseAsset) bool { return a.Name == updateAsset })
		},
	})
	if err == nil {
		err = app.Updater.Init(updater.Config{CurrentVersion: version, Providers: []updater.Provider{src}})
	}
	if err != nil {
		log.Printf("updates: %v", err)
		return nil
	}
	u := &updates{app: app, docs: docs}
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		go func() {
			u.removeAbandoned()
			for {
				u.check(false)
				time.Sleep(updateCheckInterval)
			}
		}()
	})
	return u
}

// check asks GitHub for a newer release and offers it. Unless asked (Check
// for Updates…), it stays silent when there is none or the check fails.
func (u *updates) check(asked bool) {
	switch u.app.Updater.State() {
	case updater.StateDownloading, updater.StateVerifying, updater.StateInstalling:
		return // the update window is showing it
	}
	if !u.busy.CompareAndSwap(false, true) {
		return
	}
	defer u.busy.Store(false)
	if asked {
		u.app.Updater.SkipVersion("") // the update window's Skip lasts until asked
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	rel, err := u.app.Updater.Check(ctx)
	cancel()
	current := u.app.Updater.CurrentVersion()
	switch {
	case err != nil:
		log.Printf("checking for updates: %v", err)
		if asked {
			u.ask(u.app.Dialog.Warning(), "Couldn’t check for updates", err.Error(), "OK")
		}
	case rel == nil:
		if asked {
			u.ask(u.app.Dialog.Info(), appName+" is up to date", "Version "+current+" is the newest version.", "OK")
		}
	default:
		u.offer(rel, current)
	}
}

// offer asks whether to update to rel.
func (u *updates) offer(rel *updater.Release, current string) {
	title := fmt.Sprintf("%s %s is available", appName, rel.Version)
	msg := "You have version " + current + ". "
	if why := whyNotReplaceable(); why != "" {
		msg += why + " Download gets the new version’s disk image: open it, drag " + appName +
			" onto Applications and choose Replace."
		switch u.ask(u.app.Dialog.Question(), title, msg, "Download", "Later", "Release Notes") {
		case "Download":
			u.open(diskImageURL)
		case "Release Notes":
			u.open(releasePage(rel))
		}
		return
	}
	msg += "Update downloads it, then Restart & Apply replaces this copy and reopens " + appName +
		". Your documents aren’t touched."
	switch u.ask(u.app.Dialog.Question(), title, msg, "Update", "Later", "Release Notes") {
	case "Update":
		go func() {
			if err := u.app.Updater.CheckAndInstall(context.Background()); err != nil {
				log.Printf("updating: %v", err)
			}
		}()
	case "Release Notes":
		u.open(releasePage(rel))
	}
}

// ask shows d over the app window with buttons, the first the default and the
// second (if any) the one Escape presses, and returns the label clicked.
func (u *updates) ask(d *application.MessageDialog, title, msg string, buttons ...string) string {
	clicked := make(chan string, 1)
	d.SetTitle(title).SetMessage(msg)
	if u.docs.window != nil {
		d.AttachToWindow(u.docs.window)
	}
	// Added left to right, so the default ends up rightmost.
	for i := len(buttons) - 1; i >= 0; i-- {
		label := buttons[i]
		b := d.AddButton(label).OnClick(func() { clicked <- label })
		switch i {
		case 0:
			b.SetAsDefault()
		case 1:
			b.SetAsCancel()
		}
	}
	d.Show()
	return <-clicked
}

func (u *updates) open(url string) {
	if err := u.app.Browser.OpenURL(url); err != nil {
		log.Printf("opening %s: %v", url, err)
	}
}

// releasePage is the GitHub page of rel.
func releasePage(rel *updater.Release) string {
	if u, ok := rel.Metadata["github.release.htmlURL"].(string); ok {
		return u
	}
	return "https://github.com/" + releaseRepo + "/releases/latest"
}

// appBundle is the .app this runs from.
func appBundle() (string, error) {
	exe, err := os.Executable()
	if err == nil {
		exe, err = filepath.EvalSymlinks(exe)
	}
	if err != nil {
		return "", err
	}
	bundle := filepath.Dir(filepath.Dir(filepath.Dir(exe)))
	if filepath.Base(filepath.Dir(exe)) != "MacOS" || filepath.Ext(bundle) != ".app" {
		return "", errors.New("not in an app bundle")
	}
	return bundle, nil
}

// whyNotReplaceable says why this copy can't update in place, or "" if it can.
// The updater downloads into the app's folder and swaps the app there, so the
// folder must be one the user can change. An app opened from the disk image,
// or from Downloads before it was moved (macOS then runs it from a read-only
// copy), is in one they can't.
func whyNotReplaceable() string {
	bundle, err := appBundle()
	if err != nil {
		return "This copy can’t update itself."
	}
	probe, err := os.MkdirTemp(filepath.Dir(bundle), ".update-probe-*")
	if err != nil {
		return "This copy can’t update itself where it is; it needs to be in Applications."
	}
	os.Remove(probe)
	return ""
}

// removeAbandoned deletes updates downloaded beside the app but never applied
// (the update window closed without Restart & Apply), which would otherwise
// sit in Applications as a second copy of the app.
func (u *updates) removeAbandoned() {
	bundle, err := appBundle()
	if err != nil {
		return
	}
	staged, _ := filepath.Glob(filepath.Join(filepath.Dir(bundle), "wails-update-*", filepath.Base(bundle)))
	for _, p := range staged {
		if err := os.RemoveAll(filepath.Dir(p)); err != nil {
			log.Printf("removing an abandoned update: %v", err)
		} else {
			log.Printf("removed an abandoned update: %s", filepath.Dir(p))
		}
	}
}
