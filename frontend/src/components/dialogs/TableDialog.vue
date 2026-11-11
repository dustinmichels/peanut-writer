<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useTemplateRef, watch } from "vue";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  ArrowLeftToLine,
  Trash2,
  Columns3,
  Rows3,
} from "lucide-vue-next";
import Modal from "@/components/ui/Modal.vue";
import { applyTable, deleteBlock } from "@/lib/actions";
import {
  type Align,
  emptyTable,
  type Item,
  parseTable,
  type Table,
  uniqueLabel,
} from "@/lib/markdown";
import { state } from "@/lib/store";

const props = defineProps<{ item?: Item; cols?: number; rows?: number; table?: Table }>();
const emit = defineEmits<{ close: [] }>();

const t = reactive(
  props.item
    ? parseTable(state.content.slice(props.item.tableFrom, props.item.tableTo))
    : (props.table ?? emptyTable(props.cols ?? 3, Math.max(1, (props.rows ?? 3) - 1))),
);
const caption = ref(props.item?.caption ?? "");
const label = ref(props.item?.label ?? "");
const labelTouched = ref(!!props.item?.label);
watch(caption, (c) => {
  if (!labelTouched.value)
    label.value = c.trim() ? uniqueLabel("tbl", c, state.items, props.item?.label ?? "") : "";
});

// The cell with focus: row -1 is the header.
const cur = reactive({ r: -1, c: 0 });
const grid = useTemplateRef("grid");
const number = computed(
  () => props.item?.number ?? state.items.filter((x) => x.kind === "table").length + 1,
);

async function focusCell(r: number, c: number) {
  await nextTick();
  grid.value?.querySelector<HTMLInputElement>(`[data-cell="${r}:${c}"]`)?.focus();
}
onMounted(() => focusCell(-1, 0));

function addRow(after: boolean) {
  const at = cur.r + (after ? 1 : 0);
  t.rows.splice(Math.max(0, at), 0, Array(t.header.length).fill(""));
  focusCell(Math.max(0, at), cur.c);
}
function deleteRow() {
  if (cur.r < 0 || t.rows.length <= 1) return;
  t.rows.splice(cur.r, 1);
  focusCell(Math.min(cur.r, t.rows.length - 1), cur.c);
}
function addCol(after: boolean) {
  const at = cur.c + (after ? 1 : 0);
  t.header.splice(at, 0, "");
  t.align.splice(at, 0, "");
  t.rows.forEach((r) => r.splice(at, 0, ""));
  focusCell(cur.r, at);
}
function deleteCol() {
  if (t.header.length <= 1) return;
  t.header.splice(cur.c, 1);
  t.align.splice(cur.c, 1);
  t.rows.forEach((r) => r.splice(cur.c, 1));
  focusCell(cur.r, Math.min(cur.c, t.header.length - 1));
}
function setAlign(a: Align) {
  t.align[cur.c] = t.align[cur.c] === a ? "" : a;
}

// Enter moves down a row, adding one at the bottom.
function enter(r: number, c: number) {
  if (r === t.rows.length - 1) t.rows.push(Array(t.header.length).fill(""));
  focusCell(r + 1, c);
}

function submit() {
  applyTable(props.item, t, caption.value.trim(), label.value.trim());
  emit("close");
}
function remove() {
  if (props.item) deleteBlock(props.item.from, props.item.to);
  emit("close");
}
const alignOf = (c: number) => t.align[c] || "left";
</script>

