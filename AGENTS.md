# Cozy Focus project rules

## Product boundary
- Build an offline desktop task timer: add tasks, choose time, focus, complete.
- Keep the existing narrow, vertical desktop layout, soft paper surfaces, sage/coral accents, and optional emoji.
- No onboarding, accounts, subscriptions, AI features, cloud dependencies, notes, or calendar integrations. Offline planning and analytics are approved in CHANGES.md.
- Main window may maximize; the separate draggable timer dock stays compact and can stay on top.
- Use original assets and branding. Llama Life is a product reference, not a source of copied code or assets.

## Implementation
- Electron main process owns state, persistence, timer transitions, and windows. Renderers send typed commands through a limited preload bridge.
- One source of truth across windows. Derive elapsed time from timestamps; never count interval ticks as elapsed time.
- Preserve elapsed time on task switches. Pause at zero without completing the task. Overtime starts only when the user explicitly chooses it.
- Pause on system sleep, app exit, and restart. Persist a running checkpoint for crash recovery without charging time while closed.
- Validate every command and saved file. Save atomically and retain a last-known-good backup. Surface failures; never claim unsaved changes are saved.
- Keep Node disabled in renderers, context isolation and sandbox enabled, and block untrusted navigation and permissions.
- Keep components focused, types explicit, side effects cleaned up, and files readable. Do not compress components into one-line code.
- No runtime CDN assets or fonts. Respect reduced motion. Use native buttons, labels, focus states, and keyboard alternatives to dragging.

## Verification
- Run type checking, domain/storage tests, a production build, and Electron integration smoke tests after meaningful logic changes.
- Test timer accuracy, overtime, transitions, invalid input, recovery, persistence failures, and shared-window state.
- Inspect the rendered UI at the default desktop size, at a short window size, and maximized. Clearly report anything that could not be verified.
- Use isolated test profiles; do not overwrite a user's tasks with fixtures.
