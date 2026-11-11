# Templates

A template is the whole look of a document: page size and margins, fonts, colors, how headings, captions and tables are
set, and how the title block is laid out. It's how Peanut Writer [keeps style apart from
content](./style-and-content).

## Choosing a template

The **Design** tab shows each template on a sample page. Click one and the preview changes; your text doesn't. The
choice is saved in the document. You can also switch from the [command palette](./writing#the-command-palette).

![The Design tab: each template on a sample page, then Customize and Manage Templates](/screenshots/design-tab.png)

Built in are _Classic_ (the default: Georgia, calm and simple), _Wordy_ (like a fresh Word document), _Academic_,
_Report_, _Minimal_, _Manuscript_,
_Elegant_, _Editorial_, _Journal_ (two columns) and _Peanut_. See
[the built-in templates](./style-and-content#the-built-in-templates) for what each looks like.

## Customizing one document

**Design → Customize** gives the open document its own template, starting from the one it uses. The editor turns into
a panel of choices:

- **Template**: the template it's based on. Changing it keeps your font and color changes.
- **Fonts**: body, heading and code fonts, and the body size. Each font in the list is shown in itself; type to find
  one. A font marked _no preview_ is one Typst has that the app can't draw (such as those built into Typst).
- **Colors**: text, headings, title, captions, accent and table headers.

The preview shows each change as you make it. **Done** goes back to the editor; **Remove Customization** goes back to
the original template. **Save as Template** (in the panel, or **Design** while the document has its own
template) adds the customization to your templates under a name, for any document to use. A customized document's own
template shows first in the template gallery.

![Customizing a document's template: fonts and colors on the left, the preview following on the right](/screenshots/customize.png)

The customization is kept beside the document as `Name.template.json`, and reaches both the PDF and the Word file.

## Managing your own templates

**Design → Manage Templates** lists the templates you've made or been sent (not the built-in ones). For each you can:

- **Use** it for the open document.
- **Rename** it and change its description.
- **Show its files** in Finder to edit them.
- **Share** it: saves a `.zip` to send to someone.
- **Delete** it. A document that used it goes back to _Classic_.

**Import…** adds a shared `.zip` as a new template, and **Open Folder** shows the templates folder.

To write a template of your own, see [Making your own template](../reference/custom-templates).
