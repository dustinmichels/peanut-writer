# Documents, saving and export

## Documents are packages

**New** (⌘N), **Save As** and the first save of an untitled document ask for a name and a place, then make a
`.peanut` package of that name there:

```text
Quarterly Update.peanut/
├── Quarterly Update.md              your document
├── Quarterly Update.settings.json   its settings, if any
├── Quarterly Update.template.json   its customized template, if any
├── images/                          its pictures
├── backups/                         automatic backups
└── versions/                        named versions you saved
```

Finder shows the package as a single file: double-click it to open it in Peanut Writer, and move, copy or send it like
any other file. Everything the document needs travels with it. To look inside, right-click it and choose **Show Package
Contents**, or use the folder button. Anywhere else (Terminal, Windows, Linux, cloud storage) it's an ordinary folder.

**Open** (⌘O) takes a package or any Markdown file. Save As starts beside the current document and brings its pictures
along. Choosing a name whose package already holds that document asks before replacing it.

## Saving

A document that has a file **saves itself** 2 seconds after you stop typing, and before you open another or quit.
Nothing asks. An untitled document needs ⌘S the first time, and asks before its changes are lost.

**File → Open Recent…** (⇧⌘O), the **File → Open Recent** submenu, or the ribbon's File → Recent lists the last 10
documents you opened or saved. In the ribbon's list, the × beside a document takes it off.

## Backups

A saved document is copied into a timestamped folder inside `backups/`, as both Markdown and Word:

- when it's opened,
- every 10 minutes,
- and when it's closed or replaced,

each time only if it changed since the last backup. The newest 10 are kept. Pictures aren't copied: the Word backup
embeds them, but the Markdown backup's picture paths point at the document's own `images/` folder.

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
versions newest first: the arrow button **loads** one, replacing the document's text, customized template and settings
(after asking; the text it replaces goes into backups first), and the folder button shows its files in Finder.
Versions are never removed automatically. Like backups, they don't copy pictures: the Word and PDF copies embed them,
and a loaded version uses the document's own `images/`.

## Export

The **Export** button (⌘E for PDF, ⇧⌘E for Word) saves a copy wherever you choose:

- **PDF** is exactly the preview.
- **Word (.docx)** uses real Word styles (Title, Heading 1–6, Caption, Quote…), numbered captions and live
  cross-reference fields, so whoever opens it can keep editing properly. No copy of Word is needed to make it.

## Sync files

**Sync files** (⇧⌘Y, File → Sync Files) saves the document, then writes `Name.pdf` and `Name.docx` beside
`Name.peanut` (or beside `Name.md`, for a Markdown file outside a package), replacing the previous copies, without any
dialogs. It's a quick way to always have an up-to-date PDF and Word file next to your document. The folder button
beside it shows the document's files in Finder.
