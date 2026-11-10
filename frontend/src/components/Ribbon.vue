<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from "vue";
import { indentLess, indentMore } from "@codemirror/commands";
import {
  Bold,
  BookOpen,
  Code,
  CodeXml,
  ClipboardPaste,
  FilePlus2,
  FileClock,
  FileCode,
  FileText,
  FileDown,
  FolderOpen,
  Footprints,
  History,
  Image,
  Images,
  Info,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTree,
  Minus,
  Palette,
  RemoveFormatting,
  Save,
  RefreshCw,
  SaveAll,
  Search,
  Settings2,
  Sigma,
  SlidersHorizontal,
  Strikethrough,
  Table,
  TableOfContents,
  TextQuote,
  Link2,
  FolderCog,
  SquareSplitVertical,
  Sparkles,
} from "lucide-vue-next";
import RibbonButton from "./RibbonButton.vue";
import TableGridPicker from "./TableGridPicker.vue";
import TemplateGallery from "./TemplateGallery.vue";
import {
  choosePicture,
  choosePictureGrid,
  customizeTemplate,
  editLink,
  exportDocx,
  exportPdf,
  menu,
  newDoc,
  openDoc,
  openWelcome,
  showRecent,
  save,
  saveAs,
  syncFiles,
  toggleMarkdown,
  toggleOutline,
  toggleVersions,
} from "../lib/actions";
import {
  type BlockStyle,
  clearFormatting,
  insertBlock,
  insertEquation,
  insertFootnote,
  type Mark,
  setBlockStyle,
  toggleCodeBlock,
  toggleList,
  toggleMark,
} from "../lib/editor";
import { canSave, canSync, editor, state } from "../lib/store";

type Tab = "file" | "home" | "insert" | "references" | "design" | "view";
const tab = ref<Tab>("home");
const collapsed = ref(false);

function selectTab(id: Tab) {
  collapsed.value = tab.value === id ? !collapsed.value : false;
  tab.value = id;
}
const tabs: { id: Tab; label: string }[] = [
  { id: "file", label: "File" },
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "references", label: "References" },
  { id: "design", label: "Design" },
  { id: "view", label: "View" },
];
const tablePicker = ref(false);

function withView(f: (v: NonNullable<typeof editor.value>) => unknown) {
  const v = editor.value;
  if (v) {
    f(v);
    v.focus();
  }
}

const mark = (m: Mark) => withView((v) => toggleMark(v, m));
const block = (s: BlockStyle) => withView((v) => setBlockStyle(v, s));

const styles: { id: BlockStyle; label: string; cls: string }[] = [
  { id: "p", label: "Normal", cls: "s-normal" },
  { id: "h1", label: "Heading 1", cls: "s-h1" },
  { id: "h2", label: "Heading 2", cls: "s-h2" },
  { id: "h3", label: "Heading 3", cls: "s-h3" },
  { id: "quote", label: "Quote", cls: "s-quote" },
];

function pickTable(cols: number, rows: number) {
  tablePicker.value = false;
  state.dialog = { kind: "table", cols, rows };
}

const figures = computed(() => state.items.filter((x) => x.kind === "figure").length);
const tables = computed(() => state.items.filter((x) => x.kind === "table").length);

// three.js is big; load Peanut in his own chunk so the editor opens first.
const PeanutBuddy = defineAsyncComponent(() => import("./PeanutBuddy.vue"));
</script>

