<script setup lang="ts">
import { computed, nextTick, reactive, ref, useTemplateRef } from "vue";
import { RotateCcw } from "lucide-vue-next";
import Modal from "@/components/ui/Modal.vue";
import { DocService } from "@bindings/peanut-writer";
import type { Settings, SettingsInfo } from "@bindings/peanut-writer/models";
import { autoFormat, defaultSettings, effectiveSettings } from "@/lib/actions";
import { errorText, state, toast } from "@/lib/store";

const emit = defineEmits<{ close: [] }>();

type Key =
  | "autoFormat"
  | "headingCase"
  | "syncOnSave"
  | "syncOnQuit"
  | "peanut"
  | "peanutActivity"
  | "zotero";
type Value = boolean | string;
type Section = "Auto format" | "Sync files" | "Peanut" | "Citations";
// The fields are shown under these headings, in this order, after the hint
// their fields share; the default author, set only globally, comes last
// under "Other".
const sections: { name: Section; hint?: string }[] = [
  { name: "Auto format" },
  {
    name: "Sync files",
    hint: "Writes the PDF and Word copies beside the document, as Sync Files does, if it changed since they were last written.",
  },
  { name: "Peanut" },
  { name: "Citations" },
];
// A field is a checkbox, or a choice among options: radio buttons, or a
// segmented toggle. One that needs another checkbox is dimmed while it's off.
const fields: {
  key: Key;
  section: Section;
  label: string;
  hint: string;
  options?: { value: string; label: string }[];
  toggle?: boolean;
  needs?: Key;
}[] = [
  {
    key: "autoFormat",
    section: "Auto format",
    label: "Auto format on save",
    hint: "Saving (⌘S, Save As, Sync Files) tidies the Markdown with oxfmt: blank lines, list markers, table columns, trailing spaces. Autosaves don't.",
  },
  {
    key: "headingCase",
    section: "Auto format",
    label: "Auto format headings",
    hint: "When auto formatting. NASA, iPhone and code are left alone; sentence case lowercases names like “London” too.",
    options: [
      { value: "none", label: "None" },
      { value: "title", label: "Title Case: “The Lord of the Rings”" },
      { value: "sentence", label: "Sentence case: “The lord of the rings”" },
    ],
    needs: "autoFormat",
  },
  {
    key: "syncOnSave",
    section: "Sync files",
    label: "Sync files on save",
    hint: "On ⌘S and Save As. Autosaves don't.",
  },
  {
    key: "syncOnQuit",
    section: "Sync files",
    label: "Sync files on quit",
    hint: "On quitting, and on opening another document.",
  },
  {
    key: "peanut",
    section: "Peanut",
    label: "Show Peanut",
    hint: "Peanut keeps you company beside the ribbon tabs.",
  },
  {
    key: "peanutActivity",
    section: "Peanut",
    label: "Peanut's activity level",
    hint: "Chill: he gets up to something every half minute or so. Busy: every few seconds, and more often his tricks: jamming in his headphones, jumping for joy, inspecting the Commands button.",
    options: [
      { value: "chill", label: "Chill" },
      { value: "busy", label: "Busy" },
    ],
    toggle: true,
    needs: "peanut",
  },
  {
    key: "zotero",
    section: "Citations",
    label: "Zotero citations",
    hint: "The Citation dialog (Citations & Footnotes → Citation) also searches your Zotero library and copies the sources you cite into the document's references. Needs Zotero and its free Better BibTeX add-on; the dialog shows how to set them up. Without it, enter references in the dialog yourself.",
  },
];

// Global settings apply to every document; a document's own override them.
const scope = ref<"user" | "document">("user");
const info = ref<SettingsInfo | null>(null);
const user = reactive<Settings>({});
const doc = reactive<Settings>({});
const userValues = user as Record<Key, Value | null | undefined>;
const docValues = doc as Record<Key, Value | null | undefined>;

