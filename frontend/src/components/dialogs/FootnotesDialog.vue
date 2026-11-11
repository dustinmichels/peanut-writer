<script setup lang="ts">
import { computed } from "vue";
import { Footprints } from "lucide-vue-next";
import Modal from "@/components/ui/Modal.vue";
import Excerpt from "@/components/ui/Excerpt.vue";
import { newFootnote } from "@/lib/actions";
import { goTo } from "@/lib/editor";
import { scanFootnotes, sentenceAround } from "@/lib/markdown";
import { editor, state } from "@/lib/store";

const emit = defineEmits<{ close: [] }>();

// Each footnote as printed, in order: its mark in its sentence, and its note
// (null when the mark has none).
const rows = computed(() => {
  const text = state.content;
  const { marks, notes } = scanFootnotes(text);
  return marks
    .filter((m) => !m.inNote)
    .map((m) => ({
      mark: m,
      ...sentenceAround(text, m.from, m.to),
      note: notes.find((n) => n.label === m.label) ?? null,
    }));
});

// jump goes to pos in the text, closing the list.
function jump(pos: number) {
  emit("close");
  if (editor.value) goTo(editor.value, pos);
}
</script>

<template>
  <Modal title="Footnotes" wide @close="emit('close')" @submit="emit('close')">
    <div v-if="rows.length" class="notes">
      <div class="head">In the text</div>
      <div class="head">Footnote</div>
      <template v-for="r in rows" :key="r.mark.from">
        <button
          type="button"
          class="cell"
          title="Go to the footnote's mark"
          @click="jump(r.mark.to)"
        >
          <Excerpt :before="r.before" :after="r.after"
            ><sup>{{ r.mark.number || "?" }}</sup></Excerpt
          >
        </button>
        <button
          v-if="r.note"
          type="button"
          class="cell note"
          title="Go to the footnote"
          @click="jump(r.note.textFrom)"
        >
          <span class="num">{{ r.mark.number }}</span>
          <Excerpt :before="r.note.text" after="" />
        </button>
        <button
          v-else
          type="button"
          class="cell note missing"
          title="This mark has no footnote: write one"
          @click="state.dialog = { kind: 'footnote', label: r.mark.label }"
        >
          No footnote yet. Write one…
        </button>
      </template>
    </div>
    <p v-else class="none">No footnotes yet. Add one at the cursor with References → Footnote.</p>
    <template #footer>
      <button type="button" class="btn" title="Add a footnote at the cursor" @click="newFootnote">
        <Footprints :size="14" /> New footnote…
      </button>
      <button type="button" class="btn primary" style="margin-left: auto" @click="emit('close')">
        Done
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.notes {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 6px 10px;
}
.head {
  font-size: 12px;
  font-weight: 650;
  color: var(--muted);
}
.cell {
  display: block;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
  text-align: left;
}
.cell:hover {
  border-color: var(--shell);
}
.note {
  display: flex;
  gap: 8px;
  background: var(--panel);
}
.note :deep(.excerpt) {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  overflow: hidden;
}
.num {
  flex: none;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-ink);
}
.missing {
  color: var(--muted);
  font-style: italic;
}
.none {
  margin: 8px 0;
  color: var(--muted);
}
</style>
