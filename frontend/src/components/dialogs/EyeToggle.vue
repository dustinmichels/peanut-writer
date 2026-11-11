<script setup lang="ts">
import { Eye, EyeOff } from "lucide-vue-next";

// EyeToggle switches whether a property shows in the document.
defineProps<{ hidden: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    type="button"
    class="eye"
    :class="{ hidden }"
    :title="hidden ? 'Hidden in the document: click to show it' : 'Shown in the document: click to hide it'"
    :aria-pressed="!hidden"
    @click="emit('toggle')"
  >
    <EyeOff v-if="hidden" :size="14" />
    <Eye v-else :size="14" />
  </button>
</template>

<style scoped>
.eye {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.eye:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--ink);
}
.eye.hidden {
  color: var(--danger);
}
</style>
