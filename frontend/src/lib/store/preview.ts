// preview.ts renders the preview of the open document.

import { DocService } from "@bindings/peanut-writer";
import { state } from "./state";
import { errorText } from "./toasts";

let renderTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let pending = false;

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
  try {
    const res = await DocService.Render(state.content);
    if (res.error === "canceled") return;
    state.outline = res.outline ?? [];
    if (res.error) state.renderError = res.error;
    else {
      state.pages = res.pages ?? [];
      state.renderError = "";
    }
    state.warnings = res.warnings ?? [];
    state.template = res.template || state.template;
  } catch (e) {
    state.renderError = errorText(e);
  } finally {
    inFlight = false;
    state.rendering = pending;
    if (pending) {
      pending = false;
      renderNow();
    }
  }
}
