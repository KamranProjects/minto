import { themeVariables } from "./shared/theme";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  Clock3,
  Headphones,
  Leaf,
  List,
  ListPlus,
  Plus,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import {
  FocusProvider,
  isDesktop,
  isDock,
  useFocus,
} from "./state/FocusContext";
import {
  focusFor,
  formatMinutes,
  formatTime,
  getCurrent,
  isCompleted,
  isPending,
  listRemaining,
  remainingFor,
} from "./shared/model";
import type { Task } from "./shared/model";
import { Titlebar } from "./components/Titlebar";
import { Timer } from "./components/Timer";
import { TaskForm } from "./components/TaskForm";
import { TaskCard } from "./components/TaskCard";
import { Settings } from "./components/Settings";
import { Presets } from "./components/Presets";
import { Dock } from "./components/Dock";
import { useAudio } from "./hooks/useAudio";
import { Analytics } from "./components/Analytics";
import { TimeUp } from "./components/TimeUp";
import { MenuDock } from "./components/MenuDock";

type View = "focus" | "list" | "presets" | "settings" | "analytics";

export default function App() {
  return <FocusProvider>{isDock ? <Dock /> : <Workspace />}</FocusProvider>;
}

function Workspace() {
  const {
    state,
    now,
    dispatch,
    notify,
    notice,
    dismissNotice,
    windowAction,
    storageError,
    recoveryMessage,
  } = useFocus();
  const [view, setView] = useState<View>("focus");
  const [adding, setAdding] = useState(false);
  const [celebration, setCelebration] = useState(0);
  const { ambient, toggleAmbient, prime, chime } = useAudio();
  const priorCompleted = useRef(
    new Set(state.tasks.filter(isCompleted).map((task) => task.id)),
  );
  const previousTime = useRef<{ id: string | null; remaining: number }>({
    id: null,
    remaining: 0,
  });
  const scrollArea = useRef<HTMLDivElement>(null);
  const pending = state.tasks.filter(isPending);
  const completed = state.tasks.filter(isCompleted);
  const current = getCurrent(state);
  const total = listRemaining(state, now);
  const remaining = current ? remainingFor(state, current, now) : 0;
  const finish = new Date(Date.now() + total).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const totalFocus = state.tasks
    .filter((task) => task.deletedAt === null && task.archivedAt === null)
    .reduce((sum, task) => sum + focusFor(state, task, now), 0);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"]',
        )
      )
        return;
      if (event.repeat) return;
      if (
        event.code === "Space" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        target.tagName !== "BUTTON"
      ) {
        event.preventDefault();
        if (current)
          void dispatch({
            type:
              state.timer.startedAt === null ? "timer.start" : "timer.pause",
          });
      }
      if (
        event.key.toLowerCase() === "n" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        setView("focus");
        setAdding(true);
      }
      if (
        event.code === "KeyD" &&
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        isDesktop
      ) {
        event.preventDefault();
        void windowAction("showDock");
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [current, state.timer.startedAt, dispatch, windowAction]);

  useEffect(() => {
    const ids = new Set(state.tasks.filter(isCompleted).map((task) => task.id));
    const finished = [...ids].some((id) => !priorCompleted.current.has(id));
    if (finished && state.settings.celebrate) setCelebration(Date.now());
    if (finished && !isDesktop && state.settings.completionSound) chime();
    priorCompleted.current = ids;
  }, [
    state.tasks,
    state.settings.celebrate,
    state.settings.completionSound,
    chime,
  ]);

  useEffect(() => {
    if (!celebration) return;
    const timeout = setTimeout(() => setCelebration(0), 1600);
    return () => clearTimeout(timeout);
  }, [celebration]);

  useEffect(() => {
    if (
      !isDesktop &&
      state.settings.sound &&
      previousTime.current.id === (current?.id ?? null) &&
      previousTime.current.remaining > 0 &&
      remaining <= 0 &&
      state.timer.startedAt !== null
    )
      chime();
    previousTime.current = { id: current?.id ?? null, remaining };
  }, [
    current?.id,
    remaining,
    state.settings.sound,
    state.timer.startedAt,
    chime,
  ]);

  useEffect(() => {
    scrollArea.current?.scrollTo({ top: 0 });
  }, [view]);

  useEffect(() => {
    if (current?.alert === "pending") {
      setView("focus");
      scrollArea.current?.scrollTo({ top: 0 });
    }
  }, [current?.id, current?.alert]);

  async function complete(task: Task) {
    if (await dispatch({ type: "task.complete", id: task.id }))
      notify("A little win. Nicely done.", {
        type: "task.reopen",
        id: task.id,
      });
  }

  return (
    <main
      className={`desktop ${isDesktop ? "native" : "browser-preview"}`}
      style={themeVariables(state.settings) as CSSProperties}
      onPointerDown={() => {
        if (
          !isDesktop &&
          (state.settings.sound || state.settings.completionSound)
        )
          void prime().catch(() => undefined);
      }}
      onKeyDown={() => {
        if (
          !isDesktop &&
          (state.settings.sound || state.settings.completionSound)
        )
          void prime().catch(() => undefined);
      }}
    >
      {!isDesktop && (
        <div className="preview-label">
          <Leaf size={15} />
          <span>A quieter way to get things done.</span>
          <small>DESKTOP PREVIEW</small>
        </div>
      )}
      <section className="app-shell" aria-label="Minto">
        <Titlebar />
        {(storageError || recoveryMessage) && (
          <div
            className={storageError ? "storage-banner error" : "storage-banner"}
            role={storageError ? "alert" : "status"}
          >
            {storageError ?? recoveryMessage}
          </div>
        )}
        <div className="summary-strip">
          <div>
            <Clock3 size={14} />
            <span>
              <strong>{formatMinutes(total)}</strong>
              <small>on your list</small>
            </span>
          </div>
          <span className="summary-divider" />
          <div>
            <span className="finish-symbol">↗</span>
            <span>
              <strong>{pending.length ? finish : "All clear"}</strong>
              <small>
                {state.timer.startedAt !== null
                  ? "estimated finish"
                  : "if you start now"}
              </small>
            </span>
          </div>
          <button
            className={`icon-button ambient ${ambient ? "enabled" : ""}`}
            aria-label={ambient ? "Stop ambient sound" : "Play ambient sound"}
            aria-pressed={ambient}
            title="Soft brown noise"
            onClick={() =>
              void toggleAmbient().catch(() =>
                notify("Sound could not start. Please try again."),
              )
            }
          >
            <Headphones size={17} />
          </button>
        </div>
        <div className="workspace-scroll" ref={scrollArea}>
          <div className="workspace-content">
            <TimeUp />
            {view === "focus" && (
              <Timer onComplete={(task) => void complete(task)} />
            )}
            {view === "list" && (
              <div className="page-heading">
                <span className="eyebrow">ONE TASK, THEN THE NEXT</span>
                <h1>My day</h1>
                <p>
                  {formatMinutes(totalFocus)} focused · {completed.length}{" "}
                  {completed.length === 1 ? "task" : "tasks"} done
                </p>
              </div>
            )}
            {(view === "focus" || view === "list") && (
              <>
                <div className="list-heading">
                  <h2>
                    Your list <span>{pending.length}</span>
                  </h2>
                  <button
                    className="quiet-button"
                    onClick={() => setView("presets")}
                  >
                    <ListPlus size={13} /> Add a routine
                  </button>
                </div>
                <div className="task-list">
                  {pending.map((task, index) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      previousId={pending[index - 1]?.id}
                      nextNextId={pending[index + 2]?.id ?? null}
                      isLast={index === pending.length - 1}
                      onComplete={(task) => void complete(task)}
                    />
                  ))}
                </div>
                {adding ? (
                  <TaskForm
                    onCancel={() => setAdding(false)}
                    onSave={async (task) => {
                      const ok = await dispatch({ type: "task.add", task });
                      if (ok) {
                        setAdding(false);
                        if (!pending.length)
                          scrollArea.current?.scrollTo({ top: 0 });
                      }
                      return ok;
                    }}
                  />
                ) : (
                  <button className="add-task" onClick={() => setAdding(true)}>
                    <Plus size={17} />
                    <span>Add a task</span>
                    <kbd>N</kbd>
                  </button>
                )}
                {!pending.length && !adding && (
                  <p className="empty-hint">
                    {completed.length
                      ? "That’s your list, done. Enjoy a little breathing room."
                      : "One small task is a good place to begin."}
                  </p>
                )}
                {!!completed.length && (
                  <section className="completed-section">
                    <div className="completed-heading">
                      <button
                        onClick={() =>
                          void dispatch({
                            type: "settings.update",
                            settings: {
                              showCompleted: !state.settings.showCompleted,
                            },
                          })
                        }
                        aria-expanded={state.settings.showCompleted}
                      >
                        <ChevronDown
                          size={14}
                          className={
                            state.settings.showCompleted ? "" : "collapsed"
                          }
                        />
                        Done for now <span>{completed.length}</span>
                      </button>
                      <button
                        onClick={async () => {
                          const ids = completed.map((task) => task.id);
                          if (await dispatch({ type: "task.archiveCompleted" }))
                            notify("Completed tasks cleared.", {
                              type: "task.unarchive",
                              ids,
                            });
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    {state.settings.showCompleted && (
                      <div className="completed-list">
                        {completed.map((task) => (
                          <div className="completed-task" key={task.id}>
                            <Check size={13} />
                            <span>{task.title}</span>
                            <small title="Total focused time">
                              {formatTime(task.focusMs)}
                            </small>
                            <button
                              className="quiet-button"
                              onClick={() =>
                                void dispatch({
                                  type: "task.reopen",
                                  id: task.id,
                                })
                              }
                              aria-label={`Reopen ${task.title}`}
                            >
                              Undo
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
                <div className="list-footer">
                  <span className="saved-indicator">
                    <i className={storageError ? "save-error" : ""} />
                    {storageError
                      ? "Save needs attention"
                      : "Saved on this device"}
                  </span>
                  <Leaf size={13} />
                </div>
              </>
            )}
            {view === "presets" && (
              <Presets onLoaded={() => setView("focus")} />
            )}
            {view === "settings" && <Settings />}
            {view === "analytics" && <Analytics />}
          </div>
        </div>
        <MenuDock>
          {(
            [
              { id: "focus", label: "Focus", Icon: Clock3 },
              { id: "list", label: "My day", Icon: List },
              { id: "presets", label: "Routines", Icon: ListPlus },
              { id: "analytics", label: "Analytics", Icon: BarChart3 },
              { id: "settings", label: "Settings", Icon: SettingsIcon },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              className={view === id ? "selected" : ""}
              aria-current={view === id ? "page" : undefined}
              onClick={() => {
                setView(id);
                scrollArea.current?.scrollTo({ top: 0 });
              }}
            >
              <i className="menu-dock-icon">
                <Icon size={20} strokeWidth={1.8} />
              </i>
              <span>{label}</span>
            </button>
          ))}
        </MenuDock>
        {notice && (
          <div className="toast" role="status">
            <span>{notice.message}</span>
            {notice.undo && (
              <button
                onClick={async () => {
                  if (notice.undo && (await dispatch(notice.undo)))
                    dismissNotice();
                }}
              >
                Undo
              </button>
            )}
            <button
              className="toast-dismiss"
              aria-label="Dismiss message"
              onClick={dismissNotice}
            >
              <X size={13} />
            </button>
          </div>
        )}
        {celebration > 0 && (
          <div className="celebration" aria-hidden="true" key={celebration}>
            {Array.from({ length: 16 }, (_, index) => (
              <i
                key={index}
                style={
                  {
                    "--i": index,
                    "--x": `${(index * 37) % 100}%`,
                    "--rotation": `${index * 47}deg`,
                    background: ["#db8070", "#7c9b7a", "#d7b96e", "#b4a1c4"][
                      index % 4
                    ],
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
      </section>
      {!isDesktop && (
        <p className="preview-footer">
          Made for a little focus, and a little breathing room.{" "}
          <ArrowUpRight size={12} />
        </p>
      )}
    </main>
  );
}
