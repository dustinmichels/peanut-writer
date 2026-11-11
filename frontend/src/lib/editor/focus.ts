// Focus on a section: the editor shows one heading's section alone.

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  Prec,
  type Range,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap } from "@codemirror/view";
import { revealMargin } from "./reveal";

// The editor can show one section alone: a heading and what follows it, up to
// the next heading of its level or above. The rest is out of sight, and typing
// can't reach it; undo and the app's own changes still can.

interface Focus {
  at: number; // the start of the section's heading line
  to: number; // the start of the next section's heading line, or the document's end
  deco: DecorationSet;
}

const setFocus = StateEffect.define<number | null>(); // a heading's position, or none

function focusAt(state: EditorState, pos: number): Focus {
  const doc = state.doc;
  const line = doc.lineAt(pos);
  const tree = ensureSyntaxTree(state, doc.length, 200) ?? syntaxTree(state);
  // A line that's no longer a heading runs to the next heading of any level.
  let level = 6;
  let to = doc.length;
  for (let n = tree.topNode.firstChild; n; n = n.nextSibling) {
    const h = /^(?:ATX|Setext)Heading(\d)$/.exec(n.name);
    if (!h || n.from < line.from) continue;
    if (n.from === line.from) level = Number(h[1]);
    else if (Number(h[1]) <= level) {
      to = doc.lineAt(n.from).from;
      break;
    }
  }
  const hide = Decoration.replace({ block: true });
  const ranges: Range<Decoration>[] = [];
  if (line.from > 0) ranges.push(hide.range(0, line.from - 1));
  if (to < doc.length) ranges.push(hide.range(to, doc.length));
  return { at: line.from, to, deco: Decoration.set(ranges) };
}

// The end of what a focus shows: the end of its last line.
const focusEnd = (f: Focus, state: EditorState) => (f.to < state.doc.length ? f.to - 1 : f.to);

export const focusField = StateField.define<Focus | null>({
  create: () => null,
  update(f, tr) {
    for (const e of tr.effects) {
      if (e.is(setFocus)) return e.value === null ? null : focusAt(tr.state, e.value);
    }
    if (!f || !tr.docChanged) return f;
    // Text put where the heading starts (undoing the section's deletion) goes
    // before it, unless that leaves no heading there (a line break typed at
    // its start).
    const at = tr.changes.mapPos(f.at, -1);
    const heading = /^#{1,6}(\s|$)/.test(tr.state.doc.lineAt(at).text);
    return focusAt(tr.state, heading ? at : tr.changes.mapPos(f.at, 1));
  },
  // Above the others, so widgets in the hidden part (the properties card) hide too.
  provide: (f) => [
    Prec.highest(EditorView.decorations.from(f, (v) => v?.deco ?? Decoration.none)),
    EditorView.atomicRanges.of((view) => view.state.field(f)?.deco ?? Decoration.none),
  ],
});

// focusGuard keeps typing out of the hidden part, and the cursor in the
// section. It runs before the filters that follow an edit with changes of
// their own (renumbered footnotes), which may reach the hidden part.
export const focusGuard = EditorState.transactionFilter.of((tr) => {
  const f = tr.startState.field(focusField);
  if (
    f &&
    tr.docChanged &&
    (tr.isUserEvent("input") || tr.isUserEvent("delete") || tr.isUserEvent("move"))
  ) {
    const end = focusEnd(f, tr.startState);
    let outside = false;
    tr.changes.iterChangedRanges((a, b) => {
      if (a < f.at || b > end) outside = true;
    });
    if (outside) return [];
  }
  const next = tr.selection && tr.state.field(focusField);
  if (!next) return tr;
  const end = focusEnd(next, tr.state);
  const clamp = (p: number) => Math.min(end, Math.max(next.at, p));
  const sel = tr.newSelection;
  if (sel.ranges.every((r) => clamp(r.anchor) === r.anchor && clamp(r.head) === r.head)) return tr;
  const ranges = sel.ranges.map((r) => EditorSelection.range(clamp(r.anchor), clamp(r.head)));
  return [tr, { selection: EditorSelection.create(ranges, sel.mainIndex), sequential: true }];
});

// Select All selects the section.
export const focusKeymap = keymap.of([
  {
    key: "Mod-a",
    run: (view) => {
      const f = view.state.field(focusField);
      if (!f) return false;
      view.dispatch({ selection: { anchor: f.at, head: focusEnd(f, view.state) } });
      return true;
    },
  },
]);

// focusSection shows only the section of the heading on line n (1-based),
// with the cursor at its start, or (n null) the whole document again. Either
// way the section's heading goes to the top of the editor.
export function focusSection(view: EditorView, n: number | null) {
  const doc = view.state.doc;
  if (n !== null && (n < 1 || n > doc.lines)) return;
  const pos = n === null ? view.state.field(focusField)?.at : doc.line(n).from;
  view.dispatch({
    selection: n === null ? undefined : { anchor: pos! },
    effects: [
      setFocus.of(n === null ? null : pos!),
      ...(pos === undefined
        ? []
        : [EditorView.scrollIntoView(pos, { y: "start", yMargin: revealMargin })]),
    ],
  });
}

// focusedLines is the focused section's first and last lines (1-based), if
// there is one.
export function focusedLines(state: EditorState): { first: number; last: number } | undefined {
  const f = state.field(focusField);
  if (!f) return;
  const doc = state.doc;
  return { first: doc.lineAt(f.at).number, last: doc.lineAt(focusEnd(f, state)).number };
}
