# Introduction

Peanut Writer is a word processor for people who want their documents to look good without having to fiddle with them.
It feels like Word: a ribbon of buttons across the top, your text on the left, and the finished pages on the right,
updating as you type. Underneath, though, it borrows two ideas that technical writers have relied on for decades:

- **From Markdown**, it keeps your words as plain text. The file is readable in any app, on any computer, today and in
  twenty years.
- **From LaTeX**, it keeps _what you write_ apart from _how it looks_, and it does the bookkeeping for you: numbering
  figures and tables, keeping cross-references up to date, and building a table of contents.

You don't need to know either of them. Everything is a button on the ribbon. The two pages that follow explain the
ideas, because once you see them the rest of the app makes sense:

1. [Style apart from content](./style-and-content): why you never pick a font for a heading.
2. [Markdown and LaTeX, without the fuss](./markdown-and-latex): what Peanut Writer borrows from each, and what it
   leaves behind.

## A quick tour

![The Peanut Writer window: the ribbon across the top, the editor on the left and the typeset page on the right](/screenshots/editor.png)

- **Type on the left.** Headings, bold, lists, quotes and pictures look like themselves while you write.
- **Read on the right.** The preview is the actual typeset page, the same one your PDF will be.
- **Pick a look on the Design tab.** Seven templates are built in, from a fresh Word document to a LaTeX-style
  article. Change your mind at any time.
- **Insert pictures and tables.** Give them a caption and they get a number. Refer to them and the reference keeps
  up.
- **Export** to PDF or Word with one click, or **Sync files** to keep a fresh copy of both beside your document.

## Your first document

The first time you open Peanut Writer, it shows a short welcome guide written in Peanut Writer itself. It's a good
document to poke at: move the picture below the table and watch both numbers change. Help → Welcome Guide opens it
again any time, Help → Markdown Cheat Sheet lists everything you can type, and Help → About Peanut Writer shows the
version, with links to these docs and the source on GitHub.

To start your own, choose **New** (⌘N). Peanut Writer asks for a name and a place, and makes a `.peanut` package there
to hold your document, its pictures and its backups. See [Documents, saving and export](./documents).

## Install and updates

Download
[**Peanut-Writer.dmg**](https://github.com/dustinmichels/peanut-writer/releases/latest/download/Peanut-Writer.dmg),
open it and drag **Peanut Writer** to **Applications**. Or, with [Homebrew](https://brew.sh):

```sh
brew install --cask dustinmichels/tap/peanut-writer
```

It runs on macOS 13 (Ventura) or later, on Apple Silicon and Intel Macs.

Peanut Writer checks for a newer version when it opens and once a day while it's open, and stays quiet unless there is
one; **Peanut Writer → Check for Updates…** checks right away. Nothing is downloaded without asking: **Update** fetches
the new version and **Restart & Apply** replaces the app and reopens it. Your documents aren't touched. A copy that
can't replace itself (opened straight from the disk image) offers to **Download** the new disk image instead.
