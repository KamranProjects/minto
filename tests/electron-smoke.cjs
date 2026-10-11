const { app, powerMonitor, screen, shell } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

process.env.COZY_SMOKE = "1";
if (!process.env.COZY_SMOKE_DEV) delete process.env.COZY_DEV_URL;
let completionBeeps = 0;
shell.beep = () => {
  completionBeeps += 1;
};
const output = path.resolve(".test-output");
const errors = [];
const requests = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (details) => {
    if (details.level === "error") errors.push(details.message);
  });
  contents.on("render-process-gone", (_event, details) =>
    errors.push(`Renderer exited: ${details.reason}`),
  );
});

const timeout = setTimeout(() => {
  console.error("Electron smoke test timed out.");
  app.exit(1);
}, 55000);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function painted(window) {
  await window.webContents.executeJavaScript(
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
  await delay(100);
}
async function waitUntil(fn, description) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await fn()) return;
    await delay(50);
  }
  throw new Error(`Timed out: ${description}`);
}
const readSnapshot = (window) =>
  window.webContents.executeJavaScript("window.cozy.getSnapshot()");
const dispatch = (window, command) =>
  window.webContents.executeJavaScript(
    `window.cozy.dispatch(${JSON.stringify(command)})`,
  );
const windowAction = (window, action) =>
  window.webContents.executeJavaScript(
    `window.cozy.window(${JSON.stringify(action)})`,
  );
const text = (window) =>
  window.webContents.executeJavaScript("document.body.innerText");

