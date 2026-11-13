<script setup lang="ts">
// ReferenceForm adds a source to the document's references (Name.bib) or
// edits one. The citation dialog shows it, and saves it on ⌘↩ through save.
// A new one can be filled in from its DOI or ISBN.
import { computed, nextTick, onMounted, ref, useTemplateRef } from "vue";
import { Search } from "lucide-vue-next";
import { Service } from "@bindings/peanut-writer/internal/citations";
import type { Reference } from "@bindings/peanut-writer/internal/refs/models";
import { errorText } from "@/lib/store";

// old is the key of the reference edited; "" for a new one.
const props = defineProps<{ reference: Reference; old: string }>();
const emit = defineEmits<{ saved: [r: Reference]; deleted: [key: string] }>();

const r = ref<Reference>({ ...props.reference });
const authors = ref((props.reference.authors ?? []).join("\n"));
const error = ref("");
const busy = ref(false);
const sure = ref(false); // Delete was clicked once
const first = useTemplateRef("first");
const lookupEl = useTemplateRef("lookupEl");

// A DOI or ISBN to fill the form from, and whether it's being looked up.
const id = ref("");
const looking = ref(false);

async function lookup() {
  if (!id.value.trim() || looking.value) return;
  looking.value = true;
  error.value = "";
  try {
    const found = await Service.Lookup(id.value);
    // The key typed stays; an empty one is made on saving.
    r.value = { ...found, key: r.value.key };
    authors.value = (found.authors ?? []).join("\n");
  } catch (e) {
    error.value = errorText(e);
  } finally {
    looking.value = false;
  }
}

const types = [
  ["article", "Journal article"],
  ["book", "Book"],
  ["incollection", "Book chapter"],
  ["inproceedings", "Conference paper"],
  ["report", "Report"],
  ["thesis", "Thesis"],
  ["online", "Web page"],
  ["misc", "Other"],
];
const typeOptions = computed(() =>
  types.some(([t]) => t === r.value.type) ? types : [...types, [r.value.type, r.value.type]],
);
// What the type has: a field it lacks shows only when it holds something.
const shows: Record<string, string[]> = {
  container: ["article", "incollection", "inproceedings"],
  publisher: ["book", "incollection", "inproceedings", "report", "thesis", "misc"],
  volume: ["article", "book", "inproceedings"],
  issue: ["article", "report"],
  pages: ["article", "incollection", "inproceedings"],
};
const has = (f: keyof Reference) => shows[f].includes(r.value.type) || !!r.value[f];
const containerLabel = computed(
  () =>
    ({ article: "Journal", incollection: "Book title", inproceedings: "Proceedings" })[
      r.value.type
    ] ?? "In",
);
const publisherLabel = computed(() =>
  r.value.type === "report" || r.value.type === "thesis" ? "Institution" : "Publisher",
);

async function save() {
  busy.value = true;
  try {
    const saved = await Service.SaveReference(props.old, {
      ...r.value,
      authors: authors.value.split("\n"),
    });
    emit("saved", saved);
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!sure.value) {
    sure.value = true;
    return;
  }
  try {
    await Service.DeleteReference(props.old);
    emit("deleted", props.old);
  } catch (e) {
    error.value = errorText(e);
  }
}

defineExpose({ save, busy });
onMounted(() => nextTick(() => (props.old ? first.value : lookupEl.value)?.focus()));
</script>

<template>
  <div v-if="!old" class="lookup">
    <label class="field">
      Fill in from a DOI or ISBN
      <input
        ref="lookupEl"
        v-model="id"
        placeholder="10.1038/s41588-019-0405-z or 978-0-14-044913-6"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter.prevent="lookup"
      />
    </label>
    <button type="button" class="btn" :disabled="!id.trim() || looking" @click="lookup">
      <Search :size="16" /> {{ looking ? "Looking up…" : "Look up" }}
    </button>
  </div>
  <div class="grid">
    <label class="field">
      Type
      <select v-model="r.type">
        <option v-for="[t, label] in typeOptions" :key="t" :value="t">{{ label }}</option>
      </select>
    </label>
    <label class="field">
      Key
      <input
        v-model="r.key"
        :disabled="!!old"
        :placeholder="old ? '' : 'Made from the author, year and title'"
        :title="old ? 'Citations use the key, so it stays as it is' : ''"
        autocomplete="off"
        spellcheck="false"
      />
    </label>
  </div>
  <label class="field">
    Authors <span class="sub">one per line, “Last, First”</span>
    <textarea
      ref="first"
      v-model="authors"
      rows="3"
      placeholder="Smith, Jane&#10;Doe, John"
      spellcheck="false"
    />
  </label>
  <label class="field">
    Title
    <input v-model="r.title" />
  </label>
  <div class="grid">
    <label class="field">
      Year
      <input v-model="r.year" placeholder="2020" />
    </label>
    <label v-if="has('container')" class="field">
      {{ containerLabel }}
      <input v-model="r.container" />
    </label>
    <label v-if="has('publisher')" class="field">
      {{ publisherLabel }}
      <input v-model="r.publisher" />
    </label>
    <label v-if="has('volume')" class="field">
      Volume
      <input v-model="r.volume" />
    </label>
    <label v-if="has('issue')" class="field">
      {{ r.type === "report" ? "Number" : "Issue" }}
      <input v-model="r.issue" />
    </label>
    <label v-if="has('pages')" class="field">
      Pages
      <input v-model="r.pages" placeholder="12-34" />
    </label>
    <label class="field">
      DOI
      <input v-model="r.doi" placeholder="10.1000/xyz123" spellcheck="false" />
    </label>
    <label class="field">
      URL
      <input v-model="r.url" placeholder="https://" spellcheck="false" />
    </label>
  </div>
  <div v-if="error" class="error">{{ error }}</div>
  <div class="foot">
    <p class="hint">
      Kept in the document's references file (<code>Name.bib</code>), with any other fields it has.
    </p>
    <button v-if="old" type="button" class="btn danger" @click="remove">
      {{ sure ? "Delete it: citations of it go missing" : "Delete reference" }}
    </button>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.lookup {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.lookup .field {
  flex: 1;
}
.lookup .btn {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.sub {
  color: var(--muted);
  font-weight: normal;
}
textarea {
  resize: vertical;
  font: inherit;
}
.error {
  color: var(--danger);
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
code {
  font-family: var(--mono);
}
.btn.danger {
  color: var(--danger);
}
</style>
