import { randomUUID } from "node:crypto";
import {
  applyCommand,
  checkpoint,
  validateDesktop,
} from "../src/shared/engine.js";
import { createState, getCurrent, remainingFor } from "../src/shared/model.js";
import type {
  CommandResult,
  FocusState,
  Snapshot,
  DesktopState,
  Task,
} from "../src/shared/model.js";
import type { Repository } from "./repository.js";

/** Serialize commands from both windows and acknowledge only durable changes. */
export class FocusService {
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(snapshot: Snapshot) => void>();
  private storageError: string | null = null;

  constructor(
    private state: FocusState,
    private repository: Repository,
    private now: () => number,
    private recoveryMessage: string | null = null,
    private makeId = randomUUID as () => string,
  ) {}

  snapshot(): Snapshot {
    return {
      state: structuredClone(this.state),
      now: this.now(),
      storageError: this.storageError,
      recoveryMessage: this.recoveryMessage,
    };
  }

  subscribe(listener: (snapshot: Snapshot) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  broadcast() {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async commit(next: FocusState): Promise<CommandResult> {
    try {
      await this.repository.save(next);
      this.state = next;
      this.storageError = null;
      this.recoveryMessage = null;
      this.broadcast();
      return { ok: true };
    } catch {
      this.storageError =
        "Could not save to disk. Changes were not applied. Check free space and folder access, then try again.";
      this.broadcast();
      return { ok: false, error: this.storageError };
    }
  }

  dispatch(command: unknown): Promise<CommandResult> {
    return this.enqueue(async () => {
      try {
        return await this.commit(
          applyCommand(this.state, command, this.now(), this.makeId),
        );
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not apply that action.",
        };
      }
    });
  }

  resetAll(): Promise<CommandResult> {
    return this.enqueue(async () => {
      const next = createState(this.now());
      next.revision = this.state.revision + 1;
      try {
        if (!this.repository.reset) throw new Error("Reset is unavailable.");
        await this.repository.reset(next);
        this.state = next;
        this.storageError = null;
        this.recoveryMessage = null;
        this.broadcast();
        return { ok: true };
      } catch {
        this.storageError =
          "Could not clear the saved data. Your current list is still open; check folder access and try again.";
        this.broadcast();
        return { ok: false, error: this.storageError };
      }
    });
  }

  saveCheckpoint(): Promise<CommandResult> {
    return this.enqueue(async () => {
      if (this.state.timer.startedAt === null) return { ok: true };
      const next = checkpoint(this.state, this.now());
      next.revision += 1;
      return this.commit(next);
    });
  }

  saveDesktop(desktop: DesktopState): Promise<CommandResult> {
    return this.enqueue(async () => {
      const next = checkpoint(this.state, this.now());
      next.desktop = validateDesktop(desktop);
      next.revision += 1;
      return this.commit(next);
    });
  }

  /** Claim the alert durably before emitting a single native side effect. */
  checkTimeUp(
    onAlert: (task: Task, snapshot: Snapshot) => void,
  ): Promise<void> {
    return this.enqueue(async () => {
      const now = this.now();
      const task = getCurrent(this.state);
      if (
        !task ||
        task.alert !== null ||
        remainingFor(this.state, task, now) > 0
      )
        return;
      const next = applyCommand(
        this.state,
        { type: "timer.expire" },
        now,
        this.makeId,
      );
      if ((await this.commit(next)).ok)
        onAlert(getCurrent(next)!, this.snapshot());
    });
  }

  /** Sleep/quit must stop time even if the disk has just become unavailable. */
  pauseForLifecycle(): Promise<CommandResult> {
    const pausedAt = this.now();
    return this.enqueue(async () => {
      const next = applyCommand(
        this.state,
        { type: "timer.pause" },
        pausedAt,
        this.makeId,
      );
      const result = await this.commit(next);
      if (!result.ok) {
        this.state = next;
        this.broadcast();
      }
      return result;
    });
  }
}
