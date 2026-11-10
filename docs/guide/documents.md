# Documents, saving and export

## Documents are folders

**New** (⌘N), **Save As** and the first save of an untitled document ask for a name and a place, then make a folder of
that name there:

```text
Quarterly Update/
├── Quarterly Update.md              your document
├── Quarterly Update.settings.json   its settings, if any
├── Quarterly Update.template.json   its customized template, if any
├── images/                          its pictures
├── backups/                         automatic backups
└── out/                             synced PDF and Word copies
```

Everything the document needs travels with it: zip the folder and send it, or put it in Dropbox or iCloud. Save As
starts beside the current document's folder and brings its pictures along. Choosing a name whose folder already holds
that document asks before replacing it.

## Saving

A document that has a file **saves itself** 2 seconds after you stop typing, and before you open another or quit.
Nothing asks. An untitled document needs ⌘S the first time, and asks before its changes are lost.

**File → Open Recent** (or the ribbon's File → Recent) lists the last 10 documents you opened or saved. In the ribbon's
list, the × beside a document takes it off.

## Backups

A saved document is copied into a timestamped folder inside `backups/`, as both Markdown and Word:

- when it's opened,
- every 10 minutes,
- and when it's closed or replaced,

each time only if it changed since the last backup. The newest 10 are kept. Pictures aren't copied: the Word backup
embeds them, but the Markdown backup's picture paths point at the document's own `images/` folder.

## Export

The **Export** button (⌘E for PDF, ⇧⌘E for Word) saves a copy wherever you choose:

- **PDF** is exactly the preview.
- **Word (.docx)** uses real Word styles (Title, Heading 1–6, Caption, Quote…), numbered captions and live
  cross-reference fields, so whoever opens it can keep editing properly. No copy of Word is needed to make it.

## Sync files

**Sync files** (⇧⌘Y, File → Sync Files) saves the document, then writes `Name.pdf` and `Name.docx` into its `out/`
folder, replacing the previous copies, without any dialogs. It's a quick way to always have an up-to-date PDF and Word
file beside your document. The folder button beside it opens the document's folder in Finder.
