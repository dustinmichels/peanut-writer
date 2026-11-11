<script setup lang="ts">
import { onMounted, onUnmounted, reactive, watch } from "vue";
import { DocService } from "@bindings/peanut-writer";
import type { Template } from "@bindings/peanut-writer/internal/templates/models";
import { setTemplate } from "@/lib/actions";
import { docTemplates, state } from "@/lib/store";

// Preview URLs by key: a template's id and when its files last changed, and
// for the document's own one its changes too, so a changed one is drawn again.
const previews = reactive<Record<string, string>>({});
const key = (t: Template) => `${t.id}:${t.modified}:${t.base}:${JSON.stringify(t.style)}`;
let mounted = true;

async function load() {
  // Drop the previews of templates since changed or gone.
  const keys = new Set(docTemplates.value.map(key));
  for (const [k, url] of Object.entries(previews)) {
    if (keys.has(k)) continue;
    if (url) URL.revokeObjectURL(url);
    delete previews[k];
  }
  for (const t of docTemplates.value) {
    const k = key(t);
    if (k in previews) continue;
    previews[k] = "";
    try {
      const svg = await DocService.TemplatePreview(t.id);
      // An <img> keeps each SVG's ids to itself.
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      // Unless it was dropped (or the gallery closed) meanwhile.
      if (mounted && k in previews) previews[k] = url;
      else URL.revokeObjectURL(url);
    } catch {
      // Shown as loading.
    }
  }
}
onMounted(load);
onUnmounted(() => {
  mounted = false;
  for (const url of Object.values(previews)) if (url) URL.revokeObjectURL(url);
});
watch(() => docTemplates.value.map(key).join("\n"), load);
</script>

<template>
  <div class="gallery">
    <template v-for="t in docTemplates" :key="t.id">
      <button
        class="card"
        :class="{ active: state.template === t.id }"
        :title="t.description || t.name"
        @mousedown.prevent
        @click="setTemplate(t.id)"
      >
        <div class="thumb">
          <img v-if="previews[key(t)]" :src="previews[key(t)]" alt="" />
          <div v-else class="loading" />
        </div>
        <span>{{ t.name }}</span>
      </button>
      <!-- The document's own template, set apart from the rest. -->
      <div v-if="t.id === 'custom'" class="separator" />
    </template>
  </div>
</template>

<style scoped>
.gallery {
  display: flex;
  gap: 8px;
  height: 100%;
  align-items: center;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px 6px 3px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  font-size: 11px;
}
.card:hover {
  background: var(--hover);
}
.card.active {
  background: var(--active);
  border-color: rgba(193, 105, 79, 0.35);
}
/* A long name is cut short (pointing at it shows it, if it has no description). */
.card span {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.separator {
  align-self: stretch;
  flex: none;
  width: 1px;
  margin: 6px 2px;
  background: var(--border);
}
.thumb {
  width: 54px;
  height: 70px;
  overflow: hidden;
  border-radius: 3px;
  background: white;
  box-shadow: 0 1px 4px rgba(90, 50, 20, 0.22);
}
.thumb img {
  display: block;
  width: 54px;
  height: auto;
}
.loading {
  height: 100%;
  background: linear-gradient(90deg, #fff, #f6ece0, #fff);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite linear;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
