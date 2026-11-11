# Settings

Open settings from the settings button in the top bar, **Home → Settings**, or **File → Settings…** (⌘,). **Global** settings apply
to every document; **This Document** overrides them for the open one. A setting that differs from the global value has
a reset button (↺). Settings are grouped under **Auto format**, **Sync files**, **Peanut** and **Other** (the default
author).

![The Settings dialog's Global pane](/screenshots/settings.png)

| Setting                     | What it does                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auto format**             | On save (⌘S, Save As, Sync files, not autosave), tidies the Markdown: blank lines, list markers, table columns, trailing spaces. One undoable edit. On by default.                    |
| **Auto format headings**    | Also recases headings: **None**, **Title Case** ("The Lord of the Rings") or **Sentence case** ("The lord of the rings"). Acronyms, brand names like iPhone, and code are left alone. |
| **Sync files on save**      | [Syncs files](./documents#sync-files) each time you save (not autosave), if the document changed. Off by default.                                                                     |
| **Sync files on quit**      | Syncs files when you quit or open another document, if the document changed. On by default.                                                                                           |
| **Show Peanut**             | Shows [Peanut](./peanut) beside the ribbon tabs. On by default.                                                                                                                       |
| **Peanut's activity level** | **Chill** (the default): he gets up to something every half minute or so. **Busy**: every few seconds, and more often his tricks.                                                     |
| **Default author**          | Global only. Filled into new documents and any saved without an author. Defaults to your account's full name; leave it empty for none.                                                |

::: info Auto format needs oxfmt
It isn't bundled with the app. Install [Node.js](https://nodejs.org), then run `npm install -g oxfmt` in Terminal.
:::

## Where settings live

Both are plain JSON you can edit by hand:

- Global: `~/Library/Application Support/Peanut Writer/settings.json`
- This document: `Name.settings.json` beside `Name.md`

```json
{
  "autoFormat": true,
  "headingCase": "title",
  "syncOnSave": true,
  "syncOnQuit": false,
  "author": "Ann",
  "peanut": false,
  "peanutActivity": "busy"
}
```
