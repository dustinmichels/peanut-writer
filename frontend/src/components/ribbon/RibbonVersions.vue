<script setup lang="ts">
// The ribbon's Versions tab: name a new version, and open one of the latest
// named versions or backups.
import { nextTick, useTemplateRef, watch } from "vue";
import { FileClock, Milestone } from "lucide-vue-next";
import RibbonButton from "./RibbonButton.vue";
import { saveDraft, versionDraft as draft } from "./versionDraft";
import { loadBackup, loadVersion, toggleVersions } from "@/lib/actions";
import { state } from "@/lib/store";

// How many of each the Versions tab shows; the Versions pane lists every named one.
const recent = 5;
const nameInput = useTemplateRef("nameInput");
watch(
  () => draft.naming,
  (open) => open && nextTick(() => nameInput.value?.focus()),
);

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
</script>

<template>
  <div class="group">
    <div class="row">
      <div class="pop">
        <RibbonButton
          big
          :icon="Milestone"
          label="New Version"
          title="Keep the document as it is now as a named version, with Word and PDF copies"
          :active="draft.naming"
          @click="draft.naming = !draft.naming"
        />
        <form
          v-if="draft.naming"
          class="popover name-version"
          @submit.prevent="saveDraft"
          @keydown.esc="draft.naming = false"
        >
          <input
            ref="nameInput"
            v-model="draft.name"
            type="text"
            placeholder="Name this version"
            aria-label="Version name"
            :disabled="draft.saving"
          />
          <button type="submit" :disabled="draft.saving || !draft.name.trim()">
            {{ draft.saving ? "Saving…" : "Save" }}
          </button>
        </form>
      </div>
      <RibbonButton
        big
        :icon="FileClock"
        label="All Versions"
        title="List every named version and backup beside the editor"
        :active="state.versionsOpen"
        @click="toggleVersions"
      />
    </div>
    <label>Versions</label>
  </div>
  <div class="group">
    <div class="row cards">
      <button
        v-for="v in state.versions.slice(0, recent)"
        :key="v.name"
        class="card"
        :title="`Open “${v.name}”`"
        @mousedown.prevent
        @click="loadVersion(v.name)"
      >
        <span class="card-title">{{ v.name }}</span>
        <span class="name">{{ when(v.saved) }}</span>
      </button>
      <p v-if="!state.versions.length" class="none">
        {{ state.path ? "No named versions yet" : "Save the document to keep versions" }}
      </p>
    </div>
    <label>Named</label>
  </div>
  <div class="group">
    <div class="row cards">
      <button
        v-for="b in state.backups.slice(0, recent)"
        :key="b.path"
        class="card"
        title="Open this backup"
        @mousedown.prevent
        @click="loadBackup(b.path)"
      >
        <span class="card-title">{{ when(b.saved) }}</span>
        <span class="name">Auto backup</span>
      </button>
      <p v-if="!state.backups.length" class="none">
        {{ state.path ? "No backups yet" : "Backups start once it's saved" }}
      </p>
    </div>
    <label>Backups</label>
  </div>
</template>

<style scoped src="./ribbon.css"></style>
<style scoped>
.name {
  font-size: 10.5px;
  color: var(--muted);
}
.name-version {
  display: flex;
  gap: 6px;
  padding: 8px;
}
.name-version input {
  width: 200px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: white;
  color: var(--ink);
}
.name-version button {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink);
  font-weight: 600;
}
.name-version button:disabled {
  opacity: 0.5;
}
.cards {
  min-height: 62px;
  gap: 4px;
}
.card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 124px;
  height: 58px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  text-align: left;
}
.card:hover {
  border-color: var(--shell);
}
.card-title {
  color: var(--roast);
  font-weight: 650;
}
.card-title,
.card .name {
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.none {
  margin: 0;
  padding: 0 8px;
  color: var(--muted);
  font-size: 11.5px;
  white-space: nowrap;
}
</style>
