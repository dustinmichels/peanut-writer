// useAppEvents wires the app to the world outside its window: the native
// menu, the Dock's recent documents, backups made and failed, files dropped
// on the window, and coming back to it.
import { onMounted, onUnmounted } from "vue";
import { Events } from "@wailsio/runtime";
import { menu, openRecent, refreshTemplates } from "@/lib/actions";
import { refreshVersions, toast } from "@/lib/store";

export function useAppEvents() {
  let offMenu: (() => void) | undefined;
  let offRecent: (() => void) | undefined;
  let offBackup: (() => void) | undefined;
  let offBackedUp: (() => void) | undefined;
  // A file dropped outside the editor mustn't replace the page.
  const block = (e: DragEvent) => e.preventDefault();
  // User templates are edited in a text editor (Design → Edit): coming back
  // picks up their changes.
  const focused = () => void refreshTemplates();

  onMounted(() => {
    offMenu = Events.On("menu", (e: { data: string }) => menu(e.data));
    offRecent = Events.On("openRecent", (e: { data: string }) => openRecent(e.data));
    offBackup = Events.On("backupFailed", (e: { data: string }) =>
      toast(`Backup: ${e.data}`, "error"),
    );
    offBackedUp = Events.On("backedUp", () => void refreshVersions());
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    window.addEventListener("focus", focused);
  });
  onUnmounted(() => {
    offMenu?.();
    offRecent?.();
    offBackup?.();
    offBackedUp?.();
    window.removeEventListener("dragover", block);
    window.removeEventListener("drop", block);
    window.removeEventListener("focus", focused);
  });
}
