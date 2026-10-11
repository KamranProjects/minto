# Contributing

Read `AGENTS.md` for the product boundaries and `docs/DEVELOPER.md` for the current architecture, timer contract, persistence, IPC, and test workflow. `docs/PLAN.md` records earlier design decisions.

Use Node 22.16+ and run `npm ci`, then `npm run dev`. React edits reload automatically; restart development mode after changing `electron/` or shared timer logic to rebuild the main process.

Before submitting a change:

```sh
npm run format
npm test
npm run test:electron
```

Use `COZY_DATA_DIR` to point Electron at a disposable profile when experimenting with persistence. The smoke suite already creates isolated profiles in `.test-output/` and never touches `.cozy-dev/`.

The project has no network backend. Keep domain transitions deterministic and test time with an injected clock. Do not expose Node, generic IPC, file paths, or shell commands to the React renderer. Keep changes small and explain the user-visible behavior they improve.
