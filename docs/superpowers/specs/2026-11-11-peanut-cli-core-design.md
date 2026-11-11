# peanut-cli: command line and MCP server

Status: approved 2026-11-11 ("not married to the syntax; I want a CLI and potentially an MCP to use the app
programmatically").

## Goal

Do what the app does to a document without the window, for scripts and AI agents:

```sh
peanut-cli doc.md doc.pdf --template classic
```

and the same commands as MCP tools (`peanut-cli mcp`), so an agent can render, check its edits (numbering, broken
references, render warnings), look at the pages, and change the template.

## Non-goals

- Editing document text: agents edit the `.md` directly.
- Talking to the running app. The CLI works on files; an open document in the app doesn't notice CLI changes until
  it's reopened. A later project may add a socket to the app.
- Windows/Linux packaging (the binary builds there; only macOS ships it).

## Commands

A document argument is a `Name.md` or a `Name.peanut` package (its Markdown file found as the app finds it). Every
command takes `--json`.

| Command | Does |
| --- | --- |
| `render <doc> <out> [--template id]` | PDF, Word or web page by `<out>`'s extension: `.pdf`, `.docx`, `.html`. |
| `<doc> <out> [--template id]` | Shortcut for `render` when the first argument isn't a command name. |
| `pages <doc> <dir> [--template id] [--ppi 96] [--pages 1-3]` | One PNG per page, `page-01.png`…, so an agent can see the layout. |
| `inspect <doc> [--typst] [--template id]` | What an agent needs to check the document (below). `--typst` also compiles it for page count and Typst warnings. |
| `templates list` | Built-in then user templates: id, name, description, builtin. |
| `templates show <id>` | The template's style (`templates.Style` fields, base's values filled in). |
| `templates set <doc> <id>` | Sets front matter `template:`. Unknown ids are an error. |
| `templates customize <doc> [--base id] [--body-font …] [--heading-font …] [--mono-font …] [--font-size n] [--text-color RRGGBB] [--heading-color …] [--title-color …] [--caption-color …] [--accent-color …] [--table-header-fill …]` | Creates or updates `Name.template.json` (only the given fields change) and sets `template: custom`, as the Customize pane does. |
| `templates fonts` | Font families Typst can use. |
| `new <path> [--title t] [--author a]` | `<path>` is `dir/Name` (an extension `.peanut`/`.md` is dropped): creates `dir/Name.peanut/Name.md` with properties as **New Document** fills them. Refuses to replace a document. |
| `versions list <doc>` | Named versions, newest first. |
| `versions save <doc> <name>` | As **New Version**: the document, sidecars, Word and PDF copies. |
| `versions restore <doc> <name>` | As opening a version: the current text goes into backups first. |
| `format <doc> [--heading-case title\|sentence] [--check]` | Auto format with oxfmt, in place. `--check` writes nothing, exits 1 if it would change. Needs `oxfmt` installed. |
| `mcp` | MCP server on stdio exposing every command above as a tool. |

`--template` on `render`, `pages` and `inspect` applies to that run only; `custom` needs the document's
`Name.template.json`. Unknown ids are an error (the app falls back to Default with a warning; a script should hear
about the typo).

### `inspect` result

```json
{
  "path": "/abs/Report.peanut/Report.md",
  "meta": { "title": "…", "template": "classic" },
  "template": { "id": "classic", "name": "Classic", "problem": "" },
  "outline": [{ "level": 1, "text": "Introduction", "line": 7 }],
  "numbered": [{ "kind": "figure", "number": 1, "label": "fig:map", "caption": "…", "line": 12 }],
  "references": [{ "label": "fig:map", "kind": "figure", "number": 1, "line": 9 }],
  "brokenReferences": [{ "label": "tbl:gone", "line": 30 }],
  "missingImages": [{ "ref": "pics/a.png", "line": 14 }],
  "warnings": ["…"],
  "typst": { "pages": 4, "warnings": ["…"] }
}
```

