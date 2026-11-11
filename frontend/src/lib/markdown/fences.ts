// Code fences and display math: the lines that open and close them, which
// the block reader and the footnote scan both skip over.

export interface Fence {
  char: string;
  len: number;
}

// fenceOpen reads a code fence: three or more backticks or tildes (a
// backtick fence's info string holds no backtick).
export function fenceOpen(line: string): Fence | null {
  const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m || (m[1][0] === "`" && m[2].includes("`"))) return null;
  return { char: m[1][0], len: m[1].length };
}

// fenceCloses tells whether line closes fence f: at least as many of the
// same character, and nothing else.
export function fenceCloses(line: string, f: Fence): boolean {
  const m = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/.exec(line);
  return !!m && m[1][0] === f.char && m[1].length >= f.len;
}

// displayMathStart is where the `$$` opening a display equation is on line,
// or -1: a line starting (after up to three spaces) with `$$`.
export function displayMathStart(line: string): number {
  const m = /^ {0,3}\$\$/.exec(line);
  return m ? m[0].length - 2 : -1;
}

// displayMathClose finds the `$$` closing a display equation on line, looking
// from `from`: the line's text, less an optional attribute block, ends with
// it. Null when line doesn't close the equation.
export function displayMathClose(
  line: string,
  from: number,
): { at: number; attrs: string; attrsFrom: number } | null {
  // White space as internal/doc's equationNode.add reads it: ASCII only.
  const m = /\$\$[ \t]*(?:[\t\n\f\r ]*(\{[^{}]*\})[\t\n\f\r ]*)?[ \t\r\n]*$/.exec(line.slice(from));
  if (!m) return null;
  const at = from + m.index;
  return {
    at,
    attrs: m[1] ?? "",
    attrsFrom: m[1] ? at + m[0].indexOf("{") : -1,
  };
}
