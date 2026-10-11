import { Check, Pause, Play, RotateCcw } from "lucide-react";
import type { Task } from "../shared/model";
import { formatTime, getCurrent, remainingFor } from "../shared/model";
import { useFocus } from "../state/FocusContext";

export function Timer({ onComplete }: { onComplete: (task: Task) => void }) {
  const { state, now, dispatch } = useFocus();
  const task = getCurrent(state);
  const running = state.timer.startedAt !== null;
  const remaining = task ? remainingFor(state, task, now) : 0;
  const finished = !!task && remaining === 0 && task.alert !== "acknowledged";
  const pie = state.settings.timerStyle === "pie";
  const minutes = Math.min(60, Math.max(0, remaining / 60000));
  const toggle = () =>
    void dispatch({ type: running ? "timer.pause" : "timer.start" });

  return (
    <section
      className={`timer-section ${remaining < 0 ? "overtime" : ""}`}
      aria-label="Focus timer"
    >
      <div className="timer-heading">
        <span className="eyebrow">
          {finished
            ? "A little breathing room"
            : remaining < 0
              ? "A little extra time"
              : running
                ? "One thing at a time"
                : task
                  ? "Ready when you are"
                  : "A little room to focus"}
        </span>
        <div className="timer-style" aria-label="Timer style">
          <button
            aria-pressed={pie}
            onClick={() =>
              void dispatch({
                type: "settings.update",
                settings: { timerStyle: "pie" },
              })
            }
          >
            Pie
          </button>
          <button
            aria-pressed={!pie}
            onClick={() =>
              void dispatch({
                type: "settings.update",
                settings: { timerStyle: "digital" },
              })
            }
          >
            Digital
          </button>
        </div>
      </div>
      {pie ? (
        <div className="pie-clock">
          <svg viewBox="0 0 260 260" aria-hidden="true">
            <circle cx="130" cy="130" r="93" className="clock-face" />
            <circle
              cx="130"
              cy="130"
              r="46.5"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="93"
              strokeDasharray={`${(minutes / 60) * Math.PI * 93} ${Math.PI * 93}`}
              transform="rotate(-90 130 130)"
              className="clock-slice"
            />
            {Array.from({ length: 60 }, (_, index) => {
              const angle = ((index * 6 - 90) * Math.PI) / 180;
              const major = index % 5 === 0;
              return (
                <line
                  key={index}
                  x1={130 + (major ? 99 : 102) * Math.cos(angle)}
                  y1={130 + (major ? 99 : 102) * Math.sin(angle)}
                  x2={130 + 106 * Math.cos(angle)}
                  y2={130 + 106 * Math.sin(angle)}
                  className={major ? "major-tick" : "minor-tick"}
                />
              );
            })}
            {[0, 15, 30, 45].map((number) => {
              const angle = ((number * 6 - 90) * Math.PI) / 180;
              return (
                <text
                  key={number}
                  x={130 + 120 * Math.cos(angle)}
                  y={130 + 120 * Math.sin(angle) + 4}
                  textAnchor="middle"
                >
                  {number === 0 ? "60" : number}
                </text>
              );
            })}
          </svg>
          <button
            className="play-button dial-play"
            onClick={toggle}
            disabled={!task || finished}
            aria-label={running ? "Pause timer" : "Start timer"}
            title="Space to start or pause"
          >
            {running ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Play size={19} fill="currentColor" />
            )}
          </button>
        </div>
      ) : (
        <div className="digital-clock">
          <span
            className="digital-time"
            role="timer"
            aria-label={remaining < 0 ? "Overtime" : "Time remaining"}
          >
            {task ? formatTime(remaining) : "25:00"}
          </span>
          <button
            className="play-button"
            onClick={toggle}
            disabled={!task || finished}
            aria-label={running ? "Pause timer" : "Start timer"}
          >
            {running ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </button>
        </div>
      )}
      <div className="timer-readout">
        <button
          className="adjust-button"
          disabled={!task || task.durationMs <= 60000}
          onClick={() => void dispatch({ type: "timer.adjust", minutes: -5 })}
          aria-label="Subtract five minutes"
        >
          −5
        </button>
        <div>
          {pie && (
            <span
              className="remaining"
              role="timer"
              aria-label={remaining < 0 ? "Overtime" : "Time remaining"}
            >
              {task ? formatTime(remaining) : "25:00"}
            </span>
          )}
          <h1>
            {task ? (
              <>
                <span aria-hidden="true">{task.emoji}</span> {task.title}
              </>
            ) : (
              "What’s on your mind today?"
            )}
          </h1>
          {!task && <p>Add a task below. Start small.</p>}
        </div>
        <button
          className="adjust-button"
          disabled={!task || task.durationMs >= 86400000}
          onClick={() => void dispatch({ type: "timer.adjust", minutes: 5 })}
          aria-label="Add five minutes"
        >
          +5
        </button>
      </div>
      {task && (
        <div className="focus-actions">
          <button
            className="quiet-button"
            onClick={() => void dispatch({ type: "timer.reset" })}
            title="Restart countdown; keep total focus time"
          >
            <RotateCcw size={13} /> Reset timer
          </button>
          <button
            className="quiet-button done-current"
            onClick={() => onComplete(task)}
          >
            <Check size={14} /> Mark done
          </button>
        </div>
      )}
      {remaining < 0 && (
        <p className="overtime-note" role="status">
          Time’s up. Keep going, add time, or mark it done.
        </p>
      )}
    </section>
  );
}
