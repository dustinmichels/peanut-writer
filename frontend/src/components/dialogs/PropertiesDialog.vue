<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import Modal from "../Modal.vue";
import { setMeta } from "../../lib/actions";
import { readFrontMatter } from "../../lib/markdown";
import { state } from "../../lib/store";

const emit = defineEmits<{ close: [] }>();
const meta = reactive(readFrontMatter(state.content).meta);
if (!meta.template) meta.template = "classic";
const first = ref<HTMLInputElement>();
onMounted(() => first.value?.focus());

function submit() {
  setMeta({ ...meta, template: meta.template === "classic" ? "" : meta.template });
  emit("close");
}
</script>

<template>
  <Modal title="Document Properties" @close="emit('close')" @submit="submit">
    <label class="field">
      Title
      <input ref="first" v-model="meta.title" placeholder="Shown at the top of the first page" />
    </label>
    <label class="field">
      Subtitle
      <input v-model="meta.subtitle" />
    </label>
    <div class="cols">
      <label class="field">
        Author
        <input v-model="meta.author" />
      </label>
      <label class="field">
        Date
        <div class="date">
          <input v-model="meta.date" placeholder="e.g. March 3, 2026" />
          <button
            type="button"
            class="btn"
            title="Always today's date"
            @click="meta.date = 'today'"
          >
            Today
          </button>
        </div>
      </label>
    </div>
    <label class="field">
      Abstract
      <textarea v-model="meta.abstract" rows="4" placeholder="A short summary (optional)" />
      <span class="hint">One paragraph.</span>
    </label>
    <label class="field">
      Template
      <select v-model="meta.template">
        <option v-for="t in state.templates" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
    </label>
    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="submit" class="btn primary">Done</button>
    </template>
  </Modal>
</template>

<style scoped>
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.date {
  display: flex;
  gap: 6px;
}
.date input {
  flex: 1;
  min-width: 0;
}
textarea {
  resize: vertical;
}
</style>
