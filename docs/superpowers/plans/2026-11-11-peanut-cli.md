# peanut-cli Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `peanut-cli` binary that renders, inspects and restyles Peanut Writer documents from the shell, and serves
the same commands as MCP tools.

**Architecture:** Move document-file logic from `service.go` into `internal/pipeline`, shared by app and CLI.
`internal/cli` defines each command once (`Def[A]`) and derives flags, `--json` output and MCP tools from its args
struct. `cmd/peanut-cli` is a thin main; packaging puts it beside the bundled Typst.

**Tech Stack:** Go 1.26, std-lib `flag`, `github.com/modelcontextprotocol/go-sdk` v1.8.0, Typst (existing).

**Spec:** `docs/superpowers/specs/2026-11-11-peanut-cli-core-design.md`

## Global Constraints

- No new dependency except `github.com/modelcontextprotocol/go-sdk v1.8.0` (and what it pulls in).
- Exit codes: 0 ok, 1 error, 2 usage.
- `--json` prints exactly one object on stdout: `{"ok":true,"result":…,"warnings":[…]}` or `{"ok":false,"error":"…"}`.
- JSON lists are `[]`, never `null`.
- Outputs via `atomicfile.Write`; refuse to write over the source document.
- App behavior unchanged by the `service.go` move.
- Only meaningful tests (AGENTS.md); Typst-needing tests skip when `render.Find` fails, as `render_test.go` does.
- Comments in the repo's style: full sentences saying what a thing is, no "Note:".

## Review Focus

1. Relative paths: `peanut-cli render doc.md out.pdf` from another directory must resolve both against the CWD, and
   pictures against the document's folder. Test in Task 4 runs the CLI with a different working directory.
2. A `.peanut` package as `<doc>`: `inspect Report.peanut` must find `Report.md` inside. Test in Task 4 uses a package.
3. Output in a folder that doesn't exist: `render` and `pages` create parent folders. Test in Task 4.
4. `--template custom` on a document without `Name.template.json`: clear error, not Default silently. Test in Task 1.
5. MCP relative path: tool call with a relative `doc` returns an error naming "absolute", not a file-not-found from
   the server's CWD. Test in Task 6.

---

### Task 1: `internal/pipeline`: paths, front matter, template choice

**Files:**
- Create: `internal/pipeline/files.go`, `internal/pipeline/frontmatter.go`, `internal/pipeline/load.go`
- Create: `internal/pipeline/pipeline_test.go`
- Modify: `service.go` (delete moved helpers; call `pipeline.*`)

**Interfaces:**
- Produces:
  - `const PackageExt = ".peanut"`
  - `func DocFile(p string) (string, error)`; `ShownPath`, `DocName`, `SafeFileName`, `CustomTemplatePath`,
    `SettingsPath(p string) string`; `func Sidecars(p string) []string`
  - `func WithoutBOM(s string) string`; `func FrontMatterValue(v string) string`;
    `func FillProperties(content, name, author string) string` (author passed in: `defaultAuthor` stays in the app)
  - `func SetFrontMatter(src, key, value string) string`
  - `func TemplateFor(c *templates.Custom, id string) templates.Template`
  - `type Doc struct { Path, Source string; Doc *doc.Document; Template templates.Template; Custom *templates.Custom }`
  - `func Load(path, override string) (*Doc, error)`

- [ ] **Step 1: Write failing tests**

`TestSetFrontMatter` (table): `""` + template=classic → `"---\ntemplate: classic\n---\n"`; `"---\ntitle: A\n---\n\nText"`
+ template → template line after title, body kept; existing `template: x` replaced in place; value `"a: b"` quoted;
an unknown extra line (`foo: 1`) kept. Each case also asserts `doc.Parse(out, "").Meta.Template == value`.

