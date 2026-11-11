<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import Modal from "../Modal.vue";
import EyeToggle from "./EyeToggle.vue";
import { setMeta } from "../../lib/actions";
import { readFrontMatter } from "../../lib/markdown";
import { state } from "../../lib/store";

// The properties the document can show; `hide` names those it doesn't.
const showable: readonly string[] = [
  "title",
  "subtitle",
  "author",
  "topic",
  "date",
  "header",
  "abstract",
];

const emit = defineEmits<{ close: [] }>();
const meta = reactive(readFrontMatter(state.content).meta);
if (!meta.template) meta.template = "classic";
const hideNames = meta.hide
  .split(",")
  .map((k) => k.trim().toLowerCase())
  .filter(Boolean);
const hidden = reactive(new Set(hideNames.filter((k) => showable.includes(k))));
// Names this dialog doesn't know are kept as they are.
const otherHidden = hideNames.filter((k) => !showable.includes(k));
const first = ref<HTMLInputElement>();
onMounted(() => first.value?.focus());

function toggle(k: string) {
  if (!hidden.delete(k)) hidden.add(k);
}

function submit() {
  setMeta({
    ...meta,
    template: meta.template === "classic" ? "" : meta.template,
    hide: [...showable.filter((k) => hidden.has(k)), ...otherHidden].join(", "),
  });
  emit("close");
}
</script>

<template>
  <Modal class="props" title="Document Properties" @close="emit('close')" @submit="submit">
    <label class="field" :class="{ off: hidden.has('title') }">
      Title
      <span class="boxed">
        <input ref="first" v-model="meta.title" placeholder="Shown at the top of the first page" />
        <EyeToggle :hidden="hidden.has('title')" @toggle="toggle('title')" />
      </span>
    </label>
    <label class="field" :class="{ off: hidden.has('subtitle') }">
      Subtitle
      <span class="boxed">
        <input v-model="meta.subtitle" />
        <EyeToggle :hidden="hidden.has('subtitle')" @toggle="toggle('subtitle')" />
      </span>
    </label>
    <div class="cols">
      <label class="field" :class="{ off: hidden.has('author') }">
        Author
        <span class="boxed">
          <input v-model="meta.author" />
          <EyeToggle :hidden="hidden.has('author')" @toggle="toggle('author')" />
        </span>
      </label>
      <label class="field" :class="{ off: hidden.has('date') }">
        Date
        <div class="date">
          <span class="boxed">
            <input v-model="meta.date" placeholder="e.g. March 3, 2026" />
            <EyeToggle :hidden="hidden.has('date')" @toggle="toggle('date')" />
          </span>
          <button
            type="button"
            class="btn"
            title="Always today's date"
            @click="meta.date = 'today'"
          >
            Today
          </button>
        </div>
      </label>
    </div>
    <label class="field" :class="{ off: hidden.has('topic') }">
      Topic
      <span class="boxed">
        <input v-model="meta.topic" placeholder="e.g. Essay 2: The French Revolution (optional)" />
        <EyeToggle :hidden="hidden.has('topic')" @toggle="toggle('topic')" />
      </span>
      <span class="hint">Templates show it beside the author and date.</span>
    </label>
    <label class="field" :class="{ off: hidden.has('header') }">
      Header/footer
      <span class="boxed">
        <input v-model="meta.header" placeholder="e.g. HIST 101, Acme Corp., Project Atlas" />
        <EyeToggle :hidden="hidden.has('header')" @toggle="toggle('header')" />
      </span>
      <span class="hint"
        >A class, team, project or company. Templates show it in the page header or footer.</span
      >
    </label>
    <label class="field" :class="{ off: hidden.has('abstract') }">
      Abstract
      <span class="boxed">
        <textarea v-model="meta.abstract" rows="4" placeholder="A short summary (optional)" />
        <EyeToggle :hidden="hidden.has('abstract')" @toggle="toggle('abstract')" />
      </span>
      <span class="hint">One paragraph.</span>
    </label>
    <label class="field">
      Template
      <select v-model="meta.template">
        <option v-for="t in state.templates" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
    </label>
    <template #footer>
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="submit" class="btn primary">Done</button>
    </template>
  </Modal>
</template>

<style scoped>
/* Wide enough that the date box keeps room beside its Today button. */
.props :deep(.modal) {
  width: min(620px, calc(100vw - 40px));
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.date {
  display: flex;
  gap: 6px;
}
.date .boxed {
  flex: 1;
  min-width: 0;
}
textarea {
  resize: vertical;
}
/* The eye toggle sits inside the right edge of its text box. */
.boxed {
  position: relative;
  display: flex;
}
.boxed input,
.boxed textarea {
  flex: 1;
  min-width: 0;
  padding-right: 34px;
}
.boxed .eye {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
}
.boxed textarea + .eye {
  top: 6px;
  transform: none;
}
.off input,
.off textarea {
  color: var(--muted);
}
</style>
