# Settings

Open settings from the settings button in the top bar, **Design → Settings**, or **File → Settings…** (⌘,). There are
two panes:

- **Global** settings apply to every document.
- **This Document** settings override them for the open document only. Anything a document doesn't set uses the global
  value.

| Setting                 | What it does                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auto format**         | Tidies the document's Markdown each time you save (⌘S, Save As, Sync files): blank lines, list markers, table columns, trailing spaces. Autosaves don't format. It's one undoable edit. |
| **Title case headings** | With Auto format, also puts headings in title case ("The Lord of the Rings"). Acronyms, brand names like iPhone, and code are left alone.                                               |
| **Show Peanut**         | Peanut, your writing buddy, keeps you company beside the ribbon tabs. On unless you turn it off.                                                                                        |
| **Default author**      | Global only. Put in the properties of each new document. Until it's set, it's your computer account's full name; leave it empty for none.                                               |

::: info Auto format needs two extra tools
Auto format uses [oxfmt](https://oxc.rs/docs/guide/usage/formatter), which isn't bundled with the app. Install
[Node.js](https://nodejs.org), then run `npm install -g oxfmt` in Terminal.
:::

## Where settings live

Both are plain JSON files you can edit by hand:

- Global: `~/Library/Application Support/Peanut Writer/settings.json`
- This document: `Name.settings.json` beside `Name.md` (written when an untitled document is first saved; Save As
  brings it along)

```json
{ "autoFormat": true, "titleCase": true, "author": "Ann", "peanut": false }
```
