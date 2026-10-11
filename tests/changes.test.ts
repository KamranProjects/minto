import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  checkpoint,
  recoverState,
  validateState,
  validateDesktop,
} from "../src/shared/engine.js";
import { createState, TASK_COLORS } from "../src/shared/model.js";
import type { Command, FocusState } from "../src/shared/model.js";
import { dailyReview, dateKey, dayBounds } from "../src/shared/analytics.js";
import { FocusService } from "../electron/service.js";

const taskInput = {
  title: "Write a draft",
  minutes: 1,
  emoji: "",
  color: TASK_COLORS[0],
};
let sequence = 0;
const id = () => `test-${++sequence}`;
const command = (state: FocusState, value: Command, now: number) =>
  applyCommand(state, value, now, id);
function setup(now = 1000) {
  return command(createState(now), { type: "task.add", task: taskInput }, now);
}

test("version 1 migration preserves tasks, settings, and totals without fabricated history", () => {
  const state = setup();
  state.tasks[0].elapsedMs = 1234;
  state.tasks[0].focusMs = 5678;
  const legacy = JSON.parse(JSON.stringify(state));
  legacy.version = 1;
  delete legacy.sessions;
  delete legacy.plans;
  delete legacy.desktop;
  delete legacy.historySince;
  delete legacy.settings.dockStyle;
  delete legacy.settings.notifications;
  delete legacy.tasks[0].alert;
  legacy.settings.dockExpanded = false;
  const migrated = validateState(legacy);
  assert.equal(migrated.version, 5);
  assert.equal(migrated.tasks[0].focusMs, 5678);
  assert.equal(migrated.tasks[0].elapsedMs, 1234);
  assert.equal(migrated.settings.dockStyle, "digital");
  assert.deepEqual(migrated.sessions, []);
  assert.equal(legacy.version, 1);
});

test("checkpoints merge a running session without double counting and resume excludes breaks", () => {
  let state = command(setup(), { type: "timer.start" }, 1000);
  state = checkpoint(state, 2000);
  state = checkpoint(state, 3000);
  state = command(state, { type: "timer.pause" }, 4000);
  state = command(state, { type: "timer.start" }, 10000);
  state = checkpoint(state, 12000);
  assert.equal(state.sessions.length, 2);
  assert.equal(
    state.sessions.reduce((sum, item) => sum + item.end - item.start, 0),
    5000,
  );
  assert.equal(state.tasks[0].focusMs, 5000);
  const restored = recoverState(state);
  assert.deepEqual(checkpoint(restored, 999999).sessions, state.sessions);
});

test("switches, resets, completion and removal preserve accurate session history", () => {
  let state = setup();
  const first = state.tasks[0].id;
  state = command(
    state,
    { type: "task.add", task: { ...taskInput, title: "Tea" } },
    1000,
  );
  state = command(state, { type: "timer.start" }, 1000);
  state = command(state, { type: "timer.reset" }, 2000);
  state = command(state, { type: "timer.start" }, 3000);
  state = command(state, { type: "task.select", id: state.tasks[1].id }, 4000);
  state = command(state, { type: "task.complete", id: first }, 5000);
  state = command(state, { type: "task.remove", id: first }, 6000);
  assert.equal(
    state.sessions.reduce((sum, item) => sum + item.end - item.start, 0),
    2000,
  );
  assert.equal(state.tasks[0].focusMs, 2000);
  assert.equal(state.tasks[0].elapsedMs, 1000);
  assert.doesNotThrow(() => validateState(state));
});

test("daily analytics clips a session crossing local midnight and includes live time once", () => {
  const midnight = new Date(2026, 9, 10).getTime();
  let state = setup(midnight - 60000);
  state = command(state, { type: "timer.start" }, midnight - 30000);
  state = checkpoint(state, midnight + 10000);
  const previous = dailyReview(state, dateKey(midnight - 1), midnight + 30000);
  const today = dailyReview(state, dateKey(midnight), midnight + 30000);
  assert.equal(previous.focusedMs, 30000);
  assert.equal(today.focusedMs, 30000);
  assert.equal(dayBounds(dateKey(midnight)).start, midnight);
});

