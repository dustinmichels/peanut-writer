# Refine — 2026-11-11

Eight passes over every layer for crashes, wrong output, data loss and slow paths. Each bug was reproduced by a
throwaway harness (Go tests and fuzzers, bun/happy-dom, real CodeMirror states, a Go↔TS differential fuzzer, Typst +
`pdftotext`, the live app in WebKit) before the fix and rechecked after; scaffolding deleted. Permanent tests only where
a regression would be user-visible. Format: trigger → fix (`Test…` = permanent test). **Bold** = crash, data loss,
security or whole-render failure.

## Eighth pass

Five areas in parallel, each with new harnesses; the seventh pass's "found, not fixed" list and most of the old
open list are closed. Verified: `go vet ./...`, `go test -race ./internal/...`, `bun test`, `vue-tsc`, oxfmt.

### Markdown → document model

- **Wrong text after a Properties save**: Go's `strconv.Quote` wrote `\U…`/`\a`/`\x` escapes the editor didn't decode
  (flag emoji in a `#` title gained backslashes); Go and TS also read `\/`, `\x41`, `\ud83d`, tab before `\"`, leading
  U+FEFF differently → one escape set (YAML double-quoted; surrogate pairs; bad escape = taken as written) in both
  readers; both writers (`doc.FrontMatterValue`, TS `writeFrontMatter`) emit identical bytes, quoting control
  characters. Shared cases `testdata/frontmatter.json` (`TestFrontMatterValues`, `front matter values`); 110 k random
  values, 0 mismatches.
- `Table: Values for {x}` lost `{x}` (`Table: {x}` → empty) → `captionMarkdown` appends `{}`; no longer squeezes inner
  spaces (`table captions` test). Figure captions were already safe.
- Editor counted figures Go doesn't after a no-break-space line or a `---` ending in U+FEFF; Unicode spaces around
  `{…}`, `:\u00a0caption`, `$$\u00a0` disagreed → `space.ts` mirrors Go's trims and `\s`; sample
  `testdata/numbering/white-space.md`. Go vs TS on 50 k random docs: 0 differences.
- Editor footnote numbers differed from the PDF's (612/3 000 docs built from odd constructs): labels with spaces or
  `\]`, empty `[^a]:` swallowing the next line, marks in inline-picture alt text, indented code and HTML blocks,
  no-break-space "blank" lines → `readFootnotes` follows goldmark's rules (`hiddenAlts`, shared `htmlStart`); 0/32 000;
  `footnote marks` test (9 cases against `doc.Parse`). Incremental vs full: 255 k edits, 0 mismatches; keystroke rescan
  unchanged, full scan of 1 MB 11.5 → 22.8 ms.
- Perf: 2 000-deep list rescan in TS 5.5 s (bullets) / 9.0 s (numbered) → 101 / 122 ms (`Cursor.indent(max)`, blank once
  per line); Go `Parse` of 500 000 `[` 10.2 → 0.63 s (`mergeText` joins runs in one go).

### Typst rendering and templates

- **Whole preview and PDF failed** from ~25 nested quotes/lists, 20 loose list levels, 20 chained notes or 40 levels of
  styling (Typst's call-depth limit, ~20 of our levels; JSON stops at 128) in all 13 templates → `capDepth` flattens
  past 12 levels when writing `doc.json`, keeping the text; a lost ref target shows `??` (`TestDeepNestingRenders`; 7
  kinds × depths 11–300 × 13 templates, ~640 PDFs).
- **Text ran off the page**: an unbreakable word in body, heading, caption, cell, code, note, title or header (a column
  of commit hashes in Classic, Manuscript, Wordy, Peanut) → `overlong` rule in `peanut.typ`: a 20+ character run that
  doesn't fit its line or cell may break anywhere (CJK/Thai untouched; simple line breaking there, since justified took
  8.5 s on one 6 pt word) (`TestOverlongWordsBreak`). Layout of 13 real documents × 13 templates unchanged otherwise;
  preview time unchanged (welcome guide 248 → 233 ms, 508 pages 2.32 → 1.92 s).
