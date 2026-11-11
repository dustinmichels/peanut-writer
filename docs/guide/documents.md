# Documents, saving and export

## Creating and opening

**New** (⌘N), **Save As** and the first save of an untitled document ask for a name and a place, then make a
[`.peanut` package](./peanut-format) of that name there. Move, copy or send it like any file; double-click it to open
it. Save As starts beside the current document and brings its pictures along, and asks before replacing a document.

**Open** (⌘O) takes a package or any Markdown file. The start dialog, **File → Open Recent…** (⇧⌘O), the **File → Open
Recent** submenu and the ribbon's File → Recent list the last 10 documents; the × beside one takes it off.

## Saving

A document with a file **saves itself** 2 seconds after you stop typing, and before you open another or quit. An
untitled document needs ⌘S the first time, and asks before its changes are lost.

## Finding it in Finder

Two folder buttons in the title bar (also in the command palette) open the document in Finder. Both wait until an
untitled document is saved.

| Button                                  | Opens                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Show in Finder** (closed folder)      | The folder holding `Name.peanut`, with the package selected, next to its [synced](#sync-files) `Name.pdf` and `Name.docx` |
| **Show Package Contents** (open folder) | Inside the package, with `Name.md` selected. Unavailable for a Markdown file outside a package                            |

## Backups

The document's text is copied into a timestamped folder in `backups/` when it's opened, every 10 minutes, and when it's
closed or replaced, each time only if it changed. The newest 10 are kept. Pictures aren't copied; the backups use the
document's own `images/`.

## Versions

A version is a snapshot you name, kept until you delete it, with Word and PDF copies:

```text
versions/Sent to Ana/
├── Quarterly Update.md              the text
├── Quarterly Update.settings.json   its settings, if any
├── Quarterly Update.template.json   its customized template, if any
├── Quarterly Update.docx            a Word copy
└── Quarterly Update.pdf             a PDF copy
```

**View → Versions** opens the Versions pane: type a name and choose **Save Version** (it saves the document first; each
name is used once). The pane lists versions newest first; the arrow button opens one and the folder button shows its
files. The ribbon's **Versions** tab lists the 5 newest versions and the 5 newest backups: **New Version** saves one,
**All Versions** opens the pane.

Opening a version replaces the document's text, customized template and settings; opening a backup replaces only the
text. Both ask first, and the text they replace goes into backups.

## Export

The **Export** button saves a copy wherever you choose:

- **PDF** (⌘E) is exactly the preview.
- **Word** (⇧⌘E) uses real Word styles (Title, Heading 1–6, Caption, Quote…), numbered captions and live
  cross-reference fields, so whoever opens it can keep editing. Word isn't needed to make it.
- **Web page** (⌥⌘E) is a single `.html` file with its pictures and equations inside, in the template's fonts and
  colors. The contents, cross-references and footnotes are links. It has no columns or page numbers; page breaks apply
  only when printed.

## Sync files

**Sync files** (⇧⌘Y, File → Sync Files) saves the document and writes `Name.pdf` and `Name.docx` beside it, replacing
the previous copies without asking. With **Sync files on quit** (on by default) they're also refreshed when you quit or
open another document, and with **Sync files on save** each time you save, whenever the document changed since they
were written. Both are in [Settings](./settings).
