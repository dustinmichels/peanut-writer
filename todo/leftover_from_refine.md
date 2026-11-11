# Leftover from refine (2026-11-11)

Open items from the 2026-11-11 refine passes that need a decision before fixing.

- [ ] **`---` rule vs front matter**: a document opening with a `---` rule and another `---` later reads as front
      matter (Go, TS, `fillProperties`). Pandoc's rule (no front matter if a blank line follows the opening `---`)
      would fix it but could change how existing files read.
- [ ] **Backups of same-named files**: `notes.md` and `notes.txt` in one folder share `backups/<time>/notes.md`, so
      each lists the other's text. Naming backups after the full file name hides existing `.txt` backups unless a
      legacy-read rule is added.
- [ ] **Unusable cross-ref labels**: the cross-ref dialog still offers unprefixed or unreferenceable labels (`{#cat}`,
      `fig:café`). Fixing it means renaming them or hiding them.
- [ ] **Web page export**:
  - Broken pictures are embedded as-is (Go verifies only PNG/JPEG/GIF).
  - Relative file links stay relative (Word makes `file:` URLs).
  - `[x](#nowhere)` is a dead link (plain text in Word).
- [ ] **Page numbers off the page**: Wordy, Journal and Academic draw page numbers at body size, so a 72 pt custom
      size pushes them off the page.
- [ ] **Duplicate template names** are allowed.
- [ ] **Latin-1 files** are refused rather than converted.
- [ ] **Save As pictures**: Save As doesn't copy pictures referenced as `../x.png`.
- [ ] **Preview font speed-up**: `--ignore-system-fonts` cuts font loading from ~100 to 55 ms of a 260 ms preview. It
      needs a font index and a fallback for emoji, CJK and symbols.
