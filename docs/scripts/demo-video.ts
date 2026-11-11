// A narrated-by-captions demo video of the app, with an original soundtrack,
// written to demo/peanut-writer-demo.mp4 (see demo/README.md).
//
//   mise run docs:demo
//
// Runs the app in Wails server mode (see app.ts) and drives it in WebKit like a
// person would: a drawn cursor glides to each button, text is typed at a human
// pace, and captions explain each step. Frames are screenshots taken as fast as
// WebKit gives them (about 30 a second at 1920×1080) with their timestamps, so
// the video plays back in real time; ffmpeg turns them into an H.264 MP4 and
// demo-music.ts writes a soundtrack to fit.

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { webkit, type Locator, type Page } from "playwright";
import { root, startApp } from "./app";

const outDir = join(root, "demo");
const framesDir = join(outDir, "frames");
const video = join(outDir, "peanut-writer-demo.mp4");

// 1536×864 CSS pixels at 1.25× is 1920×1080: 16:9, and close to the app's
// default 1440×900 window.
const viewport = { width: 1536, height: 864 };
const deviceScaleFactor = 1.25;

// ─── Overlay: cursor, captions, keycaps, title cards and zoom ───────────────

// Lives outside #app so zooming the app doesn't move it.
const overlayCss = `
#demo { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font-family: var(--ui); }
#app { transform-origin: 0 0; transition: transform 1100ms cubic-bezier(.45,.05,.2,1); }
#demo-cursor { position: absolute; left: 0; top: 0; width: 28px; height: 28px;
  transform: translate(980px, 560px); transition: transform var(--dur, 700ms) cubic-bezier(.45,.05,.25,1), opacity 400ms;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
#demo-card.on ~ #demo-cursor { opacity: 0; }
#demo-cursor svg { transform-origin: 4px 3px; transition: transform 110ms; }
#demo-cursor.down svg { transform: scale(.8); }
.demo-ripple { position: absolute; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
  border: 3px solid rgba(193,105,79,.9); animation: demo-ripple 600ms ease-out forwards; }
@keyframes demo-ripple { from { transform: scale(.2); opacity: 1 } to { transform: scale(1.45); opacity: 0 } }
#demo-caption { position: absolute; left: 50%; bottom: 44px; transform: translate(-50%, 24px); opacity: 0;
  transition: opacity 500ms, transform 600ms cubic-bezier(.2,.8,.2,1);
  background: rgba(43,33,24,.92); color: #fff; border-radius: 18px; padding: 15px 28px 17px;
  box-shadow: 0 20px 50px -12px rgba(43,33,24,.55); max-width: 960px; text-align: center; white-space: nowrap; }
#demo-caption.on { opacity: 1; transform: translate(-50%, 0); }
#demo-caption .t { font-size: 25px; font-weight: 650; letter-spacing: -.01em; }
#demo-caption .n { display: inline-block; font-size: 14px; font-weight: 700; color: #2b2118; background: #d99e82;
  border-radius: 999px; padding: 2px 10px; margin-right: 12px; vertical-align: 4px; }
#demo-caption .s { font-size: 16px; color: #f6e3cc; margin-top: 6px; }
/* Room to scroll the last line up above the caption. */
.cm-content { padding-bottom: 45vh !important; }
#demo-card { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; opacity: 0;
  transition: opacity 900ms ease; color: #2b2118;
  background: radial-gradient(1200px 700px at 50% 40%, #fffdf9 0%, #f7f1e8 55%, #f0e2cf 100%); }
#demo-card.on { opacity: 1; }
#demo-card > div > * { opacity: 0; transform: translateY(18px); }
#demo-card.on > div > * { animation: demo-rise 900ms cubic-bezier(.2,.8,.2,1) forwards; }
#demo-card.on > div > :nth-child(2) { animation-delay: 150ms; }
#demo-card.on > div > :nth-child(3) { animation-delay: 300ms; }
#demo-card.on > div > :nth-child(4) { animation-delay: 450ms; }
@keyframes demo-rise { to { opacity: 1; transform: none; } }
#demo-card img { width: 150px; height: 150px; }
#demo-card h1 { font-family: var(--writing); font-size: 84px; font-weight: 700; color: #8b5528; margin: 14px 0 6px;
  letter-spacing: -.01em; }
#demo-card p { font-size: 27px; color: #6e5a48; margin: 0; }
#demo-card .small { font-size: 19px; color: #8a7663; margin-top: 30px; line-height: 1.7; }
#demo-card code { font-family: var(--mono); font-size: 18px; background: #f6e3cc; color: #8b5528;
  padding: 4px 10px; border-radius: 8px; }
`;

