<script setup lang="ts">
// EquationDialog edits a display equation's TeX and name, drawing it as it's
// typed; with no equation, it inserts a new one.
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from "vue";
import { Trash2 } from "lucide-vue-next";
import Modal from "@/components/ui/Modal.vue";
import { applyEquation, deleteBlock, equationURL, refLabel } from "@/lib/actions";
import type { DisplayEquation } from "@/lib/markdown";
import { state } from "@/lib/store";

const props = defineProps<{
  eq?: DisplayEquation;
  tex?: string;
  replace?: { from: number; to: number };
}>();
const emit = defineEmits<{ close: [] }>();

const tex = ref(props.eq?.tex ?? props.tex ?? "");
const label = ref(props.eq?.label ?? "");
const number = computed(
  () =>
    state.items.find((x) => x.kind === "equation" && props.eq && x.from === props.eq.from)
      ?.number ?? 0,
);
const title = computed(() =>
  !props.eq ? "Insert Equation" : number.value ? `Equation ${number.value}` : "Equation",
);

// The equation drawn, a moment after typing stops: "" while there's none,
// null when it can't be.
const drawing = ref<string | null>("");
let timer = 0;
watch(
  tex,
  (t) => {
    clearTimeout(timer);
    const want = t.trim();
    if (!want) {
      drawing.value = "";
      return;
    }
    timer = window.setTimeout(async () => {
      const url = await equationURL(want);
      if (tex.value.trim() === want) drawing.value = url || null;
    }, 300);
  },
  { immediate: true },
);

const input = useTemplateRef("input");
onMounted(() => input.value?.focus());

// The buttons over the LaTeX, in groups. Each puts `before` and `after`
// around the selection, the cursor after the selection (in the first
// braces, when nothing is selected).
interface Snippet {
  label: string;
  title: string;
  before: string;
  after?: string;
}
const snippets: Snippet[][] = [
  [
    { label: "a⁄b", title: "Fraction", before: "\\frac{", after: "}{}" },
    { label: "√x", title: "Square root", before: "\\sqrt{", after: "}" },
    { label: "xⁿ", title: "Superscript", before: "^{", after: "}" },
    { label: "xₙ", title: "Subscript", before: "_{", after: "}" },
    { label: "( )", title: "Brackets that grow", before: "\\left( ", after: " \\right)" },
  ],
  [
    { label: "∑", title: "Sum", before: "\\sum_{i=1}^{n} " },
    { label: "∫", title: "Integral", before: "\\int_{a}^{b} ", after: " \\,dx" },
    { label: "lim", title: "Limit", before: "\\lim_{x \\to \\infty} " },
    {
      label: "[ ]",
      title: "Matrix",
      before: "\\begin{bmatrix} ",
      after: " & b \\\\ c & d \\end{bmatrix}",
    },
  ],
  [
    { label: "α", title: "alpha", before: "\\alpha " },
    { label: "β", title: "beta", before: "\\beta " },
    { label: "θ", title: "theta", before: "\\theta " },
    { label: "π", title: "pi", before: "\\pi " },
    { label: "σ", title: "sigma", before: "\\sigma " },
    { label: "Δ", title: "Delta", before: "\\Delta " },
  ],
  [
    { label: "±", title: "Plus or minus", before: "\\pm " },
    { label: "×", title: "Times", before: "\\times " },
    { label: "·", title: "Dot", before: "\\cdot " },
    { label: "≤", title: "Less than or equal", before: "\\leq " },
    { label: "≥", title: "Greater than or equal", before: "\\geq " },
    { label: "≠", title: "Not equal", before: "\\neq " },
    { label: "≈", title: "Approximately", before: "\\approx " },
    { label: "→", title: "Arrow", before: "\\to " },
    { label: "∞", title: "Infinity", before: "\\infty " },
  ],
];

async function put(s: Snippet) {
  const el = input.value;
  if (!el) return;
  const { selectionStart: from, selectionEnd: to } = el;
  const sel = tex.value.slice(from, to);
  tex.value = tex.value.slice(0, from) + s.before + sel + (s.after ?? "") + tex.value.slice(to);
  await nextTick();
  const at = from + s.before.length + sel.length;
  el.focus();
  el.setSelectionRange(at, at);
}

function submit() {
  if (!tex.value.trim()) {
    remove();
    return;
  }
  // A name is an `eq:` label, which numbers the equation.
  applyEquation(props.eq, tex.value, refLabel("eq", label.value), props.replace);
  emit("close");
}
function remove() {
  if (props.eq) deleteBlock(props.eq.from, props.eq.to);
  emit("close");
}
</script>

<template>
  <Modal :title="title" wide @close="emit('close')" @submit="submit">
    <div class="field">
      LaTeX
      <div class="tools">
        <span v-for="(group, g) in snippets" :key="g" class="group">
          <button
            v-for="s in group"
            :key="s.title"
            type="button"
            :title="`${s.title}: ${s.before.trim()}${s.after ? '…' + s.after.trim() : ''}`"
            @mousedown.prevent
            @click="put(s)"
          >
            {{ s.label }}
          </button>
        </span>
      </div>
      <textarea
        ref="input"
        v-model="tex"
        rows="4"
        spellcheck="false"
        placeholder="E = mc^2"
      ></textarea>
      <span class="hint">Return starts a new line; ⌘Return is done.</span>
    </div>

    <div class="drawing" :class="{ bad: drawing === null }">
      <img v-if="drawing" :src="drawing" :alt="tex" />
      <span v-else-if="drawing === null">This LaTeX can't be read.</span>
      <span v-else class="empty">The equation shows here.</span>
      <span v-if="number && label" class="no">({{ number }})</span>
    </div>

    <label class="field small">
      Reference name
      <input v-model="label" placeholder="eq:name" spellcheck="false" />
      <span class="hint">Named, it's numbered and can be referred to.</span>
    </label>

    <template #footer>
      <button v-if="eq" type="button" class="btn danger" @click="remove">
        <Trash2 :size="14" /> Delete equation
      </button>
      <span style="flex: 1" />
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="submit" class="btn primary">{{ eq ? "Done" : "Insert" }}</button>
    </template>
  </Modal>
</template>

<style scoped>
textarea {
  resize: vertical;
  font-family: var(--mono);
  font-size: 13px;
}
.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.group {
  display: inline-flex;
  gap: 1px;
  padding: 2px;
  border-radius: 9px;
  background: var(--panel);
  border: 1px solid var(--border);
}
.group button {
  min-width: 28px;
  height: 26px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--accent-ink);
  font-family: "Times New Roman", serif;
  font-size: 15px;
  font-weight: 400;
}
.group button:hover {
  background: var(--hover);
}
.drawing {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 72px;
  padding: 12px 48px;
  border-radius: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  overflow: auto;
}
.drawing img {
  display: block;
  max-width: 100%;
}
.drawing .empty {
  color: var(--muted);
}
.drawing.bad {
  color: var(--danger);
}
.no {
  position: absolute;
  right: 12px;
}
.small {
  max-width: 280px;
}
</style>
