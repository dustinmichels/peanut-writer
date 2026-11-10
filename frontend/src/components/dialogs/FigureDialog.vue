<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  ImageUp,
  Trash2,
  X,
} from "lucide-vue-next";
import Modal from "../Modal.vue";
import { DocService } from "../../../bindings/peanut-writer";
import { addPictures, applyFigure, deleteBlock, replacePicture } from "../../lib/actions";
import { type Item, type Picture, type Position, uniqueLabel } from "../../lib/markdown";
import { state } from "../../lib/store";

const props = defineProps<{ item: Item }>();
const emit = defineEmits<{ close: [] }>();

const pictures = ref<Picture[]>((props.item.pictures ?? []).map((p) => ({ ...p })));
const grid = computed(() => pictures.value.length > 1);
const columns = ref(props.item.columns || Math.min(pictures.value.length, 3));
const caption = ref(props.item.caption);
const label = ref(props.item.label);
// 0 is the natural size for one picture, the full width for a grid.
const autoWidth = ref(!props.item.width);
const width = ref(props.item.width || 70);
const position = ref<Position>(props.item.position ?? "");
const previews = reactive(new Map<string, string>());
// A new figure's label follows its caption until it's edited by hand.
const labelTouched = ref(!!props.item.label);

watch(
  pictures,
  async (ps) => {
    for (const { src } of ps)
      if (!previews.has(src)) previews.set(src, src ? await DocService.ImageURL(src) : "");
  },
  { immediate: true, deep: true },
);
watch(caption, (c) => {
  if (!labelTouched.value)
    label.value = c.trim() ? uniqueLabel("fig", c, state.items, props.item.label) : "";
});
// Columns stay within the number of pictures; a picture added to a full row
// starts a new one.
watch(
  () => pictures.value.length,
  (n, was) => {
    if (was === 1 && n > 1) columns.value = Math.min(n, 3);
    columns.value = Math.min(Math.max(columns.value, 1), n);
  },
);

const refs = computed(() => {
  if (!props.item.label) return 0;
  return state.content.split("@" + props.item.label).length - 1;
});

const captionInput = ref<HTMLInputElement>();
onMounted(() => captionInput.value?.focus());

async function replace(i: number) {
  const s = await replacePicture();
  if (s) pictures.value[i] = { src: s, alt: pictures.value[i].alt };
}

async function add() {
  const srcs = await addPictures();
  pictures.value.push(...srcs.map((src) => ({ src, alt: "" })));
}

function move(i: number, by: number) {
  const ps = pictures.value;
  [ps[i], ps[i + by]] = [ps[i + by], ps[i]];
}

function submit() {
  applyFigure(props.item, {
    pictures: pictures.value,
    caption: caption.value.trim(),
    label: label.value.trim(),
    width: autoWidth.value ? 0 : width.value,
    position: position.value,
    columns: columns.value,
  });
  emit("close");
}

function remove() {
  deleteBlock(props.item.from, props.item.to);
  emit("close");
}
</script>

