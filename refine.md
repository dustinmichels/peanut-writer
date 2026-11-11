# Refine pass — 2026-11-11

Audit of every layer for crashes, wrong output on edge-case input, data-loss risks and slow paths. Each bug was
reproduced (throwaway Go tests, bun/happy-dom scripts, a Go↔TS numbering fuzzer, headless Chromium) before the fix,
and rechecked after. Throwaway scaffolding is deleted; permanent tests were added only where a regression would be
user-visible.

Verification at the end: `go vet ./...`, `go build ./...`, `go test -race ./internal/...` (all pass), `cd frontend &&
bun test && bunx vue-tsc --noEmit` (pass).

## Markdown → document model (`internal/doc`, `frontend/src/lib/markdown`)

| Bug (trigger)                                                                                                                                                               | Fix                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **App crash**: a footnote marked inside itself (`[^a]: Note [^a]`, or two notes marking each other) recursed into a fatal, uncatchable stack overflow                       | Mark skipped with warning `footnote marked inside itself`; `TestFootnoteMarkedInsideItself`                                                     |
| Link/image targets kept raw: `&amp;` and `\_` stayed in URLs, so `![f](a\_b.png)` was "image not found"                                                                     | New `destination()` decodes like goldmark's HTML renderer (links, reference links, images, figures, grid pictures); `TestDestinationsUnescaped` |
| Lone `\r` (old Mac line endings) not a line break: `one\rtwo` → `onetwo`                                                                                                    | `Parse` normalizes `\r\n`/`\r` to `\n` up front; `TestLineBreaks`                                                                               |
| `{width=nan}` made the model un-marshalable (Typst got `NaN%`)                                                                                                              | Non-finite/non-positive widths count as 0, as in TS                                                                                             |
| Cross-references in grid pictures' alt text never resolved                                                                                                                  | Private `walk` (skipped alt text) deleted; exported `Walk` used                                                                                 |
| A footnote defined twice reported as "nothing refers to"                                                                                                                    | Now `footnote label used twice`                                                                                                                 |
| Editor numbered figures differently from the PDF (867/3000 fuzzed docs): TS image regex rejected `<my pic.png>`, parens, empty `()`, brackets in alt, `'title'`, `\` breaks | `items.ts` follows goldmark; `figureMarkdown` wraps spaced paths in `<…>`; fuzzer 0/4000; sample `testdata/numbering/images.md`                 |
| Paste Table threw on `,` or `""`                                                                                                                                            | `parseDelimited` returns null for empty input                                                                                                   |
| **Perf**: `line()` recounted newlines from the start per block (quadratic)                                                                                                  | Line offsets built once, binary search: 2.1 MB doc 2044 ms → 157 ms                                                                             |

## Typst rendering and templates (`internal/render`, `internal/templates`)

| Bug (trigger)                                                                                                    | Fix                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[a]()`, `[](https://x)`, empty code fence, bare `>` killed the whole render ("dictionary does not contain key") | `peanut.typ` reads omitted fields with defaults; empty-URL link renders as text; cases in `TestHalfTypedRenders`                                                                                             |
| One unreadable image (HEIC, damaged PNG, broken SVG) killed preview and PDF                                      | After a failed compile, images are checked once; bad ones become missing-picture placeholders with a warning, then recompile. Shared `failing` helper with the math fallback; `TestUnreadableImageFallsBack` |
| `\r`, `\v`, `\f`, U+0085/2028/2029 in math shifted line numbers in the bad-math search                           | Escaped in `typstString`                                                                                                                                                                                     |
| A template `style` with a bad color imported fine, then every render failed                                      | `decode` runs `Style.Check()`; "bad color" import case                                                                                                                                                       |
| `"builtin": true` in a user `template.json` broke Rename/Delete/source lookup                                    | `loadUser` forces `Builtin=false`                                                                                                                                                                            |
| `template.json` with a UTF-8 BOM rejected → fell back to Classic                                                 | `decode` strips the BOM                                                                                                                                                                                      |
| `writeMeta` non-atomic                                                                                           | Uses `atomicfile.Write`                                                                                                                                                                                      |

