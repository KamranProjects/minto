import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import type { Command, Snapshot, WindowAction } from "../shared/model";
import { createBrowserBridge } from "./browserBridge";

export const isDesktop = !!window.cozy;
export const isDock = new URLSearchParams(window.location.search).has("dock");
const bridge = window.cozy ?? createBrowserBridge();

interface Notice {
  message: string;
  undo?: Command;
}
interface FocusContextValue extends Snapshot {
  dispatch(command: Command): Promise<boolean>;
  windowAction(action: WindowAction): Promise<void>;
  exportBackup(): Promise<void>;
  resetAll(): Promise<boolean>;
  notice: Notice | null;
  notify(message: string, undo?: Command): void;
  dismissNotice(): void;
}
const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [now, setNow] = useState(Date.now());
  const clock = useRef({ server: Date.now(), local: performance.now() });
  const latest = useRef<Snapshot | null>(null);

  useEffect(() => {
    let alive = true;
    if (!isDesktop) window.dispatchEvent(new Event("minto:bridge:mount"));
    const receive = (next: Snapshot) => {
      if (!alive) return;
      // Vite can refresh the renderer while an older Electron main is still running.
      // Never send new commands to that incompatible backend or render its old data.
      if (next.state.version !== 5) {
        setLoadError(
          "The desktop backend needs an update. Close Minto, stop the old dev command with Ctrl+C, then run npm run dev again. Your saved tasks will be migrated automatically.",
        );
        return;
      }
      const current = latest.current;
      if (
        current &&
        (next.state.revision < current.state.revision || next.now < current.now)
      )
        return;
      latest.current = next;
      clock.current = { server: next.now, local: performance.now() };
      setSnapshot(next);
      setNow(next.now);
    };
    const unsubscribe = bridge.subscribe(receive);
    void bridge
      .getSnapshot()
      .then(receive)
      .catch((error) => setLoadError(String(error)));
    return () => {
      alive = false;
      unsubscribe();
      if (!isDesktop) window.dispatchEvent(new Event("minto:bridge:unmount"));
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(
      () =>
        setNow(clock.current.server + performance.now() - clock.current.local),
      snapshot?.state.timer.startedAt != null ? 1000 : 30000,
    );
    return () => clearInterval(interval);
  }, [snapshot?.state.timer.startedAt != null]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(
      () => setNotice(null),
      notice.undo ? 10000 : 5500,
    );
    return () => clearTimeout(timeout);
  }, [notice]);

  function notify(message: string, undo?: Command) {
    setNotice({ message, undo });
  }
  async function dispatch(command: Command) {
    try {
      const result = await bridge.dispatch(command);
      if (!result.ok) notify(result.error);
      return result.ok;
    } catch {
      notify("The app could not save that change. Please try again.");
      return false;
    }
  }
  async function windowAction(action: WindowAction) {
    try {
      await bridge.window(action);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not change the window.",
      );
    }
  }
  async function exportBackup() {
    try {
      const result = await bridge.exportBackup();
      if (!result.ok) notify(result.error);
    } catch {
      notify("Could not export your backup.");
    }
  }
  async function resetAll() {
    try {
      const result = await bridge.resetAll();
      if (!result.ok) notify(result.error);
      return result.ok;
    } catch {
      notify("Could not clear your saved data. Please try again.");
      return false;
    }
  }

  if (loadError)
    return (
      <div className="startup-error" role="alert">
        <h1>Your list could not load</h1>
        <p>{loadError}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </div>
    );
  if (!snapshot)
    return (
      <div className="loading" role="status">
        Opening your little space…
      </div>
    );
  return (
    <FocusContext.Provider
      value={{
        ...snapshot,
        now,
        dispatch,
        windowAction,
        exportBackup,
        resetAll,
        notice,
        notify,
        dismissNotice: () => setNotice(null),
      }}
    >
      {children}
    </FocusContext.Provider>
  );
}

export function useFocus() {
  const context = useContext(FocusContext);
  if (!context) throw new Error("FocusProvider is missing.");
  return context;
}
