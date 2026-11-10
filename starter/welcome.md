---
title: Welcome to Peanut Writer
subtitle: A small, friendly guide
author: Peanut
date: today
abstract: Peanut Writer feels like a word processor but keeps your words in plain Markdown. Figures and tables number themselves, cross-references keep up, and one click turns the same document into a PDF or a Word file.
---

# Writing

Type on the left; the page on the right updates as you go. Use the **Home** tab for *emphasis*, headings and lists, or type Markdown directly — whatever you prefer.

- Bold, italic, ~~strikethrough~~ and `code` are on the Home tab.
- Lists can be bulleted or numbered.
  - And nested, with Tab.

# Figures and tables

Drag an image onto the editor, paste one, or use **Insert → Picture**. Give it a caption and it becomes a numbered figure, like @fig:peanut.

![Peanut, the mascot, ready to help.](images/peanut.svg){#fig:peanut width=28%}

Tables are made with **Insert → Table**. Click inside one and choose **Edit Table** to change it in a grid. @tbl:snacks is numbered on its own, separately from figures.

| Snack        | Crunch | Rating |
|:-------------|:------:|-------:|
| Peanuts      | High   | 10     |
| Pretzels     | Medium | 7      |
| Marshmallows | None   | 6      |

Table: Snacks, ranked very scientifically {#tbl:snacks}

# Cross-references

**References → Cross-reference** inserts a reference to any figure or table. Move @fig:peanut below the table and both numbers update, everywhere.[^1]

[^1]: Footnotes come from **References → Footnote**.

# Make it yours

Pick a look on the **Design** tab, then **Export** as PDF or Word.
