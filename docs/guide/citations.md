# Citations

Peanut Writer cites sources and writes the reference list in the style you choose (APA, Chicago author-date, IEEE
and others), in the preview, the PDF, the Word file and the web page alike. Each document keeps its own references:
enter them in the app, or, if you use [Zotero](https://www.zotero.org), cite straight from your library.

## Adding references

**Citations & Footnotes → Citation** lists the document's references. **New reference** opens a form: the type
(journal article, book, chapter, conference paper, report, thesis, web page or other), the authors, one per line as
"Last, First", the title, year, journal or book, publisher, volume, issue, pages, DOI and URL. Leave the key empty and
one is made from the first author, the year and the title, such as `smith2021dna`. **Save** (⌘↩) and the new reference
is picked, ready to cite.

The pencil beside a reference edits it. Its key stays as it is, since citations use it. **Delete reference** takes
it out; citations of it then show as missing.

### Looking up a DOI or ISBN

At the top of the form, put a DOI or an ISBN in **Fill in from a DOI or ISBN** and click **Look up**. Peanut Writer
fetches the details from doi.org (for a DOI) or Open Library (for an ISBN) and fills in the form, so it needs the
internet. Check what it found, change anything you like, then **Save**. Leave the key empty and it's made from the
author, year and title as usual.

## Importing

**Import…** in the Citation dialog, or **Citations & Footnotes → Import**, brings in references you already have.
Paste BibTeX or RIS, or **Choose file…** to open a `.bib`, `.ris` or `.txt` file: another document's `Name.bib`, say,
or an export from Zotero, Mendeley, EndNote or Google Scholar.

It lists what it found, each ticked to import. Ones the document already has (the same DOI, or the same title and
year) are unticked and say "Already in the references as @key". A reference whose key is already taken gets a new
one. BibTeX entries keep all their fields, even ones the form doesn't show.

## The References pane

**Citations & Footnotes → All Sources** opens the References pane beside the editor, on the left like Versions, and
closes it again. It lists every reference, sorted by author, with how often it's cited: "Cited 3 times", or "Not
cited", dimmed. Type in the box at the top to filter the list. **New** and **Import** add references from there too.

Click a reference to jump to its next citation in the text; click again for the one after. The pencil edits it.

## Citing

In the Citation dialog, search the references by author, title, year or key. Pick one or more (Enter, or a click),
add a page or section if you like ("p. 4"), and **Insert** (⌘↩). The citation goes in the text as `[@key]`, and the
preview shows it as the style writes it: "(Smith and Doe 2021, p. 4)" in Chicago author-date, "[1, p. 4]" in IEEE.
The dialog's **Citation style** sets the style for the whole document.

You can also type citations: `[@smith2021dna]`, `[@smith2021dna, p. 4]`, or several together,
`[@lee2019; @smith2021dna]` (see [the syntax](../reference/syntax#citations)).

### In the editor

Type `[@` and the editor offers the document's reference keys, each with its author, year and title; keep typing to
narrow them, and Enter to pick one. Point at a citation to see its reference, with **Edit** to change it. A citation
of a key the document doesn't have says "Not in this document's references", with **Add reference…** to open the form
with that key filled in.

## The reference list

The list of works cited goes at the end of the document, under a **References** heading. **Citations & Footnotes →
Reference List** puts a `[References]` line at the cursor instead, to place the list before an appendix or under a
heading of your own. It lists the sources cited, not every reference the document keeps.

A citation of a key the references don't have shows as `[key?]` in bold, and is listed in the status bar's notes.

## Where references are kept

In `Name.bib`, a BibLaTeX file beside the document in its package. So the document renders, exports and opens on
another computer as it is, and named versions keep its references with it. Other programs can read the file; fields
the form doesn't show (an abstract, say) are kept when you edit a reference.

## From Zotero

Turn on **Settings → Zotero citations** and the Citation dialog gets a **Zotero** tab that searches your Zotero library,
much as Zotero's plugin for Word does. A source you cite from it is copied into the document's references. It's
optional, and off until you turn it on.

### Why it needs Better BibTeX

Zotero keeps your library, but on its own it doesn't let other apps search it or copy sources out of it. **Better
BibTeX**, a free and widely used Zotero add-on, does both, and gives each source a short, stable **citation key** such
as `smith2020`. Peanut Writer writes that key in your text, `[@smith2020]`, and asks Better BibTeX for the source's
details. Both run on your computer: nothing goes over the internet.

### Setting it up

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

3. **Turn on citations** in Peanut Writer: **Settings → Zotero citations**.

The Zotero tab checks for Zotero and Better BibTeX each time it opens. If one is missing it shows these steps, ticking
off what's done, with a **Check again** button. Zotero needs to be open while you cite from it.

### Keeping sources up to date

Changed a source in Zotero, say fixed a title? **Citations & Footnotes → Update** fetches every cited source again. References
Zotero doesn't have (ones you entered yourself, or from a group library) and those not cited stay as they are.

Citations and the reference list are text in Word, written by the same typesetter as the PDF. They aren't Zotero
fields, so the Zotero plugin for Word can't edit them there.

### If something's wrong

- **"Zotero isn't open"**: open Zotero, then **Check again**.
- **"…without the Better BibTeX add-on"**: install it (above) and restart Zotero.
- **A source isn't listed**: sources without a citation key are left out. Check that it has one in Zotero (Better
  BibTeX shows it at the top of the item's info).
- **Update kept a source as it was**: Update fetches from **My Library**; a source from a group library keeps the
  copy it has. Cite it again from the Zotero tab to refresh it.