test("moving a planned block retains the old block without changing focus history", () => {
  let state = setup();
  const taskId = state.tasks[0].id;
  state = command(
    state,
    {
      type: "task.edit",
      id: taskId,
      task: { ...taskInput, plan: { start: 10000, end: 70000 } },
    },
    1000,
  );
  state = command(
    state,
    {
      type: "task.edit",
      id: taskId,
      task: { ...taskInput, plan: { start: 80000, end: 140000 } },
    },
    2000,
  );
  assert.equal(state.plans.length, 2);
  assert.equal(state.plans[0].movedAt, 2000);
  assert.equal(state.plans[1].movedAt, null);
  assert.deepEqual(state.sessions, []);
  assert.equal(state.tasks[0].elapsedMs, 0);
  state = command(
    state,
    { type: "task.edit", id: taskId, task: { ...taskInput, plan: null } },
    3000,
  );
  assert.equal(state.plans[1].movedAt, 3000);
});

test("planned blocks reject invalid ranges and overlapping blocks remain visible", () => {
  let state = setup();
  const at = new Date(2026, 9, 10, 9).getTime();
  assert.throws(() =>
    command(
      state,
      {
        type: "task.edit",
        id: state.tasks[0].id,
        task: { ...taskInput, plan: { start: at, end: at } },
      },
      at,
    ),
  );
  state = command(
    state,
    {
      type: "task.edit",
      id: state.tasks[0].id,
      task: { ...taskInput, plan: { start: at, end: at + 60000 } },
    },
    at,
  );
  state = command(
    state,
    {
      type: "task.add",
      task: { ...taskInput, plan: { start: at, end: at + 60000 } },
    },
    at,
  );
  const review = dailyReview(state, dateKey(at), at + 70000);
  assert.equal(review.plannedMs, 120000);
  assert.ok(
    review.plans.every((plan) => plan.overlaps && plan.status === "Missed"),
  );
});

test("analytics distinguishes planned-window focus, actual focus, and completion deadline", () => {
  const at = new Date(2026, 9, 10, 9).getTime();
  let state = setup(at - 60000);
  state = command(
    state,
    {
      type: "task.edit",
      id: state.tasks[0].id,
      task: { ...taskInput, plan: { start: at, end: at + 60000 } },
    },
    at - 60000,
  );
  state = command(state, { type: "timer.start" }, at - 30000);
  state = command(state, { type: "timer.acknowledge" }, at + 30000);
  state = command(
    state,
    { type: "task.complete", id: state.tasks[0].id },
    at + 90000,
  );
  const review = dailyReview(state, dateKey(at), at + 90000);
  assert.equal(review.focusedMs, 120000);
  assert.equal(review.plans[0].focusedMs, 60000);
  assert.equal(review.plans[0].deadlineDeltaMs, 30000);
  assert.equal(review.plans[0].status, "Completed");
  assert.equal(review.remainingMs, 0);
});

test("corrupt new history and placement fields are rejected", () => {
  const state = setup();
  assert.throws(() =>
    validateState({
      ...state,
      sessions: [{ taskId: "missing", start: 1, end: 2, title: "x" }],
    }),
  );
  assert.throws(() => validateState({ ...state, desktop: {} }));
  assert.throws(() =>
    validateDesktop({ main: { x: NaN }, dock: null, dockOpen: false }),
  );
  assert.throws(() =>
    validateState({
      ...state,
      settings: { ...state.settings, dockStyle: "unknown" },
    }),
  );
});

test("dock layout selection preserves legacy expand/collapse controls", () => {
  let state = command(
    setup(),
    { type: "settings.update", settings: { dockStyle: "pie" } },
    1000,
  );
  assert.equal(state.settings.dockExpanded, false);
  state = command(
    state,
    { type: "settings.update", settings: { dockExpanded: true } },
    1000,
  );
  assert.equal(state.settings.dockStyle, "pie");
  state = command(
    state,
    { type: "settings.update", settings: { dockExpanded: false } },
    1000,
  );
  assert.equal(state.settings.dockStyle, "pie");
});

