<script setup lang="ts">
import { onMounted, ref } from "vue";
import { FileText, X } from "lucide-vue-next";
import type { RecentFile } from "../../../bindings/peanut-writer/models";
import Modal from "../Modal.vue";
import { forgetRecent, newDoc, openDoc, openRecent } from "../../lib/actions";

const props = defineProps<{ files: RecentFile[] }>();
const emit = defineEmits<{ close: [] }>();
const list = ref<HTMLElement>();
const files = ref(props.files);

onMounted(() => list.value?.querySelector("button")?.focus());

function open(path: string) {
  emit("close");
  openRecent(path);
}

function forget(path: string) {
  files.value = files.value.filter((f) => f.path !== path);
  forgetRecent(path);
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
        <button type="button" class="open" :title="f.path" @click="open(f.path)">
          <FileText :size="18" />
          <span>
            <b>{{ f.name }}</b>
            <small>{{ f.folder }}</small>
          </span>
        </button>
        <button
          type="button"
          class="forget"
          :title="`Remove ${f.name} from this list`"
          :aria-label="`Remove ${f.name} from this list`"
          @click="forget(f.path)"
        >
          <X :size="16" />
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
li {
  position: relative;
}
.open {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 40px 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  text-align: left;
}
.open:hover,
.open:focus-visible {
  background: var(--hover);
  outline: none;
}
.forget {
  position: absolute;
  top: 50%;
  right: 8px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  opacity: 0;
  transform: translateY(-50%);
}
li:hover .forget,
.forget:focus-visible {
  opacity: 1;
}
.forget:hover,
.forget:focus-visible {
  background: var(--hover);
  color: var(--roast);
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
