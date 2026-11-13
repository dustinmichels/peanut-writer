<script setup lang="ts">
// CitationDialog cites sources at the cursor, in the document's citation
// style. They come from the document's references (Name.bib), which it adds
// to, edits (ReferenceForm) and imports into (ImportPanel), or, with Zotero
// citations on, from the Zotero library through Better BibTeX, copied into
// those references when cited. Until Zotero is open with Better BibTeX, its
// tab shows how to set them up.
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { BookOpen, Check, FileUp, Pencil, Plus } from "lucide-vue-next";
import { Service } from "@bindings/peanut-writer/internal/citations";
import type { Reference } from "@bindings/peanut-writer/internal/refs/models";
import type { Source, Status } from "@bindings/peanut-writer/internal/zotero/models";
import Modal from "@/components/ui/Modal.vue";
import ImportPanel from "./ImportPanel.vue";
import ReferenceForm from "./ReferenceForm.vue";
import ZoteroSetup from "./ZoteroSetup.vue";
import { insertCitation } from "./actions";
import { byKey, referencesChanged, refs } from "./store";
import { authorsShort, blank, plain } from "./text";
import { setMeta } from "@/lib/actions";
import { readFrontMatter } from "@/lib/markdown";
import { errorText, state, toast } from "@/lib/store";

const emit = defineEmits<{ close: [] }>();

// A source listed: from the document's references, or from Zotero.
interface Row {
  key: string;
  who: string;
  year: string;
  title: string;
  container: string;
  ref?: Reference;
  zotero?: Source;
}

const tab = ref<"document" | "zotero">("document");
const query = ref("");
const results = ref<Source[]>([]);
const picked = ref<Row[]>([]);
const cursor = ref(0);
const locator = ref("");
const error = ref("");
const searching = ref(false);
const busy = ref(false);
const styles = ref<string[]>([]);
const style = ref(readFrontMatter(state.content).meta["citation-style"].trim().toLowerCase());
const search = useTemplateRef("search");
const listEl = useTemplateRef("listEl");

// The reference being added (old "") or edited, while the form shows; or
// the import, while it shows.
const editing = ref<{ reference: Reference; old: string } | null>(null);
const importing = ref(false);
const form = useTemplateRef("form");
const importer = useTemplateRef("importer");

const docRows = computed<Row[]>(() => {
  const words = query.value.toLowerCase().split(/\s+/).filter(Boolean);
  return refs.list
    .map((r) => ({
      key: r.key,
      who: authorsShort(r.authors),
      year: r.year,
      title: plain(r.title),
      container: plain(r.container),
      ref: r,
    }))
    .filter((row) => {
      const text = [row.key, ...(row.ref.authors ?? []), row.year, row.title, row.container]
        .join(" ")
        .toLowerCase();
      return words.every((w) => text.includes(w));
    });
});
const zoteroRows = computed<Row[]>(() =>
  results.value.map((s) => ({
    key: s.key,
    who: s.authors,
    year: s.year,
    title: s.title,
    container: s.container,
    zotero: s,
  })),
);
const rows = computed(() => (tab.value === "document" ? docRows.value : zoteroRows.value));

// Whether Zotero is open with Better BibTeX: null until first asked.
const status = ref<Status | null>(null);
const checking = ref(false);
const ready = computed(() => !!status.value?.betterBibTeX);
async function check() {
  checking.value = true;
  try {
    status.value = await Service.ZoteroStatus();
  } catch (e) {
    status.value = { zotero: false, betterBibTeX: false, version: "", error: errorText(e) };
  } finally {
    checking.value = false;
  }
  if (ready.value) {
    error.value = "";
    await nextTick();
    search.value?.focus();
    find();
  }
}
// The setup shows in place of the search until Zotero is ready.
const setup = computed(() => tab.value === "zotero" && !ready.value);

function show(t: "document" | "zotero") {
  tab.value = t;
  cursor.value = 0;
  error.value = "";
  if (t === "zotero" && !status.value) check();
  else if (t === "zotero") find();
  nextTick(() => search.value?.focus());
}

const isPicked = (r: Row) => picked.value.some((p) => p.key === r.key);
const toggle = (r: Row) => {
  picked.value = isPicked(r) ? picked.value.filter((p) => p.key !== r.key) : [...picked.value, r];
};
// The locator ("p. 4") goes after the last source picked.
const locatorFor = computed(() => picked.value.at(-1)?.key ?? "");

