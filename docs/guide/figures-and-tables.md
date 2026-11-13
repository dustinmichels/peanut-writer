# Figures, tables and references

You never type a number. Caption a picture, table or equation, refer to it, and Peanut Writer counts.

## Pictures

Drag a picture onto the editor, paste one, or use **Insert → Picture**. It's copied into the document's `images/`
folder and shown in the editor.

- **Hover** a picture to place it left, centered or right.
- **Drag its corner** to resize it. Its size is a percentage of the text width, so it fits every template.
- **Drag its grip (⠿)** to move it.
- **Edit figure** sets its caption, reference name, size and position.

A picture with a caption becomes a numbered figure: "Figure 1: Sales over time".

**Insert → Picture Grid** sets several pictures side by side as one figure, with one caption and one number. **Edit
figure** on a grid adds, removes, reorders and replaces pictures and sets the number of columns. Adding a picture to an
ordinary figure turns it into a grid.

## Tables

**Insert → Table**, pick a size, and fill in the grid. **Edit table** reopens the grid to add and remove rows and
columns, align columns and set the caption. Drag the grip (⠿) at the left of its bar to move it. Tables are numbered
separately from figures.

## Equations

**Insert → Equation** opens the equation dialog: write the math in LaTeX (with buttons for fractions, roots, sums, Greek
letters and symbols), see it drawn as you type, and give it a reference name to number it "(1)". With text selected in
a line, it makes that text math in the sentence instead. In the editor an equation is a block drawn as it will print:
**Edit equation** (or a double click) reopens the dialog, and its grip (⠿) moves it. To type it instead, see
[Math](../reference/syntax#math).

## Cross-references

**Figures & Tables → Cross-reference**, or typing `@`, lists every figure and table with its current number; pick one
to insert a reference. It reads "Figure 2" and updates when things are added, removed or moved. Renaming a reference
name, in its dialog or in the Markdown, updates the references to it, unless the new name is already taken.

Click a reference to point it somewhere else, or **Unlink** it to keep "Figure 2" as plain text. A reference to
something that no longer exists shows as **??** in the preview and is listed in the status bar's notes; clicking it
offers **Remove**.

**Figures & Tables** previews every figure and table in order; click one to open its dialog, which lists each sentence
that refers to it. Click a sentence to go there.

## In Word

Captions are real Word captions and references are real cross-reference fields, so numbers still update when someone
edits the Word file. Math, inline or not, is a picture of the typeset formula: it looks right but can't be edited in
Word's equation editor.