Lists are `[]`, never `null`. `typst` only with `--typst`. A reference's line is its enclosing block's.
`template.problem` is `templates.Problem` (front matter naming a template that's gone).

### Output and exit codes

- Text mode: one short line per result (`wrote doc.pdf`), warnings on stderr.
- `--json`: one object on stdout, `{"ok": true, "result": …, "warnings": […]}` or `{"ok": false, "error": "…"}`.
- Exit 0 ok, 1 error (Typst diagnostics are the error text), 2 usage.
- Outputs are written atomically; an existing output is replaced; writing over the source document is refused.
- Commands needing Typst fail with `render.Find`'s error when it's missing. `inspect` (without `--typst`),
  `templates list|show|set|customize`, `new` and `versions list|restore` don't need it.

### MCP

`peanut-cli mcp` serves on stdio with the official Go SDK (`github.com/modelcontextprotocol/go-sdk` v1.8.0). Each
command is a tool named with underscores (`render`, `templates_list`, `versions_save`), described by its summary,
with an input schema from its args struct and its result as structured content (the same JSON as `--json`'s
`result`; warnings appended as text). `pages` also returns each page as image content, so the agent sees them
without reading files. Paths in tool arguments must be absolute (an MCP server's working directory isn't the
agent's).

## Architecture

```text
cmd/peanut-cli ──► internal/cli ──► internal/pipeline ──► doc, templates, render, docx, html, versions, backup, mdfmt
                     ▲  command table: flags, help, JSON, MCP tools
service.go ─────────────────────────► internal/pipeline
```

### `internal/pipeline` (new)

What the app and the CLI both do to a document file, moved out of `service.go` so they can't drift. `service.go`
keeps dialogs, window and untitled-document state and calls this; no app behavior changes.

- Paths: `PackageExt`, `DocFile`, `ShownPath`, `DocName`, `SafeFileName`, `CustomTemplatePath`, `SettingsPath`,
  `Sidecars`.
- `WithoutBOM`, `FillProperties` (with `FrontMatterValue`), and new `SetFrontMatter(src, key, value string) string`
  putting the key where the editor's `writeFrontMatter` would (its `metaKeys` order).
- `TemplateFor(c *templates.Custom, id string) templates.Template`: today's `templateFor` minus the reading (the app
  passes its untitled template, the CLI the file's).
- `Load(path, override string) (*Doc, error)`: `DocFile`, read, strip BOM, `doc.Parse` with the file's folder,
  read `Name.template.json`, pick the template (override, else front matter). `Doc{Path, Source string; Doc
  *doc.Document; Template templates.Template}`.
- `Renderer{Typst *render.Typst}`: `PDF`, `DOCX` (today's `docxBytes`), `HTML(d, tpl, title)` (today's `ExportHTML`
  body), `PNG`.
- `Backup(p)` (today's `backup` minus the mutex, which stays in the app), `SaveVersion(r, p, name)`,
  `RestoreVersion(p, name)` (backup first, then `versions.Restore`), `NewDocument(dir, name, author, version)`,
  `Format(o *mdfmt.Oxfmt, src, headingCase)`.

### `internal/render`

- `PNG(ctx, d, tpl, ppi int, pages string) ([][]byte, []string, error)`: `render` to `page-{0p}.png` with `--ppi`
  and `--pages`.
- `PDF` also returns Typst's warnings; the app ignores them.

### `internal/cli` (new)

```go
type Command struct {
    Name, Summary string   // "templates list"
    // built by Def[A]; hidden: new args, flag binding, JSON schema, run
}

func Def[A any](name, summary string, run func(ctx context.Context, e *Env, a *A) (any, []string, error)) Command
```

Args are structs. Positional arguments are fields tagged `arg:"N"`; other fields are flags named by their `json` tag
in kebab case; `jsonschema` tags give help text. `Def` builds the `flag.FlagSet`, the MCP schema
(`jsonschema.For[A]`) and the typed handler from the one struct. `Env` holds lazily found Typst and oxfmt, stdout,
stderr. Std-lib `flag`; the only new dependency is the MCP SDK.

`cmd/peanut-cli/main.go`: `os.Exit(cli.Main(os.Args[1:]))`, `buildVersion` linked as the app's, `--version`.

## Packaging

- `mise run build` also builds `bin/peanut-cli`.
- `scripts/package.sh`: universal `peanut-cli` in `Peanut Writer.app/Contents/MacOS/` beside `typst` (so it finds
  the bundled Typst), signed before the app, architecture and minimum-macOS checked like the others.
- `scripts/update-cask.sh`: `binary "#{appdir}/Peanut Writer.app/Contents/MacOS/peanut-cli"`.

## Testing

Only tests that catch real breakage:

- `SetFrontMatter`: adds in editor order, replaces, quotes, creates the block; `doc.Parse` reads back the value.
- `Load` template choice: override beats front matter; `custom` with/without `Name.template.json`; unknown id errors.
- CLI end to end (Typst-gated, like `render_test.go`): `render` gives a PDF (`%PDF`) and a .docx (zip); `inspect
  --json` reports a planted broken reference and missing image; writing over the source is refused; usage error
  exits 2.
- MCP: in-memory client calls `inspect` and `pages`, gets structured content and image content.
- The app checked by hand once after the move: export PDF/Word/web page, Sync Files, New Version, open a version,
  New Document, Auto format.

## Docs

- `docs/guide/command-line.md`: install, commands, JSON shapes, MCP setup (`claude mcp add peanut -- peanut-cli mcp`
  and a generic `mcpServers` JSON snippet).
- `docs/reference/development.md` Layout: `cmd/peanut-cli`, `internal/cli`, `internal/pipeline`.
- `CHANGELOG.md`; remove the CLI line from `todo/ideas.md`.
