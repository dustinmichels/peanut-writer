// useStartup loads what the app opens with, once it's mounted: the templates,
// Typst's state, the version, and the document Finder opened, if any.
import { onMounted } from "vue";
import { DocService } from "@bindings/peanut-writer";
import { loadDoc } from "@/lib/actions";
import { errorText, state, toast } from "@/lib/store";

export function useStartup() {
  onMounted(async () => {
    try {
      const info = await DocService.Startup();
      state.templates = info.templates ?? [];
      state.typstError = info.typstError;
      state.version = info.version;
      loadDoc(info.document);
      // Unless Finder opened a document, offer what to open.
      if (!info.document.path) state.dialog = { kind: "start", files: info.recent ?? [] };
    } catch (e) {
      toast(`Couldn't start: ${errorText(e)}`, "error");
    }
  });
}
