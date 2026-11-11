<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from "vue";
import { ChevronDown } from "lucide-vue-next";

// A font picker whose choices are drawn in their own fonts, which a <select>
// can't do: WebKit draws its menus in the system font.

const props = defineProps<{
  value: string; // "" keeps the template's font
  fonts: string[]; // the fonts Typst finds
  inherited?: string; // the template's font
  label: string;
}>();
const emit = defineEmits<{ change: [value: string] }>();

const open = ref(false);
const query = ref("");
const selected = ref(0);
const root = useTemplateRef("root");
const button = useTemplateRef("button");
const input = useTemplateRef("input");
const list = useTemplateRef("list");
const at = ref({ left: 0, top: 0, width: 0, maxHeight: 0 });

type Choice = { value: string; label: string; font?: string };

// A chosen font Typst can't find is still offered, so it shows as chosen.
const names = computed(() =>
  props.value && !props.fonts.includes(props.value) ? [props.value, ...props.fonts] : props.fonts,
);
const choices = computed<Choice[]>(() => {
  const q = query.value.trim().toLowerCase();
  const fonts = names.value
    .filter((n) => n.toLowerCase().includes(q))
    .map((n) => ({
      value: n,
      label: props.fonts.includes(n) ? n : `${n} (not found)`,
      font: n,
    }));
  if (q) return fonts;
  return [
    { value: "", label: `Template's (${props.inherited ?? "none"})`, font: props.inherited },
    ...fonts,
  ];
});
const current = computed(
  () =>
    choices.value.find((c) => c.value === props.value) ?? {
      value: props.value,
      label: props.value || `Template's (${props.inherited ?? "none"})`,
      font: props.value || props.inherited,
    },
);

function show() {
  const r = button.value!.getBoundingClientRect();
  const below = innerHeight - r.bottom - 12;
  const above = r.top - 12;
  const up = below < 220 && above > below;
  const maxHeight = Math.min(340, up ? above : below);
  at.value = {
    left: r.left,
    width: Math.max(r.width, 260),
    maxHeight,
    top: up ? r.top - 4 - maxHeight : r.bottom + 4,
  };
  query.value = "";
  open.value = true;
  selected.value = Math.max(
    0,
    choices.value.findIndex((c) => c.value === props.value),
  );
  nextTick(() => {
    input.value?.focus();
    reveal();
  });
  addEventListener("scroll", scrolled, true);
  addEventListener("resize", close);
}

function close() {
  open.value = false;
  removeEventListener("scroll", scrolled, true);
  removeEventListener("resize", close);
}
onBeforeUnmount(close);

// The list is placed against the button, so scrolling anything else closes it.
function scrolled(e: Event) {
  if (!list.value?.contains(e.target as Node)) close();
}

function pick(c: Choice | undefined) {
  if (!c) return;
  close();
  button.value?.focus();
  if (c.value !== props.value) emit("change", c.value);
}

function reveal() {
  list.value?.children[selected.value]?.scrollIntoView({ block: "nearest" });
}

function move(by: number) {
  const n = choices.value.length;
  if (!n) return;
  selected.value = (selected.value + by + n) % n;
  nextTick(reveal);
}

function typed() {
  selected.value = 0;
  list.value?.scrollTo({ top: 0 });
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
      pick(choices.value[selected.value]);
      break;
    case "Escape":
      close();
      button.value?.focus();
      break;
    case "Tab":
      close();
      return;
    default:
      return;
  }
  e.preventDefault();
}

function buttonKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    show();
  }
}

function focusOut(e: FocusEvent) {
  if (!root.value?.contains(e.relatedTarget as Node)) close();
}

// A font the web view doesn't have (one built into Typst, say) would be drawn
// in a fallback, so it's drawn in the UI font, marked, instead.
const sample = "mmmmmmmmmmlli WQ@#0";
const known = new Map<string, boolean>();
let ctx: CanvasRenderingContext2D | null | undefined;
function installed(name: string): boolean {
  let ok = known.get(name);
  if (ok === undefined) {
    ctx ??= document.createElement("canvas").getContext("2d");
    ok =
      !!ctx &&
      ["monospace", "serif"].some((g) => {
        ctx!.font = `32px ${g}`;
        const w = ctx!.measureText(sample).width;
        ctx!.font = `32px ${family(name)}, ${g}`;
        return ctx!.measureText(sample).width !== w;
      });
    known.set(name, ok);
  }
  return ok;
}

function family(name: string) {
  return `"${name.replace(/["\\]/g, "\\$&")}"`;
}

function fontStyle(name: string | undefined) {
  return name && installed(name) ? { fontFamily: `${family(name)}, var(--ui)` } : undefined;
}
</script>

<template>
  <div ref="root" class="font-select" @focusout="focusOut">
    <button
      ref="button"
      type="button"
      class="current"
      :aria-label="label"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open ? close() : show()"
      @keydown="buttonKey"
    >
      <span class="name" :style="fontStyle(current.font)">{{ current.label }}</span>
      <ChevronDown :size="14" />
    </button>
    <div
      v-if="open"
      class="popup"
      :style="{
        left: `${at.left}px`,
        top: `${at.top}px`,
        width: `${at.width}px`,
        maxHeight: `${at.maxHeight}px`,
      }"
    >
      <input
        ref="input"
        v-model="query"
        placeholder="Find a font"
        spellcheck="false"
        :aria-label="`Find a ${label.toLowerCase()} font`"
        @input="typed"
        @keydown="key"
      />
      <ul ref="list" role="listbox" :aria-label="label">
        <li
          v-for="(c, i) in choices"
          :key="c.value"
          role="option"
          :aria-selected="c.value === value"
          :class="{ on: i === selected, chosen: c.value === value }"
          @mousemove="selected = i"
          @mousedown.prevent
          @click="pick(c)"
        >
          <span class="name" :style="fontStyle(c.font)">{{ c.label }}</span>
          <span v-if="c.font && !installed(c.font)" class="hint">no preview</span>
        </li>
        <li v-if="!choices.length" class="none">No matching fonts</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.font-select {
  min-width: 0;
}
.current {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: white;
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: default;
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 14px;
}
.popup {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
  box-shadow: 0 14px 34px -12px rgba(80, 40, 10, 0.4);
  overflow: hidden;
}
input {
  flex: none;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-bottom: 1px solid var(--border);
  outline: 0;
  background: transparent;
  color: var(--ink);
}
ul {
  margin: 0;
  padding: 4px;
  list-style: none;
  overflow: auto;
}
li {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  overflow: hidden;
}
li.on {
  background: var(--active);
}
li.chosen .name {
  font-weight: 650;
}
.hint,
.none {
  font-size: 11px;
  color: var(--muted);
}
</style>
