import {
  app,
  dialog,
  ipcMain,
  Menu,
  powerMonitor,
  screen,
  session,
  Notification,
  shell,
} from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { FileRepository } from "./repository.js";
import { FocusService } from "./service.js";
import { Windows } from "./windows.js";
import { checkpoint, recoverState } from "../src/shared/engine.js";

app.setName("Minto");
if (process.env.COZY_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.COZY_DATA_DIR));
else if (!app.isPackaged)
  app.setPath("userData", path.join(app.getAppPath(), ".cozy-dev"));
else
  // Keep the existing data location when the visible app name changes.
  app.setPath("userData", path.join(app.getPath("appData"), "Cozy Focus"));

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

let windows: Windows;
let service: FocusService;
let broadcastInterval: NodeJS.Timeout;
let checkpointInterval: NodeJS.Timeout;
let quitAllowed = false;
let quitPending = false;
let timeUpNotification: Notification | null = null;

function authorize(event: IpcMainInvokeEvent) {
  const owner = windows
    .all()
    .find((window) => window.webContents === event.sender);
  if (!owner || event.senderFrame !== event.sender.mainFrame)
    throw new Error("Untrusted sender.");
  const source = new URL(event.senderFrame.url);
  const isLocalFile = source.protocol === "file:";
  const isDev =
    !!process.env.COZY_DEV_URL && source.origin === "http://127.0.0.1:5173";
  if (!isLocalFile && !isDev) throw new Error("Untrusted page.");
  return owner;
}

export async function boot(options: { now?: () => number } = {}) {
  await app.whenReady();
  app.setAppUserModelId("org.cozyfocus.desktop");
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  await mkdir(app.getPath("userData"), { recursive: true });
  const epoch = Date.now();
  const anchor = performance.now();
  const now =
    options.now ?? (() => Math.round(epoch + performance.now() - anchor));
  const repository = new FileRepository(app.getPath("userData"));
  const loaded = await repository.load(now());
  service = new FocusService(loaded.state, repository, now, loaded.message);
  windows = new Windows(
    loaded.state.settings,
    process.env.COZY_DEV_URL,
    structuredClone(loaded.state.desktop),
    (placement) => service.saveDesktop(placement),
  );
  let completedIds = new Set(
    loaded.state.tasks
      .filter((task) => task.completedAt !== null)
      .map((task) => task.id),
  );
  service.subscribe((snapshot) => {
    const nextCompleted = new Set(
      snapshot.state.tasks
        .filter((task) => task.completedAt !== null)
        .map((task) => task.id),
    );
    const newlyCompleted = [...nextCompleted].some(
      (id) => !completedIds.has(id),
    );
    completedIds = nextCompleted;
    if (newlyCompleted && snapshot.state.settings.completionSound) shell.beep();
    windows.applySettings(snapshot.state.settings);
    for (const window of windows.all())
      window.webContents.send("focus:state", snapshot);
  });

  ipcMain.handle("focus:get", (event) => {
    authorize(event);
    return service.snapshot();
  });
  ipcMain.handle("focus:command", (event, command: unknown) => {
    authorize(event);
    return service.dispatch(command);
  });
  ipcMain.handle("focus:reset", (event) => {
    authorize(event);
    return service.resetAll();
  });
  ipcMain.handle("focus:window", async (event, action: unknown) => {
    const owner = authorize(event);
    switch (action) {
      case "minimize":
        owner.minimize();
        break;
      case "maximize":
        if (owner === windows.main)
          owner.isMaximized() ? owner.unmaximize() : owner.maximize();
        break;
      case "close":
        owner.close();
        break;
      case "showMain":
        if (!windows.main) await windows.createMain();
        else windows.showMain();
        break;
      case "showDock":
        await windows.showDock();
        break;
      case "hideDock":
        windows.dock?.close();
        break;
      default:
        throw new Error("Unknown window action.");
    }
  });
  ipcMain.handle("focus:export", async (event) => {
    const owner = authorize(event);
    const destination = await dialog.showSaveDialog(owner, {
      title: "Save a Minto backup",
      defaultPath: "minto-backup.json",
      filters: [{ name: "JSON backup", extensions: ["json"] }],
    });
    if (destination.canceled || !destination.filePath) return { ok: true };
    try {
      const snapshot = service.snapshot();
      const backup = recoverState(checkpoint(snapshot.state, snapshot.now));
      await writeFile(destination.filePath, JSON.stringify(backup, null, 2), {
        encoding: "utf8",
        flush: true,
      });
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: "The backup could not be saved. Try another folder.",
      };
    }
  });

  await windows.createMain();
  if (process.env.COZY_DEV_URL)
    console.log("Minto main window loaded and shown.");
  if (loaded.state.desktop.dockOpen) await windows.showDock();
  broadcastInterval = setInterval(() => {
    void service
      .checkTimeUp((task, snapshot) => {
        windows.showMain();
        if (snapshot.state.settings.sound) shell.beep();
        if (
          snapshot.state.settings.notifications &&
          Notification.isSupported()
        ) {
          timeUpNotification?.close();
          timeUpNotification = new Notification({
            title: "Time’s up — Minto",
            body: `${task.title}: mark done, continue in overtime, or add five minutes.`,
            silent: true,
          });
          timeUpNotification.on("click", () => windows.showMain());
          timeUpNotification.on("failed", (_event, error) =>
            console.warn("Native notification unavailable:", error),
          );
          timeUpNotification.show();
        }
      })
      .catch((error: unknown) => console.error("Time-up check failed:", error));
  }, 1000);
  checkpointInterval = setInterval(() => {
    void service.saveCheckpoint();
  }, 5000);
  powerMonitor.on("suspend", () => {
    void service.pauseForLifecycle();
  });
  screen.on("display-removed", () => windows.recoverBounds());
  screen.on("display-metrics-changed", () => windows.recoverBounds());
  return { service, windows, repository };
}

app.on("second-instance", () => windows?.showMain());
app.on("activate", () => {
  if (windows) void windows.createMain();
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (quitAllowed || !service) return;
  event.preventDefault();
  if (quitPending) return;
  quitPending = true;
  clearInterval(broadcastInterval);
  clearInterval(checkpointInterval);
  void (async () => {
    const placementResult = await windows.flushPlacement();
    const timerResult = await service.pauseForLifecycle();
    return placementResult.ok ? timerResult : placementResult;
  })().then((result) => {
    if (!result.ok)
      dialog.showErrorBox(
        "Could not save the latest changes",
        "Your last saved list is safe. The most recent timer or window changes could not be saved.",
      );
    quitAllowed = true;
    windows.beginQuit();
    app.quit();
  });
});

// The smoke runner imports boot directly and uses an isolated temporary profile.
if (hasLock && process.env.COZY_SMOKE !== "1") {
  void boot().catch((error) => {
    dialog.showErrorBox(
      "Minto could not start",
      error instanceof Error ? error.message : String(error),
    );
    app.exit(1);
  });
}
