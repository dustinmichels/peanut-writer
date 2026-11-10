<script setup lang="ts">
import { onMounted, reactive, watch } from "vue";
import { DocService } from "../../bindings/peanut-writer";
import { setTemplate } from "../lib/actions";
import { state } from "../lib/store";

const previews = reactive<Record<string, string>>({});

async function load() {
  for (const t of state.templates) {
    if (previews[t.id]) continue;
    try {
      const svg = await DocService.TemplatePreview(t.id);
      // An <img> keeps each SVG's ids to itself.
      previews[t.id] = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    } catch {
      previews[t.id] = "";
    }
  }
}
onMounted(load);
watch(() => state.templates.length, load);
</script>

<template>
  <div class="gallery">
    <button
      v-for="t in state.templates"
      :key="t.id"
      class="card"
      :class="{ active: state.template === t.id }"
      :title="t.description"
      @mousedown.prevent
      @click="setTemplate(t.id)"
    >
      <div class="thumb">
        <img v-if="previews[t.id]" :src="previews[t.id]" alt="" />
        <div v-else class="loading" />
      </div>
      <span>{{ t.name }}</span>
    </button>
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