`TestLoadTemplateChoice` (temp dir): front matter `template: report` → `Template.ID == "report"`; override `classic`
beats it; `template: custom` with a `Name.template.json` (`{"base":"report","style":{"bodyFont":"Georgia"}}`) →
`ID == templates.CustomID`, `Docx.BodyFont == "Georgia"`; override `custom` without the json → error containing
`"no template of its own"`; override `nope` → error containing `"nope"`; a `Name.peanut` folder path loads its
`Name.md`.

- [ ] **Step 2: Run** `go test ./internal/pipeline/` → FAIL (package missing).

- [ ] **Step 3: Implement.** Move `docFile`, `shownPath`, `docName`, `safeFileName`, `customTemplatePath`,
  `documentSettingsPath`, `docSidecars`, `withoutBOM`, `frontMatterValue`, `fillProperties` verbatim (renamed,
  exported). `SetFrontMatter` follows `fillProperties`' fence handling and the editor's key order
  (`title subtitle author topic date header abstract template hide peanut-version`). `TemplateFor`: `templateFor`
  with the custom passed in. `Load` resolves the path with `filepath.Abs` before `DocFile`; an override other than
  `""`/`custom` must satisfy `templates.Get(id).ID == id`.

- [ ] **Step 4: Point `service.go` at them**; delete the originals. `s.templateFor(p, id)` becomes
  `readCustom` + `pipeline.TemplateFor`.

- [ ] **Step 5: Run** `go test ./internal/... && go vet .` → PASS.

- [ ] **Step 6: Commit** `pipeline: document paths, front matter and template choice`.

### Task 2: Rendering and document operations in `pipeline`; PNG pages in `render`

**Files:**
- Modify: `internal/render/render.go` (`PNG`; `PDF` returns warnings)
- Create: `internal/pipeline/render.go`, `internal/pipeline/ops.go`
- Modify: `service.go` (Export*, SyncFiles, SaveVersion, LoadVersion, NewDocument, Format, backup)
- Test: `internal/render/render_test.go`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `func (t *Typst) PDF(ctx, d, tpl) ([]byte, []string, error)`
  - `func (t *Typst) PNG(ctx, d *doc.Document, tpl templates.Template, ppi int, pages string) ([][]byte, []string, error)` (`pages == ""` means all)
  - `type Renderer struct{ Typst *render.Typst }` with
    `PDF(ctx, d, tpl) ([]byte, []string, error)`, `DOCX(ctx, d, tpl) ([]byte, error)`,
    `HTML(ctx, d, tpl, title string) []byte`, `PNG(ctx, d, tpl, ppi int, pages string) ([][]byte, []string, error)`
  - `func Backup(p string) error`
  - `func (r Renderer) SaveVersion(ctx, p, name string) (versions.Version, error)`
  - `func RestoreVersion(p, name string) (content string, err error)`
  - `func NewDocument(dir, name, author, appVersion string) (path string, err error)` (errors if `Name.md` exists)
  - `func Format(ctx, o *mdfmt.Oxfmt, src, headingCase string) (string, error)`

- [ ] **Step 1: Failing test** `TestPNGPages` in `render_test.go` (Typst-gated): a two-page doc
  (`"A\n\n\\pagebreak\n\nB\n"`) → 2 images, each starting with `"\x89PNG"`; `pages "2"` → 1 image.
- [ ] **Step 2: Run** `go test ./internal/render -run TestPNGPages` → FAIL.
- [ ] **Step 3: Implement `PNG`** like `Preview`, output `page-{0p}.png`, flags `--ppi`, and `--pages` when set.
  Change `PDF` to return `render`'s warnings; update callers.
