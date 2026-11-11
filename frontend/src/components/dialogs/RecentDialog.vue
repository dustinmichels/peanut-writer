<script setup lang="ts">
import { ref } from "vue";
import type { RecentFile } from "../../../bindings/peanut-writer/models";
import Modal from "../Modal.vue";
import RecentList from "../RecentList.vue";
import { newDoc, openDoc, openRecent } from "../../lib/actions";

const props = defineProps<{ files: RecentFile[] }>();
const emit = defineEmits<{ close: [] }>();
const files = ref(props.files);

function open(path: string) {
  emit("close");
  openRecent(path);
}

function browse() {
  emit("close");
  openDoc();
}

function blank() {
  emit("close");
  newDoc();
}
</script>

<template>
  <Modal title="Open Recent" @close="emit('close')" @submit="blank">
    <RecentList v-if="files.length" v-model="files" @open="open" />
    <p v-else class="empty">No recent documents yet. Documents you open or save show up here.</p>
    <template #footer>
      <button type="button" class="btn" @click="browse">Open Other…</button>
      <button type="submit" class="btn primary">New Document</button>
    </template>
  </Modal>
</template>

<style scoped>
.empty {
  margin: 0;
  color: var(--quote);
}
</style>
