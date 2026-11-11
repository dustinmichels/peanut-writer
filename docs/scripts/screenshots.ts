// Screenshots of the app for the docs, written to docs/public/screenshots/.
//
//   mise run docs:screenshots            every scene
//   mise run docs:screenshots -- editor  only the named scenes
//
// Each scene runs the app in Wails server mode (see app.ts) with a fresh, empty
// home folder and default settings, opens the sample (the welcome guide) from
// the start dialog, and drives it in WebKit (what the macOS app renders with).
// Pages reference the images as /screenshots/<name>.png.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { webkit, type Browser, type Page } from "playwright";
import { root, settle, startApp } from "./app";

const outDir = join(root, "docs/public/screenshots");

// The app window's default size (main.go), at Retina density.
const viewport = { width: 1440, height: 900 };
const deviceScaleFactor = 2;

type Scene = {
  name: string;
  // Puts the app in the state to capture; it starts on the welcome guide.
  setup?: (page: Page) => Promise<void>;
  // Captures the top of the window, down to the bottom of this element.
  clipTo?: string;
};

const tab = (page: Page, name: string) =>
  page.locator("button.tab", { hasText: new RegExp(`^\\s*${name}\\s*$`) }).click();
const ribbonButton = (page: Page, label: string) =>
  page.locator(".ribbon button", { hasText: label }).first().click();

const scenes: Scene[] = [
  { name: "editor" },
  {
    name: "design-tab",
    setup: (page) => tab(page, "Design"),
    clipTo: "nav.ribbon",
  },
  {
    name: "customize",
    setup: async (page) => {
      await tab(page, "Design");
      await ribbonButton(page, "Customize");
      await page.locator("section.customize").waitFor();
    },
  },
  {
    name: "command-palette",
    setup: async (page) => {
      await page.locator('button[title^="Commands"]').click();
      await page.locator(".palette input").fill("ex");
    },
  },
  {
    name: "markdown-view",
    setup: async (page) => {
      await tab(page, "View");
      await ribbonButton(page, "Markdown");
    },
  },
  {
    name: "outline",
    setup: async (page) => {
      await tab(page, "View");
      await ribbonButton(page, "Outline");
      await page.locator("nav.outline").waitFor();
    },
  },
  {
    name: "settings",
    setup: async (page) => {
      await page.locator('button[title^="Settings"]').first().click();
      await page.locator(".modal").waitFor();
    },
  },
];

async function shoot(browser: Browser, scene: Scene) {
  const { url, home, stop } = await startApp();
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  try {
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error(`  ${scene.name}: page error: ${e.message}`));
    await page.goto(url);
    await page.locator(".modal button", { hasText: "Open Sample" }).click();
    await settle(page);
    await scene.setup?.(page);
    await settle(page);
    // Paths in the throwaway home folder read as the reader's own.
    await page.evaluate((home) => {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (n.nodeValue?.includes(home)) n.nodeValue = n.nodeValue.replaceAll(home, "~");
      }
    }, home);
    const path = join(outDir, `${scene.name}.png`);
    let clip;
    if (scene.clipTo) {
      const box = await page.locator(scene.clipTo).first().boundingBox();
      if (!box) throw new Error(`${scene.name}: ${scene.clipTo} isn't visible`);
      clip = { x: 0, y: 0, width: viewport.width, height: Math.ceil(box.y + box.height) };
    }
    await page.screenshot({ path, clip, animations: "disabled", caret: "hide" });
    console.log(`  ${scene.name} → ${path.slice(root.length + 1)}`);
  } finally {
    await context.close();
    await stop();
  }
}

const wanted = process.argv.slice(2);
const unknown = wanted.filter((n) => !scenes.some((s) => s.name === n));
if (unknown.length) {
  console.error(
    `unknown scene(s): ${unknown.join(", ")}\nscenes: ${scenes.map((s) => s.name).join(", ")}`,
  );
  process.exit(2);
}
await mkdir(outDir, { recursive: true });
const browser = await webkit.launch();
try {
  for (const scene of scenes.filter((s) => !wanted.length || wanted.includes(s.name))) {
    await shoot(browser, scene);
  }
} finally {
  await browser.close();
}