- Import rejected a zip with a stray `template.json` first, or names starting `./` or `/` → first folder holding both
  files, names cleaned (`TestImportWindowsZipAndLongNames`).
- Nothing found: 14 edge documents × 39 templates (13 built-ins, each with every style at its limits) ≈ 550 preview +
  PDF pairs (35×60 tables with pictures/math/notes, title/author/date permutations, front matter full of Typst syntax,
  RTL/CJK, widths 0.001–1000%, grids of 1–12); hostile Import/Save/Rename/Export/Delete inputs; style boundaries.

### Word and web page export

- **Word renumbered figures on Update Fields/print**: a numbered item in a note-inside-a-note had no SEQ field, so later
  numbers shifted (455/3 000 fuzzed docs) → the outer mark counts everything inside it (0/3 000; `TestNoteWithinNote`).
- Figures in a note-inside-a-note (open item): web page showed only the caption, Word nothing, both without "Figure
  N"/"(N)" → both `flatText`s write pictures and numbered captions; `@fig:x` into one linked a missing id → `withID`
  span.
- Word file link `file.html?x=1#frag` lost the query; `100%.pdf` stayed an invalid target → `linkTarget` keeps the
  query, reads a stray `%` literally.
- Rotated photo memory (open item) → `upright` turns decoded planes directly: 24 MP 249 → 100 MB allocated, 96 MP peak
  997 → 402 MB, slightly faster.
- Nothing found: 15 `.docx` read by python-docx, pandoc, `textutil`, calibre (odd pictures, 1×1 to 8000×1, 16-bit,
  palette, GIF/WebP); 130 EXIF JPEGs × orientations 1–8 vs Pillow; 22 odd URLs, bookmarks ≤ 40 chars and unique; ragged
  tables, math edge cases; 10 web pages through html5lib (no errors, duplicate ids, nested `<a>`, scripts); 3 000-doc
  fuzzers on SEQ numbers and in-page links.

### App service

- **Data loss**: with 10 backups dated after now (clock went back, or synced from a Mac whose clock ran ahead) every new
  backup was pruned as soon as written → a new backup is stamped at least 1 s after the newest
  (`TestWriteKeepsBackupAfterClockGoesBack`).
- `settings.json` with a wrong-typed value (`"autoFormat": "yes"`) failed `Settings()` (dialog closed, toast on every
  save); a JSON array/string failed saving → each key read on its own, wrong types count as unset; non-object JSON reads
  as none. Invalid JSON is still reported.
- Title case split words at decomposed accents (`RéSumé`) and dots (`Node.Js`, `E.G.`; sentence case `u.s.`); `ǆ` → `Ǆ`
  not `ǅ` → `\p{M}` and inner dots join words, `unicode.ToTitle` (`TestTitleCase`, `TestSentenceCase`).
- Package path with a trailing `/` and a second `.md` said "holds no document" → cleaned; unreadable package now reports
  the permission error; two `.md` with neither `Name.md` names them.
- Errors named the hidden temp file (`…/.Doc.md.4248736588`) → `atomicfile.Write` errors name the target.
- Abandoned update downloads never removed when the app folder path held `[` (`filepath.Glob`) → `os.ReadDir`.
- Nothing found: every dialog-free service method with hostile paths/names/IDs under `-race` (no panics, leftovers or
  leaks); 8 goroutines × 30 mixed calls; 1 000 versions (0.54 s save, 26 ms list); 1 000 same-second backups; ~50
  title/sentence-case and `CaseHeadings` inputs.

### Editor and app UI

- **Corruption**: Select All then a Home-tab style with the Markdown hidden (the default): Clear Formatting and Code
  Block copied the front matter into the text; Heading/Quote/List/Tab left `# # #`, `> > >`, `1. 2.` under it; in
  Markdown view they rewrote the fences (`# ---`), losing the properties (56/3 000 fuzz runs) → commands start where the
  text begins, inserts go after the front matter (0/3 000).
