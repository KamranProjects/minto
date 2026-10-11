# Minto developer guide

This is the implementation guide for the current application, not a feature proposal. Start with the [README](../README.md) for the user-facing product and commands. Read [AGENTS.md](../AGENTS.md) before changing behavior; it records the offline product boundary and required verification. [CHANGES.md](../CHANGES.md) and [PLAN.md](PLAN.md) contain earlier decisions and research, but code and tests define the current contract.

## Product and execution model

Minto is a narrow, vertical Electron desktop application. The main window may maximize; a separate compact dock can float above other programs. The core loop is **add a task → choose time → focus → decide at time-up → complete**. Planning and analytics stay local. There is no server, account, network API, database service, or automatic planned-task scheduler.

Electron's **main process owns the durable state and all timer transitions**. Both React renderers display snapshots and submit commands over a limited preload bridge. They do not read or write the task file. The browser-only preview is a separate localStorage adapter for visual work; it is not a desktop backend or a shared profile.

```text
Main window React ─┐
                   ├─ window.cozy (preload) ─ IPC ─ FocusService ─ FileRepository
Mini timer React ──┘                                  │               │
                                                      │               └─ focus.json / .bak
                                                      └─ validated engine transitions
```

A command is not acknowledged as successful until its new state is saved. `FocusService` serializes commands from both windows in one promise queue, broadcasts snapshots after successful commits, and reports storage errors without claiming an unsaved change succeeded. The main process also owns native windows, notifications, the system beep, lifecycle pauses, and window placement.

## Start, build, and verify

Use Node.js 22.16+ and npm. `npm ci` installs build tools and Electron; do not prune dev dependencies before compilation.

| Command                                   | Purpose                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`                             | Compile Electron, start/reuse Vite at `127.0.0.1:5173`, launch the desktop app. |
| `npm run dev:web`                         | Browser-only design preview with its own localStorage data.                     |
| `npm run typecheck`                       | Check renderer and Electron TypeScript projects.                                |
| `npm test`                                | Run pure engine, analytics, and repository/service tests.                       |
| `npm run build`                           | Type-check and compile `dist/` and `dist-electron/`.                            |
| `npm start`                               | Run the compiled app from the project using Electron and `.cozy-dev/`.          |
| `npm run test:electron`                   | Build and run the native two-window smoke test with an isolated profile.        |
| `npm run package:win`                     | Build unsigned Windows installer and portable executables in `release/`.                    |
| `npm run format` / `npm run format:check` | Apply/check Prettier formatting for code and configuration.                     |

`scripts/dev.mjs` compiles the main process, copies the CommonJS preload, starts Vite, and spawns Electron. It may reuse port 5173 only when the existing server identifies itself as Minto. A Vite URL alone does not mean the Electron app started; check the Electron process and window. Stop the command with Ctrl+C and restart after changing `electron/` or `src/shared/`. `scripts/copy-preload.mjs` places `electron/preload.cjs` beside the compiled main files.

The smoke test uses a fresh folder under `.test-output/` via `COZY_DATA_DIR`; it does not touch `.cozy-dev/` or a packaged user's profile. It writes screenshots at normal, short, and maximized sizes. Inspect those images after changing layout. Run type checking, tests, a production build, and the Electron smoke test for meaningful logic changes.

## Code map

| File or folder                                   | Responsibility                                                                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/model.ts`                            | Current v5 state types, command types, defaults, timer selectors, dock layouts, and time formatting.                                                                          |
| `src/shared/engine.ts`                           | Input and saved-file validation, v1–v4 migrations, timestamp checkpointing, recovery pause, and all task/timer/routine/settings transitions. No Electron or React dependency. |
| `src/shared/analytics.ts`                        | Pure daily review of sessions, plans, deadlines, overlap, and local calendar boundaries.                                                                                      |
| `src/shared/theme.ts`                            | Primary/secondary CSS variables and readable foreground color selection.                                                                                                      |
| `electron/main.ts`                               | Boot, profile path, single-instance lock, IPC authorization, native alerts, suspend/quit handling, and periodic time-up/checkpoint checks.                                    |
| `electron/service.ts`                            | Serial command queue, durable commits, shared snapshots, time-up claim, desktop placement, reset, and lifecycle pause.                                                        |
| `electron/repository.ts`                         | JSON validation, atomic save, backup recovery, and full-data reset.                                                                                                           |
| `electron/windows.ts`                            | Main/dock creation, on-top settings, remembered bounds, display recovery, and window close behavior.                                                                          |
| `electron/preload.cjs`                           | The narrow `window.cozy` API exposed to isolated renderers.                                                                                                                   |
| `src/state/FocusContext.tsx`                     | Renderer snapshot subscription, revision ordering, display clock, command wrappers, and user notices.                                                                         |
| `src/state/browserBridge.ts`                     | LocalStorage-only implementation of the same bridge for the browser preview.                                                                                                  |
| `src/App.tsx`                                    | Main workspace navigation, list presentation, shortcuts, completion feedback, and ambient sound control.                                                                      |
| `src/components/Titlebar.tsx`                    | Native title bar controls and mini timer entry point.                                                                                                                         |
| `src/components/Timer.tsx`, `TimeUp.tsx`         | Countdown display and explicit time-up decision UI.                                                                                                                           |
| `src/components/TaskForm.tsx`, `TaskCard.tsx`    | Task creation/editing, scheduling fields, task controls, and reordering.                                                                                                      |
| `src/components/Dock.tsx`, `DockFace.tsx`        | Separate mini timer renderer and its six visual layouts.                                                                                                                      |
| `src/components/MenuDock.tsx`                    | Bottom navigation component.                                                                                                                                                  |
| `src/components/Presets.tsx`                     | Built-in starter routines and user-created reusable routine templates.                                                                                                        |
| `src/components/Analytics.tsx`                   | Daily analytics interface over the pure `dailyReview` result.                                                                                                                 |
| `src/components/Settings.tsx`                    | Timer/theme/dock preferences, backup export, and confirmed data reset.                                                                                                        |
| `src/hooks/useAudio.ts`                          | Renderer-generated ambient sound and preview chime with cleanup.                                                                                                              |
| `src/styles.css`, `index.html`, `vite.config.ts` | Styling, document/CSP, and local Vite configuration.                                                                                                                          |
| `tests/*.test.ts`, `tests/electron-smoke.cjs`    | Deterministic domain/storage tests and native integration/UI checks.                                                                                                          |

