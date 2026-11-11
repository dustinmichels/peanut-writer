import { expect, test } from "bun:test";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { setBlockStyle, toggleList, toggleMark } from "./commands";
import { equationsField, footnotesField, frontMatterEnd, itemsField } from "./fields";
import { highlight } from "./highlight";
import { math } from "./math";

// run applies command to doc with the selection marked `‸…‸` (or a cursor
// `‸`), as the ribbon would, and gives the text after, the selection marked.
function run(doc: string, command: (v: EditorView) => unknown): string {
  const [a, b = a] = [...doc.matchAll(/‸/g)].map((m, i) => m.index! - i);
  let state = EditorState.create({
    doc: doc.replaceAll("‸", ""),
    selection: EditorSelection.single(a, b),
    extensions: [
      markdown({ base: markdownLanguage, extensions: [math, highlight] }),
      itemsField,
      equationsField,
      footnotesField,
      frontMatterEnd,
    ],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  const view = {
    get state() {
      return state;
    },
    dispatch(...specs: TransactionSpec[]) {
      state = state.update(...specs).state;
      ensureSyntaxTree(state, state.doc.length, 5000);
    },
    focus() {},
  } as unknown as EditorView;
  command(view);
  const { from, to } = state.selection.main;
  const text = state.doc.toString();
  return text.slice(0, from) + "‸" + (to > from ? text.slice(from, to) + "‸" : "") + text.slice(to);
}

// Select All then a line style: code blocks, display math and tables stay as
// they are, not `# ```` (making the code text) or `# | a |` (no table), and a
// code comment keeps its `#`.
test("line styles leave code, math and tables", () => {
  const doc = "‸Text\n\n```py\n# comment\n```\n\n$$\nx\n$$\n\n| a |\n|---|\n| b |\n‸";
  const keep = "```py\n# comment\n```\n\n$$\nx\n$$\n\n| a |\n|---|\n| b |\n";
  expect(run(doc, (v) => setBlockStyle(v, "h1"))).toBe(`# ‸Text\n\n${keep}‸`);
  expect(run(doc, (v) => setBlockStyle(v, "quote"))).toBe(`> ‸Text\n\n${keep}‸`);
  expect(run(doc, (v) => toggleList(v, "bullet"))).toBe(`- ‸Text\n\n${keep}‸`);
  expect(run("```py\n#‸ comment\n```", (v) => setBlockStyle(v, "p"))).toBe(
    "```py\n#‸ comment\n```",
  );
});

// Styles go on the text selected, so they read as styles: not around a
// line's marks or white space (`**> quote**`, `**word **`), not cutting into
// code, nor into code blocks or the front matter. Pressed twice, they undo.
test("toggleMark", () => {
  const cases: [string, string][] = [
    ["‸> a quote‸", "> **‸a quote‸**"],
    ["say ‸two words ‸now", "say **‸two words‸** now"],
    ["‸- item‸", "- **‸item‸**"],
    ["‸a `co‸de` b", "**‸a `code`‸** b"],
    ["a ‸**bold**‸ b", "a ‸bold‸ b"],
    ["```\ncode x‸\n```", "```\ncode x‸\n```"],
    ["    code x‸", "    code x‸"],
    ["---\ntitle: ‸X‸\n---\n\nText", "---\ntitle: ‸X‸\n---\n\nText"],
    ["| a | b |\n|---|---|\n| ‸c | d‸ |", "| a | b |\n|---|---|\n| **‸c** | **d‸** |"],
  ];
  for (const [doc, want] of cases) expect(run(doc, (v) => toggleMark(v, "strong"))).toBe(want);
  const twice = (mark: "strong" | "emph" | "strike") => (v: EditorView) => {
    toggleMark(v, mark);
    toggleMark(v, mark);
  };
  // Not `****` (a rule) or `~~~~` (a code fence, taking the rest with it).
  expect(run("a\n\n‸\n\nb", twice("strong"))).toBe("a\n\n‸\n\nb");
  expect(run("a\n\n‸\n\nb", twice("strike"))).toBe("a\n\n‸\n\nb");
  expect(run("a **‸** b", twice("emph"))).toBe("a **‸** b");
});
