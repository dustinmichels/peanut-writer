// App state shared by the components: the open document, the preview, and
// what the cursor is on (for the ribbon).

import { computed, reactive, shallowRef, watch } from "vue";
import type { EditorView } from "@codemirror/view";
import { DocService } from "@bindings/peanut-writer";
import type { RecentFile } from "@bindings/peanut-writer/models";
import type { Template } from "@bindings/peanut-writer/internal/templates/models";
import type { Heading } from "@bindings/peanut-writer/internal/doc/models";
import type { Version } from "@bindings/peanut-writer/internal/versions/models";
import type { Backup } from "@bindings/peanut-writer/internal/backup/models";
import type { BlockStyle, Mark } from "@/lib/editor";
import type { DisplayEquation, Item, RefAt, Table } from "@/lib/markdown";
import type { Toast } from "./toasts";

export type Dialog =
  | { kind: "figure"; item: Item }
  | { kind: "table"; item?: Item; cols?: number; rows?: number; table?: Table }
  // An equation to edit, or (none) a new one, maybe of the lines in replace.
  | { kind: "equation"; eq?: DisplayEquation; tex?: string; replace?: { from: number; to: number } }
  | { kind: "pasteTable" }
  | { kind: "crossref"; at?: RefAt }
  | { kind: "citation" }
  | { kind: "link"; text: string }
  // A new footnote, or (label) the note of a mark that has none.
  | { kind: "footnote"; label?: string }
  | { kind: "footnotes" } // every footnote, beside its mark's sentence
  | { kind: "properties" }
  | { kind: "settings" }
  | { kind: "about" }
  | { kind: "recent"; files: RecentFile[] }
  | { kind: "start"; files: RecentFile[] }
  | { kind: "templates" }
  | { kind: "saveTemplate" }
  | { kind: "commands" };

export const state = reactive({
  path: "",
  name: "Untitled",
  saved: "", // the content as last saved (or opened)
  content: "",
  dirty: false,
  synced: null as string | null, // the content the PDF and Word copies were last synced from
  opened: null as string | null, // the content as opened; null once saved to another file
  autosaved: false, // an autosave just ran (shown briefly in the title bar)

  pages: [] as string[],
  renderError: "",
  warnings: [] as string[],
  rendering: false,
  typstError: "",
  version: "", // the app's, recorded in the front matter on saving
  outline: [] as Heading[], // the headings, from the latest render
  outlineOpen: localStorage.getItem("outline") !== "0", // the outline beside the preview; open unless hidden
  currentHeading: 0, // source line of the outline heading the editor is scrolled to; 0 for none
  focusSection: localStorage.getItem("focusSection") === "1", // the editor shows one section alone (the outline's toggle)
  focusedHeading: 0, // source line of the heading of the section the editor shows alone; 0 for none
  scrollLinked: true, // the editor and preview scroll together; only the link button unlinks them
  versionsOpen: localStorage.getItem("versions") === "1", // the named versions beside the editor
  versions: [] as Version[], // the document's named versions, newest first
  backups: [] as Backup[], // its automatic backups, newest first
  previewOpen: localStorage.getItem("preview") !== "0", // the preview beside the editor; always shown while customizing
  split: Number(localStorage.getItem("split")) || 0.5, // the editor's share of the width it splits with the preview

  templates: [] as Template[],
  template: "classic", // the template the preview used
  custom: null as Template | null, // the document's own template (Design → Customize), if it has one
  customizing: false, // the editor pane shows the document's own template's fonts and colors
  items: [] as Item[],
  words: 0,

  marks: new Set<Mark>(),
  block: "p" as BlockStyle | "code" | "list",

  zoom: 0, // preview zoom as a fraction; 0 = fit the page to the pane
  // The editor shows the document's Markdown rather than hiding its marks.
  showMarkdown: localStorage.getItem("showMarkdown") === "1",
  showPeanut: true, // Peanut beside the ribbon tabs (Settings)
  peanutBusy: false, // Peanut's activity level is "busy", not "chill" (Settings)
  syncOnSave: false, // saving also syncs the PDF and Word copies (Settings)
  syncOnQuit: true, // quitting or opening another document also syncs them (Settings)
  zotero: false, // the References tab cites sources from Zotero (Settings)
  fitZoom: 1,
  dialog: null as Dialog | null,
  cheatSheet: false, // the Markdown cheat sheet, shown over any dialog
  toasts: [] as Toast[],
});

// Saving does something with unsaved changes, or for a document without a file.
export const canSave = computed(() => state.dirty || !state.path);
// Syncing does something unless the copies came from this very text.
export const canSync = computed(() => state.synced !== state.content);
// The copies are behind edits made since the document was opened or last
// synced, once it has a file. With Sync on quit, closing the window waits
// for the editor to sync them.
export const behindCopies = computed(
  () => !!state.path && state.content !== (state.synced ?? state.opened),
);
watch(
  () => state.syncOnQuit && behindCopies.value,
  (behind) => DocService.SetUnsynced(behind),
);
// The templates the document can use: its own first, if it has one.
export const docTemplates = computed(() =>
  state.custom ? [state.custom, ...state.templates] : state.templates,
);

export const editor = shallowRef<EditorView | null>(null);
