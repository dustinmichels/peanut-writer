# Windows version (`scripts/package.sh`, `scripts/release.sh`, `main.go`, `service.go`, `frontend/src`)

**Status: not doing this yet.** Peanut Writer stays Mac-only until Windows users actually ask for it. This file records
what a Windows version would take, so the work can start from here rather than from scratch.

The app builds for Windows (`build/windows`, pure-Go WebView2, no CGO) but has never shipped or been run there. Mac-only
assumptions run through the release scripts, the document package format, process spawning and the UI.

## Why not yet

The core carries over: Go, Typst, the `.docx` writer, Vue and CodeMirror all run on Windows, and most items below are
small. The cost is in three places that don't go away:

- **`.peanut` packages are a Mac idea.** They rely on Finder showing a folder as one file. On Windows a package is a
  plain folder the user opens through the `.md` inside it (step 3 works around this, but users would notice). The real
  fix, a single-file format such as a zip, would change the Mac app's storage too.
- **Upkeep, not a one-off.** Development happens on a Mac. Every later change to files, shortcuts, the title bar,
  fonts or updates would need checking on Windows, which only a VM and CI would catch. The code assumes the Mac in many
  places ("Finder", ⌘, the window buttons, the `.app`-based updater), and new features will tend to add more.
- **Signing costs money.** Unsigned builds show a SmartScreen warning that puts off ordinary users; removing it means a
  yearly signing cost.

## When to revisit

1. If unsure there's demand, first try a small test: step 1 (build and install) and the console-window fix from step 2,
   then use it in a Windows VM for an hour. Don't publish it. That shows whether the packages and the overall feel are
   acceptable before committing to the rest.
2. If committing, decide the package format before anything else. Every other step (file types, Open dialog, updater,
   docs) depends on it, and it's the costly one to undo.

Worth doing anyway, independent of Windows: block reserved names (`CON`, `NUL`, …) and trailing dots in `safeFileName`
(step 3). It's a few lines, harmless on the Mac, and matters for files synced to Windows through Dropbox or OneDrive.

## The plan

Work in the order below: each step has a check that proves it, and later steps assume earlier ones.

### Decisions to make first

| Question           | Recommended                                                                                     | Why                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Format             | NSIS installer, per-user (`INSTALL_SCOPE=user`)                                                 | No admin prompt; installs WebView2 if missing; can register file types and an uninstaller. MSIX needs a signed package to install at all.              |
| Architectures      | amd64 and arm64, one installer each                                                             | Typst ships both (`x86_64-pc-windows-msvc`, `aarch64-pc-windows-msvc`); NSIS can't hold both in one `.exe` without doubling it.                        |
| Signing            | Unsigned at first, release notes explain SmartScreen; then Azure Trusted Signing                | A certificate is a yearly cost; Trusted Signing is the cheapest route to no "unknown publisher" warning, and `jsign` can call it from macOS.           |
| Where to build     | Cross-compile on the Mac in `scripts/package.sh` (`CGO_ENABLED=0`, `makensis` from Homebrew)    | One `mise run release` keeps publishing atomic. CI on `windows-latest` runs tests and a smoke build but doesn't publish.                               |
| `.peanut` packages | Keep packages; open them by their `Name.md`, register `.md` and the folder verb (see step 3)    | Windows can't show a folder as one file or associate a folder extension, so a package is a plain folder in Explorer and the Open dialog can't pick it. |
| Title bar          | Frameless window, custom title bar keeps drag area, adds minimise/maximise/close on the right   | The native frame plus the page's title bar is two title bars; the page reserves 84px for traffic lights that aren't there.                             |
| Updates            | Phase 2: same updater, Windows asset `Peanut-Writer-Windows-<arch>.zip` of the installed folder | Wails' updater swaps a folder; the installer is for first install. Until then, check and offer the release page only.                                  |

### 1. Builds and runs (`scripts/package.sh`, `build/windows`)

- `package.sh` dies off macOS and builds only the `.app`. Add a Windows stage after the Mac one: for each arch,
  `GOOS=windows CGO_ENABLED=0 go build -tags production -trimpath -ldflags "-w -s -H windowsgui -X main.buildVersion=…"`
  after `wails3 generate syso` (icon, manifest, `info.json` version). The build Taskfile lacks `-X main.buildVersion`,
  so call `go build` directly as the Mac stage does.
- Typst: download `typst-<triple>.zip` (not `.tar.xz`) for both Windows triples into the same `bin/typst` cache, unzip
  `typst.exe` beside `Peanut Writer.exe`, copy `LICENSE`/`NOTICE` to `licenses/typst/`.
- `build/windows/info.json` and the NSIS defines carry `0.0.1` from `build/config.yml`; set the file and product version
  from the release tag (numeric, as `bundle_version` does for the plist).
- `project.nsi`: install the exe, `typst.exe` and licenses; Start menu shortcut; uninstaller removes them but never the
  user's documents, `%APPDATA%\peanut-writer` settings, or templates.
