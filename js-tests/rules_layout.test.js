// The Rules module page in a real browser: the synthetic rules page
// (python -m capsule_viewer.rules fixture) must fit a phone, a desktop and a
// printed page with no horizontal overflow at every depth, and its L0 must fit
// one phone screen. Same headless Chromium driver and the same skip/fail rule
// as kit_layout.test.js: skipped locally with a warning when there is no
// Chromium, failed under CI.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChrome, launch } from "./headlessChrome.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEPTHS = ["L0", "L1", "L2"];
const VIEWPORTS = [
  { name: "phone-360", width: 360, media: "screen" },
  { name: "phone-390", width: 390, media: "screen" },
  { name: "desktop-1280", width: 1280, media: "screen" },
  { name: "print", width: 680, media: "print" },
];
// The emulated viewport height headlessChrome.js sets.
const SCREEN_HEIGHT = 900;

const chromePath = findChrome();
if (!chromePath && process.env.CI) {
  throw new Error("rules layout test: no Chromium found under CI; set CHROME_PATH");
}
if (!chromePath) {
  console.warn("SKIPPED rules_layout.test.js: no Chromium found (set CHROME_PATH to run it)");
}

// A platform status no wording pack knows, long and unbroken: shown raw, so it
// must wrap like any other text rather than push the page sideways.
const LONG_TOKEN = "example_platform_status_value_that_no_wording_pack_has_an_entry_for_and_never_breaks";

function buildPage(dir, depth, extra = []) {
  const args = ["-m", "capsule_viewer.rules", "fixture", "--depth", depth, ...extra];
  const html = execFileSync(process.env.PYTHON || "python3", args, {
    cwd: ROOT,
    env: { ...process.env, PYTHONPATH: join(ROOT, "src") },
    encoding: "utf8",
  });
  const file = join(dir, `rules-${depth}${extra.length ? "-" + extra[0].replace(/^--/, "") : ""}.html`);
  writeFileSync(file, html);
  return { html, url: pathToFileURL(file).href };
}

// Every element whose box leaves the viewport, or that scrolls its own
// content sideways; the three level regions and their heights; where L0 ends.
const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const overflow = [];
  for (const el of document.querySelectorAll(".cv-page *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const out = r.right > vw + 0.5 || r.left < -0.5;
    const inner = el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible";
    if (out || inner) {
      overflow.push("<" + el.tagName.toLowerCase() + " class='" + el.className + "'> left " +
        Math.round(r.left) + " right " + Math.round(r.right) + (inner ? " (scrolls inside)" : ""));
    }
  }
  const levels = {};
  for (const el of document.querySelectorAll("[data-level]")) levels[el.dataset.level] = el.getBoundingClientRect().height;
  const l0 = document.querySelector('[data-level="L0"]').getBoundingClientRect();
  return { vw, pageScrollWidth: document.documentElement.scrollWidth, overflow, levels, l0Bottom: l0.bottom,
    rules: document.querySelectorAll('[data-level="L1"] [data-rule]').length };
})()`;

describe.skipIf(!chromePath)("rules module layout (headless Chromium)", () => {
  let browser;
  let tab;
  let dir;
  const pages = {};

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cv-rules-fixture-"));
    for (const depth of DEPTHS) pages[depth] = buildPage(dir, depth);
    pages.unrecognized = buildPage(dir, "L2", ["--unrecognized", LONG_TOKEN]);
    pages.comparisonOnly = buildPage(dir, "L2", ["--without-legacy"]);
    browser = await launch(chromePath);
    if (browser.relaunchedAfter) console.warn("rules layout suite: Chromium needed a relaunch: " + browser.relaunchedAfter);
    tab = await browser.newPage();
  }, 150000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("the rules pages carry no script at all", () => {
    for (const depth of DEPTHS) expect(pages[depth].html.toLowerCase()).not.toContain("<script");
  });

  for (const depth of DEPTHS) {
    for (const vp of VIEWPORTS) {
      it(`depth ${depth} fits at ${vp.name} (${vp.width}px, ${vp.media}) with no horizontal overflow`, async () => {
        await tab.open(pages[depth].url, { width: vp.width, media: vp.media });
        const m = await tab.evaluate(MEASURE);
        expect(m.vw).toBe(vp.width);
        // Not vacuous: all three levels and all eight rules are on the page and laid out.
        expect(Object.keys(m.levels).sort()).toEqual(DEPTHS);
        for (const level of DEPTHS) expect(m.levels[level], level).toBeGreaterThan(0);
        expect(m.rules).toBe(8);
        expect(m.overflow).toEqual([]);
        expect(m.pageScrollWidth).toBeLessThanOrEqual(m.vw);
      }, 30000);
    }
  }

  for (const vp of VIEWPORTS) {
    it(`an unrecognized long token fits at ${vp.name}`, async () => {
      expect(pages.unrecognized.html).toContain(`data-unrecognized="${LONG_TOKEN}"`);
      await tab.open(pages.unrecognized.url, { width: vp.width, media: vp.media });
      const m = await tab.evaluate(MEASURE);
      expect(m.rules).toBe(8);
      expect(m.overflow).toEqual([]);
      expect(m.pageScrollWidth).toBeLessThanOrEqual(m.vw);
    }, 30000);
  }

  for (const width of [360, 390]) {
    it(`L0 fits one phone screen at ${width}px`, async () => {
      await tab.open(pages.L0.url, { width, media: "screen" });
      const m = await tab.evaluate(MEASURE);
      expect(m.l0Bottom).toBeGreaterThan(0);
      expect(m.l0Bottom).toBeLessThanOrEqual(SCREEN_HEIGHT);
    }, 30000);
  }

  for (const vp of VIEWPORTS) {
    it(`the comparison alone (no report/v1 record) fits at ${vp.name}`, async () => {
      expect(pages.comparisonOnly.html).not.toContain("data-legacy-row");
      await tab.open(pages.comparisonOnly.url, { width: vp.width, media: vp.media });
      const m = await tab.evaluate(MEASURE);
      expect(m.rules).toBe(8);
      expect(m.overflow).toEqual([]);
      expect(m.pageScrollWidth).toBeLessThanOrEqual(m.vw);
    }, 30000);
  }
});
