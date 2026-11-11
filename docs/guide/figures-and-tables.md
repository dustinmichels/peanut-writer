# Figures, tables and references

This is where Peanut Writer borrows most from LaTeX: you never type a figure number. You give things captions, refer to
them, and let Peanut Writer count.

## Pictures

Drag a picture onto the editor, paste one, or use **Insert → Picture**. It's copied into an `images/` folder beside
your document and shown right in the editor.

- **Hover** a picture to place it left, centered or right.
- **Drag its corner** to resize it.
- **Drag its grip (⠿)** to move it elsewhere in the document.
- **Edit figure** sets its caption, its reference name, its size and its position.

A picture with a caption becomes a numbered figure: "Figure 1: Sales over time". Its size is a percentage of the text
width, so it looks right in every template.

## Picture grids

**Insert → Picture Grid** takes several pictures and sets them side by side as one figure, with one caption and one
number. **Edit figure** on a grid adds, removes, reorders and replaces its pictures and sets the number of columns.
Adding a picture to an ordinary figure turns it into a grid.

## Tables

**Insert → Table**, pick a size, and fill in the grid. **Edit table** above any table reopens the grid, where you can
add and remove rows and columns, align columns and set the caption. Drag the grip (⠿) at the left of its bar to move
the table, caption and all.

Tables are numbered separately from figures: "Table 1", "Table 2", and so on.

## Cross-references

**References → Cross-reference** lists every figure and table with its current number. Pick one and a reference is
inserted at the cursor. You can also type `@` and choose from the suggestions.

In the editor a reference reads "Figure 2". When figures are added, removed or moved, every reference updates.
Renaming a figure's, table's or equation's reference name updates the references to it, too, whether in its dialog or
by editing the `{#fig:…}` label in the Markdown. Renaming to a name something else already uses leaves the references
alone.

Click a reference to change it: pick another figure, table or equation to point it there, or choose **Unlink** to
leave its words ("Figure 2") as plain text that no longer updates. A reference to nothing offers **Remove** instead.

A reference to something that no longer exists shows as **??** in the preview, as in LaTeX, and is listed in the status
bar's notes so you can find it.

**References** previews every figure and table in the document, in order; click one to open its dialog. A figure's
dialog lists, beside it, each sentence that refers to it. Click one to go there in the text.

## In Word

The exported Word file keeps all of this working: captions are real Word captions with live numbers, and references
are real cross-reference fields, so the numbers still update if someone edits the document in Word.