<template>
  <Modal
    :title="item ? `Table ${number}` : 'Insert Table'"
    wide
    @close="emit('close')"
    @submit="submit"
  >
    <label class="field">
      Caption
      <input v-model="caption" placeholder="What the table shows" />
      <span class="hint">Shown above the table as “Table {{ number }}: …”.</span>
    </label>

    <div class="tools">
      <span class="group" title="Rows">
        <Rows3 :size="14" class="lead" />
        <button type="button" title="Insert row above" :disabled="cur.r < 0" @click="addRow(false)">
          <ArrowUpToLine :size="15" />
        </button>
        <button type="button" title="Insert row below" @click="addRow(true)">
          <ArrowDownToLine :size="15" />
        </button>
        <button
          type="button"
          title="Delete row"
          :disabled="cur.r < 0 || t.rows.length <= 1"
          @click="deleteRow"
        >
          <Trash2 :size="15" />
        </button>
      </span>
      <span class="group" title="Columns">
        <Columns3 :size="14" class="lead" />
        <button type="button" title="Insert column left" @click="addCol(false)">
          <ArrowLeftToLine :size="15" />
        </button>
        <button type="button" title="Insert column right" @click="addCol(true)">
          <ArrowRightToLine :size="15" />
        </button>
        <button
          type="button"
          title="Delete column"
          :disabled="t.header.length <= 1"
          @click="deleteCol"
        >
          <Trash2 :size="15" />
        </button>
      </span>
      <span class="group" title="Alignment of this column">
        <button
          type="button"
          :class="{ on: t.align[cur.c] === 'left' }"
          title="Align left"
          @click="setAlign('left')"
        >
          <AlignLeft :size="15" />
        </button>
        <button
          type="button"
          :class="{ on: t.align[cur.c] === 'center' }"
          title="Center"
          @click="setAlign('center')"
        >
          <AlignCenter :size="15" />
        </button>
        <button
          type="button"
          :class="{ on: t.align[cur.c] === 'right' }"
          title="Align right"
          @click="setAlign('right')"
        >
          <AlignRight :size="15" />
        </button>
      </span>
    </div>

    <div ref="grid" class="grid">
      <table>
        <thead>
          <tr>
            <th v-for="(_, c) in t.header" :key="c" :class="{ cur: cur.c === c }">
              <input
                v-model="t.header[c]"
                :data-cell="`-1:${c}`"
                :style="{ textAlign: alignOf(c) }"
                placeholder="Heading"
                @focus="((cur.r = -1), (cur.c = c))"
                @keydown.enter.prevent="focusCell(0, c)"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, r) in t.rows" :key="r">
            <td v-for="(_, c) in row" :key="c" :class="{ cur: cur.c === c }">
              <input
                v-model="row[c]"
                :data-cell="`${r}:${c}`"
                :style="{ textAlign: alignOf(c) }"
                @focus="((cur.r = r), (cur.c = c))"
                @keydown.enter.exact.prevent="enter(r, c)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <label class="field small">
      Reference name
      <input v-model="label" placeholder="tbl:name" @input="labelTouched = true" />
    </label>

    <template #footer>
      <button v-if="item" type="button" class="btn danger" @click="remove">
        <Trash2 :size="14" /> Delete table
      </button>
      <span style="flex: 1" />
      <button type="button" class="btn" @click="emit('close')">Cancel</button>
      <button type="submit" class="btn primary">{{ item ? "Done" : "Insert" }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.tools {
  display: flex;
  gap: 10px;
}
.group {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 2px 4px;
  border-radius: 9px;
  background: var(--panel);
  border: 1px solid var(--border);
}
.group .lead {
  margin: 0 4px;
  color: var(--muted);
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
.group button:hover:not(:disabled) {
  background: var(--hover);
}
.group button.on {
  background: var(--active);
}
.group button:disabled {
  opacity: 0.35;
}
.grid {
  max-height: 46vh;
  overflow: auto;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  border: 1px solid var(--border);
  padding: 0;
  min-width: 90px;
}
th {
  position: sticky;
  top: 0;
  background: var(--cream);
}
th.cur,
td.cur {
  background-color: rgba(246, 227, 204, 0.35);
}
th.cur {
  background: #f0d6b8;
}
input {
  width: 100%;
  border: 0;
  padding: 7px 9px;
  background: transparent;
  outline: none;
}
th input {
  font-weight: 650;
  color: var(--roast);
}
input:focus {
  box-shadow: inset 0 0 0 2px var(--shell);
  background: white;
}
.small {
  max-width: 280px;
}
</style>
