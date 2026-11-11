import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gatherFootnotes, scan, sentenceAround } from ".";

// scan must number figures, tables and equations as internal/doc does: each
// sample's .want is what doc.Parse numbers (internal/doc/numbering_test.go).
const dir = join(import.meta.dir, "../../../../internal/doc/testdata/numbering");

for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
  test(name, () => {
    const got = scan(readFileSync(join(dir, name), "utf8")).map((x) => {
      const f = [x.kind, String(x.number)];
      if (x.label) f.push(x.label);
      if (x.kind === "figure") {
        const pictures = x.pictures ?? [];
        if (pictures.length > 1) f.push(`pictures=${pictures.length} columns=${x.columns}`);
        if (x.width) f.push(`width=${x.width}`);
        if (x.position) f.push(`align=${x.position}`);
      }
      return f.join(" ") + "\n";
    });
    expect(got.join("")).toBe(readFileSync(join(dir, name.replace(/\.md$/, ".want")), "utf8"));
  });
}

// The figure dialog and footnote list show the sentence around a mention (@x
// or [^x]): within its paragraph, list item, heading or table cell, cut at
// sentence stops (and the footnote marks after them) but not abbreviations.
test("sentenceAround", () => {
  const cases: [string, string][] = [
    ["# Head\n\nFirst one. As @x shows, it works. Next.", "As | shows, it works."],
    ["A para\ncontinued, see @x\nfor more. Next.", "A para continued, see | for more."],
    ["- one\n- two cites @x here.\n- three", "two cites | here."],
    ["| a | b |\n|---|---|\n| x @x y | z |", "x | y"],
    ["## Heading has @x\nText.", "Heading has |"],
    ["So e.g. this (see @x). Then more.", "So e.g. this (see |)."],
    ["Before. Move @x, everywhere.[^1] After.", "Move |, everywhere.[^1]"],
    ["Before. It updates.[^x] After.", "It updates.|"],
    ["First. @x starts it. Next.", "| starts it."],
  ];
  for (const [text, want] of cases) {
    const m = /@x|\[\^x\]/.exec(text)!;
    const { before, after } = sentenceAround(text, m.index, m.index + m[0].length);
    expect(`${before}|${after}`).toBe(want);
  }
});

// The editor keeps the notes together at the end, in the order of their
// marks, leaving text apart where a note came out; a note being written (the
// cursor at |) stays put.
test("gatherFootnotes", () => {
  const cases: [string, string][] = [
    ["A[^1].\n\n[^1]: one\n\nB.\n", "A[^1].\n\nB.\n\n[^1]: one\n"],
    ["A[^1].\n[^1]: one\n\nB.", "A[^1].\n\nB.\n\n[^1]: one\n"],
    ["A[^b] B[^a].\n\n[^a]: a\n\n[^b]: b\n", "A[^b] B[^a].\n\n[^b]: b\n\n[^a]: a\n"],
    ["A[^1].\n\n[^1]: one\n    more\n\nB.", "A[^1].\n\nB.\n\n[^1]: one\n    more\n"],
    ["A[^1].\n\n[^1]: one\n\n\n[^x]: lone\n", "A[^1].\n\n[^1]: one\n\n\n[^x]: lone\n"],
    ["A[^1].\n\n[^1]: on|e\n\nB.", "A[^1].\n\n[^1]: one\n\nB."],
    ["A[^1].\n\n[^1]: one\n\n|", "A[^1].\n\n[^1]: one\n\n"],
  ];
  for (const [input, want] of cases) {
    const cursor = input.indexOf("|");
    const text = input.replace("|", "");
    const changes = gatherFootnotes(text, cursor);
    let got = text;
    for (const c of [...changes].reverse()) got = got.slice(0, c.from) + c.insert + got.slice(c.to);
    expect(got).toBe(want);
  }
});
