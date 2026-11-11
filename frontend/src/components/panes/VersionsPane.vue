<script setup lang="ts">
import { ref } from "vue";
import { FolderSearch, PanelLeftClose, RotateCcw } from "lucide-vue-next";
import { DocService } from "@bindings/peanut-writer";
import { loadBackup, loadVersion, saveVersion, toggleVersions } from "@/lib/actions";
import { state } from "@/lib/store";

const name = ref("");
const busy = ref(false);

async function save() {
  if (!name.value.trim() || busy.value) return;
  busy.value = true;
  try {
    if (await saveVersion(name.value)) name.value = "";
  } finally {
    busy.value = false;
  }
}

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
</script>

<template>
  <aside class="versions" aria-label="Versions">
    <header>
      <span>Versions</span>
      <button title="Hide versions" @click="toggleVersions"><PanelLeftClose :size="14" /></button>
    </header>
    <form @submit.prevent="save">
      <input
        v-model="name"
        type="text"
        placeholder="Name this version"
        aria-label="Version name"
        :disabled="busy"
      />
      <button type="submit" :disabled="busy || !name.trim()">
        {{ busy ? "Saving…" : "Save Version" }}
      </button>
    </form>
    <div class="list">
      <ul v-if="state.versions.length">
        <li v-for="v in state.versions" :key="v.name">
          <div class="info" :title="v.name">
            <span class="name">{{ v.name }}</span>
            <span class="when">{{ when(v.saved) }}</span>
          </div>
          <button title="Open this version" @click="loadVersion(v.name)">
            <RotateCcw :size="14" />
          </button>
          <button
            title="Show its Markdown, Word and PDF in Finder"
            @click="DocService.Reveal(v.path)"
          >
            <FolderSearch :size="14" />
          </button>
        </li>
      </ul>
      <p v-else class="empty">
        {{
          state.path
            ? "Name the document as it is now to keep it, with Word and PDF copies, and come back to it later."
            : "Saving a version saves the document first."
        }}
      </p>
      <template v-if="state.backups.length">
        <hr />
        <ul>
          <li v-for="b in state.backups" :key="b.path">
            <div class="info">
              <span class="name">{{ when(b.saved) }}</span>
              <span class="when">Auto backup</span>
            </div>
            <button title="Open this backup" @click="loadBackup(b.path)">
              <RotateCcw :size="14" />
            </button>
            <button title="Show it in Finder" @click="DocService.Reveal(b.path)">
              <FolderSearch :size="14" />
            </button>
          </li>
        </ul>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.versions {
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
button {
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--quote);
}
header button,
li button {
  flex: none;
  width: 22px;
  height: 22px;
}
button:hover:not(:disabled) {
  background: var(--hover);
}
form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid var(--border);
}
input {
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: white;
  color: var(--ink);
}
form button {
  height: 28px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink);
  font-weight: 600;
}
form button:disabled {
  opacity: 0.5;
}
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
ul {
  margin: 0;
  padding: 6px 0;
  list-style: none;
}
hr {
  margin: 4px 10px;
  border: 0;
  border-top: 1px solid var(--border);
}
li {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px 4px 10px;
}
li:hover {
  background: var(--hover);
}
.info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.name,
.when {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.name {
  color: var(--ink);
  font-weight: 600;
}
.when {
  font-size: 11px;
  color: var(--muted);
}
.empty {
  margin: 12px;
  color: var(--muted);
  line-height: 1.5;
}
</style>
