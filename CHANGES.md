# Planned changes

This document records the agreed product direction for Cozy Focus. It is a
local-first desktop task timer: the work remains focused on choosing a task,
timing it, completing it, and understanding the day afterwards.
The proposed FlameBold font remains local until its redistribution rights are confirmed.
## Product principles

- Keep every feature offline and local to the computer.
- Prefer a small number of dependable interactions over a broad productivity
  suite.
- Treat the timer and Electron main process as the source of truth.
- Do not add accounts, subscriptions, AI features, cloud sync, notes, or
  calendar integrations.
- Use factual, supportive language. The app records planned and focused time;
  it does not judge a user for "wasting" time.

## Priority 1: dependable desktop timer

### Remember dock placement

- Save the dock position, selected dock template, and monitor identity.
- Restore the dock at the saved location on launch.
- If the saved monitor is unavailable, move the dock within the primary
  display's work area.
- Keep the dock draggable, compact, and independently always-on-top.

### Restore app state safely

- Save main-window size, position, and maximized state.
- Restore those bounds only when they are visible on a current display.
- On restart or crash recovery, restore the selected task and elapsed focus
  time but keep the timer paused. Closed time must never count as focus time.

### Timer-end decision

- At the end of a countdown, play one local sound and show one native local
  notification.
- Bring the dock or main window forward so the next decision is visible.
- Pause at 00:00 without completing the task. Overtime is an explicit choice; waiting at zero never counts as focused time.
- Offer **Mark done**, **Continue in overtime**, and **Add 5 minutes**.
- Remember that the time-up alert was handled so it never repeats after an app
  restart.

## Priority 2: dock templates and completion feedback


1. **Digital compact** — large time, start/pause, and task indicator.
2. **Pie compact** — visual remaining-time dial, start/pause, and task
   indicator.
3. **Expanded** — time, task name, the next action, and completion controls.
4. or might be something more good and other stlyer than that

Additional designs: **Orbit** (round dial), **Desk clock** (large split-flap digits), and **Ribbon** (a wide, slim progress strip). Settings shows previews and opens the selected design.

The selected layout is remembered. Completion feedback stays brief and can be
disabled; reduced-motion preferences always disable confetti and other motion.

## Priority 3: planning and analytics

Analytics are a core feature, but they must be accurate, private, and useful.
They will use locally stored planned blocks and actual timer sessions.

### Planned blocks

- A task may have an optional planned start and end time for the day.
- A task can still exist without a planned block.
- Planned start also works by itself. A separate optional due date/time is available, independent of the planned finish.
- Planning fields are visible in the task editor, with a Plan shortcut and date labels on every task card.
- Editing or moving a block must not alter recorded focus time.
- Overlapping blocks are allowed but should be clearly shown.

### Focus sessions

- Record each focused session with task ID, started time, paused/ended time,
  and focused duration.
- Do not count time while the app is closed, the computer sleeps, or the timer
  is paused.
- Preserve completed-task sessions so historical daily reviews remain correct.

### Daily analysis page

The first analysis screen should answer simple questions:

- What did I plan to work on today?
- Which planned blocks were completed, partly focused, missed, or moved?
- How much actual focused time did each task receive?
- When did I focus during the day?
- How much planned focus time remains?

Use neutral labels such as **Not started**, **Partly focused**, and **Moved**.
Do not introduce scores, streaks, rankings, AI summaries, or claims about
productivity or wasted time.

## Visual direction

- Retain the warm off-white paper surface with sage and coral accents.
- Improve contrast for small labels, task metadata, and inactive navigation.
- Keep the vertical desktop layout and calm visual hierarchy.
- Do not switch the whole app to pure white.
  font before changing the type system.

## Verification required for each phase

- Type check, domain/storage tests, production build, and Electron smoke test.
- Test timer-end notification behavior, overtime, restart recovery, and no
  duplicate alerts.
- Test dock restoration on valid and missing-monitor positions.
- Test planned blocks and session records across sleep, restart, task switches,
  and persistence failures.
- Use isolated test profiles so testing never overwrites a user's tasks.

## Implemented update

- Added a separate Analytics tab; existing Focus, My day, Routines, and Settings views remain available.
- Tasks now support optional local planned start/end windows. Moving a plan retains the previous block as Moved. Analytics shows overlapping plans, planned versus actual focus, completed-task deadline comparisons, and a dated session timeline.
- Focus history starts with this update. Existing lifetime totals remain intact; earlier daily sessions are not fabricated. History remains available for archived and removed tasks.
- Save format 2 migrates version 1 files automatically. The existing atomic write/backup path is retained, and invalid new fields are rejected.
- Main-window bounds/maximized state and dock position/display/open state are saved. Missing monitors fall back to visible bounds on the primary display.
- Settings offers Digital compact, Pie compact, and Expanded dock layouts. Existing expand/collapse and pin controls remain available.
- A countdown reaching zero is recorded durably before the one-time native alert. The main window presents Mark done, Continue in overtime, and Add 5 minutes. Pending/acknowledged alerts survive restarts. Time continues in overtime as before. Sound remains optional; existing sound preferences are preserved.
- Completion celebration works in the expanded dock too and respects the existing reduced-motion and celebration settings.
- Warm paper/sage/coral colors remain, with stronger contrast for metadata and navigation.
- The supplied FlameBold font is used locally for page headings. Its binary is ignored by Git because no redistribution license was supplied. Before distributing builds, supply the license or remove the font file and use the system-font fallback.
- The developer launcher no longer requests a hidden Windows process for the interactive Electron app and distinguishes process startup from a loaded/shown window.

