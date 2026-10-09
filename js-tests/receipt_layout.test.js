// The receipt module's pages in a real browser: every receipt fixture, for its
// own audience, fully open (depth L2) and as it first opens (depth L0), must fit
// a phone, a desktop and a printed page with no horizontal overflow. The pages
// are the module's real output (python -m capsule_viewer.receipt ...).
//
// Without a Chromium the suite is SKIPPED locally with a warning, and FAILS
// under CI (process.env.CI) -- a missing browser must never read as a pass.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChrome, launch } from "./headlessChrome.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "tests", "testdata", "receipt");
const FIXTURES = [
  { name: "keep", audience: "keep" },
  { name: "counterparty", audience: "counterparty" },
  { name: "adjudicator", audience: "adjudicator" },
  { name: "golden-2", audience: "keep" },
];
const DEPTHS = ["L0", "L2"];
// The viewport height headlessChrome.js opens every page at.
const PHONE_HEIGHT = 900;
// 680: the printable width of an A4 or Letter page at default margins, laid
// out under emulated print media (this does not paginate).
const VIEWPORTS = [
  { name: "phone-360", width: 360, media: "screen" },
  { name: "phone-390", width: 390, media: "screen" },
  { name: "desktop-1280", width: 1280, media: "screen" },
  { name: "print", width: 680, media: "print" },
];

const chromePath = findChrome();
if (!chromePath && process.env.CI) {
  throw new Error("receipt layout test: no Chromium found under CI; set CHROME_PATH");
}
if (!chromePath) {
  console.warn("SKIPPED receipt_layout.test.js: no Chromium found (set CHROME_PATH to run it)");
}

function buildPage(dir, fx, depth) {
  const html = execFileSync(
    process.env.PYTHON || "python3",
    ["-m", "capsule_viewer.receipt", join(DATA, `${fx.name}.bundle.json`), join(DATA, `${fx.name}.verify.json`), fx.audience, depth],
    { cwd: ROOT, env: { ...process.env, PYTHONPATH: join(ROOT, "src") }, encoding: "utf8" },
  );
  const file = join(dir, `${fx.name}-${depth}.html`);
  writeFileSync(file, html);
  return { html, url: pathToFileURL(file).href };
}

// Every element whose box leaves the viewport, and any element that scrolls its
// own content sideways; plus what the page shows, so a blank page cannot pass.
const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const overflow = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const out = r.right > vw + 0.5 || r.left < -0.5;
    const inner = el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible";
    if (out || inner) overflow.push("<" + el.tagName.toLowerCase() + " class='" + el.className + "'> left " + Math.round(r.left) + " right " + Math.round(r.right) + (inner ? " (scrolls inside)" : ""));
  }
  const levels = ["L0", "L1", "L2"].map((l) => document.querySelector('[data-level="' + l + '"]'));
  const l0 = levels[0] && levels[0].getBoundingClientRect();
  return {
    vw,
    pageScrollWidth: document.documentElement.scrollWidth,
    overflow,
    levels: levels.map((e) => (e ? e.getBoundingClientRect().height : 0)),
    records: document.querySelectorAll("[data-record]").length,
    visibleRecords: [...document.querySelectorAll("[data-record]")].filter((e) => e.checkVisibility()).length,
    l0Bottom: l0 ? Math.round(l0.bottom) : null,
  };
})()`;

describe.skipIf(!chromePath)("receipt module layout (headless Chromium)", () => {
  let browser;
  let tab;
  let dir;
  const pages = {};

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cv-receipt-"));
    for (const fx of FIXTURES) for (const depth of DEPTHS) pages[`${fx.name}-${depth}`] = buildPage(dir, fx, depth);
    browser = await launch(chromePath);
    if (browser.relaunchedAfter) console.warn("receipt layout suite: Chromium needed a relaunch: " + browser.relaunchedAfter);
    tab = await browser.newPage();
  }, 150000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("no receipt page carries a script", () => {
    for (const page of Object.values(pages)) expect(page.html.toLowerCase()).not.toContain("<script");
  });

  for (const fx of FIXTURES) {
    for (const depth of DEPTHS) {
      for (const vp of VIEWPORTS) {
        it(`${fx.name} at ${depth} fits ${vp.name} (${vp.width}px, ${vp.media})`, async () => {
          await tab.open(pages[`${fx.name}-${depth}`].url, { width: vp.width, media: vp.media });
          const m = await tab.evaluate(MEASURE);
          expect(m.vw).toBe(vp.width);
          // Not vacuous: all three levels are laid out and every step is on the page.
          for (const h of m.levels) expect(h).toBeGreaterThan(0);
          expect(m.records).toBeGreaterThanOrEqual(5);
          // Fully open, or printed, every step is visible.
          if (depth === "L2" || vp.media === "print") expect(m.visibleRecords).toBe(m.records);
          expect(m.overflow).toEqual([]);
          expect(m.pageScrollWidth).toBeLessThanOrEqual(m.vw);
          // L0 is one screen at a phone's width: it ends inside the 900px-tall viewport.
          if (vp.media === "screen" && vp.width <= 390) expect(m.l0Bottom).toBeLessThanOrEqual(PHONE_HEIGHT);
        }, 30000);
      }
    }
  }

  // Both halves of "prints": a page opened at L0 has its steps closed on screen
  // and printed in full.
  it("an L0 page hides its steps on screen and prints them", async () => {
    await tab.open(pages["keep-L0"].url, { width: 390, media: "screen" });
    const screen = await tab.evaluate(MEASURE);
    expect(screen.visibleRecords).toBe(0);
    await tab.open(pages["keep-L0"].url, { width: 680, media: "print" });
    const printed = await tab.evaluate(MEASURE);
    expect(printed.visibleRecords).toBe(printed.records);
  }, 30000);
});