// Zotero searches run once typing pauses; only the latest one's answer is
// shown. The document's references are filtered as you type.
let timer: ReturnType<typeof setTimeout> | undefined;
let asked = 0;
function find() {
  clearTimeout(timer);
  const q = query.value.trim();
  if (tab.value !== "zotero" || !ready.value) return;
  if (!q) {
    results.value = [];
    return;
  }
  timer = setTimeout(async () => {
    const n = ++asked;
    searching.value = true;
    try {
      const found = (await Service.SearchSources(q)) ?? [];
      if (n !== asked) return;
      results.value = found;
      cursor.value = 0;
      error.value = "";
    } catch (e) {
      if (n === asked) {
        error.value = errorText(e);
        check(); // Zotero may have been closed meanwhile: then the setup shows
      }
    } finally {
      if (n === asked) searching.value = false;
    }
  }, 250);
}
watch(query, () => {
  cursor.value = 0;
  find();
});

function back() {
  editing.value = null;
  importing.value = false;
  tab.value = "document";
  nextTick(() => search.value?.focus());
}

async function saved(r: Reference) {
  const fresh = !editing.value?.old;
  await referencesChanged();
  back();
  const row = docRows.value.find((x) => x.key === r.key);
  if (fresh && row && !isPicked(row)) toggle(row);
}

async function deleted(key: string) {
  picked.value = picked.value.filter((p) => p.key !== key);
  await referencesChanged();
  back();
}

function imported(n: number) {
  toast(`Imported ${n} ${n === 1 ? "reference" : "references"}.`, "success");
  back();
}

async function submit() {
  if (editing.value) {
    form.value?.save();
    return;
  }
  if (importing.value) {
    importer.value?.submit();
    return;
  }
  if (setup.value) {
    check();
    return;
  }
  if (!picked.value.length) {
    const r = rows.value[cursor.value];
    if (!r) return;
    picked.value = [r];
  }
  const fromZotero = picked.value.flatMap((p) => (p.zotero ? [p.zotero] : []));
  busy.value = true;
  try {
    if (fromZotero.length) {
      await Service.AddSources(fromZotero);
      referencesChanged();
    }
    insertCitation(
      picked.value.map((p) => p.key),
      locator.value,
    );
    emit("close");
  } catch (e) {
    error.value = errorText(e);
    if (fromZotero.length) check();
  } finally {
    busy.value = false;
  }
}

function setStyle(s: string) {
  style.value = s;
  setMeta({ "citation-style": s === styles.value[0] ? "" : s });
}

function key(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || state.cheatSheet || editing.value || importing.value || setup.value)
    return;
  if (e.key === "ArrowDown") cursor.value = Math.min(cursor.value + 1, rows.value.length - 1);
  else if (e.key === "ArrowUp") cursor.value = Math.max(cursor.value - 1, 0);
  else if (e.key === "Enter" && e.target === search.value && rows.value[cursor.value]) {
    // Enter picks the highlighted source; ⌘↩ inserts.
    toggle(rows.value[cursor.value]);
  } else return;
  e.preventDefault();
  nextTick(() => listEl.value?.children[cursor.value]?.scrollIntoView({ block: "nearest" }));
}

const title = computed(() => {
  if (editing.value) return editing.value.old ? "Edit reference" : "New reference";
  if (importing.value) return "Import references";
  return setup.value && status.value ? "Set up Zotero citations" : "Citation";
});

onMounted(async () => {
  window.addEventListener("keydown", key);
  // Opened to a reference's form or the import (from the References pane or
  // a citation's hint).
  const intent = refs.intent;
  refs.intent = null;
  if (intent && "edit" in intent) {
    const r = byKey.value.get(intent.edit);
    if (r) editing.value = { reference: r, old: r.key };
  } else if (intent && "add" in intent)
    editing.value = { reference: { ...blank(), key: intent.key ?? "" }, old: "" };
  else if (intent && "import" in intent) importing.value = true;
  else nextTick(() => search.value?.focus());
  styles.value = (await Service.CitationStyles()) ?? [];
  if (!styles.value.includes(style.value)) style.value = styles.value[0] ?? "";
});
onUnmounted(() => {
  window.removeEventListener("keydown", key);
  clearTimeout(timer);
});
</script>

