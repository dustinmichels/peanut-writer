<script setup lang="ts">
import { computed, useTemplateRef, watch } from "vue";
import { PanelLeftClose } from "lucide-vue-next";
import { toggleFocusSection, toggleOutline } from "@/lib/actions";
import { state } from "@/lib/store";

defineEmits<{ jump: [line: number] }>();

// Indent relative to the document's top heading level.
const top = computed(() => Math.min(...state.outline.map((h) => h.level)));

// Focused on a section, its headings (the focused one and those under it, up
// to the next of its level or above) are boxed, as outline indices [from, to).
const section = computed(() => {
  if (!state.focusSection) return null;
  const from = state.outline.findIndex((h) => h.line === state.focusedHeading);
  if (from < 0) return null;
  const level = state.outline[from].level;
  const next = state.outline.findIndex((h, i) => i > from && h.level <= level);
  return { from, to: next < 0 ? state.outline.length : next };
});
const inSection = (i: number) => !!section.value && i >= section.value.from && i < section.value.to;

// The highlighted heading is the one the editor is scrolled to; focused on a
// section, the section's own heading until the editor reaches one inside it.
const current = computed(() => {
  const s = section.value;
  if (!s) return state.currentHeading;
  const i = state.outline.findIndex((h) => h.line === state.currentHeading);
  return inSection(i) ? state.currentHeading : state.outline[s.from].line;
});

// Keep the current heading in view in a long outline.
const list = useTemplateRef("list");
watch(current, () => list.value?.querySelector(".current")?.scrollIntoView({ block: "nearest" }), {
  flush: "post",
});
</script>

<template>
  <nav class="outline" aria-label="Outline">
    <header>
      <span>Outline</span>
      <button title="Hide outline" @click="toggleOutline"><PanelLeftClose :size="14" /></button>
    </header>
    <label v-if="state.outline.length" class="focus">
      <input :checked="state.focusSection" type="checkbox" @change="toggleFocusSection" />
      Focus on section
    </label>
    <ul v-if="state.outline.length" ref="list">
      <li
        v-for="(h, i) in state.outline"
        :key="i"
        :class="{ sect: inSection(i), first: i === section?.from, last: i + 1 === section?.to }"
      >
        <button
          :class="{ top: h.level === top, current: h.line === current }"
          :aria-current="h.line === current ? 'location' : undefined"
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
.focus {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  color: var(--quote);
  border-bottom: 1px solid var(--border);
  user-select: none;
}
.focus input {
  margin: 0;
  accent-color: var(--accent);
}
ul {
  flex: 1;
  margin: 0;
  padding: 6px 0;
  overflow: auto;
  list-style: none;
}
/* The box around the focused section's headings, drawn over them so the
   current heading's highlight doesn't hide it. */
li.sect {
  position: relative;
}
li.sect::after {
  content: "";
  position: absolute;
  inset: 0 4px;
  border: 1.5px solid var(--focus);
  border-block-width: 0;
  pointer-events: none;
}
li.sect.first::after {
  border-top-width: 1.5px;
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
}
li.sect.last::after {
  border-bottom-width: 1.5px;
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
}
/* Inside the box, hover and the current highlight stay within it. */
li.sect button {
  clip-path: inset(0 5.5px);
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
li button.current {
  background: var(--active);
  color: var(--roast);
  box-shadow: inset 2px 0 var(--accent);
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
