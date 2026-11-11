<script setup lang="ts">
import { onMounted, ref } from "vue";
import Modal from "../Modal.vue";
import { insertFootnote, writeNote } from "../../lib/editor";
import { editor } from "../../lib/store";

// label: the mark, already in the text, whose note this writes; without it,
// a new footnote goes at the cursor.
const props = defineProps<{ label?: string }>();
const emit = defineEmits<{ close: [] }>();
const text = ref("");
const input = ref<HTMLTextAreaElement>();
onMounted(() => input.value?.focus());

function submit() {
  const v = editor.value;
  if (v && text.value.trim()) {
    if (props.label) writeNote(v, props.label, text.value);
    else insertFootnote(v, text.value);
  }
  emit("close");
}

// Return adds the note; Shift-Return starts a new line in it.
function key(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit();
  }
}
</script>

<template>
  <Modal title="Footnote" @close="emit('close')" @submit="submit">
    <label class="field">
      Note
      <textarea
        ref="input"
        v-model="text"
        rows="4"
        placeholder="The footnote's text"
        @keydown="key"
      ></textarea>
      <span class="hint">It goes at the foot of the page. Shift-Return starts a new line.</span>
    </label>
    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="submit" class="btn primary" :disabled="!text.trim()">
        {{ label ? "Add Note" : "Insert" }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
textarea {
  resize: vertical;
}
</style>
