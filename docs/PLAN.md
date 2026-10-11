# Cozy Focus implementation plan

## Reference review — 9 October 2026
Reviewed https://llamalife.co/ and https://llamalife.co/features/ in a desktop browser, including the public product screenshots. Useful patterns: a narrow task column, a quiet visual timer, time estimates, a projected list finish, optional colors/emoji, and explicit overtime. Keep Cozy Focus's existing visual direction and make the hierarchy easier to scan.

The supplied dock, circular slider, and text effect examples inform component boundaries, explicit props, pointer cleanup, keyboard interaction, and reduced motion. They are not pasted into this app; animated decorative text and a launcher dock do not help this task flow.

## Delivery
1. Define a typed task/timer model and pure command reducer; validate data at the process boundary.
2. Add a local file repository with serialized atomic saves, backup recovery, and visible failure states.
3. Add a secure Electron main process and preload bridge. The main window and mini timer subscribe to the same state.
4. Refine the current UI: task entry/editing, reordering, completion/undo, elapsed time, accurate totals, calm empty states, optional presets and appearance controls.
5. Add a draggable compact/expanded dock, always-on-top controls, native minimize/maximize/close controls, and bounds recovery for disconnected screens.
6. Verify domain logic, storage failure paths, native windows and IPC, production loading, persistence across relaunch, and visible UI behavior.

## Timer contract
- One active task; selecting another task pauses the first without losing progress.
- Countdown = task time budget minus elapsed focus time. Each task retains its own time.
- Start/pause are idempotent. Overtime counts upward and never marks work done automatically.
- Adding/subtracting five minutes changes the budget without erasing focused time.
- Reset restarts a task's countdown but preserves its total focused-time history.
- Complete pauses the active task and selects the next pending task without starting it.
- Sleep/exit pause. A crash restores the last checkpoint paused; closed time is never billed as focus time.
- There is no destructive midnight reset. Unfinished work stays until the user completes or deletes it.

## Boundaries
No network backend, login, sync, subscriptions, AI, notes, onboarding, or copied Llama Life assets. Browser preview is only a development convenience; desktop window features belong to Electron. Signing and installer distribution can follow after this development build is tested.

## References
- https://llamalife.co/features/
- https://www.electronjs.org/docs/latest/api/browser-window/
- https://www.electronjs.org/docs/latest/tutorial/context-isolation
- https://www.electronjs.org/docs/latest/tutorial/security/
