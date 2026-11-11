// White space as internal/doc reads it, which isn't JavaScript's `\s`.

// goSpace is what Go's strings.TrimSpace trims, as a regexp class: no
// U+FEFF, which `\s` has, but U+0085, which it lacks.
export const goSpace = String.raw`\t\n\v\f\r \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000`;

// reSpace is `\s` in Go's regexps: ASCII only.
export const reSpace = String.raw`\t\n\f\r `;

const isGoSpace = new RegExp(`^[${goSpace}]$`);

// goTrim trims s as strings.TrimSpace does. A loop: `/\s+$/` is quadratic
// on long runs of spaces.
export function goTrim(s: string): string {
  let from = 0;
  let to = s.length;
  while (from < to && isGoSpace.test(s[from])) from++;
  while (to > from && isGoSpace.test(s[to - 1])) to--;
  return s.slice(from, to);
}

// trimEnd trims the white space goldmark trims (no-break spaces and such are
// text to it).
export function trimEnd(s: string): string {
  let end = s.length;
  while (end > 0 && " \t\r\n".includes(s[end - 1])) end--;
  return s.slice(0, end);
}
