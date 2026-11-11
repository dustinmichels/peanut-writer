<script setup lang="ts">
// A figure's or table's preview for the ribbon. A click opens it, or (in a
// list or quote, where it's shown as Markdown) goes to it in the text.
import { computed, ref, watch } from "vue";
import { DocService } from "@bindings/peanut-writer";
import { goTo, pictureURL } from "@/lib/editor";
import { type Item, kindName, parseTable, plain } from "@/lib/markdown";
import { editor, state } from "@/lib/store";

const props = defineProps<{ item: Item }>();

const url = ref("");
watch(
  () => (props.item.kind === "figure" ? (props.item.pictures?.[0]?.src ?? "") : ""),
  async (src, _, onCleanup) => {
    let live = true;
    onCleanup(() => (live = false));
    const u = src ? await pictureURL(src, DocService.ImageURL) : "";
    if (live) url.value = u;
  },
  { immediate: true },
);

// The table's top-left corner: enough to tell it by.
const table = computed(() => {
  const x = props.item;
  if (x.kind !== "table") return null;
  const t = parseTable(state.content.slice(x.tableFrom, x.tableTo));
  return { header: t.header.slice(0, 3), rows: t.rows.slice(0, 3).map((r) => r.slice(0, 3)) };
});

const name = computed(() => `${kindName[props.item.kind]} ${props.item.number}`);
const title = computed(() => {
  const c = plain(props.item.caption).trim();
  return `${name.value}${c ? `: ${c}` : ""}`;
});

function open() {
  const x = props.item;
  if (x.prefix !== undefined) {
    if (editor.value) goTo(editor.value, x.from);
  } else if (x.kind === "figure") state.dialog = { kind: "figure", item: x };
  else if (x.kind === "table") state.dialog = { kind: "table", item: x };
}
</script>

<template>
  <button type="button" class="item-thumb" :title="title" @mousedown.prevent @click="open">
    <img v-if="url" :src="url" alt="" />
    <table v-else-if="table">
      <thead>
        <tr>
          <th v-for="(h, c) in table.header" :key="c">{{ plain(h) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in table.rows" :key="i">
          <td v-for="(d, c) in r" :key="c">{{ plain(d) }}</td>
        </tr>
      </tbody>
    </table>
    <span v-else class="missing">?</span>
    <span class="tag">{{ item.kind === "figure" ? "Fig." : "Tbl." }} {{ item.number }}</span>
  </button>
</template>

<style scoped>
.item-thumb {
  position: relative;
  flex: none;
  width: 76px;
  height: 58px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  overflow: hidden;
}
.item-thumb:hover {
  border-color: var(--shell);
}
img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 7px;
  line-height: 1.3;
  color: var(--ink);
}
th,
td {
  padding: 1px 2px;
  border-bottom: 1px solid var(--border);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: clip;
  text-align: left;
}
th {
  background: var(--cream);
  color: var(--roast);
}
.missing {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--muted);
}
.tag {
  position: absolute;
  left: 3px;
  bottom: 3px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.88);
  font-size: 9.5px;
  font-weight: 650;
  color: var(--roast);
}
</style>
