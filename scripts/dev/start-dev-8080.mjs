#!/usr/bin/env node
import { spawn, execSync } from "node:child_process";
import process from "node:process";

const PORT = 8080;
const ALLOWED_NAMES = ["node", "node.exe", "vite", "vite.exe", "bun", "bun.exe", "deno", "deno.exe"];
const PROJECT_MARKER = process.cwd().toLowerCase().replace(/\\/g, "/");
const FORCE_KILL = process.env.DEV_8080_FORCE_KILL === "1" || process.argv.includes("--force-kill");

function run(command) {
  return execSync(command, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    windowsHide: true,
  });
}

function getPortPidsWindows(port) {
  try {
    const out = run(`netstat -ano -p tcp | findstr :${port}`);
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const normalized = line.trim().replace(/\s+/g, " ");
      if (!normalized) continue;
      if (!normalized.includes("LISTENING")) continue;
      const parts = normalized.split(" ");
      const pid = parts[parts.length - 1];
      if (/^\d+$/.test(pid)) pids.add(pid);
    }
    return Array.from(pids);
  } catch {
    return [];
  }
}

function getProcessNameWindows(pid) {
  try {
    const out = run(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`).trim();
    if (!out || out.startsWith("INFO:")) return null;
    const firstCell = out.split(",")[0] ?? "";
    return firstCell.replace(/^"|"$/g, "").toLowerCase();
  } catch {
    return null;
  }
}

function killPidWindows(pid) {
  try {
    run(`taskkill /PID ${pid} /F`);
    return true;
  } catch {
    return false;
  }
}

function getProcessCommandLineWindows(pid) {
  try {
    const out = run(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\").CommandLine"`,
    ).trim();
    return out ? out.toLowerCase().replace(/\\/g, "/") : null;
  } catch {
    return null;
  }
}

function getPortPidsUnix(port) {
  try {
    const out = run(`lsof -ti tcp:${port}`);
    return Array.from(new Set(out.split(/\r?\n/).map((v) => v.trim()).filter((v) => /^\d+$/.test(v))));
  } catch {
    return [];
  }
}

function getProcessNameUnix(pid) {
  try {
    const out = run(`ps -p ${pid} -o comm=`).trim();
    if (!out) return null;
    return out.toLowerCase();
  } catch {
    return null;
  }
}

function killPidUnix(pid) {
  try {
    process.kill(Number(pid), "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

function getProcessCommandLineUnix(pid) {
  try {
    const out = run(`ps -p ${pid} -o args=`).trim();
    return out ? out.toLowerCase() : null;
  } catch {
    return null;
  }
}

function isKillSafe(name, commandLine) {
  const n = String(name || "").toLowerCase();
  const cmd = String(commandLine || "").toLowerCase().replace(/\\/g, "/");

  if (!ALLOWED_NAMES.includes(n)) return false;
  if (FORCE_KILL) return true;
  if (n === "vite" || n === "vite.exe") return true;

  // For generic runtimes, kill only if this project and vite dev context are present.
  const hasProjectMarker = cmd.includes(PROJECT_MARKER);
  const hasViteHint = cmd.includes("vite") || cmd.includes("npm run dev") || cmd.includes("--strictport");
  return hasProjectMarker && hasViteHint;
}

function startVite() {
  const command = `npm run dev -- --host --port ${PORT} --strictPort`;
  const child = process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", command], { stdio: "inherit", shell: false })
    : spawn("sh", ["-lc", command], { stdio: "inherit", shell: false });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

function main() {
  const isWin = process.platform === "win32";
  const pids = isWin ? getPortPidsWindows(PORT) : getPortPidsUnix(PORT);

  if (pids.length === 0) {
    startVite();
    return;
  }

  const unknown = [];
  const killable = [];

  for (const pid of pids) {
    const name = isWin ? getProcessNameWindows(pid) : getProcessNameUnix(pid);
    const commandLine = isWin ? getProcessCommandLineWindows(pid) : getProcessCommandLineUnix(pid);
    if (!name) {
      unknown.push({ pid, name: "unknown" });
      continue;
    }
    if (isKillSafe(name, commandLine)) killable.push({ pid, name });
    else unknown.push({ pid, name });
  }

  if (unknown.length > 0) {
    console.error(`[dev:8080] Port ${PORT} is busy by non-dev process(es):`);
    for (const p of unknown) {
      console.error(`  PID ${p.pid} (${p.name})`);
    }
    console.error("[dev:8080] Refusing to terminate unknown processes automatically.");
    console.error("[dev:8080] If this is expected, run with DEV_8080_FORCE_KILL=1 or pass --force-kill.");
    process.exit(1);
    return;
  }

  let killed = 0;
  for (const p of killable) {
    const ok = isWin ? killPidWindows(p.pid) : killPidUnix(p.pid);
    if (ok) {
      killed += 1;
      console.log(`[dev:8080] Stopped PID ${p.pid} (${p.name}) occupying port ${PORT}`);
    }
  }

  if (killed !== killable.length) {
    console.error(`[dev:8080] Could not terminate all dev processes on port ${PORT}.`);
    process.exit(1);
    return;
  }

  startVite();
}

main();