const cursorSvg = `<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 2.5 L4 22 L9.2 17.4 L12.6 25.2
  L16.2 23.7 L12.9 16.1 L20 16.1 Z" fill="#1d1712" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

type Rect = { x: number; y: number; width: number; height: number };

class Demo {
  step = 0;
  constructor(private page: Page) {}

  async install() {
    await this.page.addStyleTag({ content: overlayCss });
    await this.page.evaluate((cursor) => {
      const layer = document.createElement("div");
      layer.id = "demo";
      layer.innerHTML = `<div id="demo-card"></div><div id="demo-caption"></div>
        <div id="demo-cursor">${cursor}</div>`;
      document.documentElement.append(layer);
    }, cursorSvg);
  }

  wait = (ms: number) => this.page.waitForTimeout(ms);

  // caption shows a numbered step: a title and a line of explanation.
  async caption(title: string, sub: string) {
    this.step++;
    await this.page.evaluate(
      ([n, title, sub]) => {
        const c = document.getElementById("demo-caption")!;
        const show = () => {
          c.innerHTML = `<div class="t"><span class="n">${n}</span>${title}</div><div class="s">${sub}</div>`;
          c.classList.add("on");
        };
        if (c.classList.contains("on")) {
          c.classList.remove("on");
          setTimeout(show, 450);
        } else show();
      },
      [this.step, title, sub] as const,
    );
    await this.wait(1100);
  }

  async hideCaption() {
    await this.page.evaluate(() => document.getElementById("demo-caption")!.classList.remove("on"));
    await this.wait(500);
  }

  async card(html: string) {
    await this.page.evaluate((html) => {
      const c = document.getElementById("demo-card")!;
      c.innerHTML = `<div>${html}</div>`;
      c.classList.add("on");
    }, html);
  }

  async hideCard() {
    await this.page.evaluate(() => document.getElementById("demo-card")!.classList.remove("on"));
    await this.wait(900);
  }

  private async center(target: Locator | { x: number; y: number }) {
    if (!("boundingBox" in target)) return target;
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error(`${target} isn't visible`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  // point glides the cursor to the target and hovers it.
  async point(target: Locator | { x: number; y: number }, ms = 700) {
    const { x, y } = await this.center(target);
    await this.page.evaluate(
      ([x, y, ms]) => {
        const c = document.getElementById("demo-cursor")!;
        c.style.setProperty("--dur", `${ms}ms`);
        c.style.transform = `translate(${x - 4}px, ${y - 3}px)`;
      },
      [x, y, ms],
    );
    await this.wait(ms + 40);
    await this.page.mouse.move(x, y);
    return { x, y };
  }

  async click(target: Locator | { x: number; y: number }, ms = 700, count = 1) {
    const { x, y } = await this.point(target, ms);
    await this.wait(120);
    await this.page.evaluate(
      ([x, y]) => {
        const c = document.getElementById("demo-cursor")!;
        c.classList.add("down");
        const r = document.createElement("div");
        r.className = "demo-ripple";
        r.style.left = `${x}px`;
        r.style.top = `${y}px`;
        document.getElementById("demo")!.append(r);
        setTimeout(() => r.remove(), 700);
        setTimeout(() => c.classList.remove("down"), 140);
      },
      [x, y],
    );
    await this.page.mouse.click(x, y, { clickCount: count });
    await this.wait(250);
  }

  // type enters text at a human pace: quick runs, small pauses at spaces and
  // longer ones after punctuation.
  async type(text: string, speed = 1) {
    for (const ch of text) {
      if (ch === "\n") await this.page.keyboard.press("Enter");
      else await this.page.keyboard.type(ch);
      let ms = 16 + Math.random() * 26;
      if (ch === " ") ms += 15;
      if (/[.,;:!?]/.test(ch)) ms += 90;
      if (ch === "\n") {
        ms += 150;
        await this.keepVisible();
      }
      await this.wait(ms / speed);
    }
  }

  // keepVisible scrolls the editor so the cursor stays clear of the caption.
  async keepVisible() {
    await this.page.evaluate(() => {
      const sel = getSelection();
      if (!sel?.rangeCount) return;
      const range = sel.getRangeAt(0);
      let rect = range.getBoundingClientRect();
      // A caret on an empty line has no box of its own; use the line's.
      if (!rect.height) {
        const node = range.startContainer;
        rect = (node instanceof Element ? node : node.parentElement!).getBoundingClientRect();
      }
      const limit = innerHeight - 300;
      if (rect.bottom > limit) {
        document
          .querySelector(".cm-scroller")!
          .scrollBy({ top: rect.bottom - limit + 120, behavior: "smooth" });
      }
    });
  }

  // zoom eases the app in so rect fills the frame; zoom() eases back out.
  async zoom(rect?: Rect, max = 2) {
    await this.page.evaluate(
      ([rect, max, w, h]) => {
        const app = document.getElementById("app")!;
        if (!rect) {
          app.style.transform = "";
          return;
        }
        const s = Math.min(max, w / rect.width, h / rect.height);
        const clamp = (v: number, lo: number) => Math.min(0, Math.max(lo, v));
        const tx = clamp(w / 2 - (rect.x + rect.width / 2) * s, w - w * s);
        const ty = clamp(h / 2 - (rect.y + rect.height / 2) * s, h - h * s);
        app.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      },
      [rect ?? null, max, viewport.width, viewport.height] as const,
    );
    await this.wait(1200);
  }
}

