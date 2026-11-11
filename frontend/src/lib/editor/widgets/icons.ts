// Icons drawn for the editor's widgets.

// gripIcon draws two columns of dots: something to take hold of.
export function gripIcon(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  for (const cx of [6, 10]) {
    for (const cy of [3.5, 8, 12.5]) {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", String(cx));
      c.setAttribute("cy", String(cy));
      c.setAttribute("r", "1.4");
      c.setAttribute("fill", "currentColor");
      svg.append(c);
    }
  }
  return svg;
}
