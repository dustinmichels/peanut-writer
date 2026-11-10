// App state shared by the components: the open document, the preview, and
// what the cursor is on (for the ribbon).

import { computed, reactive, shallowRef } from "vue";
import type { EditorView } from "@codemirror/view";
import { DocService } from "../../bindings/peanut-writer";
import type { RecentFile } from "../../bindings/peanut-writer/models";
import type { Template } from "../../bindings/peanut-writer/internal/templates/models";
import type { Heading } from "../../bindings/peanut-writer/internal/doc/models";
import type { BlockStyle, Mark } from "./editor";
import type { Item, Table } from "./markdown";

type Dialog =
  | { kind: "figure"; item: Item }
  | { kind: "table"; item?: Item; cols?: number; rows?: number; table?: Table }
  | { kind: "pasteTable" }
  | { kind: "crossref" }
  | { kind: "link"; text: string }
  | { kind: "properties" }
  | { kind: "settings" }
  | { kind: "cheatsheet" }
  | { kind: "about" }
  | { kind: "recent"; files: RecentFile[] }
  | { kind: "templates" }
  | { kind: "commands" };

interface Toast {
  id: number;
  text: string;
  tone: "info" | "error" | "success";
  action?: { label: string; run: () => void };
}

export const state = reactive({
  path: "",
  name: "Untitled",
  saved: "", // the content as last saved (or opened)
  content: "",
  dirty: false,
  synced: null as string | null, // the content the PDF and Word copies were last synced from
  autosaved: false, // an autosave just ran (shown briefly in the title bar)

  pages: [] as string[],
  renderError: "",
  warnings: [] as string[],
  rendering: false,
  typstError: "",
  version: "", // the app's, recorded in the front matter on saving
  outline: [] as Heading[], // the headings, from the latest render
  outlineOpen: localStorage.getItem("outline") === "1", // the outline beside the preview
  currentHeading: 0, // source line of the outline heading the editor is scrolled to; 0 for none
  versionsOpen: localStorage.getItem("versions") === "1", // the named versions beside the editor

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
  fitZoom: 1,
  dialog: null as Dialog | null,
  toasts: [] as Toast[],
});

// Saving does something with unsaved changes, or for a document without a file.
export const canSave = computed(() => state.dirty || !state.path);
// Syncing does something unless the copies came from this very text.
export const canSync = computed(() => state.synced !== state.content);
// The templates the document can use: its own first, if it has one.
export const docTemplates = computed(() =>
  state.custom ? [state.custom, ...state.templates] : state.templates,
);

export const editor = shallowRef<EditorView | null>(null);

let toastId = 0;
export function toast(text: string, tone: Toast["tone"] = "info", action?: Toast["action"]) {
  const t = { id: ++toastId, text, tone, action };
  state.toasts.push(t);
  setTimeout(() => dismiss(t.id), action ? 8000 : 4000);
}

export function dismiss(id: number) {
  const i = state.toasts.findIndex((t) => t.id === id);
  if (i >= 0) state.toasts.splice(i, 1);
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) return String(e.message);
  return String(e);
}

// --- Preview rendering --------------------------------------------------------

let renderTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let pending = false;

// scheduleRender renders the preview shortly after typing stops, one render
// at a time, always ending with the latest text.
export function scheduleRender(delay = 280) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderNow, delay);
}

async function renderNow() {
  if (inFlight) {
    pending = true;
    return;
  }
  inFlight = true;
  state.rendering = true;
  try {
    const res = await DocService.Render(state.content);
    if (res.error === "canceled") return;
    state.outline = res.outline ?? [];
    if (res.error) state.renderError = res.error;
    else {
      state.pages = res.pages ?? [];
      state.renderError = "";
    }
    state.warnings = res.warnings ?? [];
    state.template = res.template || state.template;
  } catch (e) {
    state.renderError = errorText(e);
  } finally {
    inFlight = false;
    state.rendering = pending;
    if (pending) {
      pending = false;
      renderNow();
    }
  }
}
