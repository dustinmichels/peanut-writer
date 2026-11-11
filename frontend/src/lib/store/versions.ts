// versions.ts keeps the open document's named versions and backups listed.

import { watch } from "vue";
import { DocService } from "@bindings/peanut-writer";
import { state } from "./state";
import { errorText, toast } from "./toasts";

// refreshVersions lists the open document's named versions and backups,
// unless another is opened meanwhile.
export async function refreshVersions() {
  const path = state.path;
  try {
    const [vs, bs] = await Promise.all([DocService.Versions(), DocService.Backups()]);
    if (state.path !== path) return;
    state.versions = vs ?? [];
    state.backups = bs ?? [];
  } catch (e) {
    toast(`Versions: ${errorText(e)}`, "error");
  }
}
watch(() => state.path, refreshVersions);
