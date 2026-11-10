# Peanut-Writer

This is a custom text editor called Peanut Writer.

The stack is Go, Wails 3, Bun, Mise. It can use Typst.

It can draw some inspiration from:

- `/Users/dustinmichels/GitRepos/resume-builder`

The idea is to be famililar, resembling Microsoft Word, while also incorporating good ideas from projects like LaTex.

There are two views: the editor on the left and the pdf preview on the right.

The left pane is basically a markown editor, allowing basic markdown features, plus a few bonus features drawing from latex/typst, but with UI elements to control them.

Some key features that make it different from Word:

- Images and figure captions are easy to work with.
- I can drag to add images, and easily create tables.
- I can give them figure captions, which use automatic numbering (eg, table/fig number is auto incremented based on order.) In the text I can reference a figure, and references to it also auto-increment. There is a UI btn for this.

The output style is similar to a word doc. I want the ability to use different output templates to customize how output looks. Prebuild a few of them.

I want to be able to output docx files, as well as pdf.

---

The visual can also draw a little inspiration from peanuts. See:

- `/Users/dustinmichels/GitRepos/peanut`
