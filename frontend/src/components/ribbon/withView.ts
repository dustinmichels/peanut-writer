// withView runs a ribbon command on the editor, if there is one, and gives it
// the focus back.
import type { EditorView } from "@codemirror/view";
import { editor } from "@/lib/store";

export function withView(f: (v: EditorView) => unknown) {
  const v = editor.value;
  if (v) {
    f(v);
    v.focus();
  }
}
