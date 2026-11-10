# Markdown and LaTeX, without the fuss

Peanut Writer stands on the shoulders of two tools that writers in technical fields love, and that almost everyone
else finds a little intimidating. It keeps what makes them good and hides what makes them hard.

## What is Markdown?

[Markdown](https://commonmark.org) is a way of writing formatted text using ordinary characters. A line starting with
`#` is a heading; words between `**` are bold; a line starting with `-` is a bullet:

```markdown
# Shopping

Remember the **peanuts**.

- Peanuts
- More peanuts
```

It's popular because the file is just text. It opens in any app on any computer, it's tiny, it never gets corrupted
into something unreadable, and it will still open in twenty years.

### What Peanut Writer keeps

- **Your document is a plain `.md` file.** You can open it in Notepad, TextEdit, GitHub, Obsidian or any other
  Markdown app. Nothing is locked inside Peanut Writer.
- **Typing it is still allowed.** If you know Markdown, type `**bold**` and it turns bold. Help → Markdown Cheat Sheet
  lists everything.

### What Peanut Writer hides

- **The symbols.** The editor shows formatted text, not asterisks and pound signs. Headings look like headings, bold
  looks bold, a picture shows the picture and a table shows a table.
- **Remembering the syntax.** Every piece of formatting has a ribbon button, like in Word. You never _have_ to type a
  symbol.

When you do want to see the text underneath, **View → Markdown** (⌘/) shows it, and switching back hides it again.

## What is LaTeX?

[LaTeX](https://www.latex-project.org) is the typesetting system scientists and mathematicians use for papers and
books. It's famous for two things: beautiful pages, and a steep learning curve. You write in a code-like language,
run a program, and get a PDF.

What makes it worth the trouble is that **it does the bookkeeping for you.** You label a figure, then refer to it by
its label; LaTeX works out that it's Figure 4, and if you add a figure earlier, it becomes Figure 5 everywhere, by
itself. Footnotes, the table of contents and section numbers work the same way. And because a LaTeX document says what
things _are_ rather than how they look, swapping its style for a journal's is one line. That's the
[separation of style from content](./style-and-content).

### What Peanut Writer keeps

- **Self-numbering figures and tables.** Give a picture a caption and it becomes "Figure 1". Tables are numbered
  separately. Add, delete or move them and every number updates.
- **Cross-references that keep up.** References → Cross-reference (or type `@`) lists every figure and table by its
  current number. In your text it reads "Figure 2", and stays right when things move. A reference to something that no
  longer exists shows as **??**, just as in LaTeX, and is listed in the status bar so you can fix it.
- **Footnotes and a table of contents** that write themselves.
- **Real typesetting.** The preview is set by [Typst](https://typst.app), a modern typesetting engine in the LaTeX
  tradition: proper justification, spacing and page breaks. The _Academic_ template even looks like a LaTeX article.
- **Templates instead of formatting.** You choose a look; you don't build one.

### What Peanut Writer hides

- **The code.** There are no commands to learn, no `\begin{figure}`, no packages, no build step.
- **The wait.** LaTeX makes you compile to see your pages. Peanut Writer updates the preview as you type.
- **The error messages.** If a reference is broken, you see **??** and a note in plain English, not a log file.

## Side by side

Here's the same figure, labeled and referred to, in each:

::: code-group

```latex [LaTeX]
As Figure~\ref{fig:chart} shows, sales went up.

\begin{figure}[h]
  \centering
  \includegraphics[width=0.7\textwidth]{images/chart.png}
  \caption{Sales over time}
  \label{fig:chart}
\end{figure}
```

```markdown [Peanut Writer (Markdown view)]
As @fig:chart shows, sales went up.

![Sales over time](images/chart.png){#fig:chart width=70%}
```

```text [Peanut Writer (what you see)]
As Figure 1 shows, sales went up.

  [ the picture, 70% wide ]
  Figure 1: Sales over time
```

:::

In the editor, you never type any of it: **Insert → Picture**, fill in a caption, then **References →
Cross-reference** and pick the figure.

## The best of both

|                                   | Word | Markdown | LaTeX | Peanut Writer |
| --------------------------------- | :--: | :------: | :---: | :-----------: |
| Point-and-click editing           |  ✅  |          |       |      ✅       |
| Plain-text file that lasts        |      |    ✅    |  ✅   |      ✅       |
| Style kept apart from content     |  ➖  |    ✅    |  ✅   |      ✅       |
| Numbered figures and tables       |  ➖  |          |  ✅   |      ✅       |
| Cross-references that keep up     |  ➖  |          |  ✅   |      ✅       |
| Professionally typeset pages      |      |          |  ✅   |      ✅       |
| See the page as you type          |  ✅  |          |       |      ✅       |
| Exports an editable Word file     |  ✅  |          |       |      ✅       |

➖ possible, but only if you're careful with styles and fields.
