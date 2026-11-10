<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AlertTriangle } from "lucide-vue-next";
import { state } from "../lib/store";

interface Page {
  url: string;
  width: number; // points
  height: number;
}

const scroller = ref<HTMLElement>();
const pages = ref<Page[]>([]);
const paneWidth = ref(600);

// Pages are shown as images: each page's SVG keeps its ids to itself, and
// swapping a whole set at once doesn't flicker.
watch(
  () => state.pages,
  (svgs) => {
    const old = pages.value;
    pages.value = svgs.map((svg) => {
      const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg.slice(0, 300));
      return {
        url: URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })),
        width: m ? parseFloat(m[1]) : 612,
        height: m ? parseFloat(m[2]) : 792,
      };
    });
    // Let the new images load before dropping the old ones.
    setTimeout(() => old.forEach((p) => URL.revokeObjectURL(p.url)), 1000);
  },
);

const PX = 96 / 72;
const fit = computed(() => {
  const w = pages.value[0]?.width ?? 612;
  return Math.max(0.3, Math.min(2, (paneWidth.value - 56) / (w * PX)));
});
watch(fit, (f) => (state.fitZoom = f), { immediate: true });
const zoom = computed(() => state.zoom || fit.value);

let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (paneWidth.value = e.contentRect.width));
  ro.observe(scroller.value!);
});
onBeforeUnmount(() => {
  ro?.disconnect();
  pages.value.forEach((p) => URL.revokeObjectURL(p.url));
});
</script>

<template>
  <section ref="scroller" class="preview">
    <div v-if="state.typstError" class="banner error">
      <AlertTriangle :size="16" />
      <div>
        <b>The preview needs Typst.</b>
        <div>{{ state.typstError }}</div>
      </div>
    </div>
    <div v-else-if="state.renderError" class="banner">
      <AlertTriangle :size="16" />
      <div>
        <b>Peanut couldn't typeset the latest changes.</b>
        <pre>{{ state.renderError }}</pre>
      </div>
    </div>
    <div class="pages">
      <div
        v-for="(p, i) in pages"
        :key="i"
        class="page"
        :style="{ width: `${p.width * PX * zoom}px`, height: `${p.height * PX * zoom}px` }"
      >
        <img :src="p.url" :alt="`Page ${i + 1}`" draggable="false" />
      </div>
      <div v-if="!pages.length && !state.renderError && !state.typstError" class="empty">
        <img src="/peanut.svg" alt="" />
        <span>Typesetting…</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.preview {
  position: relative;
  min-width: 0;
  overflow: auto;
  background: radial-gradient(circle at 50% 0, #efe7dc, var(--canvas));
}
.pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 24px 28px 48px;
  min-width: min-content;
}
.page {
  flex: none;
  background: white;
  box-shadow:
    0 1px 2px rgba(60, 35, 15, 0.12),
    0 8px 24px -6px rgba(60, 35, 15, 0.2);
}
.page img {
  display: block;
  width: 100%;
  height: 100%;
}
.banner {
  position: sticky;
  top: 10px;
  z-index: 5;
  display: flex;
  gap: 10px;
  margin: 10px 16px 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: #fff6e5;
  border: 1px solid #f0d49a;
  color: #7a5212;
  box-shadow: var(--shadow);
}
.banner.error {
  background: #fdecea;
  border-color: #f2b8ac;
  color: var(--danger);
}
.banner svg {
  flex: none;
  margin-top: 2px;
}
.banner pre {
  margin: 4px 0 0;
  white-space: pre-wrap;
  font-family: var(--mono);
  font-size: 11.5px;
  max-height: 120px;
  overflow: auto;
  user-select: text;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-top: 25vh;
  font-family: var(--rounded);
  color: var(--muted);
}
.empty img {
  width: 48px;
  animation: wobble 1s ease-in-out infinite alternate;
}
@keyframes wobble {
  from {
    transform: rotate(-8deg);
  }
  to {
    transform: rotate(8deg);
  }
}
</style>
