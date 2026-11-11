// Words and excerpts: counting words, and text as it reads, for lists and
// the sentence around a mention.

import { blockStart } from "./footnotes";
import { readFrontMatter } from "./frontMatter";

// Word's count: each Chinese or Japanese character is a word, and a
// hyphenated word (`self-driving`) is one.
const cjk = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}ー]/gu;

export function wordCount(text: string): number {
  const body = text
    .slice(readFrontMatter(text).to)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?/g, " ")
    .replace(/\{#[^}]*\}/g, " ")
    .replace(/[#>*_`~|:]+/g, " ");
  let n = 0;
  const rest = body.replace(cjk, () => (n++, " "));
  return (
    n + (rest.match(/[\p{L}\p{N}][\p{L}\p{N}'’]*(?:-[\p{L}\p{N}][\p{L}\p{N}'’]*)*/gu)?.length ?? 0)
  );
}

// plain strips Markdown inline marks, for showing captions in lists.
export function plain(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/==(\S(?:[^=]*\S)?)==/g, "$1")
    .replace(/\\(.)/g, "$1");
}

// --- Excerpts ----------------------------------------------------------------

// Where a sentence ends: its stop, any closing quotes or brackets and
// footnote marks, before what doesn't carry on in lower case (“e.g. this”
// goes on).
const sentenceStop = /[.!?](?:["'”’)\]]|\[\^[^\]\s]+\])*(?=\s+[^\s\p{Ll}]|\s*$)/gu;
// What starts a block's text: heading, quote and list markers, a note's label.
const blockLead = /^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+|\[\^[^\]\s]+\]:\s*)*/;
// Lines a paragraph doesn't run back into, nor on from.
const ownLine = /^\s{0,3}(?:#|\||```|~~~|\$\$)/;
const excerptMax = 200;

// sentenceAround is the sentence holding from–to in text, as written on one
// line: its text before from and after to. It stays within the paragraph, or
// the table cell, and is cut short (with “…”) when it runs long.
export function sentenceAround(
  text: string,
  from: number,
  to: number,
): { before: string; after: string } {
  const lineStart = (pos: number) => text.lastIndexOf("\n", pos - 1) + 1;
  const lineEnd = (pos: number) => {
    const i = text.indexOf("\n", pos);
    return i < 0 ? text.length : i;
  };
  let a = lineStart(from);
  let b = lineEnd(to);
  if (/^\s*\|/.test(text.slice(a, b))) {
    a = text.lastIndexOf("|", from - 1) + 1;
    const i = text.indexOf("|", to);
    if (i >= 0 && i < b) b = i;
  } else {
    const own = ownLine.test(text.slice(a, b));
    while (!own && a > 0 && !blockStart.test(text.slice(a, lineEnd(a)))) {
      const prev = lineStart(a - 1);
      const line = text.slice(prev, a - 1);
      if (line.trim() === "" || ownLine.test(line)) break;
      a = prev;
    }
    while (!own && b < text.length) {
      const next = text.slice(b + 1, lineEnd(b + 1));
      if (next.trim() === "" || blockStart.test(next)) break;
      b = lineEnd(b + 1);
    }
    a += blockLead.exec(text.slice(a, from))![0].length;
  }
  // The stops around the mention; one it's part of (a footnote mark after a
  // stop) ends the sentence with it.
  let start = a;
  let end = b;
  for (const m of text.slice(a, b).matchAll(sentenceStop)) {
    const stop = a + m.index! + m[0].length;
    if (stop <= from) start = stop;
    else {
      end = Math.max(stop, to);
      break;
    }
  }
  let before = text.slice(start, from).replace(/\s+/g, " ").trimStart();
  let after = text.slice(to, end).replace(/\s+/g, " ").trimEnd();
  if (before.length > excerptMax)
    before = "…" + before.slice(before.indexOf(" ", before.length - excerptMax) + 1);
  if (after.length > excerptMax) after = after.slice(0, after.lastIndexOf(" ", excerptMax)) + "…";
  return { before, after };
}

// readable is Markdown as it reads: cross-references as refText has them,
// without footnote marks or inline marks.
export function readable(s: string, refText: (label: string) => string): string {
  return plain(
    s
      .replace(/@((?:fig|tbl|eq):[A-Za-z0-9_-]*[A-Za-z0-9_])/g, (_, l: string) => refText(l))
      .replace(/\[\^[^\]\s]+\]/g, ""),
  );
}
