<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Image, Table } from "lucide-vue-next";
import Modal from "../Modal.vue";
import { insertCrossRef } from "../../lib/actions";
import { type Item, plain } from "../../lib/markdown";
import { state } from "../../lib/store";

const emit = defineEmits<{ close: [] }>();
const kind = ref<"all" | "figure" | "table">("all");
const list = computed(() => state.items.filter((x) => kind.value === "all" || x.kind === kind.value));
const picked = ref(0);

function insert(item: Item | undefined) {
  if (!item) return;
  insertCrossRef(item);
  emit("close");
}

function key(e: KeyboardEvent) {
  if (e.key === "ArrowDown") picked.value = Math.min(picked.value + 1, list.value.length - 1);
  else if (e.key === "ArrowUp") picked.value = Math.max(picked.value - 1, 0);
  else if (e.key === "Enter") insert(list.value[picked.value]);
  else return;
  e.preventDefault();
}
onMounted(() => window.addEventListener("keydown", key));
onUnmounted(() => window.removeEventListener("keydown", key));
</script>

<template>
  <Modal title="Cross-reference" @close="emit('close')" @submit="insert(list[picked])">
    <div class="seg">
      <button v-for="k in ['all', 'figure', 'table'] as const" :key="k" type="button" :class="{ on: kind === k }" @click="(kind = k), (picked = 0)">
        {{ k === "all" ? "Everything" : k === "figure" ? "Figures" : "Tables" }}
      </button>
    </div>
    <div v-if="list.length" class="list">
      <button
        v-for="(it, i) in list"
        :key="it.from"
        type="button"
        class="row"
        :class="{ on: i === picked }"
        @mouseenter="picked = i"
        @click="insert(it)"
      >
        <component :is="it.kind === 'figure' ? Image : Table" :size="16" />
        <b>{{ it.kind === "figure" ? "Figure" : "Table" }} {{ it.number }}</b>
        <span class="cap">{{ plain(it.caption) || "No caption" }}</span>
        <code v-if="it.label">@{{ it.label }}</code>
      </button>
    </div>
    <div v-else class="none">
      <img src="/peanut.svg" alt="" />
      Nothing to refer to yet. Add a picture or a table first.
    </div>
    <p class="hint">The reference reads like “Figure 2” and keeps up when things move. You can also type <code>@</code> in the text.</p>
    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="submit" class="btn primary" :disabled="!list.length">Insert</button>
    </template>
  </Modal>
</template>

<style scoped>
.seg {
  display: inline-flex;
  align-self: flex-start;
  padding: 3px;
  border-radius: 999px;
  background: var(--panel);
  border: 1px solid var(--border);
}
.seg button {
  border: 0;
  border-radius: 999px;
  padding: 4px 14px;
  background: transparent;
  color: var(--quote);
}
.seg button.on {
  background: white;
  color: var(--roast);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(90, 50, 20, 0.15);
}
.list {
  display: flex;
  flex-direction: column;
  max-height: 300px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
}
.row svg {
  color: var(--accent-ink);
  flex: none;
}
.row.on {
  background: var(--cream);
}
.row b {
  color: var(--roast);
  white-space: nowrap;
}
.cap {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
code {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
}
.none {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px;
  border-radius: 12px;
  background: var(--panel);
  color: var(--quote);
}
.none img {
  width: 22px;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
