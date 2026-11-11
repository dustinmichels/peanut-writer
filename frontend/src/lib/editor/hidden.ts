// Hidden Markdown marks: replaced by nothing (or a heading's #s, a bullet, a
// rule), with the cursor moving and deleting past them as the text reads.

import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  findClusterBreak,
  type Line,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { fenceRe, frontMatterEnd, itemsField, showMarkdown } from "./fields";
import { BulletWidget, FenceWidget, HeadingMarkWidget, RuleWidget } from "./widgets/marks";
import { tocRe } from "./widgets/toc";

// Unless the Markdown is shown, its marks are replaced by nothing (or a
// heading's #s, a bullet, a rule). Each hidden range has a kind: "mark"
// around inline text, "prefix" before a line's text (heading, quote,
// bullet), "line" for a whole line (a rule, a code fence).
type HiddenKind = "mark" | "prefix" | "line";

// linePrefix is the marks before a line's text that are hidden: an ATX
// heading's #s (level is its count), quote marks and bullets, each with the
// space after it. Indentation and numbers stay visible.
function linePrefix(
  state: EditorState,
  line: Line,
): { from: number; to: number; bullet: boolean; level: number }[] {
  const tree = syntaxTree(state);
  const out: { from: number; to: number; bullet: boolean; level: number }[] = [];
  let pos = line.from;
  for (;;) {
    while (pos < line.to && /[ \t]/.test(line.text[pos - line.from])) pos++;
    if (pos >= line.to) break;
    const n = tree.resolveInner(pos, 1);
    if (n.from !== pos) break;
    const heading = n.name === "HeaderMark" && /^ATXHeading/.test(n.parent?.name ?? "");
    const bullet = n.name === "ListMark" && n.parent?.parent?.name === "BulletList";
    if (!heading && !bullet && n.name !== "QuoteMark") break;
    let to = n.to;
    if (heading) while (to < line.to && line.text[to - line.from] === " ") to++;
    else if (line.text[to - line.from] === " ") to++;
    out.push({ from: n.from, to, bullet, level: heading ? n.to - n.from : 0 });
    pos = to;
  }
  return out;
}

function prefixEnd(state: EditorState, line: Line): number {
  const p = linePrefix(state, line);
  return p.length ? p[p.length - 1].to : line.from;
}

// deadLine tells whether line is shown whole as a widget, where the cursor
// can't usefully be: a rule or table of contents ("block", deleted whole) or
// a code fence.
function deadLine(state: EditorState, line: Line): "block" | "fence" | null {
  const indent = line.text.length - line.text.trimStart().length;
  for (
    let n: SyntaxNode | null = syntaxTree(state).resolveInner(line.from + indent, 1);
    n;
    n = n.parent
  ) {
    if (n.name === "HorizontalRule") return "block";
    if (n.name === "Paragraph")
      return n.parent?.name === "Document" && tocRe.test(state.sliceDoc(n.from, n.to).trim())
        ? "block"
        : null;
    if (n.name === "FencedCode") {
      const open = state.doc.lineAt(n.from).number;
      if (open === line.number) return "fence";
      const close = state.doc.lineAt(n.to).number;
      return close === line.number && close > open && fenceRe.test(line.text) ? "fence" : null;
    }
  }
  return null;
}

// covered tells whether pos is in the front matter or a figure or table
// shown as a widget, which stands in for its Markdown whole.
function covered(state: EditorState, pos: number): boolean {
  return (
    pos < state.field(frontMatterEnd) ||
    state
      .field(itemsField)
      .some((x) => x.kind !== "equation" && x.prefix === undefined && pos >= x.from && pos <= x.to)
  );
}

const emptyPairs = ["**", "~~", "*", "`"];

// emptyPairAt is the empty pair of marks the cursor is in (as a style
// button leaves them), or null.
function emptyPairAt(state: EditorState, pos: number): { from: number; to: number } | null {
  for (const s of emptyPairs) {
    if (pos >= s.length && state.sliceDoc(pos - s.length, pos + s.length) === s + s)
      return { from: pos - s.length, to: pos + s.length };
  }
  return null;
}

interface Hidden {
  deco: DecorationSet;
  atomic: DecorationSet;
}