- Clear Formatting garbled code and math (`$a*b*c$` → `$abc$`) → only real style marks from the syntax tree; `_`/`__`
  cleared too, `snake_case` kept.
- Bold etc. across paragraphs wrote `**para one … para two**` (literal asterisks); bolding `a **b** c` made `****` →
  each paragraph styled on its own, code/tables/math/figures left, inner same marks removed first.
- Insert Divider in a document opening with a `---` rule made everything above front matter → `***` there.
- With section focus, Insert Footnote, editing a note and some cross-reference inserts did nothing → `filter: false`.
- `@` completion offered labels a reference can't hold (`fig:café`, `fig:a.b`) → filtered.
- A wide child widened the app (3 000 px status-bar element → 3 437 px panes) → `.app` column `minmax(0, 1fr)`; the
  ribbon's own workaround removed.
- Heading N / Normal Text on a setext heading left `=====` as text (or wrote `# =====`) → handled as one heading,
  converted in place, ribbon shows it.
- ⌘/ ran CodeMirror's comment toggle (`<!-- -->`) in the editor → `Mod-/` dropped from `defaultKeymap`; View → Show
  Markdown owns it.
- Bold/italic/strike/highlight inside code or math inserted literal `**` → no-op. Inline math on `$5` / `a\` wrote
  broken math → refused, the Equation dialog opens instead.
- Tab / ⇧Tab in a quoted list (`> - b`) indented the `>` → `itemLine` reads past quote markers.
- Nothing found: 3 000 fuzz runs of 16 commands × 14 docs × both views; ~100 probes on real CodeMirror views; live
  WebKit scroll sync (21 positions, unlink/relink, section focus), outline highlight, ⌘Z after each style.

## Passes 1–7 (summary)

### Markdown → document model (`internal/doc`, `frontend/src/lib/markdown`)

- **Footnote marked inside itself** (`[^a]: Note [^a]`, or a cycle): fatal stack overflow → mark skipped with a
  warning; chains marking the next note twice copied notes 2ⁿ times → each note read once per note
  (`TestFootnoteMarkedInsideItself`). A note defined twice now says `footnote label used twice`.
- Link/image targets kept `&amp;`/`\_` (`![f](a\_b.png)` "not found") → `destination()` decodes like goldmark
  (`TestDestinationsUnescaped`). Lone `\r` not a line break → normalized (`TestLineBreaks`). `{width=nan}` broke the
  model → non-finite widths are 0. Grid pictures' alt text refs never resolved → exported `Walk`.
- Editor numbered figures unlike the PDF: image regex rejected `<my pic.png>`, parens, brackets in alt, `'title'`,
  math/code with brackets in captions, ``` ``a`]b`` ``` → `items.ts` follows goldmark, masks code and math; fuzzer
  0/9 000 differ; samples in `testdata/numbering/images.md`.
- Paste Table threw on `,`/`""` → `parseDelimited` returns null. Table dialog kept `` `x|y` `` one cell → splits at
  every unescaped pipe (GFM). `$\|x\|$` in a cell drew ‖x‖ → `cellMath` unescapes (`TestTableCellPipes`).
- Front matter property with U+2028/2029 dropped by the editor → `s` flag.
- Perf: `line()` quadratic → line index + binary search (2.1 MB: 2044 → 157 ms). Editor rescans incremental
  (`restart.ts`): per keystroke 150 KB 2.38 → 0.15 ms, 1 MB dense 107 → 7.4 ms; cross-ref spans 6.4 → 0.67 ms (1 MB).
- `==highlight==`: 29 edge cases agree Go/TS; 940 k fuzzed parses clean.

### Typst rendering and templates (`internal/render`, `internal/templates`)

- **Whole render failed** on `[a]()`, `[](x)`, empty fence, bare `>` → `peanut.typ` defaults omitted fields
  (`TestHalfTypedRenders`); on one unreadable image → images checked after a failed compile, bad ones become
  placeholders (`TestUnreadableImageFallsBack`); on `\pagebreak` in a quote/list/note, and in Book on any `#` heading
  in a container → `show pagebreak: none` there (`TestPageBreaksInContainers`).
