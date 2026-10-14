// Screenshot goldens for the consumer modules, at a phone (390px) and a
// desktop (1280px) width, with every toggle closed and with every toggle
// opened: the Rules page (verified, and failed), the unilateral receipt (the
// owner's keep copy and the counterparty copy) and the bilateral receipt (keep
// and counterparty). The pages are the modules' real output.
//
// The PNGs in tests/goldens/ are review images: a reviewer opens the 390px one
// and sees L0 without scrolling. Fonts differ between machines, so this suite
// does not compare pixels. It checks, in a real browser, what the goldens are
// meant to show -- one level of details, L0 and the verification state on the
// first phone screen, the PRIVATE banner on the keep copy's first screen and on
// no other copy -- and that a golden is committed for every page, width and
// toggle state, at that width. Regenerate them with
//   UPDATE_GOLDENS=1 npx vitest run js-tests/goldens.test.js
//
// Same skip/fail rule as the layout suites: skipped locally with a warning when
// there is no Chromium, failed under CI.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLOSE_TIMEOUT_MS, findChrome, launch } from "./headlessChrome.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GOLDENS = join(ROOT, "tests", "goldens");
const RECEIPTS = join(ROOT, "tests", "testdata", "receipt");
const UPDATE = process.env.UPDATE_GOLDENS === "1";
// The viewport height headlessChrome.js opens every page at.
const SCREEN_HEIGHT = 900;
const WIDTHS = [390, 1280];
const STATES = ["closed", "open"];

const receipt = (name, audience) => ["-m", "capsule_viewer.receipt", join(RECEIPTS, `${name}.bundle.json`), join(RECEIPTS, `${name}.verify.json`), audience, "L0"];
// keep: the owner's copy (PRIVATE banner). verified: false is a page that did
// not verify (no L0, no toggles). oneScreen: false is a two-copy page, whose L0
// holds both headlines and is not held to one phone screen.
const PAGES = [
  { name: "rules-verified", args: ["-m", "capsule_viewer.rules", "fixture"] },
  { name: "rules-failed", args: ["-m", "capsule_viewer.rules", "fixture", "--failed"], verified: false },
  { name: "receipt-keep", args: receipt("keep", "keep"), keep: true },
  { name: "receipt-counterparty", args: receipt("counterparty", "counterparty") },
  { name: "receipt-bilateral-keep", args: receipt("bilateral-keep", "keep"), keep: true, oneScreen: false },
  { name: "receipt-bilateral-counterparty", args: receipt("bilateral-counterparty", "counterparty"), oneScreen: false },
];

const chromePath = findChrome();
if (!chromePath && process.env.CI) {
  throw new Error("golden test: no Chromium found under CI; set CHROME_PATH");
}
if (!chromePath) {
  console.warn("SKIPPED goldens.test.js: no Chromium found (set CHROME_PATH to run it)");
}

const OPEN_ALL = `document.querySelectorAll("details").forEach((d) => { d.open = true; }); document.querySelectorAll("details").length`;

const MEASURE = `(() => {
  const box = (el) => (el && el.checkVisibility() ? el.getBoundingClientRect() : null);
  const l0 = box(document.querySelector('[data-level="L0"]'));
  const outcome = box(document.querySelector(".cv-verification__outcome"));
  const banner = document.querySelector('[data-banner="private"]');
  const details = [...document.querySelectorAll("details")];
  return {
    nested: document.querySelectorAll("details details").length,
    details: details.length,
    open: details.filter((d) => d.open).length,
    l0Bottom: l0 ? l0.bottom : null,
    outcomeBottom: outcome ? outcome.bottom : null,
    banners: document.querySelectorAll('[data-banner="private"]').length,
    bannerBottom: box(banner) ? box(banner).bottom : null,
    bannerInDetails: banner ? banner.closest("details") !== null : null,
    records: document.querySelectorAll("[data-record]").length,
    visibleRecords: [...document.querySelectorAll("[data-record]")].filter((e) => e.checkVisibility()).length,
  };
})()`;

// Width and height from a PNG's IHDR chunk.
function pngSize(buf) {
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe.skipIf(!chromePath)("consumer goldens (headless Chromium)", () => {
  let browser;
  let tab;
  let dir;
  const urls = {};

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cv-goldens-"));
    for (const page of PAGES) {
      const html = execFileSync(process.env.PYTHON || "python3", page.args, {
        cwd: ROOT,
        env: { ...process.env, PYTHONPATH: join(ROOT, "src") },
        encoding: "utf8",
      });
      const file = join(dir, `${page.name}.html`);
      writeFileSync(file, html);
      urls[page.name] = pathToFileURL(file).href;
    }
    if (UPDATE) mkdirSync(GOLDENS, { recursive: true });
    browser = await launch(chromePath);
    if (browser.relaunchedAfter) console.warn("golden suite: Chromium needed a relaunch: " + browser.relaunchedAfter);
    tab = await browser.newPage();
  }, 150000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }, CLOSE_TIMEOUT_MS);

  for (const page of PAGES) {
    for (const width of WIDTHS) {
      for (const state of STATES) {
        const golden = `${page.name}-${width}-${state}.png`;
        it(`${golden}`, async () => {
          await tab.open(urls[page.name], { width, media: "screen" });
          if (state === "open") await tab.evaluate(OPEN_ALL);
          const m = await tab.evaluate(MEASURE);

          // One level of details, and the toggles in the state named.
          expect(m.nested).toBe(0);
          if (page.verified === false) {
            expect(m.details).toBe(0);
            expect(m.l0Bottom).toBeNull();
          } else {
            expect(m.details).toBeGreaterThanOrEqual(2);
            expect(m.open).toBe(state === "open" ? m.details : 0);
            expect(m.l0Bottom).toBeGreaterThan(0);
          }
          // The verification state is on the first screen at every width.
          expect(m.outcomeBottom).toBeGreaterThan(0);
          expect(m.outcomeBottom).toBeLessThanOrEqual(SCREEN_HEIGHT);
          // L0 is the first phone screen, without scrolling.
          if (width === 390 && page.verified !== false && page.oneScreen !== false) expect(m.l0Bottom).toBeLessThanOrEqual(SCREEN_HEIGHT);
          // The PRIVATE banner: on the keep copy's first screen, outside every
          // toggle; on no other copy.
          if (page.keep) {
            expect(m.banners).toBe(1);
            expect(m.bannerInDetails).toBe(false);
            expect(m.bannerBottom).toBeGreaterThan(0);
            expect(m.bannerBottom).toBeLessThanOrEqual(SCREEN_HEIGHT);
          } else {
            expect(m.banners).toBe(0);
          }
          // Opened, every step of a receipt is on the page; closed, none is.
          if (m.records) expect(m.visibleRecords).toBe(state === "open" ? m.records : 0);

          const shot = await tab.screenshot();
          expect(pngSize(shot).width).toBe(width);
          const path = join(GOLDENS, golden);
          if (UPDATE) writeFileSync(path, shot);
          expect(existsSync(path), `golden ${golden} is not committed; run with UPDATE_GOLDENS=1`).toBe(true);
          expect(pngSize(readFileSync(path)).width).toBe(width);
        }, 30000);
      }
    }
  }

  // Not in this change: the fourth consumer state. Skipped, loudly, until the
  // viewer can show it.
  it.skip("TODO, NOT TESTED: the 'unable to verify in this viewer' 390px golden -- that state does not exist in this viewer yet; added with the WebCrypto-fallback change", () => {});
});
