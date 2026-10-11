import {
  applyCommand,
  checkpoint,
  recoverState,
  validateState,
} from "../shared/engine";
import { createState } from "../shared/model";
import type {
  Command,
  CommandResult,
  FocusBridge,
  FocusState,
  Snapshot,
} from "../shared/model";

// This adapter is for the browser design preview. Electron always uses its main-process service.
export function createBrowserBridge(): FocusBridge {
  const key = "cozy-focus-preview-v1";
  let state: FocusState;
  let error: string | null = null;
  try {
    const saved = localStorage.getItem(key);
    state = saved
      ? recoverState(validateState(JSON.parse(saved)))
      : createState(Date.now());
  } catch {
    state = createState(Date.now());
    error =
      "The browser preview could not read its saved list. Export or recover browser storage before making changes.";
  }
  const listeners = new Set<(snapshot: Snapshot) => void>();
  const snapshot = (): Snapshot => ({
    state: structuredClone(state),
    now: Date.now(),
    storageError: error,
    recoveryMessage: null,
  });
  const broadcast = () => listeners.forEach((listener) => listener(snapshot()));
  const persist = (next: FocusState): CommandResult => {
    if (error) return { ok: false, error };
    try {
      localStorage.setItem(key, JSON.stringify(next));
      state = next;
      broadcast();
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: "Browser storage is unavailable. This change was not saved.",
      };
    }
  };
  const onBeforeUnload = () => {
    const next = checkpoint(state, Date.now());
    next.timer.startedAt = null;
    persist(next);
  };
  let checkpointInterval: number | null = null;
  const start = () => {
    if (checkpointInterval !== null) return;
    window.addEventListener("beforeunload", onBeforeUnload);
    checkpointInterval = window.setInterval(() => {
      if (state.timer.startedAt !== null)
        persist(checkpoint(state, Date.now()));
    }, 5000);
  };
  const cleanup = () => {
    if (checkpointInterval !== null) window.clearInterval(checkpointInterval);
    checkpointInterval = null;
    window.removeEventListener("beforeunload", onBeforeUnload);
  };
  window.addEventListener("minto:bridge:mount", start);
  window.addEventListener("minto:bridge:unmount", cleanup);
  window.addEventListener("pagehide", cleanup);
  window.addEventListener("pageshow", start);
  start();
  return {
    getSnapshot: async () => snapshot(),
    dispatch: async (command: Command) => {
      try {
        return persist(
          applyCommand(state, command, Date.now(), () => crypto.randomUUID()),
        );
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not update the list.",
        };
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    window: async () => {
      throw new Error(
        "Window controls are available in the Electron app. Run npm run dev.",
      );
    },
    exportBackup: async () => {
      const blob = new Blob(
        [JSON.stringify(checkpoint(state, Date.now()), null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "minto-backup.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true };
    },
    resetAll: async () =>
      persist({ ...createState(Date.now()), revision: state.revision + 1 }),
  };
}