// The filter box is focused once the settings are shown, so typing narrows them.
const query = ref("");
const filterInput = useTemplateRef("filterInput");
// matches says whether every word typed appears in text.
const matches = (text: string) => {
  const t = text.toLowerCase();
  return query.value
    .toLowerCase()
    .split(/\s+/)
    .every((w) => t.includes(w));
};
const sectionHint = (s: Section) => sections.find((x) => x.name === s)?.hint ?? "";
const shown = computed(() =>
  fields.filter((f) =>
    matches(
      [
        f.section,
        sectionHint(f.section),
        f.label,
        f.hint,
        ...(f.options ?? []).map((o) => o.label),
      ].join(" "),
    ),
  ),
);
// The sections with a field shown, and those fields.
const groups = computed(() =>
  sections
    .map((s) => ({ ...s, fields: shown.value.filter((f) => f.section === s.name) }))
    .filter((g) => g.fields.length),
);
const authorShown = computed(() =>
  matches("Other Default author Put in the properties of each new document user name"),
);

DocService.Settings()
  .then((i) => {
    info.value = i;
    Object.assign(user, i.user);
    Object.assign(doc, i.document);
    nextTick(() => filterInput.value?.focus());
  })
  .catch((e) => {
    toast(`Settings: ${errorText(e)}`, "error");
    emit("close");
  });

const globalValue = (k: Key): Value => userValues[k] ?? defaultSettings[k];
// value is what k comes to in the pane shown.
const value = (k: Key): Value =>
  scope.value === "user" ? globalValue(k) : (docValues[k] ?? globalValue(k));
// A document overrides a global setting only where it differs from it.
const overridden = (k: Key) => docValues[k] != null && docValues[k] !== globalValue(k);

function set(k: Key, v: Value) {
  if (scope.value === "user") userValues[k] = v;
  else docValues[k] = v === globalValue(k) ? null : v;
}

function describe(k: Key, v: Value | null | undefined) {
  if (typeof v === "boolean") return v ? "on" : "off";
  const o = fields.find((f) => f.key === k)?.options?.find((o) => o.value === v);
  return o ? o.label.replace(/:.*/, "") : String(v);
}

// Only the settings changed are written, so hand edits made meanwhile
// survive, and the defaults shown (the computer user's name as the author,
// say) aren't fixed in place. Turning formatting on (or changing it) formats
// the document straight away, to show what it does.
async function submit() {
  const i = info.value;
  if (!i) return;
  const changed = (a: Settings, b: Settings) =>
    [...fields.map((f) => f.key), "author" as const].filter(
      (k) => (a[k] ?? null) !== (b[k] ?? null),
    );
  const userKeys = changed(user, i.user);
  const docKeys = changed(doc, i.document);
  try {
    if (userKeys.length) await DocService.SetUserSettings({ ...user }, userKeys);
    if (docKeys.length) await DocService.SetDocumentSettings({ ...doc }, docKeys);
  } catch (e) {
    toast(`Settings: ${errorText(e)}`, "error");
    return;
  }
  const before = effectiveSettings(i);
  const after = effectiveSettings({ ...i, user, document: doc });
  state.showPeanut = after.peanut;
  state.peanutBusy = after.peanutActivity === "busy";
  state.syncOnSave = after.syncOnSave;
  state.syncOnQuit = after.syncOnQuit;
  state.zotero = after.zotero;
  emit("close");
  if (after.zotero && !before.zotero)
    toast(
      "Zotero citations are on: find them under Citations & Footnotes → Citation → Zotero.",
      "success",
    );
  if (after.autoFormat && (!before.autoFormat || after.headingCase !== before.headingCase))
    autoFormat();
}
</script>