// ─── Recorder ────────────────────────────────────────────────────────────────

class Recorder {
  private times: number[] = [];
  private writes: Promise<number>[] = [];
  private running = false;
  private loop?: Promise<void>;

  constructor(private page: Page) {}

  start() {
    this.running = true;
    this.loop = (async () => {
      while (this.running) {
        const t = performance.now();
        const jpeg = await this.page.screenshot({
          type: "jpeg",
          quality: 92,
          scale: "device",
          caret: "initial",
        });
        const name = `f${String(this.times.length).padStart(6, "0")}.jpg`;
        this.times.push(t);
        this.writes.push(Bun.write(join(framesDir, name), jpeg));
      }
    })();
  }

  // stop ends the capture and writes the ffmpeg concat list, returning the
  // video's length in seconds.
  async stop(): Promise<number> {
    this.running = false;
    await this.loop;
    await Promise.all(this.writes);
    const end = performance.now();
    const lines = this.times.map((t, i) => {
      const next = this.times[i + 1] ?? end;
      return `file 'f${String(i).padStart(6, "0")}.jpg'\nduration ${((next - t) / 1000).toFixed(4)}`;
    });
    // The concat demuxer ignores the last duration unless the file repeats.
    lines.push(`file 'f${String(this.times.length - 1).padStart(6, "0")}.jpg'`);
    await Bun.write(join(framesDir, "frames.txt"), lines.join("\n") + "\n");
    return (end - this.times[0]) / 1000;
  }
}

// ─── The script ──────────────────────────────────────────────────────────────

