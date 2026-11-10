<script setup lang="ts">
import { reactive, ref } from "vue";
import Modal from "../Modal.vue";
import { DocService } from "../../../bindings/peanut-writer";
import type { Settings, SettingsInfo } from "../../../bindings/peanut-writer/models";
import { autoFormat, effectiveSettings } from "../../lib/actions";
import { errorText, state, toast } from "../../lib/store";

const emit = defineEmits<{ close: [] }>();

type Key = "autoFormat" | "titleCase" | "peanut";
const fields: { key: Key; label: string; hint: string }[] = [
  {
    key: "autoFormat",
    label: "Auto format on save",
    hint: "Saving (⌘S, Save As, Sync Files) tidies the Markdown with oxfmt: blank lines, list markers, table columns, trailing spaces. Autosaves don't.",
  },
  {
    key: "titleCase",
    label: "Title case headings",
    hint: "When auto formatting: “The Lord of the Rings”. NASA, iPhone and code are left alone.",
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

DocService.Settings()
  .then((i) => {
    info.value = i;
    Object.assign(user, i.user);
    Object.assign(doc, i.document);
  })
  .catch((e) => {
    toast(`Settings: ${errorText(e)}`, "error");
    emit("close");
  });

const onOff = (v: boolean | null | undefined) => (v ? "on" : "off");

// A document setting is "" (use the global one), "on" or "off".
const docValue = (k: Key) => (doc[k] == null ? "" : onOff(doc[k]));
function setDoc(k: Key, v: string) {
  doc[k] = v === "" ? null : v === "on";
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
  emit("close");
  if (after.autoFormat && (!before.autoFormat || after.titleCase !== before.titleCase))
    autoFormat();
}
</script>

<template>
  <Modal title="Settings" @close="emit('close')" @submit="submit">
    <template v-if="info">
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

      <template v-if="scope === 'user'">
        <div v-for="f in fields" :key="f.key" class="field">
          <label class="check"><input v-model="user[f.key]" type="checkbox" /> {{ f.label }}</label>
          <span class="hint">{{ f.hint }}</span>
          <span v-if="doc[f.key] != null" class="hint override"
            >This document overrides it: {{ onOff(doc[f.key]) }}.</span
          >
        </div>
        <div class="field">
          <label
            >Default author
            <input v-model="user.author" placeholder="None" />
          </label>
          <span class="hint"
            >Put in the properties of each new document. Starts as this computer's user name.</span
          >
        </div>
        <p class="hint">For every document. Kept in {{ info.userFile }}</p>
      </template>

      <template v-else>
        <div v-for="f in fields" :key="f.key" class="field">
          <label
            >{{ f.label }}
            <select
              :value="docValue(f.key)"
              @change="setDoc(f.key, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">Use global ({{ onOff(user[f.key]) }})</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </label>
          <span class="hint">{{ f.hint }}</span>
        </div>
        <p class="hint">
          Overrides the global settings for this document only.
          {{
            info.documentFile
              ? `Kept in ${info.documentFile}`
              : "Kept beside the document once it's saved."
          }}
        </p>
      </template>
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
