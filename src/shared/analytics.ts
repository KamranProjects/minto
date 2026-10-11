import type { FocusState, FocusSession } from "./model.js";
import { getCurrent, runningDelta } from "./model.js";

export function dateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function focusDuration(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m${seconds % 60 ? ` ${seconds % 60}s` : ""}`;
}

export function dayBounds(day: string): { start: number; end: number } {
  const [year, month, date] = day.split("-").map(Number);
  const start = new Date(year, month - 1, date);
  const end = new Date(year, month - 1, date + 1);
  return { start: start.getTime(), end: end.getTime() };
}

export const overlapMs = (
  start: number,
  end: number,
  from: number,
  to: number,
) => Math.max(0, Math.min(end, to) - Math.max(start, from));

/** Local calendar boundaries correctly include 23/25-hour daylight-saving days. */
export function dailyReview(state: FocusState, day: string, now: number) {
  const { start, end } = dayBounds(day);
  const sessions: FocusSession[] = state.sessions.map((session) => ({
    ...session,
  }));
  const current = getCurrent(state);
  if (current && state.timer.startedAt !== null && now > state.timer.startedAt)
    sessions.push({
      taskId: current.id,
      title: current.title,
      start: state.timer.startedAt,
      end: state.timer.startedAt + runningDelta(state, now),
    });
  const todaySessions = sessions
    .filter((item) => overlapMs(item.start, item.end, start, end) > 0)
    .map((item) => ({
      ...item,
      start: Math.max(start, item.start),
      end: Math.min(end, item.end),
    }));
  const plans = state.plans
    .filter((plan) => overlapMs(plan.start, plan.end, start, end) > 0)
    .map((plan) => {
      const task = state.tasks.find((item) => item.id === plan.taskId)!;
      const plannedMs = overlapMs(plan.start, plan.end, start, end);
      const focusedMs = todaySessions
        .filter((item) => item.taskId === plan.taskId)
        .reduce(
          (sum, item) =>
            sum + overlapMs(item.start, item.end, plan.start, plan.end),
          0,
        );
      const completed = task.completedAt !== null && task.completedAt <= now;
      const status =
        plan.movedAt !== null
          ? "Moved"
          : task.deletedAt !== null
            ? "Removed"
            : completed
              ? "Completed"
              : focusedMs >= plannedMs
                ? "Focused"
                : focusedMs > 0
                  ? "Partly focused"
                  : plan.end <= now
                    ? "Missed"
                    : "Not started";
      const overlaps =
        plan.movedAt === null &&
        state.plans.some(
          (other) =>
            other.id !== plan.id &&
            other.movedAt === null &&
            overlapMs(
              plan.start,
              plan.end,
              Math.max(start, other.start),
              Math.min(end, other.end),
            ) > 0,
        );
      return {
        ...plan,
        plannedMs,
        focusedMs,
        status,
        overlaps,
        completedAt: task.completedAt,
        deadlineDeltaMs:
          task.completedAt === null ? null : task.completedAt - plan.end,
      };
    });
  const byTask = new Map<
    string,
    {
      taskId: string;
      title: string;
      focusedMs: number;
      completedAt: number | null;
    }
  >();
  for (const session of todaySessions) {
    const row = byTask.get(session.taskId) ?? {
      taskId: session.taskId,
      title: session.title,
      focusedMs: 0,
      completedAt:
        state.tasks.find((task) => task.id === session.taskId)?.completedAt ??
        null,
    };
    row.focusedMs += session.end - session.start;
    byTask.set(session.taskId, row);
  }
  const activePlans = plans.filter(
    (plan) => plan.movedAt === null && plan.status !== "Removed",
  );
  return {
    start,
    end,
    scheduled: state.tasks
      .filter(
        (task) =>
          task.deletedAt === null &&
          ((task.scheduledAt !== null &&
            task.scheduledAt >= start &&
            task.scheduledAt < end) ||
            (task.dueAt !== null && task.dueAt >= start && task.dueAt < end)),
      )
      .sort(
        (a, b) =>
          (a.scheduledAt ?? a.dueAt ?? 0) - (b.scheduledAt ?? b.dueAt ?? 0),
      ),
    plans,
    sessions: todaySessions,
    tasks: [...byTask.values()],
    focusedMs: todaySessions.reduce(
      (sum, item) => sum + item.end - item.start,
      0,
    ),
    plannedMs: activePlans.reduce((sum, item) => sum + item.plannedMs, 0),
    remainingMs: activePlans.reduce(
      (sum, item) =>
        sum +
        (item.status === "Completed"
          ? 0
          : Math.max(0, item.plannedMs - item.focusedMs)),
      0,
    ),
    completed: state.tasks.filter(
      (task) =>
        task.completedAt !== null &&
        task.completedAt >= start &&
        task.completedAt < end,
    ).length,
  };
}
