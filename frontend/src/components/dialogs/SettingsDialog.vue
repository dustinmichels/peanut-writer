<script setup lang="ts">
import { ref } from "vue";
import Modal from "../Modal.vue";
import { autoFormat, setMeta } from "../../lib/actions";
import { isOn, readFrontMatter } from "../../lib/markdown";
import { state } from "../../lib/store";

const emit = defineEmits<{ close: [] }>();
const meta = readFrontMatter(state.content).meta;
const format = ref(isOn(meta.autoformat));
const titleCase = ref(isOn(meta.titlecase));

// Kept in the document's front matter. Turning formatting on formats the
// document straight away, to show what it does.
function submit() {
  const formatNow =
    format.value && (!isOn(meta.autoformat) || titleCase.value !== isOn(meta.titlecase));
  setMeta({ autoformat: format.value ? "true" : "", titlecase: titleCase.value ? "true" : "" });
  emit("close");
  if (formatNow) autoFormat();
}
</script>

<template>
  <Modal title="Document Settings" @close="emit('close')" @submit="submit">
    <div class="field">
      <label class="check"><input v-model="format" type="checkbox" /> Auto format on save</label>
      <span class="hint"
        >Saving (⌘S, Save As, Sync Files) tidies the Markdown with oxfmt: blank lines, list markers,
        table columns, trailing spaces. Autosaves don't.</span
      >
    </div>
    <div class="field">
      <label class="check" :class="{ off: !format }"
        ><input v-model="titleCase" type="checkbox" :disabled="!format" /> Title case
        headings</label
      >
      <span class="hint">“The Lord of the Rings”. NASA, iPhone and code are left alone.</span>
    </div>
    <p class="hint">Saved with this document.</p>
    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="submit" class="btn primary">Done</button>
    </template>
  </Modal>
</template>

<style scoped>
.check {
  display: flex;
  align-items: center;
  gap: 6px;
}
.check.off {
  opacity: 0.5;
}
</style>
