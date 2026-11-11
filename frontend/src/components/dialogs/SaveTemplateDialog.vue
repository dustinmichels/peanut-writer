<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from "vue";
import Modal from "@/components/ui/Modal.vue";
import { saveCustomTemplate } from "@/lib/actions";
import { state } from "@/lib/store";

// Adds the document's own template (Design → Customize) to the user's
// templates under a name, for any document to use.

const emit = defineEmits<{ close: [] }>();
const name = ref("");
const description = ref("");
const saving = ref(false);
const nameInput = useTemplateRef("nameInput");
onMounted(() => nameInput.value?.focus());

const base = computed(() => state.templates.find((t) => t.id === state.custom?.base)?.name);

async function submit() {
  if (!name.value.trim() || saving.value) return;
  saving.value = true;
  const saved = await saveCustomTemplate(name.value, description.value);
  saving.value = false;
  if (saved) emit("close");
}
</script>

<template>
  <Modal title="Save as Template" @close="emit('close')" @submit="submit">
    <p class="hint">
      Adds this document's fonts and colors to your templates, for any document to use.
    </p>
    <label class="field">
      Name
      <input ref="nameInput" v-model="name" :placeholder="`My ${base ?? 'template'}`" />
    </label>
    <label class="field">
      Description
      <input v-model="description" placeholder="Optional" />
    </label>
    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="submit" class="btn primary" :disabled="!name.trim() || saving">Save</button>
    </template>
  </Modal>
</template>

<style scoped>
.hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--muted);
}
</style>