test("time-up is claimed once, survives recovery, and rearms when time is added", async () => {
  let now = 1000;
  let saved = createState(now);
  const repo = {
    load: async () => ({ state: saved, message: null }),
    save: async (value: FocusState) => {
      saved = structuredClone(value);
    },
  };
  const service = new FocusService(setup(), repo, () => now);
  await service.dispatch({ type: "timer.start" });
  now += 60000;
  let alerts = 0;
  await Promise.all([
    service.checkTimeUp(() => alerts++),
    service.checkTimeUp(() => alerts++),
  ]);
  assert.equal(alerts, 1);
  assert.equal(saved.tasks[0].alert, "pending");
  const restarted = new FocusService(recoverState(saved), repo, () => now);
  await restarted.dispatch({ type: "timer.start" });
  await restarted.checkTimeUp(() => alerts++);
  assert.equal(alerts, 1);
  await restarted.dispatch({ type: "timer.acknowledge" });
  assert.equal(restarted.snapshot().state.tasks[0].alert, "acknowledged");
  await restarted.dispatch({ type: "timer.adjust", minutes: 5 });
  now += 300000;
  await restarted.checkTimeUp(() => alerts++);
  assert.equal(alerts, 2);
});

test("failed time-up persistence never emits an alert and succeeds once on retry", async () => {
  let fail = false;
  let now = 1000;
  const service = new FocusService(
    setup(),
    {
      load: async () => ({ state: setup(), message: null }),
      save: async () => {
        if (fail) throw new Error("disk full");
      },
    },
    () => now,
  );
  await service.dispatch({ type: "timer.start" });
  now += 60001;
  fail = true;
  let alerts = 0;
  await service.checkTimeUp(() => alerts++);
  assert.equal(alerts, 0);
  assert.equal(service.snapshot().state.tasks[0].alert, null);
  assert.ok(service.snapshot().storageError);
  fail = false;
  await service.checkTimeUp(() => alerts++);
  assert.equal(alerts, 1);
});

test("desktop writes and task commands serialize without losing either change", async () => {
  const repo = {
    load: async () => ({ state: createState(1), message: null }),
    save: async () => undefined,
  };
  const service = new FocusService(createState(1), repo, () => 1000);
  const desktop = {
    main: {
      x: -800,
      y: 20,
      width: 438,
      height: 800,
      displayId: 3,
      maximized: true,
    },
    dock: null,
    dockOpen: false,
  };
  await Promise.all([
    service.saveDesktop(desktop),
    service.dispatch({ type: "task.add", task: taskInput }),
  ]);
  assert.equal(service.snapshot().state.tasks.length, 1);
  assert.deepEqual(service.snapshot().state.desktop, desktop);
});

test("a delayed expiration records only the countdown, not time waiting for a decision", () => {
  let state = command(setup(), { type: "timer.start" }, 1000);
  state = checkpoint(state, 3601000);
  assert.equal(state.tasks[0].elapsedMs, 60000);
  assert.equal(state.tasks[0].focusMs, 60000);
  assert.equal(state.timer.startedAt, null);
  assert.deepEqual(
    state.sessions.map(({ start, end }) => [start, end]),
    [[1000, 61000]],
  );
  state = command(state, { type: "timer.expire" }, 3601000);
  state = command(state, { type: "timer.adjust", minutes: 5 }, 3601000);
  state = command(state, { type: "timer.start" }, 3601000);
  state = command(state, { type: "timer.pause" }, 3602000);
  assert.equal(state.tasks[0].focusMs, 61000);
});

test("due date and standalone planned start persist independently of a time block", () => {
  const at = new Date(2026, 9, 10, 9).getTime();
  let state = command(
    createState(at),
    {
      type: "task.add",
      task: { ...taskInput, scheduledAt: at, dueAt: at + 3600000 },
    },
    at,
  );
  assert.equal(state.plans.length, 0);
  assert.equal(dailyReview(state, dateKey(at), at).scheduled.length, 1);
  state = command(
    state,
    {
      type: "task.edit",
      id: state.tasks[0].id,
      task: { ...taskInput, dueAt: null },
    },
    at,
  );
  assert.equal(state.tasks[0].scheduledAt, at);
  assert.equal(state.tasks[0].dueAt, null);
  assert.throws(
    () =>
      command(
        state,
        {
          type: "task.edit",
          id: state.tasks[0].id,
          task: { ...taskInput, dueAt: NaN },
        },
        at,
      ),
    /valid date/,
  );
  assert.doesNotThrow(() => validateState(state));
});