- [ ] **Step 4: Implement `Renderer` and ops** by moving the bodies of `docxBytes`, `ExportHTML`'s equation hook,
  `backup` (lock stays in the app's wrapper), `SaveVersion`, `LoadVersion`'s backup+restore, `NewDocument`'s file
  writes, `Format`'s casing. `service.go` keeps dialogs, `SetDirty`, `remember`, `setOpen`, mutexes and the oxfmt
  cache and calls these.
- [ ] **Step 5: Run** `go test ./internal/... && go build .` → PASS (needs `frontend/dist`; run `mise run build` if
  missing).
- [ ] **Step 6: Manual app check** (`mise run dev`): Export PDF, Word, Web Page; Sync Files; New Version and open it;
  New Document; Auto format on save. All behave as before.
- [ ] **Step 7: Commit** `pipeline: rendering, versions, new document and format shared with the app`.

### Task 3: `internal/cli` framework and `cmd/peanut-cli`

**Files:**
- Create: `internal/cli/cli.go` (Main, dispatch, output, exit codes), `internal/cli/def.go` (Def, flag binding)
- Create: `cmd/peanut-cli/main.go`
- Modify: `go.mod`/`go.sum` (`go get github.com/modelcontextprotocol/go-sdk@v1.8.0`), `mise.toml` (`build` task also
  runs `go build -o bin/peanut-cli ./cmd/peanut-cli`)

**Interfaces:**
- Produces:
  - `type Env struct { Stdout, Stderr io.Writer; Dir string }` with `func (e *Env) Typst() (*render.Typst, error)`,
    `func (e *Env) Oxfmt() (*mdfmt.Oxfmt, error)` (found once, lazily), `func (e *Env) Abs(p string) string`
    (joins with `Dir`)
  - `type Command struct { Name, Summary string }` plus unexported closures built by `Def`: `parse(args []string)
    (any, error)`, `run(ctx, *Env, any) (any, []string, error)`, `addTool(*mcp.Server, *Env)`
  - `func Def[A any](name, summary string, run func(context.Context, *Env, *A) (any, []string, error)) Command`
  - `var commands []Command` (filled by Tasks 4–6 in `init` of their files via `register(...)`)
  - `func Main(args []string, env *Env) int`
  - `type UsageError struct{ msg string }` → exit 2
  - Text output: a result implementing `interface{ Text() string }` prints that; otherwise compact JSON.

- [ ] **Step 1: Failing test** `internal/cli/cli_test.go` `TestDef`: a test-local
  `Def[struct{ A string `arg:"0"`; N int `json:"n"` }]` run via unexported `runCommand(cmd, args, env)`:
  `["x", "--n", "3"]` binds `A == "x"`, `N == 3`; `[]` → exit 2 with stderr containing `usage:`;
  `Main(["--json", "bogus"])` → 2 and stdout parses as `{"ok":false,…}`; `Main(["--version"])` → 0.
- [ ] **Step 2: Run** `go test ./internal/cli` → FAIL.
- [ ] **Step 3: Implement.** Flag names: `json` tag → kebab (`bodyFont` → `body-font`). Supported field kinds:
  `string`, `int`, `float64`, `bool`, and an embedded struct (flattened, for `templates.Style`). `--json` is global,
  accepted anywhere. Command names may be two words (`templates list`): match longest prefix. The shortcut: first
  argument not a command name and two positionals → `render`. Help: `peanut-cli help [cmd]` lists commands/flags from
  `jsonschema` tags.
- [ ] **Step 4: Run** `go test ./internal/cli && go build -o bin/peanut-cli ./cmd/peanut-cli` → PASS.
- [ ] **Step 5: Commit** `cli: command table, flags, JSON output`.

### Task 4: `render`, `pages`, `inspect`

**Files:**
- Create: `internal/cli/render.go`, `internal/cli/inspect.go`
- Test: `internal/cli/cli_test.go`, fixture built in-test from `internal/doc/testdata/numbering/` samples

**Interfaces:**
- Consumes: Task 1 `Load`, Task 2 `Renderer`, Task 3 `Def`/`Env`.
- Produces: `type Inspection struct` matching the spec's JSON exactly (field tags `path meta template outline numbered references brokenReferences missingImages warnings typst`).

- [ ] **Step 1: Failing tests** (Typst-gated where marked):
  - `TestRenderFormats` (Typst): temp `Report.peanut/Report.md` with a figure on `pic.png` (write a 1×1 PNG);
    run with `env.Dir` = another temp dir and relative paths; `render Report.peanut out/r.pdf` → file starts `%PDF`,
    `out/` created; `r.docx` starts `PK`; `r.html` contains `<html`; `render Report.peanut Report.peanut/Report.md` → 1,
    error mentions the source; shortcut `Report.peanut x.pdf` → 0.
  - `TestInspect` (no Typst): doc with `@tbl:gone`, `![](missing.png)`, one labelled figure; `--json inspect` →
    `brokenReferences[0].label == "tbl:gone"`, `missingImages[0].ref == "missing.png"`, `numbered[0].kind ==
    "figure"`, `references` is `[]` not `null` when none.
  - `TestPages` (Typst): `pages doc dir --pages 1` → exactly one `page-*.png` in `dir`, starting `"\x89PNG"`.
- [ ] **Step 2: Run** `go test ./internal/cli` → FAIL.
- [ ] **Step 3: Implement** with `env.Abs` on every path. `render`: format from `strings.ToLower(filepath.Ext(out))`,
  else usage error listing `.pdf .docx .html`; `os.MkdirAll(filepath.Dir(out))`; compare `filepath.Clean` of out and
  `Doc.Path` (and `EvalSymlinks` when both exist). HTML title: output's base name, as the app. `pages`: write
  `page-NN.png` (two digits min); result `{ "pages": [paths] }`. `inspect`: `doc.Walk` collecting refs (kind `""`
  → broken), figures/tables/equations with `Number > 0`, `Missing` on blocks and pictures; `--typst` calls
  `Typst.Preview` and reports `len(pages)` and its warnings.
- [ ] **Step 4: Run** `go test ./internal/cli` → PASS.
- [ ] **Step 5: Commit** `cli: render, pages, inspect`.

### Task 5: `templates *`, `new`, `versions *`, `format`

**Files:**
- Create: `internal/cli/templates.go`, `internal/cli/document.go`
- Test: `internal/cli/cli_test.go`

**Interfaces:**
- Consumes: Tasks 1–3; `templates.List/Get/Problem/ReadCustom/WriteCustom/Style`, `render.Typst.Fonts`.

- [ ] **Step 1: Failing tests** (no Typst needed):
  - `TestTemplatesCustomize`: on a doc with `template: report`, `templates customize doc --body-font Georgia
    --accent-color "#ff0000"` → `Name.template.json` has `base: report`, `bodyFont: Georgia`, `accentColor:
    FF0000`; front matter now `template: custom`; a second call `--font-size 12` keeps `bodyFont`; `--text-color
    blue` → exit 1, error `isn't a color`.
  - `TestTemplatesSet`: `templates set doc nope` → 1, document unchanged; `templates set doc classic` → front matter
    `template: classic`.
  - `TestNewAndVersions`: `new <tmp>/Essay --title "An Essay"` → `Essay.peanut/Essay.md` with `title: An Essay`;
    again → 1. `versions list` → `[]`. (Save needs Typst: in the Typst-gated `TestRenderFormats` add
    `versions save doc v1` then edit the file, `versions restore doc v1` → text back, and `backup.List` has one.)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `customize`: read existing custom or start from `{Base: current template id (or
  --base, or Default)}`; only non-zero flags overwrite; `--base` sets Base; `WriteCustom`; `SetFrontMatter(template,
  custom)`. `show` result: the template's `TypstStyle()` plus id/name/description. `new` uses
  `pipeline.NewDocument(dir, SafeFileName(name), author, buildVersion)`; `--title` applied with `SetFrontMatter`
  after. `format --check`: exit 1 with message `would reformat` when output differs, no write.
- [ ] **Step 4: Run** `go test ./internal/cli` → PASS.
- [ ] **Step 5: Commit** `cli: templates, new, versions, format`.

### Task 6: `peanut-cli mcp`

**Files:**
- Create: `internal/cli/mcp.go`
- Test: `internal/cli/mcp_test.go`

**Interfaces:**
- Consumes: every `Command`'s `addTool`, built in `Def` with `mcp.AddTool[*A-equivalent, any]`.
- Produces: `func Serve(ctx context.Context, env *Env, t mcp.Transport) error`; command `mcp` runs it on
  `&mcp.StdioTransport{}`.

- [ ] **Step 1: Failing test** `TestMCP`: `mcp.NewInMemoryTransports()`; serve one end, connect a client on the
  other; `ListTools` includes `render`, `inspect`, `templates_list`, `versions_save`, and not `mcp`;
  `CallTool inspect {doc: <abs path>}` → not `IsError`, `StructuredContent` has `brokenReferences`; `doc: "rel.md"`
  → `IsError`, text contains `absolute`. Typst-gated: `CallTool pages` → content has ≥1 `*mcp.ImageContent` with
  `MIMEType "image/png"`.
- [ ] **Step 2: Run** `go test ./internal/cli -run TestMCP` → FAIL.
- [ ] **Step 3: Implement.** Tool name: command name with spaces → `_`. Description: summary. Input schema from `A`
  (go-sdk infers it; `jsonschema` tags describe fields). Handler: reject non-absolute values in fields named
  `doc`, `out`, `dir`, `path`; run; result as structured content; warnings as a `TextContent`; errors as
  `IsError` results (not protocol errors). `pages` appends `ImageContent` per page read back from disk. Server
  `Implementation{Name: "peanut-writer", Version: buildVersion}`.
- [ ] **Step 4: Run** `go test ./internal/cli` → PASS. Smoke: `printf` an `initialize` + `tools/list` JSON-RPC pair
  into `bin/peanut-cli mcp` and see the tool list.
- [ ] **Step 5: Commit** `cli: MCP server`.

### Task 7: Packaging and docs

**Files:**
- Modify: `scripts/package.sh` (build universal `peanut-cli` next to the app executable; add to the `for bin in` arch/
  minos check; sign it before the app), `scripts/update-cask.sh` (`binary` stanza)
- Create: `docs/guide/command-line.md`; add to the VitePress sidebar (`docs/.vitepress/config.*`)
- Modify: `docs/reference/development.md` (Layout entries; `mise run build` also makes `bin/peanut-cli`),
  `CHANGELOG.md`, `todo/ideas.md` (drop the CLI line)

- [ ] **Step 1:** Edit `package.sh`: in the per-arch loop also `go build … -o "$work/peanut-cli-$arch" ./cmd/peanut-cli`;
  `lipo` to `$app/Contents/MacOS/peanut-cli`; `for bin in "$exe" typst peanut-cli`; sign `peanut-cli` with `typst`.
- [ ] **Step 2:** Run `bash -n scripts/package.sh scripts/update-cask.sh` → no output. Run `mise run package` if signing
  isn't required for a local ad-hoc build; then `"bin/macos/Peanut Writer.app/Contents/MacOS/peanut-cli" render
  starter/<sample>.md /tmp/s.pdf` → `wrote /tmp/s.pdf` with no Typst on PATH beyond the bundled one.
- [ ] **Step 3:** Write the guide: install (Homebrew links `peanut-cli`), each command with one example, the `--json`
  envelope and `inspect` shape, MCP setup (`claude mcp add peanut -- peanut-cli mcp`; generic
  `{"mcpServers":{"peanut":{"command":"peanut-cli","args":["mcp"]}}}`), "paths must be absolute over MCP", and that
  the open app doesn't see CLI changes until reopened.
- [ ] **Step 4:** `mise run docs:build` → builds.
- [ ] **Step 5: Commit** `peanut-cli: package in the app and Homebrew; docs`.
