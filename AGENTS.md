# Peanut Writer

Markdown word processor: Go + Wails 3, Vue + CodeMirror editor, Typst rendering, direct .docx export.

Code layout: `docs/reference/development.md`. Known gaps: `todo/`.

- Use mise tasks: `mise run dev`, `test`, `check`, `fmt`.
- Numbering rules in `internal/doc` are mirrored in `frontend/src/lib/markdown.ts`; change both. The samples in
  `internal/doc/testdata/numbering/` check they agree: add one for a new rule.
- Don't write trivial tests. Only add tests that are highly meaningful.

## Scrolling

- The editor view and preview view should scroll in sync unless user explicity breaks the link.
- The contents pane on the left should highlight the currently scrolled-to section.