<template>
  <nav class="ribbon">
    <div class="tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="tab"
        :class="{ on: !collapsed && tab === t.id, file: t.id === 'file' }"
        :aria-expanded="tab === t.id && !collapsed"
        @click="selectTab(t.id)"
      >
        {{ t.label }}
      </button>
      <PeanutBuddy v-if="state.showPeanut" />
    </div>

    <div v-show="!collapsed" class="panel">
      <!-- File -->
      <template v-if="tab === 'file'">
        <div class="group">
          <div class="row">
            <RibbonButton big :icon="FilePlus2" label="New" title="New (⌘N)" @click="newDoc" />
            <RibbonButton big :icon="FolderOpen" label="Open" title="Open (⌘O)" @click="openDoc" />
            <RibbonButton
              big
              :icon="History"
              label="Recent"
              title="Open a recent document (⇧⌘O)"
              @click="showRecent"
            />
            <RibbonButton
              big
              :icon="Save"
              label="Save"
              :title="state.dirty ? 'Save unsaved changes (⌘S)' : 'Save (⌘S)'"
              :attention="state.dirty"
              :disabled="!canSave"
              @click="save"
            />
            <RibbonButton
              big
              :icon="SaveAll"
              label="Save As"
              title="Save As (⇧⌘S)"
              @click="saveAs"
            />
          </div>
          <label>Document</label>
        </div>
        <div class="group">
          <div class="row">
            <RibbonButton
              big
              :icon="FileDown"
              label="PDF"
              title="Export as PDF (⌘E)"
              @click="exportPdf"
            />
            <RibbonButton
              big
              :icon="FileText"
              label="Word"
              title="Export as Word (⇧⌘E)"
              @click="exportDocx"
            />
            <RibbonButton
              big
              :icon="RefreshCw"
              label="Sync Files"
              :title="
                canSync
                  ? 'Save, then write PDF and Word copies beside the document (⇧⌘Y)'
                  : 'The PDF and Word copies are up to date'
              "
              :disabled="!canSync"
              @click="syncFiles"
            />
          </div>
          <label>Export</label>
        </div>
        <div class="group">
          <div class="row">
            <RibbonButton
              big
              :icon="Settings2"
              label="Properties"
              @click="state.dialog = { kind: 'properties' }"
            />
          </div>
          <label>Info</label>
        </div>
        <div class="group">
          <div class="row">
            <RibbonButton big :icon="Sparkles" label="Welcome" @click="openWelcome" />
            <RibbonButton big :icon="BookOpen" label="Cheat Sheet" @click="menu('cheatsheet')" />
            <RibbonButton big :icon="Info" label="About" @click="menu('about')" />
          </div>
          <label>Help</label>
        </div>
      </template>

      <!-- Home -->
      <template v-if="tab === 'home'">
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
              <RibbonButton
                :icon="Minus"
                title="Divider"
                @click="withView((v) => insertBlock(v, '---'))"
              />
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
          </div>
          <label>Document</label>
        </div>
      </template>

      <!-- Insert -->
      <template v-if="tab === 'insert'">
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
              :icon="ClipboardPaste"
              label="Paste Table"
              title="Make a table from CSV or cells copied from Excel or Google Sheets"
              @click="state.dialog = { kind: 'pasteTable' }"
            />
          </div>
          <label>Figures &amp; Tables</label>
        </div>
        <div class="group">
          <div class="row">
            <RibbonButton big :icon="Link" label="Link" @click="editLink" />
            <RibbonButton
              big
              :icon="Footprints"
              label="Footnote"
              @click="withView(insertFootnote)"
            />
            <RibbonButton
              big
              :icon="Sigma"
              label="Equation"
              title="Insert an equation (selected text becomes inline math)"
              @click="withView(insertEquation)"
            />
          </div>
          <label>Text</label>
        </div>
        <div class="group">
          <div class="row">
            <RibbonButton big :icon="CodeXml" label="Code" @click="withView(toggleCodeBlock)" />
            <RibbonButton
              big
              :icon="Minus"
              label="Divider"
              @click="withView((v) => insertBlock(v, '---'))"
            />
            <RibbonButton
              big
              :icon="SquareSplitVertical"
              label="Page Break"
              @click="withView((v) => insertBlock(v, '\\pagebreak'))"
            />
          </div>
          <label>Layout</label>
        </div>
      </template>

      <!-- References -->
      <template v-if="tab === 'references'">
        <div class="group">
          <div class="row">
            <RibbonButton
              big
              :icon="Link2"
              label="Cross-reference"
              @click="state.dialog = { kind: 'crossref' }"
            />
          </div>
          <label>Captions</label>
        </div>
        <div class="group">
          <div class="row">
            <RibbonButton
              big
              :icon="Footprints"
              label="Footnote"
              @click="withView(insertFootnote)"
            />
            <RibbonButton
              big
              :icon="ListTree"
              label="Contents"
              title="Table of contents"
              @click="withView((v) => insertBlock(v, '[TOC]'))"
            />
          </div>
          <label>Notes &amp; Contents</label>
        </div>
        <div class="group">
          <div class="facts">
            <span><b>{{ figures }}</b> {{ figures === 1 ? "figure" : "figures" }}</span>
            <span><b>{{ tables }}</b> {{ tables === 1 ? "table" : "tables" }}</span>
            <span class="hint">Numbers update as you move things around.</span>
          </div>
          <label>In this document</label>
        </div>
      </template>

      <!-- Design -->
      <template v-if="tab === 'design'">
        <div class="group">
          <TemplateGallery />
          <label>Templates</label>
        </div>
        <div class="group">
          <div class="row">
            <RibbonButton
              big
              :icon="SlidersHorizontal"
              label="Settings"
              title="Settings, global and for this document: auto format, title case (⌘,)"
              @click="state.dialog = { kind: 'settings' }"
            />
            <RibbonButton
              big
              :icon="Palette"
              label="Customize"
              title="Change this document's fonts and colors"
              :active="state.customizing"
              @click="customizeTemplate"
            />
            <RibbonButton
              big
              :icon="FolderCog"
              label="Manage Templates"
              title="Rename, edit, share, delete and import your templates"
              @click="state.dialog = { kind: 'templates' }"
            />
          </div>
          <label>Look</label>
        </div>
      </template>

      <!-- View -->
      <template v-if="tab === 'view'">
        <div class="group">
          <div class="row">
            <RibbonButton
              big
              :icon="FileCode"
              label="Markdown"
              title="Show and edit the Markdown behind the document (⌘/)"
              :active="state.showMarkdown"
              @click="toggleMarkdown"
            />
            <RibbonButton
              big
              :icon="TableOfContents"
              label="Outline"
              title="Show the headings beside the editor, to jump to a section"
              :active="state.outlineOpen"
              @click="toggleOutline"
            />
            <RibbonButton
              big
              :icon="FileClock"
              label="Versions"
              title="Save a named version of the document, or load an earlier one"
              :active="state.versionsOpen"
              @click="toggleVersions"
            />
          </div>
          <label>Show</label>
        </div>
      </template>
    </div>
  </nav>
