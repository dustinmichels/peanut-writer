<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { RotateCcw } from "lucide-vue-next";
import { DocService } from "../../bindings/peanut-writer";
import type { DocxStyle, Style } from "../../bindings/peanut-writer/internal/templates/models";
import {
  removeCustomTemplate,
  saveCustomTemplate,
  setTemplateBase,
  setTemplateStyle,
} from "../lib/actions";
import { errorText, state, toast } from "../lib/store";

// Shown in place of the editor while the document's own template is being
// customized; the preview beside it shows each change.

type FontKey = "bodyFont" | "headingFont" | "monoFont";
type ColorKey =
  | "textColor"
  | "headingColor"
  | "titleColor"
  | "captionColor"
  | "accentColor"
  | "tableHeaderFill";

const fontFields: { key: FontKey; label: string }[] = [
  { key: "bodyFont", label: "Body" },
  { key: "headingFont", label: "Headings and title" },
  { key: "monoFont", label: "Code" },
];
const colorFields: { key: ColorKey; label: string }[] = [
  { key: "textColor", label: "Text" },
  { key: "headingColor", label: "Headings" },
  { key: "titleColor", label: "Title" },
  { key: "captionColor", label: "Captions" },
  { key: "accentColor", label: "Accent (rules and borders)" },
  { key: "tableHeaderFill", label: "Table header" },
];
const sizes = [9, 9.5, 10, 10.5, 11, 11.5, 12, 13, 14, 16];

// The changes, edited here; saved (and the preview redrawn) shortly after each.
const style = reactive<Style>({ ...state.custom?.style });

const base = computed(() => state.templates.find((t) => t.id === state.custom?.base));
// The base template's look, which every unchanged value keeps.
const baseStyle = computed<DocxStyle | undefined>(() => base.value?.docx ?? state.custom?.docx);

const fonts = ref<string[]>([]);
DocService.Fonts()
  .then((f) => (fonts.value = f ?? []))
  .catch((e) => toast(`Fonts: ${errorText(e)}`, "error"));

// A chosen font Typst can't find is still offered, so it shows as chosen.
const fontOptions = (k: FontKey) => {
  const v = style[k];
  return v && !fonts.value.includes(v) ? [v, ...fonts.value] : fonts.value;
};

let timer: ReturnType<typeof setTimeout> | undefined;
function save() {
  clearTimeout(timer);
  timer = undefined;
  setTemplateStyle({ ...style });
}
function changed() {
  clearTimeout(timer);
  timer = setTimeout(save, 150);
}
function flush() {
  if (timer !== undefined) save();
}
// Leaving with a change still waiting saves it.
onBeforeUnmount(flush);

function remove() {
  clearTimeout(timer);
  timer = undefined;
  removeCustomTemplate();
}

function changeBase(id: string) {
  flush();
  setTemplateBase(id);
}

// Saving as a template of the user's own, for any document to use.
const saving = reactive({ name: "", description: "" });
async function saveAsTemplate() {
  if (!saving.name.trim()) return;
  flush();
  if (await saveCustomTemplate(saving.name, saving.description))
    Object.assign(saving, { name: "", description: "" });
}

function set<K extends keyof Style>(k: K, v: Style[K] | undefined) {
  if (v === undefined || v === "" || v === 0) delete style[k];
  else style[k] = v;
  changed();
}

// <input type=color> wants #rrggbb; the template keeps RRGGBB.
function colorValue(k: ColorKey): string {
  const v = style[k] || baseStyle.value?.[k] || "";
  return v ? `#${v.toLowerCase()}` : "#ffffff";
}

const fileHint = computed(() =>
  state.path
    ? `Kept beside the document, in ${state.name}.template.json.`
    : "Kept with the document once it's saved.",
);
</script>

