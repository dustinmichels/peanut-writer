# peanut-cli, sub-project 1: core commands

Status: design approved in chat 2026-11-11; spec awaiting review.

## Goal

A command-line tool that does what the app does to a document, without the window, for scripts and for AI agents:

```sh
peanut-cli doc.md --template classic doc.pdf
```

Agents get JSON for every command, can check their own edits (numbering, broken references, render warnings), and
can look at the pages as images.

Sub-projects 2 (MCP server, `peanut-cli mcp`) and 3 (driving the running app over a local socket) build on this one
and get their own specs. Nothing here may block them: every command is defined once, in a table both the CLI and the
MCP server read.

## Non-goals

- Editing document text (agents edit the `.md` directly).
- Anything that needs the running app (sub-project 3).
- Windows/Linux packaging. The binary builds there; only macOS ships it.

## Commands

All take `--json`. A document argument is a `Name.md`, or a `Name.peanut` package (its Markdown file is found as the
app finds it: `docFile`).

| Command | Does |
| --- | --- |
| `render <doc> -o <out> [--template id]` | Writes PDF, Word or web page, by `<out>`'s extension (`.pdf`, `.docx`, `.html`). |
| `<doc> [--template id] <out>` | Shortcut for `render`: two positional arguments, the second with an output extension. |
| `pages <doc> -o <dir> [--template id] [--ppi n] [--pages 1-3]` | One PNG per page, `page-01.png`…, for an agent to look at. `--ppi` default 96. |
| `inspect <doc> [--typst] [--template id]` | The document as an agent needs it (below). `--typst` also compiles it, adding Typst's warnings and page count. |
| `templates list` | Built-in then user templates: id, name, description, built-in or not. |
| `templates show <id>` | A template's style: fonts, size, colors (the fields of `templates.Style`). |
| `templates set <doc> <id>` | Sets the front matter's `template:`. Unknown ids are refused (`templates.Problem`). |
| `templates customize <doc> [--base id] [--body-font f] [--heading-font f] [--mono-font f] [--font-size n] [--text-color RRGGBB] [--heading-color …] [--title-color …] [--caption-color …] [--accent-color …] [--table-header-fill …]` | Writes or updates `Name.template.json` (merging with what's there) and sets `template: custom`. Checked with `Style.Check`. |
| `templates fonts` | Font families Typst can use (`Typst.Fonts`). |
| `new <dir>/<Name> [--title t] [--author a]` | Creates `Name.peanut/Name.md` with properties as **New Document** fills them (`fillProperties`). Refuses to replace an existing document. |
| `versions list <doc>` | Named versions, newest first. |
| `versions save <doc> <name>` | As the app's **New Version**: the document, sidecars, Word and PDF copies. |
| `versions restore <doc> <name>` | As the app's restore: the replaced text goes into backups first. |
| `format <doc> [--heading-case title\|sentence] [--check]` | Auto format with oxfmt, in place. `--check` writes nothing and exits 1 if it would change. Needs `oxfmt` on PATH. |

`--template` on `render`, `pages` and `inspect` overrides the document's own choice for that run only; it never
writes to the document. `custom` is accepted only if the document has a `Name.template.json`.

### `inspect` output

```json
{
  "path": "/abs/Report.peanut/Report.md",
  "meta": { "title": "…", "template": "classic", … },
  "template": { "id": "classic", "name": "Classic", "problem": "" },
  "outline": [{ "level": 1, "text": "Introduction", "line": 7 }],
  "numbered": [{ "kind": "figure", "number": 1, "label": "fig:map", "caption": "…", "line": 12 }],
  "references": [{ "label": "fig:map", "kind": "figure", "number": 1, "line": 9 }],
  "brokenReferences": [{ "label": "tbl:gone", "line": 30 }],
  "missingImages": [{ "ref": "pics/a.png", "line": 14 }],
  "warnings": ["…doc.Warnings…"],
  "typst": { "pages": 4, "warnings": ["…"] }
}
```

All lists are `[]`, never `null`. `typst` appears only with `--typst`. Built by walking the model (`doc.Walk`); a
reference's line is its block's.

### Output, errors, exit codes

- Without `--json`: a short human line per result (`wrote doc.pdf`), warnings on stderr.
- With `--json`: one JSON object on stdout, `{"ok": true, "result": …, "warnings": [...]}` or
  `{"ok": false, "error": "…"}`. Nothing else on stdout.
- Exit codes: 0 ok; 1 error (including Typst compile errors, whose diagnostics are the error text); 2 usage;
  3 ok but with warnings, only under `--strict`.
- Outputs are written with `atomicfile.Write`. Writing over the source document is refused. An existing output is
  replaced (scripts expect it; unlike the app there's no one to ask).
- Typst not found: error naming where it looked (as `render.Find`), exit 1. `inspect` without `--typst`, `templates
  list|show|set|customize`, `new`, `versions list` work without Typst.

## Architecture

```text
cmd/peanut-cli ──► internal/cli (command table, flags, JSON, exit codes)
                        │
service.go ────────────►├──► internal/pipeline ──► doc, templates, render, docx, html, versions, mdfmt
```

### `internal/pipeline` (new)

Everything both the app and the CLI do to a document file, moved out of `service.go` so they can't drift:

- Paths: `DocFile`, `ShownPath`, `DocName`, `SafeFileName`, `CustomTemplatePath`, `SettingsPath`, `Sidecars`,
  `PackageExt`.
- `Load(path string) (*Doc, error)`: reads the Markdown (BOM stripped), parses it with the package folder as base,
  and resolves its template. `Doc` holds the path, source, `*doc.Document` and `templates.Template`.
- `Template(docPath, id string) (templates.Template, error)`: today's `templateFor`; `docPath == ""` is not handled
  here (the app keeps its untitled template in memory and passes it in).
- `Renderer{Typst *render.Typst}` with `PDF`, `DOCX` (today's `docxBytes`), `HTML(d, tpl, title)` (today's
  `ExportHTML` body) and `PNGPages(d, tpl, ppi, pages)`.
- Front matter: `FillProperties` (moved), `SetFrontMatter(src, key, value)`, writing a key where the editor's
  `writeFrontMatter` would, with the same quoting (`frontMatterValue`).
- `NewDocument(dir, name, author)`, `SaveVersion`, `Format` bodies, minus the dialogs and app state.

`service.go` keeps dialogs, window, untitled state, and calls `pipeline`. No behavior change in the app.

### `internal/render` additions

- `PNG(ctx, d, tpl, ppi, pages) ([][]byte, []string, error)`: `render` with output `page-{0p}.png`,
  `--ppi`, `--pages`. Reuses the unreadable-math and image retries.
- `PDF` returns Typst's warnings too (needed for `inspect --typst` and `--strict`); callers in `service.go` ignore
  them as today.

### `internal/cli` (new)

```go
type Command struct {
    Name    string        // "render", "templates list"
    Summary string
    Args    func() any    // pointer to a fresh args struct; fields tagged `arg:"doc,positional"`, `flag:"template"`, `help:"…"`
    Run     func(ctx context.Context, env *Env, args any) (any, []string, error) // result, warnings
}
```

One table drives `flag.FlagSet` construction, `peanut-cli help <cmd>`, and (sub-project 2) MCP tool schemas via
reflection over the same struct tags. `Env` carries the lazily found `*render.Typst` and `*mdfmt.Oxfmt`, stdout,
stderr. Std-lib `flag` only.

`cmd/peanut-cli/main.go` is `os.Exit(cli.Main(os.Args[1:]))`, with `buildVersion` linked in as the app's is, and
`peanut-cli --version`.

## Packaging

- `mise run build` also builds `bin/peanut-cli` (`go build ./cmd/peanut-cli`; it doesn't embed the frontend).
- `scripts/package.sh` builds it universal, puts it in `Peanut Writer.app/Contents/MacOS/peanut-cli` beside `typst`
  (so `render.Find` finds the bundled Typst first), signs it before the app, and checks it like the other binaries.
- `scripts/update-cask.sh` adds `binary "#{appdir}/Peanut Writer.app/Contents/MacOS/peanut-cli"` to the cask.

## Testing

Only tests that catch real breakage (AGENTS.md):

- `pipeline.Template` precedence: `--template` override, `custom` with and without `Name.template.json`, unknown id
  falls back to Default with a problem.
- `SetFrontMatter`: adds, replaces, quotes, creates the block when there is none; the app reads back what it wrote
  (`doc.Parse`).
- CLI end-to-end on a temp copy of a numbering sample (Typst-gated like `render_test.go`): `render` to `.pdf` and
  `.docx` gives valid files; `inspect --json` reports a broken reference planted in the sample; `--strict` exits 3 on
  it; writing over the source is refused.

Existing `internal/...` tests must keep passing; the app's behavior is checked by hand once (export PDF/Word/web page,
Sync Files, New Version) after the `service.go` move.

## Docs

- `docs/guide/command-line.md`: install (Homebrew puts `peanut-cli` on PATH), each command, the JSON shapes, a short
  "for agents" section.
- `docs/reference/development.md`: `cmd/peanut-cli`, `internal/cli`, `internal/pipeline` in Layout.
- `CHANGELOG.md` entry; remove the CLI line from `todo/ideas.md`.
