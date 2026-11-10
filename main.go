package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// The built editor, embedded into the binary.
//
//go:embed all:frontend/dist
var assets embed.FS

func main() {
	docs := newDocService()
	app := application.New(application.Options{
		Name:        "Peanut Writer",
		Description: "A friendly writer for documents with figures, tables and cross-references",
		Services:    []application.Service{application.NewService(docs)},
		Assets:      application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		Mac:         application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
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
	app.Menu.Set(menu(app))

	docs.window = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "Peanut Writer",
		Width:     1440,
		Height:    900,
		MinWidth:  960,
		MinHeight: 600,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 44,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(251, 247, 241),
		URL:              "/",
	})
	// Closing the window quits; with unsaved changes the editor asks first.
	docs.window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		if !docs.shouldClose() {
			e.Cancel()
		}
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

// menu builds the menu bar. File and Edit commands go to the editor as
// "menu" events, so they act on its state (and its undo history).
func menu(app *application.App) *application.Menu {
	send := func(action string) func(*application.Context) {
		return func(*application.Context) { app.Event.Emit("menu", action) }
	}
	m := app.Menu.New()
	m.AddRole(application.AppMenu)

	file := m.AddSubmenu("File")
	file.Add("New").SetAccelerator("CmdOrCtrl+N").OnClick(send("new"))
	file.Add("Open…").SetAccelerator("CmdOrCtrl+O").OnClick(send("open"))
	file.AddSeparator()
	file.Add("Save").SetAccelerator("CmdOrCtrl+S").OnClick(send("save"))
	file.Add("Save As…").SetAccelerator("CmdOrCtrl+Shift+S").OnClick(send("saveAs"))
	file.AddSeparator()
	file.Add("Export as PDF…").SetAccelerator("CmdOrCtrl+E").OnClick(send("exportPdf"))
	file.Add("Export as Word…").SetAccelerator("CmdOrCtrl+Shift+E").OnClick(send("exportDocx"))

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

	m.AddRole(application.WindowMenu)
	help := m.AddSubmenu("Help")
	help.Add("Welcome Guide").OnClick(send("welcome"))
	help.Add("Markdown Cheat Sheet").OnClick(send("cheatsheet"))
	return m
}
