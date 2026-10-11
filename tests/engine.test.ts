import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  checkpoint,
  recoverState,
  validateState,
} from "../src/shared/engine.js";
import {
  createState,
  formatMinutes,
  formatTime,
  getCurrent,
  isPending,
  listRemaining,
  remainingFor,
  TASK_COLORS,
} from "../src/shared/model.js";
import type { Command, FocusState, TaskInput } from "../src/shared/model.js";

const task = (title = "Write something", minutes = 25): TaskInput => ({
  title,
  minutes,
  emoji: "🌱",
  color: TASK_COLORS[0],
});
function fixture() {
  let sequence = 0;
  let state = createState(1000);
  return {
    get state() {
      return state;
    },
    send(command: Command, now = 1000) {
      state = applyCommand(state, command, now, () => `task-${++sequence}`);
      return state;
    },
  };
}

test("first task is selected without auto-start and title is trimmed", () => {
  const f = fixture();
  f.send({ type: "task.add", task: task("  Plan my day  ", 10) });
  assert.equal(getCurrent(f.state)?.title, "Plan my day");
  assert.equal(f.state.timer.startedAt, null);
  assert.equal(listRemaining(f.state, 1000), 600000);
});

test("timestamp timing handles a delayed callback without drift", () => {
  const f = fixture();
  f.send({ type: "task.add", task: task() });
  f.send({ type: "timer.start" });
  assert.equal(remainingFor(f.state, f.state.tasks[0], 135432), 1365568);
  f.send({ type: "timer.pause" }, 135432);
  assert.equal(f.state.tasks[0].elapsedMs, 134432);
  assert.equal(f.state.tasks[0].focusMs, 134432);
});

test("pause excludes time away, resume keeps sub-second accuracy", () => {
  const f = fixture();
  f.send({ type: "task.add", task: task() });
  f.send({ type: "timer.start" });
  f.send({ type: "timer.pause" }, 1550);
  f.send({ type: "timer.start" }, 10000);
  f.send({ type: "timer.pause" }, 10450);
  assert.equal(f.state.tasks[0].elapsedMs, 1000);
});

test("repeated starts and pauses are idempotent", () => {
  const f = fixture();
  f.send({ type: "task.add", task: task() });
  f.send({ type: "timer.start" });
  f.send({ type: "timer.start" }, 2000);
  f.send({ type: "timer.pause" }, 3000);
  f.send({ type: "timer.pause" }, 9000);
  assert.equal(f.state.tasks[0].elapsedMs, 2000);
});

test("switching tasks pauses, preserves progress and resumes the selected task", () => {
  const f = fixture();
  f.send({ type: "task.addMany", tasks: [task("First"), task("Second")] });
  f.send({ type: "timer.start" });
  f.send({ type: "task.select", id: "task-2" }, 31000);
  assert.equal(f.state.tasks[0].elapsedMs, 30000);
  assert.equal(f.state.timer.startedAt, null);
  f.send({ type: "task.select", id: "task-1" }, 40000);
  assert.equal(remainingFor(f.state, f.state.tasks[0], 90000), 1470000);
});

test("selecting the current task does not pause or reset it", () => {
  const f = fixture();
  f.send({ type: "task.add", task: task() });
  f.send({ type: "timer.start" });
  f.send({ type: "task.select", id: "task-1" }, 21000);
  assert.notEqual(f.state.timer.startedAt, null);
  assert.equal(f.state.tasks[0].elapsedMs, 20000);
});

test("countdown stops at zero and overtime requires an explicit choice", () => {
  const f = fixture();
  f.send({ type: "task.addMany", tasks: [task("Small", 1), task("Next", 5)] });
  f.send({ type: "timer.start" });
  assert.equal(remainingFor(f.state, f.state.tasks[0], 91000), 0);
  assert.equal(listRemaining(f.state, 91000), 300000);
  assert.equal(f.state.tasks[0].completedAt, null);
  f.send({ type: "timer.expire" }, 91000);
  assert.equal(f.state.tasks[0].focusMs, 60000);
  assert.equal(f.state.timer.startedAt, null);
  assert.throws(
    () => f.send({ type: "timer.start" }, 100000),
    /countdown is finished/,
  );
  f.send({ type: "timer.acknowledge" }, 100000);
  assert.equal(remainingFor(f.state, f.state.tasks[0], 130000), -30000);
  assert.equal(formatTime(-30000), "+00:30");
});

