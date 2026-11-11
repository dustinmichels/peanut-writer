<script setup lang="ts">
// The ribbon's Home tab: character and paragraph formatting, the paragraph
// styles, find, and the document's properties and settings.
import { indentLess, indentMore } from "@codemirror/commands";
import {
  Bold,
  Code,
  CodeXml,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  RemoveFormatting,
  Search,
  Settings2,
  SlidersHorizontal,
  Strikethrough,
  TextQuote,
} from "lucide-vue-next";
import RibbonButton from "./RibbonButton.vue";
import { withView } from "./withView";
import { editLink, menu } from "@/lib/actions";
import {
  type BlockStyle,
  clearFormatting,
  insertDivider,
  type Mark,
  setBlockStyle,
  toggleCodeBlock,
  toggleList,
  toggleMark,
} from "@/lib/editor";
import { state } from "@/lib/store";

const mark = (m: Mark) => withView((v) => toggleMark(v, m));
const block = (s: BlockStyle) => withView((v) => setBlockStyle(v, s));

const styles: { id: BlockStyle; label: string; cls: string }[] = [
  { id: "p", label: "Normal", cls: "s-normal" },
  { id: "h1", label: "Heading 1", cls: "s-h1" },
  { id: "h2", label: "Heading 2", cls: "s-h2" },
  { id: "h3", label: "Heading 3", cls: "s-h3" },
  { id: "h4", label: "Heading 4", cls: "s-h4" },
  { id: "quote", label: "Quote", cls: "s-quote" },
];
</script>

<template>
  <div class="group">
    <div class="stack">
      <div class="row">
        <RibbonButton
          :icon="Bold"
          title="Bold (⌘B)"
          :active="state.marks.has('strong')"
          @click="mark('strong')"
        />
        <RibbonButton
          :icon="Italic"
          title="Italic (⌘I)"
          :active="state.marks.has('emph')"
          @click="mark('emph')"
        />
        <RibbonButton
          :icon="Strikethrough"
          title="Strikethrough (⇧⌘X)"
          :active="state.marks.has('strike')"
          @click="mark('strike')"
        />
        <RibbonButton
          :icon="Code"
          title="Code (⌘`)"
          :active="state.marks.has('code')"
          @click="mark('code')"
        />
      </div>
      <div class="row">
        <RibbonButton :icon="Link" title="Link" @click="editLink" />
        <RibbonButton
          :icon="RemoveFormatting"
          title="Clear formatting"
          @click="withView(clearFormatting)"
        />
      </div>
    </div>
    <label>Font</label>
  </div>
  <div class="group">
    <div class="stack">
      <div class="row">
        <RibbonButton
          :icon="List"
          title="Bullets"
          @click="withView((v) => toggleList(v, 'bullet'))"
        />
        <RibbonButton
          :icon="ListOrdered"
          title="Numbering"
          @click="withView((v) => toggleList(v, 'ordered'))"
        />
        <RibbonButton
          :icon="IndentDecrease"
          title="Decrease indent (⇧⇥)"
          @click="withView(indentLess)"
        />
        <RibbonButton
          :icon="IndentIncrease"
          title="Increase indent (⇥)"
          @click="withView(indentMore)"
        />
      </div>
      <div class="row">
        <RibbonButton
          :icon="TextQuote"
          title="Quote"
          :active="state.block === 'quote'"
          @click="block(state.block === 'quote' ? 'p' : 'quote')"
        />
        <RibbonButton
          :icon="CodeXml"
          title="Code block"
          :active="state.block === 'code'"
          @click="withView(toggleCodeBlock)"
        />
        <RibbonButton :icon="Minus" title="Divider" @click="withView(insertDivider)" />
      </div>
    </div>
    <label>Paragraph</label>
  </div>
  <div class="group">
    <div class="styles">
      <button
        v-for="s in styles"
        :key="s.id"
        class="style"
        :class="[s.cls, { on: state.block === s.id }]"
        @mousedown.prevent
        @click="block(s.id)"
      >
        <span class="sample">AaBbCc</span>
        <span class="name">{{ s.label }}</span>
      </button>
    </div>
    <label>Styles</label>
  </div>
  <div class="group">
    <div class="row">
      <RibbonButton big :icon="Search" label="Find" title="Find (⌘F)" @click="menu('find')" />
    </div>
    <label>Editing</label>
  </div>
  <div class="group">
    <div class="row">
      <RibbonButton
        big
        :icon="Settings2"
        label="Properties"
        title="Title, author, date and other document properties"
        @click="state.dialog = { kind: 'properties' }"
      />
      <RibbonButton
        big
        :icon="SlidersHorizontal"
        label="Settings"
        title="Settings, global and for this document: auto format, title case (⌘,)"
        @click="state.dialog = { kind: 'settings' }"
      />
    </div>
    <label>Document</label>
  </div>
</template>

<style scoped src="./ribbon.css"></style>
<style scoped>
.stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
}
.styles {
  display: flex;
  gap: 4px;
}
.style {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 82px;
  height: 58px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  text-align: left;
  overflow: hidden;
}
.style:hover {
  border-color: var(--shell);
}
.style.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(193, 105, 79, 0.18);
}
.sample {
  font-family: var(--writing);
  font-size: 15px;
  line-height: 1.3;
  white-space: nowrap;
}
.name {
  font-size: 10.5px;
  color: var(--muted);
}
.s-h1 .sample {
  font-size: 19px;
  color: var(--roast);
  font-weight: 700;
}
.s-h2 .sample {
  font-size: 16px;
  color: var(--roast);
  font-weight: 700;
}
.s-h3 .sample {
  color: var(--roast);
  font-weight: 650;
}
.s-h4 .sample {
  color: var(--roast);
  font-weight: 650;
  font-style: italic;
}
.s-quote .sample {
  font-style: italic;
  color: var(--quote);
}
</style>
