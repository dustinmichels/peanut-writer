// useScrollSync scrolls the editor and the preview together, from when both
// are mounted, unless the link between them is broken.
import { onMounted, onUnmounted, type Ref, watch } from "vue";
import type PreviewPane from "@/components/panes/PreviewPane.vue";
import { syncScroll } from "@/lib/scrollsync";
import { editor, state } from "@/lib/store";

export function useScrollSync(
  preview: Readonly<Ref<InstanceType<typeof PreviewPane> | null>>,
  previewShown: Readonly<Ref<boolean>>,
) {
  let sync: ReturnType<typeof syncScroll> | undefined;

  // Hidden, the preview can't scroll; shown again, it lines up with the editor.
  watch(
    previewShown,
    (shown) => {
      if (shown && state.scrollLinked) sync?.link();
    },
    { flush: "post" },
  );

  onMounted(() => {
    // The panes mount first, so both scrollers exist.
    sync = syncScroll(editor.value!, preview.value!.scroller!, preview.value!.headingTops);
  });
  onUnmounted(() => sync?.stop());

  return { link: () => sync?.link(), unlink: () => sync?.unlink() };
}
