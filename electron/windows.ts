import { BrowserWindow, screen } from "electron";
import type { Rectangle } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Settings,
  DesktopState,
  WindowPlacement,
  CommandResult,
} from "../src/shared/model.js";
import { dockLayout } from "../src/shared/model.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const mainPage = path.join(directory, "../../dist/index.html");
const preload = path.join(directory, "preload.cjs");

export function fitBounds(bounds: Rectangle, workArea: Rectangle): Rectangle {
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  return {
    width,
    height,
    x: Math.max(
      workArea.x,
      Math.min(bounds.x, workArea.x + workArea.width - width),
    ),
    y: Math.max(
      workArea.y,
      Math.min(bounds.y, workArea.y + workArea.height - height),
    ),
  };
}

export class Windows {
  main: BrowserWindow | null = null;
  dock: BrowserWindow | null = null;
  private quitting = false;
  private settings: Settings;
  private saveTimer: NodeJS.Timeout | undefined;

  constructor(
    settings: Settings,
    private devUrl?: string,
    private placement: DesktopState = {
      main: null,
      dock: null,
      dockOpen: false,
    },
    private persist: (
      value: DesktopState,
    ) => Promise<CommandResult> = async () => ({ ok: true }),
  ) {
    this.settings = settings;
    if (devUrl && devUrl !== "http://127.0.0.1:5173")
      throw new Error("Unexpected development URL.");
  }

  private restored(saved: WindowPlacement): Rectangle {
    const display =
      screen.getAllDisplays().find((item) => item.id === saved.displayId) ??
      screen.getPrimaryDisplay();
    return fitBounds(saved, display.workArea);
  }

  private capture(window: BrowserWindow): WindowPlacement {
    const bounds = window.getNormalBounds();
    return {
      ...bounds,
      maximized: window.isMaximized(),
      displayId: screen.getDisplayMatching(bounds).id,
    };
  }

  private changed() {
    if (this.quitting) return;
    if (this.main && !this.main.isDestroyed())
      this.placement.main = this.capture(this.main);
    if (this.dock && !this.dock.isDestroyed())
      this.placement.dock = this.capture(this.dock);
    this.placement.dockOpen = !!this.dock && !this.dock.isDestroyed();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void this.persist(structuredClone(this.placement));
    }, 400);
  }

  async flushPlacement() {
    this.changed();
    clearTimeout(this.saveTimer);
    return this.persist(structuredClone(this.placement));
  }

  private track(window: BrowserWindow) {
    window.on("move", () => this.changed());
    window.on("resize", () => this.changed());
    window.on("maximize", () => this.changed());
    window.on("unmaximize", () => this.changed());
  }

  private async load(window: BrowserWindow, dock = false) {
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    if (this.devUrl)
      await window.loadURL(`${this.devUrl}/${dock ? "?dock=1" : ""}`);
    else
      await window.loadFile(
        mainPage,
        dock ? { query: { dock: "1" } } : undefined,
      );
    window.show();
    window.focus();
  }

  private preferences() {
    return {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    };
  }

  async createMain() {
    if (this.main && !this.main.isDestroyed()) {
      this.showMain();
      return this.main;
    }
    const area = (
      screen
        .getAllDisplays()
        .find((display) => display.id === this.placement.main?.displayId) ??
      screen.getPrimaryDisplay()
    ).workArea;
    this.main = new BrowserWindow({
      width: Math.min(438, area.width),
      height: Math.min(910, Math.max(1, area.height - 32)),
      center: !this.placement.main,
      minWidth: Math.min(380, area.width),
      minHeight: Math.min(540, area.height),
      title: "Minto",
      icon: path.join(directory, "../../dist/minto-icon.png"),
      frame: false,
      backgroundColor: "#f7f6f2",
      show: false,
      autoHideMenuBar: true,
      alwaysOnTop: this.settings.mainOnTop,
      webPreferences: this.preferences(),
      ...(this.placement.main ? this.restored(this.placement.main) : {}),
    });
    if (this.placement.main?.maximized) this.main.maximize();
    this.track(this.main);
    this.main.on("close", (event) => {
      if (this.main) this.placement.main = this.capture(this.main);
      if (!this.quitting && this.dock?.isVisible()) {
        event.preventDefault();
        this.main?.hide();
      }
    });
    this.main.on("closed", () => {
      this.main = null;
    });
    await this.load(this.main);
    return this.main;
  }

  async showDock() {
    if (this.dock && !this.dock.isDestroyed()) {
      this.dock.show();
      return this.dock;
    }
    const area = screen.getDisplayMatching(
      this.main?.getBounds() ?? screen.getPrimaryDisplay().workArea,
    ).workArea;
    const { width, height } = dockLayout(
      this.settings.dockStyle,
      this.settings.dockExpanded,
    );
    this.dock = new BrowserWindow({
      ...fitBounds(
        {
          x: area.x + area.width - 360,
          y: area.y + area.height - height - 28,
          width,
          height,
        },
        area,
      ),
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: true,
      alwaysOnTop: this.settings.dockOnTop,
      title: "Minto — mini timer",
      icon: path.join(directory, "../../dist/minto-icon.png"),
      backgroundColor: "#f7f6f2",
      show: false,
      webPreferences: this.preferences(),
      ...(this.placement.dock
        ? this.restored({ ...this.placement.dock, width, height })
        : {}),
    });
    this.track(this.dock);
    this.dock.on("close", () => {
      if (!this.quitting) this.showMain();
    });
    this.dock.on("closed", () => {
      this.dock = null;
      this.changed();
    });
    await this.load(this.dock, true);
    this.changed();
    return this.dock;
  }

  showMain() {
    if (this.main?.isMinimized()) this.main.restore();
    this.main?.show();
    this.main?.focus();
  }

  applySettings(settings: Settings) {
    if (settings.mainOnTop !== this.settings.mainOnTop)
      this.main?.setAlwaysOnTop(settings.mainOnTop);
    if (settings.dockOnTop !== this.settings.dockOnTop)
      this.dock?.setAlwaysOnTop(settings.dockOnTop);
    if (
      this.dock &&
      (settings.dockStyle !== this.settings.dockStyle ||
        settings.dockExpanded !== this.settings.dockExpanded)
    ) {
      const bounds = this.dock.getBounds();
      const { width, height } = dockLayout(
        settings.dockStyle,
        settings.dockExpanded,
      );
      const area = screen.getDisplayMatching(bounds).workArea;
      this.dock.setBounds(fitBounds({ ...bounds, width, height }, area));
    }
    this.settings = { ...settings };
  }

  recoverBounds() {
    for (const window of [this.main, this.dock]) {
      if (window && !window.isMaximized()) {
        const bounds = window.getBounds();
        const area = screen.getDisplayMatching(bounds).workArea;
        if (window === this.main)
          window.setMinimumSize(
            Math.min(380, area.width),
            Math.min(540, area.height),
          );
        window.setBounds(fitBounds(bounds, area));
      }
    }
  }

  all() {
    return [this.main, this.dock].filter(
      (window): window is BrowserWindow => !!window && !window.isDestroyed(),
    );
  }
  beginQuit() {
    this.quitting = true;
    clearTimeout(this.saveTimer);
  }
}
