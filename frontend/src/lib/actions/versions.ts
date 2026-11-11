// versions.ts saves and restores named versions and backups.

import { DocService } from "@bindings/peanut-writer";
import { refreshVersions, toast } from "@/lib/store";
import { ensureSaved, loadDoc } from "./documents";
import { run } from "./run";
import { save } from "./saving";

// saveVersion saves the document (asking where, if it's untitled), then keeps
// it as a named version with Word and PDF copies; reports whether it did. The
// name is trimmed, as a template's is: " Draft" would be a folder of its own.
export async function saveVersion(name: string): Promise<boolean> {
  if (!(await save())) return false;
  const v = await run("Save version", () => DocService.SaveVersion(name.trim()));
  if (!v) return false;
  await refreshVersions();
  toast(`Saved the version “${v.name}”.`, "success", {
    label: "Show in Finder",
    run: () => DocService.Reveal(v.path),
  });
  return true;
}

// loadVersion saves the document, then asks and replaces it with a version.
export async function loadVersion(name: string) {
  if (!(await ensureSaved())) return;
  const info = await run("Open version", () => DocService.LoadVersion(name));
  if (!info || info.canceled) return;
  loadDoc(info);
  await refreshVersions();
  toast(`Opened the version “${name}”. The text it replaced is in backups.`, "success");
}

// loadBackup saves the document, then asks and replaces its text with the
// backup at path.
export async function loadBackup(path: string) {
  if (!(await ensureSaved())) return;
  const info = await run("Open backup", () => DocService.LoadBackup(path));
  if (!info || info.canceled) return;
  loadDoc(info);
  await refreshVersions();
  toast("Opened the backup. The text it replaced is in backups.", "success");
}
