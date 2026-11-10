<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ImageUp, Trash2 } from "lucide-vue-next";
import Modal from "../Modal.vue";
import { DocService } from "../../../bindings/peanut-writer";
import { applyFigure, deleteBlock, replacePicture } from "../../lib/actions";
import { type Item, uniqueLabel } from "../../lib/markdown";
import { state } from "../../lib/store";

const props = defineProps<{ item: Item }>();
const emit = defineEmits<{ close: [] }>();

const src = ref(props.item.src ?? "");
const caption = ref(props.item.caption);
const label = ref(props.item.label);
const autoWidth = ref(!props.item.width);
const width = ref(props.item.width || 70);
const preview = ref("");
// A new figure's label follows its caption until it's edited by hand.
const labelTouched = ref(!!props.item.label);

watch(src, async (s) => (preview.value = s ? await DocService.ImageURL(s) : ""), { immediate: true });
watch(caption, (c) => {
  if (!labelTouched.value) label.value = c.trim() ? uniqueLabel("fig", c, state.items, props.item.label) : "";
});

const refs = computed(() => {
  if (!props.item.label) return 0;
  return state.content.split("@" + props.item.label).length - 1;
});

const captionInput = ref<HTMLInputElement>();
onMounted(() => captionInput.value?.focus());

async function replace() {
  const s = await replacePicture();
  if (s) src.value = s;
}

function submit() {
  applyFigure(props.item, {
    src: src.value,
    caption: caption.value.trim(),
    label: label.value.trim(),
    width: autoWidth.value ? 0 : width.value,
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
    <div class="pic">
      <div class="frame" :style="{ width: autoWidth ? 'auto' : `${width}%` }">
        <img v-if="preview" :src="preview" alt="" />
        <div v-else class="missing">Picture not found: {{ src }}</div>
      </div>
    </div>
    <label class="field">
      Caption
      <input ref="captionInput" v-model="caption" placeholder="Describe the picture" />
      <span class="hint">Shown under the picture as “Figure {{ item.number }}: …”. *Italic* and **bold** work here.</span>
    </label>
    <div class="cols">
      <label class="field">
        Reference name
        <input v-model="label" placeholder="fig:name" @input="labelTouched = true" />
        <span class="hint">
          {{ refs ? `Referenced ${refs} ${refs === 1 ? "time" : "times"}; renaming updates them.` : "Used by cross-references." }}
        </span>
      </label>
      <div class="field">
        Size
        <div class="size">
          <label class="check"><input v-model="autoWidth" type="checkbox" /> Natural</label>
          <input v-model.number="width" type="range" min="10" max="100" step="5" :disabled="autoWidth" />
          <span class="pct">{{ autoWidth ? "" : `${width}%` }}</span>
        </div>
        <span class="hint">Of the text width.</span>
      </div>
    </div>
    <template #footer>
      <button type="button" class="btn danger" @click="remove"><Trash2 :size="14" /> Delete</button>
      <button type="button" class="btn" @click="replace"><ImageUp :size="14" /> Replace picture…</button>
      <span style="flex: 1" />
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
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
</style>
