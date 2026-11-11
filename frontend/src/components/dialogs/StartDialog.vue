<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from "vue";
import { Browser } from "@wailsio/runtime";
import { BookOpen, FilePlus, FolderOpen, Github, Sparkles } from "lucide-vue-next";
import type { RecentFile } from "@bindings/peanut-writer/models";
import Modal from "@/components/ui/Modal.vue";
import RecentList from "@/components/ui/RecentList.vue";
import { docsUrl, newDoc, openDoc, openRecent, openWelcome, repoUrl } from "@/lib/actions";

// What the app offers on opening: a new document, a recent one, another one,
// or the sample (the welcome guide). Closing it leaves a blank, untitled one.
const props = defineProps<{ files: RecentFile[] }>();
const emit = defineEmits<{ close: [] }>();
const files = ref(props.files);
const create = useTemplateRef("create");

// The recent list focuses its first document; without one, Create New.
onMounted(() => {
  if (!files.value.length) create.value?.focus();
});

function then(action: () => unknown) {
  emit("close");
  action();
}
</script>

<template>
  <Modal title="Welcome to Peanut Writer" @close="emit('close')" @submit="then(newDoc)">
    <div class="actions">
      <button ref="create" type="button" class="action" @click="then(newDoc)">
        <FilePlus :size="22" />
        <b>Create New</b>
        <small>Name it and choose where it goes</small>
      </button>
      <button type="button" class="action" @click="then(openDoc)">
        <FolderOpen :size="22" />
        <b>Open…</b>
        <small>A document or a Markdown file</small>
      </button>
      <button type="button" class="action" @click="then(openWelcome)">
        <Sparkles :size="22" />
        <b>Open Sample</b>
        <small>The welcome guide, to poke at</small>
      </button>
    </div>
    <section v-if="files.length">
      <h3>Open Recent</h3>
      <RecentList v-model="files" @open="(p) => then(() => openRecent(p))" />
    </section>
    <template #footer>
      <nav class="links">
        <a :href="docsUrl" @click.prevent="Browser.OpenURL(docsUrl)">
          <BookOpen :size="14" />Documentation
        </a>
        <a :href="repoUrl" @click.prevent="Browser.OpenURL(repoUrl)">
          <Github :size="14" />GitHub
        </a>
      </nav>
      <button type="button" class="btn" @click="emit('close')">Blank Document</button>
    </template>
  </Modal>
</template>

<style scoped>
.actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: transparent;
  color: var(--accent);
  text-align: center;
}
.action:hover,
.action:focus-visible {
  background: var(--hover);
  outline: none;
}
.action b {
  margin-top: 4px;
  color: var(--roast);
  font-weight: 600;
}
.action small {
  color: var(--muted);
  font-size: 12px;
}
h3 {
  margin: 0 0 6px;
  color: var(--quote);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.links {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-right: auto;
}
.links a {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--roast);
  font-size: 13px;
}
</style>
