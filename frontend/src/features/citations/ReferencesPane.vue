<script setup lang="ts">
import { computed, ref } from "vue";
import { Import, PanelLeftClose, Pencil, Plus } from "lucide-vue-next";
import type { Reference } from "@bindings/peanut-writer/internal/refs/models";
import { goTo } from "@/lib/editor";
import { citations } from "@/lib/markdown";
import { editor, state } from "@/lib/store";
import { openCitations, toggleReferencesPane } from "./actions";
import { refs } from "./store";
import { plain, whoWhen } from "./text";

// The document's citations, read once per change to its text.
const cites = computed(() => citations(state.content));

// How many times each key is cited.
const counts = computed(() => {
  const m = new Map<string, number>();
  for (const c of cites.value) for (const k of c.keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
});

// The references by author and year, as the citation dialog lists them.
const sorted = computed(() =>
  refs.list
    .map((r) => ({ r, label: whoWhen(r) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
);

// The filter keeps references whose key, authors, title or year have every
// word typed.
const query = ref("");
const shown = computed(() => {
  const words = query.value.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return sorted.value;
  const text = (r: Reference) =>
    [r.key, ...(r.authors ?? []), plain(r.title), r.year].join(" ").toLowerCase();
  return sorted.value.filter(({ r }) => {
    const t = text(r);
    return words.every((w) => t.includes(w));
  });
});

// Clicking a reference goes to its next citation after the cursor, and
// round to the first from the last.
function next(key: string) {
  const view = editor.value;
  if (!view) return;
  const at = cites.value.filter((c) => c.keys.includes(key));
  if (!at.length) return;
  const head = view.state.selection.main.head;
  goTo(view, (at.find((c) => c.from > head) ?? at[0]).from);
}

// "Cited once", "Cited 3 times", or "Not cited".
function cited(key: string) {
  const n = counts.value.get(key) ?? 0;
  return n === 0 ? "Not cited" : n === 1 ? "Cited once" : `Cited ${n} times`;
}
</script>

<template>
  <aside class="references" aria-label="References">
    <header>
      <span>References</span>
      <button title="Hide references" @click="toggleReferencesPane">
        <PanelLeftClose :size="14" />
      </button>
    </header>
    <div class="tools">
      <div class="add">
        <button title="Add a reference" @click="openCitations({ add: true })">
          <Plus :size="14" /> New
        </button>
        <button title="Import references" @click="openCitations({ import: true })">
          <Import :size="14" /> Import
        </button>
      </div>
      <input
        v-if="refs.list.length"
        v-model="query"
        type="search"
        placeholder="Filter"
        aria-label="Filter references"
      />
    </div>
    <div class="list">
      <p v-if="refs.error" class="empty error">{{ refs.error }}</p>
      <p v-else-if="!refs.loaded" class="empty">Reading the references…</p>
      <p v-else-if="!refs.list.length" class="empty">
        No references yet. New and Import add them, to cite with
        <code>[@key]</code>.
      </p>
      <p v-else-if="!shown.length" class="empty">No references match.</p>
      <ul v-else>
        <li v-for="{ r, label } in shown" :key="r.key" :class="{ uncited: !counts.get(r.key) }">
          <button
            class="row"
            :disabled="!counts.get(r.key)"
            :title="counts.get(r.key) ? 'Go to its next citation' : undefined"
            @click="next(r.key)"
          >
            <span class="who">{{ label }}</span>
            <span class="title">{{ plain(r.title) || "Untitled" }}</span>
            <span class="meta">
              <span class="key">@{{ r.key }}</span>
              <span class="count">{{ cited(r.key) }}</span>
            </span>
          </button>
          <button class="edit" title="Edit reference" @click.stop="openCitations({ edit: r.key })">
            <Pencil :size="13" />
          </button>
        </li>
      </ul>
    </div>
  </aside>
</template>

<style scoped>
.references {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--panel);
  border-right: 1px solid var(--border);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  padding: 0 6px 0 12px;
  font-family: var(--rounded);
  font-weight: 650;
  color: var(--roast);
  border-bottom: 1px solid var(--border);
}
button {
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--quote);
}
header button,
.edit {
  flex: none;
  width: 22px;
  height: 22px;
}
button:hover:not(:disabled) {
  background: var(--hover);
}
.tools {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid var(--border);
}
.add {
  display: flex;
  gap: 6px;
}
.add button {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 28px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink);
  font-weight: 600;
}
input {
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: white;
  color: var(--ink);
}
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
ul {
  margin: 0;
  padding: 6px 0;
  list-style: none;
}
li {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  padding: 0 6px 0 0;
}
li:hover {
  background: var(--hover);
}
.row {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
  padding: 5px 4px 5px 10px;
  border-radius: 0;
  font: inherit;
  text-align: left;
}
.row:hover:not(:disabled) {
  background: transparent;
}
.row:disabled {
  cursor: default;
}
.edit {
  margin-top: 4px;
}
.who,
.title,
.meta {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.who {
  color: var(--ink);
  font-weight: 600;
}
.title {
  color: var(--quote);
}
.meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
}
.key {
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--mono);
}
.count {
  flex: none;
  margin-left: auto;
}
.uncited .row {
  opacity: 0.55;
}
.empty {
  margin: 12px;
  color: var(--muted);
  line-height: 1.5;
}
.empty code {
  font-family: var(--mono);
}
.error {
  color: var(--danger);
}
</style>
