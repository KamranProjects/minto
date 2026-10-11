import { spawn } from "node:child_process";
import { createServer } from "vite";
import electron from "electron";

const compile = spawn(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.electron.json"],
  { stdio: "inherit" },
);
const code = await new Promise((resolve) => compile.on("exit", resolve));
if (code !== 0) process.exit(1);
await import("./copy-preload.mjs");

const devUrl = "http://127.0.0.1:5173";
let server;
let ownsServer = false;

try {
  server = await createServer();
  await server.listen();
  ownsServer = true;
  server.printUrls();
} catch (error) {
  const portInUse =
    error &&
    typeof error === "object" &&
    ("code" in error
      ? error.code === "EADDRINUSE"
      : error instanceof Error &&
        /port 5173 is already in use/i.test(error.message));
  if (!portInUse) throw error;

  // A separately started `npm run dev:web` is a valid companion to Electron.
  // Reuse it, but only after confirming it serves this project's app shell.
  const response = await fetch(devUrl, { signal: AbortSignal.timeout(3000) });
  const html = await response.text();
  if (!response.ok || !html.includes("<title>Minto</title>")) {
    throw new Error(
      `Port 5173 is already in use by a different app. Stop that process or set it aside before running npm run dev.`,
    );
  }
  console.log(
    "Reusing the existing Minto Vite server at http://127.0.0.1:5173",
  );
}

const env = { ...process.env, COZY_DEV_URL: "http://127.0.0.1:5173" };
delete env.ELECTRON_RUN_AS_NODE;
const desktop = spawn(electron, ["."], {
  stdio: "inherit",
  env,
  // Electron is the interactive app, so do not launch it with SW_HIDE on Windows.
  windowsHide: false,
});
desktop.once("spawn", () => {
  console.log("Electron process started; waiting for its desktop window…");
});
desktop.on("error", (error) => {
  console.error("Electron could not be launched:", error.message);
  void stop();
  process.exitCode = 1;
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  desktop.kill();
  if (ownsServer) await server.close();
}
desktop.on("exit", async (code) => {
  if (!stopping && code && code !== 0)
    console.error(`Electron exited unexpectedly with code ${code}.`);
  await stop();
  process.exit(code ?? 0);
});
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
