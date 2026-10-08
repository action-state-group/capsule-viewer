// The component kit in a real browser: every component on the fixture page
// (python -m capsule_viewer.kit fixture) must fit a phone, a desktop and a
// printed page with no horizontal overflow, and the Drilldown must open with
// the page's scripting disabled. jsdom has no layout engine, so this drives
// headless Chromium over the DevTools protocol (headlessChrome.js).
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
const COMPONENTS = [
  "section",
  "metric-grid",
  "data-table",
  "calendar-grid",
  "disclosure-badge",
  "verdict-pill",
  "citation-list",
  "drilldown",
  "evidence-details",
  "verification-details",
  "party-card",
  "timeline",
];
// 360 and 390: small and common phones. 680: the printable width of an A4 or
// Letter page at default margins, laid out under print media.
// `phone`: whether the primitives must be in their phone layout (stacked
// table rows, one metric column). Print sits near the table's threshold, so
// only its overflow is asserted.
const VIEWPORTS = [
  { name: "phone-360", width: 360, media: "screen", phone: true },
  { name: "phone-390", width: 390, media: "screen", phone: true },
  { name: "desktop-1280", width: 1280, media: "screen", phone: false },
  { name: "print", width: 680, media: "print", phone: null },
];

const chromePath = findChrome();
if (!chromePath && process.env.CI) {
  throw new Error("kit layout test: no Chromium found under CI; set CHROME_PATH");
}
if (!chromePath) {
  console.warn("SKIPPED kit_layout.test.js: no Chromium found (set CHROME_PATH to run it)");
}

function buildFixture(dir) {
  const html = execFileSync(process.env.PYTHON || "python3", ["-m", "capsule_viewer.kit", "fixture"], {
    cwd: ROOT,
    env: { ...process.env, PYTHONPATH: join(ROOT, "src") },
    encoding: "utf8",
  });
  const file = join(dir, "kit-fixture.html");
  writeFileSync(file, html);
  return { html, url: pathToFileURL(file).href };
}

// Every element inside a fixture whose box leaves the viewport, plus any
// element that clips or scrolls its own content sideways.
const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const fixtures = {};
  const overflow = [];
  for (const fx of document.querySelectorAll("[data-fixture]")) {
    const name = fx.getAttribute("data-fixture");
    fixtures[name] = fx.getBoundingClientRect().height;
    for (const el of [fx, ...fx.querySelectorAll("*")]) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const out = r.right > vw + 0.5 || r.left < -0.5;
      const inner = el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible";
      if (out || inner) {
        overflow.push(name + ": <" + el.tagName.toLowerCase() + " class='" + el.className + "'> left " +
          Math.round(r.left) + " right " + Math.round(r.right) + (inner ? " (scrolls inside)" : ""));
      }
    }
  }
  const thead = document.querySelector('[data-fixture="data-table"] thead');
  const grid = document.querySelector('[data-fixture="metric-grid"] .cv-metrics');
  const layout = {
    tableStacked: getComputedStyle(thead).display === "none",
    metricColumns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
  };
  return { vw, pageScrollWidth: document.documentElement.scrollWidth, fixtures, overflow, layout };
})()`;

describe.skipIf(!chromePath)("component kit layout (headless Chromium)", () => {
  let browser;
  let tab;
  let fixture;
  let dir;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cv-kit-fixture-"));
    fixture = buildFixture(dir);
    browser = await launch(chromePath);
    tab = await browser.newPage();
  }, 60000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("the fixture page carries no script at all", () => {
    expect(fixture.html.toLowerCase()).not.toContain("<script");
  });

  for (const vp of VIEWPORTS) {
    it(`every component fits at ${vp.name} (${vp.width}px, ${vp.media}) with no horizontal overflow`, async () => {
      await tab.open(fixture.url, { width: vp.width, media: vp.media });
      const m = await tab.evaluate(MEASURE);
      expect(m.vw).toBe(vp.width);
      // Not vacuous: all twelve components are on the page and laid out.
      expect(Object.keys(m.fixtures).sort()).toEqual([...COMPONENTS].sort());
      for (const name of COMPONENTS) expect(m.fixtures[name], name).toBeGreaterThan(0);
      expect(m.overflow).toEqual([]);
      expect(m.pageScrollWidth).toBeLessThanOrEqual(m.vw);
      if (vp.phone === true) expect(m.layout).toEqual({ tableStacked: true, metricColumns: 1 });
      if (vp.phone === false) {
        expect(m.layout.tableStacked).toBe(false);
        expect(m.layout.metricColumns).toBeGreaterThan(1);
      }
    }, 30000);
  }

  // Both halves: the same inline script runs with scripting on and does not
  // with it off, so "disabled" below is a measured state, not a flag we set.
  it("the scripting-disabled emulation really stops page scripts", async () => {
    const probe = "data:text/html," + encodeURIComponent("<title>before</title><script>document.title='ran'</script>");
    await tab.open(probe, { width: 390, scripts: true });
    expect(await tab.evaluate("document.title")).toBe("ran");
    await tab.open(probe, { width: 390, scripts: false });
    expect(await tab.evaluate("document.title")).toBe("before");
  }, 30000);

  it("Drilldown opens on a click with the page's scripting disabled", async () => {
    await tab.open(fixture.url, { width: 390, scripts: false });
    const box = await tab.evaluate(`(() => {
      const d = document.querySelector('[data-fixture="drilldown"] details');
      d.scrollIntoView({ block: "center" });
      const r = d.querySelector("summary").getBoundingClientRect();
      return { open: d.open, x: r.left + r.width / 2, y: r.top + r.height / 2, bodyVisible: d.querySelector(".cv-drilldown__body").checkVisibility() };
    })()`);
    expect(box.open).toBe(false);
    expect(box.bodyVisible).toBe(false);
    await tab.click(box.x, box.y);
    const after = await tab.evaluate(`(() => {
      const d = document.querySelector('[data-fixture="drilldown"] details');
      return { open: d.open, bodyVisible: d.querySelector(".cv-drilldown__body").checkVisibility() };
    })()`);
    expect(after.open).toBe(true);
    expect(after.bodyVisible).toBe(true);
  }, 30000);

  it("a closed Drilldown still prints its body", async () => {
    await tab.open(fixture.url, { width: 680, media: "print" });
    const printed = await tab.evaluate(`(() => {
      const d = document.querySelector('[data-fixture="drilldown"] details');
      return { open: d.open, bodyVisible: d.querySelector(".cv-drilldown__body").checkVisibility() };
    })()`);
    expect(printed.open).toBe(false);
    expect(printed.bodyVisible).toBe(true);
  }, 30000);
});
