// citations.ts cites Zotero sources and keeps the document's references
// (Name.bib, fetched through Better BibTeX) up to date.

import { DocService } from "@bindings/peanut-writer";
import type { Source } from "@bindings/peanut-writer/internal/zotero/models";
import { citationMarkdown } from "@/lib/markdown";
import { scheduleRender, state, toast } from "@/lib/store";
import { run, view } from "./run";

// insertCitation fetches sources into the document's references and cites
// them at the cursor; the locator ("p. 4") goes after the last. Zotero's
// errors (not running, no Better BibTeX) are thrown for the dialog to show.
export async function insertCitation(sources: Source[], locator: string) {
  await DocService.AddSources(sources);
  const v = view();
  const { from, to } = v.state.selection.main;
  const before = v.state.sliceDoc(from - 1, from);
  const text =
    (before && !/[\s(]/.test(before) ? " " : "") +
    citationMarkdown(
      sources.map((s) => s.key),
      locator,
    );
  v.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    userEvent: "input",
  });
  v.focus();
}

// updateSources fetches every cited source from Zotero afresh, dropping
// those no longer cited.
export async function updateSources() {
  const res = await run("Update sources", () => DocService.UpdateSources(state.content));
  if (!res) return;
  scheduleRender();
  const n = `${res.sources} ${res.sources === 1 ? "source" : "sources"}`;
  if (res.notFound?.length)
    toast(
      `Updated ${n}. Zotero's library has none for ${res.notFound.map((k) => "@" + k).join(", ")}: kept as they were.`,
      "info",
    );
  else toast(`Updated ${n} from Zotero.`, "success");
}
