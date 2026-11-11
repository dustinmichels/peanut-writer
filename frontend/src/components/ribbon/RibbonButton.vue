<script setup lang="ts">
import type { Component } from "vue";

defineProps<{
  icon: Component;
  label?: string;
  big?: boolean;
  active?: boolean;
  attention?: boolean; // stands out: there's something for it to do
  title?: string;
}>();
</script>

<template>
  <button class="rb" :class="{ big, active, attention }" :title="title ?? label" @mousedown.prevent>
    <component :is="icon" :size="big ? 24 : 16" :stroke-width="big ? 1.6 : 1.9" />
    <span v-if="label">{{ label }}</span>
  </button>
</template>

<style scoped>
.rb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--ink);
  white-space: nowrap;
}
.rb svg {
  color: var(--accent-ink);
  flex: none;
}
.rb:hover {
  background: var(--hover);
}
.rb.active {
  background: var(--active);
  border-color: rgba(193, 105, 79, 0.25);
}
.rb.attention {
  background: var(--active);
  border-color: rgba(193, 105, 79, 0.35);
}
.rb.attention svg {
  color: var(--accent);
}
.rb:disabled {
  opacity: 0.4;
  background: transparent;
  border-color: transparent;
}
.rb.big {
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  height: 62px;
  min-width: 58px;
  padding: 4px 8px;
  font-size: 11.5px;
}
</style>