Escaping was already sound: user text reaches Typst as `doc.json` data, never markup (≈30 hostile docs × 13 templates). 16
concurrent renders with cancellations under `-race`: no leaks or races.

## Word export (`internal/docx`)

| Bug (trigger)                                                            | Fix                                                                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Footnote mark landed inside a quoted table/list/code (`[^n]: > \| A \|`) | Look through leading quotes to the first real block; `TestFootnoteMarkBeforeQuotedBlocks`                   |
| A note inside a note lost lists, code, quotes (`See. (  )`)              | `flatText` writes all inner text inline; `TestNoteWithinNote`                                               |
| A crafted 633-byte JPEG with EXIF rotation reserved ~2.3 GB              | `upright` reads the header first and skips rotation over 2²⁷ px (embedded as-is, the existing failure path) |

400 random docs, every part unzipped and parsed: valid XML, unique rel/picture IDs, paired bookmarks. 4.8 MB doc exports in
0.79 s.

## Web page export (`internal/html`)

| Bug (trigger)                                                                                               | Fix                                                                                   |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **XSS**: `[x](javascript:alert(1))` (any case, tabs/control chars, `vbscript:`, `data:`) became a live link | `scriptURL` check; such links render as text                                          |
| Link inside a link (`[see @fig:a and note[^1]](http://x)`) broke the outer link                             | `inLink`: refs become plain text, footnote marks keep their id without a nested `<a>` |
| Duplicate ids: `{#intro}` figure vs `# Intro` heading, `{#fn:1}` vs footnote 1                              | Heading ids reserved first; clashing / `fn:`-prefixed labels get no id                |
| Note inside a note lost text                                                                                | `flatText`, matching docx                                                             |

All four in `TestLinksResolveAndTextIsEscaped`.

## App service (`service.go`, `update.go`, `internal/{atomicfile,backup,versions,mdfmt}`)

| Bug                                                                                                                                  | Fix                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Data loss**: New Document given the open document's name wrote a blank document over it (settings and template removed), no backup | `choosePackage` only skips the Replace sheet for the path being saved-as    |
| **Data loss**: restoring a version/backup proceeded when backing up the current text failed                                          | Stops on backup failure                                                     |
| **Data loss**: concurrent saves corrupted `state.json` (85 corrupt / 61 stale in 300 rounds)                                         | Serialized and atomic                                                       |
| `atomicfile.Write` reset 0600 → 0644 and didn't fsync                                                                                | Keeps mode; fsyncs before rename                                            |
| Two backups in the same second overwrote each other                                                                                  | Unique folders; `TestWriteKeepsBackupsOfTheSameSecond`                      |
| Exports (PDF/Word/HTML) written in place: a failure left a truncated file                                                            | `atomicfile.Write`                                                          |
| Export name typed without extension silently overwrote an existing `name.pdf` (Wails 3.1.0 macOS save panel ignores filters)         | `exportTarget` shows the Replace/Cancel sheet                               |
| A UTF-8 BOM hid the front matter and first heading                                                                                   | `withoutBOM` on OpenPath, LoadVersion, LoadBackup, SaveVersion              |
| Package paths containing `[` didn't open (read as glob)                                                                              | Literal lookup                                                              |
| Long CJK names made temp file names exceed 255 bytes (settings, template, Sync Files failed)                                         | `safeFileName` caps 80 chars / 200 bytes                                    |
| oxfmt lookup cached a failure until restart                                                                                          | Re-looks after a failure                                                    |
| Title case rewrote link URLs like `A_(b)_c`; heading case failed after a leading `---` or a closing `---` with trailing spaces       | Fixed; cases in `TestTitleCase`, `TestCaseHeadings`                         |
| Check for Updates did nothing while the daily check ran                                                                              | Waits for it, then checks                                                   |
| Backups in the hour clocks go back sorted out of order (local-time folder names)                                                     | Names carry the UTC offset; old names still read; `TestListOrdersByInstant` |
| A version restore failing part-way left new settings/template with the old text                                                      | Everything read first; replaced files put back on failure                   |

## Editor (`frontend/src/lib/editor`, `lib/commands.ts`)

