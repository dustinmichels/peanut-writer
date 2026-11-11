# Word export (`internal/docx`)

- Lists inside quotes or footnotes use List Paragraph, losing the quote look / footnote size; a quote inside a footnote
  is body-sized.
- Code blocks, tables, quotes and figures inside list items aren't indented with the list; tables are always full
  width.
- A footnote starting with an uncaptioned table puts its number mark in the first cell.
- Links to `#anchors` are written as plain text; relative file links become external links.
- Numbered headings number levels 1–3 only; parity with the Typst templates is unchecked.
- Code block language is ignored (no highlighting).
- WebP figures, and SVGs with no `width`, `height` or `viewBox` and no `width=` attribute, are drawn full width;
  PNG/JPEG natural size assumes 96 dpi; JPEG EXIF rotation is ignored (rotated photos may be stretched).
- Without Typst, SVG and WebP images become an `[image: name]` placeholder.
- Math is a picture, not a Word equation (not editable in Word's equation editor), drawn in Typst's default math font
  at the body size (also in footnotes); without Typst it's the LaTeX source in code style. Each formula is a separate
  Typst run, so math-heavy documents export slowly. Numbered equations in lists or quotes aren't indented with them.
