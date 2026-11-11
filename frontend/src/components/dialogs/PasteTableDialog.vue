<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from "vue";
import Modal from "@/components/ui/Modal.vue";
import { parseDelimited } from "@/lib/markdown";
import { state } from "@/lib/store";

const emit = defineEmits<{ close: [] }>();
const text = ref("");
const box = useTemplateRef("box");
onMounted(() => box.value?.focus());

const table = computed(() => parseDelimited(text.value));

// Opens the table editor on the pasted cells, to caption and tidy them.
function submit() {
  if (!table.value) return emit("close");
  state.dialog = { kind: "table", table: table.value };
}
</script>

<template>
  <Modal title="Paste Table" wide @close="emit('close')" @submit="submit">
    <label class="field">
      Cells
      <textarea
        ref="box"
        v-model="text"
        rows="10"
        spellcheck="false"
        placeholder="Paste cells copied from Excel or Google Sheets, or CSV text"
      />
      <span class="hint">
        <template v-if="table">
          {{ table.header.length }} columns × {{ table.rows.length + 1 }} rows. The first row
          becomes the heading.
        </template>
        <template v-else>The first row becomes the heading.</template>
      </span>
    </label>
    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="submit" class="btn primary" :disabled="!table">Continue</button>
    </template>
  </Modal>
</template>

<style scoped>
textarea {
  font-family: var(--mono, ui-monospace, monospace);
  font-size: 12px;
  white-space: pre;
  resize: vertical;
}
</style>
