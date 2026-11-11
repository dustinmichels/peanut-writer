// Reading again after an edit. The block and footnote readers go a line at a
// time, and at a line with nothing open before it (no list, quote, note,
// fence or paragraph carrying on) what follows reads the same whatever came
// before. They note those lines, so after an edit only the lines from the
// last one before it to the first after it where the reading lines up with
// the last are read again; the rest is kept, moved.

// The lines a reading can restart at: their offsets and 0-based lines.
export interface Restarts {
  at: number[];
  line: number[];
}

// A reader reads from a restart point (from, on line), calling point at each
// one it comes to, from on, and stops when point returns true.
export type Reader = (
  from: number,
  line: number,
  point: (at: number, line: number) => boolean,
) => void;

export interface Reread {
  from: number; // where reading resumed: what starts before it is kept
  restarts: Restarts;
  // The old restart point the reading lined up with, -1 for none: what
  // starts from it on is kept, moved by shift characters and lines lines.
  old: number;
  shift: number;
  lines: number;
}

// reread reads again with read after fromA–toA of the old text, whose
// restart points were prev, became fromA–toB. Null when the edit starts
// before the first restart point (in the front matter).
export function reread(
  prev: Restarts,
  fromA: number,
  toA: number,
  toB: number,
  read: Reader,
): Reread | null {
  const k = search(prev.at, fromA + 1) - 1; // the last point at or before fromA
  if (k < 0) return null;
  const at = prev.at.slice(0, k);
  const line = prev.line.slice(0, k);
  const shift = toB - toA;
  let j = search(prev.at, toA);
  let old = -1;
  let lines = 0;
  read(prev.at[k], prev.line[k], (p, l) => {
    if (p >= toB) {
      while (j < prev.at.length && prev.at[j] < p - shift) j++;
      if (prev.at[j] === p - shift) {
        old = prev.at[j];
        lines = l - prev.line[j];
        for (; j < prev.at.length; j++) {
          at.push(prev.at[j] + shift);
          line.push(prev.line[j] + lines);
        }
        return true;
      }
    }
    at.push(p);
    line.push(l);
    return false;
  });
  return { from: prev.at[k], restarts: { at, line }, old, shift, lines };
}

// search is the index of the first of the sorted xs at or after x.
function search(xs: number[], x: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// splice is a list after rereading: the old one's start, what was read again
// (fresh), and its end, moved.
export function splice<T extends { from: number }>(
  prev: T[],
  fresh: T[],
  r: Reread,
  move: (x: T) => T,
): T[] {
  const out: T[] = [];
  for (const x of prev) {
    if (x.from >= r.from) break;
    out.push(x);
  }
  out.push(...fresh);
  if (r.old >= 0) for (const x of prev) if (x.from >= r.old) out.push(move(x));
  return out;
}
