// useSplitter sizes the editor against the preview: dragging the splitter
// between them sets the split, which is remembered.
import type { Ref } from "vue";
import { state } from "@/lib/store";

export function useSplitter(main: Readonly<Ref<HTMLElement | null>>) {
  function startResize(e: PointerEvent) {
    const el = main.value;
    if (!el) return;
    const target = e.currentTarget as HTMLElement; // the splitter, which captures the pointer
    target.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    // The split is between editor and preview; the outline and versions, when shown, are left of both.
    const left = (target.previousElementSibling as HTMLElement).getBoundingClientRect().left;
    const move = (ev: PointerEvent) => {
      state.split = Math.min(0.75, Math.max(0.28, (ev.clientX - left) / (rect.right - left)));
    };
    // Fires after pointerup and pointercancel alike.
    const done = () => {
      target.removeEventListener("pointermove", move);
      localStorage.setItem("split", String(state.split));
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("lostpointercapture", done, { once: true });
  }

  return { startResize };
}
