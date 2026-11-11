# Web page export (`internal/html`)

- Styled from the template's Word style (`DocxStyle`), not its Typst file: custom Typst-only styling doesn't carry over.
  Fonts the reader doesn't have fall back to a generic serif or sans-serif.
- Text columns, page numbers and the page size are ignored.
- Math is an SVG picture per formula; without Typst it's the LaTeX source in code style.
- Pictures are embedded as data URLs, so the file grows with them; formats the browser can't show (e.g. HEIC) don't
  appear.
- Code block language is a `language-*` class only (no highlighting).
