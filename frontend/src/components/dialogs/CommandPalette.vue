<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { Search } from "lucide-vue-next";
import { type Command, commands, matches } from "../../lib/commands";

const emit = defineEmits<{ close: [] }>();

const query = ref("");
const selected = ref(0);
const input = ref<HTMLInputElement>();
const list = ref<HTMLElement>();
onMounted(() => input.value?.focus());

const shown = computed(() => commands().filter((c) => matches(c, query.value)));
watch(query, () => (selected.value = 0));

function enabled(c: Command) {
  return c.enabled?.() ?? true;
}

// run closes the palette first, so a command may open a dialog of its own.
function run(c: Command | undefined) {
  if (!c || !enabled(c)) return;
  emit("close");
  c.run();
}

function move(by: number) {
  const n = shown.value.length;
  if (!n) return;
  selected.value = (selected.value + by + n) % n;
  nextTick(() => list.value?.children[selected.value]?.scrollIntoView({ block: "nearest" }));
}

function key(e: KeyboardEvent) {
  switch (e.key) {
    case "ArrowDown":
      move(1);
      break;
    case "ArrowUp":
      move(-1);
      break;
    case "Enter":
      run(shown.value[selected.value]);
      break;
    case "Escape":
      emit("close");
      break;
    default:
      return;
  }
  e.preventDefault();
}
</script>

<template>
  <div class="scrim" @mousedown.self="emit('close')">
    <div class="palette" role="dialog" aria-label="Commands">
      <label class="search">
        <Search :size="15" />
        <input
          ref="input"
          v-model="query"
          placeholder="Type a command"
          spellcheck="false"
          @keydown="key"
        />
      </label>
      <ul ref="list" role="listbox">
        <li
          v-for="(c, i) in shown"
          :key="c.id"
          role="option"
          :aria-selected="i === selected"
          :class="{ on: i === selected, off: !enabled(c) }"
          @mousemove="selected = i"
          @mousedown.prevent
          @click="run(c)"
        >
          <span class="group">{{ c.group }}</span>
          <span class="label">{{ c.label }}</span>
          <kbd v-if="c.shortcut">{{ c.shortcut }}</kbd>
        </li>
        <li v-if="!shown.length" class="none">No matching commands</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: rgba(60, 38, 20, 0.18);
  backdrop-filter: blur(2px);
  animation: fade 0.12s ease-out;
}
.palette {
  width: min(560px, calc(100vw - 40px));
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 30px 70px -20px rgba(80, 40, 10, 0.45);
  overflow: hidden;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}
input {
  flex: 1;
  height: 44px;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 15px;
  color: var(--ink);
}
ul {
  margin: 0;
  padding: 6px;
  list-style: none;
  overflow: auto;
}
li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 8px;
}
li.on {
  background: var(--active);
}
li.off {
  opacity: 0.45;
}
.group {
  width: 64px;
  flex: none;
  color: var(--muted);
  font-size: 12px;
}
.label {
  flex: 1;
}
kbd {
  font-family: var(--ui);
  font-size: 12px;
  color: var(--muted);
}
.none {
  color: var(--muted);
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
</style>
