// run.ts holds what every action shares: the app's links, the editor view
// and error reporting.

import { editor, errorText, toast } from "@/lib/store";

export const docsUrl = "https://dustinmichels.github.io/peanut-writer/";
export const repoUrl = "https://github.com/dustinmichels/peanut-writer";

export function view() {
  const v = editor.value;
  if (!v) throw new Error("the editor isn't ready");
  return v;
}

export async function run<T>(what: string, f: () => Promise<T>): Promise<T | undefined> {
  try {
    return await f();
  } catch (e) {
    toast(`${what}: ${errorText(e)}`, "error");
    return undefined;
  }
}
