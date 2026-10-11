import {
  MAX_MINUTES,
  TASK_COLORS,
  createState,
  getCurrent,
  isPending,
  runningDelta,
  DOCK_LAYOUTS,
} from "./model.js";
import type {
  Command,
  FocusState,
  Settings,
  Task,
  TaskInput,
  DesktopState,
  RoutineTemplate,
} from "./model.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validNumber(
  value: unknown,
  max = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= max
  );
}

function nullableTime(value: unknown): boolean {
  return value === null || validNumber(value);
}

export function validateTaskInput(value: unknown): TaskInput {
  assert(record(value), "Enter a task name and a time.");
  assert(
    typeof value.title === "string" &&
      value.title.trim().length > 0 &&
      value.title.trim().length <= 200,
    "Task names need 1–200 characters.",
  );
  assert(
    typeof value.minutes === "number" &&
      Number.isInteger(value.minutes) &&
      value.minutes >= 1 &&
      value.minutes <= MAX_MINUTES,
    `Choose a whole number from 1 to ${MAX_MINUTES} minutes.`,
  );
  assert(
    typeof value.emoji === "string" && value.emoji.length <= 16,
    "Choose a short emoji.",
  );
  assert(
    typeof value.color === "string" &&
      (TASK_COLORS as readonly string[]).includes(value.color),
    "Choose one of the task colors.",
  );
  if (value.plan !== undefined && value.plan !== null) {
    assert(
      record(value.plan) &&
        validNumber(value.plan.start, 8640000000000000) &&
        validNumber(value.plan.end, 8640000000000000) &&
        value.plan.end > value.plan.start &&
        value.plan.end - value.plan.start <= 7 * 86400000,
      "Choose a valid planned start and end, no more than seven days apart.",
    );
  }
  for (const key of ["scheduledAt", "dueAt"])
    assert(
      value[key] === undefined ||
        value[key] === null ||
        validNumber(value[key], 8640000000000000),
      "Choose a valid date and time.",
    );
  return {
    title: value.title.trim(),
    minutes: value.minutes,
    emoji: value.emoji.trim(),
    color: value.color,
    ...(value.scheduledAt !== undefined
      ? { scheduledAt: value.scheduledAt as number | null }
      : {}),
    ...(value.dueAt !== undefined
      ? { dueAt: value.dueAt as number | null }
      : {}),
    ...(value.plan !== undefined
      ? { plan: value.plan as TaskInput["plan"] }
      : {}),
  };
}

function validateSettings(value: unknown): Partial<Settings> {
  assert(
    record(value) && Object.keys(value).length > 0,
    "Choose a setting to change.",
  );
  for (const [key, setting] of Object.entries(value)) {
    if (key === "accent" || key === "primaryColor")
      assert(
        typeof setting === "string" && /^#[0-9a-f]{6}$/i.test(setting),
        "Choose a six-digit hex color.",
      );
    else if (key === "timerStyle")
      assert(
        setting === "pie" || setting === "digital",
        "Unknown timer style.",
      );
    else if (key === "dockStyle")
      assert(
        DOCK_LAYOUTS.some((layout) => layout.id === setting),
        "Unknown dock style.",
      );
    else {
      assert(
        [
          "mainOnTop",
          "dockOnTop",
          "dockExpanded",
          "showCompleted",
          "celebrate",
          "sound",
          "completionSound",
          "notifications",
        ].includes(key),
        "Unknown setting.",
      );
      assert(
        typeof setting === "boolean",
        "That setting needs an on/off value.",
      );
    }
  }
  return value as Partial<Settings>;
}

