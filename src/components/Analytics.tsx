import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  dailyReview,
  dateKey,
  dayBounds,
  focusDuration,
} from "../shared/analytics";
import { formatMinutes } from "../shared/model";
import { useFocus } from "../state/FocusContext";

const time = (value: number) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

export function Analytics() {
  const { state, now } = useFocus();
  const [day, setDay] = useState(dateKey(now));
  const review = dailyReview(state, day, now);
  function moveDay(offset: number) {
    const date = new Date(dayBounds(day).start);
    date.setDate(date.getDate() + offset);
    setDay(dateKey(date.getTime()));
  }
  return (
    <section className="analytics-page">
      <div className="page-heading">
        <span className="eyebrow">A LITTLE PERSPECTIVE</span>
        <h1>Your day, in focus</h1>
        <p>What you planned. What you made time for.</p>
      </div>
      <div className="review-date">
        <button
          className="icon-button"
          aria-label="Previous day"
          onClick={() => moveDay(-1)}
        >
          <ChevronLeft size={18} />
        </button>
        <label>
          <span className="sr-only">Review date</span>
          <input
            type="date"
            value={day}
            onChange={(event) => {
              if (event.target.value) setDay(event.target.value);
            }}
          />
        </label>
        <button
          className="icon-button"
          aria-label="Next day"
          onClick={() => moveDay(1)}
        >
          <ChevronRight size={18} />
        </button>
        <button className="quiet-button" onClick={() => setDay(dateKey(now))}>
          Today
        </button>
      </div>
      <div className="review-stats">
        <div>
          <strong>{focusDuration(review.focusedMs)}</strong>
          <span>Focused</span>
        </div>
        <div>
          <strong>{formatMinutes(review.plannedMs)}</strong>
          <span>Planned blocks</span>
        </div>
        <div>
          <strong>{review.completed}</strong>
          <span>Tasks done</span>
        </div>
        <div>
          <strong>{formatMinutes(review.remainingMs)}</strong>
          <span>Unfulfilled planned time</span>
        </div>
      </div>
      <p className="setting-note">
        History starts {new Date(state.historySince).toLocaleDateString()}.
        Pauses, sleep, and time with the app closed are excluded. Overlapping
        plans count separately.
      </p>
      <section className="review-section">
        <h2>Starts & deadlines</h2>
        {!review.scheduled.length && (
          <p className="empty-hint">
            Set a planned start or due date using Plan on any task.
          </p>
        )}
        {review.scheduled.map((task) => (
          <article className="review-card" key={task.id}>
            <div className="review-card-heading">
              <strong>{task.title}</strong>
              <span className="review-status">
                {task.completedAt !== null
                  ? "Done"
                  : task.dueAt !== null && task.dueAt < now
                    ? "Past due"
                    : "Upcoming"}
              </span>
            </div>
            {task.scheduledAt !== null && (
              <p>
                Planned start ·{" "}
                {new Date(task.scheduledAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
            {task.dueAt !== null && (
              <p>
                Due ·{" "}
                {new Date(task.dueAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
            {task.completedAt !== null && task.dueAt !== null && (
              <small>
                Finished{" "}
                {focusDuration(Math.abs(task.completedAt - task.dueAt))}{" "}
                {task.completedAt > task.dueAt ? "after" : "before"} deadline
              </small>
            )}
          </article>
        ))}
      </section>
      <section className="review-section">
        <h2>Planned blocks</h2>
        {!review.plans.length && (
          <p className="empty-hint">
            No blocks planned for this day. Add an optional time window when
            creating or editing a task.
          </p>
        )}
        {review.plans.map((plan) => (
          <article className="review-card" key={plan.id}>
            <div className="review-card-heading">
              <strong>{plan.title}</strong>
              <span className="review-status">{plan.status}</span>
            </div>
            <p>
              {time(plan.start)} – {time(plan.end)}
              {plan.overlaps ? " · Overlaps another block" : ""}
            </p>
            <div className="review-bar" aria-hidden="true">
              <i
                style={{
                  width: `${Math.min(100, (plan.focusedMs / plan.plannedMs) * 100)}%`,
                }}
              />
            </div>
            <small>
              {focusDuration(plan.focusedMs)} focused within this block ·{" "}
              {formatMinutes(plan.plannedMs)} planned
            </small>
            {plan.completedAt !== null && plan.movedAt === null && (
              <p>
                Finished{" "}
                {new Date(plan.completedAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                ·{" "}
                {plan.deadlineDeltaMs === 0
                  ? "On time"
                  : `${formatMinutes(Math.abs(plan.deadlineDeltaMs!))} ${plan.deadlineDeltaMs! > 0 ? "after" : "before"} planned end`}
              </p>
            )}
          </article>
        ))}
      </section>
      <section className="review-section">
        <h2>Actual focus by task</h2>
        {!review.tasks.length && (
          <p className="empty-hint">No focus recorded on this day yet.</p>
        )}
        {review.tasks.map((task) => (
          <div className="review-task" key={task.taskId}>
            <span>{task.title}</span>
            <strong>{focusDuration(task.focusedMs)}</strong>
          </div>
        ))}
      </section>
      <section className="review-section">
        <h2>Focus timeline</h2>
        {review.sessions.map((session, index) => (
          <div className="review-session" key={`${session.start}-${index}`}>
            <span>
              {time(session.start)} – {time(session.end)}
            </span>
            <strong>{session.title}</strong>
            <small>{focusDuration(session.end - session.start)}</small>
          </div>
        ))}
      </section>
      <p className="local-note">
        Only on this device. Archived and removed tasks keep their focus
        history.
      </p>
    </section>
  );
}
