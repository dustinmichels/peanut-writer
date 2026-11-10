<script setup lang="ts">
import { onMounted, ref } from "vue";
import Modal from "../Modal.vue";
import { insertText } from "../../lib/editor";
import { editor } from "../../lib/store";

const props = defineProps<{ text: string }>();
const emit = defineEmits<{ close: [] }>();
const text = ref(props.text);
const url = ref(/^https?:\/\//.test(props.text) ? props.text : "");
const urlInput = ref<HTMLInputElement>();
onMounted(() => urlInput.value?.focus());

function submit() {
  const v = editor.value;
  if (!v || !url.value.trim()) return emit("close");
  let target = url.value.trim();
  if (!/^[a-z]+:/i.test(target))
    target = target.includes("@") ? `mailto:${target}` : `https://${target}`;
  const label = text.value.trim() || target;
  insertText(v, `[${label.replace(/([\][])/g, "\\$1")}](<${target}>)`);
  emit("close");
}
</script>

<template>
  <Modal title="Link" @close="emit('close')" @submit="submit">
    <label class="field">
      Address
      <input ref="urlInput" v-model="url" placeholder="https://example.com" />
    </label>
    <label class="field">
      Text to show
      <input v-model="text" placeholder="Leave empty to show the address" />
    </label>
    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="submit" class="btn primary">Insert</button>
    </template>
  </Modal>
</template>