export function validateState(
  value: unknown,
  migrationTime = Date.now(),
): FocusState {
  // Upgrade old saves without inventing historical sessions from lifetime totals.
  if (record(value) && value.version === 1) {
    const old = structuredClone(value);
    assert(
      record(old.settings) && Array.isArray(old.tasks),
      "Invalid legacy save.",
    );
    value = {
      ...old,
      version: 2,
      sessions: [],
      plans: [],
      historySince: migrationTime,
      desktop: { main: null, dock: null, dockOpen: false },
      tasks: old.tasks.map((task) => {
        assert(record(task), "Invalid legacy task.");
        return { ...task, alert: null };
      }),
      settings: {
        ...old.settings,
        notifications: true,
        dockStyle: old.settings.dockExpanded ? "expanded" : "digital",
      },
    };
  }
  if (record(value) && value.version === 2) {
    const old = structuredClone(value);
    assert(
      Array.isArray(old.tasks) && Array.isArray(old.plans),
      "Invalid saved tasks.",
    );
    const plans = old.plans;
    value = {
      ...old,
      version: 3,
      tasks: old.tasks.map((task) => {
        assert(record(task), "Invalid saved task.");
        assert(
          validNumber(task.elapsedMs) &&
            validNumber(task.durationMs) &&
            validNumber(task.focusMs) &&
            task.focusMs >= task.elapsedMs,
          "Invalid saved task time.",
        );
        const plan = plans.find(
          (item) =>
            record(item) && item.taskId === task.id && item.movedAt === null,
        );
        return {
          ...task,
          scheduledAt: plan?.start ?? null,
          dueAt: null,
          elapsedMs:
            task.alert === "acknowledged"
              ? task.elapsedMs
              : Math.min(Number(task.elapsedMs), Number(task.durationMs)),
        };
      }),
    };
  }
  if (record(value) && value.version === 3) {
    assert(record(value.settings), "Invalid saved settings.");
    value = {
      ...value,
      version: 4,
      settings: {
        ...value.settings,
        primaryColor: "#687e60",
        completionSound: true,
      },
    };
  }
  if (record(value) && value.version === 4) {
    value = { ...value, version: 5, routines: [] };
  }
  assert(
    record(value) && value.version === 5,
    "This backup uses an unsupported format.",
  );
  assert(
    validNumber(value.revision) &&
      Number.isInteger(value.revision) &&
      validNumber(value.savedAt),
    "Invalid save metadata.",
  );
  assert(
    Array.isArray(value.tasks) && value.tasks.length <= 10000,
    "Invalid task list.",
  );
  const ids = new Set<string>();
  for (const task of value.tasks) {
    assert(
      record(task) &&
        typeof task.id === "string" &&
        task.id.length > 0 &&
        task.id.length <= 100 &&
        !ids.has(task.id),
      "Invalid or duplicate task ID.",
    );
    ids.add(task.id);
    assert(
      nullableTime(task.scheduledAt) && nullableTime(task.dueAt),
      "Invalid task dates.",
    );
    assert(
      task.alert === null ||
        task.alert === "pending" ||
        task.alert === "acknowledged",
      "Invalid time-up state.",
    );
    assert(
      validNumber(task.durationMs, MAX_MINUTES * 60000) &&
        task.durationMs >= 60000 &&
        task.durationMs % 60000 === 0,
      "Invalid task duration.",
    );
    validateTaskInput({ ...task, minutes: task.durationMs / 60000 });
    assert(
      validNumber(task.elapsedMs) &&
        validNumber(task.focusMs) &&
        task.focusMs >= task.elapsedMs &&
        validNumber(task.createdAt),
      "Invalid task time.",
    );
    assert(
      nullableTime(task.completedAt) &&
        nullableTime(task.deletedAt) &&
        nullableTime(task.archivedAt),
      "Invalid task status.",
    );
    assert(
      task.archivedAt === null || task.completedAt !== null,
      "Only completed tasks can be archived.",
    );
  }
  assert(
    record(value.timer) && nullableTime(value.timer.startedAt),
    "Invalid timer.",
  );
  const state = value as unknown as FocusState;
  assert(
    Array.isArray(value.routines) && value.routines.length <= 100,
    "Invalid routines.",
  );
  const routineIds = new Set<string>();
  for (const routine of value.routines) {
    assert(
      record(routine) &&
        typeof routine.id === "string" &&
        routine.id.length > 0 &&
        routine.id.length <= 100 &&
        !routineIds.has(routine.id) &&
        typeof routine.title === "string" &&
        routine.title.trim().length > 0 &&
        routine.title.trim().length <= 80 &&
        typeof routine.emoji === "string" &&
        routine.emoji.length <= 16 &&
        validNumber(routine.createdAt) &&
        Array.isArray(routine.tasks) &&
        routine.tasks.length >= 1 &&
        routine.tasks.length <= 20,
      "Invalid routine template.",
    );
    routine.tasks.forEach(validateTaskInput);
    routineIds.add(routine.id);
  }
  assert(validNumber(value.historySince), "Invalid history start.");
  assert(
    Array.isArray(value.sessions) && value.sessions.length <= 100000,
    "Invalid focus history.",
  );
  for (const item of value.sessions) {
    assert(
      record(item) &&
        typeof item.taskId === "string" &&
        ids.has(item.taskId) &&
        typeof item.title === "string" &&
        item.title.length <= 200 &&
        validNumber(item.start) &&
        validNumber(item.end) &&
        item.end > item.start,
      "Invalid focus session.",
    );
  }
  assert(
    Array.isArray(value.plans) && value.plans.length <= 100000,
    "Invalid planned blocks.",
  );
  const planIds = new Set<string>();
  const activePlans = new Set<string>();
  for (const item of value.plans) {
    assert(
      record(item) &&
        typeof item.id === "string" &&
        item.id.length > 0 &&
        item.id.length <= 100 &&
        !planIds.has(item.id) &&
        typeof item.taskId === "string" &&
        ids.has(item.taskId) &&
        typeof item.title === "string" &&
        item.title.length <= 200 &&
        nullableTime(item.movedAt),
      "Invalid planned block.",
    );
    validateTaskInput({
      title: item.title,
      minutes: 1,
      emoji: "",
      color: TASK_COLORS[0],
      plan: item,
    });
    planIds.add(item.id);
    if (item.movedAt === null) {
      assert(!activePlans.has(item.taskId), "Duplicate active plan.");
      activePlans.add(item.taskId);
    }
  }
  validateDesktop(value.desktop);
  assert(
    value.timer.taskId === null ||
      (typeof value.timer.taskId === "string" && !!getCurrent(state)),
    "The active task is missing.",
  );
  assert(
    value.timer.startedAt === null || value.timer.taskId !== null,
    "A running timer needs a task.",
  );
  assert(record(value.settings), "Invalid settings.");
  const settings = value.settings;
  validateSettings(settings);
  assert(
    Object.keys(createState(0).settings).every((key) => key in settings),
    "Settings are incomplete.",
  );
  return structuredClone(state);
}

