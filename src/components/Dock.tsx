import { themeVariables } from "../shared/theme";
import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  Pause,
  Pin,
  Play,
  X,
} from "lucide-react";
import {
  DOCK_LAYOUTS,
  formatTime,
  getCurrent,
  remainingFor,
} from "../shared/model";
import { DockFace } from "./DockFace";
import { useFocus } from "../state/FocusContext";

export function Dock() {
  const [celebration, setCelebration] = useState(0);
  useEffect(() => {
    if (!celebration) return;
    const timeout = setTimeout(() => setCelebration(0), 1600);
    return () => clearTimeout(timeout);
  }, [celebration]);
  const { state, now, dispatch, windowAction, storageError, notice, notify } =
    useFocus();
  const task = getCurrent(state);
  const remaining = task ? remainingFor(state, task, now) : 0;
  const running = state.timer.startedAt !== null;
  const finished = !!task && remaining === 0 && task.alert !== "acknowledged";
  const expanded = state.settings.dockExpanded;
  const progress = task
    ? Math.min(1, Math.max(0, remaining / task.durationMs))
    : 0;
  const pie = state.settings.dockStyle === "pie";
  const designer = ["orbit", "flip", "ribbon"].includes(
    state.settings.dockStyle,
  );
  async function complete() {
    if (task && (await dispatch({ type: "task.complete", id: task.id }))) {
      notify("A little win. Nicely done.");
      if (state.settings.celebrate) setCelebration(Date.now());
    }
  }
  return (
    <main
      className={`timer-dock ${expanded ? "expanded" : "compact"}`}
      style={themeVariables(state.settings) as React.CSSProperties}
    >
      {designer ? (
        <DockFace
          layout={state.settings.dockStyle}
          time={task ? formatTime(remaining) : "00:00"}
          title={task?.title ?? "Add a task"}
          status={
            finished
              ? "BLOCK FINISHED"
              : remaining < 0
                ? "OVERTIME"
                : running
                  ? "FOCUSING"
                  : "PAUSED"
          }
          progress={progress}
          running={running}
          disabled={!task || finished}
          hasTask={!!task}
          onToggle={() =>
            void dispatch({ type: running ? "timer.pause" : "timer.start" })
          }
          onComplete={() => void complete()}
          onOpen={() => void windowAction("showMain")}
          onClose={() => void windowAction("hideDock")}
          onLayout={() => {
            const index = DOCK_LAYOUTS.findIndex(
              (layout) => layout.id === state.settings.dockStyle,
            );
            void dispatch({
              type: "settings.update",
              settings: {
                dockStyle: DOCK_LAYOUTS[(index + 1) % DOCK_LAYOUTS.length].id,
              },
            });
          }}
        />
      ) : (
        <>
          <div className="dock-top">
            {pie && (
              <span
                className="dock-pie"
                aria-label="Time remaining"
                style={{
                  background: `conic-gradient(var(--accent) ${progress * 360}deg, #e6e9df 0deg)`,
                }}
              />
            )}
            <GripVertical
              className="dock-grip"
              size={16}
              aria-label="Drag timer window"
            />
            <button
              className="dock-time"
              onClick={() => void windowAction("showMain")}
              title="Open your task list"
              aria-label="Show main window"
            >
              <span role="timer">{task ? formatTime(remaining) : "00:00"}</span>
              {!expanded && (
                <small>
                  {finished
                    ? "Finished · "
                    : remaining < 0 && task
                      ? "Overtime · "
                      : !running
                        ? "Paused · "
                        : ""}
                  {task?.title ?? "Add a task"}
                </small>
              )}
            </button>
            <button
              className="play-button dock-play"
              disabled={!task || finished}
              aria-label={running ? "Pause timer" : "Start timer"}
              onClick={() =>
                void dispatch({ type: running ? "timer.pause" : "timer.start" })
              }
            >
              {running ? (
                <Pause size={15} fill="currentColor" />
              ) : (
                <Play size={15} fill="currentColor" />
              )}
            </button>
            <button
              className="icon-button"
              aria-label={
                expanded ? "Collapse mini timer" : "Expand mini timer"
              }
              onClick={() =>
                void dispatch({
                  type: "settings.update",
                  settings: { dockExpanded: !expanded },
                })
              }
            >
              {expanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
            <button
              className="icon-button"
              aria-label="Close mini timer"
              onClick={() => void windowAction("hideDock")}
            >
              <X size={14} />
            </button>
          </div>
          {expanded && (
            <>
              <div className="dock-task">
                <span aria-hidden="true">{task?.emoji || "🌿"}</span>
                <div>
                  <small>
                    {finished
                      ? "BLOCK FINISHED"
                      : remaining < 0
                        ? "OVERTIME"
                        : running
                          ? "FOCUSING ON"
                          : "UP NEXT"}
                  </small>
                  <strong>
                    {task?.title ?? "A little room for your next task"}
                  </strong>
                </div>
              </div>
              <div className="dock-bottom">
                <button
                  className="quiet-button"
                  aria-label="Keep mini timer on top"
                  aria-pressed={state.settings.dockOnTop}
                  onClick={() =>
                    void dispatch({
                      type: "settings.update",
                      settings: { dockOnTop: !state.settings.dockOnTop },
                    })
                  }
                >
                  <Pin size={12} />{" "}
                  {state.settings.dockOnTop ? "Pinned" : "Pin timer"}
                </button>
                <button
                  className="quiet-button"
                  onClick={() => void windowAction("showMain")}
                >
                  <ExternalLink size={12} /> My list
                </button>
                <button
                  className="dock-done"
                  disabled={!task}
                  onClick={() => void complete()}
                >
                  <Check size={14} /> Done
                </button>
              </div>
            </>
          )}
        </>
      )}
      <div className="dock-progress">
        <i style={{ width: `${progress * 100}%` }} />
      </div>
      {celebration > 0 && (
        <div className="celebration" aria-hidden="true" key={celebration}>
          {Array.from({ length: 8 }, (_, index) => (
            <i
              key={index}
              style={
                {
                  "--i": index,
                  "--x": `${index * 13}%`,
                  "--rotation": `${index * 47}deg`,
                  background: ["#db8070", "#7c9b7a", "#d7b96e"][index % 3],
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
      {(storageError || notice) && (
        <div
          className="dock-notice"
          role={storageError ? "alert" : "status"}
          title={storageError ?? notice?.message}
        >
          {storageError
            ? "Could not save. Open your list for details."
            : notice?.message}
        </div>
      )}
    </main>
  );
}
