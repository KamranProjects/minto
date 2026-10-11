import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { FileRepository } from "../electron/repository.js";
import { FocusService } from "../electron/service.js";
import { createState, TASK_COLORS } from "../src/shared/model.js";
import type { FocusState } from "../src/shared/model.js";
import { applyCommand } from "../src/shared/engine.js";

const input = {
  title: "A local task",
  minutes: 25,
  emoji: "🌿",
  color: TASK_COLORS[0],
};
async function repository() {
  const root = path.resolve(".test-output");
  await mkdir(root, { recursive: true });
  return new FileRepository(await mkdtemp(path.join(root, "storage-")));
}

test("an actual legacy file migrates through the repository without changing its tasks", async () => {
  const repo = await repository();
  const seed = applyCommand(
    createState(1000),
    { type: "task.add", task: input },
    1000,
    () => "legacy-task",
  );
  const legacy = JSON.parse(JSON.stringify(seed));
  legacy.version = 1;
  delete legacy.sessions;
  delete legacy.plans;
  delete legacy.historySince;
  delete legacy.desktop;
  delete legacy.settings.dockStyle;
  delete legacy.settings.notifications;
  delete legacy.tasks[0].alert;
  const original = JSON.stringify(legacy);
  await writeFile(repo.file, original);
  const loaded = await repo.load(2000);
  assert.equal(await readFile(repo.file, "utf8"), original);
  assert.equal(loaded.state.tasks[0].id, "legacy-task");
  assert.equal(loaded.state.tasks[0].durationMs, 25 * 60000);
  assert.equal(loaded.state.version, 5);
  await repo.save(loaded.state);
  const restored = await new FileRepository(repo.directory).load(3000);
  assert.deepEqual(restored.state.tasks, loaded.state.tasks);
  assert.deepEqual(restored.state.sessions, []);
});

test("new repository starts empty; tasks and settings survive a new service", async () => {
  const repo = await repository();
  const loaded = await repo.load(1000);
  assert.equal(loaded.state.tasks.length, 0);
  const service = new FocusService(loaded.state, repo, () => 1000);
  assert.deepEqual(await service.dispatch({ type: "task.add", task: input }), {
    ok: true,
  });
  await service.dispatch({
    type: "settings.update",
    settings: { timerStyle: "digital" },
  });
  const reopened = await new FileRepository(repo.directory).load(5000);
  assert.equal(reopened.state.tasks[0].title, input.title);
  assert.equal(reopened.state.settings.timerStyle, "digital");
});

test("start fresh clears saved tasks, routines, analytics, settings and recovery copies", async () => {
  const repo = await repository();
  const service = new FocusService(
    (await repo.load(1000)).state,
    repo,
    () => 5000,
  );
  await service.dispatch({ type: "task.add", task: input });
  await service.dispatch({
    type: "routine.add",
    routine: { title: "Morning", emoji: "🌿", tasks: [input] },
  });
  await service.dispatch({
    type: "settings.update",
    settings: { timerStyle: "digital" },
  });
  await writeFile(`${repo.file}.damaged-123`, "old private data");
  const before = service.snapshot().state.revision;
  assert.deepEqual(await service.resetAll(), { ok: true });
  const cleared = service.snapshot().state;
  assert.equal(cleared.revision, before + 1);
  assert.deepEqual(cleared.tasks, []);
  assert.deepEqual(cleared.routines, []);
  assert.deepEqual(cleared.sessions, []);
  assert.deepEqual(cleared.plans, []);
  assert.deepEqual(cleared.settings, createState(5000).settings);
  assert.equal(
    (await readdir(repo.directory)).some((name) => name.includes("damaged")),
    false,
  );
  for (const file of [repo.file, `${repo.file}.bak`])
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")).tasks, []);
  const reopened = await new FileRepository(repo.directory).load(6000);
  assert.deepEqual(reopened.state, cleared);
});

test("failed start fresh keeps the in-memory list and reports the failure", async () => {
  const repo = await repository();
  const service = new FocusService(
    (await repo.load(1000)).state,
    repo,
    () => 1000,
  );
  await service.dispatch({ type: "task.add", task: input });
  repo.reset = async () => {
    throw new Error("disk full");
  };
  assert.equal((await service.resetAll()).ok, false);
  assert.equal(service.snapshot().state.tasks.length, 1);
  assert.ok(service.snapshot().storageError);
});

test("custom routine is stored locally and can be reused after restart", async () => {
  const repo = await repository();
  const first = await repo.load(1000);
  const saved = applyCommand(
    first.state,
    {
      type: "routine.add",
      routine: { title: "My checklist", emoji: "🌿", tasks: [input] },
    },
    1000,
    () => "routine-1",
  );
  await repo.save(saved);
  const reopened = await new FileRepository(repo.directory).load(2000);
  assert.equal(reopened.state.routines[0].title, "My checklist");
  assert.equal(reopened.state.tasks.length, 0);
  const used = applyCommand(
    reopened.state,
    { type: "routine.use", id: "routine-1" },
    2000,
    () => "new-task",
  );
  assert.equal(used.tasks[0].title, input.title);
  assert.equal(used.routines.length, 1);
});

test("atomic saves leave valid JSON and a previous-version backup", async () => {
  const repo = await repository();
  await repo.load(1);
  const first = createState(1);
  await repo.save(first);
  const next = { ...first, revision: 1 };
  await repo.save(next);
  assert.equal(JSON.parse(await readFile(repo.file, "utf8")).revision, 1);
  assert.equal(
    JSON.parse(await readFile(`${repo.file}.bak`, "utf8")).revision,
    0,
  );
  assert.equal(
    (await readdir(repo.directory)).some((file) => file.endsWith(".tmp")),
    false,
  );
});

