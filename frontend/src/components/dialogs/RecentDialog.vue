<script setup lang="ts">
import { onMounted, ref } from "vue";
import { FileText } from "lucide-vue-next";
import type { RecentFile } from "../../../bindings/peanut-writer/models";
import Modal from "../Modal.vue";
import { newDoc, openDoc, openRecent } from "../../lib/actions";

defineProps<{ files: RecentFile[] }>();
const emit = defineEmits<{ close: [] }>();
const list = ref<HTMLElement>();

onMounted(() => list.value?.querySelector("button")?.focus());

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
    <ul v-if="files.length" ref="list">
      <li v-for="f in files" :key="f.path">
        <button type="button" :title="f.path" @click="open(f.path)">
          <FileText :size="18" />
          <span>
            <b>{{ f.name }}</b>
            <small>{{ f.folder }}</small>
          </span>
        </button>
      </li>
    </ul>
    <p v-else class="empty">No recent documents yet. Documents you open or save show up here.</p>
    <template #footer>
      <button type="button" class="btn" @click="browse">Open Other…</button>
      <button type="submit" class="btn primary">New Document</button>
    </template>
  </Modal>
</template>

<style scoped>
ul {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
li button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  text-align: left;
}
li button:hover,
li button:focus-visible {
  background: var(--hover);
  outline: none;
}
li span {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
b {
  color: var(--roast);
  font-weight: 600;
}
small,
b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
small {
  color: var(--muted);
  font-size: 12px;
}
.empty {
  margin: 0;
  color: var(--quote);
}
</style>