`src/main.tsx` mounts the app. `src/env.d.ts` types the injected bridge. `tsconfig.json` covers the renderer and `tsconfig.electron.json` emits the main/shared modules. `public/minto-icon.png`, `public/minto-logo.png`, and `build/icon.ico` supply branding; `favicon.svg` is an older file and is not part of the packaged `dist/` file list.

## State and data contract

`FocusState` in `src/shared/model.ts` is the single saved document. Its current `version` is **5**. Update `validateState`, migration logic, and tests whenever the schema changes. Do not silently accept unknown or malformed fields from IPC or disk.

| Field                            | Meaning                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `version`, `revision`, `savedAt` | Schema version, monotonic change counter, and last checkpoint time.                                           |
| `tasks`                          | Task order and lifecycle, planned/due timestamps, countdown and cumulative focus totals.                      |
| `timer`                          | Selected task ID and running timestamp (`startedAt`), or `null` when paused.                                  |
| `sessions`                       | Actual focus intervals with task ID and title at recording time; retained when tasks are removed or archived. |
| `plans`                          | Start/end blocks, including earlier blocks marked `movedAt` when a plan changes.                              |
| `routines`                       | User-created templates; using one creates new task IDs and fresh progress.                                    |
| `settings`                       | Theme colors, timer/dock styles, feedback, notifications, and on-top preferences.                             |
| `historySince`                   | Earliest trustworthy session-history timestamp after migration.                                               |
| `desktop`                        | Main/dock bounds, display IDs, maximize state, and whether the dock was open.                                 |

Each task has `durationMs`, `elapsedMs`, and `focusMs`. `elapsedMs` is progress against its current countdown and can reset; `focusMs` is cumulative work and survives countdown reset. `completedAt`, `deletedAt`, and `archivedAt` are separate lifecycle markers. `alert` is `null`, `pending`, or `acknowledged`: it prevents duplicate time-up side effects and records an explicit overtime decision. `scheduledAt` and `dueAt` are independent; a planned block has its own start/end in `plans`.

The command union in `model.ts` includes task add/addMany/edit/select/complete/reopen/remove/restore/move/archive/unarchive; routine add/use/remove; timer start/pause/reset/adjust/expire/acknowledge; and settings update. `applyCommand` validates the payload, checkpoints any running time first, applies one transition to a clone, and increments `revision`. File validation also checks cross-references and bounded sizes. Current task duration is 1–1,440 whole minutes; the list and routine library also have explicit size limits in the engine.

`createState` sets the default pie timer, sage primary (`#687e60`) and coral secondary (`#db8070`), the expanded Task card dock, dock always-on-top, enabled notifications and completion sound, and a disabled time-up sound. The main window is not always-on-top by default. Settings changes are partial validated commands; the primary/secondary pickers and palette buttons update CSS variables through `theme.ts` in both renderers.

