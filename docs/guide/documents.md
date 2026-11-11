# Documents, saving and export

## Documents are packages

A Peanut Writer document is a `.peanut` **package**: a folder that Finder shows as a single file. **New** (⌘N),
**Save As** and the first save of an untitled document ask for a name and a place, then make a package of that name
there:

```text
Quarterly Update.peanut/
├── Quarterly Update.md              your document
├── Quarterly Update.settings.json   its settings, if any
├── Quarterly Update.template.json   its customized template, if any
├── images/                          its pictures
├── backups/                         automatic backups
└── versions/                        named versions you saved
```

Everything the document needs travels with it, so double-click it to open it in Peanut Writer, and move, copy or send
it like any other file. The text itself is plain Markdown, readable by any editor. Anywhere that doesn't know about
packages (Terminal, Windows, Linux, cloud storage) it's an ordinary folder.

**Open** (⌘O) takes a package or any Markdown file. Save As starts beside the current document and brings its pictures
along. Choosing a name whose package already holds that document asks before replacing it.

### Seeing it in Finder: outside or inside

Two folder buttons in the title bar, also in the command palette (⇧⌘P), open the document in Finder:

| Button                                  | Opens                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Show in Finder** (closed folder)      | **Outside**: the folder that holds `Name.peanut`, with the package selected, next to its [synced](#sync-files) `Name.pdf` and `Name.docx`. |
| **Show Package Contents** (open folder) | **Inside**: the package itself, with `Name.md` selected, so you can see its pictures, backups and versions.                                |

Show Package Contents is the same as right-clicking the package in Finder and choosing **Show Package Contents**. It's
unavailable for a Markdown file that isn't in a package; Show in Finder then shows the file itself. Both are
unavailable until an untitled document is saved.

## Saving

A document that has a file **saves itself** 2 seconds after you stop typing, and before you open another or quit.
Nothing asks. An untitled document needs ⌘S the first time, and asks before its changes are lost.

The start dialog, **File → Open Recent…** (⇧⌘O), the **File → Open Recent** submenu, or the ribbon's File → Recent
lists the last 10 documents you opened or saved. In the dialogs, the × beside a document takes it off.

## Backups

A saved document's Markdown is copied into a timestamped folder inside `backups/`:

- when it's opened,
- every 10 minutes,
- and when it's closed or replaced,

each time only if it changed since the last backup. The newest 10 are kept. Pictures aren't copied: the backup's
picture paths point at the document's own `images/` folder. For Word and PDF copies, save a [version](#versions).

## Versions

**View → Versions** opens the Versions pane beside the editor. Type a name and choose **Save
Version** to keep the document as it is now, in `versions/<name>/`:

```text
versions/Sent to Ana/
├── Quarterly Update.md              the text
├── Quarterly Update.settings.json   its settings, if any
├── Quarterly Update.template.json   its customized template, if any
├── Quarterly Update.docx            a Word copy
└── Quarterly Update.pdf             a PDF copy
```

Saving a version saves the document first (an untitled one asks where). Each name is used once. The pane lists the
versions newest first: the arrow button **opens** one, replacing the document's text, customized template and settings
(after asking "Open this version?"; the text it replaces goes into backups first), and the folder button shows its
files in Finder. Versions are never removed automatically. Like backups, they don't copy pictures: the Word and PDF
copies embed them, and an opened version uses the document's own `images/`.

The ribbon's **Versions** tab shows the 5 newest named versions and, after a dividing line, the 5 newest backups.
**New Version** asks for a name and saves a version, like the pane. Click a named version or a backup to open it, after
the same question; a backup replaces only the document's text, and the text it replaces goes into backups first. **All
Versions** opens the pane.

## Export

The **Export** button (⌘E for PDF, ⇧⌘E for Word, ⌥⌘E for a web page) saves a copy wherever you choose:

- **PDF** is exactly the preview.
- **Word (.docx)** uses real Word styles (Title, Heading 1–6, Caption, Quote…), numbered captions and live
  cross-reference fields, so whoever opens it can keep editing properly. No copy of Word is needed to make it.
- **Web page (.html)** is a single file with the pictures and equations inside, styled after the template's fonts and
  colors. The table of contents, cross-references and footnotes are links. It has no text columns or page numbers, and
  page breaks apply only when it's printed.

## Sync files

**Sync files** (⇧⌘Y, File → Sync Files) saves the document, then writes `Name.pdf` and `Name.docx` beside
`Name.peanut` (or beside `Name.md`, for a Markdown file outside a package), replacing the previous copies, without any
dialogs. It's a quick way to always have an up-to-date PDF and Word file next to your document. **Show in Finder** (the
closed-folder button in the title bar) shows them, beside the document.

The copies are kept up to date without you thinking about it: with **Sync files on quit** (on unless you turn it off
in [Settings](./settings)), quitting or opening another document syncs them too, whenever you've changed the document
since they were last written. Turn on **Sync files on save** to also sync them each time you save.
