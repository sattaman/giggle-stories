import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import net from "node:net";

const root = fileURLToPath(new URL("..", import.meta.url));
const serverPort = 8787;
const preferredWebPort = 8082;
const children = new Map();
let stopping = false;

function portIsFree(port, host) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE") resolve(false);
      else reject(error);
    });
    probe.listen({ port, host, exclusive: true }, () => probe.close(() => resolve(true)));
  });
}

async function checkPort(port) {
  // Expo may bind IPv6 while Fastify binds IPv4. Check both families.
  const free = (await portIsFree(port, "127.0.0.1")) && (await portIsFree(port, "::1"));
  return free;
}

async function chooseWebPort() {
  for (let port = preferredWebPort; port <= preferredWebPort + 8; port++) {
    if (await checkPort(port)) return port;
  }
  throw new Error(`No free web port found from ${preferredWebPort} to ${preferredWebPort + 8}.`);
}

function launch(name, executable, args, cwd) {
  const child = spawn(executable, args, { cwd, stdio: "inherit", detached: true, env: process.env });
  children.set(name, child);
  child.once("error", (error) => {
    console.error(`${name} could not start:`, error);
    void shutdown(1);
  });
  child.once("exit", (code, signal) => {
    children.delete(name);
    if (!stopping) {
      console.error(`${name} exited (${signal ?? code ?? "unknown"}).`);
      void shutdown(code === 0 ? 0 : 1);
    }
  });
  return child;
}

function signalGroup(child, signal) {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") console.error(`Could not signal process ${child.pid}:`, error);
  }
}

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) signalGroup(child, "SIGINT");
  // The API drains the current graph step before exiting (up to 60 seconds).
  const deadline = Date.now() + 70_000;
  while (children.size > 0 && Date.now() < deadline) await delay(100);
  process.exit(exitCode);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

if (!existsSync(join(root, "node_modules", ".bin", "tsx")) || !existsSync(join(root, "packages", "client", "node_modules", ".bin", "expo"))) {
  console.error("Dependencies are missing. Run pnpm install first.");
  process.exit(1);
}

try {
  if (!(await checkPort(serverPort))) {
    console.error(`The API port ${serverPort} is already in use. Check it with: lsof -nP -iTCP:${serverPort} -sTCP:LISTEN`);
    process.exit(1);
  }
  const webPort = await chooseWebPort();
  if (webPort !== preferredWebPort) console.log(`Port ${preferredWebPort} is in use; using ${webPort} for the web app.`);

  console.log("Starting Storytime API on http://localhost:8787 …");
  launch("API", join(root, "node_modules", ".bin", "tsx"), ["src/main.ts"], join(root, "packages", "server"));

  const deadline = Date.now() + 90_000;
  let ready = false;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${serverPort}/v1/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Voice and graph setup may still be in progress.
    }
    await delay(500);
  }
  if (!stopping && !ready) {
    console.error("The API did not become ready within 90 seconds.");
    await shutdown(1);
  }
  if (!stopping) {
    console.log("Starting web app at http://localhost:8082 …");
    launch("Web app", join(root, "packages", "client", "node_modules", ".bin", "expo"), ["start", "--web", "--port", String(webPort)], join(root, "packages", "client"));
  }
} catch (error) {
  console.error(error);
  await shutdown(1);
}