function buildHidden(view: EditorView): Hidden {
  const state = view.state;
  if (state.facet(showMarkdown)) return { deco: Decoration.none, atomic: Decoration.none };
  const doc = state.doc;
  const deco: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const seen = new Set<string>();
  const hide = (from: number, to: number, kind: HiddenKind, widget?: WidgetType) => {
    const key = `${from}:${to}`;
    if (from >= to || seen.has(key)) return;
    seen.add(key);
    const d = Decoration.replace({ widget, kind }).range(from, to);
    deco.push(d);
    atomic.push(d);
  };
  const fence = (line: Line, lang: string) => {
    hide(line.from, line.to, "line", new FenceWidget(lang));
    deco.push(Decoration.line({ class: "pw-code-fence" }).range(line.from));
  };

  for (const { from, to } of view.visibleRanges) {
    for (let p = from; p <= to;) {
      const line = doc.lineAt(p);
      if (!covered(state, line.from)) {
        for (const m of linePrefix(state, line))
          hide(
            m.from,
            m.to,
            "prefix",
            m.level ? new HeadingMarkWidget(m.level) : m.bullet ? new BulletWidget() : undefined,
          );
      }
      p = line.to + 1;
    }
    syntaxTree(state).iterate({
      from,
      to,
      enter: (n) => {
        if (n.name === "Document") return;
        if (covered(state, n.from)) return false;
        switch (n.name) {
          case "HeaderMark": {
            // A closing run of #s; the opening one is part of the prefix.
            const parent = n.node.parent;
            if (parent && /^ATXHeading/.test(parent.name) && n.from > parent.from) {
              let start = n.from;
              while (start > parent.from && doc.sliceString(start - 1, start) === " ") start--;
              hide(start, n.to, "mark");
            }
            break;
          }
          case "EmphasisMark":
          case "StrikethroughMark":
            hide(n.from, n.to, "mark");
            break;
          case "CodeMark":
            if (n.node.parent?.name === "InlineCode") hide(n.from, n.to, "mark");
            break;
          case "Escape":
            hide(n.from, n.from + 1, "mark");
            break;
          case "HorizontalRule":
            hide(n.from, n.to, "line", new RuleWidget());
            break;
          case "Link": {
            const url = n.node.getChild("URL");
            const marks = n.node.getChildren("LinkMark");
            if (!url || marks.length < 2) break;
            hide(marks[0].from, marks[0].to, "mark");
            hide(marks[1].from, n.to, "mark");
            if (marks[1].from > marks[0].to) {
              const title = doc.sliceString(url.from, url.to);
              deco.push(
                Decoration.mark({
                  class: "pw-link",
                  attributes: { title },
                }).range(marks[0].to, marks[1].from),
              );
            }
            break;
          }
          case "FencedCode": {
            const open = doc.lineAt(n.from);
            const close = doc.lineAt(n.to);
            const info = n.node.getChild("CodeInfo");
            fence(open, info ? doc.sliceString(info.from, info.to) : "");
            if (close.number > open.number && fenceRe.test(close.text)) fence(close, "");
            return false;
          }
        }
      },
    });
  }

  // A style button with nothing selected leaves an empty pair to type into.
  const sel = state.selection.main;
  const pair = sel.empty ? emptyPairAt(state, sel.head) : null;
  if (pair) {
    const half = (pair.to - pair.from) / 2;
    deco.push(Decoration.replace({}).range(pair.from, pair.from + half));
    deco.push(Decoration.replace({}).range(pair.to - half, pair.to));
  }
  return {
    deco: Decoration.set(deco, true),
    atomic: Decoration.set(atomic, true),
  };
}

export const hiddenMarks = ViewPlugin.fromClass(
  class {
    hidden: Hidden;
    constructor(view: EditorView) {
      this.hidden = buildHidden(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        syntaxTree(u.state) !== syntaxTree(u.startState) ||
        u.state.facet(showMarkdown) !== u.startState.facet(showMarkdown)
      )
        this.hidden = buildHidden(u.view);
    }
  },
  {
    decorations: (v) => v.hidden.deco,
    provide: (p) =>
      EditorView.atomicRanges.of((v) => v.plugin(p)?.hidden.atomic ?? Decoration.none),
  },
);

// hiddenAt is the hidden range ending (dir -1) or starting (dir 1) at pos.
function hiddenAt(
  view: EditorView,
  pos: number,
  dir: -1 | 1,
): { from: number; to: number; kind: HiddenKind } | null {
  const set = view.plugin(hiddenMarks)?.hidden.atomic;
  let found: { from: number; to: number; kind: HiddenKind } | null = null;
  set?.between(pos, pos, (from, to, d) => {
    if (dir < 0 ? to === pos && from < pos : from === pos && to > pos) {
      found = { from, to, kind: d.spec.kind };
      return false;
    }
  });
  return found;
}

// settle moves a cursor out of places hidden marks make meaningless: off a
// rule or code fence line (onward, in the direction it was going), and past
// a line's hidden prefix, so typing lands in the text.
function settle(state: EditorState, pos: number, forward: boolean): number {
  // The properties are edited in their dialog, never in place.
  const fmEnd = state.field(frontMatterEnd);
  if (pos < fmEnd) return fmEnd;
  for (let i = 0; i < 8; i++) {
    const line = state.doc.lineAt(pos);
    if (covered(state, line.from)) return pos;
    if (deadLine(state, line)) {
      const next = forward ? line.to + 1 : line.from - 1;
      if (next < 0 || next > state.doc.length) forward = !forward;
      else pos = next;
      continue;
    }
    return Math.max(pos, prefixEnd(state, line));
  }
  return pos;
}

export const settleCursor = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection || tr.state.facet(showMarkdown)) return tr;
  const sel = tr.state.selection.main;
  if (!sel.empty) return tr;
  const pos = settle(tr.state, sel.head, sel.head >= tr.startState.selection.main.head);
  return pos === sel.head ? tr : [tr, { selection: { anchor: pos }, sequential: true }];
});