<template>
  <Modal :title="title" wide @close="emit('close')" @submit="submit">
    <ReferenceForm
      v-if="editing"
      ref="form"
      :reference="editing.reference"
      :old="editing.old"
      @saved="saved"
      @deleted="deleted"
    />
    <ImportPanel v-else-if="importing" ref="importer" @imported="imported" />
    <template v-else>
      <div v-if="state.zotero" class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'document'"
          :class="{ on: tab === 'document' }"
          @click="show('document')"
        >
          This document
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'zotero'"
          :class="{ on: tab === 'zotero' }"
          @click="show('zotero')"
        >
          Zotero
        </button>
      </div>
      <div v-if="setup && !status" class="none">
        <img src="/peanut.svg" alt="" /> Looking for Zotero…
      </div>
      <ZoteroSetup
        v-else-if="setup && status"
        :status="status"
        :checking="checking"
        @check="check"
      />
      <template v-else>
        <div class="search">
          <label class="field">
            {{ tab === "document" ? "Search the document's references" : "Search Zotero" }}
            <input
              ref="search"
              v-model="query"
              placeholder="An author, a title or a year"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <template v-if="tab === 'document'">
            <button type="button" class="btn" @click="editing = { reference: blank(), old: '' }">
              <Plus :size="16" /> New reference
            </button>
            <button type="button" class="btn" title="Add BibTeX or RIS" @click="importing = true">
              <FileUp :size="16" /> Import…
            </button>
          </template>
        </div>
        <div v-if="error || (tab === 'document' && refs.error)" class="none error">
          <img src="/peanut.svg" alt="" />
          {{ error || refs.error }}
        </div>
        <div v-else-if="rows.length" ref="listEl" class="list">
          <div
            v-for="(r, i) in rows"
            :key="(r.zotero?.library ?? '') + ':' + r.key"
            class="row"
            :class="{ on: i === cursor, picked: isPicked(r) }"
            @mousemove="cursor = i"
            @click="toggle(r)"
          >
            <Check v-if="isPicked(r)" :size="16" class="tick" />
            <BookOpen v-else :size="16" />
            <span class="src">
              <span class="who"
                >{{ r.who || "No author" }}<template v-if="r.year"> · {{ r.year }}</template></span
              >
              <span class="title">{{ r.title || "Untitled" }}</span>
              <span v-if="r.container" class="in">{{ r.container }}</span>
            </span>
            <code>@{{ r.key }}</code>
            <button
              v-if="r.ref"
              type="button"
              class="btn icon"
              title="Edit reference"
              @click.stop="editing = { reference: r.ref, old: r.key }"
            >
              <Pencil :size="14" />
            </button>
          </div>
        </div>
        <div v-else class="none">
          <img src="/peanut.svg" alt="" />
          {{
            tab === "zotero"
              ? searching
                ? "Searching…"
                : query.trim()
                  ? "Nothing in your Zotero library matches."
                  : "Type to search your Zotero library."
              : !refs.loaded
                ? "Reading the references…"
                : refs.list.length
                  ? "None of the document's references match."
                  : "No references yet: add one with New reference, or Import some."
          }}
        </div>
        <div class="row-fields">
          <label class="field">
            Page or section <span v-if="locatorFor" class="for">for @{{ locatorFor }}</span>
            <input v-model="locator" placeholder="e.g. p. 4" :disabled="!picked.length" />
          </label>
          <label class="field">
            Citation style
            <select :value="style" @change="setStyle(($event.target as HTMLSelectElement).value)">
              <option v-for="s in styles" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
        </div>
        <p class="hint">
          Enter picks a source; pick several to cite them together. Citations read
          <code>[@key]</code> in the text, and the reference list goes at the end, or where a line
          holds <code>[References]</code>.
          <template v-if="!state.zotero">
            To cite from Zotero, turn on Settings → Zotero citations.
          </template>
        </p>
      </template>
    </template>
    <template #footer>
      <template v-if="editing || importing">
        <span style="flex: 1" />
        <button type="button" class="btn" @click="back">Back</button>
        <button v-if="editing" type="submit" class="btn primary" :disabled="form?.busy">
          Save
        </button>
        <button v-else type="submit" class="btn primary" :disabled="importer?.busy">
          {{ importer?.count ? `Import ${importer.count}` : "Read" }}
        </button>
      </template>
      <template v-else>
        <span v-if="picked.length" class="count">{{ picked.length }} picked</span>
        <span style="flex: 1" />
        <button type="button" class="btn" @click="emit('close')">Cancel</button>
        <button
          v-if="!setup"
          type="submit"
          class="btn primary"
          :disabled="busy || (!picked.length && !rows[cursor])"
        >
          Insert
        </button>
      </template>
    </template>
  </Modal>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
}
.tabs button {
  flex: 1;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
}
.tabs button:hover {
  color: var(--ink);
}
.tabs button.on {
  background: var(--surface);
  color: var(--roast);
  font-weight: 650;
  box-shadow: 0 1px 2px rgba(80, 40, 10, 0.15);
}
.search {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.search .field {
  flex: 1;
}
.search .btn {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.list {
  display: flex;
  flex-direction: column;
  max-height: 300px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: default;
}
.row > svg {
  color: var(--accent-ink);
  flex: none;
}
.row.on {
  background: var(--cream);
}
.row.picked {
  box-shadow: inset 0 0 0 1.5px var(--accent);
}
.src {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.src > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.who {
  color: var(--roast);
  font-weight: 600;
}
.in {
  color: var(--muted);
  font-size: 12px;
  font-style: italic;
}
code {
  flex: none;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
}
.none {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px;
  border-radius: 12px;
  background: var(--panel);
  color: var(--quote);
}
.none.error {
  color: var(--danger);
}
.none img {
  width: 22px;
}
.row-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.for {
  color: var(--muted);
  font-weight: normal;
}
.count {
  color: var(--muted);
  font-size: 12px;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
