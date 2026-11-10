package main

import (
	"embed"
	"log"
	"regexp"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// The built editor, embedded into the binary.
//
//go:embed all:frontend/dist
var assets embed.FS

// The build settings the app's bundle info is generated from, for its version.
//
//go:embed build/config.yml
var buildConfig string

// appVersion is the app's version (build/config.yml's info.version).
var appVersion = func() string {
	m := regexp.MustCompile(`(?m)^[ \t]+version:[ \t]*"?([^"\s#]+)`).FindStringSubmatch(buildConfig)
	if m == nil {
		panic("no info.version in build/config.yml")
	}
	return m[1]
}()

func main() {
	docs := newDocService()
	app := application.New(application.Options{
		Name:        "Peanut Writer",
		Description: "A friendly writer for documents with figures, tables and cross-references",
		Services:    []application.Service{application.NewService(docs)},
		Assets:      application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		Mac:         application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
		// Documents opened from the file manager or the command line.
		FileAssociations: []string{packageExt},
		ShouldQuit:  docs.shouldClose,
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "com.dustinmichels.peanutwriter",
			OnSecondInstanceLaunch: func(application.SecondInstanceData) {
				if docs.window != nil {
					docs.window.UnMinimise()
					docs.window.Focus()
				}
			},
		},
	})
	docs.app = app
	app.Event.OnApplicationEvent(events.Common.ApplicationOpenedWithFile, func(e *application.ApplicationEvent) {
		docs.openedWithFile(e.Context().Filename())
	})
	app.Menu.Set(menu(app, docs))

	docs.window = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "Peanut Writer",
		Width:     1440,
		Height:    900,
		MinWidth:  960,
		MinHeight: 600,
		// The title bar's drag area comes from --wails-draggable in the page
		// (TitleBar.vue). A native InvisibleTitleBarHeight drag area on top of
		// it would start a window drag on every click there, swallowing the
		// mouse-up the page needs to finish clicks.
		Mac: application.MacWindow{TitleBar: application.MacTitleBarHiddenInset},
		// Files dropped on a data-file-drop-target element arrive as
		// WindowFilesDropped (the webview's own drop events never see them).
		EnableFileDrop:   true,
		BackgroundColour: application.NewRGB(251, 247, 241),
		URL:              "/",
	})
	// Closing the window quits; with unsaved changes the editor asks first.
	docs.window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		if !docs.shouldClose() {
			e.Cancel()
		}
	})
	// Pictures dropped on the editor become figures where they land.
	docs.window.OnWindowEvent(events.Common.WindowFilesDropped, func(e *application.WindowEvent) {
		drop := map[string]any{"paths": e.Context().DroppedFiles()}
		if t := e.Context().DropTargetDetails(); t != nil {
			drop["x"], drop["y"] = t.X, t.Y
		}
		app.Event.Emit("filesDropped", drop)
	})
	enableSpellcheck(docs.window)

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

// menu builds the menu bar. File and Edit commands go to the editor as
// "menu" events, so they act on its state (and its undo history).
func menu(app *application.App, docs *DocService) *application.Menu {
	send := func(action string) func(*application.Context) {
		return func(*application.Context) { app.Event.Emit("menu", action) }
	}
	m := app.Menu.New()
	m.AddRole(application.AppMenu)

	file := m.AddSubmenu("File")
	file.Add("New").SetAccelerator("CmdOrCtrl+N").OnClick(send("new"))
	file.Add("Open…").SetAccelerator("CmdOrCtrl+O").OnClick(send("open"))
	file.Add("Open Recent…").SetAccelerator("CmdOrCtrl+Shift+O").OnClick(send("recent"))
	docs.menu, docs.recentMenu = m, file.AddSubmenu("Open Recent")
	docs.fillRecentMenu()
	file.AddSeparator()
	file.Add("Save").SetAccelerator("CmdOrCtrl+S").OnClick(send("save"))
	file.Add("Save As…").SetAccelerator("CmdOrCtrl+Shift+S").OnClick(send("saveAs"))
	file.AddSeparator()
	file.Add("Export as PDF…").SetAccelerator("CmdOrCtrl+E").OnClick(send("exportPdf"))
	file.Add("Export as Word…").SetAccelerator("CmdOrCtrl+Shift+E").OnClick(send("exportDocx"))
	file.Add("Sync Files").SetAccelerator("CmdOrCtrl+Shift+Y").OnClick(send("syncFiles"))
	file.AddSeparator()
	file.Add("Settings…").SetAccelerator("CmdOrCtrl+,").OnClick(send("settings"))

	edit := m.AddSubmenu("Edit")
	edit.Add("Undo").SetAccelerator("CmdOrCtrl+Z").OnClick(send("undo"))
	edit.Add("Redo").SetAccelerator("CmdOrCtrl+Shift+Z").OnClick(send("redo"))
	edit.AddSeparator()
	edit.AddRole(application.Cut)
	edit.AddRole(application.Copy)
	edit.AddRole(application.Paste)
	edit.AddRole(application.SelectAll)
	edit.AddSeparator()
	edit.Add("Find…").SetAccelerator("CmdOrCtrl+F").OnClick(send("find"))

	view := m.AddSubmenu("View")
	view.Add("Zoom In").SetAccelerator("CmdOrCtrl+=").OnClick(send("zoomIn"))
	view.Add("Zoom Out").SetAccelerator("CmdOrCtrl+-").OnClick(send("zoomOut"))
	view.Add("Actual Size").SetAccelerator("CmdOrCtrl+0").OnClick(send("zoomReset"))
	view.AddSeparator()
	view.Add("Show Markdown").SetAccelerator("CmdOrCtrl+/").OnClick(send("markdown"))
	view.Add("Outline").OnClick(send("outline"))
	view.Add("Versions").OnClick(send("versions"))
	view.AddSeparator()
	view.Add("Command Palette…").SetAccelerator("CmdOrCtrl+Shift+P").OnClick(send("commands"))

	m.AddRole(application.WindowMenu)
	help := m.AddSubmenu("Help")
	help.Add("Welcome Guide").OnClick(send("welcome"))
	help.Add("Markdown Cheat Sheet").OnClick(send("cheatsheet"))
	help.Add("Documentation").OnClick(send("docs"))
	help.AddSeparator()
	help.Add("About Peanut Writer").OnClick(send("about"))
	return m
}
