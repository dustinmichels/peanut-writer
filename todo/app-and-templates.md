# App and templates (`service.go`, `internal/templates`, `internal/render`)

- A template folder whose `template.json` doesn't parse is left out of the template gallery with no note (a document
  naming it gets a note saying why Classic is used).
- One document per window, one window: `DocService` holds a single open document.
- `Reveal` on Linux opens the folder rather than selecting the file.
- Typst is found beside the executable, on `PATH`, or in Homebrew/mise/cargo locations; Linux has no install-location
  fallbacks (Windows: [windows.md](windows.md) step 2).
