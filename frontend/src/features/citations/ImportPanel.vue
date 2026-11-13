<script setup lang="ts">
// ImportPanel adds references in bulk: BibTeX or RIS pasted or read from a
// file (another document's Name.bib, a reference manager's export). It lists
// what it found first, with those the document has already unticked.
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from "vue";
import { FileUp } from "lucide-vue-next";
import { Service } from "@bindings/peanut-writer/internal/citations";
import type { Candidate } from "@bindings/peanut-writer/internal/refs/models";
import { referencesChanged } from "./store";
import { plain, whoWhen } from "./text";
import { errorText } from "@/lib/store";

const emit = defineEmits<{ imported: [count: number] }>();

const text = ref("");
const found = ref<Candidate[] | null>(null); // null until text is read
const pick = ref<boolean[]>([]);
const error = ref("");
const busy = ref(false);
const area = useTemplateRef("area");
const file = useTemplateRef("file");

const count = computed(() => pick.value.filter(Boolean).length);

// The list is of the text as it was read; editing the text reads it again.
let timer: ReturnType<typeof setTimeout> | undefined;
watch(text, () => {
  clearTimeout(timer);
  found.value = null;
  error.value = "";
  if (text.value.trim()) timer = setTimeout(preview, 400);
});

async function preview() {
  const t = text.value;
  try {
    const cs = (await Service.PreviewImport(t)) ?? [];
    if (t !== text.value) return;
    found.value = cs;
    pick.value = cs.map((c) => !c.duplicate);
    error.value = "";
  } catch (e) {
    if (t === text.value) error.value = errorText(e);
  }
}

async function choose(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) text.value = await f.text();
}

async function submit() {
  if (!found.value) {
    clearTimeout(timer);
    await preview();
    return;
  }
  if (!count.value) return;
  busy.value = true;
  try {
    const at = pick.value.flatMap((p, i) => (p ? [i] : []));
    await Service.Import(text.value, at);
    await referencesChanged();
    emit("imported", at.length);
  } catch (e) {
    error.value = errorText(e);
  } finally {
    busy.value = false;
  }
}

defineExpose({ submit, busy, count });
onMounted(() => nextTick(() => area.value?.focus()));
</script>

<template>
  <div class="paste">
    <label class="field">
      BibTeX or RIS
      <textarea
        ref="area"
        v-model="text"
        rows="6"
        placeholder="@article{smith2020, …}   or   TY  - JOUR …"
        spellcheck="false"
      />
    </label>
    <button type="button" class="btn" @click="file?.click()">
      <FileUp :size="16" /> Choose file…
    </button>
    <input ref="file" type="file" accept=".bib,.ris,.txt" hidden @change="choose" />
  </div>
  <div v-if="error" class="none error">
    <img src="/peanut.svg" alt="" />
    {{ error }}
  </div>
  <div v-else-if="found" class="list">
    <label v-for="(c, i) in found" :key="i" class="row">
      <input v-model="pick[i]" type="checkbox" />
      <span class="src">
        <span class="who">{{ whoWhen(c) }}</span>
        <span class="title">{{ plain(c.title) || "Untitled" }}</span>
        <span v-if="c.duplicate" class="dup">Already in the references as @{{ c.duplicate }}</span>
      </span>
      <code>@{{ c.key }}</code>
    </label>
  </div>
  <p class="hint">
    Export from Zotero, Mendeley, EndNote or Google Scholar as BibTeX or RIS, or pick another
    document's <code>.bib</code>. A key already taken gets a new one.
  </p>
</template>

<style scoped>
.paste {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.paste .field {
  flex: 1;
}
.paste .btn {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
textarea {
  resize: vertical;
  font-family: var(--mono);
  font-size: 12px;
}
.list {
  display: flex;
  flex-direction: column;
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 8px;
}
.row:hover {
  background: var(--cream);
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
.dup {
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
}
.none.error {
  color: var(--danger);
}
.none img {
  width: 22px;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