// moveChar moves the cursor one character, stepping over hidden marks as if
// they weren't there. Marks at the end (or start) of a line are a step of
// their own, out of (or into) the styled text, before the line break.
function moveChar(view: EditorView, forward: boolean, extend: boolean): boolean {
  const state = view.state;
  if (state.facet(showMarkdown)) return false;
  const sel = state.selection.main;
  if (!extend && !sel.empty) return false;
  let p = sel.head;
  let last: HiddenKind | null = null;
  for (let r; (r = hiddenAt(view, p, forward ? 1 : -1)) && r.kind !== "line";) {
    p = forward ? r.to : r.from;
    last = r.kind;
  }
  const line = state.doc.lineAt(p);
  const edge = forward ? p === line.to : p === line.from;
  if (last === "mark" && edge) {
    // Stop here: past the marks, before the line break.
  } else if (forward && p < state.doc.length)
    p = p === line.to ? p + 1 : line.from + findClusterBreak(line.text, p - line.from, true);
  else if (!forward && p > 0) {
    p = p === line.from ? p - 1 : line.from + findClusterBreak(line.text, p - line.from, false);
    // Into a line's hidden prefix: on to the end of the line before.
    const at = state.doc.lineAt(p);
    if (p < prefixEnd(state, at) && at.from > 0) p = at.from - 1;
  }
  if (p === sel.head) return false;
  view.dispatch({
    selection: EditorSelection.single(extend ? sel.anchor : p, p),
    scrollIntoView: true,
    userEvent: "select",
  });
  return true;
}

const wrapperMark: Record<string, string> = {
  Emphasis: "EmphasisMark",
  StrongEmphasis: "EmphasisMark",
  Strikethrough: "StrikethroughMark",
  InlineCode: "CodeMark",
  Link: "LinkMark",
};

// emptied is the styled text or link that deleting from..to would leave
// empty (so it goes whole, marks and all), or null.
function emptied(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number } | null {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(from, 1); n; n = n.parent) {
    const mark = wrapperMark[n.name];
    if (!mark) continue;
    const marks = n.getChildren(mark);
    if (marks.length < 2) continue;
    const close = n.name === "Link" ? marks[1] : marks[marks.length - 1];
    if (marks[0].to === from && close.from === to) return { from: n.from, to: n.to };
  }
  return null;
}

// deleteChar deletes the character before (or after) the cursor as it reads,
// past hidden marks: a heading, quote or bullet goes whole from the start of
// its text, a rule from the line after, styled text with its last character,
// and a widget standing in for text (a reference, a footnote mark) whole.
// Code fences are stepped into, not broken.
function deleteChar(view: EditorView, forward: boolean): boolean {
  const state = view.state;
  if (state.facet(showMarkdown)) return false;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const doc = state.doc;
  const del = (from: number, to: number) => {
    view.dispatch({
      changes: { from, to },
      scrollIntoView: true,
      userEvent: forward ? "delete.forward" : "delete.backward",
    });
    return true;
  };
  const head = sel.head;
  const pair = emptyPairAt(state, head);
  if (pair) return del(pair.from, pair.to);

  let p = head;
  for (let r; (r = hiddenAt(view, p, forward ? 1 : -1));) {
    if (r.kind === "prefix" && !forward) return del(r.from, r.to);
    if (r.kind !== "mark") break;
    p = forward ? r.to : r.from;
  }
  const line = doc.lineAt(p);
  if (forward ? p === line.to : p === line.from) {
    if (forward ? p >= doc.length : p <= 0) return p !== head;
    const other = doc.lineAt(forward ? p + 1 : p - 1);
    const dead = covered(state, other.from) ? null : deadLine(state, other);
    if (dead === "block") return del(forward ? p : other.from, forward ? other.to : p);
    if (dead === "fence") {
      const into = forward ? Math.min(other.to + 1, doc.length) : Math.max(other.from - 1, 0);
      view.dispatch({ selection: { anchor: into }, scrollIntoView: true });
      return true;
    }
    if (p === head) return false;
    return forward ? del(p, p + 1) : del(p - 1, p);
  }
  const q = line.from + findClusterBreak(line.text, p - line.from, forward);
  let [from, to] = forward ? [p, q] : [q, p];
  const whole = emptied(state, from, to);
  if (whole) return del(whole.from, whole.to);
  for (const atomic of state.facet(EditorView.atomicRanges)) {
    atomic(view).between(from, to, (a, b) => {
      if (a < to && b > from) [from, to] = [Math.min(from, a), Math.max(to, b)];
    });
  }
  return del(from, to);
}

export const hiddenKeymap = keymap.of([
  {
    key: "ArrowLeft",
    run: (v) => moveChar(v, false, false),
    shift: (v) => moveChar(v, false, true),
  },
  {
    key: "ArrowRight",
    run: (v) => moveChar(v, true, false),
    shift: (v) => moveChar(v, true, true),
  },
  { key: "Backspace", run: (v) => deleteChar(v, false) },
  { key: "Delete", run: (v) => deleteChar(v, true) },
]);
