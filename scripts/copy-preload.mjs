import { copyFile } from "node:fs/promises";
await copyFile(
  new URL("../electron/preload.cjs", import.meta.url),
  new URL("../dist-electron/electron/preload.cjs", import.meta.url),
);