| Bug (trigger)                                                                                                                             | Fix                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Crash loop**: `[link](\n/uri)` threw `RangeError` on every update                                                                       | Multi-line links shown as written                                               |
| Arrow keys stepped invisibly inside hidden refs, footnote marks, figures, tables                                                          | `moveChar` jumps over them                                                      |
| Bold/strike on an empty line moved the cursor down (`****` reads as a rule, `~~~~` as a fence)                                            | Cursor stays between the marks                                                  |
| Un-bolding misplaced the cursor; `__bold__`/`_it_` couldn't be removed                                                                    | `toggleMark` removes marks as written                                           |
| Styling whole selected lines also styled the next line (triple-click → Heading 1)                                                         | `selectedLines` excludes the trailing line start                                |
| Heading style turned blank lines into `## `                                                                                               | Blank lines skipped                                                             |
| Code Block off inside a list/quote deleted the `- `/`> ` marker, left a quoted closing fence behind, and wasn't found from the fence line | Block found via the parse tree from line end; fence removed from its own column |
| Code Block around text containing ` ``` ` closed early                                                                                    | Outer fence one backtick longer                                                 |
| Dropping a dragged figure/table sometimes did nothing (background parse changes state, not text)                                          | Only the text is compared                                                       |
| Command palette missed non-ASCII names (`franç`, `日本`, decomposed accents)                                                              | Unicode-aware, NFC-normalized matching                                          |
| **Perf**: refs/footnotes checked against every block; cursor moves rescanned all items per visible line                                   | `coverage()`: keystroke at 3000 sections 340 → 78 ms; cursor move 4.8 → 3.3 ms  |
| **Perf**: line styling walked off-screen lines of long code/quotes                                                                        | Viewport-bounded: 50k-line block 28.6 → 16.3 ms                                 |

~60 malformed docs (unclosed `$$`/fences/front matter, `[TOC]`, CRLF, emoji) with Backspace/Delete/arrows at every
position: nothing throws.

## App UI (`frontend/src/components`, `composables`, `lib/actions`, `lib/store`, `lib/scrollsync.ts`)

| Bug                                                                                                                                       | Fix                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Opening B while A rendered showed A's pages and outline (and section focus from A's headings)                                             | Render generation counter; `clearPreview()` on load                                       |
| **Corruption**: autosave/⌘S with a figure/table/equation dialog open filled front matter / formatted, then Apply replaced the wrong range | With a dialog open, saves write the file (properties filled in) but leave the editor text |
| Dialog for the old document stayed open after ⌘O / Dock open                                                                              | `loadDoc` closes it                                                                       |
| Focusing a section with the editor at top left the preview at page 1                                                                      | Focus re-syncs panes                                                                      |
| Panes out of sync after closing Design → Customize                                                                                        | Re-sync whenever both panes are visible and linked                                        |
| Names typed without `fig:`/`tbl:` or with spaces couldn't be cross-referenced                                                             | Shared `refLabel()`: `my cat` → `{#fig:my-cat}`                                           |
| Version names not trimmed (` Draft` ≠ `Draft`)                                                                                            | Trimmed                                                                                   |
| Window drag/drop/focus listeners leaked across hot reloads                                                                                | Removed on unmount                                                                        |
| **Perf**: every render re-parsed every page SVG and reloaded every `<img>`                                                                | Unchanged pages reused by SVG text: 50-page render 543 → 12.7 ms, no flicker              |

## Docs

- `docs/reference/syntax.md`: `date: today # or any text` implied comments work; they don't (the date printed the whole
  string). Example fixed, rule stated.

## Second pass

Rechecked everything above with fresh harnesses: a Go fuzzer each for the parser (1.6 M runs), Word, web page and
doc.json; 1 900 random documents typed into the editor's fields (incremental vs full rescans); goldmark's entity rules
against the editor's (26 cases, all equal); a cross-format checker comparing every caption, reference and note number in
the PDF (`pdftotext`), Word and web page across 7 templates; and all 13 templates rendering edge-case documents (long
titles, markup in front matter, `[TOC]` in quotes and lists, `######` to `#######`, items in lists and quotes). Two
independent reviews of the first pass's diff added ~2.5 M more incremental-rescan edits (single, character-level,
multi-change transactions and undo: 0 mismatches) and 31 editing-command probes on real CodeMirror states (all as
intended), and found the last four bugs below.