async function perform(page: Page, d: Demo) {
  const tab = async (name: string) => {
    const t = page.locator("button.tab", { hasText: new RegExp(`^\\s*${name}\\s*$`) });
    // Clicking the open tab folds the ribbon away.
    if (!(await t.evaluate((b) => b.classList.contains("on")))) await d.click(t);
  };
  const ribbon = (label: string) => page.locator(".ribbon button", { hasText: label }).first();
  const modal = page.locator(".modal");
  const field = (label: string) =>
    modal.locator("label.field", { hasText: label }).locator("input, textarea").first();
  const preview = page.locator(".preview");
  const previewTop = async (height: number): Promise<Rect> => {
    const page1 = (await preview.locator(".page").first().boundingBox())!;
    return { x: page1.x, y: page1.y, width: page1.width, height };
  };
  const editorEnd = async () => {
    await page.locator(".cm-content").focus();
    await page.keyboard.press("Meta+ArrowDown");
  };

  // Title card over the start dialog.
  await d.card(`<img src="/peanut.svg" alt=""><h1>Peanut Writer</h1>
    <p>The word processor that writes Markdown</p>
    <p class="small">Figures, tables and equations that number themselves · PDF, Word and web export</p>`);
  await d.wait(3600);
  await d.hideCard();

  await d.caption("Start a document", "Create one, open one, or begin with a blank page.");
  await d.point(page.locator(".modal button", { hasText: "Open Sample" }), 900);
  await d.wait(300);
  await d.click(page.locator(".modal button", { hasText: "Blank Document" }));
  await d.wait(500);

  await d.caption(
    "Type on the left, see the page on the right",
    "The preview is the real typeset page — the same one your PDF will be.",
  );
  await d.click(page.getByText("Begin typing"));
  await d.type(
    "# Why Peanuts Matter\n\nPeanuts are **legumes**, not nuts. They flower above ground, then bury their pods in the soil to ripen.\n\n",
  );
  await d.wait(1200);
  await d.zoom(await previewTop(170), 2.2);
  await d.wait(1800);
  await d.zoom();

  await d.caption(
    "Format from the ribbon — or just type Markdown",
    "Select a word and click Italic, or wrap it in underscores.",
  );
  // Double-click "soil" to select it.
  const soil = await page.evaluate(() => {
    for (const el of document.querySelectorAll(".cm-line")) {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const i = n.nodeValue!.indexOf("soil");
        if (i < 0) continue;
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + 4);
        const b = r.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
    }
    throw new Error("no “soil” in the editor");
  });
  await d.click(soil, 800, 2);
  await d.wait(400);
  await d.click(page.locator('.ribbon button[title^="Italic"]'));
  await d.wait(900);
  await editorEnd();
  await d.type("## Varieties\n\n", 1.2);
  await d.wait(400);

  await d.caption(
    "Insert a table — it numbers itself",
    "Give it a caption and it becomes Table 1, in the right style for every template.",
  );
  await tab("Insert");
  await d.click(ribbon("Table"));
  const cell = (c: number, r: number) => page.locator(".popover .grid span").nth(r * 8 + c);
  for (const [c, r] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
    [2, 2],
  ])
    await d.point(cell(c, r), 160);
  await d.click(cell(2, 2), 150);
  await modal.waitFor();
  await d.wait(500);
  await d.click(field("Caption"));
  await d.type("Peanut varieties", 1.4);
  const cells = [
    ["Variety", "Grown in", "Best for"],
    ["Runner", "Georgia", "Peanut butter"],
    ["Virginia", "Virginia", "Roasting"],
  ];
  await d.click(modal.locator('[data-cell="-1:0"]'), 450);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (r || c) await page.keyboard.press("Tab");
      await page.keyboard.press("Meta+a");
      await d.type(cells[r][c], 2);
    }
  }
  await d.wait(600);
  await d.click(modal.locator("button[type=submit]"));
  await d.wait(1600);

  await d.caption(
    "Cross-references keep up",
    "Type @ to refer to any figure, table or equation. Move it, and the number follows.",
  );
  await editorEnd();
  await d.type("\n\nMost peanut butter starts as Runners (see @", 1.2);
  await page.locator(".cm-tooltip-autocomplete").waitFor();
  await d.wait(1100);
  await page.keyboard.press("Enter");
  await d.type(").\n\n", 1.2);
  await d.wait(1200);

  await d.caption(
    "Write math in LaTeX",
    "A live preview as you type. Named equations are numbered, too.",
  );
  await d.click(ribbon("Equation"));
  await modal.waitFor();
  await d.wait(300);
  await d.type("Y = \\frac{n \\cdot \\bar{w}}{A}", 1.1);
  await d.wait(500);
  await d.click(field("Reference name"), 500);
  await d.type("eq:yield", 1.4);
  await d.wait(900);
  await d.click(modal.locator("button[type=submit]"));
  await d.wait(1500);
  await d.zoom(await previewTop(330), 1.9);
  await d.wait(2200);
  await d.zoom();

  await d.caption(
    "Add a title, author and abstract",
    "Each template lays out the title block its own way.",
  );
  await d.click(page.locator("button", { hasText: "Edit header" }));
  await modal.waitFor();
  await d.click(field("Title"), 500);
  await d.type("A Field Guide to Peanuts", 1.4);
  await d.click(field("Subtitle"), 450);
  await d.type("Small legume, big ideas", 1.6);
  await d.click(field("Author"), 450);
  await page.keyboard.press("Meta+a");
  await d.type("Peanut", 1.6);
  await d.click(field("Abstract"), 450);
  await d.type("Where peanuts grow, which kinds we eat, and how much a field yields.", 2);
  await d.wait(500);
  await d.click(modal.locator("button[type=submit]"));
  await d.wait(1500);
  await d.zoom(await previewTop(300), 2);
  await d.wait(2200);
  await d.zoom();

  await d.caption(
    "Find any command in the palette",
    "⇧⌘P — here, Lorem Ipsum fills the page with sample figures and tables.",
  );
  await d.click(page.locator('button[title^="Commands"]'));
  await page.locator(".palette input").waitFor();
  await d.type("lorem", 0.8);
  await d.wait(700);
  await page.keyboard.press("Enter");
  await d.wait(2200);
  // Back to the top, where the title block is.
  await page.locator(".cm-content").focus();
  await page.keyboard.press("Meta+ArrowUp");
  await d.wait(600);
  await page.evaluate(() =>
    document.querySelector(".cm-scroller")!.scrollTo({ top: 0, behavior: "smooth" }),
  );
  await d.wait(1200);

  await d.caption(
    "Pick a look on the Design tab",
    "A dozen templates, from a Word-like report to a LaTeX-style article. Your words stay the same.",
  );
  await tab("Design");
  await d.wait(900);
  for (const name of ["Academic", "Report", "Elegant", "Journal", "Peanut", "Classic"]) {
    await d.click(ribbon(name), 650);
    await d.wait(name === "Classic" ? 1200 : 1900);
  }

  await d.caption(
    "It's plain Markdown underneath",
    "View → Markdown (⌘/) shows the text your file holds — readable in any app, for decades.",
  );
  await tab("View");
  await d.click(ribbon("Markdown"));
  await d.wait(1500);
  await d.point({ x: 560, y: 520 }, 600);
  await page.mouse.wheel(0, 420);
  await d.wait(2200);
  await d.click(ribbon("Markdown"));
  await d.wait(600);

  await d.caption("Jump around with the outline", "The editor and the preview scroll together.");
  const outline = page.locator("nav.outline button");
  await d.click(outline.filter({ hasText: "Methods" }).first());
  await d.wait(1800);
  await d.click(outline.filter({ hasText: "Conclusion" }).first());
  await d.wait(1800);
  await d.click(outline.filter({ hasText: "Why Peanuts Matter" }).first());
  await d.wait(1500);

  await d.caption(
    "Export to PDF, Word or a web page",
    "One click. Or Sync files keeps fresh copies beside your document.",
  );
  await d.click(page.locator("button.btn.primary", { hasText: "Export" }));
  const menu = page.locator(".menu button");
  for (let i = 0; i < 3; i++) await d.point(menu.nth(i), 450);
  await d.wait(900);
  await d.point(page.locator("button", { hasText: "Sync files" }).first(), 600);
  await d.wait(1200);
  await d.hideCaption();

  await d.card(`<img src="/peanut.svg" alt=""><h1>Peanut Writer</h1>
    <p>Free for macOS</p>
    <p class="small"><code>brew install --cask dustinmichels/tap/peanut-writer</code><br>
    dustinmichels.github.io/peanut-writer</p>`);
  await d.wait(5500);
}