export function validateDesktop(value: unknown): DesktopState {
  assert(
    record(value) && typeof value.dockOpen === "boolean",
    "Invalid desktop state.",
  );
  for (const key of ["main", "dock"]) {
    const placement = value[key];
    if (placement === null) continue;
    assert(
      record(placement) &&
        typeof placement.maximized === "boolean" &&
        typeof placement.displayId === "number" &&
        Number.isSafeInteger(placement.displayId),
      "Invalid display placement.",
    );
    for (const dimension of ["x", "y", "width", "height"]) {
      const number = placement[dimension];
      assert(
        typeof number === "number" &&
          Number.isInteger(number) &&
          Math.abs(number) <= 100000 &&
          (!(dimension === "width" || dimension === "height") || number > 0),
        "Invalid window bounds.",
      );
    }
  }
  return structuredClone(value) as unknown as DesktopState;
}

/** Account for real elapsed time before any transition. Intervals only trigger rendering/checkpoints. */
export function checkpoint(state: FocusState, now: number): FocusState {
  const next = structuredClone(state);
  const task = getCurrent(next);
  if (next.timer.startedAt !== null && task) {
    const delta = runningDelta(next, now);
    if (delta > 0) {
      const last = next.sessions.at(-1);
      if (
        last &&
        last.taskId === task.id &&
        last.end === next.timer.startedAt &&
        last.title === task.title
      )
        last.end = next.timer.startedAt + delta;
      else {
        next.sessions.push({
          taskId: task.id,
          title: task.title,
          start: next.timer.startedAt,
          end: next.timer.startedAt + delta,
        });
      }
    }
    task.elapsedMs += delta;
    task.focusMs += delta;
    next.timer.startedAt = Math.max(next.timer.startedAt, now);
    if (task.alert !== "acknowledged" && task.elapsedMs >= task.durationMs)
      next.timer.startedAt = null;
  }
  next.savedAt = now;
  return next;
}

/** Restore the last durable checkpoint paused. Never count downtime as focus. */
export function recoverState(state: FocusState): FocusState {
  return {
    ...structuredClone(state),
    timer: { ...state.timer, startedAt: null },
  };
}