test("adjusting time in overtime preserves elapsed work and running state", () => {
  const f = fixture();
  f.send({ type: "task.add", task: task("Small", 1) });
  f.send({ type: "timer.start" });
  f.send({ type: "timer.acknowledge" }, 61000);
  f.send({ type: "timer.adjust", minutes: 5 }, 91000);
  assert.equal(f.state.tasks[0].elapsedMs, 90000);
  assert.equal(remainingFor(f.state, f.state.tasks[0], 91000), 270000);
  assert.notEqual(f.state.timer.startedAt, null);
});

test("duration adjustment is clamped to supported limits", () => {
  const f = fixture();
  f.send({ type: "task.add", task: task("Small", 1) });
  f.send({ type: "timer.adjust", minutes: -5 });
  assert.equal(f.state.tasks[0].durationMs, 60000);
  f.send({ type: "task.edit", id: "task-1", task: task("Long", 1440) });
  f.send({ type: "timer.adjust", minutes: 5 });
  assert.equal(f.state.tasks[0].durationMs, 86400000);
});

test("editing active duration preserves elapsed focus and running state", () => {
  const f = fixture();
  f.send({ type: "task.add", task: task() });
  f.send({ type: "timer.start" });
  f.send({ type: "task.edit", id: "task-1", task: task("Revised", 10) }, 61000);
  assert.equal(f.state.tasks[0].elapsedMs, 60000);
  assert.equal(getCurrent(f.state)?.title, "Revised");
  assert.equal(remainingFor(f.state, f.state.tasks[0], 61000), 540000);
});

test("reset pauses and resets the countdown but keeps all focused time", () => {
  const f = fixture();
  f.send({ type: "task.add", task: task() });
  f.send({ type: "timer.start" });
  f.send({ type: "timer.reset" }, 31000);
  assert.equal(f.state.tasks[0].elapsedMs, 0);
  assert.equal(f.state.tasks[0].focusMs, 30000);
  assert.equal(f.state.timer.startedAt, null);
  f.send({ type: "timer.start" }, 41000);
  f.send({ type: "timer.pause" }, 51000);
  assert.equal(f.state.tasks[0].focusMs, 40000);
  assert.equal(f.state.tasks[0].elapsedMs, 10000);
});

test("complete selects the next pending task paused and supports reopening", () => {
  const f = fixture();
  f.send({ type: "task.addMany", tasks: [task("First"), task("Second")] });
  f.send({ type: "timer.start" });
  f.send({ type: "task.complete", id: "task-1" }, 61000);
  assert.equal(getCurrent(f.state)?.id, "task-2");
  assert.equal(f.state.timer.startedAt, null);
  assert.equal(f.state.tasks[0].focusMs, 60000);
  f.send({ type: "task.reopen", id: "task-1" });
  assert.equal(f.state.tasks[0].completedAt, null);
});

test("completing a non-active task does not pause the active timer", () => {
  const f = fixture();
  f.send({ type: "task.addMany", tasks: [task("First"), task("Second")] });
  f.send({ type: "timer.start" });
  f.send({ type: "task.complete", id: "task-2" }, 61000);
  assert.equal(getCurrent(f.state)?.id, "task-1");
  assert.notEqual(f.state.timer.startedAt, null);
});

test("completing twice does not select or disturb another running task", () => {
  const f = fixture();
  f.send({ type: "task.addMany", tasks: [task("First"), task("Second")] });
  f.send({ type: "task.complete", id: "task-1" });
  f.send({ type: "timer.start" });
  f.send({ type: "task.complete", id: "task-1" }, 2000);
  assert.equal(f.state.timer.taskId, "task-2");
  assert.notEqual(f.state.timer.startedAt, null);
});

test("deleting the last task leaves a valid empty timer; restore recovers progress", () => {
  const f = fixture();
  f.send({ type: "task.add", task: task() });
  f.send({ type: "timer.start" });
  f.send({ type: "task.remove", id: "task-1" }, 11000);
  assert.deepEqual(f.state.timer, { taskId: null, startedAt: null });
  f.send({ type: "task.restore", id: "task-1" });
  assert.equal(getCurrent(f.state)?.elapsedMs, 10000);
  assert.doesNotThrow(() => validateState(f.state));
});

