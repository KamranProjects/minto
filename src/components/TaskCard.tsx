import { useState } from "react";
import type { DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  GripVertical,
  Play,
  Trash2,
} from "lucide-react";
import type { Task } from "../shared/model";
import { focusFor, formatTime, remainingFor } from "../shared/model";
import { useFocus } from "../state/FocusContext";
import { TaskForm } from "./TaskForm";

interface TaskCardProps {
  task: Task;
  previousId?: string;
  nextNextId: string | null;
  isLast: boolean;
  onComplete: (task: Task) => void;
}

export function TaskCard({
  task,
  previousId,
  nextNextId,
  isLast,
  onComplete,
}: TaskCardProps) {
  const { state, now, dispatch, notify } = useFocus();
  const [editing, setEditing] = useState(false);
  const [over, setOver] = useState(false);
  const active = state.timer.taskId === task.id;
  const running = active && state.timer.startedAt !== null;
  const plan = state.plans.find(
    (item) => item.taskId === task.id && item.movedAt === null,
  );

  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setOver(false);
    const id = event.dataTransfer.getData("application/x-cozy-task");
    if (id && id !== task.id)
      void dispatch({ type: "task.move", id, beforeId: task.id });
  }

  async function remove() {
    if (await dispatch({ type: "task.remove", id: task.id }))
      notify("Task removed.", { type: "task.restore", id: task.id });
  }

  return (
    <article
      className={`task-card ${active ? "is-active" : ""} ${over ? "drag-over" : ""}`}
      style={{ background: task.color }}
      aria-label={task.title}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-cozy-task")) {
          event.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setOver(false);
      }}
      onDrop={drop}
    >
      <div className="task-main">
        <button
          className="drag-handle"
          draggable
          aria-label={`Drag ${task.title} to reorder`}
          title="Drag to reorder. Use the arrows in Edit for keyboard reordering."
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-cozy-task", task.id);
          }}
        >
          <GripVertical size={14} />
        </button>
        <button
          className="task-focus"
          onClick={() => void dispatch({ type: "task.select", id: task.id })}
          aria-label={`Focus on ${task.title}`}
          aria-pressed={active}
        >
          <span className="task-emoji" aria-hidden="true">
            {task.emoji || "○"}
          </span>
          <span className="task-title">{task.title}</span>
        </button>
        <button
          className={`icon-button disclosure ${editing ? "open" : ""}`}
          aria-label={`Edit ${task.title}`}
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      <div className="task-meta">
        <span className={running ? "task-time running" : "task-time"}>
          {running && <span className="running-dot" />}
          {formatTime(remainingFor(state, task, now))}
        </span>
        <span className="task-spent">
          {focusFor(state, task, now) > 0
            ? `${formatTime(focusFor(state, task, now))} spent`
            : `${task.durationMs / 60000} min planned`}
        </span>
        <button
          className="quiet-button task-plan-button"
          onClick={() => setEditing(!editing)}
          aria-label={`Plan or set due date for ${task.title}`}
        >
          Plan
        </button>
        <button
          className="complete-button"
          onClick={() => onComplete(task)}
          aria-label={`Complete ${task.title}`}
        >
          <Check size={13} /> Done
        </button>
      </div>
      {task.scheduledAt != null &&
        Number.isFinite(task.scheduledAt) &&
        !plan && (
          <p className="task-plan">
            Start{" "}
            {new Date(task.scheduledAt).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      {task.dueAt != null && Number.isFinite(task.dueAt) && (
        <p className={`task-due ${task.dueAt < now ? "past-due" : ""}`}>
          {task.dueAt < now ? "Past due · " : "Due "}
          {new Date(task.dueAt).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
      {plan && (
        <p className="task-plan">
          Planned{" "}
          {new Date(plan.start).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          –{" "}
          {new Date(plan.end).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
      {editing && (
        <div className="task-editor">
          <TaskForm
            initial={{
              title: task.title,
              minutes: task.durationMs / 60000,
              emoji: task.emoji,
              color: task.color,
              scheduledAt: task.scheduledAt,
              dueAt: task.dueAt,
              plan: plan ? { start: plan.start, end: plan.end } : null,
            }}
            onCancel={() => setEditing(false)}
            onSave={async (values) => {
              const ok = await dispatch({
                type: "task.edit",
                id: task.id,
                task: values,
              });
              if (ok) setEditing(false);
              return ok;
            }}
          />
          <div className="task-edit-actions">
            <button
              disabled={!previousId}
              onClick={() =>
                previousId &&
                void dispatch({
                  type: "task.move",
                  id: task.id,
                  beforeId: previousId,
                })
              }
              aria-label={`Move ${task.title} up`}
            >
              <ArrowUp size={14} /> Up
            </button>
            <button
              disabled={isLast}
              onClick={() =>
                void dispatch({
                  type: "task.move",
                  id: task.id,
                  beforeId: nextNextId,
                })
              }
              aria-label={`Move ${task.title} down`}
            >
              <ArrowDown size={14} /> Down
            </button>
            {!active && (
              <button
                onClick={() =>
                  void dispatch({ type: "task.select", id: task.id })
                }
              >
                <Play size={13} /> Select
              </button>
            )}
            <button className="delete-task" onClick={() => void remove()}>
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