- Template `style` with a bad color imported, then every render failed → `Style.Check()` on decode. `"builtin": true`
  in a user `template.json` → forced false. BOM in `template.json` → stripped. `writeMeta` → atomic. Font name with a
  line break → collapsed. 300-character template name → `slug` caps at 64; Windows zip (`a\b`) → `\` read as `/`
  (`TestImportWindowsZipAndLongNames`).
- Line separators in math shifted bad-math line numbers → escaped in `typstString`. Unreadable LaTeX now remembered
  per Typst run: welcome guide + bad math 425 → 250 ms per preview.
- Template lookup (50 user templates): 4 ms → 0.13 ms (user), 5 µs (built-in).
- Escaping sound: user text reaches Typst as `doc.json` data, never markup. 16 concurrent renders with cancellations
  under `-race`: clean.

### Word and web page export (`internal/docx`, `internal/html`)

- **XSS**: `[x](javascript:…)` (any case, control chars, `vbscript:`, `data:`, `java&#xFFFF;script:`) → `scriptURL`,
  aware of what `esc` drops (`TestLinksResolveAndTextIsEscaped`).
- **Invalid Word file** from hand-edited styles (negative spacing, `w:sz` 0 or > 1638 pt, absurd margins/columns) →
  `newWriter`/`twips`/`rpr` clamp (`TestOddStylesStayInWordsLimits`). Element order matches the OOXML schema.
- Footnote mark landed inside a quoted table/list (`TestFootnoteMarkBeforeQuotedBlocks`); a note inside a note lost
  lists/code → `flatText` in both writers (`TestNoteWithinNote`).
- Crafted 633-byte JPEG with EXIF rotation reserved ~2.3 GB → rotation skipped over 2²⁷ px.
- Web page: link inside a link, duplicate ids (`{#intro}` vs `# Intro`, `{#fn:1}`) fixed; `headingSizes: [0]`,
  negative `spaceAfter`, `titleAlign: "right"` handled.
- 400 random docs unzipped and parsed (valid XML, unique ids, paired bookmarks); 4.8 MB doc exports in 0.79 s.

### App service (`service.go`, `update.go`, `internal/{atomicfile,backup,versions,mdfmt}`)

- **Data loss**: New Document named like the open one overwrote it; Save As to the open document under another case,
  Unicode form or symlink deleted its settings (`os.SameFile`); restores ran after a failed backup, or failed part-way
  leaving mixed files (everything read first, put back on failure); concurrent saves corrupted `state.json`
  (serialized, atomic); exports and Share Template written in place (atomic); export without extension overwrote
  silently (Replace sheet); non-UTF-8 `.md` opened with � and saved so (refused); backup on a full disk left a 0-byte
  newest backup (atomic, removed on failure).
- `atomicfile.Write` reset 0600 and didn't fsync → fixed. Same-second backups overwrote each other
  (`TestWriteKeepsBackupsOfTheSameSecond`); DST-hour backups out of order (`TestListOrdersByInstant`); unprunable old
  backup failed the new one → best effort.
- BOM hid front matter → `withoutBOM` on every read. Paths with `[` didn't open. Long CJK names exceeded 255 bytes →
  `safeFileName`. Hidden `._Old.md` "holds no document"; symlinked loose `.md` replaced by a copy → fixed. Two loose
  `.md` in one folder collided on "Draft" versions. Empty `settings.json` closed Settings → blank reads as none.
- Auto format: **rewrote code samples** (`embeddedLanguageFormatting: "off"`, `TestFormatKeepsDocument`); **changed
  meaning** where oxfmt reads Markdown differently → compares the doc model before/after and leaves the text
  (`TestFormatLeavesWhatItWouldChange`, 0/370 change); unclosed `$$` named; hanging child → `WaitDelay`; failed oxfmt
  lookup cached → retried. Title/heading case fixes (`TestTitleCase`, `TestCaseHeadings`).
