// block, the wrapper of the editor's block widgets.

// block wraps a block widget's element. CodeMirror measures a widget without
// its margins, so the space around it is the wrapper's padding.
export function block(el: HTMLElement, cls: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = cls;
  wrap.append(el);
  return wrap;
}
