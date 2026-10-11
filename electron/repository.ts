import {
  mkdir,
  readFile,
  rename,
  writeFile,
  copyFile,
  stat,
  readdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { createState } from "../src/shared/model.js";
import type { FocusState } from "../src/shared/model.js";
import { validateState, recoverState } from "../src/shared/engine.js";

export interface Repository {
  load(now: number): Promise<{ state: FocusState; message: string | null }>;
  save(state: FocusState): Promise<void>;
  reset?(state: FocusState): Promise<void>;
}

export class FileRepository implements Repository {
  readonly file: string;
  private knownGood: string | null = null;

  constructor(readonly directory: string) {
    this.file = path.join(directory, "focus.json");
  }

  private async read(file: string): Promise<FocusState> {
    if ((await stat(file)).size > 20 * 1024 * 1024)
      throw new Error("The saved file is too large.");
    return validateState(JSON.parse(await readFile(file, "utf8")));
  }

  async load(now: number) {
    await mkdir(this.directory, { recursive: true });
    try {
      const state = await this.read(this.file);
      this.knownGood = JSON.stringify(state, null, 2);
      return {
        state: recoverState(state),
        message:
          state.timer.startedAt === null
            ? null
            : "Your timer was paused when the app reopened.",
      };
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      try {
        const state = await this.read(`${this.file}.bak`);
        this.knownGood = JSON.stringify(state, null, 2);
        if (!missing) await copyFile(this.file, `${this.file}.damaged-${now}`);
        return {
          state: recoverState(state),
          message:
            "Your list was recovered from its backup. The original file has been preserved.",
        };
      } catch (backupError) {
        if (missing && (backupError as NodeJS.ErrnoException).code === "ENOENT")
          return { state: createState(now), message: null };
        // Refuse to overwrite unreadable data. The startup dialog points to its folder.
        throw new Error(
          `Could not read your tasks. Your saved files are untouched in ${this.directory}.`,
          { cause: error },
        );
      }
    }
  }

  async save(state: FocusState): Promise<void> {
    const data = JSON.stringify(validateState(state), null, 2);
    if (Buffer.byteLength(data, "utf8") > 20 * 1024 * 1024)
      throw new Error("The saved history exceeds the supported file size.");
    await mkdir(this.directory, { recursive: true });
    if (this.knownGood !== null) {
      await writeFile(`${this.file}.bak.tmp`, this.knownGood, {
        encoding: "utf8",
        flush: true,
      });
      await rename(`${this.file}.bak.tmp`, `${this.file}.bak`);
    }
    await writeFile(`${this.file}.tmp`, data, {
      encoding: "utf8",
      flush: true,
    });
    await rename(`${this.file}.tmp`, this.file);
    this.knownGood = data;
  }

  async reset(state: FocusState): Promise<void> {
    const data = JSON.stringify(validateState(state), null, 2);
    await mkdir(this.directory, { recursive: true });
    // Remove recovery remnants first; a failure still leaves the current primary intact.
    for (const name of await readdir(this.directory)) {
      if (name.startsWith("focus.json.damaged-"))
        await unlink(path.join(this.directory, name));
    }
    // Replace both recovery copies so a later damaged primary cannot revive old data.
    await writeFile(`${this.file}.bak.tmp`, data, {
      encoding: "utf8",
      flush: true,
    });
    await writeFile(`${this.file}.tmp`, data, {
      encoding: "utf8",
      flush: true,
    });
    await rename(`${this.file}.bak.tmp`, `${this.file}.bak`);
    await rename(`${this.file}.tmp`, this.file);
    this.knownGood = data;
  }
}
