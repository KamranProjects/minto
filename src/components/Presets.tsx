import { useState } from "react";
import { ArrowUpRight, Plus, Trash2, X } from "lucide-react";
import { TASK_COLORS } from "../shared/model";
import { useFocus } from "../state/FocusContext";

const presets = [
  {
    title: "A gentle start",
    emoji: "☀️",
    description: "Make a little space for the day.",
    tasks: [
      { title: "Plan my day", minutes: 10, emoji: "🌿" },
      { title: "Start the important thing", minutes: 25, emoji: "✍️" },
    ],
  },
  {
    title: "Clear the small things",
    emoji: "🧺",
    description: "A lighter list, a clearer head.",
    tasks: [
      { title: "Reply to messages", minutes: 15, emoji: "💌" },
      { title: "Tidy the loose ends", minutes: 10, emoji: "🧺" },
    ],
  },
  {
    title: "A focused hour",
    emoji: "🌱",
    description: "Two small stretches of focus.",
    tasks: [
      { title: "First focus session", minutes: 25, emoji: "🌱" },
      { title: "Stretch and get some water", minutes: 10, emoji: "💧" },
      { title: "Second focus session", minutes: 25, emoji: "🌳" },
    ],
  },
  {
    title: "Time to reset",
    emoji: "☕",
    description: "Step away. Come back refreshed.",
    tasks: [
      { title: "Make a cup of tea", minutes: 5, emoji: "☕" },
      { title: "A short walk", minutes: 10, emoji: "🍃" },
    ],
  },
];

export function Presets({ onLoaded }: { onLoaded: () => void }) {
  const { state, dispatch, notify } = useFocus();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [drafts, setDrafts] = useState([{ title: "", minutes: 25 }]);
  async function useTasks(
    name: string,
    tasks: { title: string; minutes: number; emoji: string; color: string }[],
  ) {
    if (await dispatch({ type: "task.addMany", tasks })) {
      notify(`${name} added to your list.`);
      onLoaded();
    }
  }
  return (
    <section className="presets-page">
      <div className="page-heading">
        <span className="eyebrow">FAMILIAR RHYTHMS</span>
        <h1>Routines</h1>
        <p>Save the lists you reach for often.</p>
      </div>
      <div className="routine-header">
        <h2>Your routines</h2>
        <button
          className="primary-button"
          onClick={() => setCreating((open) => !open)}
        >
          {creating ? <X size={14} /> : <Plus size={14} />}
          {creating ? "Cancel" : "New routine"}
        </button>
      </div>
      {creating && (
        <form
          className="routine-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const tasks = drafts.map((task) => ({
              ...task,
              emoji: "",
              color: TASK_COLORS[0],
            }));
            if (
              await dispatch({
                type: "routine.add",
                routine: { title, emoji, tasks },
              })
            ) {
              notify(
                `${title.trim()} saved. Add it to your list whenever you like.`,
              );
              setTitle("");
              setEmoji("");
              setDrafts([{ title: "", minutes: 25 }]);
              setCreating(false);
            }
          }}
        >
          <label>
            Routine name
            <input
              required
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="My morning focus"
            />
          </label>
          <label>
            Emoji (optional)
            <input
              maxLength={16}
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              placeholder="🌿"
            />
          </label>
          <div className="routine-form-heading">
            <strong>Tasks in this routine</strong>
            <small>They are added fresh each time you use it.</small>
          </div>
          {drafts.map((draft, index) => (
            <div className="routine-draft" key={index}>
              <label>
                Task {index + 1}
                <input
                  required
                  maxLength={200}
                  value={draft.title}
                  onChange={(event) =>
                    setDrafts((current) =>
                      current.map((item, i) =>
                        i === index
                          ? { ...item, title: event.target.value }
                          : item,
                      ),
                    )
                  }
                  placeholder="What will you do?"
                />
              </label>
              <label>
                Minutes
                <input
                  required
                  type="number"
                  min={1}
                  max={1440}
                  value={draft.minutes}
                  onChange={(event) =>
                    setDrafts((current) =>
                      current.map((item, i) =>
                        i === index
                          ? { ...item, minutes: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              {drafts.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove task ${index + 1}`}
                  onClick={() =>
                    setDrafts((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
          <div className="routine-form-actions">
            <button
              type="button"
              disabled={drafts.length >= 20}
              onClick={() =>
                setDrafts((current) => [...current, { title: "", minutes: 25 }])
              }
            >
              <Plus size={14} /> Add another task
            </button>
            <button className="primary-button" type="submit">
              Save routine
            </button>
          </div>
        </form>
      )}
      {state.routines.length === 0 && !creating && (
        <p className="empty-hint">
          No saved routines yet. Make one for a list you repeat.
        </p>
      )}
      <div className="preset-list">
        {state.routines.map((routine) => (
          <article className="preset-card" key={routine.id}>
            <div className="preset-heading">
              <span>{routine.emoji || "🌿"}</span>
              <div>
                <h2>{routine.title}</h2>
                <p>Your saved routine</p>
              </div>
            </div>
            <ul>
              {routine.tasks.map((task, index) => (
                <li key={index}>
                  <span>{task.title}</span>
                  <span>{task.minutes} min</span>
                </li>
              ))}
            </ul>
            <div className="routine-card-actions">
              <button
                className="routine-use"
                onClick={async () => {
                  if (await dispatch({ type: "routine.use", id: routine.id })) {
                    notify(`${routine.title} added to your list.`);
                    onLoaded();
                  }
                }}
              >
                <Plus size={14} /> Add {routine.tasks.length} tasks
              </button>
              <button
                className="routine-remove"
                aria-label={`Delete ${routine.title} routine`}
                title="Delete saved routine"
                onClick={() =>
                  void dispatch({ type: "routine.remove", id: routine.id })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="routine-header">
        <h2>Starter ideas</h2>
      </div>
      <div className="preset-list">
        {presets.map((preset) => (
          <article className="preset-card" key={preset.title}>
            <div className="preset-heading">
              <span>{preset.emoji}</span>
              <div>
                <h2>{preset.title}</h2>
                <p>{preset.description}</p>
              </div>
            </div>
            <ul>
              {preset.tasks.map((task) => (
                <li key={task.title}>
                  <span>{task.title}</span>
                  <span>{task.minutes} min</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() =>
                void useTasks(
                  preset.title,
                  preset.tasks.map((task) => ({
                    ...task,
                    color: TASK_COLORS[0],
                  })),
                )
              }
            >
              <Plus size={14} /> Add {preset.tasks.length} tasks{" "}
              <span>
                {preset.tasks.reduce((sum, task) => sum + task.minutes, 0)} min{" "}
                <ArrowUpRight size={13} />
              </span>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
