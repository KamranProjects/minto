import { getCurrent, remainingFor } from "../shared/model";
import { useFocus } from "../state/FocusContext";

export function TimeUp() {
  const { state, now, dispatch } = useFocus();
  const task = getCurrent(state);
  if (
    !task ||
    task.alert === "acknowledged" ||
    remainingFor(state, task, now) > 0
  )
    return null;
  return (
    <section className="time-up" aria-label="Time’s up" role="status">
      <span className="eyebrow">FOCUS BLOCK FINISHED</span>
      <strong>{task.title}</strong>
      <p>Paused at 00:00. Take a breath, then choose your next step.</p>
      <div>
        <button
          className="primary-button"
          onClick={() => void dispatch({ type: "task.complete", id: task.id })}
        >
          Mark done
        </button>
        <button
          className="quiet-button"
          onClick={() => void dispatch({ type: "timer.acknowledge" })}
        >
          Continue in overtime
        </button>
        <button
          className="quiet-button"
          onClick={async () => {
            if (await dispatch({ type: "timer.adjust", minutes: 5 }))
              await dispatch({ type: "timer.start" });
          }}
        >
          Add 5 minutes
        </button>
      </div>
    </section>
  );
}
