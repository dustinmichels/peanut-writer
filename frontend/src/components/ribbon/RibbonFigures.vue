<script setup lang="ts">
// The ribbon's Figures & Tables tab: adding pictures, tables and equations,
// cross-references to them, and the document's figures and tables in order.
import { computed, ref } from "vue";
import { Image, Images, Link2, Sigma, Table } from "lucide-vue-next";
import RibbonButton from "./RibbonButton.vue";
import TableGridPicker from "./TableGridPicker.vue";
import ItemThumb from "@/components/ui/ItemThumb.vue";
import { choosePicture, choosePictureGrid, newEquation } from "@/lib/actions";
import { state } from "@/lib/store";

const tablePicker = ref(false);

function pickTable(cols: number, rows: number) {
  tablePicker.value = false;
  state.dialog = { kind: "table", cols, rows };
}

// The figures and tables, in order.
const previews = computed(() => state.items.filter((x) => x.kind !== "equation"));
const figures = computed(() => previews.value.filter((x) => x.kind === "figure").length);
const tables = computed(() => previews.value.length - figures.value);
</script>

<template>
  <div class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="Image"
        label="Picture"
        title="Insert a picture (or drag one in)"
        @click="choosePicture"
      />
      <RibbonButton
        big
        :icon="Images"
        label="Picture Grid"
        title="Insert several pictures side by side, sharing one caption"
        @click="choosePictureGrid"
      />
      <div class="pop" @mouseleave="tablePicker = false">
        <RibbonButton big :icon="Table" label="Table" @click="tablePicker = !tablePicker" />
        <div v-if="tablePicker" class="popover"><TableGridPicker @pick="pickTable" /></div>
      </div>
      <RibbonButton
        big
        :icon="Sigma"
        label="Equation"
        title="Insert an equation (selected text becomes inline math)"
        @click="newEquation"
      />
    </div>
    <label>Insert</label>
  </div>
  <div class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="Link2"
        label="Cross-reference"
        title="Refer to a figure, table or equation by its number"
        @click="state.dialog = { kind: 'crossref' }"
      />
    </div>
    <label>Refer</label>
  </div>
  <div class="group">
    <div class="thumbs">
      <ItemThumb v-for="x in previews" :key="`${state.path}:${x.kind}:${x.number}`" :item="x" />
      <span v-if="!previews.length" class="hint">
        Figures and tables you add show here. Numbers update as you move things around.
      </span>
    </div>
    <label>
      {{ figures }} {{ figures === 1 ? "figure" : "figures" }} · {{ tables }}
      {{ tables === 1 ? "table" : "tables" }}
    </label>
  </div>
</template>

<style scoped src="./ribbon.css"></style>
<style scoped>
.thumbs {
  display: flex;
  gap: 4px;
  max-width: 480px;
  min-height: 62px;
  overflow-x: auto;
}
.thumbs .hint {
  align-self: center;
  max-width: 200px;
  color: var(--muted);
  font-size: 11px;
}
</style>