export function applyCommand(
  state: FocusState,
  input: unknown,
  now: number,
  makeId: () => string,
): FocusState {
  assert(record(input) && typeof input.type === "string", "Invalid action.");
  const command = input as unknown as Command;
  const next = checkpoint(state, now);
  const findTask = (id: unknown): Task => {
    assert(typeof id === "string", "Choose a task.");
    const task = next.tasks.find((item) => item.id === id);
    assert(task, "This task is no longer available.");
    return task;
  };
  const pendingTask = (id: unknown): Task => {
    const task = findTask(id);
    assert(isPending(task), "Choose an unfinished task.");
    return task;
  };
  const chooseNext = () => {
    next.timer = {
      taskId: next.tasks.find(isPending)?.id ?? null,
      startedAt: null,
    };
  };
  const addTask = (inputTask: unknown) => {
    const values = validateTaskInput(inputTask);
    assert(next.tasks.length < 10000, "This list has reached its task limit.");
    const task: Task = {
      id: makeId(),
      title: values.title,
      emoji: values.emoji,
      color: values.color,
      durationMs: values.minutes * 60000,
      elapsedMs: 0,
      focusMs: 0,
      createdAt: now,
      completedAt: null,
      deletedAt: null,
      archivedAt: null,
      alert: null,
      scheduledAt: values.scheduledAt ?? values.plan?.start ?? null,
      dueAt: values.dueAt ?? null,
    };
    next.tasks.push(task);
    updatePlan(task, values);
    if (!getCurrent(next)) chooseNext();
  };

  const updatePlan = (task: Task, values: TaskInput) => {
    if (values.plan === undefined) return;
    const existing = next.plans.find(
      (plan) => plan.taskId === task.id && plan.movedAt === null,
    );
    if (
      existing &&
      values.plan?.start === existing.start &&
      values.plan.end === existing.end
    ) {
      existing.title = task.title;
      return;
    }
    if (existing) existing.movedAt = now;
    if (values.plan) {
      assert(next.plans.length < 100000, "Planned block history is full.");
      next.plans.push({
        id: makeId(),
        taskId: task.id,
        title: task.title,
        ...values.plan,
        movedAt: null,
      });
    }
  };

  switch (command.type) {
    case "routine.add": {
      const routine = command.routine as unknown;
      assert(record(routine), "Enter a routine name and tasks.");
      assert(next.routines.length < 100, "The routine library is full.");
      assert(
        typeof routine.title === "string" &&
          routine.title.trim().length > 0 &&
          routine.title.trim().length <= 80 &&
          typeof routine.emoji === "string" &&
          routine.emoji.length <= 16 &&
          Array.isArray(routine.tasks) &&
          routine.tasks.length >= 1 &&
          routine.tasks.length <= 20,
        "Give your routine a name and 1–20 tasks.",
      );
      const saved: RoutineTemplate = {
        id: makeId(),
        title: routine.title.trim(),
        emoji: routine.emoji.trim(),
        tasks: routine.tasks.map(validateTaskInput),
        createdAt: now,
      };
      next.routines.push(saved);
      break;
    }
    case "routine.use": {
      const routine = next.routines.find((item) => item.id === command.id);
      assert(routine, "This routine is no longer available.");
      assert(
        next.tasks.length + routine.tasks.length <= 10000,
        "This list has reached its task limit.",
      );
      routine.tasks.forEach(addTask);
      break;
    }
    case "routine.remove": {
      const index = next.routines.findIndex((item) => item.id === command.id);
      assert(index >= 0, "This routine is no longer available.");
      next.routines.splice(index, 1);
      break;
    }
    case "task.add":
      addTask(command.task);
      break;
    case "task.addMany":
      assert(
        Array.isArray(command.tasks) &&
          command.tasks.length > 0 &&
          command.tasks.length <= 100,
        "Add between 1 and 100 tasks at once.",
      );
      command.tasks.forEach(addTask);
      break;
    case "task.edit": {
      const task = pendingTask(command.id);
      const values = validateTaskInput(command.task);
      Object.assign(task, {
        title: values.title,
        emoji: values.emoji,
        color: values.color,
        durationMs: values.minutes * 60000,
      });
      updatePlan(task, values);
      if (values.scheduledAt !== undefined)
        task.scheduledAt = values.scheduledAt;
      else if (values.plan !== undefined)
        task.scheduledAt = values.plan?.start ?? null;
      if (values.dueAt !== undefined) task.dueAt = values.dueAt;
      if (task.elapsedMs < task.durationMs) task.alert = null;
      break;
    }
    case "task.select": {
      const task = pendingTask(command.id);
      if (task.id !== next.timer.taskId)
        next.timer = { taskId: task.id, startedAt: null };
      break;
    }
    case "task.complete": {
      const task = findTask(command.id);
      assert(
        task.deletedAt === null && task.archivedAt === null,
        "This task is no longer available.",
      );
      if (task.completedAt === null) task.completedAt = now;
      if (next.timer.taskId === task.id) chooseNext();
      break;
    }
    case "task.reopen": {
      const task = findTask(command.id);
      assert(task.deletedAt === null, "Restore this task first.");
      task.completedAt = null;
      task.archivedAt = null;
      if (!getCurrent(next)) chooseNext();
      break;
    }
    case "task.remove": {
      const task = findTask(command.id);
      task.deletedAt ??= now;
      if (next.timer.taskId === task.id) chooseNext();
      break;
    }
    case "task.restore": {
      findTask(command.id).deletedAt = null;
      if (!getCurrent(next)) chooseNext();
      break;
    }
    case "task.move": {
      const task = pendingTask(command.id);
      assert(
        command.beforeId === null || typeof command.beforeId === "string",
        "Invalid task position.",
      );
      if (command.beforeId === task.id) break;
      if (command.beforeId !== null) pendingTask(command.beforeId);
      next.tasks = next.tasks.filter((item) => item.id !== task.id);
      const index =
        command.beforeId === null
          ? next.tasks.length
          : next.tasks.findIndex((item) => item.id === command.beforeId);
      next.tasks.splice(index, 0, task);
      break;
    }
    case "task.archiveCompleted":
      next.tasks.forEach((task) => {
        if (task.completedAt !== null && task.deletedAt === null)
          task.archivedAt ??= now;
      });
      break;
    case "task.unarchive":
      assert(
        Array.isArray(command.ids) && command.ids.length <= 10000,
        "Invalid task selection.",
      );
      command.ids.forEach((id) => {
        findTask(id).archivedAt = null;
      });
      break;
    case "timer.start": {
      const task = getCurrent(next);
      assert(task, "Add or select a task first.");
      assert(
        task.elapsedMs < task.durationMs || task.alert === "acknowledged",
        "This countdown is finished. Add time, reset it, or choose overtime.",
      );
      next.timer.startedAt ??= now;
      break;
    }
    case "timer.pause":
      next.timer.startedAt = null;
      break;
    case "timer.reset": {
      const task = getCurrent(next);
      assert(task, "Choose a task first.");
      task.elapsedMs = 0;
      task.alert = null;
      next.timer.startedAt = null;
      break;
    }
    case "timer.adjust": {
      const task = getCurrent(next);
      assert(task, "Choose a task first.");
      assert(
        command.minutes === 5 || command.minutes === -5,
        "Adjust the timer by five minutes.",
      );
      task.durationMs = Math.max(
        60000,
        Math.min(
          MAX_MINUTES * 60000,
          task.durationMs + command.minutes * 60000,
        ),
      );
      if (task.elapsedMs < task.durationMs) task.alert = null;
      break;
    }
    case "timer.expire": {
      const task = getCurrent(next);
      assert(
        task && task.elapsedMs >= task.durationMs,
        "The countdown has not ended.",
      );
      if (task.alert === null) task.alert = "pending";
      break;
    }
    case "timer.acknowledge": {
      const task = getCurrent(next);
      assert(
        task && task.elapsedMs >= task.durationMs,
        "The countdown has not ended.",
      );
      task.alert = "acknowledged";
      next.timer.startedAt ??= now;
      break;
    }
    case "settings.update":
      Object.assign(next.settings, validateSettings(command.settings));
      if (command.settings.dockStyle !== undefined)
        next.settings.dockExpanded = command.settings.dockStyle === "expanded";
      break;
    default:
      throw new Error("Unknown action.");
  }
  next.revision += 1;
  return next;
}
