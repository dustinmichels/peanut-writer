// The Versions tab's new version, kept while other tabs show: whether its name
// field is open, the name typed so far, and whether it's being saved.
import { reactive } from "vue";
import { saveVersion } from "@/lib/actions";

export const versionDraft = reactive({ naming: false, name: "", saving: false });

// saveDraft keeps the document as it is now under the draft's name, then
// clears and closes the name field.
export async function saveDraft() {
  if (!versionDraft.name.trim() || versionDraft.saving) return;
  versionDraft.saving = true;
  try {
    if (await saveVersion(versionDraft.name)) {
      versionDraft.name = "";
      versionDraft.naming = false;
    }
  } finally {
    versionDraft.saving = false;
  }
}