- Updater: Check for Updates during the daily check did nothing, or restarted a download → state checked under the
  lock. A `.peanut` passed to a running app opens (`OnSecondInstanceLaunch`).

### Editor and app UI (`frontend/src`)

- **Crash loop**: `[link](\n/uri)` threw on every update → shown as written.
- **Corruption**: autosave with a figure/table/equation dialog open replaced the wrong range → saves leave the editor
  text; dialogs close on document switch. **Data loss**: a Customize change then a quick switch wrote B's style into
  A → stale changes dropped; Remove Customization waits for pending saves.
- Figure/link dialogs escaped `\` and brackets inside math/code (`$\alpha$` → `$\\alpha$`) → escaped only outside
  them (`figure captions` test). Ref names with spaces or without `fig:` → `refLabel()`.
- Commands: arrows stepped inside hidden refs/figures (`moveChar`); bold/strike on an empty line moved the cursor;
  un-bolding misplaced it, `__b__` unremovable; whole-line styling hit the next line; headings on blank lines; Code
  Block in lists/quotes deleted markers or closed early. Palette: Unicode matching; punctuation-only query ran
  **New**.
- Opening B while A rendered showed A's pages (render generation). Panes out of sync after section focus or
  Customize. Listeners leaked across hot reloads. Ribbon widened the window at 960 px; long template names
  overflowed.
- Perf: refs/footnotes `coverage()` keystroke at 3000 sections 340 → 78 ms; viewport-bounded line styling 28.6 → 16.3
  ms; unchanged preview pages reused (50 pages 543 → 12.7 ms).
- Live app (WebKit): outline clicks, editor/preview scroll sync (within 0.12), outline highlight, 57 palette commands,
  ⌘Z after 21 keys at ~50 places: all as intended. Every shortcut bound as documented.

## Open (not fixed)

Decisions needed:

- A document opening with a `---` rule and another `---` later reads as front matter (Go, TS, `fillProperties`);
  Pandoc's rule (none if a blank line follows the opening `---`) could change how existing files read.
- `notes.md` and `notes.txt` in one folder share `backups/<time>/notes.md` (each lists the other's text); naming copies
  after their file hides existing `.txt` backups without a legacy-read rule.
- Unprefixed or unreferenceable labels (`{#cat}`, `fig:café`) still offered by the cross-ref dialog (renaming).
- Web page: broken pictures embedded as-is (Go verifies only PNG/JPEG/GIF); relative file links stay relative (Word
  makes `file:` URLs); `[x](#nowhere)` is a dead link (plain text in Word).
- Wordy, Journal, Academic draw page numbers at body size: a 72 pt custom size pushes them off the page.
- Duplicate template names allowed. Latin-1 files refused, not converted. Save As doesn't copy `../x.png` pictures.
- Preview font speed-up (`--ignore-system-fonts`, ~100 → 55 ms of a 260 ms preview) skipped: needs a font index and a
  fallback for emoji/CJK/symbols.

Limits accepted:

- Go `Parse` on a 2 000-deep list: ~11 s, all inside goldmark (`listParser.Continue`, cubic; 500 deep 0.19 s).
- Editor footnote numbers can still differ from the PDF for indented code or HTML inside list items and quotes (needs
  `readFootnotes` on top of `readBlocks`).
- Past 12 nesting levels Typst gets a flattened document: a labelled figure in a deep note-within-a-note keeps only its
  caption (refs `??`). A note's own second mark is dropped when an inner note marked it first (bounds the copies).
- A word broken by `overlong` copies with U+200B between letters; a 3 000-character title or header still overflows
  vertically.
- A picture name holding an entity (`a&amp;b.png`) can't round-trip (goldmark undoes escapes before entities).
- Block YAML (`|`, `- item`) unsupported in front matter.
- Title case capitalizes a minor word last before code (``A Guide To `go` ``); quoted/listed headings aren't recased.
- Hand-made template folders: a `\` in the name exports a zip Import can't read; symlinked folders aren't listed.
- 40 random bursts of keys didn't fully undo in pass 3; 21 keys × ~50 places did. CodeMirror history limits unchecked.
