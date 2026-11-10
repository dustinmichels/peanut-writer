// Screenshots of the app for the docs, written to docs/public/screenshots/.
//
//   mise run docs:screenshots            every scene
//   mise run docs:screenshots -- editor  only the named scenes
//
// Each scene runs the app in Wails server mode (bin/peanut-writer-server, built
// by the mise task) with a fresh, empty home folder, so it starts on the welcome
// guide with default settings, and drives it in WebKit (what the macOS app
// renders with). Pages reference the images as /screenshots/<name>.png.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { webkit, type Browser, type Page } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const server = join(root, "bin/peanut-writer-server");
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

async function freePort(): Promise<number> {
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  const s = createServer();
  s.on("error", reject);
  s.listen(0, "127.0.0.1", () => {
    const { port } = s.address() as { port: number };
    s.close(() => resolve(port));
  });
  return promise;
}

// startApp runs the server-mode app with home as its home folder, resolving
// once it answers on port.
async function startApp(home: string, port: number): Promise<ChildProcess> {
  const app = spawn(server, [], {
    env: { ...process.env, HOME: home, WAILS_SERVER_HOST: "127.0.0.1", WAILS_SERVER_PORT: String(port) },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let log = "";
  app.stderr!.on("data", (d) => (log += d));
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null) throw new Error(`the app exited (${app.exitCode}):\n${log}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return app;
    } catch {
      // not listening yet
    }
    await Bun.sleep(100);
  }
  app.kill();
  throw new Error(`the app didn't start on port ${port}:\n${log}`);
}

// settle waits until the preview's pages and any template thumbnails are
// typeset and drawn, and the app has stopped talking to the backend.
async function settle(page: Page) {
  await page.locator(".preview .page img").first().waitFor();
  await page.waitForFunction(
    () =>
      !document.querySelector(".thumb .loading") &&
      [...document.querySelectorAll<HTMLImageElement>(".preview .page img, .thumb img")].every(
        (i) => i.complete,
      ),
  );
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800); // debounced re-renders and transitions
}

async function shoot(browser: Browser, scene: Scene) {
  const home = await mkdtemp(join(tmpdir(), "peanut-shots-"));
  // The default author is otherwise the computer user's full name.
  const config =
    process.platform === "darwin" ? join(home, "Library/Application Support") : join(home, ".config");
  await Bun.write(join(config, "Peanut Writer/settings.json"), JSON.stringify({ author: "Peanut" }));
  const port = await freePort();
  const app = await startApp(home, port);
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  try {
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error(`  ${scene.name}: page error: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/`);
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
    app.kill();
    await rm(home, { recursive: true, force: true });
  }
}

const wanted = process.argv.slice(2);
const unknown = wanted.filter((n) => !scenes.some((s) => s.name === n));
if (unknown.length) {
  console.error(`unknown scene(s): ${unknown.join(", ")}\nscenes: ${scenes.map((s) => s.name).join(", ")}`);
  process.exit(2);
}
if (!(await Bun.file(server).exists())) {
  console.error(`${server} is missing; build it with \`wails3 task build:server\``);
  process.exit(1);
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
