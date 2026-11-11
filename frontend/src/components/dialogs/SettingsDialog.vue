<script setup lang="ts">
import { computed, nextTick, reactive, ref, useTemplateRef } from "vue";
import { RotateCcw } from "lucide-vue-next";
import Modal from "@/components/ui/Modal.vue";
import { DocService } from "@bindings/peanut-writer";
import type { Settings, SettingsInfo } from "@bindings/peanut-writer/models";
import { autoFormat, defaultSettings, effectiveSettings } from "@/lib/actions";
import { errorText, state, toast } from "@/lib/store";

const emit = defineEmits<{ close: [] }>();

type Key = "autoFormat" | "headingCase" | "syncOnSave" | "syncOnQuit" | "peanut";
type Value = boolean | string;
// A field is a checkbox, or a choice among options.
const fields: {
  key: Key;
  label: string;
  hint: string;
  options?: { value: string; label: string }[];
}[] = [
  {
    key: "autoFormat",
    label: "Auto format on save",
    hint: "Saving (⌘S, Save As, Sync Files) tidies the Markdown with oxfmt: blank lines, list markers, table columns, trailing spaces. Autosaves don't.",
  },
  {
    key: "headingCase",
    label: "Auto format headings",
    hint: "When auto formatting. NASA, iPhone and code are left alone; sentence case lowercases names like “London” too.",
    options: [
      { value: "none", label: "None" },
      { value: "title", label: "Title Case: “The Lord of the Rings”" },
      { value: "sentence", label: "Sentence case: “The lord of the rings”" },
    ],
  },
  {
    key: "syncOnSave",
    label: "Sync files on save",
    hint: "Saving (⌘S, Save As) also writes the PDF and Word copies beside the document, as Sync Files does, if it changed since they were last written. Autosaves don't.",
  },
  {
    key: "syncOnQuit",
    label: "Sync files on quit",
    hint: "Quitting and opening another document also write the PDF and Word copies beside the document, if it changed since they were last written.",
  },
  {
    key: "peanut",
    label: "Show Peanut",
    hint: "Peanut keeps you company beside the ribbon tabs.",
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
const shown = computed(() =>
  fields.filter((f) =>
    matches([f.label, f.hint, ...(f.options ?? []).map((o) => o.label)].join(" ")),
  ),
);
const authorShown = computed(() =>
  matches("Default author Put in the properties of each new document user name"),
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

// Only what changed is written, so hand edits made meanwhile survive.
// Turning formatting on (or changing it) formats the document straight away,
// to show what it does.
async function submit() {
  const i = info.value;
  if (!i) return;
  const same = (a: Settings, b: Settings) =>
    fields.every((f) => (a[f.key] ?? null) === (b[f.key] ?? null)) &&
    (a.author ?? null) === (b.author ?? null);
  try {
    if (!same(user, i.user)) await DocService.SetUserSettings({ ...user });
    if (!same(doc, i.document)) await DocService.SetDocumentSettings({ ...doc });
  } catch (e) {
    toast(`Settings: ${errorText(e)}`, "error");
    return;
  }
  const before = effectiveSettings(i);
  const after = effectiveSettings({ ...i, user, document: doc });
  state.showPeanut = after.peanut;
  state.syncOnSave = after.syncOnSave;
  state.syncOnQuit = after.syncOnQuit;
  emit("close");
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
      <div class="scopes" role="tablist">
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

      <div
        v-for="f in shown"
        :key="f.key"
        class="field"
        :class="{ off: f.options && !value('autoFormat') }"
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
        <div v-if="f.options" class="choices" role="radiogroup" :aria-labelledby="`${f.key}-label`">
          <label v-for="o in f.options" :key="o.value" class="check"
            ><input
              type="radio"
              :name="f.key"
              :checked="value(f.key) === o.value"
              :disabled="!value('autoFormat')"
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

      <p v-if="!shown.length && !(scope === 'user' && authorShown)" class="hint">
        No settings match “{{ query.trim() }}”.
      </p>

      <template v-if="scope === 'user'">
        <div v-if="authorShown" class="field">
          <label
            >Default author
            <input v-model="user.author" placeholder="None" />
          </label>
          <span class="hint"
            >Put in the properties of each new document, and of any saved without an author. Starts
            as this computer's user name.</span
          >
        </div>
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
.scopes {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
}
.scopes button {
  flex: 1;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
}
.scopes button:hover {
  color: var(--ink);
}
.scopes button.on {
  background: var(--surface);
  color: var(--roast);
  font-weight: 650;
  box-shadow: 0 1px 2px rgba(80, 40, 10, 0.15);
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
.off .choices {
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