| Bug (trigger)                                                                                                                                                 | Fix                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Whole preview and PDF fail**: `\pagebreak` in a quote, list item or note ("pagebreaks are not allowed inside of containers"), in every template             | `peanut.typ` renders quotes, list items and notes with `show pagebreak: none`; `TestPageBreaksInContainers`                                                               |
| **Whole preview and PDF fail** in Book: any `# Heading` in a quote or list (its chapter rule breaks the page)                                                 | Same rule: such a heading is no chapter opening a page; still a heading in the outline                                                                                    |
| Footnote chains marking the next note twice copied notes 2ⁿ times (a 40-note chain: 2⁴⁰ copies)                                                               | Within a note each note is read once (`footnote marked twice within a note`); in `TestFootnoteMarkedInsideItself`                                                         |
| `go test ./internal/doc` didn't build (the chain test lacked imports)                                                                                         | Imports added                                                                                                                                                             |
| A `.peanut` passed to the app from the command line while it was running was ignored                                                                          | `OnSecondInstanceLaunch` opens it (relative paths from the launch folder); checked with two live instances under a scratch `HOME`                                         |
| **XSS** in web pages: `[x](java&#xFFFF;script:…)` (or a raw U+FFFE/U+FFFF) passed `scriptURL`, then `esc` dropped the character, leaving `javascript:`        | `scriptURL` ignores everything `esc` drops (shared `dropped`); case in `TestLinksResolveAndTextIsEscaped`                                                                 |
| Check for Updates… clicked during the daily check, then **Update** clicked: the waiting check restarted the updater mid-download and offered it again         | Updater state checked after the lock is held                                                                                                                              |
| An old backup that couldn't be pruned (locked in Finder) failed `backup.Write` after the new backup was written, so version/backup restores refused to run    | Pruning is best effort                                                                                                                                                    |
| Command palette: a query of only punctuation (`-`, `…`) matched every command, so Enter ran **New**                                                           | Such a query matches nothing; a blank one still lists all                                                                                                                 |
| **Perf**: every keystroke rescanned the whole document for figures, tables, equations, footnotes and the front matter (`fields.ts`), with one `toString` each | Incremental rescans (`restart.ts`: reread from the last line nothing open crosses, stop where the reading lines up again), one shared string per doc; per keystroke below |

| Per keystroke (fields)   | Before   | After   |
| ------------------------ | -------- | ------- |
| Typical prose, 150 KB    | 2.38 ms  | 0.15 ms |
| Dense with items, 150 KB | 12.8 ms  | 0.78 ms |
| Typical prose, 1 MB      | 14.8 ms  | 1.59 ms |
| Dense with items, 1 MB   | 107.3 ms | 7.35 ms |

Cross-reference spans per keystroke: 0.46 → 0.13 ms (150 KB), 6.4 → 0.67 ms (1 MB).

Cross-format check: across 7 templates × 60–80 random documents each, numbers agree except where expected: a figure in
a note marked from inside another note is numbered (and drawn) only in Typst, since Word and the web page write a note
within a note as bracketed text.

## Third pass

