// A minimal headless-Chromium driver over the DevTools protocol, using only
// what Node ships (child_process + the global WebSocket, Node >= 22). It
// exists so the kit's layout test can measure real layout -- jsdom has none --
// without adding a browser-automation dependency.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

export function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return CANDIDATES.find((p) => existsSync(p)) || null;
}

async function waitFor(predicate, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 50));
  }
}

export async function launch(chromePath) {
  const profile = mkdtempSync(join(tmpdir(), "cv-kit-chrome-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    "--user-data-dir=" + profile,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--hide-scrollbars",
    "about:blank",
  ];
  // GitHub's Ubuntu runners refuse Chromium's user-namespace sandbox.
  if (process.env.CI) args.unshift("--no-sandbox");
  const proc = spawn(chromePath, args, { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  const [port, path] = await waitFor(
    () => existsSync(portFile) && readFileSync(portFile, "utf8").trim().split("\n").length === 2 && readFileSync(portFile, "utf8").trim().split("\n"),
    20000,
    "DevToolsActivePort"
  );
  const ws = new WebSocket("ws://127.0.0.1:" + port + path);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      listeners.forEach((fn) => fn(msg));
    }
  });
  function send(method, params = {}, sessionId) {
    const id = nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  async function newPage() {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);
    await call("Page.enable");
    return {
      call,
      async open(url, { width, media = "screen", scripts = true }) {
        await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
        await call("Emulation.setEmulatedMedia", { media });
        await call("Emulation.setScriptExecutionDisabled", { value: !scripts });
        const loaded = new Promise((resolve) => {
          const fn = (msg) => {
            if (msg.sessionId === sessionId && msg.method === "Page.loadEventFired") {
              listeners.splice(listeners.indexOf(fn), 1);
              resolve();
            }
          };
          listeners.push(fn);
        });
        await call("Page.navigate", { url });
        await loaded;
      },
      // Evaluated by the protocol, not by the page: it works with the page's
      // own scripting disabled.
      async evaluate(expression) {
        const res = await call("Runtime.evaluate", { expression, returnByValue: true });
        if (res.exceptionDetails) throw new Error("evaluate failed: " + JSON.stringify(res.exceptionDetails));
        return res.result.value;
      },
      async click(x, y) {
        for (const type of ["mousePressed", "mouseReleased"]) {
          await call("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
        }
      },
    };
  }

  async function close() {
    try {
      await send("Browser.close");
    } catch {
      proc.kill();
    }
    ws.close();
    await new Promise((r) => (proc.exitCode === null ? proc.once("exit", r) : r()));
    rmSync(profile, { recursive: true, force: true });
  }

  return { newPage, close };
}
