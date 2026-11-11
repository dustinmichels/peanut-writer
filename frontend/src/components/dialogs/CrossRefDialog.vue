<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Check, Image, Sigma, Table, Unlink } from "lucide-vue-next";
import Modal from "../Modal.vue";
import { insertCrossRef, unlinkCrossRef } from "../../lib/actions";
import { type Item, type Kind, kindName, plain, type RefAt } from "../../lib/markdown";
import { state } from "../../lib/store";

// With `at`, the dialog changes the reference there instead of inserting one.
const props = defineProps<{ at?: RefAt }>();
const emit = defineEmits<{ close: [] }>();
const kinds = [
  { id: "all", label: "Everything" },
  { id: "figure", label: "Figures" },
  { id: "table", label: "Tables" },
  { id: "equation", label: "Equations" },
] as const;
const icons: Record<Kind, typeof Image> = { figure: Image, table: Table, equation: Sigma };
const kind = ref<"all" | Kind>("all");
const list = computed(() =>
  state.items.filter((x) => kind.value === "all" || x.kind === kind.value),
);
// The item the reference being changed points to now, if any.
const isCurrent = (x: Item) => !!props.at?.label && x.label === props.at.label;
const picked = ref(Math.max(0, list.value.findIndex(isCurrent)));
const listEl = ref<HTMLElement>();

function insert(item: Item | undefined) {
  if (!item) return;
  insertCrossRef(item, props.at);
  emit("close");
}

function unlink() {
  unlinkCrossRef(props.at!);
  emit("close");
}

function key(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey) return; // ⌘↩ is the Modal's
  if (e.key === "ArrowDown") picked.value = Math.min(picked.value + 1, list.value.length - 1);
  else if (e.key === "ArrowUp") picked.value = Math.max(picked.value - 1, 0);
  else if (e.key === "Enter") insert(list.value[picked.value]);
  else return;
  e.preventDefault();
}
onMounted(() => {
  window.addEventListener("keydown", key);
  listEl.value?.querySelector(".current")?.scrollIntoView({ block: "nearest" });
});
onUnmounted(() => window.removeEventListener("keydown", key));
</script>

<template>
  <Modal
    :title="at ? 'Change cross-reference' : 'Cross-reference'"
    @close="emit('close')"
    @submit="insert(list[picked])"
  >
    <div class="seg">
      <button
        v-for="k in kinds"
        :key="k.id"
        type="button"
        :class="{ on: kind === k.id }"
        @click="((kind = k.id), (picked = 0))"
      >
        {{ k.label }}
      </button>
    </div>
    <div v-if="list.length" ref="listEl" class="list">
      <button
        v-for="(it, i) in list"
        :key="it.from"
        type="button"
        class="row"
        :class="{ on: i === picked, current: isCurrent(it) }"
        :aria-current="isCurrent(it) || undefined"
        @mouseenter="picked = i"
        @click="insert(it)"
      >
        <component :is="icons[it.kind]" :size="16" />
        <b>{{ kindName[it.kind] }} {{ it.number }}</b>
        <code v-if="it.kind === 'equation'" class="cap tex">{{ it.caption }}</code>
        <span v-else class="cap">{{ plain(it.caption) || "No caption" }}</span>
        <code v-if="it.label">@{{ it.label }}</code>
        <span v-if="isCurrent(it)" class="now"><Check :size="12" /> Current</span>
      </button>
    </div>
    <div v-else class="none">
      <img src="/peanut.svg" alt="" />
      Nothing to refer to yet. Add a picture, a table or a labelled equation first.
    </div>
    <p v-if="at" class="hint">
      Pick what this reference points to.
      {{
        at.text
          ? `Unlink leaves the words “${at.text}” as plain text, which won't keep up when things move.`
          : "It points to nothing, so Remove takes it out."
      }}
    </p>
    <p v-else class="hint">
      The reference reads like “Figure 2” and keeps up when things move. You can also type
      <code>@</code> in the text.
    </p>
    <template #footer>
      <button v-if="at" type="button" class="btn" @click="unlink">
        <Unlink :size="14" /> {{ at.text ? "Unlink" : "Remove" }}
      </button>
      <span v-if="at" style="flex: 1" />
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="submit" class="btn primary" :disabled="!list.length">
        {{ at ? "Change" : "Insert" }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.seg {
  display: inline-flex;
  align-self: flex-start;
  padding: 3px;
  border-radius: 999px;
  background: var(--panel);
  border: 1px solid var(--border);
}
.seg button {
  border: 0;
  border-radius: 999px;
  padding: 4px 14px;
  background: transparent;
  color: var(--quote);
}
.seg button.on {
  background: white;
  color: var(--roast);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(90, 50, 20, 0.15);
}
.list {
  display: flex;
  flex-direction: column;
  max-height: 300px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
}
.row svg {
  color: var(--accent-ink);
  flex: none;
}
.row.on {
  background: var(--cream);
}
.row.current {
  box-shadow: inset 0 0 0 1.5px var(--accent);
}
.now {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent);
  color: white;
  font-size: 11px;
  font-weight: 600;
}
.row .now svg {
  color: white;
}
.row b {
  color: var(--roast);
  white-space: nowrap;
}
.cap {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
code {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
}
code.tex {
  font-size: 12px;
  color: var(--math);
}
.none {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px;
  border-radius: 12px;
  background: var(--panel);
  color: var(--quote);
}
.none img {
  width: 22px;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
