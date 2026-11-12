// preview.ts renders the preview of the open document.

import { DocService } from "@bindings/peanut-writer";
import { state } from "./state";
import { errorText } from "./toasts";

let renderTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let pending = false;
// Bumped for each document opened: a render of one opened before is dropped.
let generation = 0;

// clearPreview empties the preview, and what it shows in the outline, for a
// newly opened document.
export function clearPreview() {
  generation++;
  state.pages = [];
  state.outline = [];
  state.currentHeading = 0;
  state.renderError = "";
  state.warnings = [];
}

// scheduleRender renders the preview shortly after typing stops, one render
// at a time, always ending with the latest text.
export function scheduleRender(delay = 280) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderNow, delay);
}

async function renderNow() {
  if (inFlight) {
    pending = true;
    return;
  }
  inFlight = true;
  state.rendering = true;
  const gen = generation;
  // The pages shown, by key: one still the same comes back without its SVG.
  const had = new Map(state.pages.map((p) => [p.key, p.svg]));
  try {
    const res = await DocService.Render(state.content, [...had.keys()]);
    if (res.error === "canceled" || gen !== generation) return;
    state.outline = res.outline ?? [];
    if (res.error) state.renderError = res.error;
    else {
      state.pages = (res.pages ?? []).map((p) => (p.svg ? p : { ...p, svg: had.get(p.key) ?? "" }));
      state.renderError = "";
    }
    state.warnings = res.warnings ?? [];
    state.template = res.template || state.template;
  } catch (e) {
    if (gen === generation) state.renderError = errorText(e);
  } finally {
    inFlight = false;
    state.rendering = pending;
    if (pending) {
      pending = false;
      renderNow();
    }
  }
}
