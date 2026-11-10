<script setup lang="ts">
import { computed } from "vue";
import { PanelLeftClose } from "lucide-vue-next";
import { toggleOutline } from "../lib/actions";
import { state } from "../lib/store";

defineEmits<{ jump: [line: number] }>();

// Indent relative to the document's top heading level.
const top = computed(() => Math.min(...state.outline.map((h) => h.level)));
</script>

<template>
  <nav class="outline" aria-label="Outline">
    <header>
      <span>Outline</span>
      <button title="Hide outline" @click="toggleOutline"><PanelLeftClose :size="14" /></button>
    </header>
    <ul v-if="state.outline.length">
      <li v-for="(h, i) in state.outline" :key="i">
        <button
          :class="{ top: h.level === top }"
          :style="{ paddingLeft: `${10 + (h.level - top) * 12}px` }"
          :title="h.text"
          @click="$emit('jump', h.line)"
        >
          {{ h.text }}
        </button>
      </li>
    </ul>
    <p v-else class="empty">Headings show up here. Start a line with <code>#</code> to add one.</p>
  </nav>
</template>

<style scoped>
.outline {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--panel);
  border-right: 1px solid var(--border);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  padding: 0 6px 0 12px;
  font-family: var(--rounded);
  font-weight: 650;
  color: var(--roast);
  border-bottom: 1px solid var(--border);
}
header button {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--quote);
}
header button:hover {
  background: var(--hover);
}
ul {
  flex: 1;
  margin: 0;
  padding: 6px 0;
  overflow: auto;
  list-style: none;
}
li button {
  display: block;
  width: 100%;
  padding: 4px 10px;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
li button.top {
  font-weight: 600;
}
li button:hover {
  background: var(--hover);
}
.empty {
  margin: 12px;
  color: var(--muted);
  line-height: 1.5;
}
.empty code {
  font-family: var(--mono);
}
</style>
