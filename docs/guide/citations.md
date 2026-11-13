# Citations with Zotero

Peanut Writer can cite the sources in your [Zotero](https://www.zotero.org) library, much as Zotero's plugin for
Word does: search your library, pick a source, and the citation and reference list are written in the style you
choose (APA, Chicago, IEEE and others), in the preview, the PDF, the Word file and the web page alike.

It's optional, and off until you turn it on. Writing without citations needs none of this.

## Why it needs Better BibTeX

Zotero keeps your library, but on its own it doesn't let other apps search it or copy sources out of it. **Better
BibTeX**, a free and widely used Zotero add-on, does both, and gives each source a short, stable **citation key** such
as `smith2020`. Peanut Writer writes that key in your text, `[@smith2020]`, and asks Better BibTeX for the source's
details. Both run on your computer: nothing goes over the internet.

## Setting it up

You do this once.

1. **Install Zotero 7**, free from [zotero.org/download](https://www.zotero.org/download/), and open it. If your
   library is already in Zotero, you're set.
2. **Install Better BibTeX** in Zotero:
   1. Download the `.xpi` file of the latest release from
      [Better BibTeX's releases](https://github.com/retorquere/zotero-better-bibtex/releases/latest) (under
      **Assets**). In Firefox, right-click it and choose **Save Link As**, or Firefox tries to install it itself.
   2. In Zotero, choose **Tools → Plugins**.
   3. Drag the `.xpi` file onto that window, or click the gear menu and choose **Install Plugin From File…**, then
      pick the file.
   4. Restart Zotero when it asks. The first time, Better BibTeX takes a moment to give every source a key.

   [Better BibTeX's own install guide](https://retorque.re/zotero-better-bibtex/installation/) has more detail.

3. **Turn on citations** in Peanut Writer: **Settings → Zotero citations**. A **Citations** group appears on the
   **References** tab.

The Citation dialog checks for Zotero and Better BibTeX each time it opens. If one is missing it shows these steps,
ticking off what's done, with a **Check again** button.

## Citing

Zotero needs to be open while you add citations.

**References → Citation** searches your library by author, title or year. Pick one or more sources (Enter, or a
click), add a page or section if you like ("p. 4"), and **Insert** (⌘↩). The citation goes in the text as `[@key]`,
and the preview shows it as the style writes it: "(Smith & Doe, 2020, p. 4)" in APA, "[1, p. 4]" in IEEE. The
dialog's **Citation style** sets the style for the whole document.

You can also type citations: `[@smith2020]`, `[@smith2020, p. 4]`, or several together, `[@lee2019; @smith2020]`
(see [the syntax](../reference/syntax#citations)).

## The reference list

The list of works cited goes at the end of the document, under a **References** heading. **References → References**
puts a `[References]` line at the cursor instead, to place the list before an appendix or under a heading of your
own.

## Where sources are kept

Each source you cite is copied from Zotero into `Name.bib`, beside the document in its package. So the document
renders, exports and opens on another computer without Zotero, and named versions keep its sources with it. Turning
**Zotero citations** off only hides the Citations buttons: citations already in a document still show.

Changed a source in Zotero, say fixed a title? **References → Update** fetches every cited source again, and drops the
ones the document no longer cites.

A citation of a key `Name.bib` doesn't have shows as `[key?]` in bold, and is listed in the status bar's notes.

## In Word and the web page

Citations and the reference list are text, written by the same typesetter as the PDF, so all three read the same.
They aren't Zotero fields, so the Zotero plugin for Word can't edit them there.

## If something's wrong

- **"Zotero isn't open"**: open Zotero, then **Check again**.
- **"…without the Better BibTeX add-on"**: install it (above) and restart Zotero.
- **A source isn't listed**: sources without a citation key are left out. Check that it has one in Zotero (Better
  BibTeX shows it at the top of the item's info).
- **Update kept a source as it was**: Update fetches from **My Library**; a source from a group library keeps the
  copy it has. Cite it again from the dialog to refresh it.
