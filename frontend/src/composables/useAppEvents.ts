// useAppEvents wires the app to the world outside its window: the native
// menu, the Dock's recent documents, backup failures, files dropped on the
// window, and coming back to it.
import { onMounted, onUnmounted } from "vue";
import { Events } from "@wailsio/runtime";
import { menu, openRecent, refreshTemplates } from "@/lib/actions";
import { toast } from "@/lib/store";

export function useAppEvents() {
  let offMenu: (() => void) | undefined;
  let offRecent: (() => void) | undefined;
  let offBackup: (() => void) | undefined;

  onMounted(() => {
    offMenu = Events.On("menu", (e: { data: string }) => menu(e.data));
    offRecent = Events.On("openRecent", (e: { data: string }) => openRecent(e.data));
    offBackup = Events.On("backupFailed", (e: { data: string }) =>
      toast(`Backup: ${e.data}`, "error"),
    );
    // A file dropped outside the editor mustn't replace the page.
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => e.preventDefault());
    // User templates are edited in a text editor (Design → Edit): coming back
    // picks up their changes.
    window.addEventListener("focus", () => void refreshTemplates());
  });
  onUnmounted(() => {
    offMenu?.();
    offRecent?.();
    offBackup?.();
  });
}