test("version 2 migration keeps historical focus while ending unchosen automatic overtime", () => {
  const state = setup();
  const old = JSON.parse(JSON.stringify(state));
  old.version = 2;
  old.tasks[0].elapsedMs = 120000;
  old.tasks[0].focusMs = 120000;
  old.tasks[0].alert = "pending";
  delete old.tasks[0].dueAt;
  delete old.tasks[0].scheduledAt;
  const migrated = validateState(old);
  assert.equal(migrated.tasks[0].elapsedMs, 60000);
  assert.equal(migrated.tasks[0].focusMs, 120000);
  assert.equal(migrated.tasks[0].dueAt, null);
  old.tasks[0].elapsedMs = Infinity;
  assert.throws(() => validateState(old));
});

test("custom palette and completion sound validate, persist, and migrate", () => {
  const state = command(
    setup(),
    {
      type: "settings.update",
      settings: {
        primaryColor: "#ffffff",
        accent: "#ffffff",
        completionSound: false,
      },
    },
    1000,
  );
  assert.deepEqual(
    validateState(JSON.parse(JSON.stringify(state))).settings,
    state.settings,
  );
  for (const color of ["red", "#fff", "url(bad)", "#gg0000"]) {
    assert.throws(() =>
      command(
        state,
        { type: "settings.update", settings: { primaryColor: color } },
        1000,
      ),
    );
  }
  const legacy = JSON.parse(JSON.stringify(state));
  legacy.version = 3;
  delete legacy.settings.primaryColor;
  delete legacy.settings.completionSound;
  const migrated = validateState(legacy);
  assert.equal(migrated.settings.primaryColor, "#687e60");
  assert.equal(migrated.settings.accent, "#ffffff");
  assert.equal(migrated.settings.completionSound, true);
  assert.deepEqual(migrated.tasks, state.tasks);
});

test("saved routines reuse fresh tasks and survive migration", () => {
  const initial = createState(1000);
  const added = command(
    initial,
    {
      type: "routine.add",
      routine: {
        title: "  Morning focus  ",
        emoji: "🌿",
        tasks: [taskInput, { ...taskInput, title: "Review" }],
      },
    },
    1100,
  );
  assert.equal(added.routines[0].title, "Morning focus");
  assert.equal(added.tasks.length, 0);
  const used = command(
    added,
    { type: "routine.use", id: added.routines[0].id },
    1200,
  );
  assert.deepEqual(
    used.tasks.map((task) => task.title),
    ["Write a draft", "Review"],
  );
  assert.equal(used.routines.length, 1);
  assert.equal(used.timer.startedAt, null);
  const secondUse = command(
    used,
    { type: "routine.use", id: added.routines[0].id },
    1300,
  );
  assert.equal(secondUse.tasks.length, 4);
  assert.notEqual(secondUse.tasks[0].id, secondUse.tasks[2].id);
  const removed = command(
    secondUse,
    { type: "routine.remove", id: added.routines[0].id },
    1400,
  );
  assert.equal(removed.routines.length, 0);
  assert.equal(removed.tasks.length, 4);
  const previous = { ...initial, version: 4 };
  delete (previous as unknown as { routines?: unknown }).routines;
  assert.deepEqual(validateState(previous).routines, []);
});

test("invalid routines and oversized templates never change the task list", () => {
  const initial = createState(1000);
  for (const tasks of [
    [],
    [{ ...taskInput, minutes: 0 }],
    Array(21).fill(taskInput),
  ]) {
    assert.throws(() =>
      command(
        initial,
        { type: "routine.add", routine: { title: "Nope", emoji: "", tasks } },
        1100,
      ),
    );
    assert.equal(initial.routines.length, 0);
  }
  assert.throws(() =>
    command(initial, { type: "routine.use", id: "missing" }, 1200),
  );
  const corrupt = structuredClone(initial);
  corrupt.routines = [
    {
      id: "x",
      title: "Bad",
      emoji: "",
      tasks: [{ ...taskInput, minutes: 0 }],
      createdAt: 1000,
    },
  ];
  assert.throws(() => validateState(corrupt));
});
