# Word export (`internal/docx`)

- Tables are always as wide as the text (or the list item or quote they're in).
- Numbered headings number levels 1–3 only; parity with the Typst templates is unchecked.
- Code block language is ignored (no highlighting).
- WebP figures, and SVGs with no `width`, `height` or `viewBox` and no `width=` attribute, are drawn full width;
  PNG/JPEG natural size assumes 96 dpi.
- Without Typst, SVG and WebP images become an `[image: name]` placeholder.
- Math is a picture, not a Word equation (not editable in Word's equation editor), drawn in Typst's default math font
  at the body size (also in footnotes); without Typst it's the LaTeX source in code style.
- A figure, table or equation in a footnote has its number as plain text (Word's numbering counts it by a hidden SEQ
  field at the footnote's mark), and references to it are plain text: Word won't update either.
