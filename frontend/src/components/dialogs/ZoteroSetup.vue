<script setup lang="ts">
// ZoteroSetup walks through what citing needs, ticking off what's ready:
// Zotero open, with the Better BibTeX add-on.
import { CheckCircle2, Circle, ExternalLink, RefreshCw } from "lucide-vue-next";
import { Browser } from "@wailsio/runtime";
import type { Status } from "@bindings/peanut-writer/internal/zotero/models";
import { docsUrl } from "@/lib/actions";

defineProps<{ status: Status | null; checking: boolean }>();
const emit = defineEmits<{ check: [] }>();

const links = {
  zotero: "https://www.zotero.org/download/",
  bbt: "https://github.com/retorquere/zotero-better-bibtex/releases/latest",
  bbtHelp: "https://retorque.re/zotero-better-bibtex/installation/",
  guide: `${docsUrl}guide/citations`,
};
const open = (url: string) => Browser.OpenURL(url);
</script>

<template>
  <div class="setup">
    <p class="why">
      Peanut Writer finds your sources in <b>Zotero</b>, the free reference manager, through
      <b>Better BibTeX</b>, a free Zotero add-on. Better BibTeX gives each source a short citation
      key, like <code>smith2020</code>, and lets other apps search your library and copy the sources
      you cite. Zotero alone doesn't. Set them up once:
    </p>
    <ol>
      <li :class="{ done: status?.zotero }">
        <CheckCircle2 v-if="status?.zotero" :size="18" class="tick" />
        <Circle v-else :size="18" />
        <div>
          <b>Open Zotero</b>
          <span v-if="status?.zotero" class="ok">Zotero is open.</span>
          <p v-else>
            Install Zotero 7 if you haven't, and open it. Peanut Writer reaches it while it runs.
            <a href="#" @click.prevent="open(links.zotero)"
              >Download Zotero <ExternalLink :size="11"
            /></a>
          </p>
        </div>
      </li>
      <li :class="{ done: status?.betterBibTeX }">
        <CheckCircle2 v-if="status?.betterBibTeX" :size="18" class="tick" />
        <Circle v-else :size="18" />
        <div>
          <b>Add Better BibTeX to Zotero</b>
          <span v-if="status?.betterBibTeX" class="ok"
            >Better BibTeX {{ status.version }} is ready.</span
          >
          <ol v-else class="steps">
            <li>
              Download the <code>.xpi</code> file of the latest release:
              <a href="#" @click.prevent="open(links.bbt)"
                >Better BibTeX releases <ExternalLink :size="11"
              /></a>
              (in Firefox, right-click it and choose <i>Save Link As</i>).
            </li>
            <li>In Zotero, choose <b>Tools → Plugins</b>.</li>
            <li>
              Drag the <code>.xpi</code> file onto that window, or use its gear menu →
              <b>Install Plugin From File…</b>
            </li>
            <li>Restart Zotero when it asks, then let it finish setting up keys.</li>
          </ol>
          <p v-if="!status?.betterBibTeX" class="more">
            <a href="#" @click.prevent="open(links.bbtHelp)"
              >Better BibTeX's install guide <ExternalLink :size="11"
            /></a>
          </p>
        </div>
      </li>
    </ol>
    <p v-if="status?.error" class="error">{{ status.error }}</p>
    <div class="actions">
      <button type="button" class="btn" :disabled="checking" @click="emit('check')">
        <RefreshCw :size="14" :class="{ spin: checking }" />
        {{ checking ? "Checking…" : "Check again" }}
      </button>
      <a href="#" @click.prevent="open(links.guide)">About citations <ExternalLink :size="11" /></a>
    </div>
  </div>
</template>

<style scoped>
.setup {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.why {
  margin: 0;
  color: var(--quote);
  line-height: 1.45;
}
ol {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
ol > li {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--panel);
}
ol > li > svg {
  flex: none;
  margin-top: 1px;
  color: var(--muted);
}
ol > li.done > svg {
  color: var(--accent);
}
ol > li p {
  margin: 4px 0 0;
}
.ok {
  margin-left: 8px;
  color: var(--muted);
}
ol.steps {
  margin: 6px 0 0;
  padding-left: 18px;
  list-style: decimal;
  gap: 4px;
}
ol.steps > li {
  display: list-item;
  padding: 0;
  background: none;
}
.more {
  font-size: 12px;
}
a {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--accent-ink);
}
code {
  font-family: var(--mono);
  font-size: 0.9em;
}
.error {
  margin: 0;
  color: var(--danger);
}
.actions {
  display: flex;
  align-items: center;
  gap: 14px;
}
.actions .btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
