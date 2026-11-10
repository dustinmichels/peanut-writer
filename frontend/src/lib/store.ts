// App state shared by the components: the open document, the preview, and
// what the cursor is on (for the ribbon).

import { reactive, shallowRef } from "vue";
import type { EditorView } from "@codemirror/view";
import { DocService } from "../../bindings/peanut-writer";
import type { Template } from "../../bindings/peanut-writer/internal/templates/models";
import type { BlockStyle, Mark } from "./editor";
import type { Item } from "./markdown";

export type Dialog =
  | { kind: "figure"; item: Item }
  | { kind: "table"; item?: Item; cols?: number; rows?: number }
  | { kind: "crossref" }
  | { kind: "link"; text: string }
  | { kind: "properties" }
  | { kind: "cheatsheet" };

export interface Toast {
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

  pages: [] as string[],
  renderError: "",
  warnings: [] as string[],
  rendering: false,
  typstError: "",

  templates: [] as Template[],
  template: "classic", // the template the preview used
  items: [] as Item[],
  words: 0,

  marks: new Set<Mark>(),
  block: "p" as BlockStyle | "code" | "list",

  zoom: 0, // preview zoom as a fraction; 0 = fit the page to the pane
  fitZoom: 1,
  dialog: null as Dialog | null,
  toasts: [] as Toast[],
});

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
