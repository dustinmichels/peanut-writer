<script setup lang="ts">
// ReferenceSettingsDialog sets how the document's citations and reference
// list are written (front matter's `citation-style`) and where the list goes:
// at the end, or where a `[References]` paragraph is.
import { onMounted, ref } from "vue";
import { Service } from "@bindings/peanut-writer/internal/citations";
import Modal from "@/components/ui/Modal.vue";
import { setMeta } from "@/lib/actions";
import { insertBlock } from "@/lib/editor";
import { readFrontMatter } from "@/lib/markdown";
import { editor, state } from "@/lib/store";
import { referenceLists, styleInfo } from "./styles";

const emit = defineEmits<{ close: [] }>();

const styles = ref<string[]>([]);
const initial = readFrontMatter(state.content).meta["citation-style"].trim().toLowerCase();
const style = ref(initial);

// Where the list is now: the line of the first `[References]` paragraph.
const lists = referenceLists(state.content);
const listLine = lists.length ? state.content.slice(0, lists[0].from).split("\n").length : 0;
const place = ref<"kept" | "end" | "cursor">(lists.length ? "kept" : "end");

onMounted(async () => {
  styles.value = (await Service.CitationStyles()) ?? [];
  if (!styles.value.includes(style.value)) style.value = styles.value[0] ?? "";
});

function submit() {
  const v = editor.value;
  if (!v) return emit("close");
  const id = style.value === styles.value[0] ? "" : style.value;
  if (id !== initial) setMeta({ "citation-style": id });
  if (place.value !== "kept") {
    // Out with the lists there are (and the blank line after each), found
    // anew past the properties just written; then, for the cursor, one where
    // it is, which moved with the text deleted.
    const now = referenceLists(v.state.doc.toString());
    if (now.length) {
      v.dispatch({
        changes: now.map(({ from, to }) => {
          const next = v.state.sliceDoc(to, to + 2);
          return { from, to: Math.min(v.state.doc.length, to + (next === "\n\n" ? 2 : 1)) };
        }),
        userEvent: "delete",
      });
    }
    if (place.value === "cursor") insertBlock(v, "[References]");
  }
  emit("close");
}
</script>

<template>
  <Modal title="References" @close="emit('close')" @submit="submit">
    <fieldset>
      <legend>Citation style</legend>
      <label v-for="s in styles" :key="s" class="option">
        <input v-model="style" type="radio" name="style" :value="s" />
        <span class="name">{{ styleInfo(s).name }}</span>
        <span class="sample">{{ styleInfo(s).sample }}</span>
      </label>
      <span class="hint">
        How citations read in the text, and how the reference list is written. Styles that cite in
        footnotes (Chicago notes and bibliography) aren't available.
      </span>
    </fieldset>
    <fieldset>
      <legend>Reference list</legend>
      <label v-if="lists.length" class="option">
        <input v-model="place" type="radio" name="place" value="kept" />
        <span class="name">Where it is now</span>
        <span class="sample">line {{ listLine }}</span>
      </label>
      <label class="option">
        <input v-model="place" type="radio" name="place" value="end" />
        <span class="name">At the end, under a References heading</span>
      </label>
      <label class="option">
        <input v-model="place" type="radio" name="place" value="cursor" />
        <span class="name">At the cursor</span>
      </label>
      <span class="hint">
        A paragraph that's only <code>[References]</code> holds the list; without one it goes at the
        end.
      </span>
    </fieldset>
    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="submit" class="btn primary">Apply</button>
    </template>
  </Modal>
</template>

<style scoped>
fieldset {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  border: 0;
}
legend {
  margin-bottom: 6px;
  font-weight: 500;
  color: var(--quote);
}
.option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.option:hover {
  background: var(--hover);
}
.name {
  flex: 1;
}
.sample {
  font-family: Georgia, "Times New Roman", serif;
  color: var(--muted);
}
.hint {
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--muted);
}
</style>