(async () => {
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, "electron-"));
  process.env.COZY_DATA_DIR = profile;
  const { boot } = await import(
    pathToFileURL(path.resolve("dist-electron/electron/main.js")).href
  );
  let clockOffset = 0;
  const { service, windows, repository } = await boot({
    now: () => Date.now() + clockOffset,
  });
  const main = windows.main;
  await dispatch(main, {
    type: "settings.update",
    settings: { primaryColor: "#356b83", accent: "#d6a681" },
  });
  assert.equal(
    (await readSnapshot(main)).state.settings.primaryColor,
    "#356b83",
  );
  main.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    if (/^https?:/.test(details.url)) requests.push(details.url);
    callback({});
  });
  await waitUntil(
    async () => (await text(main)).includes("Add a task"),
    "empty app render",
  );
  assert.equal(
    await main.webContents.executeJavaScript("typeof require"),
    "undefined",
  );
  assert.equal(
    await main.webContents.executeJavaScript("typeof process"),
    "undefined",
  );
  assert.equal(main.webContents.getLastWebPreferences().contextIsolation, true);
  assert.equal(main.webContents.getLastWebPreferences().sandbox, true);
  assert.equal((await readSnapshot(main)).state.tasks.length, 0);
  const tasks = [
    { title: "Plan my day", minutes: 10, emoji: "🌿", color: "#fffefa" },
    {
      title: "Make progress on the important thing",
      minutes: 25,
      emoji: "✍️",
      color: "#f9eed7",
    },
    {
      title: "A cup of tea & a stretch",
      minutes: 5,
      emoji: "☕",
      color: "#e6eee3",
    },
  ];
  assert.equal(
    (await dispatch(main, { type: "task.addMany", tasks })).ok,
    true,
  );
  await waitUntil(
    async () => (await text(main)).includes(tasks[2].title),
    "task list render",
  );
  assert.equal(
    (
      await dispatch(main, {
        type: "task.add",
        task: { ...tasks[0], minutes: -1 },
      })
    ).ok,
    false,
  );
  assert.equal((await readSnapshot(main)).state.tasks.length, 3);

  await windowAction(main, "showDock");
  const dock = windows.dock;
  await waitUntil(
    async () => (await text(dock)).includes("Plan my day"),
    "dock task render",
  );
  assert.equal(dock.isAlwaysOnTop(), true);
  assert.equal(dock.getBounds().height, 182);
  assert.equal(
    await dock.webContents.executeJavaScript(
      'getComputedStyle(document.querySelector(".timer-dock")).webkitAppRegion',
    ),
    "drag",
  );
  assert.equal(
    await dock.webContents.executeJavaScript(
      'getComputedStyle(document.querySelector(".dock-play")).webkitAppRegion',
    ),
    "no-drag",
  );

  await dispatch(dock, { type: "timer.start" });
  await delay(1250);
  assert.equal(
    (await readSnapshot(main)).state.timer.taskId,
    (await readSnapshot(dock)).state.timer.taskId,
  );
  await waitUntil(
    async () => (await text(main)).includes("ONE THING AT A TIME"),
    "main receives dock start",
  );
  await dispatch(main, { type: "timer.pause" });
  const paused = await readSnapshot(dock);
  assert.ok(paused.state.tasks[0].elapsedMs >= 1000);
  assert.equal(paused.state.timer.startedAt, null);
  assert.ok(paused.state.sessions.length > 0);
  const planStart = Date.now() - 60000;
  await dispatch(main, {
    type: "task.edit",
    id: paused.state.tasks[0].id,
    task: { ...tasks[0], plan: { start: planStart, end: planStart + 600000 } },
  });
  await main.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.app-nav button')).find(button => button.textContent.includes('Analytics')).click()`,
  );
  await waitUntil(
    async () => (await text(main)).includes("Focus timeline"),
    "analytics page",
  );
  await painted(main);
  await fs.writeFile(
    path.join(output, "analytics-window.png"),
    (await main.webContents.capturePage()).toPNG(),
  );
  await main.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.app-nav button')).find(button => button.textContent.trim() === 'Focus').click()`,
  );

  await painted(main);
  await fs.writeFile(
    path.join(output, "main-window.png"),
    (await main.webContents.capturePage()).toPNG(),
  );
  await fs.writeFile(
    path.join(output, "dock-expanded.png"),
    (await dock.webContents.capturePage()).toPNG(),
  );
  await dispatch(dock, {
    type: "settings.update",
    settings: { dockExpanded: false },
  });
  assert.equal(dock.getBounds().height, 72);
  await waitUntil(
    async () =>
      await dock.webContents.executeJavaScript(
        '!!document.querySelector(".compact")',
      ),
    "compact dock",
  );
  await fs.writeFile(
    path.join(output, "dock-compact.png"),
    (await dock.webContents.capturePage()).toPNG(),
  );
  await dispatch(main, {
    type: "settings.update",
    settings: { dockStyle: "pie" },
  });
  await waitUntil(
    async () =>
      await dock.webContents.executeJavaScript(
        '!!document.querySelector(".dock-pie")',
      ),
    "pie dock",
  );
  await fs.writeFile(
    path.join(output, "dock-pie.png"),
    (await dock.webContents.capturePage()).toPNG(),
  );
  for (const expanded of [true, false]) {
    await dock.webContents.executeJavaScript(
      `document.querySelector('[aria-label="${expanded ? "Expand" : "Collapse"} mini timer"]').click()`,
    );
    await waitUntil(
      async () =>
        (await readSnapshot(dock)).state.settings.dockExpanded === expanded,
      "pie details toggle",
    );
    assert.equal((await readSnapshot(dock)).state.settings.dockStyle, "pie");
    assert.equal(dock.getBounds().height, expanded ? 182 : 72);
    assert.equal(
      await dock.webContents.executeJavaScript(
        '!!document.querySelector(".dock-pie")',
      ),
      true,
    );
  }
  for (const [layout, width, height] of [
    ["orbit", 244, 286],
    ["flip", 320, 222],
    ["ribbon", 460, 88],
  ]) {
    await dispatch(main, {
      type: "settings.update",
      settings: { dockStyle: layout },
    });
    await waitUntil(
      async () =>
        await dock.webContents.executeJavaScript(
          `!!document.querySelector('.dock-${layout}')`,
        ),
      `${layout} dock`,
    );
    assert.equal(dock.getBounds().width, width);
    assert.equal(dock.getBounds().height, height);
    assert.equal(
      await dock.webContents.executeJavaScript(
        "document.documentElement.scrollWidth <= innerWidth",
      ),
      true,
    );
    await painted(dock);
    await fs.writeFile(
      path.join(output, `dock-${layout}.png`),
      (await dock.webContents.capturePage()).toPNG(),
    );
  }
  await main.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.app-nav button')).find(button => button.textContent.trim() === 'Settings').click()`,
  );
  await waitUntil(
    async () =>
      await main.webContents.executeJavaScript(
        '!!document.querySelector(".dock-gallery")',
      ),
    "dock gallery",
  );
  await main.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.theme-presets button')).find(button => button.textContent.includes('Lavender')).click()`,
  );
  await waitUntil(
    async () =>
      (await readSnapshot(dock)).state.settings.primaryColor === "#76618c",
    "theme shared with dock",
  );
  await main.webContents.executeJavaScript(
    'document.querySelector(".theme-settings").scrollIntoView({ block: "start" })',
  );
  await painted(main);
  await fs.writeFile(
    path.join(output, "color-settings.png"),
    (await main.webContents.capturePage()).toPNG(),
  );
  await main.webContents.executeJavaScript(
    'document.querySelector(".dock-gallery").scrollIntoView({ block: "center" })',
  );
  await painted(main);
  await fs.writeFile(
    path.join(output, "dock-gallery.png"),
    (await main.webContents.capturePage()).toPNG(),
  );
  await main.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.app-nav button')).find(button => button.textContent.trim() === 'Focus').click()`,
  );
  await dispatch(main, {
    type: "settings.update",
    settings: { dockExpanded: true, mainOnTop: true },
  });
  assert.equal(main.isAlwaysOnTop(), true);
  await dispatch(main, {
    type: "settings.update",
    settings: { mainOnTop: false, dockOnTop: false },
  });
  assert.equal(main.isAlwaysOnTop(), false);
  assert.equal(dock.isAlwaysOnTop(), false);

  main.close();
  assert.equal(main.isVisible(), false);
  await windowAction(dock, "showMain");
  assert.equal(main.isVisible(), true);
  const ids = paused.state.tasks.map((task) => task.id);
  await Promise.all([
    dispatch(main, {
      type: "task.edit",
      id: ids[1],
      task: { ...tasks[1], title: "Finish the first draft" },
    }),
    dispatch(dock, { type: "timer.adjust", minutes: 5 }),
  ]);
  const changed = await readSnapshot(main);
  assert.equal(changed.state.tasks[1].title, "Finish the first draft");
  assert.equal(changed.state.tasks[0].durationMs, 900000);
  const beforeBeep = completionBeeps;
  await dispatch(dock, { type: "task.complete", id: ids[0] });
  assert.equal(completionBeeps, beforeBeep + 1);
  await dispatch(dock, { type: "task.complete", id: ids[0] });
  service.broadcast();
  assert.equal(completionBeeps, beforeBeep + 1);
  await waitUntil(
    async () => (await text(dock)).includes("Finish the first draft"),
    "next task in dock",
  );
  assert.equal((await readSnapshot(main)).state.timer.startedAt, null);

  await dispatch(main, { type: "timer.start" });
  powerMonitor.emit("suspend");
  await waitUntil(
    async () => (await readSnapshot(main)).state.timer.startedAt === null,
    "pause on system sleep",
  );
  await dispatch(main, { type: "timer.start" });
  await service.saveCheckpoint();
  const saved = JSON.parse(await fs.readFile(repository.file, "utf8"));
  assert.notEqual(saved.timer.startedAt, null);
  const { FileRepository } = await import(
    pathToFileURL(path.resolve("dist-electron/electron/repository.js")).href
  );
  const recovered = await new FileRepository(profile).load(
    Date.now() + 86400000,
  );
  assert.equal(recovered.state.timer.startedAt, null);
  assert.equal(recovered.state.tasks[1].elapsedMs, saved.tasks[1].elapsedMs);
  await dispatch(main, { type: "timer.pause" });

  main.webContents.reload();
  await waitUntil(async () => {
    try {
      return (await text(main)).includes("Finish the first draft");
    } catch {
      return false;
    }
  }, "reload restores UI");
  assert.equal((await readSnapshot(main)).state.tasks.length, 3);
  main.setSize(380, 540);
  await delay(150);
  assert.equal(
    await main.webContents.executeJavaScript(
      "document.documentElement.scrollWidth <= innerWidth",
    ),
    true,
  );
  assert.equal(
    await main.webContents.executeJavaScript(
      'document.querySelector(".app-nav").getBoundingClientRect().bottom <= innerHeight',
    ),
    true,
  );
  await fs.writeFile(
    path.join(output, "short-window.png"),
    (await main.webContents.capturePage()).toPNG(),
  );
  main.maximize();
  await waitUntil(async () => main.isMaximized(), "maximize");
  await delay(200);
  await fs.writeFile(
    path.join(output, "maximized-window.png"),
    (await main.webContents.capturePage()).toPNG(),
  );
  assert.equal(
    await main.webContents.executeJavaScript(
      "document.documentElement.scrollWidth <= innerWidth",
    ),
    true,
  );
  const workArea = screen.getPrimaryDisplay().workArea;
  dock.setPosition(
    workArea.x + workArea.width + 100,
    workArea.y + workArea.height + 100,
  );
  windows.recoverBounds();
  const bounds = dock.getBounds();
  assert.ok(
    bounds.x >= workArea.x &&
      bounds.x + bounds.width <= workArea.x + workArea.width,
  );
  assert.ok(
    bounds.y >= workArea.y &&
      bounds.y + bounds.height <= workArea.y + workArea.height,
  );

  await windows.flushPlacement();
  const placement = (await readSnapshot(main)).state.desktop;
  assert.equal(placement.dockOpen, true);
  assert.equal(placement.main.maximized, true);
  assert.equal(placement.dock.x, bounds.x);
  const persisted = await new FileRepository(profile).load(Date.now());
  assert.deepEqual(persisted.state.desktop, placement);

  // Exercise window creation with persisted and absent-monitor placements.
  const { Windows } = await import(
    pathToFileURL(path.resolve("dist-electron/electron/windows.js")).href
  );
  const restoredWindows = new Windows(
    service.snapshot().state.settings,
    process.env.COZY_DEV_URL,
    structuredClone(placement),
  );
  const restoredMain = await restoredWindows.createMain();
  const restoredDock = await restoredWindows.showDock();
  assert.equal(restoredMain.isMaximized(), true);
  assert.equal(restoredDock.getBounds().x, bounds.x);
  restoredWindows.beginQuit();
  restoredMain.destroy();
  restoredDock.destroy();
  const missingMonitor = structuredClone(placement);
  missingMonitor.main = {
    x: -50000,
    y: -50000,
    width: 438,
    height: 700,
    displayId: -987654,
    maximized: false,
  };
  missingMonitor.dock = { ...missingMonitor.main, width: 332, height: 182 };
  const fallback = new Windows(
    service.snapshot().state.settings,
    process.env.COZY_DEV_URL,
    missingMonitor,
  );
  const fallbackMain = await fallback.createMain();
  const fallbackDock = await fallback.showDock();
  for (const window of [fallbackMain, fallbackDock]) {
    const rectangle = window.getBounds();
    assert.ok(rectangle.x >= workArea.x && rectangle.y >= workArea.y);
    assert.ok(rectangle.x + rectangle.width <= workArea.x + workArea.width);
  }
  fallback.beginQuit();
  fallbackMain.destroy();
  fallbackDock.destroy();

  main.unmaximize();
  main.setSize(438, 820);
  await dispatch(main, {
    type: "task.add",
    task: { ...tasks[0], title: "Time-up check", minutes: 1 },
  });
  const alarmTask = (await readSnapshot(main)).state.tasks.at(-1);
  await dispatch(main, { type: "task.select", id: alarmTask.id });
  await dispatch(main, {
    type: "settings.update",
    settings: { notifications: false, sound: false },
  });
  await dispatch(main, { type: "timer.start" });
  main.hide();
  clockOffset += 61000;
  await waitUntil(
    async () =>
      (await readSnapshot(main)).state.tasks.at(-1).alert === "pending",
    "durable timer-end alert",
  );
  assert.equal(main.isVisible(), true);
  await waitUntil(
    async () => (await text(main)).includes("Continue in overtime"),
    "time-up choices",
  );
  const expired = await readSnapshot(main);
  assert.equal(expired.state.timer.startedAt, null);
  assert.equal(expired.state.tasks.at(-1).elapsedMs, 60000);
  clockOffset += 60000;
  assert.equal((await readSnapshot(main)).state.tasks.at(-1).focusMs, 60000);
  await painted(main);
  await fs.writeFile(
    path.join(output, "time-up.png"),
    (await main.webContents.capturePage()).toPNG(),
  );
  await main.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.time-up button')).find(button => button.textContent === 'Continue in overtime').click()`,
  );
  await waitUntil(
    async () =>
      (await readSnapshot(main)).state.tasks.at(-1).alert === "acknowledged",
    "continue overtime",
  );
  await dispatch(main, { type: "timer.pause" });
  main.webContents.reload();
  await waitUntil(async () => {
    try {
      return (await text(main)).includes("Time-up check");
    } catch {
      return false;
    }
  }, "alert reload");
  assert.equal(
    await main.webContents.executeJavaScript(
      '!!document.querySelector(".time-up")',
    ),
    false,
  );

  // Use the actual React form, not just IPC fixtures, for optional planning.
  await main.webContents.executeJavaScript(
    'document.querySelector(".add-task").click()',
  );
  await waitUntil(
    async () =>
      await main.webContents.executeJavaScript(
        '!!document.querySelector(".task-form")',
      ),
    "task editor",
  );
  await main.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('.task-form input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Planned with the task form');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  await waitUntil(
    async () =>
      await main.webContents.executeJavaScript(
        'document.querySelectorAll(".plan-fields input").length === 3',
      ),
    "planning fields",
  );
  await main.webContents.executeJavaScript(`
    (() => {
      const fields = document.querySelectorAll('.plan-fields input');
      for (const [index, value] of ['2026-10-10T09:00', '2026-10-10T10:00', '2026-10-10T12:00'].entries()) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(fields[index], value);
        fields[index].dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
  await painted(main);
  await fs.writeFile(
    path.join(output, "planned-task-form.png"),
    (await main.webContents.capturePage()).toPNG(),
  );
  await main.webContents.executeJavaScript(
    'document.querySelector(".task-form").requestSubmit()',
  );
  await waitUntil(
    async () =>
      (await readSnapshot(main)).state.tasks.some(
        (task) => task.title === "Planned with the task form",
      ),
    "form saves plan",
  );
  const formSnapshot = await readSnapshot(main);
  const formTask = formSnapshot.state.tasks.find(
    (task) => task.title === "Planned with the task form",
  );
  assert.equal(formTask.dueAt, new Date("2026-10-10T12:00").getTime());
  assert.equal(formTask.scheduledAt, new Date("2026-10-10T09:00").getTime());
  assert.ok(
    formSnapshot.state.plans.some(
      (plan) =>
        plan.taskId === formTask.id && plan.end - plan.start === 3600000,
    ),
  );

  await main.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.app-nav button')).find(button => button.textContent.includes('Analytics')).click()`,
  );
  main.setSize(380, 540);
  await delay(200);
  assert.equal(
    await main.webContents.executeJavaScript(
      "document.documentElement.scrollWidth <= innerWidth",
    ),
    true,
  );
  await fs.writeFile(
    path.join(output, "analytics-short.png"),
    (await main.webContents.capturePage()).toPNG(),
  );
  main.maximize();
  await delay(200);
  await fs.writeFile(
    path.join(output, "analytics-maximized.png"),
    (await main.webContents.capturePage()).toPNG(),
  );

  assert.equal(main.getTitle(), "Minto");
  await main.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.app-nav button')).find(button => button.textContent.trim() === 'Routines').click()`,
  );
  await waitUntil(
    async () => (await text(main)).includes("New routine"),
    "routine page",
  );
  await main.webContents.executeJavaScript(
    `document.querySelector('.routine-header button').click()`,
  );
  main.unmaximize();
  main.setSize(438, 680);
  await painted(main);
  await fs.writeFile(
    path.join(output, "minto-routine-form.png"),
    (await main.webContents.capturePage()).toPNG(),
  );
  await main.webContents.executeJavaScript(`
    const setField = (selector, value) => {
      const field = document.querySelector(selector);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setField('.routine-form > label input', 'Morning sketch');
    setField('.routine-draft input', 'Draw one idea');
    document.querySelector('.routine-form button[type="submit"]').click();
  `);
  await waitUntil(
    async () => (await readSnapshot(main)).state.routines.length === 1,
    "routine saved from form",
  );
  const savedRoutine = (await readSnapshot(main)).state.routines[0];
  assert.equal(savedRoutine.tasks[0].title, "Draw one idea");
  assert.equal(
    (await new FileRepository(profile).load(Date.now())).state.routines[0]
      .title,
    "Morning sketch",
  );
  await painted(main);
  await fs.writeFile(
    path.join(output, "minto-routines.png"),
    (await main.webContents.capturePage()).toPNG(),
  );
  await main.webContents.executeJavaScript(
    `document.querySelector('.routine-use').click()`,
  );
  await waitUntil(
    async () =>
      (await readSnapshot(main)).state.tasks.some(
        (task) => task.title === "Draw one idea",
      ),
    "routine used from page",
  );
  assert.equal(
    (await readSnapshot(main)).state.tasks.at(-1).title,
    "Draw one idea",
  );
  await main.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.app-nav button')).find(button => button.textContent.trim() === 'Focus').click()`,
  );

  await main.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.app-nav button')).find(button => button.textContent.trim() === 'Settings').click()`,
  );
  await waitUntil(
    async () =>
      main.webContents.executeJavaScript(
        '!!document.querySelector(".reset-open")',
      ),
    "reset control",
  );
  await main.webContents.executeJavaScript(
    'document.querySelector(".reset-open").click()',
  );
  await main.webContents.executeJavaScript(
    'document.querySelector(".reset-confirm").scrollIntoView({ block: "center" })',
  );
  await painted(main);
  await fs.writeFile(
    path.join(output, "reset-confirm.png"),
    (await main.webContents.capturePage()).toPNG(),
  );
  assert.equal(
    await main.webContents.executeJavaScript(
      'document.querySelector(".reset-confirm button:last-child").disabled',
    ),
    true,
  );
  await main.webContents.executeJavaScript(`(() => {
    const field = document.querySelector('#reset-word');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, 'RESET');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitUntil(
    async () =>
      main.webContents.executeJavaScript(
        '!document.querySelector(".reset-confirm button:last-child").disabled',
      ),
    "reset confirmation",
  );
  await main.webContents.executeJavaScript(
    'document.querySelector(".reset-confirm button:last-child").click()',
  );
  await waitUntil(
    async () => (await readSnapshot(main)).state.tasks.length === 0,
    "reset in main window",
  );
  assert.equal((await readSnapshot(dock)).state.tasks.length, 0);
  assert.equal(
    (await new FileRepository(profile).load(Date.now())).state.routines.length,
    0,
  );
  assert.equal(
    JSON.parse(await fs.readFile(`${repository.file}.bak`, "utf8")).tasks
      .length,
    0,
  );

  assert.deepEqual(errors, [], `Renderer errors: ${errors.join("\n")}`);
  if (!process.env.COZY_SMOKE_DEV)
    assert.deepEqual(
      requests,
      [],
      "Production app must not depend on network requests",
    );
  else
    assert.ok(
      requests.every((url) => new URL(url).origin === "http://127.0.0.1:5173"),
      "Development requests stay local",
    );
  console.log(
    "PASS: Electron IPC, shared timers, validation, persistence, sleep, reload, on-top controls, dock layouts, restored bounds, missing-monitor fallback, planning and routine forms, analytics, time-up decisions, narrow/maximized layout, and local loading.",
  );
  console.log(`Screenshots: ${output}`);
  await fs.writeFile(
    path.join(output, "electron-results.json"),
    JSON.stringify(
      {
        passed: true,
        profile,
        checks:
          "Base timer regression plus analytics, three dock layouts, window persistence, missing-monitor fallback, durable time-up decisions and reload",
        rendererErrors: errors,
        networkRequests: requests,
      },
      null,
      2,
    ),
  );
  clearTimeout(timeout);
  app.quit();
})().catch((error) => {
  console.error(error);
  clearTimeout(timeout);
  app.exit(1);
});
