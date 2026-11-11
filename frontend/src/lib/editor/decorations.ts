// The decorations standing in for Markdown: the properties card, figures,
// tables, equations, cross-references and footnotes, and the block styles of
// lines.

import { syntaxTree } from "@codemirror/language";
import {
  EditorState,
  type Extension,
  RangeSetBuilder,
  StateField,
  Transaction,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import {
  type FootnoteMark,
  type Item,
  kindName,
  parseTable,
  readFrontMatter,
} from "@/lib/markdown";
import {
  crossRefs,
  footnotesField,
  frontMatterEnd,
  itemsField,
  showMarkdown,
  shownEquations,
  typedEquation,
} from "./fields";
import type { Handlers } from "./types";
import { EquationWidget } from "./widgets/equation";
import { FigureWidget } from "./widgets/figure";
import { FootnoteMarkWidget, NoteHeadWidget } from "./widgets/footnotes";
import { PropertiesCard } from "./widgets/properties";
import { RefWidget } from "./widgets/refs";
import { TableBar } from "./widgets/table";
import { tocBlocks, TocWidget } from "./widgets/toc";

interface Decos {
  deco: DecorationSet;
  atomic: DecorationSet;
}

// shownDate is the date as the document shows it: `today` is today's date,
// written as internal/doc writes it ("January 2, 2006").
function shownDate(date: string | undefined): string | undefined {
  if (date?.trim().toLowerCase() !== "today") return date;
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function buildDecorations(state: EditorState, handlers: Handlers): Decos {
  // Shown Markdown is plain text.
  if (state.facet(showMarkdown)) return { deco: Decoration.none, atomic: Decoration.none };
  const doc = state.doc;
  const items = state.field(itemsField);
  // The first of a label wins, as in internal/doc.
  const labels = new Map<string, Item>();
  for (const x of items) if (x.label && !labels.has(x.label)) labels.set(x.label, x);
  const ranges: {
    from: number;
    to: number;
    deco: Decoration;
    atomic?: boolean;
  }[] = [];

  const fm = readFrontMatter(doc.toString());
  if (fm.to === 0) {
    // No properties yet (a new document, or one on the default template):
    // the card still sits on top, so they can be added.
    ranges.push({
      from: 0,
      to: 0,
      deco: Decoration.widget({
        widget: new PropertiesCard("", "", handlers),
        block: true,
        side: -1,
      }),
    });
  } else {
    const by = [fm.meta.author, fm.meta.topic, shownDate(fm.meta.date)].filter(Boolean).join(" · ");
    const end = doc.lineAt(Math.max(fm.to - 1, 0)).to;
    ranges.push({
      from: 0,
      to: end,
      deco: Decoration.replace({
        widget: new PropertiesCard(fm.meta.title, by, handlers),
        block: true,
      }),
      atomic: true,
    });
  }

  // Figures, tables and display equations replace their Markdown; nothing
  // else is decorated inside them. Those in lists and quotes stay as their
  // Markdown.
  const hidden: { from: number; to: number }[] = [];
  for (const it of items) {
    if (it.kind === "equation" || it.prefix !== undefined) continue;
    hidden.push(it);
    if (it.kind === "figure") {
      ranges.push({
        from: it.from,
        to: it.to,
        deco: Decoration.replace({ widget: new FigureWidget(it, handlers), block: true }),
        atomic: true,
      });
    } else {
      const table = parseTable(doc.sliceString(it.tableFrom!, it.tableTo!));
      ranges.push({
        from: it.from,
        to: it.to,
        deco: Decoration.replace({
          widget: new TableBar(it, handlers, table),
          block: true,
        }),
        atomic: true,
      });
    }
  }
  for (const eq of shownEquations(state)) {
    hidden.push(eq);
    const n = items.find((x) => x.kind === "equation" && x.from === eq.from)?.number ?? 0;
    ranges.push({
      from: eq.from,
      to: eq.to,
      deco: Decoration.replace({ widget: new EquationWidget(eq, n, handlers), block: true }),
      atomic: true,
    });
  }
  for (const t of tocBlocks(state)) {
    if (t.from < fm.to) continue;
    ranges.push({
      from: t.from,
      to: t.to,
      deco: Decoration.replace({ widget: new TocWidget(), block: true }),
      atomic: true,
    });
  }

  // Cross-references and footnote marks, outside code and math.
  const out = (pos: number) => pos < fm.to || hidden.some((h) => pos >= h.from && pos <= h.to);
  for (const r of crossRefs(state)) {
    if (out(r.from)) continue;
    const target = labels.get(r.label);
    const text = target ? `${kindName[target.kind]} ${target.number}` : `?? ${r.label}`;
    ranges.push({
      from: r.from,
      to: r.to,
      deco: Decoration.replace({
        widget: new RefWidget(r.label, text, !!target, handlers),
      }),
      atomic: true,
    });
  }
  const { marks, notes } = state.field(footnotesField);
  const noteText = new Map<string, string>();
  for (const n of notes) if (!noteText.has(n.label)) noteText.set(n.label, n.text);
  for (const m of marks) {
    if (out(m.from)) continue;
    if (m.inNote) {
      // A note within a note is printed in brackets (Word, the web) or as
      // a note of its own: its mark stays as written.
      ranges.push({ from: m.from, to: m.to, deco: Decoration.mark({ class: "pw-footnote-ref" }) });
      continue;
    }
    ranges.push({
      from: m.from,
      to: m.to,
      deco: Decoration.replace({
        widget: new FootnoteMarkWidget(m.label, m.number, noteText.get(m.label) ?? null, handlers),
      }),
      atomic: true,
    });
  }
  // Notes: smaller text, the `[^label]: ` shown as the note's number, and a
  // rule above each run of notes (with only blank lines between them).
  const first = new Map<string, FootnoteMark>();
  for (const m of marks)
    if (!first.has(m.label) || (first.get(m.label)!.inNote && !m.inNote)) first.set(m.label, m);
  let prevLast = -1; // last line of the note before
  for (const n of notes) {
    if (out(n.from)) continue;
    const last = doc.lineAt(Math.max(n.to, n.textFrom)).number;
    let starts = prevLast < 0;
    for (let l = prevLast + 1; !starts && l < n.line; l++) starts = doc.line(l).text.trim() !== "";
    prevLast = last;
    for (let l = n.line; l <= last; l++) {
      const at = doc.line(l).from;
      const cls = l === n.line && starts ? "pw-note-line pw-notes-start" : "pw-note-line";
      ranges.push({ from: at, to: at, deco: Decoration.line({ class: cls }) });
    }
    const mark = first.get(n.label);
    ranges.push({
      from: n.from,
      to: n.textFrom,
      deco: Decoration.replace({
        widget: new NoteHeadWidget(n.label, mark && !mark.inNote ? mark.number : 0, !!mark),
      }),
      atomic: true,
    });
  }

  ranges.sort((a, b) => a.from - b.from || a.deco.startSide - b.deco.startSide);
  const all = new RangeSetBuilder<Decoration>();
  const atomic = new RangeSetBuilder<Decoration>();
  for (const r of ranges) {
    all.add(r.from, r.to, r.deco);
    if (r.atomic) atomic.add(r.from, r.to, r.deco);
  }
  return { deco: all.finish(), atomic: atomic.finish() };
}

export function decorations(handlers: Handlers): Extension {
  const field = StateField.define<Decos>({
    create: (s) => buildDecorations(s, handlers),
    update: (d, tr: Transaction) =>
      tr.docChanged ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState) ||
      tr.state.field(typedEquation) !== tr.startState.field(typedEquation) ||
      tr.state.facet(showMarkdown) !== tr.startState.facet(showMarkdown)
        ? buildDecorations(tr.state, handlers)
        : d,
    provide: (f) => [
      EditorView.decorations.from(f, (d) => d.deco),
      EditorView.atomicRanges.of((v) => v.state.field(f).atomic),
    ],
  });
  return field;
}

// Block-level line styling from the syntax tree: headings, quotes, code, math.
const blockLineClass: Partial<Record<string, string>> = {
  Blockquote: "pw-quote-line",
  FencedCode: "pw-code-line",
  BlockMath: "pw-math-line",
};
export const lineStyles = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        syntaxTree(u.state) !== syntaxTree(u.startState) ||
        u.state.facet(showMarkdown) !== u.startState.facet(showMarkdown)
      )
        this.decorations = this.build(u.view);
    }
    build(view: EditorView) {
      const b = new RangeSetBuilder<Decoration>();
      const seen = new Set<number>();
      const add = (pos: number, cls: string) => {
        const line = view.state.doc.lineAt(pos);
        if (seen.has(line.from)) return;
        seen.add(line.from);
        b.add(line.from, line.from, Decoration.line({ class: cls }));
      };
      // Shown Markdown dims its front matter (otherwise a card covers it).
      if (view.state.facet(showMarkdown)) {
        const end = view.state.field(frontMatterEnd);
        for (let p = 0; p < end;) {
          add(p, "pw-meta-line");
          p = view.state.doc.lineAt(p).to + 1;
        }
      }
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
          from,
          to,
          enter: (n) => {
            const h = /^ATXHeading(\d)$/.exec(n.name);
            const cls = blockLineClass[n.name];
            if (h) add(n.from, `pw-h pw-h${h[1]}`);
            else if (cls) {
              for (let p = n.from; p <= n.to;) {
                const line = view.state.doc.lineAt(p);
                if (line.from >= from && line.from <= to) add(line.from, cls);
                p = line.to + 1;
              }
              return false;
            }
          },
        });
      }
      return b.finish();
    }
  },
  { decorations: (v) => v.decorations },
);
