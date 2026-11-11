// Handlers are how the editor reaches the app: dialogs to open, pictures to
// find, and word of each change.

import { EditorState } from "@codemirror/state";
import type { Item, RefAt } from "@/lib/markdown";

export interface Handlers {
  editFigure(item: Item): void;
  editTable(item: Item): void;
  editProperties(): void;
  editRef(at: RefAt): void;
  // A footnote mark was clicked: open its note to edit (or write, if none).
  editNote(label: string): void;
  // Dropped files arrive through Wails (see EditorPane), not DOM drop events.
  pasteImages(files: File[], pos: number): void;
  imageURL(src: string): Promise<string>;
  changed(state: EditorState, docChanged: boolean): void;
}