- WebView2: the installer runs the bootstrapper (`wails3 generate webview2bootstrapper`) when the runtime is missing
  (Windows 10 without Edge updates).
- Check: on a clean Windows 11 VM (amd64) and a Windows on ARM VM, install, launch from Start, open the welcome document,
  preview renders, export PDF/Word/HTML, uninstall leaves no files behind in Program Files/AppData\Local\Programs.

### 2. Spawned programs don't flash consoles (`internal/render`, `internal/mdfmt`, `service.go`)

- A `-H windowsgui` process starting a console program (`typst.exe`, `node`/`oxfmt`) opens a console window for each
  run: every preview refresh would flash one. Set `SysProcAttr{HideWindow: true, CreationFlags: CREATE_NO_WINDOW}` on
  Windows through one helper in a `_windows.go` file (no-op elsewhere) used by every `exec.Command*` in `render.go`
  and `mdfmt.go`.
- Typst lookup (`render.Find`): beside the exe works for the installed app. Add Windows fallbacks after `PATH`:
  `%LOCALAPPDATA%\Programs\typst`, winget's `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Typst.Typst_*\typst-*\typst.exe`,
  `%USERPROFILE%\.cargo\bin\typst.exe`, mise's `%LOCALAPPDATA%\mise\installs\typst\*`. The error message says
  `brew install typst`; give the Windows one (`winget install Typst.Typst`).
- oxfmt (`mdfmt.Find`): npm installs `oxfmt.cmd` (and a shell script), not `oxfmt.exe`, under `%APPDATA%\npm`;
  `LookPath("oxfmt.exe")` misses it and Go can't exec a `.cmd` directly. Look for `oxfmt.cmd`, run it through
  `cmd.exe /c`, and add `%APPDATA%\npm` and `%ProgramFiles%\nodejs\node.exe` to the candidates. Auto format is opt-in, so
  this can follow step 1, but the setting must say why it can't run rather than fail silently.
- Check: with the installed app, type for a minute with the preview open — no console window appears; turn on auto format
  with Node and `npm i -g oxfmt` installed and save.

### 3. Documents, files and paths (`service.go`, `main.go`, `frontend/src/lib/actions/`)

- Open dialog: `AddFilter("Documents", "*.peanut;*.md;…")` can't select a `.peanut` folder on Windows; double-clicking
  it navigates in. `OpenPath` already accepts the package's `Name.md` (`docFile`), so: on Windows, filter `*.md;*.markdown;*.txt`
  and say in the dialog title that a package opens by its `.md`. Recent files and drag-drop already pass paths through
  `docFile`; confirm a dropped `.peanut` folder opens.
- Explorer: register `.md` (open with Peanut Writer, not default) in the installer, and a `Directory\shell` verb
  "Open in Peanut Writer" limited to folders named `*.peanut` (`AppliesTo` `System.ItemNameDisplay:~>".peanut"`). Optional
  `desktop.ini` with the peanut icon in new packages so they look like documents. `FileAssociations` in `main.go` only
  matters on macOS.
- Second instance: `OnSecondInstanceLaunch` only focuses the window and drops `SecondInstanceData.Args`, so opening a
  document from Explorer while the app runs does nothing. Pass the first file argument to `docs.openedWithFile`.
  First launch: confirm Wails emits `ApplicationOpenedWithFile` for an argv path on Windows; if not, read `os.Args`.
- Reveal: `explorer /select, <path>` — Go quotes the path as its own argument; check it selects paths with spaces and
  non-ASCII names (if not, set `SysProcAttr.CmdLine` to `explorer /select,"<path>"`).
- File names (`safeFileName`): also replace control characters, strip trailing dots and spaces, and avoid reserved names
  (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`9`, `LPT1`–`9`, with any extension) — a document titled "Con" gets a package
  name Windows may refuse.
