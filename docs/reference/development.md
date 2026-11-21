# Development

Peanut Writer is built with Go and [Wails 3](https://v3.wails.io) for the app, Vue and
[CodeMirror](https://codemirror.net) for the editor, and [Typst](https://typst.app) for typesetting. Tools are pinned
with [mise](https://mise.jdx.dev).

```sh
mise install       # go, bun, wails3, typst, oxfmt
mise run dev       # the app with hot reload
mise run build     # bin/peanut-writer
mise run package   # bin/peanut-writer.app, with typst and oxfmt inside
mise run release:package # signed, notarized Peanut-Writer.dmg and .zip in bin/release
mise run release   # tag and publish a release (see Releasing)
mise run test      # Go tests, and the editor's (bun test)
mise run check     # type-check the editor
mise run fmt       # gofmt + oxfmt
mise run cleanup   # delete build output, unregister stale .app bundles
mise run docs      # this site, with hot reload
mise run docs:build # this site, built into docs/.vitepress/dist
mise run docs:screenshots # the app's screenshots in docs/public/screenshots
mise run docs:demo # a captioned demo video in demo/ (gitignored; see demo/README.md)
```

## Releasing

```sh
mise run release          # patch bump
mise run release minor    # or major, or an exact X.Y.Z
```

`mise run release` (`scripts/release.sh`) cuts a release on a Mac, from a clean `main` that's level with `origin/main`.
It checks that signing, notarization and the Homebrew tap will work, runs the Go tests, builds and notarizes the app
(`scripts/package.sh`), tags `vX.Y.Z`, publishes a GitHub release, and points the Homebrew cask at it
(`scripts/update-cask.sh`, which creates `Casks/peanut-writer.rb` in
[dustinmichels/homebrew-tap](https://github.com/dustinmichels/homebrew-tap) the first time). Nothing is tagged until
notarization has passed. Versions come from the git tags, linked into the app as `main.buildVersion`; other builds
report `dev` and never check for updates. If the cask step fails, the release is already out: rerun `mise run cask`.

| Asset               | Holds                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `Peanut-Writer.dmg` | `Peanut Writer.app`: universal (arm64 + x86_64), with the Typst and oxfmt pinned in `mise.toml` inside |
| `Peanut-Writer.zip` | The same app alone, for the in-app updater                                                             |
| `checksums.txt`     | SHA-256 of both                                                                                        |

The in-app updater (`update.go`, Wails' `pkg/updater`) checks the latest release at launch, daily, and on
**Peanut Writer → Check for Updates…**, downloads `Peanut-Writer.zip`, checks it against `checksums.txt`, and swaps it
in for the running app. Keep those asset names and the `vX.Y.Z` tags. The app needs macOS 13 (Go 1.27's minimum), set
as `LSMinimumSystemVersion` in `build/darwin/Info.plist`; packaging checks the Typst and oxfmt binaries against it.
`mise run release` warns when newer Typst or oxfmt versions are out: `mise up --bump typst` (or
`aqua:oxc-project/oxc/oxfmt`) moves the pin, and the next release ships it to users through the updater.

Once per Mac, set up signing:

1. A **Developer ID Application** certificate in the Keychain (developer.apple.com → Certificates, or Xcode → Settings
   → Accounts → Manage Certificates). `security find-identity -v -p codesigning` lists it.
2. A notarytool profile: a Keychain entry holding your Apple ID, an
   [app-specific password](https://support.apple.com/102654) and your team ID, saved under a name of your choosing.
   The scripts use `peanut-writer`:

   ```sh
   xcrun notarytool store-credentials peanut-writer --apple-id <apple id> --team-id LLM5F36KYW
   ```

`CODESIGN_IDENTITY` and `NOTARY_PROFILE` override either. Without the certificate, `mise run release:package` signs the
app ad hoc and skips notarization: it runs on the Mac that built it, but Gatekeeper blocks it elsewhere.

## Screenshots

`mise run docs:screenshots` builds the app in Wails server mode (`bin/peanut-writer-server`) and drives it in headless
WebKit with Playwright (`docs/scripts/screenshots.ts`). Each scene starts the app with a fresh, empty home folder and
default settings, opens the sample from the start dialog, then clicks its way to what the picture shows. Pages use them as
`/screenshots/<name>.png`. Name scenes to redo only those: `mise run docs:screenshots -- settings outline`. To add one,
add a scene to the `scenes` list.

`mise run docs:demo` drives the same server-mode app through a scripted tour (`docs/scripts/demo-video.ts`) and writes
`demo/peanut-writer-demo.mp4` with a generated soundtrack. How it works is in `demo/README.md`.

## How a document becomes pages

```text
Name.md ──► internal/doc ──► document model ──┬──► internal/render ──► Typst ──► preview (SVG) and PDF
            (figures, captions,               │      (peanut.typ renders, template.typ styles)
             numbering, references)           ├──► internal/docx ──► Word file
                                              └──► internal/html ──► web page
```

The document model is the single source of truth for numbering and references, which is why the PDF and the Word file
always agree. The editor mirrors the same numbering rules while you type (`frontend/src/lib/markdown/`); the samples in
`internal/doc/testdata/numbering/` check both number them alike.

## Template previews

The Design gallery shows each template's first page of a sample document (`samples/<id>.md`, else its base template's,
else Classic's), drawn by Typst (`DocService.TemplatePreview`). Each drawing is an SVG cached in the user's cache folder,
`~/Library/Caches/Peanut Writer/previews/` on macOS (`~/.cache/Peanut Writer/previews/` on Linux), named by a hash of the
template's id and a hash of what drew it: the template's source and style, the sample, and the Typst and app
executables (path, size, modified time). Change any of them (edit or restyle a template, upgrade Typst, rebuild the
app, which embeds `peanut.typ` and the rest of the renderer) and that template is redrawn on the gallery's next
opening; the stale file is replaced. The gallery asks for all of them at once, so the redrawn ones render side by
side. The app's executable is part of the key, so the cache can only be filled by the app itself; `mise run
previews:clear` empties it to force a redraw (after installing a font a template uses, say).

## Layout

- `main.go`: the window and the menu bar (menu commands reach the editor as `menu` events).
- `bibliography.go`: the document's `Name.bib` path, carried along on Save As and read for rendering.
- `internal/citations`: the citation manager's own Wails service, beside `DocService`.
- `internal/refs`: references as the citation manager edits them: field mapping, keys, BibTeX/RIS import, DOI/ISBN
  lookup.
- `service.go`: `DocService`, bound to the editor: open, save, backups, render, export, pictures, templates.
- `internal/doc`: Markdown → document model (figures, captions, numbering, references).
- `internal/render`: the model → Typst → SVG pages and PDF. Finds `typst` beside the executable, on `PATH`, or where
  Homebrew and mise install it. Preview pages come with their blocks' positions (for scroll sync) taken out of the SVG,
  and a key: the editor gets and redraws only pages whose key it doesn't have.
- `internal/docx`: the model → .docx, written directly (no Word or pandoc needed).
- `internal/html`: the model → a single self-contained .html page, styled from the template's Word style.
- `internal/templates`: built-in and user templates, and per-document customization.
- `internal/backup`: `.md` backups in timestamped `backups/<datetime>/` folders.
- `internal/versions`: named versions in `versions/<name>/` folders (Markdown, JSON sidecars, Word and PDF).
- `internal/mdfmt`: Auto format: runs `oxfmt` (the native binary, found like `typst`) and title-cases headings.
- `internal/bib`: reads, edits and merges the BibLaTeX file (`Name.bib`) a document's citations are of.
- `internal/zotero`: searches Zotero and exports sources through Better BibTeX's JSON-RPC (`localhost:23119`).
- `starter/`: the welcome guide.
- `frontend/`: the editor. Under `src/`:
  - `lib/editor/`: CodeMirror, with the figure, table, equation, reference and properties widgets in `widgets/`.
  - `lib/markdown/`: reading and writing the Markdown (front matter, figures, tables, footnotes, numbering).
  - `lib/actions/`: what the menus, ribbon and dialogs do; `lib/store/`: shared state, toasts, preview rendering.
  - `components/`: `layout/`, `ribbon/` (a component per tab), `panes/`, `dialogs/` and shared `ui/` pieces;
    `composables/` holds App's wiring (splitter, scroll sync, events, startup).
  - `styles/`: the global CSS; `peanut/`: the three.js Peanut.
  - `features/citations/`: the citation manager: dialog, form, import, References pane, editor hints. Its `index.ts`
    lists the five places it is mounted, so it can be taken out.
  - Each `lib/` folder's `index.ts` is its API: import `@/lib/editor`, not its files. `@/` is `src/`, `@bindings/`
    the generated Wails bindings.
- `docs/`: this site ([VitePress](https://vitepress.dev)).
