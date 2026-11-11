# Peanut Writer

Markdown word processor: Go + Wails 3, Vue + CodeMirror editor, Typst rendering, direct .docx export.

Code layout: `docs/reference/development.md`. Known gaps: `TODO.md`.

- Use mise tasks: `mise run dev`, `test`, `check`, `fmt`.
- Numbering rules in `internal/doc` are mirrored in `frontend/src/lib/markdown.ts`; change both.
- Don't write trivial tests. Only add tests that are highly meaningful.