test("corrupt primary is preserved and recovered from validated backup", async () => {
  const repo = await repository();
  await repo.load(1);
  await repo.save(createState(1));
  await repo.save({ ...createState(1), revision: 2 });
  await writeFile(repo.file, "{broken");
  const reopened = new FileRepository(repo.directory);
  const recovered = await reopened.load(1000);
  assert.match(recovered.message!, /recovered/);
  assert.equal(recovered.state.revision, 0);
  assert.equal(await readFile(`${repo.file}.damaged-1000`, "utf8"), "{broken");
  await reopened.save(recovered.state);
  assert.equal(
    JSON.parse(await readFile(`${repo.file}.bak`, "utf8")).version,
    5,
  );
});

test("corrupt primary and backup fail closed without overwriting user data", async () => {
  const repo = await repository();
  await writeFile(repo.file, "bad primary");
  await writeFile(`${repo.file}.bak`, "bad backup");
  await assert.rejects(repo.load(1), /untouched/);
  assert.equal(await readFile(repo.file, "utf8"), "bad primary");
  assert.equal(await readFile(`${repo.file}.bak`, "utf8"), "bad backup");
});

test("orphaned temporary writes never override a good primary", async () => {
  const repo = await repository();
  await repo.load(1);
  await repo.save(createState(1));
  await writeFile(`${repo.file}.tmp`, "{partial");
  const reopened = await new FileRepository(repo.directory).load(2);
  assert.equal(reopened.state.version, 5);
});

test("simultaneous commands from two windows are serialized without losing tasks", async () => {
  const repo = await repository();
  const loaded = await repo.load(1);
  const service = new FocusService(loaded.state, repo, () => 1000);
  const results = await Promise.all(
    Array.from({ length: 16 }, (_, index) =>
      service.dispatch({
        type: "task.add",
        task: { ...input, title: `Task ${index}` },
      }),
    ),
  );
  assert.ok(results.every((result) => result.ok));
  assert.equal(service.snapshot().state.tasks.length, 16);
  assert.equal(
    new Set(service.snapshot().state.tasks.map((task) => task.id)).size,
    16,
  );
  assert.equal(
    (await new FileRepository(repo.directory).load(2000)).state.tasks.length,
    16,
  );
});

test("failed persistence rejects changes, reports failure, and permits a retry", async () => {
  let fail = true;
  const repo = {
    load: async () => ({ state: createState(1), message: null }),
    save: async (_state: FocusState) => {
      if (fail) throw new Error("Disk full");
    },
  };
  const service = new FocusService(createState(1), repo, () => 1000);
  const failed = await service.dispatch({ type: "task.add", task: input });
  assert.equal(failed.ok, false);
  assert.equal(service.snapshot().state.tasks.length, 0);
  assert.ok(service.snapshot().storageError);
  fail = false;
  assert.equal(
    (await service.dispatch({ type: "task.add", task: input })).ok,
    true,
  );
  assert.equal(service.snapshot().storageError, null);
});

test("invalid input does not write or poison the command queue", async () => {
  let saves = 0;
  const repo = {
    load: async () => ({ state: createState(1), message: null }),
    save: async () => {
      saves++;
    },
  };
  const service = new FocusService(createState(1), repo, () => 1000);
  assert.equal(
    (
      await service.dispatch({
        type: "task.add",
        task: { ...input, minutes: null },
      })
    ).ok,
    false,
  );
  assert.equal(saves, 0);
  assert.equal(
    (await service.dispatch({ type: "task.add", task: input })).ok,
    true,
  );
  assert.equal(saves, 1);
});

test("lifecycle pause stops counting even if disk saving fails", async () => {
  let now = 1000;
  let fail = false;
  const repo = {
    load: async () => ({ state: createState(1), message: null }),
    save: async () => {
      if (fail) throw new Error("Disk full");
    },
  };
  const service = new FocusService(createState(1), repo, () => now);
  await service.dispatch({ type: "task.add", task: input });
  await service.dispatch({ type: "timer.start" });
  now = 61000;
  fail = true;
  const result = await service.pauseForLifecycle();
  now = 999999;
  assert.equal(result.ok, false);
  assert.equal(service.snapshot().state.timer.startedAt, null);
  assert.equal(service.snapshot().state.tasks[0].elapsedMs, 60000);
});

test("checkpoint saves running time and restart excludes downtime", async () => {
  const repo = await repository();
  const loaded = await repo.load(1);
  let now = 1000;
  const service = new FocusService(loaded.state, repo, () => now);
  await service.dispatch({ type: "task.add", task: input });
  await service.dispatch({ type: "timer.start" });
  now = 16000;
  await service.saveCheckpoint();
  const reopened = await new FileRepository(repo.directory).load(900000);
  assert.equal(reopened.state.tasks[0].elapsedMs, 15000);
  assert.equal(reopened.state.timer.startedAt, null);
});

test("subscribers share revisions and unsubscribe removes the listener", async () => {
  const repo = await repository();
  const loaded = await repo.load(1);
  const service = new FocusService(loaded.state, repo, () => 1000);
  const left: number[] = [];
  const right: number[] = [];
  service.subscribe((snapshot) => left.push(snapshot.state.revision));
  const unsubscribe = service.subscribe((snapshot) =>
    right.push(snapshot.state.revision),
  );
  await service.dispatch({ type: "task.add", task: input });
  unsubscribe();
  await service.dispatch({ type: "timer.start" });
  assert.deepEqual(left, [1, 2]);
  assert.deepEqual(right, [1]);
});