</template>

<style scoped>
.ribbon {
  background: linear-gradient(180deg, #f6ecdf, var(--panel));
}
.tabs {
  display: flex;
  gap: 2px;
  padding: 0 10px;
}
.tab {
  height: 28px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px 8px 0 0;
  background: transparent;
  font-weight: 500;
  color: var(--quote);
}
.tab:hover {
  color: var(--ink);
}
.tab.on {
  background: var(--surface);
  color: var(--roast);
  font-weight: 650;
  box-shadow: 0 -1px 0 var(--border) inset;
}
.tab.file {
  color: var(--accent);
  font-weight: 650;
}
.panel {
  display: flex;
  align-items: stretch;
  height: 92px;
  padding: 6px 8px 0;
  background: var(--surface);
  border-top: 1px solid var(--border);
  overflow-x: auto;
  overflow-y: visible;
}
.group {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 10px;
  border-right: 1px solid var(--border);
}
.group:last-child {
  border-right: 0;
}
.group > label {
  margin-top: auto;
  padding: 2px 0 4px;
  font-size: 10.5px;
  color: var(--muted);
}
.row {
  display: flex;
  align-items: center;
  gap: 2px;
}
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
.s-quote .sample {
  font-style: italic;
  color: var(--quote);
}
.pop {
  position: relative;
}
.popover {
  position: fixed;
  z-index: 60;
  margin-top: -4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
}
.facts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 8px;
  min-width: 170px;
}
.facts b {
  color: var(--roast);
}
.facts .hint {
  color: var(--muted);
  font-size: 11px;
}
</style>
