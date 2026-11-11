// Figures in the editor: the picture (or grid of them) with its caption, a
// grip to move it, buttons to place it and a corner to resize it.

import { EditorView, WidgetType } from "@codemirror/view";
import {
  figureMarkdown,
  type FigureSpec,
  figureSpec,
  type Item,
  plain,
  type Position,
} from "@/lib/markdown";
import { itemsField } from "@/lib/editor/fields";
import { startMove } from "@/lib/editor/move";
import type { Handlers } from "@/lib/editor/types";
import { block } from "./block";
import { gripIcon } from "./icons";

// Pictures by reference, for the open document (replaceDoc clears it).
export const imageCache = new Map<string, Promise<string>>();

const positions: { pos: Position; title: string }[] = [
  { pos: "left", title: "Left" },
  { pos: "", title: "Centered" },
  { pos: "right", title: "Right" },
];

// positionIcon draws a picture (the box) on a line, pushed left, centered
// or right.
function positionIcon(pos: Position): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  const x = pos === "left" ? 1 : pos === "right" ? 7 : 4;
  for (const [rx, ry, rw, rh] of [
    [x, 2, 8, 7],
    [1, 12, 14, 2],
  ]) {
    const r = document.createElementNS(ns, "rect");
    r.setAttribute("x", String(rx));
    r.setAttribute("y", String(ry));
    r.setAttribute("width", String(rw));
    r.setAttribute("height", String(rh));
    r.setAttribute("rx", "1");
    r.setAttribute("fill", "currentColor");
    svg.append(r);
  }
  return svg;
}

// pictureURL is the picture src as a URL, "" when there's no such file (then
// looked for again next time, in case it turns up). The URLs are kept for the
// open document.
export function pictureURL(src: string, imageURL: (src: string) => Promise<string>) {
  let url = imageCache.get(src);
  if (!url) {
    url = imageURL(src).then((u) => {
      if (!u) imageCache.delete(src);
      return u;
    });
    imageCache.set(src, url);
  }
  return url;
}

// loadPicture shows the picture src in img, or a note in its place when
// there's no such file.
function loadPicture(img: HTMLImageElement, src: string, handlers: Handlers) {
  pictureURL(src, handlers.imageURL).then((url) => {
    if (url) img.src = url;
    else {
      img.parentElement?.classList.add("missing");
      const msg = document.createElement("span");
      msg.textContent = `Missing picture: ${src}`;
      msg.ondblclick = img.ondblclick; // opens the figure, as the picture did
      img.replaceWith(msg);
    }
  });
}

export class FigureWidget extends WidgetType {
  constructor(
    readonly item: Item,
    readonly handlers: Handlers,
  ) {
    super();
  }
  eq(o: FigureWidget) {
    const a = this.item;
    const b = o.item;
    return (
      JSON.stringify(a.pictures) === JSON.stringify(b.pictures) &&
      a.columns === b.columns &&
      a.number === b.number &&
      a.caption === b.caption &&
      a.width === b.width &&
      a.label === b.label &&
      a.position === b.position
    );
  }
  toDOM(view: EditorView) {
    const pictures = this.item.pictures ?? [];
    const grid = pictures.length > 1;
    const el = document.createElement("div");
    el.className = "pw-figure";
    if (this.item.position) el.classList.add(this.item.position);
    // The item as the document has it now (this widget may be older).
    const current = () => {
      const pos = view.posAtDOM(el);
      return view.state
        .field(itemsField)
        .find((x) => x.kind === "figure" && pos >= x.from - 1 && pos <= x.to + 1);
    };
    const update = (patch: Partial<FigureSpec>) => {
      const item = current();
      if (!item) return;
      view.dispatch({
        changes: {
          from: item.from,
          to: item.to,
          insert: figureMarkdown({ ...figureSpec(item), ...patch }),
        },
        userEvent: "input",
      });
    };
    const open = () => {
      const item = current();
      if (item) this.handlers.editFigure(item);
    };

    const frame = document.createElement("div");
    frame.className = "pw-figure-frame";
    const w = this.item.width || 0;
    frame.style.width = w > 0 ? `${w}%` : grid ? "100%" : "auto";
    let body: HTMLElement = frame;
    if (grid) {
      body = document.createElement("div");
      body.className = "pw-figure-grid";
      body.style.gridTemplateColumns = `repeat(${this.item.columns || 1}, minmax(0, 1fr))`;
      frame.append(body);
    }
    for (const p of pictures) {
      const img = document.createElement("img");
      img.alt = plain(grid ? p.alt : this.item.caption);
      img.draggable = false;
      img.ondblclick = open;
      if (grid) {
        const cell = document.createElement("div");
        cell.className = "pw-figure-cell";
        cell.append(img);
        body.append(cell);
      } else body.append(img);
      loadPicture(img, p.src, this.handlers);
    }

    const tools = document.createElement("div");
    tools.className = "pw-figure-tools";
    const grip = document.createElement("div");
    grip.className = "pw-figure-grip";
    grip.title = "Drag to move";
    grip.append(gripIcon());
    grip.onpointerdown = (e) => startMove(view, el, grip, e, current);
    tools.append(grip);
    for (const p of positions) {
      const b = document.createElement("button");
      b.className = "pw-figure-tool";
      if ((this.item.position ?? "") === p.pos) b.classList.add("on");
      b.title = p.title;
      b.append(positionIcon(p.pos));
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => update({ position: p.pos });
      tools.append(b);
    }

    // Dragging the corner sets the width as a share of the text width. A
    // centered picture grows on both sides, so it follows the pointer at
    // twice the rate.
    const handle = document.createElement("div");
    handle.className = "pw-figure-handle";
    handle.title = "Drag to resize";
    const size = document.createElement("div");
    size.className = "pw-figure-size";
    handle.onpointerdown = (e) => {
      e.preventDefault();
      const css = getComputedStyle(el);
      const full = el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      const startW = frame.getBoundingClientRect().width;
      const startX = e.clientX;
      const rate = (this.item.position === "right" ? -1 : 1) * (this.item.position ? 1 : 2);
      let pct = 0;
      size.textContent = `${Math.round((startW / full) * 100)}%`;
      handle.setPointerCapture(e.pointerId);
      el.classList.add("resizing");
      const move = (ev: PointerEvent) => {
        pct = Math.round(
          Math.min(100, Math.max(10, ((startW + rate * (ev.clientX - startX)) / full) * 100)),
        );
        frame.style.width = `${pct}%`;
        size.textContent = `${pct}%`;
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        el.classList.remove("resizing");
        if (pct && pct !== this.item.width) update({ width: pct });
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    };
    frame.append(tools, handle, size);

    const cap = document.createElement("div");
    cap.className = "pw-figure-caption";
    const badge = document.createElement("span");
    badge.className = "pw-badge";
    badge.textContent = `Figure ${this.item.number}`;
    cap.append(
      badge,
      document.createTextNode(" " + (plain(this.item.caption) || "No caption yet")),
    );
    const edit = document.createElement("button");
    edit.className = "pw-widget-btn";
    edit.textContent = "Edit figure";
    edit.onmousedown = (e) => e.preventDefault();
    edit.onclick = open;
    cap.append(edit);
    el.append(frame, cap);
    return block(el, "pw-figure-block");
  }
  ignoreEvent() {
    return true;
  }
}