Migration is sequential: v1 gains sessions/plans/desktop state and a reliable `historySince`; v2 gains independent scheduled/due fields and stops unchosen automatic overtime; v3 gains primary color and completion sound; v4 gains saved routines. All paths finish at v5 and then pass the full validator. Migration never fabricates old daily sessions from lifetime focus totals. A newer unsupported save is rejected rather than downgraded.

### Timer rules

- Never advance a timer by counting interval callbacks. `startedAt` is a timestamp; `runningDelta` derives elapsed time from `now - startedAt`, clamps rollback to zero, and caps ordinary countdown time at the remaining duration.
- `checkpoint` adds the derived delta to the task and session history before a transition. Adjacent compatible session slices are merged.
- Selecting a different task pauses the timer and preserves the old task's progress. Selecting the same task leaves it alone. Completing the active task selects the next unfinished task, paused.
- At zero, the timer pauses but the task stays unfinished. `checkTimeUp` durably changes its alert to `pending` before showing the main window, beeping, or displaying a notification. `timer.acknowledge` alone permits overtime; waiting at the decision screen records no extra focus.
- Resetting a countdown sets `elapsedMs` to zero and pauses, but retains `focusMs` and session history. A five-minute adjustment is clamped to supported bounds.
- Sleep, normal quit, and reopen pause the timer. Running work is checkpointed every five seconds, so a crash may lose at most roughly one checkpoint interval since the last successful save; downtime is not charged on recovery.

The main process constructs its wall-clock `now` from a `Date.now()` epoch plus `performance.now()` elapsed time. The renderer receives a snapshot timestamp and advances only its display clock locally (each second while running, less often while paused). Neither renderer makes authoritative timer decisions.

### Planning and analytics

A task can have a planned start, a planned work block, and a due date without any of them starting the timer. Editing a block marks the previous one moved and creates a new block; overlapping blocks are allowed and called out in Analytics. `dailyReview` clips sessions and plans to local day boundaries, including daylight-saving days, and compares actual focus inside each planned block. It also reports per-task focus, starts/deadlines, completion timing, and the day's session timeline. The separate `historySince` field matters because old save versions did not have enough information to reconstruct earlier daily sessions.

## Persistence, recovery, and reset

Profile selection in `electron/main.ts` is, in order: `COZY_DATA_DIR` if set, `.cozy-dev/` for an unpackaged project run, and Electron's app-data `Cozy Focus` folder for the packaged app. The packaged path deliberately preserves prior user data despite the visible Minto name. On Windows this is normally `%APPDATA%\Cozy Focus`.

`FileRepository.load` validates `focus.json` and pauses a recovered running timer. If the primary is invalid, it attempts `focus.json.bak` and copies the damaged primary to `focus.json.damaged-<timestamp>`. If both are invalid, startup fails without overwriting them. Files over 20 MiB are rejected. `save` serializes a validated state, writes and flushes `.tmp` files, then renames them into place. It stores the last known good state in `.bak`; a failed save is shown to the user and does not update the service's committed state.

Export uses a native save dialog and writes a paused JSON snapshot outside the profile. There is no in-app import command: restoring an export is a manual, app-closed file replacement after keeping a copy of the existing files. Settings reset requires typing `RESET`. `FocusService.resetAll` serializes the operation, creates default state with a higher revision, and broadcasts only after `FileRepository.reset` replaces both primary and backup with fresh data. The repository removes matching damaged recovery remnants. A failed reset reports an error and retains the in-memory list; inspect disk errors before retrying. Never test reset against a real user profile.

## IPC and window security

`electron/preload.cjs` exposes only `getSnapshot`, `dispatch`, `subscribe`, `window`, `exportBackup`, and `resetAll`. The corresponding channels are `focus:get`, `focus:command`, `focus:state`, `focus:window`, `focus:export`, and `focus:reset`. Window actions are a fixed set: minimize, maximize, close, showMain, showDock, and hideDock. Renderer code must not import Node filesystem/path modules or access the repository directly.

Every IPC handler authorizes a live Minto window and its main frame. Navigation, new windows, webviews, and permission requests are blocked. Renderers run with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. `index.html` supplies a local-only content security policy. Development loading is limited to the known loopback Vite origin; packaged windows load the compiled local file. New capabilities should use a narrow, validated bridge method rather than a generic IPC or filesystem escape hatch.

The dock is a separate frameless `BrowserWindow`, not a web overlay. `windows.ts` sizes it according to the selected layout, keeps controls outside the drag region, optionally keeps it on top, remembers its screen/position, and fits restored bounds to a currently available display. Main and dock are updated from the same service snapshot. Closing the main while the dock is visible hides it; closing the dock shows the main. Dock style, expansion, and on-top preferences are shared state, not local component state.

