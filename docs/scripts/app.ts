// Runs the app in Wails server mode (bin/peanut-writer-server, built by
// `wails3 task build:server`) for the screenshot and demo-video scripts, with a
// fresh, empty home folder and default settings.

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Page } from "playwright";

export const root = resolve(import.meta.dirname, "../..");
export const server = join(root, "bin/peanut-writer-server");

export type App = { url: string; home: string; stop: () => Promise<void> };

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

// startApp runs the server-mode app in a throwaway home folder, resolving once
// it answers. prepare may put files in that home (and the app's config folder
// in it) before the app starts.
export async function startApp(
  prepare?: (home: string, config: string) => Promise<void>,
): Promise<App> {
  if (!(await Bun.file(server).exists())) {
    console.error(`${server} is missing; build it with \`wails3 task build:server\``);
    process.exit(1);
  }
  const home = await mkdtemp(join(tmpdir(), "peanut-shots-"));
  // The default author is otherwise the computer user's full name.
  const config =
    process.platform === "darwin"
      ? join(home, "Library/Application Support")
      : join(home, ".config");
  await Bun.write(
    join(config, "Peanut Writer/settings.json"),
    JSON.stringify({ author: "Peanut" }),
  );
  await prepare?.(home, join(config, "Peanut Writer"));
  const port = await freePort();
  const app = spawn(server, [], {
    env: {
      ...process.env,
      HOME: home,
      WAILS_SERVER_HOST: "127.0.0.1",
      WAILS_SERVER_PORT: String(port),
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const stop = async () => {
    app.kill();
    await rm(home, { recursive: true, force: true });
  };
  let log = "";
  app.stderr!.on("data", (d) => (log += d));
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null) throw new Error(`the app exited (${app.exitCode}):\n${log}`);
    try {
      if ((await fetch(url)).ok) return { url, home, stop };
    } catch {
      // not listening yet
    }
    await Bun.sleep(100);
  }
  await stop();
  throw new Error(`the app didn't start on port ${port}:\n${log}`);
}

// settle waits until the preview's pages and any template thumbnails are
// typeset and drawn, and the app has stopped talking to the backend.
export async function settle(page: Page) {
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
