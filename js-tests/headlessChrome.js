// A minimal headless-Chromium driver over the DevTools protocol, using only
// what Node ships (child_process + the global WebSocket, Node >= 22). It
// exists so the kit's layout test can measure real layout -- jsdom has none --
// without adding a browser-automation dependency.
//
// Lifecycle: launch() owns the Chromium process and its temporary profile.
// If launch fails part-way it kills the process and removes the profile before
// rethrowing; close() waits for the process to exit (SIGTERM, then SIGKILL,
// only if Browser.close has not ended it within the grace period) and only
// then removes the profile. A protocol call that gets no answer
// rejects after REQUEST_TIMEOUT_MS, and every pending call rejects at once if
// the browser exits or the socket closes, so a dead browser fails a test fast
// instead of hanging it.
//
// Startup: Chromium's stderr is kept (the last STDERR_TAIL_BYTES) and quoted
// in any startup error, so a CI failure says why the browser did not come up.
// A failed start is retried ONCE with a fresh profile; the first failure is
// printed (console.warn) and returned on the browser as `relaunchedAfter`, so
// a pass that needed the retry is visible, never silent.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// CI runners can be slow to bring Chromium up on a cold image.
const STARTUP_TIMEOUT_MS = process.env.CI ? 60000 : 20000;
const STDERR_TAIL_BYTES = 4000;
const REQUEST_TIMEOUT_MS = 15000;
const EXIT_GRACE_MS = 5000;

const CANDIDATES = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

export function findChrome() {
  // An explicit CHROME_PATH is the only candidate when set: a wrong one means
  // "no Chromium", never a silent fallback to another browser.
  if (process.env.CHROME_PATH) return existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  return CANDIDATES.find((p) => existsSync(p)) || null;
}

function readPortFile(portFile) {
  if (!existsSync(portFile)) return null;
  const lines = readFileSync(portFile, "utf8").trim().split("\n");
  return lines.length === 2 ? lines : null;
}

export async function launch(chromePath) {
  let first;
  try {
    return await launchOnce(chromePath);
  } catch (err) {
    first = err;
  }
  console.warn("headless Chromium failed to start; relaunching once with a fresh profile.\nFirst attempt: " + first.message);
  try {
    const browser = await launchOnce(chromePath);
    browser.relaunchedAfter = first.message;
    return browser;
  } catch (second) {
    throw new Error("headless Chromium failed to start twice.\nFirst attempt: " + first.message + "\nSecond attempt: " + second.message);
  }
}

async function launchOnce(chromePath) {
  const profile = mkdtempSync(join(tmpdir(), "cv-kit-chrome-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    "--user-data-dir=" + profile,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    // /dev/shm is small in containers and on some runners; use /tmp instead.
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "about:blank",
  ];
  // GitHub's Ubuntu runners refuse Chromium's user-namespace sandbox.
  if (process.env.CI) args.unshift("--no-sandbox");

  const proc = spawn(chromePath, args, { stdio: ["ignore", "ignore", "pipe"] });
  // Read continuously (an unread pipe would block Chromium), keep only the tail.
  let stderrTail = "";
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (chunk) => {
    stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_BYTES);
  });
  const withStderr = (message) =>
    message + (stderrTail.trim() ? "\n--- Chromium stderr (tail) ---\n" + stderrTail.trimEnd() : "\n(Chromium wrote nothing to stderr)");
  let gone = null; // why the browser is no longer usable, once it is not
  const exited = new Promise((resolve) => proc.once("exit", resolve));
  proc.once("error", (err) => (gone = gone || "could not start " + chromePath + ": " + err.message));
  proc.once("exit", (code, signal) => (gone = gone || "browser exited (code " + code + ", signal " + signal + ")"));

  let ws = null;
  const pending = new Map();
  const listeners = [];
  function failPending(reason) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error(reason));
    }
    pending.clear();
  }
  proc.once("exit", () => failPending(gone));

  async function shutdown() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        await send("Browser.close");
      } catch {
        // falls through to the kill below
      }
    }
    if (ws) ws.close();
    // Let Browser.close finish the shutdown it started; escalate only if the
    // process is still alive after the grace period. Always wait for the exit:
    // Chromium writes into its profile until it is gone, and removing the
    // directory under it fails with ENOTEMPTY.
    const term = setTimeout(() => proc.kill(), EXIT_GRACE_MS);
    const kill = setTimeout(() => proc.kill("SIGKILL"), 2 * EXIT_GRACE_MS);
    if (proc.exitCode === null && proc.signalCode === null) await exited;
    clearTimeout(term);
    clearTimeout(kill);
    // A helper process can still be flushing a file for a moment after the
    // main process exits; retry rather than fail the suite on teardown.
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }

  let nextId = 1;
  function send(method, params = {}, sessionId) {
    if (gone) return Promise.reject(new Error(gone));
    const id = nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(method + ": no answer within " + REQUEST_TIMEOUT_MS + "ms"));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify(payload));
    });
  }

  try {
    const portFile = join(profile, "DevToolsActivePort");
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    let lines = null;
    while (!(lines = readPortFile(portFile))) {
      if (gone) throw new Error(gone);
      if (Date.now() > deadline) throw new Error("browser did not open a debugging port within " + STARTUP_TIMEOUT_MS + "ms");
      await new Promise((r) => setTimeout(r, 50));
    }
    ws = new WebSocket("ws://127.0.0.1:" + lines[0] + lines[1]);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("could not connect to the browser")), { once: true });
    });
  } catch (err) {
    await shutdown();
    throw new Error(withStderr(err.message));
  }

  ws.addEventListener("close", () => {
    gone = gone || "browser connection closed";
    failPending(gone);
  });
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      clearTimeout(timer);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      listeners.slice().forEach((fn) => fn(msg));
    }
  });

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
        let onEvent;
        const loaded = new Promise((resolve) => {
          onEvent = (msg) => {
            if (msg.sessionId === sessionId && msg.method === "Page.loadEventFired") resolve();
          };
          listeners.push(onEvent);
        });
        try {
          const nav = await call("Page.navigate", { url });
          if (nav.errorText) throw new Error("navigation to " + url + " failed: " + nav.errorText);
          let timer;
          const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("load of " + url + " did not finish")), REQUEST_TIMEOUT_MS);
          });
          await Promise.race([loaded, timeout]).finally(() => clearTimeout(timer));
        } finally {
          listeners.splice(listeners.indexOf(onEvent), 1);
        }
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

  return { newPage, close: shutdown };
}