<template>
  <section class="customize">
    <header>
      <h2>Customize {{ base?.name ?? "template" }}</h2>
      <p class="hint">Changes are for this document only. {{ fileHint }}</p>
    </header>

    <div class="body">
      <fieldset>
        <legend>Template</legend>
        <label class="row">
          <span>Based on</span>
          <select
            :value="state.custom?.base"
            @change="changeBase(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="t in state.templates" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Fonts</legend>
        <label v-for="f in fontFields" :key="f.key" class="row">
          <span>{{ f.label }}</span>
          <select
            :value="style[f.key] ?? ''"
            @change="set(f.key, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">Template's ({{ baseStyle?.[f.key] }})</option>
            <option v-for="name in fontOptions(f.key)" :key="name" :value="name">
              {{ name }}{{ fonts.includes(name) ? "" : " (not found)" }}
            </option>
          </select>
        </label>
        <label class="row">
          <span>Body size</span>
          <select
            :value="style.fontSize ?? 0"
            @change="set('fontSize', Number(($event.target as HTMLSelectElement).value))"
          >
            <option :value="0">Template's ({{ baseStyle?.fontSize }} pt)</option>
            <option v-for="s in sizes" :key="s" :value="s">{{ s }} pt</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Colors</legend>
        <div v-for="f in colorFields" :key="f.key" class="row">
          <label :for="`color-${f.key}`">{{ f.label }}</label>
          <div class="color">
            <input
              :id="`color-${f.key}`"
              type="color"
              :value="colorValue(f.key)"
              @input="set(f.key, ($event.target as HTMLInputElement).value.slice(1).toUpperCase())"
            />
            <span v-if="style[f.key]" class="changed">Changed</span>
            <span v-else class="hint">{{
              baseStyle?.[f.key] ? "Template's" : "Template's (none)"
            }}</span>
            <button
              type="button"
              class="btn icon"
              title="Back to the template's"
              :disabled="!style[f.key]"
              @click="set(f.key, undefined)"
            >
              <RotateCcw :size="14" />
            </button>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Save as template</legend>
        <p class="hint">Adds these fonts and colors to your templates, for any document to use.</p>
        <form @submit.prevent="saveAsTemplate">
          <label class="row">
            <span>Name</span>
            <input v-model="saving.name" type="text" :placeholder="`My ${base?.name ?? 'template'}`" />
          </label>
          <label class="row">
            <span>Description</span>
            <input v-model="saving.description" type="text" placeholder="Optional" />
          </label>
          <div class="row">
            <span />
            <button type="submit" class="btn" :disabled="!saving.name.trim()">Save as Template</button>
          </div>
        </form>
      </fieldset>
    </div>

    <footer>
      <button type="button" class="btn danger" @click="remove">Remove Customization</button>
      <button type="button" class="btn primary" @click="state.customizing = false">Done</button>
    </footer>
  </section>
</template>

<style scoped>
.customize {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--surface);
}
header {
  padding: 18px 22px 10px;
  border-bottom: 1px solid var(--border);
}
h2 {
  margin: 0 0 4px;
  font-family: var(--rounded);
  font-size: 17px;
  color: var(--roast);
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
.body {
  flex: 1;
  overflow: auto;
  padding: 8px 22px 16px;
}
fieldset {
  margin: 12px 0 0;
  padding: 0;
  border: 0;
}
legend {
  margin-bottom: 6px;
  font-weight: 650;
  color: var(--ink);
}
.row {
  display: grid;
  grid-template-columns: 150px 1fr;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
}
select,
input[type="text"] {
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: white;
  color: var(--ink);
}
.color {
  display: flex;
  align-items: center;
  gap: 8px;
}
input[type="color"] {
  width: 44px;
  height: 26px;
  padding: 1px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: white;
}
.color .hint,
.changed {
  flex: 1;
  font-size: 12px;
}
.changed {
  color: var(--accent);
  font-weight: 600;
}
footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 22px;
  border-top: 1px solid var(--border);
}
</style>
