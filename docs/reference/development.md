# Development

Peanut Writer is built with Go and [Wails 3](https://v3.wails.io) for the app, Vue and
[CodeMirror](https://codemirror.net) for the editor, and [Typst](https://typst.app) for typesetting. Tools are pinned
with [mise](https://mise.jdx.dev).

```sh
mise install       # go, bun, wails3, typst
mise run dev       # the app with hot reload
mise run build     # bin/peanut-writer
mise run package   # bin/peanut-writer.app, with typst inside
mise run test      # Go tests
mise run check     # type-check the editor
mise run fmt       # gofmt + oxfmt
mise run docs      # this site, with hot reload
mise run docs:build # this site, built into docs/.vitepress/dist
```

## How a document becomes pages

```text
Name.md ──► internal/doc ──► document model ──┬──► internal/render ──► Typst ──► preview (SVG) and PDF
            (figures, captions,               │      (peanut.typ renders, template.typ styles)
             numbering, references)           └──► internal/docx ──► Word file
```

The document model is the single source of truth for numbering and references, which is why the PDF and the Word file
always agree. The editor mirrors the same numbering rules while you type (`frontend/src/lib/markdown.ts`).

## Layout

- `main.go`: the window and the menu bar (menu commands reach the editor as `menu` events).
- `service.go`: `DocService`, bound to the editor: open, save, backups, render, export, pictures, templates.
- `internal/doc`: Markdown → document model (figures, captions, numbering, references).
- `internal/render`: the model → Typst → SVG pages and PDF. Finds `typst` beside the executable, on `PATH`, or where
  Homebrew and mise install it.
- `internal/docx`: the model → .docx, written directly (no Word or pandoc needed).
- `internal/templates`: built-in and user templates, and per-document customization.
- `internal/backup`: `.md` + `.docx` backups in timestamped `backups/<datetime>/` folders.
- `internal/mdfmt`: Auto format: runs `oxfmt` and title-cases headings.
- `starter/`: the welcome guide.
- `frontend/`: the editor. `src/lib/editor.ts` is CodeMirror with the figure, table, reference and properties widgets;
  `src/peanut/` is the three.js Peanut.
- `docs/`: this site ([VitePress](https://vitepress.dev)).
