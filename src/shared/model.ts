export const TASK_COLORS = [
  "#fffefa",
  "#f9eed7",
  "#f7e4dd",
  "#ece5f1",
  "#e6eee3",
  "#e2edf0",
] as const;
export const ACCENTS = [
  "#db8070",
  "#a48bb7",
  "#c5a15d",
  "#7c9b7a",
  "#7b9eaf",
] as const;
export const MAX_MINUTES = 1440;

export interface Task {
  id: string;
  title: string;
  emoji: string;
  color: string;
  durationMs: number;
  elapsedMs: number;
  focusMs: number;
  createdAt: number;
  completedAt: number | null;
  deletedAt: number | null;
  archivedAt: number | null;
  alert: "pending" | "acknowledged" | null;
  scheduledAt: number | null;
  dueAt: number | null;
}

export interface FocusSession {
  taskId: string;
  title: string;
  start: number;
  end: number;
}

export interface PlannedBlock {
  id: string;
  taskId: string;
  title: string;
  start: number;
  end: number;
  movedAt: number | null;
}

export interface RoutineTemplate {
  id: string;
  title: string;
  emoji: string;
  tasks: TaskInput[];
  createdAt: number;
}

export interface WindowPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  displayId: number;
  maximized: boolean;
}

export interface DesktopState {
  main: WindowPlacement | null;
  dock: WindowPlacement | null;
  dockOpen: boolean;
}

export interface Settings {
  accent: string;
  primaryColor: string;
  completionSound: boolean;
  timerStyle: "pie" | "digital";
  mainOnTop: boolean;
  dockOnTop: boolean;
  dockExpanded: boolean;
  showCompleted: boolean;
  celebrate: boolean;
  sound: boolean;
  dockStyle: DockStyle;
  notifications: boolean;
}

export interface FocusState {
  version: 5;
  revision: number;
  savedAt: number;
  tasks: Task[];
  timer: { taskId: string | null; startedAt: number | null };
  settings: Settings;
  sessions: FocusSession[];
  plans: PlannedBlock[];
  routines: RoutineTemplate[];
  historySince: number;
  desktop: DesktopState;
}

export interface TaskInput {
  title: string;
  minutes: number;
  emoji: string;
  color: string;
  plan?: { start: number; end: number } | null;
  scheduledAt?: number | null;
  dueAt?: number | null;
}

export type Command =
  | { type: "task.add"; task: TaskInput }
  | { type: "task.addMany"; tasks: TaskInput[] }
  | {
      type: "routine.add";
      routine: Pick<RoutineTemplate, "title" | "emoji" | "tasks">;
    }
  | { type: "routine.use" | "routine.remove"; id: string }
  | { type: "task.edit"; id: string; task: TaskInput }
  | {
      type:
        | "task.select"
        | "task.complete"
        | "task.reopen"
        | "task.remove"
        | "task.restore";
      id: string;
    }
  | { type: "task.move"; id: string; beforeId: string | null }
  | { type: "task.archiveCompleted" }
  | { type: "task.unarchive"; ids: string[] }
  | {
      type:
        | "timer.start"
        | "timer.pause"
        | "timer.reset"
        | "timer.expire"
        | "timer.acknowledge";
    }
  | { type: "timer.adjust"; minutes: number }
  | { type: "settings.update"; settings: Partial<Settings> };

export interface Snapshot {
  state: FocusState;
  now: number;
  storageError: string | null;
  recoveryMessage: string | null;
}

export type CommandResult = { ok: true } | { ok: false; error: string };
export type WindowAction =
  "minimize" | "maximize" | "close" | "showMain" | "showDock" | "hideDock";
export interface FocusBridge {
  getSnapshot(): Promise<Snapshot>;
  dispatch(command: Command): Promise<CommandResult>;
  subscribe(listener: (snapshot: Snapshot) => void): () => void;
  window(action: WindowAction): Promise<void>;
  exportBackup(): Promise<CommandResult>;
  resetAll(): Promise<CommandResult>;
}

