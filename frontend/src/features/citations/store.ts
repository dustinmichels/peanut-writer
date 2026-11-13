// The open document's references, as the citation manager's dialog, pane and
// editor hints show them: read when a document opens, and again whenever the
// manager changes them.

import { computed, reactive, watch } from "vue";
import { Service } from "@bindings/peanut-writer/internal/citations";
import type { Reference } from "@bindings/peanut-writer/internal/refs/models";
import { errorText, scheduleRender, state } from "@/lib/store";

// What the citation dialog opens to, besides its list: a reference to edit
// (by key), a new one, or the import.
export type Intent = { edit: string } | { add: true; key?: string } | { import: true };

export const refs = reactive({
  list: [] as Reference[],
  loaded: false,
  error: "",
  paneOpen: localStorage.getItem("referencesPane") === "1", // the References pane beside the editor
  intent: null as Intent | null,
});

// The references by key.
export const byKey = computed(() => new Map(refs.list.map((r) => [r.key, r])));

// Only the latest read's answer is kept (documents switch under a slow one).
let asked = 0;
export async function loadReferences() {
  const n = ++asked;
  try {
    const list = (await Service.References()) ?? [];
    if (n !== asked) return;
    refs.list = list;
    refs.error = "";
  } catch (e) {
    if (n === asked) refs.error = errorText(e);
  }
  if (n === asked) refs.loaded = true;
}

// referencesChanged reads the references again after the manager changed
// them, and renders the preview, whose citations they write.
export async function referencesChanged() {
  scheduleRender();
  await loadReferences();
}

// A document opened (or saved elsewhere) has references of its own.
watch(
  () => [state.path, state.opened],
  () => {
    refs.loaded = false;
    loadReferences();
  },
  { immediate: true },
);
