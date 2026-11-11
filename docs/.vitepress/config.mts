import { defineConfig } from "vitepress";

// GitHub Pages serves the site under /peanut-writer/; the deploy workflow sets
// DOCS_BASE. Locally it stays at the root.
const base = process.env.DOCS_BASE ?? "/";

export default defineConfig({
  base,
  title: "Peanut Writer",
  description:
    "A word processor that feels like Word but writes Markdown, with a few good ideas from LaTeX.",
  cleanUrls: true,
  head: [["link", { rel: "icon", type: "image/png", href: `${base}logo.png` }]],
  themeConfig: {
    logo: "/logo.png",
    nav: [
      { text: "Guide", link: "/guide/introduction" },
      { text: "Reference", link: "/reference/syntax" },
      {
        text: "Download",
        link: "https://github.com/dustinmichels/peanut-writer/releases/latest/download/Peanut-Writer.dmg",
      },
    ],
    sidebar: [
      {
        text: "Ideas",
        items: [
          { text: "Introduction", link: "/guide/introduction" },
          { text: "Style apart from content", link: "/guide/style-and-content" },
          { text: "Markdown and LaTeX, without the fuss", link: "/guide/markdown-and-latex" },
        ],
      },
      {
        text: "Using Peanut Writer",
        items: [
          { text: "Writing", link: "/guide/writing" },
          { text: "Figures, tables and references", link: "/guide/figures-and-tables" },
          { text: "Templates", link: "/guide/templates" },
          { text: "Documents, saving and export", link: "/guide/documents" },
          { text: "Settings", link: "/guide/settings" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Markdown syntax", link: "/reference/syntax" },
          { text: "Keyboard shortcuts", link: "/reference/shortcuts" },
          { text: "Making your own template", link: "/reference/custom-templates" },
          { text: "Development", link: "/reference/development" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/dustinmichels/peanut-writer" }],
    search: { provider: "local" },
  },
});