<template>
  <Modal title="Settings" @close="emit('close')" @submit="submit">
    <template v-if="info">
      <input
        ref="filterInput"
        v-model="query"
        type="search"
        placeholder="Filter settings"
        aria-label="Filter settings"
      />
      <div class="segmented" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="scope === 'user'"
          :class="{ on: scope === 'user' }"
          @click="scope = 'user'"
        >
          Global
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="scope === 'document'"
          :class="{ on: scope === 'document' }"
          @click="scope = 'document'"
        >
          This Document
        </button>
      </div>

      <section v-for="g in groups" :key="g.name">
        <h3>{{ g.name }}</h3>
        <p v-if="g.hint" class="hint">{{ g.hint }}</p>
        <div
          v-for="f in g.fields"
          :key="f.key"
          class="field"
          :class="{ off: f.needs && !value(f.needs) }"
        >
          <div class="head">
            <label v-if="!f.options" class="check"
              ><input
                type="checkbox"
                :checked="value(f.key) === true"
                @change="set(f.key, ($event.target as HTMLInputElement).checked)"
              />
              {{ f.label }}</label
            >
            <span v-else :id="`${f.key}-label`">{{ f.label }}</span>
            <button
              v-if="scope === 'document' && overridden(f.key)"
              type="button"
              class="btn icon"
              :title="`Back to the global setting (${describe(f.key, globalValue(f.key))})`"
              @click="docValues[f.key] = null"
            >
              <RotateCcw :size="14" />
            </button>
          </div>
          <div
            v-if="f.toggle"
            class="segmented toggle"
            role="radiogroup"
            :aria-labelledby="`${f.key}-label`"
          >
            <button
              v-for="o in f.options"
              :key="o.value"
              type="button"
              role="radio"
              :aria-checked="value(f.key) === o.value"
              :class="{ on: value(f.key) === o.value }"
              :disabled="f.needs && !value(f.needs)"
              @click="set(f.key, o.value)"
            >
              {{ o.label }}
            </button>
          </div>
          <div
            v-else-if="f.options"
            class="choices"
            role="radiogroup"
            :aria-labelledby="`${f.key}-label`"
          >
            <label v-for="o in f.options" :key="o.value" class="check"
              ><input
                type="radio"
                :name="f.key"
                :checked="value(f.key) === o.value"
                :disabled="f.needs && !value(f.needs)"
                @change="set(f.key, o.value)"
              />
              {{ o.label }}</label
            >
          </div>
          <span class="hint">{{ f.hint }}</span>
          <span v-if="scope === 'user' && overridden(f.key)" class="hint override"
            >This document overrides it: {{ describe(f.key, docValues[f.key]) }}.</span
          >
        </div>
      </section>

      <p v-if="!shown.length && !(scope === 'user' && authorShown)" class="hint">
        No settings match “{{ query.trim() }}”.
      </p>

      <template v-if="scope === 'user'">
        <section v-if="authorShown">
          <h3>Other</h3>
          <div class="field">
            <label
              >Default author
              <input v-model="user.author" placeholder="None" />
            </label>
            <span class="hint"
              >Put in the properties of each new document, and of any saved without an author.
              Starts as this computer's user name.</span
            >
          </div>
        </section>
        <p class="hint">For every document. Kept in {{ info.userFile }}</p>
      </template>
      <p v-else class="hint">
        Overrides the global settings for this document only; reset one to follow the global setting
        again.
        {{
          info.documentFile
            ? `Kept in ${info.documentFile}`
            : "Kept beside the document once it's saved."
        }}
      </p>
    </template>
    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="submit" class="btn primary" :disabled="!info">Done</button>
    </template>
  </Modal>
</template>

<style scoped>
.segmented {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
}
.segmented button {
  flex: 1;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
}
.segmented button:hover:not(:disabled) {
  color: var(--ink);
}
.segmented button.on {
  background: var(--surface);
  color: var(--roast);
  font-weight: 650;
  box-shadow: 0 1px 2px rgba(80, 40, 10, 0.15);
}
.segmented.toggle {
  align-self: flex-start;
  margin-left: 4px;
}
.segmented.toggle button {
  flex: none;
  height: 24px;
  padding: 0 14px;
}
section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
section + section {
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
h3 {
  margin: 4px 0 -4px;
  color: var(--quote);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 26px;
}
.choices {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 4px;
}
.off .choices,
.off .toggle {
  opacity: 0.55;
}
.field > label:not(.check) {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.override {
  color: var(--accent);
}
p.hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  overflow-wrap: anywhere;
}
</style>
