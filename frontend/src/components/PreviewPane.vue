<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AlertTriangle } from "lucide-vue-next";
import { state } from "../lib/store";

interface Page {
  url: string;
  width: number; // points
  height: number;
}

const emit = defineEmits<{
  // pick: a click on a page, at source line `line`, a fraction t of the way
  // to line `next` (0 when there's no next).
  pick: [line: number, next: number, t: number];
}>();

const scroller = ref<HTMLElement>();
const pages = ref<Page[]>([]);
const paneWidth = ref(600);

// Where each marked block is in the preview, by source line: its page, and
// the top left of its first line in points from the page's top left.
interface Mark {
  page: number;
  x: number;
  y: number;
}
let marks = new Map<number, Mark>();

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
    marks = findMarks(svgs);
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

// applyTransform maps (x, y) through an SVG transform attribute.
function applyTransform(t: string, x: number, y: number): [number, number] {
  const fns = [...t.matchAll(/(\w+)\(([^)]*)\)/g)];
  for (let i = fns.length - 1; i >= 0; i--) {
    const [, name, args] = fns[i];
    const v = args
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (name === "translate") [x, y] = [x + v[0], y + (v[1] ?? 0)];
    else if (name === "scale") [x, y] = [x * v[0], y * (v[1] ?? v[0])];
    else if (name === "matrix") [x, y] = [v[0] * x + v[2] * y + v[4], v[1] * x + v[3] * y + v[5]];
  }
  return [x, y];
}

// findMarks locates the marked blocks in the pages: the preview marks each
// with an invisible `peanut:<line>` link (see peanut.typ).
function findMarks(svgs: string[]): Map<number, Mark> {
  const found = new Map<number, Mark>();
  svgs.forEach((src, page) => {
    if (!src.includes('href="peanut:')) return;
    const svg = new DOMParser().parseFromString(src, "image/svg+xml");
    for (const a of svg.querySelectorAll('a[href^="peanut:"]')) {
      const line = Number(a.getAttribute("href")!.slice("peanut:".length));
      if (found.has(line)) continue;
      let x = 0;
      let y = 0;
      for (let el: Element | null = a; el; el = el.parentElement) {
        [x, y] = applyTransform(el.getAttribute("transform") ?? "", x, y);
      }
      found.set(line, { page, x, y });
    }
  });
  return found;
}

// headingTops maps each heading's source line to the scrollTop that shows
// the heading at the top of the preview.
function headingTops(): Map<number, number> {
  const tops = new Map<number, number>();
  const els = scroller.value?.querySelectorAll<HTMLElement>(".page");
  if (!els) return tops;
  for (const h of state.outline) {
    const at = marks.get(h.line);
    const page = at && els[at.page];
    // Leave a margin above the heading.
    if (page) tops.set(h.line, page.offsetTop + (at.y - 24) * PX * zoom.value);
  }
  return tops;
}

// clicked finds where in the source a click on page i is. The block it's in
// is the last one (in source order) starting before it: on an earlier page,
// or above and left of it (in an earlier column, a block lower down is still
// before it, but in the same column one to its right is a nested item or in
// the next column). The click is then as far between that block's line and
// the next block's as it is down the page between them.
function clicked(e: MouseEvent, i: number) {
  const els = scroller.value?.querySelectorAll<HTMLElement>(".page");
  const el = els?.[i];
  if (!el) return;
  const box = el.getBoundingClientRect();
  const scale = PX * zoom.value;
  const x = (e.clientX - box.left) / scale;
  const y = (e.clientY - box.top) / scale;
  let line = 0;
  for (const [l, m] of marks) {
    if (l > line && (m.page < i || (m.page === i && m.y <= y && m.x <= x))) line = l;
  }
  if (!line) return emit("pick", 1, 0, 0);
  let next = 0;
  for (const l of marks.keys()) if (l > line && (!next || l < next)) next = l;
  // Positions down the whole column of pages, in px.
  const down = (m: Mark) => els[m.page].offsetTop + m.y * scale;
  const from = down(marks.get(line)!);
  const span = next ? down(marks.get(next)!) - from : 0;
  const t = span > 0 ? Math.min(1, Math.max(0, (el.offsetTop + y * scale - from) / span)) : 0;
  emit("pick", line, next, t);
}
defineExpose({ scroller, headingTops });
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
        @click="clicked($event, i)"
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
