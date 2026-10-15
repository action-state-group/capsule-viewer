// The evidence report and ledger pages opened with the network disabled. Each
// frozen page (tests/testdata/evidence-report/*/page.html, the pages
// capsule-emit drew before the report moved here, and
// tests/testdata/ledger/*/page.html) is opened in headless Chromium emulating
// an offline network. The page must make no request but its own file, run no
// script, log no error or Content-Security-Policy violation, and still show
// its verdict. Same skip/fail rule as kit_layout.test.js: skipped locally with
// a warning when there is no Chromium, failed under CI.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLOSE_TIMEOUT_MS, findChrome, launch } from "./headlessChrome.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TESTDATA = join(ROOT, "tests", "testdata");

function pages(dir) {
  return readdirSync(join(TESTDATA, dir), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: `${dir}/${d.name}`, file: join(TESTDATA, dir, d.name, "page.html") }));
}

const PAGES = [...pages("evidence-report"), ...pages("ledger")];

// What each page shows as its verdict, read from its own markup: the report's
// verdict class, or the ledger page's verification outcome.
function verdictOf(html) {
  const report = html.match(/<div class="verdict ([a-z]+)">/);
  if (report) return ".verdict." + report[1];
  const outcome = html.match(/data-outcome="([a-z_]+)"/);
  return `[data-outcome="${outcome[1]}"]`;
}

const chromePath = findChrome();
if (!chromePath && process.env.CI) {
  throw new Error("offline pages test: no Chromium found under CI; set CHROME_PATH");
}
if (!chromePath) {
  console.warn("SKIPPED offline_pages.test.js: no Chromium found (set CHROME_PATH to run it)");
}

describe.skipIf(!chromePath)("the report and ledger pages offline", () => {
  let browser;
  let tab;
  const events = [];

  beforeAll(async () => {
    browser = await launch(chromePath);
    if (browser.relaunchedAfter) console.warn("offline pages suite: Chromium needed a relaunch: " + browser.relaunchedAfter);
    tab = await browser.newPage();
    tab.onEvent((msg) => events.push(msg));
    await tab.call("Network.enable");
    await tab.call("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await tab.call("Log.enable");
    await tab.call("Runtime.enable");
  }, 90000);

  afterAll(async () => {
    if (browser) await browser.close();
  }, CLOSE_TIMEOUT_MS);

  it("there are pages of every verdict to open", () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(14);
  });

  it("a page that fetches is caught (negative control)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cv-offline-"));
    try {
      const file = join(dir, "fetches.html");
      writeFileSync(file, '<!doctype html><link rel="stylesheet" href="https://example.invalid/x.css"><p>x</p>');
      events.length = 0;
      await tab.open(pathToFileURL(file).href, { width: 1280 });
      const requested = events.filter((e) => e.method === "Network.requestWillBeSent").map((e) => e.params.request.url);
      expect(requested).toContain("https://example.invalid/x.css");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  for (const page of PAGES) {
    it(`${page.name} renders offline and asks for nothing`, async () => {
      const html = readFileSync(page.file, "utf8");
      const url = pathToFileURL(page.file).href;
      events.length = 0;
      await tab.open(url, { width: 1280 });
      const requested = events.filter((e) => e.method === "Network.requestWillBeSent").map((e) => e.params.request.url);
      expect(requested).toEqual([url]);
      const logged = events
        .filter((e) => e.method === "Log.entryAdded" || e.method === "Runtime.exceptionThrown" || e.method === "Runtime.consoleAPICalled")
        .map((e) => JSON.stringify(e.params));
      expect(logged).toEqual([]);
      const selector = verdictOf(html);
      const shown = await tab.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        return { verdict: el ? el.innerText.trim().length > 0 : false, scripts: document.scripts.length,
                 text: document.body.innerText.length };
      })()`);
      expect(shown).toEqual({ verdict: true, scripts: 0, text: shown.text });
      expect(shown.text).toBeGreaterThan(200);
    });
  }
});
