import { Maximize2, Minus, PanelTop, Pin, X } from "lucide-react";
import { isDesktop, useFocus } from "../state/FocusContext";

export function Titlebar() {
  const { state, dispatch, windowAction } = useFocus();
  return (
    <header className="titlebar">
      <div className="wordmark">
        <img src="./minto-logo.png" alt="Minto" />
      </div>
      <div className="window-actions">
        <button
          className={state.settings.mainOnTop ? "is-pinned" : ""}
          aria-label="Keep main window on top"
          aria-pressed={state.settings.mainOnTop}
          disabled={!isDesktop}
          title={
            isDesktop ? "Keep window on top" : "Available in the desktop app"
          }
          onClick={() =>
            void dispatch({
              type: "settings.update",
              settings: { mainOnTop: !state.settings.mainOnTop },
            })
          }
        >
          <Pin size={13} />
        </button>
        <button
          aria-label="Open mini timer"
          title={
            isDesktop
              ? "Open mini timer · Ctrl+Shift+D"
              : "Mini timer requires Electron · npm run dev"
          }
          disabled={!isDesktop}
          onClick={() => void windowAction("showDock")}
        >
          <PanelTop size={14} />
        </button>
        {isDesktop && (
          <>
            <span className="titlebar-separator" />
            <button
              aria-label="Minimize window"
              onClick={() => void windowAction("minimize")}
            >
              <Minus size={14} />
            </button>
            <button
              aria-label="Maximize window"
              onClick={() => void windowAction("maximize")}
            >
              <Maximize2 size={12} />
            </button>
            <button
              className="close-window"
              aria-label="Close window"
              title="With the mini timer open, your list stays available there"
              onClick={() => void windowAction("close")}
            >
              <X size={15} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
