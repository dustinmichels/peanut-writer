// toasts.ts shows brief messages in the corner of the window.

import { state } from "./state";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error" | "success";
  action?: { label: string; run: () => void };
}

let toastId = 0;
export function toast(text: string, tone: Toast["tone"] = "info", action?: Toast["action"]) {
  // The same message again (a change failing each time it's saved, say)
  // replaces the one shown rather than stacking up over the window.
  const same = state.toasts.findIndex((t) => t.text === text && t.tone === tone);
  if (same >= 0) state.toasts.splice(same, 1);
  const t = { id: ++toastId, text, tone, action };
  state.toasts.push(t);
  setTimeout(() => dismiss(t.id), action ? 8000 : 4000);
}

export function dismiss(id: number) {
  const i = state.toasts.findIndex((t) => t.id === id);
  if (i >= 0) state.toasts.splice(i, 1);
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) return String(e.message);
  return String(e);
}
