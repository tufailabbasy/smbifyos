const { spawn } = require("node:child_process");
const path = require("node:path");

const restartDelayMs = Math.max(500, Number(process.env.DEV_SERVER_RESTART_DELAY_MS || 2000));
const tsxCliPath = path.resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.cjs");
const watchModeFlag = String(process.env.DEV_SERVER_USE_WATCH || "1").trim().toLowerCase();
const useWatchMode = !["0", "false", "no", "off"].includes(watchModeFlag);

let child = null;
let shuttingDown = false;
let restartTimer = null;

function clearRestartTimer() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
}

function stopAndExit(code) {
  shuttingDown = true;
  clearRestartTimer();

  if (child && !child.killed) {
    child.kill("SIGTERM");
  }

  process.exit(code);
}

function scheduleRestart(reason) {
  if (shuttingDown) {
    return;
  }

  clearRestartTimer();
  console.error(`[dev-supervisor] ${reason} Restarting API in ${restartDelayMs}ms...`);

  restartTimer = setTimeout(() => {
    restartTimer = null;
    startServer();
  }, restartDelayMs);
}

function startServer() {
  if (shuttingDown) {
    return;
  }

  const sanitizedEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      sanitizedEnv[key] = value;
    }
  }

  const tsxArgs = useWatchMode ? [tsxCliPath, "watch", "server/index.ts"] : [tsxCliPath, "server/index.ts"];

  child = spawn(process.execPath, tsxArgs, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: sanitizedEnv,
  });

  child.once("error", (error) => {
    scheduleRestart(`Failed to launch API process: ${error.message}.`);
  });

  child.once("exit", (code, signal) => {
    const expectedShutdown = shuttingDown || signal === "SIGTERM" || signal === "SIGINT";
    child = null;

    if (expectedShutdown) {
      return;
    }

    scheduleRestart(`API process exited (code=${code}, signal=${signal || "none"}).`);
  });
}

process.on("SIGINT", () => stopAndExit(0));
process.on("SIGTERM", () => stopAndExit(0));

startServer();
