<script setup lang="ts">
// The ribbon: its tabs, on the wooden ledge Peanut walks along, and the panel
// of the open tab, which a second click on the tab collapses.
import { defineAsyncComponent, ref } from "vue";
import RibbonDesign from "./RibbonDesign.vue";
import RibbonFile from "./RibbonFile.vue";
import RibbonHome from "./RibbonHome.vue";
import RibbonInsert from "./RibbonInsert.vue";
import RibbonReferences from "./RibbonReferences.vue";
import RibbonVersions from "./RibbonVersions.vue";
import RibbonView from "./RibbonView.vue";
import { versionDraft } from "./versionDraft";
import { refreshVersions, state } from "@/lib/store";

const tabs = [
  { id: "file", label: "File" },
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "references", label: "References" },
  { id: "design", label: "Design" },
  { id: "versions", label: "Versions" },
  { id: "view", label: "View" },
] as const;
type Tab = (typeof tabs)[number]["id"];

const tab = ref<Tab>("home");
const collapsed = ref(false);

function selectTab(id: Tab) {
  collapsed.value = tab.value === id ? !collapsed.value : false;
  tab.value = id;
  versionDraft.naming = false;
  // Backups are made in the background; list the latest ones.
  if (id === "versions" && !collapsed.value) refreshVersions();
}

// three.js is big; load Peanut in his own chunk so the editor opens first.
const PeanutBuddy = defineAsyncComponent(() => import("@/peanut/PeanutBuddy.vue"));
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
      <RibbonFile v-if="tab === 'file'" />
      <RibbonHome v-if="tab === 'home'" />
      <RibbonInsert v-if="tab === 'insert'" />
      <RibbonReferences v-if="tab === 'references'" />
      <RibbonDesign v-if="tab === 'design'" />
      <RibbonVersions v-if="tab === 'versions'" />
      <RibbonView v-if="tab === 'view'" />
    </div>
  </nav>
</template>

<style scoped>
/* As wide as the window (the app's column), however wide the open tab: the panel scrolls. */
.ribbon {
  background: linear-gradient(180deg, #f6ecdf, var(--panel));
}
/* The bottom border is the wooden ledge Peanut walks along, shown whether or
   not the panel is collapsed: a thin plank with a lit top edge, a shadowed
   underside, long drifting grain and slow figure. The open tab's wood frame
   carries it up and around that tab. */
.tabs {
  --wood: #d6b187;
  display: flex;
  gap: 2px;
  padding: 0 10px;
  border-bottom: 3px solid transparent;
  background:
    linear-gradient(
        180deg,
        rgba(255, 243, 225, 0.5) 0 1px,
        transparent 1px calc(100% - 1px),
        rgba(110, 66, 32, 0.25) calc(100% - 1px)
      )
      0 100% / 100% 3px no-repeat border-box,
    repeating-linear-gradient(
        179.6deg,
        transparent 0 1px,
        rgba(120, 72, 34, 0.12) 1px 1.5px,
        transparent 1.5px 2.4px
      )
      0 100% / 100% 3px no-repeat border-box,
    repeating-linear-gradient(
        90deg,
        rgba(120, 70, 30, 0) 0,
        rgba(120, 70, 30, 0.08) 41px,
        rgba(120, 70, 30, 0) 67px,
        rgba(255, 236, 205, 0.12) 121px,
        rgba(120, 70, 30, 0) 173px
      )
      0 100% / 100% 3px no-repeat border-box,
    linear-gradient(180deg, #dfc29e, #cda477) 0 100% / 100% 3px no-repeat border-box;
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
/* Framed in wood on three sides and dropped over the plank, so the ledge
   climbs around the open tab and the tab opens into the panel below. Border
   and padding together keep the label where it sits on a closed tab. */
.tab.on {
  height: 31px;
  margin-bottom: -3px;
  padding: 0 11px 6px;
  border: 3px solid transparent;
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
  background:
    linear-gradient(var(--surface), var(--surface)) padding-box,
    linear-gradient(180deg, rgba(255, 243, 225, 0.4), transparent 6px) border-box,
    var(--wood) border-box;
  color: var(--roast);
  font-weight: 650;
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
  overflow-x: auto;
  overflow-y: visible;
}
</style>
