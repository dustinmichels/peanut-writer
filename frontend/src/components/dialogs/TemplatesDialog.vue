<script setup lang="ts">
import { computed, nextTick, reactive, ref } from "vue";
import { Check, FileCode, FolderOpen, Import, Pencil, Share, Trash2 } from "lucide-vue-next";
import Modal from "@/components/ui/Modal.vue";
import {
  deleteTemplate,
  editTemplate,
  importTemplate,
  openTemplatesFolder,
  renameTemplate,
  setTemplate,
  shareTemplate,
} from "@/lib/actions";
import { state } from "@/lib/store";

const emit = defineEmits<{ close: [] }>();

// The user's own templates: imported ones, and folders added by hand.
const mine = computed(() => state.templates.filter((t) => !t.builtin));

// The template being renamed ("" for none), with its new name and description.
const editing = reactive({ id: "", name: "", description: "" });
const nameField = ref<HTMLInputElement[]>([]);

async function edit(id: string) {
  const t = mine.value.find((t) => t.id === id);
  if (!t) return;
  Object.assign(editing, { id, name: t.name, description: t.description });
  await nextTick();
  nameField.value[0]?.focus();
}

async function save() {
  if (!editing.id || !editing.name.trim()) return;
  if (await renameTemplate(editing.id, editing.name, editing.description)) editing.id = "";
}

async function remove(id: string) {
  await deleteTemplate(id);
  if (editing.id === id) editing.id = "";
}
</script>

<template>
  <Modal title="Manage Templates" wide @close="emit('close')" @submit="save">
    <ul v-if="mine.length">
      <li v-for="t in mine" :key="t.id" :class="{ editing: editing.id === t.id }">
        <template v-if="editing.id === t.id">
          <label class="field">
            Name
            <input ref="nameField" v-model="editing.name" required />
          </label>
          <label class="field">
            Description
            <textarea v-model="editing.description" rows="2" />
            <span class="hint">Shown when you point at the template in the Design tab.</span>
          </label>
          <div class="actions">
            <button
              type="button"
              class="btn"
              title="Show template.typ (the PDF look) and template.json (the Word look) in Finder"
              @click="editTemplate(t.id)"
            >
              <FileCode :size="15" /> Edit Files…
            </button>
            <span class="spacer" />
            <button type="button" class="btn" @click="editing.id = ''">Cancel</button>
            <button type="submit" class="btn primary" :disabled="!editing.name.trim()">Save</button>
          </div>
        </template>
        <template v-else>
          <span class="about">
            <b>
              {{ t.name }}
              <em v-if="state.template === t.id">In use</em>
            </b>
            <small>{{ t.description || t.id }}</small>
          </span>
          <div class="actions">
            <button
              v-if="state.template !== t.id"
              type="button"
              class="btn"
              title="Use this template for the document"
              @click="setTemplate(t.id)"
            >
              <Check :size="15" /> Use
            </button>
            <button type="button" class="btn icon" title="Edit" @click="edit(t.id)">
              <Pencil :size="15" />
            </button>
            <button
              type="button"
              class="btn icon"
              title="Share: save it as a .zip to send"
              @click="shareTemplate(t.id)"
            >
              <Share :size="15" />
            </button>
            <button type="button" class="btn icon danger" title="Delete" @click="remove(t.id)">
              <Trash2 :size="15" />
            </button>
          </div>
        </template>
      </li>
    </ul>
    <p v-else class="empty">
      No templates of your own yet. Import one someone shared with you, or add a template folder to
      your templates folder. (<b>Customize</b> in the Design tab changes one document's fonts and
      colors.)
    </p>
    <template #footer>
      <button
        type="button"
        class="btn"
        title="Show your templates folder"
        @click="openTemplatesFolder"
      >
        <FolderOpen :size="15" /> Open Folder
      </button>
      <button
        type="button"
        class="btn"
        title="Add a template someone shared with you (.zip)"
        @click="importTemplate"
      >
        <Import :size="15" /> Import…
      </button>
      <span class="spacer" />
      <button type="button" class="btn primary" @click="emit('close')">Done</button>
    </template>
  </Modal>
</template>

<style scoped>
ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 10px;
}
li:hover {
  background: var(--hover);
}
li.editing {
  flex-direction: column;
  align-items: stretch;
  background: var(--panel);
}
.about {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
b {
  color: var(--roast);
  font-weight: 600;
  overflow-wrap: anywhere;
}
em {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--active);
  color: var(--accent);
  font-size: 11px;
  font-style: normal;
  font-weight: 500;
}
small {
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.spacer {
  flex: 1;
}
textarea {
  resize: vertical;
}
.empty {
  margin: 0;
  color: var(--quote);
}
</style>
