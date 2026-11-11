# The .peanut format

A `.peanut` document looks like one file in Finder, but it's an ordinary folder:

```text
Quarterly Update.peanut/
├── Quarterly Update.md              the content: your text, plain Markdown
├── Quarterly Update.template.json   the style, if you customized it
├── Quarterly Update.settings.json   its settings, if any
├── images/                          its pictures
├── backups/                         automatic backups of the text
└── versions/                        named versions you saved
```

No zip, no database: just text, JSON and your pictures.

## Why a package

Because [style lives apart from content](./style-and-content), one document is several files, and loose files get
separated: a text file emailed without its `images/` folder loses its pictures. The package keeps them together, so
moving, copying, renaming or sending the document takes all of it.

## Looking inside

Right-click the `.peanut` file in Finder and choose **Show Package Contents**, or use the
[same button](./documents#finding-it-in-finder) in Peanut Writer's title bar. `Name.md` opens in any text editor or
Markdown app ([how it reads there](../reference/markdown-flavor#in-other-markdown-apps)), and the rest are ordinary
files. Anywhere that doesn't know about packages (Terminal, Windows, Linux, cloud storage) a `.peanut` is simply a
folder, so your writing is never locked in.

Peanut Writer also opens a plain `.md` file outside a package; its pictures, settings and template then sit beside it.