<template>
  <Modal :title="`Figure ${item.number}`" @close="emit('close')" @submit="submit">
    <div class="pic" :class="position">
      <div class="frame" :style="{ width: autoWidth ? (grid ? '100%' : 'auto') : `${width}%` }">
        <div
          v-if="grid"
          class="grid"
          :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
        >
          <div v-for="(p, i) in pictures" :key="i" class="cell">
            <img v-if="previews.get(p.src)" :src="previews.get(p.src)" :alt="p.alt" />
            <div v-else class="missing">Not found: {{ p.src }}</div>
            <div class="cell-tools">
              <button type="button" title="Move earlier" :disabled="i === 0" @click="move(i, -1)">
                <ChevronLeft :size="14" />
              </button>
              <button
                type="button"
                title="Move later"
                :disabled="i === pictures.length - 1"
                @click="move(i, 1)"
              >
                <ChevronRight :size="14" />
              </button>
              <button type="button" title="Replace picture" @click="replace(i)">
                <ImageUp :size="14" />
              </button>
              <button type="button" title="Remove from the grid" @click="pictures.splice(i, 1)">
                <X :size="14" />
              </button>
            </div>
          </div>
        </div>
        <template v-else>
          <img v-if="previews.get(pictures[0].src)" :src="previews.get(pictures[0].src)" alt="" />
          <div v-else class="missing">Picture not found: {{ pictures[0].src }}</div>
        </template>
      </div>
    </div>
    <label class="field">
      Caption
      <input ref="captionInput" v-model="caption" placeholder="Describe the picture" />
      <span class="hint"
        >Shown under the {{ grid ? "pictures" : "picture" }} as “Figure {{ item.number }}: …”.
        *Italic* and **bold** work here.</span
      >
    </label>
    <div class="cols">
      <label class="field">
        Reference name
        <input v-model="label" placeholder="fig:name" @input="labelTouched = true" />
        <span class="hint">
          {{
            refs
              ? `Referenced ${refs} ${refs === 1 ? "time" : "times"}; renaming updates them.`
              : "Used by cross-references."
          }}
        </span>
      </label>
      <div class="field">
        Size
        <div class="size">
          <label class="check"
            ><input v-model="autoWidth" type="checkbox" />
            {{ grid ? "Full width" : "Natural" }}</label
          >
          <input
            v-model.number="width"
            type="range"
            min="10"
            max="100"
            step="5"
            :disabled="autoWidth"
          />
          <span class="pct">{{ autoWidth ? "" : `${width}%` }}</span>
        </div>
        <span class="hint"
          >Of the text width. You can also drag the {{ grid ? "grid's" : "picture's" }} corner in
          the editor.</span
        >
      </div>
    </div>
    <div class="cols">
      <div class="field">
        Position
        <span class="group">
          <button
            type="button"
            :class="{ on: position === 'left' }"
            title="Left"
            @click="position = 'left'"
          >
            <AlignLeft :size="15" />
          </button>
          <button
            type="button"
            :class="{ on: position === '' }"
            title="Centered"
            @click="position = ''"
          >
            <AlignCenter :size="15" />
          </button>
          <button
            type="button"
            :class="{ on: position === 'right' }"
            title="Right"
            @click="position = 'right'"
          >
            <AlignRight :size="15" />
          </button>
        </span>
      </div>
      <label v-if="grid" class="field">
        Columns
        <input v-model.number="columns" type="number" min="1" :max="pictures.length" />
        <span class="hint">Pictures to a row.</span>
      </label>
    </div>
    <template #footer>
      <button type="button" class="btn danger icon" title="Delete figure" @click="remove">
        <Trash2 :size="14" />
      </button>
      <button v-if="!grid" type="button" class="btn" title="Replace picture" @click="replace(0)">
        <ImageUp :size="14" /> Replace…
      </button>
      <button
        type="button"
        class="btn"
        :title="grid ? 'Add pictures to the grid' : 'Add pictures beside this one, as a grid'"
        @click="add"
      >
        <ImagePlus :size="14" /> Add more…
      </button>
      <button type="button" class="btn" style="margin-left: auto" @click="emit('close')">
        Cancel
      </button>
      <button type="submit" class="btn primary">Done</button>
    </template>
  </Modal>
</template>

<style scoped>
.pic {
  display: flex;
  justify-content: center;
  padding: 12px;
  border-radius: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
}
.pic.left {
  justify-content: flex-start;
}
.pic.right {
  justify-content: flex-end;
}
.frame {
  max-width: 100%;
  transition: width 0.15s;
}
.frame img {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: contain;
}
.grid {
  display: grid;
  gap: 8px;
  align-items: center;
}
.cell {
  position: relative;
}
.grid img {
  max-height: 140px;
}
.cell .missing {
  padding: 16px 6px;
  font-size: 11.5px;
  text-align: center;
  word-break: break-all;
}
.cell-tools {
  position: absolute;
  top: 4px;
  left: 50%;
  display: flex;
  gap: 1px;
  padding: 2px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  transform: translateX(-50%);
  opacity: 0;
  transition: opacity 0.12s;
}
.cell:hover .cell-tools {
  opacity: 1;
}
.cell-tools button {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--accent-ink);
}
.cell-tools button:hover:not(:disabled) {
  background: var(--hover);
}
.cell-tools button:disabled {
  opacity: 0.35;
}
.missing {
  padding: 30px;
  color: var(--muted);
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.size {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
}
.size input[type="range"] {
  flex: 1;
  accent-color: var(--accent);
}
.check {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  font-weight: 400;
  color: var(--ink);
}
.pct {
  width: 36px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  font-weight: 400;
}
.group {
  display: inline-flex;
  align-self: flex-start;
  gap: 1px;
  padding: 2px 4px;
  border-radius: 9px;
  background: var(--panel);
  border: 1px solid var(--border);
}
.group button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--accent-ink);
}
.group button:hover {
  background: var(--hover);
}
.group button.on {
  background: var(--active);
}
</style>
