<script setup lang="ts">
import { Browser } from "@wailsio/runtime";
import Modal from "@/components/ui/Modal.vue";
import { state } from "@/lib/store";
import { docsUrl, repoUrl } from "@/lib/actions";

const emit = defineEmits<{ close: [] }>();
const links = [
  { label: "Documentation", url: docsUrl },
  { label: "Source on GitHub", url: repoUrl },
];
</script>

<template>
  <Modal title="About Peanut Writer" @close="emit('close')" @submit="emit('close')">
    <div class="about">
      <img src="/peanut.svg" alt="" />
      <h3>Peanut Writer</h3>
      <p class="version">Version {{ state.version }}</p>
      <p>A friendly writer for documents with figures, tables and cross-references.</p>
      <p>Made by Dustin Michels.</p>
      <ul>
        <li v-for="l in links" :key="l.url">
          <a :href="l.url" @click.prevent="Browser.OpenURL(l.url)">{{ l.label }}</a>
        </li>
      </ul>
    </div>
    <template #footer>
      <button type="submit" class="btn primary">Close</button>
    </template>
  </Modal>
</template>

<style scoped>
.about {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
}
img {
  width: 56px;
  height: 56px;
}
h3 {
  margin: 4px 0 0;
}
p {
  margin: 0;
}
.version {
  color: var(--quote);
  user-select: text;
}
ul {
  display: flex;
  gap: 16px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
a {
  color: var(--roast);
}
</style>
