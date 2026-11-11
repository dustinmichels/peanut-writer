# App and templates (`service.go`, `internal/templates`, `internal/render`)

- **Broken user templates fail silently**: a template folder whose `template.json` doesn't parse is skipped by
  `templates.List`, and a document naming it falls back to Classic with no note.
- **Save As copies only inline images** found by a regex (`imageRef`): reference-style images (`![a][ref]`) and paths
  containing `)` are left behind.
- One document per window, one window: `DocService` holds a single open document.
- `Reveal` on Linux opens the folder rather than selecting the file.
- Typst is found beside the executable, on `PATH`, or in Homebrew/mise/cargo locations; Windows and Linux have no
  install-location fallbacks.
