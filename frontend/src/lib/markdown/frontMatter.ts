// Front matter: the YAML block of title, author and the rest that starts a
// document, read into Meta and written back out.

import { goSpace, goTrim } from "./space";

export interface Meta {
  title: string;
  subtitle: string;
  author: string;
  topic: string; // what it's about (an assignment, a subject), beside the author and date
  date: string;
  header: string; // a class, team, project or company, for page headers and footers
  abstract: string;
  template: string;
  hide: string; // the fields kept out of the output, comma-separated
  "peanut-version": string; // the app's version that last saved it
}

const metaKeys: (keyof Meta)[] = [
  "title",
  "subtitle",
  "author",
  "topic",
  "date",
  "header",
  "abstract",
  "template",
  "hide",
  "peanut-version",
];

interface FrontMatter {
  meta: Meta;
  // Character offsets of the whole block (both fences); 0,0 when absent.
  from: number;
  to: number;
  // Lines this editor doesn't know, kept as they are.
  extra: string[];
}

function emptyMeta(): Meta {
  return {
    title: "",
    subtitle: "",
    author: "",
    topic: "",
    date: "",
    header: "",
    abstract: "",
    template: "",
    hide: "",
    "peanut-version": "",
  };
}

export function readFrontMatter(text: string): FrontMatter {
  const meta = emptyMeta();
  const none = { meta, from: 0, to: 0, extra: [] };
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return none;
  // Its lines, up to the closing `---` or `...` (the rest isn't split: it can
  // be long).
  const lines: string[] = [];
  let to = -1;
  for (let start = text.indexOf("\n") + 1; to < 0;) {
    const nl = text.indexOf("\n", start);
    const line = text.slice(start, nl < 0 ? text.length : nl);
    const t = goTrim(line);
    if (t === "---" || t === "...") to = nl < 0 ? text.length : nl + 1;
    else if (nl < 0) return none;
    else {
      lines.push(line);
      start = nl + 1;
    }
  }
  const extra: string[] = [];
  for (const line of lines) {
    // `s`: a value may hold U+2028 or U+2029, which `.` doesn't match.
    const m = keyLine.exec(line.replace(/\r$/, ""));
    const key = m?.[1].toLowerCase() as keyof Meta | undefined;
    if (m && key && metaKeys.includes(key)) meta[key] = unquote(goTrim(m[2]));
    else if (line.trim()) extra.push(line);
  }
  return { meta, from: 0, to, extra };
}

// Keys, values and fences are trimmed as internal/doc trims them.
const keyLine = new RegExp(String.raw`^[${goSpace}]*([A-Za-z_-]+)[${goSpace}]*:(.*)$`, "s");

// unquote reads a value as internal/doc does: one in double quotes takes
// YAML's escapes, and one in single quotes, or with an escape that isn't
// one, is taken as written.
function unquote(v: string): string {
  if (v.length < 2 || !((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    return v;
  }
  return (v[0] === '"' ? unescape(v.slice(1, -1)) : null) ?? v.slice(1, -1);
}

// YAML's double-quoted escapes but `\x`, `\u` and `\U`.
const yamlEscapes: Record<string, string> = {
  "0": "\0",
  a: "\x07",
  b: "\b",
  t: "\t",
  "\t": "\t",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  e: "\x1b",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  N: "\x85",
  _: "\xa0",
  L: "\u2028",
  P: "\u2029",
};
const hexDigits: Record<string, number> = { x: 2, u: 4, U: 8 };

// hexEscape reads the `x`, `u` or `U` escape whose letter is s[i]: the code
// point and the number of hex digits, or null.
function hexEscape(s: string, i: number): [number, number] | null {
  const n = hexDigits[s[i]];
  const h = n ? s.slice(i + 1, i + 1 + n) : "";
  if (!n || h.length < n || !/^[0-9a-fA-F]+$/.test(h)) return null;
  const c = parseInt(h, 16);
  return c > 0x10ffff ? null : [c, n];
}

// unescape undoes the escapes in a double-quoted value, as internal/doc
// does; null if one isn't YAML's or a `"` is bare. `\uD83D\uDE00` (UTF-16,
// as JSON writes it) is one character; a lone surrogate isn't one.
function unescape(s: string): string | null {
  if (!/[\\"]/.test(s)) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') return null;
    if (s[i] !== "\\") {
      out += s[i];
      continue;
    }
    if (++i === s.length) return null;
    const e = yamlEscapes[s[i]];
    if (e !== undefined) {
      out += e;
      continue;
    }
    const x = hexEscape(s, i);
    if (!x) return null;
    let [c] = x;
    i += x[1];
    if (c >= 0xd800 && c <= 0xdfff) {
      // A high one and a low one, `\u` too.
      const lo = s.startsWith("\\u", i + 1) ? hexEscape(s, i + 2) : null;
      if (c >= 0xdc00 || !lo || lo[0] < 0xdc00 || lo[0] > 0xdfff) return null;
      c = 0x10000 + ((c - 0xd800) << 10) + (lo[0] - 0xdc00);
      i += 2 + lo[1];
    }
    out += String.fromCodePoint(c);
  }
  return out;
}

// needsQuotes matches a value that reads differently unquoted: in YAML, or
// here, where a value is trimmed and a line ends at a line break.
const needsQuotes = new RegExp(
  String.raw`^[${goSpace}"'[{>|*&!%@${"`"}#-]|:[${goSpace}]|[${goSpace}]$|#|[\x00-\x1f\x7f-\x9f\ufeff\ufffe\uffff]`,
);

// quoteIfNeeded writes v as internal/doc's FrontMatterValue does: in double
// quotes when it needs them, with only the escapes unquote reads. A lone
// surrogate, which UTF-8 can't hold, becomes U+FFFD.
function quoteIfNeeded(v: string): string {
  v = v.replace(
    /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
    "\ufffd",
  );
  if (!needsQuotes.test(v)) return v;
  const escaped = v.replace(/[\\"\x00-\x1f\x7f-\x9f\ufeff\ufffe\uffff]/g, (c) => {
    if (c === "\\" || c === '"') return "\\" + c;
    if (c === "\t") return "\\t";
    if (c === "\n") return "\\n";
    if (c === "\r") return "\\r";
    const hex = c.charCodeAt(0).toString(16).toUpperCase();
    return c <= "\xff" ? `\\x${hex.padStart(2, "0")}` : `\\u${hex}`;
  });
  return `"${escaped}"`;
}

// writeFrontMatter is the front matter block for meta (and lines kept from
// before); "" when there's nothing to say.
export function writeFrontMatter(meta: Meta, extra: string[] = []): string {
  const lines = metaKeys
    .map((k) => [k, goTrim(meta[k].replace(/\s*\n\s*/g, " "))])
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}: ${quoteIfNeeded(v)}`);
  lines.push(...extra);
  return lines.length ? `---\n${lines.join("\n")}\n---\n` : "";
}