export function createState(now: number): FocusState {
  return {
    version: 5,
    revision: 0,
    savedAt: now,
    tasks: [],
    sessions: [],
    plans: [],
    routines: [],
    historySince: now,
    desktop: { main: null, dock: null, dockOpen: false },
    timer: { taskId: null, startedAt: null },
    settings: {
      accent: ACCENTS[0],
      primaryColor: "#687e60",
      completionSound: true,
      timerStyle: "pie",
      mainOnTop: false,
      dockOnTop: true,
      dockExpanded: true,
      showCompleted: true,
      celebrate: true,
      sound: false,
      dockStyle: "expanded",
      notifications: true,
    },
  };
}

export const isPending = (task: Task) =>
  task.completedAt === null &&
  task.deletedAt === null &&
  task.archivedAt === null;
export const isCompleted = (task: Task) =>
  task.completedAt !== null &&
  task.deletedAt === null &&
  task.archivedAt === null;
export const getCurrent = (state: FocusState) =>
  state.tasks.find((task) => task.id === state.timer.taskId && isPending(task));

export function runningDelta(state: FocusState, now: number): number {
  if (state.timer.startedAt === null) return 0;
  const delta = Math.max(0, now - state.timer.startedAt);
  const task = getCurrent(state);
  return task && task.alert !== "acknowledged"
    ? Math.min(delta, Math.max(0, task.durationMs - task.elapsedMs))
    : delta;
}

export function elapsedFor(state: FocusState, task: Task, now: number): number {
  return (
    task.elapsedMs +
    (state.timer.taskId === task.id ? runningDelta(state, now) : 0)
  );
}

export function focusFor(state: FocusState, task: Task, now: number): number {
  return (
    task.focusMs +
    (state.timer.taskId === task.id ? runningDelta(state, now) : 0)
  );
}

export function remainingFor(
  state: FocusState,
  task: Task,
  now: number,
): number {
  const remaining = task.durationMs - elapsedFor(state, task, now);
  return task.alert === "acknowledged" ? remaining : Math.max(0, remaining);
}

export type DockStyle =
  "digital" | "pie" | "expanded" | "orbit" | "flip" | "ribbon";
export const DOCK_LAYOUTS: {
  id: DockStyle;
  name: string;
  description: string;
  width: number;
  height: number;
}[] = [
  {
    id: "digital",
    name: "Pocket",
    description: "A quiet, compact readout",
    width: 332,
    height: 72,
  },
  {
    id: "pie",
    name: "Slice",
    description: "A small visual countdown",
    width: 332,
    height: 72,
  },
  {
    id: "expanded",
    name: "Task card",
    description: "Your task and controls together",
    width: 332,
    height: 182,
  },
  {
    id: "orbit",
    name: "Orbit",
    description: "A round dial with time at its heart",
    width: 244,
    height: 286,
  },
  {
    id: "flip",
    name: "Desk clock",
    description: "Big split-flap digits on sage paper",
    width: 320,
    height: 222,
  },
  {
    id: "ribbon",
    name: "Ribbon",
    description: "A slim progress strip for your screen edge",
    width: 460,
    height: 88,
  },
];
export function dockLayout(style: DockStyle, expanded = style === "expanded") {
  const layout = DOCK_LAYOUTS.find((item) => item.id === style)!;
  return ["digital", "pie", "expanded"].includes(style)
    ? { ...layout, height: expanded ? 182 : 72 }
    : layout;
}

export function listRemaining(state: FocusState, now: number): number {
  return state.tasks
    .filter(isPending)
    .reduce(
      (sum, task) => sum + Math.max(0, remainingFor(state, task, now)),
      0,
    );
}

export function formatTime(milliseconds: number): string {
  const seconds = Math.ceil(Math.abs(milliseconds) / 1000);
  return `${milliseconds < 0 ? "+" : ""}${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function formatMinutes(milliseconds: number): string {
  const minutes = Math.ceil(Math.max(0, milliseconds) / 60000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
    : `${minutes} min`;
}