## Renderer behavior and accessibility

`FocusProvider` subscribes once, rejects incompatible saved versions and stale snapshots, and cleans up its subscription and display timers. UI commands show a failure notice if the main process rejects a save. The main window has Focus, My day, Routines, Analytics, and Settings views. The dock renderer is chosen by `?dock=1`; it retains the selected visual layout when its details expand or collapse.

The UI uses native buttons and labels, named controls, visible focus behavior, reduced-motion CSS, and task Up/Down controls as alternatives to dragging. Completion feedback is brief and optional. Native Electron uses `shell.beep()` for configured completion/time-up sounds and a native notification for time-up; the browser preview uses Web Audio because it has no main process. Ambient brown noise is generated locally by `useAudio` only when requested and is cleaned up on unmount.

## Packaging and size

The configured release targets are unsigned **Windows installer and portable x64**. `electron-builder` uses the installed Electron distribution, embeds `build/icon.ico`, keeps `en-US.pak`, and packs the compiled `dist/`, `dist-electron/`, and package metadata into `app.asar`. ASAR groups files; the portable executable supplies compression. React, React DOM, icons, Vite, TypeScript, Electron, and the packager are dev dependencies because the renderer code is bundled and the packaged main process imports no external runtime npm module. Packaging excludes the locally supplied Flame font because no redistribution license was provided; the CSS has a system-font fallback. Never delete or production-prune `node_modules` before a build: that would remove the compiler and packager. `release/`, compiled output, test output, and the dev profile are ignored by Git.

Do not delete Chromium/Electron runtime binaries, license files, or rendering fallbacks merely to reduce file size. Validate any proposed removal by launching the packaged app and exercising both windows on a clean machine/profile. The Electron runtime remains the main size and memory floor.

## Tests and change checklist

`tests/engine.test.ts` covers task/timer transitions, rollover, invalid input, and save validation. `tests/changes.test.ts` covers migrations, analytics, planning, routines, colors, time-up decisions, and shared service behavior. `tests/storage.test.ts` covers actual JSON persistence, backup recovery, reset, write failure, checkpoints, and serialized commands. `tests/electron-smoke.cjs` launches native windows with a temporary profile and checks IPC, sandboxing, timers, sleep, the dock layouts, settings synchronization, analytics, routine and planning forms, reset confirmation, responsive sizes, screenshots, and offline loading.

When changing state or a command: update types, validation/migrations, the service/bridge if needed, tests, and both desktop surfaces. When changing a layout: inspect the default 438-pixel window, a short window, maximized view, and relevant dock sizes. When changing persistence: test invalid files, backup recovery, write failures, and restart behavior with disposable profiles. Keep new work inside the offline task-timer boundary in `AGENTS.md`.

For a new task action, define its typed payload in `Command`, validate and implement it in `applyCommand`, expose only the necessary UI control, and add a deterministic engine test plus an Electron test if cross-window behavior changes. For a new saved setting, add a default, validation, migration for older saves, and synchronization through `Windows.applySettings` if it changes native windows. For a new dock layout, add dimensions and metadata to `DOCK_LAYOUTS`, render it in `DockFace` or `Dock`, then verify saved selection, compact behavior where applicable, monitor bounds, and short-screen screenshots. Keep derived analytics in `dailyReview` rather than persisting duplicated totals.

## Troubleshooting

| Symptom                                          | What to check                                                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` prints a URL but no desktop window | Confirm the Electron process started; close a stale Electron instance, stop the dev command, and rerun it. `dev:web` is only a preview. |
| Port 5173 is occupied                            | The dev runner reuses only a Minto Vite page. Stop the other server or launch Minto's own dev command.                                  |
| Renderer says the backend needs an update        | Stop old Electron and restart `npm run dev` after main/shared changes.                                                                  |
| Saved list cannot load                           | Inspect `focus.json`, `.bak`, and any `.damaged-*` files in the correct profile. Keep copies before manual recovery.                    |
| Save or reset reports an error                   | Check disk space and profile folder permissions; do not assume an unacknowledged change persisted.                                      |
| Timer stops after sleep/restart                  | This is intentional; restart it explicitly. A crash may discard time since the last successful five-second checkpoint.                  |
| Portable build is missing Flame headings         | The font is excluded from distribution until its redistribution rights are supplied.                                                    |
| Windows warns about publisher                    | The Windows builds are unsigned.                                                                                                 |

The repository has no auto-update service or sync backend. The manually triggered macOS workflow runs tests and builds unsigned DMGs on a macOS runner; publish those only after its result and download are checked.
