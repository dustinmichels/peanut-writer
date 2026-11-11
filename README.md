# Peanut Writer

A word processor that feels like Word but writes Markdown, with a few good ideas from LaTeX: figures, tables and
equations that number themselves, cross-references that keep up, LaTeX math, footnotes, and a table of contents. You
type on the left and see the typeset pages on the right. Export to **PDF**, **Word (.docx)** or a **web page (.html)**.

**Documentation: [dustinmichels.github.io/peanut-writer](https://dustinmichels.github.io/peanut-writer/)**

- [Introduction](https://dustinmichels.github.io/peanut-writer/guide/introduction)
- [Document syntax](https://dustinmichels.github.io/peanut-writer/reference/syntax)
- [Custom templates](https://dustinmichels.github.io/peanut-writer/reference/custom-templates)
- [Keyboard shortcuts](https://dustinmichels.github.io/peanut-writer/reference/shortcuts)
- [Development](https://dustinmichels.github.io/peanut-writer/reference/development)

## Development

Go + [Wails 3](https://v3.wails.io) for the app, Vue + [CodeMirror](https://codemirror.net) for the editor,
[Typst](https://typst.app) for typesetting. Tools are pinned with [mise](https://mise.jdx.dev).

```sh
mise install       # go, bun, wails3, typst
mise run dev       # the app with hot reload
mise run package   # bin/peanut-writer.app, with typst inside
mise run release   # tag, notarize and publish a GitHub release (Mac)
mise run test      # Go tests
mise run docs      # the documentation site (docs/, VitePress) with hot reload
```

See [Development](https://dustinmichels.github.io/peanut-writer/reference/development) for the full task list and
code layout.