### Verification notes

The regression suite covers existing task transitions plus schema migration, session checkpoints, midnight splitting, moved/overlapping plans, deadline comparisons, corrupt history, durable alert deduplication, save failures, and concurrent window/task writes. Native smoke tests use disposable profiles and exercise analytics, the actual planning form, three dock layouts, window recovery, missing-monitor fallback, and timer-end decisions. Screenshots are written to `.test-output/` for normal, short, and maximized layouts.

Windows may suppress native notifications or system sounds according to its settings. The native smoke suite suppresses those OS side effects while checking the timer-end UI and durable state; audible playback and the Windows notification toast still need a user desktop check.

## Follow-up UX corrections

The earlier red time-up panel and automatic count-up were confusing. The current behavior supersedes those earlier implementation notes:

| Requirement | Current behavior | Where to find it |
| --- | --- | --- |
| Countdown finish | Stops at 00:00; no waiting time recorded. Overtime requires a click. | Focus view, sage time-up card |
| Planned start | Optional start time, including a start without an end | Add/Edit task → Plan & deadline |
| Planned finish | Optional work-window end; creates an analytics block | Add/Edit task → Planned finish |
| Due date | Independent deadline, with past-due and completion comparison | Task cards and Analytics → Starts & deadlines |
| Distinct mini timers | Pocket, Slice, Task card, Orbit, Desk clock, Ribbon | Settings → On your desktop |
| Dock/window recovery | Position, monitor, selected layout, maximized state, and dock open state | Automatic |
| Local analytics | Daily focus, sessions, plans, starts/deadlines and moved blocks | Analytics |
| Completion feedback | Optional confetti, reduced-motion aware | Main window and dock |
| Native alert | One notification and optional local sound | Settings; Windows may suppress these |

Save format 3 migrates formats 1 and 2. Existing historical focus totals are preserved; unchosen automatic overtime from the previous version is returned to a finished countdown. Explicitly acknowledged overtime remains available.

The app does not yet have recurring Pomodoro work/break cycles or automatic task starts. These were not part of the original checklist: planned times describe intention and never silently start a timer.

### Follow-up verification status

- Type checking passes. All 50 domain and storage tests pass, including delayed countdown expiration, explicit overtime, independent dates, and migration of existing tasks.
- Browser preview inspected: all six layout choices and the planned start, planned finish, and due-date form are visible in the existing narrow layout.
- Production build and native Electron smoke suite now pass with disposable profiles. Inspected current screenshots of Orbit, Desk clock, Ribbon, and the normal, short, and maximized main window. The suite also clicks the actual expand/collapse controls and confirms Slice remains selected with correct native window heights.


### Menu and dock stability

- Adapted the supplied pointer-distance menu dock with sage circular icons, gentle magnification, persistent labels, fixed click targets, keyboard focus, and reduced-motion support.
- Expansion is now independent of selected dock style: Slice keeps its pie when showing task details and when collapsed again. Native bounds follow expansion without replacing the preference.
- Timer readouts use locally available Segoe UI Variable Display / Segoe UI bold with tabular numerals for a steady, readable countdown.
- A renderer/backend schema mismatch now gives a clear restart instruction instead of sending unsupported dock commands or displaying missing dates as Invalid Date. Restart the Electron process after backend changes; refreshing Vite alone cannot update a running main process. Task date labels also guard absent date values.

### Custom palette and task completion feedback

- Settings now has independent primary and secondary color pickers, four scenery-inspired palette presets, and a same-color option. Colors apply to controls, navigation, countdown accents, and mini timers while retaining the paper surfaces and individual task colors. Primary control text automatically chooses dark or light ink for contrast.
- Task completed sound is enabled by default and can be disabled separately from the time-up chime and celebration. Electron emits one system sound after a newly completed task is saved, including completions from the mini timer. Repeated completion commands and state broadcasts do not replay it.
- Save format 4 migrates older settings while preserving tasks and the existing secondary/timer color. Colors are validated as six-digit hex values.
- Verification: 51 domain/storage tests pass; type checking, production build, and native Electron smoke tests pass. Native tests exercise palette selection across windows and completion sound dispatch/deduplication with a stubbed system beep. Screenshots inspected at normal, short, and maximized sizes. Actual audible volume depends on Windows sound settings and was not verified through speakers.

## Minto branding and saved routines

- The app is now named Minto in the window, title bar, notifications, browser title, favicon, and local backup filename. The supplied icon and transparent wordmark are bundled as local assets. Existing task storage stays at its previous path so the rename does not hide anyone's data.
- Routines now supports user templates with a name, optional emoji, and 1–20 task titles and durations. Saving a template writes it to the same local atomic file and backup as tasks. Use adds fresh copies of its tasks and leaves the template in place; delete removes only the template. The built-in starter routines remain available.
- Save format 5 migrates earlier files by adding an empty routine library. The routine library is validated on load and every edit; malformed or oversized templates are rejected.
- Verification: 54 domain/storage tests pass; production build and isolated Electron smoke tests pass, including creating a routine through the UI, persisting it, and using it. The normal, short, and maximized UI were visually inspected, along with the Routines page.