New harnesses: every Auto format checked against the document it formats (the doc model before and after, 370
documents: the dialect's constructs alone, in lists and quotes, run together, plus the samples, the welcome guide and
the syntax reference), render timings, and the real app in server mode driven in WebKit (outline clicks, editor and
preview scrolling, random typing, every palette command that doesn't open a system dialog).

| Bug (trigger)                                                                                                                                                                                                                                                | Fix                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Saving rewrote code samples**: Auto format (on by default) laid out the code in JavaScript, CSS, JSON, Markdown… code blocks (`{b:1}` → `{ b: 1 };`; in a `markdown` block it even closed fences and math, as in the syntax reference)                     | oxfmt runs with an explicit config, `embeddedLanguageFormatting: "off"`, which also keeps any `.oxfmtrc` near the temp folder out; `TestFormatKeepsDocument` has a JS block                      |
| **Saving changed the document** where oxfmt reads Markdown differently from the app: a table row without pipes under a table in a list became a paragraph, an equation right after a list item or quote moved into it, an indented code line became a figure | Format compares the document before and after (`reading`: the doc model without lines or spacing); if they differ it leaves the text as written and says so; `TestFormatLeavesWhatItWouldChange` |
| Saving with an equation still being typed (`$$` with no close) failed with "formatting would lose equation labels" (oxfmt closed it at the end of the document)                                                                                              | Detected before oxfmt runs: "an equation's closing $$ is missing"                                                                                                                                |
| **Perf**: a document holding math mitex can't read paid three Typst runs on every preview (compile, find the bad math, compile again)                                                                                                                        | Unreadable LaTeX is remembered per Typst (bounded): drawn as its source from the first run, and only new math is checked. Welcome guide + bad math: 425 → 250 ms per preview, as without it      |

Format harness after the fixes: 0 of 370 documents change meaning. Scroll sync in the live app: outline clicks put the
heading at the top of the editor and highlight it; scrolling the editor moves the preview proportionally (0 → 2275 px
over the guide) and the outline highlight always matched the heading above the editor's top; scrolling the preview
moved the editor to within 0.12 of the same place. 57 palette commands run with no page errors.

## Fourth pass

Round trips through the dialogs: what the figure, link, table and properties dialogs write, read back by the editor
and by `internal/doc` (13 captions × 8 file names, awkward table cells, front matter values), and ⌘Z after every
editing key at ~50 places in the welcome guide, in the live app.

| Bug (trigger)                                                                                                                                                                            | Fix                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Figure dialog broke math and code in captions**: it escaped every `\` and bracket, so `$\alpha$` was saved as `$\\alpha$` (a line break, then "alpha") and `` `a]b` `` as `` `a\]b` `` | Captions are escaped only outside code and math, which goldmark reads before brackets; the editor unescapes the same way; `figure captions` test |
| The editor didn't count a figure whose caption has a bracket in math or code (`![Interval $[0,1)$](a.png)`), so its numbers after it differed from the PDF's                             | The editor hides code and math from its image patterns (`masked`, same length so matches still index the text); numbering sample in `images.md`  |
| **Link dialog** escaped the selected text's backslashes too: `a\_b` became `a\\_b` (showing the backslash), `$\alpha$` broke as above                                                    | `linkText`: the selection is Markdown; only unescaped brackets outside code and math are escaped, and a trailing backslash doubled               |
| Math in a table cell kept its `\|`: `$\|x\|$` (the only way to write \|x\| in a cell) drew the norm ‖x‖ in PDF, Word and web page                                                        | `cellMath` undoes the escape, as goldmark already does for code; `TestTableCellPipes`                                                            |
| The table dialog read a code span holding a pipe (`` `x\|y` `` typed without the backslash) as one cell; the PDF (GFM) splits it in two                                                  | `splitRow` splits at every unescaped pipe, as GFM does                                                                                           |
| A property holding U+2028 or U+2029 (pasted text) was dropped by the editor (`.` doesn't match them), though the PDF showed it                                                           | The front matter line pattern uses the `s` flag                                                                                                  |

The third pass's undo lead didn't reproduce: 21 keys (Enter, Backspace, Tab, `#`, `$`, `|`, ⌘B…) at ~50 places,
each pressed twice and then undone, all restored the text exactly. Why 40 random bursts didn't fully undo is still
unexplained (CodeMirror's history limits are a guess, not checked).

## Fifth pass

The new `==highlight==` checked against itself: 29 edge cases (`===a===`, `a==b and c==d`, `x == y`, nesting with bold,
strike, links, code, math, escapes) read alike by the editor and `internal/doc`; rendered in all 13 templates, Word and
the web page (in a heading, the outline, a caption, a table, a note, the title); 940 k fuzzed parses. Nothing wrong.

| Bug (trigger)                                                                                                                                                                                                                | Fix                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| The editor missed figures whose caption has a code span of two backticks holding a single backtick and a bracket (as in ``` ``a`]b`` ```), so its numbers after them differed from the PDF's (419 of 3 000 fuzzed documents) | The code-span pattern allows shorter backtick runs inside, as CommonMark does; 0 of 9 000 differ; sample in `images.md` |

Shortcuts: every one in `docs/reference/shortcuts.md` and the palette is bound to what it says (menu accelerators in
`main.go`, editor keymaps).

**Biggest measured opportunity, not taken**: each preview is a fresh `typst compile`, and Typst reads every system
font's metadata on start: ~100 ms of the welcome guide's ~260 ms preview. With only the template's fonts
(`--ignore-system-fonts --font-path`), the same preview takes 55 ms. Doing that safely needs a family → file index
(parsing the fonts' `name` tables) and a fallback for text the template's fonts don't cover (emoji, CJK, symbols like
⌘, which system fonts supply now); a persistent `typst watch` per document would keep all fonts and add Typst's
incremental compilation, but changes how rendering works. Both need a decision.

## Sixth pass (checks only, no bugs found)

- Word: element order in every `rPr`, `pPr`, `tblPr`, `tcPr` and `sectPr` matches the OOXML schema (4 docs × 13
  templates, highlight included).
- Web page: `html-validate` finds only style rules (colons in ids like `fig:a`, which HTML allows) and no `lang` (the
  app has no document language; Typst assumes English).
- Outline lines (used by scroll sync and the outline highlight) point at the heading's line in 20 edge cases: front
  matter, setext, quotes, lists, HTML blocks, code and math blocks, notes, CRLF.
- Versions: saving renders from the saved file after the editor saves; restoring reads everything first and puts
  back what it replaced on failure.
- Preview font speed-up: skipped by decision.

## Seventh pass

Four areas run in parallel. **Templates**: 7 odd Word style sets with every part unzipped and checked against Word's
limits, 16 save names, 10 kinds of zip, 24 edge documents × 13 built-ins plus a user template (~350 previews), and 7
custom styles × 13 bases. **Service**: probes for odd paths, a full 2 MB ramdisk, a hanging oxfmt, and 12 goroutines ×
15 mixed calls under `-race`. **Markdown**: 20 k round trips per writer and 12 k documents compared between Go and TS.
**Live app**: Customize, Save as Template and Manage Templates driven in WebKit while chosen backend calls were held
back to force races.

| Bug (trigger)                                                                                                                       | Fix                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Data loss**: changing a colour in B, then opening A within 150 ms, wrote B's whole style into A's `.template.json`                 | `CustomizePane.vue` drops a pending change once another document has opened; `restyle()` in `actions/templates.ts` skips a stale change or result |
| Remove Customization during a style save gave an error, or brought the template back                                                 | `removeCustomTemplate` waits for pending saves                                                                                     |
| **Data loss**: Save As to the open document under another case, Unicode form or symlinked folder deleted its own settings and template | `sameFile` (`os.SameFile`): `choosePackage` treats it as saving itself                                                           |
| **Data loss**: a non-UTF-8 `.md` (Latin-1, UTF-16) opened with �, and the first save made that permanent                            | `OpenPath` refuses it and says to save it as UTF-8 first                                                                         |
| A backup on a full disk left a 0-byte newest backup (restoring it blanks the document)                                               | `backup.Write` is atomic and removes the folder on failure                                                                        |
| Auto format overran its timeout (20 s for 1 s) when oxfmt's launcher spawns a child; a stuck child hung it forever                   | `cmd.WaitDelay = 1s`                                                                                                             |
| Two loose `.md` files in one folder: the second's "Draft" version failed as existing                                                 | `versions.Save` adds its copy into the existing folder without replacing anything                                                 |
| A package renamed on a USB drive or share (`._Old.md` beside it) "holds no document"; a symlinked loose `.md` was replaced by a copy  | `docFile` skips hidden files and resolves a symlinked loose file                                                                  |
| Share Template over an existing zip emptied it before a failed export                                                               | Exported to a buffer, then `atomicfile.Write`                                                                                    |
| An empty `settings.json` (`touch`) closed the Settings dialog and blocked saving settings                                            | Blank file reads as no settings                                                                                                    |
| **Invalid Word file** from a hand-edited `template.json`: negative spacing, `w:sz="0"` or above 1638 pt, margins with no text width or in the trillions (negative picture sizes), columns under an inch wide | `newWriter` caps sizes, margins, columns and indent; `twips` and `rpr` clamp; `TestOddStylesStayInWordsLimits`                   |
| Web page: `headingSizes: [0]` hid headings; negative `spaceAfter`; `titleAlign: "right"` ignored                                    | `css()` falls back to the body size, floors at 0, and accepts `right`                                                            |
| Saving a template with a 300-character name failed (folder name too long); a Windows zip (`Thesis\template.typ`) was rejected      | `slug` caps at 64 characters; `Import` reads `\` as `/`; `TestImportWindowsZipAndLongNames`                                      |
| A font name with a line break showed a stray Typst warning on every preview                                                         | `Style.Check` collapses font names to one line                                                                                   |
| The window grew wider than itself when the ribbon tab didn't fit (Design at the 960 px minimum: Export and the preview cut off)       | `.ribbon { min-width: 0 }`: the ribbon scrolls on its own                                                                       |
| Long template names stretched gallery cards, ran under Manage Templates' buttons and past toasts                                    | Ellipsis in the gallery; wrapping in the dialog and toasts                                                                        |

| Template lookup, 50 user templates | Before | After   |
| ---------------------------------- | ------ | ------- |
| A user template                    | 4.0 ms | 0.13 ms |
| A built-in template                | 4.2 ms | 5 µs    |
| Per preview (two lookups)          | ~7 ms  | 0.27 ms |

Built-ins load directly, and a user template loads by its exact folder name. Checks that found nothing: odd names and
zips (`..`, `a/b`, emoji, reserved slugs, `__MACOSX`, zip bombs), Export → Import, custom templates on missing bases,
all built-ins on edge documents, odd paths and pictures, full-volume saves, version names, a corrupt `state.json`, a
failing or empty oxfmt, and front matter, table, figure and equation round trips.

Found, not fixed (the Markdown agent was stopped before fixing):

- **Slow**: a list nested 2 000 deep takes 6.1 s per rescan in TS (`Cursor.indent()` in `blocks.ts` counts all the
  white space ahead for every open container; fix: stop at the width the caller needs) and 17 s in Go `Parse`. A line of
  500 000 `[` takes 9.9 s in Go.
- A caption ending in `{…}` with no label loses that text (`Table: Values for {x}` → "Values for"); fix: the writers
  append `{}`.
- `frontMatterValue` (`service.go`) quotes with `strconv.Quote`, whose `\U…` escapes the editor's `unquote` doesn't
  decode. Flag emoji in a title starting with `#` gain literal backslashes after a Properties save.

## Known, not fixed

- **Decision needed**: a document opening with a `---` rule and another `---` later is read as front matter (Go, TS and
  `fillProperties`). Pandoc's rule (no front matter if a blank line follows the opening `---`) would fix it but could
  change how existing files read.
- Rotated photos under the pixel cap still hold three in-memory copies (~1 GB at 100 MP).
- Figures in a note-inside-a-note show their caption but no picture in HTML (and none at all in Word); existing
  unprefixed labels (`{#cat}`) still yield `@cat` from the cross-ref dialog (renaming needs a decision).
- ~60-deep nested quotes/lists exceed Typst's JSON nesting limit (error shown in preview).
- Reading each note once per top-level mark also drops a note's own second mark when an inner note marked it first
  (`a → b → c` and `a → c` shows c once, with the warning): the price of bounding the copies.
- A picture whose file name holds an entity (`a&amp;b.png`) can't be written so that goldmark reads it back: it
  undoes backslash escapes before entities (`\&amp;` still reads `&`), unlike CommonMark.
- Go and TS read some double-quoted front matter escapes differently (`\/`, `\x41`, `\ud83d`, a tab before `\"`, a
  leading U+FEFF); needs one shared escape set. Block YAML (`|`, `- item` lists) isn't supported.
- An unbreakable 3 000-character word runs off the page in every template. Duplicate template names are allowed.
- A malformed `settings.json` (wrong types) still closes the Settings dialog and toasts on every save. Latin-1 files
  are refused, not converted. Save As doesn't copy pictures referenced outside the folder (`../x.png`).
- `App.vue`'s grid column could be `minmax(0, 1fr)` so no other wide child can widen the app.