- Paths in the editor: `actions.ts` splits on `/` for toast names (`path.split("/").pop()`); use a `/`-or-`\` basename
  (as `packageOf` already does). Check every place the frontend takes a path apart.
- Atomic save and versions (`atomicfile`, `versions`): `os.Rename` over a file fails with "access denied" while another
  program (Word on the synced `.docx`, Dropbox, antivirus) holds it open. Retry briefly, then report which file is busy;
  the synced PDF/Word copies are the likely victims.
- Line endings: `doc.Parse` and `mdfmt` cope with CRLF; CodeMirror turns them into LF, so a CRLF file opened and saved
  becomes LF. Accept that (Markdown tools don't care); check a CRLF file with front matter opens with its properties.
- Check: a Go test for `safeFileName` reserved names (meaningful: saving fails otherwise); manual runs on the VM for
  the rest.

### 4. Window, menus and shortcuts (`main.go`, `frontend/src/components`, `frontend/src/lib/commands.ts`)

- Window: `MacTitleBarHiddenInset` has no Windows equivalent; set `Frameless: true` under `Windows:` and, on Windows,
  drop the 84px traffic-light padding in `TitleBar.vue` and add minimise/maximise/close (`Window.Minimise`,
  `ToggleMaximise`, `Close`), keeping `--wails-draggable`. Double-click on the drag area should maximise. Check snap
  layouts (hover on maximise) and that resizing still works on the frameless edges.
- Menu: Windows shows the Wails menu as a menu bar inside the window, above the ribbon. The accelerators need it. Either
  keep it (simplest) or hide it and handle the shortcuts in the page. The Mac app-menu roles (`AppMenu`, `ServicesMenu`,
  `Hide`, `HideOthers`, `UnHide`) and `WindowMenu` don't belong there: on Windows put Exit in File, About and Check for
  Updates in Help.
- Shortcut labels: tooltips, the command palette and the cheat sheet hard-code `⌘ ⇧ ⌥` (`ribbon/Ribbon*.vue`, `TitleBar.vue`,
  `StatusBar.vue`, `EditorPane.vue`, `commands.ts`, `CheatSheet.vue`, `SettingsDialog.vue`). Add one formatter
  (`⌘S` on Mac, `Ctrl+S` elsewhere) and write shortcuts once in a neutral form. CodeMirror keymaps using `Mod-` already
  map to Ctrl; check the `⌥⌘1`-style heading shortcuts don't collide with AltGr on European keyboards (Ctrl+Alt = AltGr).
- Words: "Finder" appears in toasts, tooltips and the command palette ("Show in Finder", `lib/actions/`, `TitleBar.vue`,
  `VersionsPane.vue`, `TemplatesDialog.vue`); say "Show in Explorer" on Windows (one helper with the shortcut formatter).
- Spellcheck: `spellcheck_other.go` assumes WebView2 checks spelling where `spellcheck="true"`; confirm in the editor.
- Fonts in the UI: check the CSS font stacks have a Windows face (Segoe UI) before falling back to a serif default.

### 5. Templates and fonts (`internal/templates/builtin`)

Typst only embeds Libertinus Serif, New Computer Modern and DejaVu Sans Mono, so a template whose fallbacks are all
Mac fonts renders in Libertinus Serif on Windows with a font warning.

- Sans stacks with no Windows font: `peanut` (Avenir Next, Nunito, Helvetica Neue, Libertinus Sans, DejaVu Sans),
  `editorial` headings (Avenir Next, Avenir, Helvetica Neue, …). Add `Segoe UI` before the Libertinus fallbacks.
- `elegant` falls back through Garamond (only with Office) and `Palatino` (Windows names it `Palatino Linotype`); add it.
- Monospace everywhere is Menlo → DejaVu Sans Mono (embedded, fine); add `Consolas` first-after-Menlo to match Word.
- Word: `template.json` fonts (`Menlo`, `Avenir Next`, `Optima`, `Hoefler Text`, `Helvetica Neue`, `PT Sans`) are substituted silently by Word on
  Windows. Decide per template whether `DocxStyle` gets a Windows-safe font or stays as designed.
- Check: `typst fonts` on the Windows VM, then render every built-in template's sample and look for the font warning in the
  preview's notes.

### 6. Release, updates and CI (`scripts/release.sh`, `update.go`, `.github/workflows`)

- `release.sh`: the Mac checks stay; add preflight for `makensis` (and the signing tool once signing is decided), require
  the Windows assets after packaging, attach them.
- Asset names, versionless like the Mac ones so `releases/latest/download/<name>` links work:
  `Peanut-Writer-Setup-x64.exe`, `Peanut-Writer-Setup-arm64.exe` (later the updater zips). Add them to `checksums.txt`.
  Don't rename `Peanut-Writer.zip`: the Mac updater looks for it by name (`updateAsset`).
- `update.go`: `startUpdates` returns nil off macOS and `appBundle`/`whyNotReplaceable`/`removeAbandoned` assume a `.app`.
  First, on Windows, check and offer the release page (Update opens the installer download). Then, if in-place updates
  are wanted, pick the asset by `runtime.GOOS`/`GOARCH` in `AssetMatcher` and replace the install folder (per-user install
  makes it writable). The app menu with Check for Updates… is Mac-only (`menu`); put it in Help on Windows.
- CI: add a workflow on `windows-latest` that runs `go test ./internal/...` (with Typst from `mise`) and
  `GOOS=windows go build` on every push. Nothing tests Windows today, so path, line-ending and rename bugs would ship.
  Check for tests that hard-code `/` in expected paths.
- Build-time line endings: no `.gitattributes`; a Windows checkout with `core.autocrlf=true` embeds CRLF templates and
  starter documents and may break golden-file tests. Add `* text=auto eol=lf`.
- Winget: once releases are stable, a winget manifest (as the Homebrew cask is for Mac) via `wingetcreate` in
  `release.sh`.

### 7. Docs

- `docs/guide/introduction.md`: Windows download, the SmartScreen "More info → Run anyway" step while unsigned, and how
  `.peanut` packages look in Explorer (a folder; open its `.md`).
- `docs/reference/development.md`: Windows build and release prerequisites (`makensis`, signing); `mise.toml`
  descriptions of `package`, `release:package` and `release` (they say Mac only); `docs/reference/shortcuts.md` with Ctrl.
