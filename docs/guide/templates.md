# Templates

A template is the whole look of a document: page size and margins, fonts, colors, and how headings, captions, tables and
the title block are set. Switching templates never changes your text ([why](./style-and-content)).

## Choosing a template

The **Design** tab shows each template on a sample page; click one and the preview changes. The choice is saved in the
document. The [command palette](./writing#the-command-palette) has a command per template too.

![The Design tab: each template on a sample page, then Customize and Manage Templates](/screenshots/design-tab.png)

## Built-in templates

| Template       | Looks like                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------- |
| **Classic**    | Timeless and calm: Georgia, pine-green headings, italic subheads, 1-inch margins. Default.      |
| **Wordy**      | A fresh Word document: Aptos, blue headings, 1-inch margins.                                    |
| **Academic**   | A LaTeX article: Computer Modern, numbered sections, justified text, centered title.            |
| **Report**     | A business report: serif body, crisp sans headings, a teal accent, running headers.             |
| **Technical**  | Docs and specs: PT Sans, numbered headings in slate blue, code panels, quotes as note callouts. |
| **Memo**       | An office memo: From / Date / Re / Subject between navy rules, a summary bar, "Page n of N".    |
| **Minimal**    | Quiet Swiss-style sans: black and grays, generous white space, hairline rules.                  |
| **Manuscript** | An APA-style paper ready to submit: Times 12 pt, double spaced, indented paragraphs.            |
| **Book**       | Long writing: Palatino, a title page, each chapter on a new page, indented justified text.      |
| **Elegant**    | A finely set book page: old-style serif, justified text, small-caps headings, claret.           |
| **Editorial**  | A modern magazine feature: Iowan Old Style text, Avenir Next headlines, brick red, pull quotes. |
| **Journal**    | A two-column paper: STIX Two at 10 pt, numbered sections, title and abstract across the top.    |
| **Peanut**     | Warm and friendly: rounded headings, roasted-peanut browns, soft cream table headers.           |

## Customizing one document

**Design → Customize** gives the open document its own copy of its template. The editor becomes a panel of choices:

- **Template**: the one it's based on. Changing it keeps your font and color changes.
- **Fonts**: body, heading and code fonts, and the body size. Each font is shown in itself; type to find one. _No
  preview_ marks a font Typst has but the app can't draw (such as those built into Typst).
- **Colors**: text, headings, title, captions, accent and table headers.

The preview follows each change, and every change applies to the whole document. **Done** goes back to the editor;
**Remove Customization** goes back to the original template. **Save as Template** (in the panel, or on **Design**)
adds it to your templates for any document to use. A customized document's own template shows first in the gallery.

![Customizing a document's template: fonts and colors on the left, the preview following on the right](/screenshots/customize.png)

The customization is saved beside the document as `Name.template.json` and reaches both the PDF and the Word file.

## Managing your own templates

**Design → Manage Templates** lists the templates you've made or been sent. For each you can **Use** it, **Rename** it
and change its description, **Show its files** in Finder, **Share** it as a `.zip`, or **Delete** it (documents using
it go back to _Classic_). **Import…** adds a shared `.zip`; **Open Folder** shows the templates folder.

To write one from scratch, see [Making your own template](../reference/custom-templates).