// ─── Main ────────────────────────────────────────────────────────────────────

await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });

const app = await startApp();
const browser = await webkit.launch();
let seconds: number;
try {
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  context.setDefaultTimeout(8000);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`  page error: ${e.message}`));
  await page.goto(app.url);
  await page.locator(".modal button", { hasText: "Blank Document" }).waitFor();
  const demo = new Demo(page);
  await demo.install();
  await demo.card(""); // a blank card hides the app until the title rises
  await page.waitForTimeout(1000);
  const recorder = new Recorder(page);
  recorder.start();
  try {
    await perform(page, demo);
  } finally {
    seconds = await recorder.stop();
  }
  console.log(`  recorded ${seconds.toFixed(1)}s`);
} finally {
  await browser.close();
  await app.stop();
}

const music = join(outDir, "soundtrack.wav");
const run = async (cmd: string[]) => {
  const p = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit" });
  if ((await p.exited) !== 0) throw new Error(`${cmd[0]} failed`);
};
await run(["bun", join(import.meta.dirname, "demo-music.ts"), seconds.toFixed(2), music]);
await run([
  "ffmpeg",
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  join(framesDir, "frames.txt"),
  "-i",
  music,
  "-vf",
  "fps=30,format=yuv420p",
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "18",
  "-tune",
  "animation",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-shortest",
  "-movflags",
  "+faststart",
  video,
]);
await rm(framesDir, { recursive: true, force: true });
console.log(`  → ${video.slice(root.length + 1)}`);
