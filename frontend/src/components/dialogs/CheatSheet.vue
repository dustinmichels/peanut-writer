<script setup lang="ts">
import Modal from "@/components/ui/Modal.vue";

const emit = defineEmits<{ close: [] }>();
const rows: [string, string][] = [
  ["**bold**  *italic*  ~~strike~~", "Bold (⌘B), italic (⌘I), strikethrough"],
  ["`code`", "Code in a sentence"],
  ["# Heading 1   ## Heading 2", "Headings (⌥⌘1 – ⌥⌘4)"],
  ["- item   1. item", "Bulleted and numbered lists; Tab nests"],
  ["> quoted", "A quotation"],
  ["[text](https://…)", "A link"],
  [
    "![Caption](images/a.png){#fig:a width=60% align=left}",
    "A figure with a caption, a name, a size and a position (left or right; centered by default)",
  ],
  [
    "![](images/a.png)\n![](images/b.png)\nFigure: Caption {#fig:c columns=2}",
    "A picture grid: pictures side by side, one per line, sharing the caption on the last line",
  ],
  ["Table: Caption {#tbl:b}", "A table's caption, on the line after the table"],
  ["@fig:a   @tbl:b   @eq:c", "Cross-references: become “Figure 1”, “Table 1”, “Equation 1”"],
  ["$x^2$   \\$5", "LaTeX math in a sentence; \\$ is a dollar sign ($5 or $10 stays text)"],
  ["$$ E = mc^2 $$ {#eq:c}", "An equation on its own line; a name numbers it"],
  ["Text[^1]   [^1]: The note.", "A footnote"],
  ["[TOC]", "Table of contents"],
  ["\\pagebreak", "Start a new page"],
  ["---", "A divider line"],
];
</script>

<template>
  <Modal title="Markdown Cheat Sheet" wide @close="emit('close')" @submit="emit('close')">
    <p class="lead">
      Everything on the ribbon is plain text underneath. Type it directly whenever that's quicker.
    </p>
    <table>
      <tr v-for="[code, what] in rows" :key="code">
        <td><code>{{ code }}</code></td>
        <td>{{ what }}</td>
      </tr>
    </table>
    <template #footer>
      <button type="submit" class="btn primary">Got it</button>
    </template>
  </Modal>
</template>

<style scoped>
.lead {
  margin: 0;
  color: var(--quote);
}
table {
  border-collapse: collapse;
}
td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
code {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--roast);
  background: var(--panel);
  padding: 2px 6px;
  border-radius: 5px;
  user-select: text;
  white-space: pre-wrap;
}
</style>
