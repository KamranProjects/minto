import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Check, X } from "lucide-react";
import { MAX_MINUTES, TASK_COLORS } from "../shared/model";
import type { TaskInput } from "../shared/model";

interface TaskFormProps {
  initial?: TaskInput;
  onSave: (task: TaskInput) => Promise<boolean>;
  onCancel: () => void;
}
const colorNames = ["Paper", "Oat", "Peach", "Lavender", "Sage", "Mist"];

export function TaskForm({ initial, onSave, onCancel }: TaskFormProps) {
  const id = useId();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [minutes, setMinutes] = useState(String(initial?.minutes ?? 25));
  const [emoji, setEmoji] = useState(initial?.emoji ?? "🌿");
  const [color, setColor] = useState(initial?.color ?? TASK_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const localInput = (value: number | null | undefined) => {
    if (value == null) return "";
    const date = new Date(value);
    return new Date(value - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  const [start, setStart] = useState(
    localInput(initial?.scheduledAt ?? initial?.plan?.start),
  );
  const [end, setEnd] = useState(localInput(initial?.plan?.end));
  const [due, setDue] = useState(localInput(initial?.dueAt));
  const [planError, setPlanError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (
      end &&
      (!start || new Date(end).getTime() <= new Date(start).getTime())
    ) {
      setPlanError("Choose an end time after the start time.");
      return;
    }
    setPlanError("");
    setSaving(true);
    const ok = await onSave({
      title,
      minutes: Number(minutes),
      emoji,
      color,
      scheduledAt: start ? new Date(start).getTime() : null,
      dueAt: due ? new Date(due).getTime() : null,
      plan:
        start && end
          ? { start: new Date(start).getTime(), end: new Date(end).getTime() }
          : null,
    });
    if (!ok) setSaving(false);
  }

  return (
    <form
      className="task-form"
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <div className="form-heading">
        <strong>{initial ? "A little adjustment" : "One thing to do"}</strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Cancel task editing"
          onClick={onCancel}
        >
          <X size={16} />
        </button>
      </div>
      <label className="sr-only" htmlFor={`${id}-title`}>
        Task name
      </label>
      <input
        id={`${id}-title`}
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="What would you like to work on?"
        maxLength={200}
        required
      />
      <div className="form-details">
        <label htmlFor={`${id}-emoji`}>
          Emoji
          <input
            id={`${id}-emoji`}
            value={emoji}
            onChange={(event) => setEmoji(event.target.value)}
            maxLength={16}
          />
        </label>
        <label htmlFor={`${id}-minutes`}>
          Minutes
          <input
            id={`${id}-minutes`}
            type="number"
            min={1}
            max={MAX_MINUTES}
            step={1}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            required
          />
        </label>
        <button
          className="primary-button"
          disabled={saving || !title.trim()}
          type="submit"
        >
          {saving ? "Saving…" : initial ? "Save task" : "Add task"}
        </button>
      </div>
      <fieldset className="task-schedule">
        <legend>
          Plan & deadline <span>Optional</span>
        </legend>
        <div className="plan-fields">
          <label>
            Planned start
            <input
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label>
            Planned finish
            <input
              type="datetime-local"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
          <label>
            Due date & time
            <input
              type="datetime-local"
              value={due}
              onChange={(event) => setDue(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="quiet-button schedule-fill"
            onClick={() => {
              const beginning = start ? new Date(start).getTime() : Date.now();
              setStart(localInput(beginning));
              setEnd(
                localInput(
                  beginning + Math.max(1, Number(minutes) || 25) * 60000,
                ),
              );
            }}
          >
            Plan a {minutes || 25}-minute block
          </button>
          <small>
            Start is when you intend to work. Due is the deadline. These dates
            never start the timer automatically.
          </small>
        </div>
      </fieldset>
      {planError && <p role="alert">{planError}</p>}
      <div className="color-picker" aria-label="Task color">
        {TASK_COLORS.map((item, index) => (
          <button
            type="button"
            key={item}
            style={{ background: item }}
            onClick={() => setColor(item)}
            aria-label={`${colorNames[index]} task color`}
            aria-pressed={color === item}
          >
            {color === item && <Check size={13} />}
          </button>
        ))}
      </div>
    </form>
  );
}