test("reordering leaves timing and active selection unchanged", () => {
  const f = fixture();
  f.send({ type: "task.addMany", tasks: [task("A"), task("B"), task("C")] });
  f.send({ type: "timer.start" });
  f.send({ type: "task.move", id: "task-3", beforeId: "task-1" }, 6000);
  assert.deepEqual(
    f.state.tasks.map((task) => task.title),
    ["C", "A", "B"],
  );
  assert.equal(f.state.timer.taskId, "task-1");
  f.send({ type: "task.move", id: "task-3", beforeId: null });
  assert.deepEqual(
    f.state.tasks.map((task) => task.title),
    ["A", "B", "C"],
  );
});

test("clear completed archives only completed tasks and can be undone", () => {
  const f = fixture();
  f.send({ type: "task.addMany", tasks: [task("A"), task("B")] });
  f.send({ type: "task.complete", id: "task-1" });
  f.send({ type: "task.archiveCompleted" });
  assert.ok(f.state.tasks[0].archivedAt);
  assert.equal(isPending(f.state.tasks[1]), true);
  f.send({ type: "task.unarchive", ids: ["task-1"] });
  assert.equal(f.state.tasks[0].archivedAt, null);
});

test("restart restores only checkpoint time and always pauses", () => {
  const f = fixture();
  f.send({ type: "task.add", task: task() });
  f.send({ type: "timer.start" });
  const saved = checkpoint(f.state, 41000);
  const restored = recoverState(
    validateState(JSON.parse(JSON.stringify(saved))),
  );
  assert.equal(restored.tasks[0].elapsedMs, 40000);
  assert.equal(restored.timer.startedAt, null);
  assert.equal(remainingFor(restored, restored.tasks[0], 99999999), 1460000);
});

test("clock rollback never subtracts time or double-counts when time catches up", () => {
  const f = fixture();
  f.send({ type: "task.add", task: task() });
  f.send({ type: "timer.start" }, 5000);
  const back = checkpoint(f.state, 2000);
  const forward = checkpoint(back, 6000);
  assert.equal(back.tasks[0].elapsedMs, 0);
  assert.equal(forward.tasks[0].elapsedMs, 1000);
});

test("invalid commands cannot partially mutate the source state", () => {
  const state = createState(1000);
  const before = JSON.stringify(state);
  assert.throws(() =>
    applyCommand(
      state,
      { type: "task.addMany", tasks: [task(), task("   ")] },
      1000,
      () => "id",
    ),
  );
  assert.equal(JSON.stringify(state), before);
  for (const command of [
    null,
    {},
    { type: "oops" },
    { type: "timer.start" },
    { type: "task.add", task: task("bad", NaN) },
    { type: "settings.update", settings: { nodeIntegration: true } },
    { type: "settings.update", settings: { sound: "yes" } },
  ]) {
    assert.throws(() => applyCommand(state, command, 1000, () => "id"));
  }
});

test("input limits reject infinity, fractions, excessive titles and unknown colors", () => {
  for (const input of [
    task("", 1),
    task("a", 0),
    task("a", 1441),
    task("a", 1.5),
    task("a", Infinity),
    task("x".repeat(201)),
    { ...task(), color: "url(https://example.com)" },
  ]) {
    assert.throws(() =>
      applyCommand(
        createState(1),
        { type: "task.add", task: input },
        1,
        () => "id",
      ),
    );
  }
});

test("saved-file validation rejects duplicate IDs, dangling timers and corrupt settings", () => {
  const f = fixture();
  f.send({ type: "task.add", task: task() });
  for (const mutate of [
    (state: FocusState) => {
      state.tasks.push(structuredClone(state.tasks[0]));
    },
    (state: FocusState) => {
      state.timer.taskId = "missing";
    },
    (state: FocusState) => {
      state.tasks[0].elapsedMs = -1;
    },
    (state: FocusState) => {
      state.settings = {} as FocusState["settings"];
    },
    (state: FocusState) => {
      state.tasks[0].durationMs = 1.2;
    },
  ]) {
    const copy = structuredClone(f.state);
    mutate(copy);
    assert.throws(() => validateState(copy));
  }
});

test("time formatting handles hour boundaries and rounds remaining seconds up", () => {
  assert.equal(formatTime(1), "00:01");
  assert.equal(formatTime(3600000), "60:00");
  assert.equal(formatMinutes(3600000), "1h");
  assert.equal(formatMinutes(3599000), "1h");
  assert.equal(formatMinutes(3660000), "1h 1m");
  assert.equal(formatMinutes(-100), "0 min");
});
