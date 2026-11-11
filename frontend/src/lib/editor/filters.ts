// Transaction filters keeping the document whole: the front matter out of
// reach, references following labels, and footnotes numbered in order.

import {
  ChangeSet,
  type ChangeSpec,
  EditorSelection,
  EditorState,
  Transaction,
} from "@codemirror/state";
import {
  type FootnoteMark,
  gatherFootnotes,
  type Kind,
  kindName,
  relabelChanges,
  renumberFootnotes,
} from "@/lib/markdown";
import { footnotesField, frontMatterEnd, itemsField, showMarkdown } from "./fields";

// guardProperties keeps typing, deleting and dragging out of the front
// matter while the Markdown is hidden: the card stands in for it, and its
// dialog is the one way to change it. Edits reaching into it are cut back to
// where the text begins. Changes the app makes (the dialog, Auto Format) are
// dispatched with filter: false; undo and redo pass as they are.
export const guardProperties = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.startState.facet(showMarkdown)) return tr;
  if (!tr.isUserEvent("input") && !tr.isUserEvent("delete") && !tr.isUserEvent("move")) return tr;
  const start = tr.startState;
  const end = start.field(frontMatterEnd);
  if (!end) return tr;
  // Text typed right after a closing fence with no line break after it
  // starts a line of its own.
  const open = start.doc.sliceString(end - 1, end) !== "\n";
  // The cursor goes after what the cut-back edit puts where the text begins.
  let after = -1;
  const changes: ChangeSpec[] = [];
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const to = Math.max(toA, end);
    if (fromA < end || (open && fromA === end)) after = to;
    const from = Math.max(fromA, end);
    let insert = inserted.toString();
    if (open && from === end && insert) insert = "\n" + insert;
    changes.push({ from, to, insert });
  });
  if (after < 0) return tr;
  const set = start.changes(changes);
  const head = set.mapPos(after, 1);
  return {
    changes: set,
    selection: EditorSelection.cursor(head),
    effects: tr.effects,
    scrollIntoView: tr.scrollIntoView,
    userEvent: tr.annotation(Transaction.userEvent),
  };
});

// followLabels keeps references on a figure, table or equation whose label
// changes in place, in its dialog or by typing in the Markdown: references to
// the old label take the new one, in the same undoable step. Items pair up by
// kind and order; a label still in use after, or one already in use before,
// is left alone, so moving items or reusing a label doesn't steal references.
export const followLabels = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !(tr.isUserEvent("input") || tr.isUserEvent("delete"))) return tr;
  const before = tr.startState.field(itemsField);
  const after = tr.state.field(itemsField);
  const had = new Set(before.map((x) => x.label));
  const has = new Set(after.map((x) => x.label));
  const text = tr.newDoc.toString();
  const changes: ChangeSpec[] = [];
  for (const kind of Object.keys(kindName) as Kind[]) {
    const a = before.filter((x) => x.kind === kind);
    const b = after.filter((x) => x.kind === kind);
    if (a.length !== b.length) continue;
    a.forEach(({ label: from }, i) => {
      const to = b[i].label;
      if (from && to && from !== to && !has.has(from) && !had.has(to))
        changes.push(...relabelChanges(text, from, to));
    });
  }
  return changes.length ? [tr, { changes, sequential: true }] : tr;
});

// followFootnotes keeps numbered footnotes numbered 1, 2, 3… in order, and
// the notes together at the end, in the same undoable step: deleting a mark
// whole (as the editor shows it) deletes its note too, unless another mark
// shares it, and pasting or dropping text with marks renumbers them. Cutting
// leaves the note, for the mark to be pasted back; deleting part of a mark in
// the Markdown leaves it alone. A note written elsewhere moves to the end at
// the next edit outside it.
export const followFootnotes = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  const paste = tr.isUserEvent("input.paste") || tr.isUserEvent("move.drop");
  const edit =
    (tr.isUserEvent("input") || tr.isUserEvent("delete")) && !tr.isUserEvent("delete.cut");
  if (!paste && !edit) return tr;
  const before = tr.startState.field(footnotesField);
  const after = tr.state.field(footnotesField);
  const whole = (m: FootnoteMark) => {
    let hit = false;
    tr.changes.iterChangedRanges((fromA, toA) => {
      if (fromA <= m.from && toA >= m.to) hit = true;
    });
    return hit;
  };
  const gone = new Set<string>();
  for (const m of before.marks) {
    if (gone.has(m.label) || after.marks.some((x) => x.label === m.label)) continue;
    if (before.marks.every((x) => x.label !== m.label || whole(x))) gone.add(m.label);
  }
  let changes = ChangeSet.empty(tr.newDoc.length);
  if (paste || gone.size) {
    // Each note going takes the blank lines after it (or, at the end, before it).
    const doc = tr.newDoc;
    const text = doc.toString();
    const spans: { from: number; to: number }[] = [];
    for (const n of after.notes) {
      if (!gone.has(n.label)) continue;
      let { from, to } = n;
      while (to < text.length && /\s/.test(text[to])) to++;
      if (to === text.length) while (from > 0 && /\s/.test(text[from - 1])) from--;
      spans.push({ from, to });
    }
    spans.sort((a, b) => a.from - b.from);
    const cuts: { from: number; to: number; insert?: string }[] = [];
    for (const s of spans) {
      const last = cuts[cuts.length - 1];
      if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
      else cuts.push({ ...s });
    }
    const end = cuts[cuts.length - 1];
    if (end && end.to === text.length && end.from > 0) end.insert = "\n";
    const removed = ChangeSet.of(cuts, doc.length);
    const rest = removed.apply(doc);
    changes = removed.compose(ChangeSet.of(renumberFootnotes(rest.toString()), rest.length));
  }
  const doc = changes.apply(tr.newDoc);
  const cursor = changes.mapPos(tr.newSelection.main.head);
  const gather = gatherFootnotes(doc.toString(), cursor, changes.empty ? after : undefined);
  changes = changes.compose(ChangeSet.of(gather, doc.length));
  return changes.empty ? tr : [tr, { changes, sequential: true }];
});
