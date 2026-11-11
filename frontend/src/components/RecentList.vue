<script setup lang="ts">
import { onMounted, ref } from "vue";
import { FileText, X } from "lucide-vue-next";
import type { RecentFile } from "../../bindings/peanut-writer/models";
import { forgetRecent } from "../lib/actions";

// The recent documents, the first one focused; × takes one off the list.
const files = defineModel<RecentFile[]>({ required: true });
const emit = defineEmits<{ open: [path: string] }>();
const list = ref<HTMLElement>();

onMounted(() => list.value?.querySelector("button")?.focus());

function forget(path: string) {
  files.value = files.value.filter((f) => f.path !== path);
  forgetRecent(path);
}

// move focuses the next or previous document with ↓ / ↑, wrapping around.
function move(e: KeyboardEvent) {
  const by = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
  if (!by || !list.value) return;
  e.preventDefault();
  const items = [...list.value.querySelectorAll<HTMLButtonElement>(".open")];
  const at = items.findIndex((b) => b.parentElement?.contains(document.activeElement));
  const next = at < 0 ? (by > 0 ? 0 : items.length - 1) : (at + by + items.length) % items.length;
  items[next]?.focus();
}
</script>

<template>
  <ul ref="list" @keydown="move">
    <li v-for="f in files" :key="f.path">
      <button type="button" class="open" :title="f.path" @click="emit('open', f.path)">
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
</style>
