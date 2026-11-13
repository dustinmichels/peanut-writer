<script setup lang="ts">
// CitationDialog searches the Zotero library (through Better BibTeX) and
// cites the sources picked at the cursor, in the document's citation style.
// Until Zotero is open with Better BibTeX, it shows how to set them up.
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { BookOpen, Check } from "lucide-vue-next";
import { DocService } from "@bindings/peanut-writer";
import type { Source, Status } from "@bindings/peanut-writer/internal/zotero/models";
import Modal from "@/components/ui/Modal.vue";
import ZoteroSetup from "./ZoteroSetup.vue";
import { insertCitation, setMeta } from "@/lib/actions";
import { readFrontMatter } from "@/lib/markdown";
import { errorText, state } from "@/lib/store";

const emit = defineEmits<{ close: [] }>();
const query = ref("");
const results = ref<Source[]>([]);
const picked = ref<Source[]>([]);
const cursor = ref(0);
const locator = ref("");
const error = ref("");
const searching = ref(false);
const busy = ref(false);
const styles = ref<string[]>([]);
const style = ref(readFrontMatter(state.content).meta["citation-style"].trim().toLowerCase());
const search = useTemplateRef("search");
const listEl = useTemplateRef("listEl");

// Whether Zotero is open with Better BibTeX: null until first asked.
const status = ref<Status | null>(null);
const checking = ref(false);
const ready = computed(() => !!status.value?.betterBibTeX);
async function check() {
  checking.value = true;
  try {
    status.value = await DocService.ZoteroStatus();
  } catch (e) {
    status.value = { zotero: false, betterBibTeX: false, version: "", error: errorText(e) };
  } finally {
    checking.value = false;
  }
  if (ready.value) {
    error.value = "";
    await nextTick();
    search.value?.focus();
  }
}

const isPicked = (s: Source) => picked.value.some((p) => p.key === s.key);
const toggle = (s: Source) => {
  picked.value = isPicked(s) ? picked.value.filter((p) => p.key !== s.key) : [...picked.value, s];
};
// The locator ("p. 4") goes after the last source picked.
const locatorFor = computed(() => picked.value.at(-1)?.key ?? "");

// Searches run once typing pauses; only the latest one's answer is shown.
let timer: ReturnType<typeof setTimeout> | undefined;
let asked = 0;
watch(query, (q) => {
  clearTimeout(timer);
  if (!q.trim()) {
    results.value = [];
    return;
  }
  timer = setTimeout(async () => {
    const n = ++asked;
    searching.value = true;
    try {
      const found = (await DocService.SearchSources(q.trim())) ?? [];
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
});

async function submit() {
  if (!picked.value.length) {
    const s = results.value[cursor.value];
    if (!s) return;
    picked.value = [s];
  }
  busy.value = true;
  try {
    await insertCitation(picked.value, locator.value);
    emit("close");
  } catch (e) {
    error.value = errorText(e);
    check();
  } finally {
    busy.value = false;
  }
}

function setStyle(s: string) {
  style.value = s;
  setMeta({ "citation-style": s === styles.value[0] ? "" : s });
}

function key(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || state.cheatSheet || !ready.value) return;
  if (e.key === "ArrowDown") cursor.value = Math.min(cursor.value + 1, results.value.length - 1);
  else if (e.key === "ArrowUp") cursor.value = Math.max(cursor.value - 1, 0);
  else if (e.key === "Enter" && e.target === search.value && results.value[cursor.value]) {
    // Enter picks the highlighted source; ⌘↩ inserts.
    toggle(results.value[cursor.value]);
  } else return;
  e.preventDefault();
  nextTick(() => listEl.value?.children[cursor.value]?.scrollIntoView({ block: "nearest" }));
}

onMounted(async () => {
  window.addEventListener("keydown", key);
  check();
  styles.value = (await DocService.CitationStyles()) ?? [];
  if (!styles.value.includes(style.value)) style.value = styles.value[0] ?? "";
});
onUnmounted(() => {
  window.removeEventListener("keydown", key);
  clearTimeout(timer);
});
</script>

<template>
  <Modal
    :title="status && !ready ? 'Set up Zotero citations' : 'Citation'"
    wide
    @close="emit('close')"
    @submit="ready ? submit() : check()"
  >
    <div v-if="!status" class="none"><img src="/peanut.svg" alt="" /> Looking for Zotero…</div>
    <ZoteroSetup v-else-if="!ready" :status="status" :checking="checking" @check="check" />
    <template v-else>
      <label class="field">
        Search Zotero
        <input
          ref="search"
          v-model="query"
          placeholder="An author, a title or a year"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
      <div v-if="error" class="none error">
        <img src="/peanut.svg" alt="" />
        {{ error }}
      </div>
      <div v-else-if="results.length" ref="listEl" class="list">
        <button
          v-for="(s, i) in results"
          :key="s.library + ':' + s.key"
          type="button"
          class="row"
          :class="{ on: i === cursor, picked: isPicked(s) }"
          @mousemove="cursor = i"
          @click="toggle(s)"
        >
          <Check v-if="isPicked(s)" :size="16" class="tick" />
          <BookOpen v-else :size="16" />
          <span class="src">
            <span class="who"
              >{{ s.authors || "No author"
              }}<template v-if="s.year"> · {{ s.year }}</template></span
            >
            <span class="title">{{ s.title || "Untitled" }}</span>
            <span v-if="s.container" class="in">{{ s.container }}</span>
          </span>
          <code>@{{ s.key }}</code>
        </button>
      </div>
      <div v-else class="none">
        <img src="/peanut.svg" alt="" />
        {{
          searching
            ? "Searching…"
            : query.trim()
              ? "Nothing in your Zotero library matches."
              : "Type to search your Zotero library."
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
      </p>
    </template>
    <template #footer>
      <span v-if="picked.length" class="count">{{ picked.length }} picked</span>
      <span style="flex: 1" />
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button
        v-if="ready"
        type="submit"
        class="btn primary"
        :disabled="busy || (!picked.length && !results[cursor])"
      >
        Insert
      </button>
    </template>
  </Modal>
</template>

<style scoped>
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
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
}
.row svg {
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
