// What the citation manager's ribbon, dialog and pane do: cite at the
// cursor, open the dialog, show the References pane, and keep sources from
// Zotero up to date.

import { Service } from "@bindings/peanut-writer/internal/citations";
import { citationMarkdown } from "@/lib/markdown";
import { editor, errorText, state, toast } from "@/lib/store";
import { type Intent, referencesChanged, refs } from "./store";

function view() {
  const v = editor.value;
  if (!v) throw new Error("the editor isn't ready");
  return v;
}

// insertCitation cites the sources of keys at the cursor; the locator
// ("p. 4") goes after the last.
export function insertCitation(keys: string[], locator: string) {
  const v = view();
  const { from, to } = v.state.selection.main;
  const before = v.state.sliceDoc(from - 1, from);
  const text = (before && !/[\s(]/.test(before) ? " " : "") + citationMarkdown(keys, locator);
  v.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    userEvent: "input",
  });
  v.focus();
}

// openCitations opens the citation dialog, at its list or (intent) a
// reference's form or the import.
export function openCitations(intent: Intent | null = null) {
  refs.intent = intent;
  state.dialog = { kind: "citation" };
}

export function toggleReferencesPane() {
  refs.paneOpen = !refs.paneOpen;
  localStorage.setItem("referencesPane", refs.paneOpen ? "1" : "0");
}

// updateSources fetches every cited source from Zotero afresh; the others
// stay as they are.
export async function updateSources() {
  let res;
  try {
    res = await Service.UpdateSources(state.content);
  } catch (e) {
    toast(`Update sources: ${errorText(e)}`, "error");
    return;
  }
  referencesChanged();
  const n = `${res.sources} ${res.sources === 1 ? "source" : "sources"}`;
  if (res.notFound?.length)
    toast(
      `Updated ${n}. Zotero's library has none for ${res.notFound.map((k) => "@" + k).join(", ")}: kept as they were.`,
      "info",
    );
  else toast(`Updated ${n} from Zotero.`, "success");
}
