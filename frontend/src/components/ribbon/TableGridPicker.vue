<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{ pick: [cols: number, rows: number] }>();
const cols = ref(0);
const rows = ref(0);
const N = 8;
</script>

<template>
  <div class="picker" @mouseleave="cols = rows = 0">
    <div class="head">{{ cols && rows ? `${cols} × ${rows} table` : "Insert Table" }}</div>
    <div class="grid">
      <template v-for="r in N" :key="r">
        <span
          v-for="c in N"
          :key="c"
          :class="{ on: c <= cols && r <= rows }"
          @mouseenter="((cols = c), (rows = r))"
          @click="emit('pick', c, r)"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.picker {
  padding: 10px;
}
.head {
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--roast);
}
.grid {
  display: grid;
  grid-template-columns: repeat(8, 18px);
  gap: 3px;
}
.grid span {
  width: 18px;
  height: 18px;
  border: 1px solid var(--border-strong);
  border-radius: 3px;
  background: white;
}
.grid span.on {
  background: var(--cream);
  border-color: var(--accent);
}
</style>
