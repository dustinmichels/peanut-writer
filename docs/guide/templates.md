# Templates

A template is the whole look of a document: page size and margins, fonts, colors, how headings, captions and tables are
set, and how the title block is laid out. It's how Peanut Writer [keeps style apart from
content](./style-and-content).

## Choosing a template

The **Design** tab shows each template on a sample page. Click one and the preview changes; your text doesn't. The
choice is saved in the document. You can also switch from the [command palette](./writing#the-command-palette).

Built in are _Classic_ (the default, like a fresh Word document), _Academic_, _Report_, _Minimal_, _Manuscript_,
_Elegant_, _Editorial_, _Journal_ (two columns) and _Peanut_. See
[the built-in templates](./style-and-content#the-built-in-templates) for what each looks like.

## Customizing one document

**Design → Customize** gives the open document its own template, starting from the one it uses. The editor turns into
a panel of choices:

- **Template**: the template it's based on. Changing it keeps your font and color changes.
- **Fonts**: body, heading and code fonts, and the body size.
- **Colors**: text, headings, title, captions, accent and table headers.
- **Save as template**: adds the customization to your templates under a name, for any document to use.

The preview shows each change as you make it. **Done** goes back to the editor; **Remove Customization** goes back to
the original template. A customized document's own template shows first in the template gallery.

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
