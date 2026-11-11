<script setup lang="ts">
// A hidden side pane's thin strip: its name and the button to show it again.
import { PanelLeftOpen, PanelRightOpen } from "lucide-vue-next";

defineProps<{ label: string; side: "left" | "right" }>();
defineEmits<{ open: [] }>();
</script>

<template>
  <button :class="['rail', side]" :title="`Show ${label.toLowerCase()}`" @click="$emit('open')">
    <PanelLeftOpen v-if="side === 'left'" :size="14" />
    <PanelRightOpen v-else :size="14" />
    <span>{{ label }}</span>
  </button>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 0;
  border: 0;
  background: var(--panel);
  color: var(--quote);
  font-family: var(--rounded);
  font-weight: 650;
  cursor: pointer;
}
.rail.left {
  border-right: 1px solid var(--border);
}
.rail.right {
  border-left: 1px solid var(--border);
}
.rail:hover {
  background: var(--hover);
  color: var(--roast);
}
.rail span {
  writing-mode: vertical-rl;
}
</style>
