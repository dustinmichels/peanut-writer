<script setup lang="ts">
// Text as it reads, around what the slot shows (a cross-reference or a
// footnote mark), if anything.
import { computed } from "vue";
import { kindName, readable } from "@/lib/markdown";
import { state } from "@/lib/store";

defineProps<{ before: string; after: string }>();

// What each label reads as; the first of a label wins, as in the editor.
const refText = computed(() => {
  const m = new Map<string, string>();
  for (const x of state.items)
    if (x.label && !m.has(x.label)) m.set(x.label, `${kindName[x.kind]} ${x.number}`);
  return m;
});
const read = (s: string) => readable(s, (l) => refText.value.get(l) ?? `?? ${l}`);
</script>

<template>
  <span class="excerpt"
    >{{ read(before) }}<mark v-if="$slots.default"><slot /></mark>{{ read(after) }}</span
  >
</template>

<style scoped>
.excerpt {
  font-family: var(--writing);
  font-size: 13.5px;
  line-height: 1.45;
  color: var(--ink);
}
mark {
  padding: 0 2px;
  border-radius: 4px;
  background: var(--active);
  color: var(--accent-ink);
  font-weight: 600;
}
</style>
