// Front matter: the YAML block of title, author and the rest that starts a
// document, read into Meta and written back out.

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
  const lines = text.split("\n");
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "---" || t === "...") {
      end = i;
      break;
    }
  }
  if (end < 0) return none;
  const extra: string[] = [];
  for (const line of lines.slice(1, end)) {
    const m = /^\s*([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line.replace(/\r$/, ""));
    const key = m?.[1].toLowerCase() as keyof Meta | undefined;
    if (m && key && metaKeys.includes(key)) meta[key] = unquote(m[2].trim());
    else if (line.trim()) extra.push(line);
  }
  const to = lines.slice(0, end + 1).join("\n").length + (end + 1 < lines.length ? 1 : 0);
  return { meta, from: 0, to, extra };
}

function unquote(v: string): string {
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    if (v[0] === '"') {
      try {
        return JSON.parse(v);
      } catch {
        /* fall through */
      }
    }
    return v.slice(1, -1);
  }
  return v;
}

function quoteIfNeeded(v: string): string {
  return /^[\s"'[{>|*&!%@`#-]|:\s|\s$|#/.test(v) ? JSON.stringify(v) : v;
}

// writeFrontMatter is the front matter block for meta (and lines kept from
// before); "" when there's nothing to say.
export function writeFrontMatter(meta: Meta, extra: string[] = []): string {
  const lines = metaKeys
    .filter((k) => meta[k].trim() !== "")
    .map((k) => `${k}: ${quoteIfNeeded(meta[k].replace(/\s*\n\s*/g, " ").trim())}`);
  lines.push(...extra);
  return lines.length ? `---\n${lines.join("\n")}\n---\n` : "";
}
