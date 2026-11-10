<script setup lang="ts">
import { computed, ref } from "vue";
import { AlertTriangle, Minus, Plus, TableOfContents } from "lucide-vue-next";
import { menu, toggleOutline } from "../lib/actions";
import { docTemplates, state } from "../lib/store";

const showWarnings = ref(false);
const templateName = computed(
  () => docTemplates.value.find((t) => t.id === state.template)?.name ?? state.template,
);
const zoomPct = computed(() => Math.round((state.zoom || state.fitZoom) * 100));
const pages = computed(() => state.pages.length);
</script>

<template>
  <footer class="status">
    <span>{{ pages }} {{ pages === 1 ? "page" : "pages" }}</span>
    <span>{{ state.words.toLocaleString() }} {{ state.words === 1 ? "word" : "words" }}</span>
    <span>Template: <b>{{ templateName }}</b></span>
    <span v-if="state.warnings.length" class="warn" @click="showWarnings = !showWarnings">
      <AlertTriangle :size="13" /> {{ state.warnings.length }}
      {{ state.warnings.length === 1 ? "note" : "notes" }}
      <div v-if="showWarnings" class="popover" @click.stop>
        <div v-for="(w, i) in state.warnings" :key="i">{{ w }}</div>
      </div>
    </span>
    <span class="spacer" />
    <span class="typesetting" :class="{ on: state.rendering }">
      <img src="/peanut.svg" alt="" />
      {{
        state.rendering
          ? "Typesetting…"
          : state.renderError
            ? "Preview is out of date"
            : "Up to date"
      }}
    </span>
    <span class="zoom">
      <button
        :class="{ on: state.outlineOpen }"
        :title="state.outlineOpen ? 'Hide outline' : 'Show outline'"
        @click="toggleOutline"
      >
        <TableOfContents :size="12" />
      </button>
      <button title="Zoom out (⌘−)" @click="menu('zoomOut')"><Minus :size="12" /></button>
      <button class="pct" title="Fit to width (⌘0)" @click="menu('zoomReset')">
        {{ state.zoom ? `${zoomPct}%` : "Fit" }}
      </button>
      <button title="Zoom in (⌘+)" @click="menu('zoomIn')"><Plus :size="12" /></button>
    </span>
  </footer>
</template>

<style scoped>
.status {
  display: flex;
  align-items: center;
  gap: 18px;
  height: 26px;
  padding: 0 12px;
  font-size: 11.5px;
  color: var(--quote);
  background: linear-gradient(180deg, var(--panel), #f3e8da);
  border-top: 1px solid var(--border);
}
b {
  color: var(--roast);
  font-weight: 600;
}
.spacer {
  flex: 1;
}
.warn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #a46a10;
  cursor: pointer;
}
.popover {
  position: absolute;
  bottom: 22px;
  left: 0;
  z-index: 40;
  width: 380px;
  max-height: 240px;
  overflow: auto;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  color: var(--ink);
  line-height: 1.6;
  user-select: text;
}
.typesetting {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
}
.typesetting img {
  width: 10px;
}
.typesetting.on img {
  animation: hop 0.45s ease-in-out infinite alternate;
}
@keyframes hop {
  to {
    transform: translateY(-3px) rotate(10deg);
  }
}
.zoom {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.zoom button {
  display: grid;
  place-items: center;
  height: 20px;
  min-width: 22px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--quote);
  font-size: 11px;
}
.zoom button:hover {
  background: var(--hover);
}
.zoom button.on {
  background: var(--active);
}
.zoom .pct {
  min-width: 42px;
}
</style>
