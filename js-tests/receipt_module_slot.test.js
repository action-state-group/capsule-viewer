// The receipt modules' module-slot scripts as a page runs them.
//
// (1) jsdom, real copies: the four bundles capsulectl (capsule-cli main)
//     cut, main-buyer-{keep,counterparty} and main-seller-{keep,counterparty}
//     (examples/receipt/cut_main_bundles.sh), each through the three scripts as
//     the page's runtime would load them (EvidenceGraph.registerPresentation),
//     with the context the page's verifier gives (aacContext.js, capsulectl
//     verify's verdicts on those bytes) and nothing else: no page audience, no
//     oracle input. Exactly one module accepts each copy (a buyer's is the
//     unilateral receipt's, a seller's the seller receipt's); the owner's copy
//     shows PRIVATE and the copy shared with the counterparty does not; one
//     level of details; the kit stylesheet goes in once, as the manifest pins it.
// (2) headless Chromium at 390px and 1280px: the same four, and no page
//     scrolls sideways.
// (3) headless Chromium, the receipt goldens (tests/goldens/receipt-*.png):
//     each page the Python module renders and the same page with the script
//     drawing its body, every toggle closed and every toggle open. Before each
//     screenshot both pages are settled the same way: fonts loaded
//     (document.fonts.ready), the kit stylesheet applied, two frames painted.
//     Then, always: the same text, and every element the same box and the same
//     computed style. And the screenshots must be the same pixels; where they
//     are not (CI's Chrome produced differing screenshots of the two pages
//     where this machine's did not), at most PIXEL_TOLERANCE of the pixels may
//     differ, at the same page size, and the difference is printed. With text,
//     every box and every computed style already equal, what is left between
//     two screenshots is how the browser rasterised them, not what the page
//     shows.
//
// Same skip/fail rule as the layout suites: the Chromium part is skipped
// locally with a warning when there is no Chromium, and fails under CI.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { standInContext } from "./aacContext.js";
import { findChrome, launch } from "./headlessChrome.js";
import { pixelDifference } from "./pngPixels.js";
import {
  caseInputs, KINDS, loadScript, manifestOf, PY, PY_ENV, pythonOracle, readBundle, readVerify, RECEIPTS,
  REVIVE_CONTEXT, ROOT, scriptBytes, scriptJson, serializeContext,
} from "./receiptScripts.js";

const MAIN = [
  { name: "main-buyer-keep", module: "unilateral", keep: true },
  { name: "main-buyer-counterparty", module: "unilateral", keep: false },
  { name: "main-seller-keep", module: "seller", keep: true },
  { name: "main-seller-counterparty", module: "seller", keep: false },
];

// A page holding all three scripts, as `presentation build` writes one: each
// registers its module with the page's runtime (stood in for here).
function threeScripts() {
  const libs = KINDS.map((kind) => loadScript(kind));
  return libs.map((lib, i) => ({ kind: KINDS[i], lib, module: lib.registered[0] }));
}

describe("real copies capsulectl cut, in jsdom", () => {
  for (const c of MAIN) {
    it(`${c.name}: the ${c.module} receipt and no other; PRIVATE ${c.keep ? "shown" : "not shown"}`, async () => {
      const context = standInContext(readBundle(c.name), { verify: readVerify(c.name) });
      const all = threeScripts();
      const accepting = [];
      for (const { kind, module } of all) if (await module.canRender(context)) accepting.push(kind);
      expect(accepting).toEqual([c.module]);
      const { lib, module } = all.find((x) => x.kind === c.module);
      expect(module.manifest).toEqual({ ...manifestOf(c.module), executable: { ...manifestOf(c.module).executable, script_sha256: "0".repeat(64) } });
      const model = await module.buildModel(context);
      expect(model.receipt?.report.audience ?? model.report.audience).toBe(c.keep ? "keep" : "counterparty");
      // The page's runtime hands one element as L0, L1 and L2, and its depth (L2 unless the page says otherwise).
      const root = lib.document.createElement("div");
      lib.document.body.appendChild(root);
      module.render(model, { L0: root, L1: root, L2: root, depth: "L0" });
      const banners = root.querySelectorAll('[data-banner="private"]');
      expect(banners.length).toBe(c.keep ? 1 : 0);
      expect(root.textContent.includes("PRIVATE")).toBe(c.keep);
      if (c.keep) expect(banners[0].closest('[data-level="L0"]')).not.toBeNull();
      else expect(root.querySelector("[data-shared]").getAttribute("data-shared")).toBe("counterparty");
      expect(root.querySelectorAll("details").length).toBe(2);
      expect(root.querySelectorAll("details details").length).toBe(0);
      expect(root.querySelectorAll("details[open]").length).toBe(0);
      expect(root.querySelector("h2").textContent).toBe(c.module === "seller" ? "Sale receipt" : "Deal report");
      // The verifier's checks shown are the page verifier's, by name.
      expect([...root.querySelectorAll(".cv-check span:nth-child(2)")].slice(0, 3).map((e) => e.textContent))
        .toEqual(["graph closure", "interval coverage", "per record membership"]);
      // The stylesheet: once, the bytes style_sha256 pins.
      const styles = lib.document.querySelectorAll("#cv-kit-css");
      expect(styles.length).toBe(1);
      expect(createHash("sha256").update(styles[0].textContent, "utf8").digest("hex")).toBe(manifestOf(c.module).executable.style_sha256[0]);
      module.render(model, { L0: root, L1: root, L2: root, depth: "L2" });
      expect(lib.document.querySelectorAll("#cv-kit-css").length).toBe(1);
    });
  }

  it("a seller copy whose kind was dropped is no module's, in the page as in Python", async () => {
    const bundle = readBundle("main-seller-keep");
    delete bundle.extensions["x-deal-seller/v0"];
    const context = standInContext(bundle, { verify: readVerify("main-seller-keep") });
    for (const { module } of threeScripts()) expect(await module.canRender(context)).toBe(false);
  });
});

const chromePath = findChrome();
if (!chromePath && process.env.CI) throw new Error("receipt module-slot test: no Chromium found under CI; set CHROME_PATH");
if (!chromePath) console.warn("SKIPPED the Chromium part of receipt_module_slot.test.js: no Chromium found (set CHROME_PATH to run it)");

const BOOT = `
document.addEventListener("DOMContentLoaded", () => (async () => {
  const revive = ${REVIVE_CONTEXT};
  const c = window.__RECEIPT_CASE__;
  const info = new Map();
  const context = revive(c.context);
  if (c.env) info.set(context, c.env);
  const members = {};
  for (const [id, m] of Object.entries(c.members || {})) { members[id] = revive(m); info.set(members[id], c.env.members[id]); }
  const env = c.env ? { audience: c.audience, verification: (x) => info.get(x).verification, assurance: (x) => info.get(x).assurance, memberContext: (b, id) => members[id] } : {};
  const module = window.CapsuleViewerReceipt.createModule(c.kind, env);
  const model = await module.buildModel(context);
  const host = document.getElementById("cv-host");
  module.render(model, { L0: host, L1: host, L2: host, depth: c.depth });
  document.body.setAttribute("data-rendered", "true");
})().catch((e) => document.body.setAttribute("data-rendered", "error: " + e.message)));`;

function scriptPage(head, bodyBefore, bodyAfter, kind, data) {
  return `${head}<script>window.__RECEIPT_CASE__ = ${scriptJson(data)};</script><script>${scriptBytes(kind).toString("utf8")}</script>` +
    `<script>${BOOT}</script>${bodyBefore}<div id="cv-host"></div>${bodyAfter}`;
}

const MEASURE = `(() => ({
  rendered: document.body.getAttribute("data-rendered"),
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  banners: document.querySelectorAll('[data-banner="private"]').length,
  nested: document.querySelectorAll("details details").length,
  module: document.querySelector("[data-receipt-module]")?.getAttribute("data-receipt-module") ?? null,
}))()`;
// Fonts loaded, the kit stylesheet applied (a drilldown has its border), two frames painted.
const SETTLE_FOR_SHOT = `(async () => {
  await document.fonts.ready;
  const styled = () => { const d = document.querySelector(".cv-drilldown"); return !d || getComputedStyle(d).borderTopStyle === "solid"; };
  for (let i = 0; i < 100 && !styled(); i += 1) await new Promise((r) => setTimeout(r, 20));
  for (let i = 0; i < 2; i += 1) await new Promise((r) => requestAnimationFrame(() => r()));
  return styled();
})()`;
// The page as laid out: the text, and per element (outside the script page's
// host and wrapper) its tag, box and computed style.
const STYLE_PROPS = ["display", "visibility", "color", "background-color", "font-family", "font-size", "font-weight", "font-style",
  "line-height", "border-top-style", "border-top-width", "border-top-color", "border-left-width", "padding-left", "margin-top"];
const LAYOUT = `(() => {
  const main = document.querySelector("main");
  const skip = (e) => e.id === "cv-host" || e.hasAttribute("data-receipt-module") || e.tagName === "STYLE" || e.tagName === "SCRIPT";
  const els = [...main.querySelectorAll("*")].filter((e) => !skip(e));
  const props = ${JSON.stringify(STYLE_PROPS)};
  return {
    text: main.innerText,
    size: [document.documentElement.clientWidth, document.documentElement.scrollHeight],
    elements: els.map((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return [e.tagName, ...[r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100), ...props.map((p) => cs.getPropertyValue(p))].join("|");
    }),
  };
})()`;
// The share of pixels two screenshots of equal text, boxes and styles may
// differ in (rasterisation, never content: see (3) above).
const PIXEL_TOLERANCE = 0.002;
const OPEN_ALL = `document.querySelectorAll("details").forEach((d) => { d.open = true; }); document.querySelectorAll("details").length`;

describe.skipIf(!chromePath)("in headless Chromium", () => {
  let browser;
  let tab;
  let dir;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cv-receipt-slot-"));
    browser = await launch(chromePath);
    tab = await browser.newPage();
  }, 150000);
  afterAll(async () => {
    if (browser) await browser.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const settle = async () => {
    for (let i = 0; i < 100; i += 1) {
      const m = await tab.evaluate(MEASURE);
      if (m.rendered) return m;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("the page did not render");
  };

  for (const c of MAIN) {
    for (const width of [390, 1280]) {
      it(`${c.name} at ${width}px: the ${c.module} receipt, PRIVATE ${c.keep ? "shown" : "not shown"}, no sideways scroll`, async () => {
        const context = standInContext(readBundle(c.name), { verify: readVerify(c.name) });
        const head = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>receipt</title></head><body>`;
        const html = scriptPage(head, "", "</body></html>", c.module, { kind: c.module, depth: "L2", context: serializeContext(context) });
        const file = join(dir, `${c.name}.html`);
        writeFileSync(file, html);
        await tab.open(pathToFileURL(file).href, { width, media: "screen" });
        const m = await settle();
        expect(m.rendered).toBe("true");
        expect(m.module).toBe(`capsuleviewer.receipt.${c.module}/v0`);
        expect(m.banners).toBe(c.keep ? 1 : 0);
        expect(m.nested).toBe(0);
        expect(m.overflowX).toBe(0);
      });
    }
  }

  // The receipt goldens: tests/goldens/receipt-{keep,counterparty,bilateral-keep,bilateral-counterparty}-*.png.
  const GOLDENS = [
    { name: "keep", audience: "keep", kind: "unilateral" },
    { name: "counterparty", audience: "counterparty", kind: "unilateral" },
    { name: "bilateral-keep", audience: "keep", kind: "bilateral" },
    { name: "bilateral-counterparty", audience: "counterparty", kind: "bilateral" },
  ];
  for (const g of GOLDENS) {
    it(`golden receipt-${g.name}: the script's page is the Python page (text, boxes, styles, pixels) at 390 and 1280, closed and open`, async () => {
      const page = execFileSync(PY, ["-m", "capsule_viewer.receipt", join(RECEIPTS, `${g.name}.bundle.json`), join(RECEIPTS, `${g.name}.verify.json`), g.audience, "L0"],
        { cwd: ROOT, env: PY_ENV, encoding: "utf8" });
      // Both pages without the CSP meta (the script page runs inline scripts); layout is unchanged by it.
      const python = page.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n/, "");
      const start = python.indexOf('<div data-level="L0">');
      const end = python.indexOf("</main>");
      expect(start).toBeGreaterThan(0);
      const c = pythonOracle().cases.find((x) => x.name === g.name && x.audience === g.audience);
      const { context, env } = caseInputs(c);
      const members = {};
      if (g.kind === "bilateral") {
        const composed = readVerify(g.name).extensions.find((e) => e.kind === "composed/v1").composed;
        for (const m of readBundle(g.name).extensions["composed/v1"].members) {
          if (m.outcome === "artifact") members[m.id] = serializeContext(env.memberContext(m.bundle, m.id));
        }
        expect(Object.keys(members).length).toBe(composed.members.length);
      }
      const headEnd = python.indexOf("</head>");
      const scripted = scriptPage(python.slice(0, headEnd), python.slice(headEnd, start), python.slice(end), g.kind,
        { kind: g.kind, audience: g.audience, depth: "L0", context: serializeContext(context), env: c.env, members });
      const files = { python: join(dir, `golden-${g.name}-py.html`), script: join(dir, `golden-${g.name}-js.html`) };
      writeFileSync(files.python, python);
      writeFileSync(files.script, scripted);
      for (const width of [390, 1280]) {
        for (const state of ["closed", "open"]) {
          const label = `receipt-${g.name}-${width}-${state}`;
          const shots = {};
          const layout = {};
          for (const [side, file] of Object.entries(files)) {
            await tab.open(pathToFileURL(file).href, { width, media: "screen" });
            if (side === "script") expect((await settle()).rendered).toBe("true");
            if (state === "open") await tab.evaluate(OPEN_ALL);
            const settled = await tab.call("Runtime.evaluate", { expression: SETTLE_FOR_SHOT, awaitPromise: true, returnByValue: true });
            expect(settled.result.value, `${label} ${side}: the kit stylesheet applied`).toBe(true);
            layout[side] = await tab.evaluate(LAYOUT);
            shots[side] = await tab.screenshot();
          }
          expect(layout.script.text, `${label}: text`).toBe(layout.python.text);
          expect(layout.script.size, `${label}: page size`).toEqual(layout.python.size);
          expect(layout.script.elements, `${label}: every element's box and computed style`).toEqual(layout.python.elements);
          const digest = (b) => createHash("sha256").update(b).digest("hex");
          if (digest(shots.script) !== digest(shots.python)) {
            const d = pixelDifference(shots.script, shots.python);
            expect(d, `${label}: screenshot sizes`).not.toBeNull();
            console.warn(`${label}: screenshots differ in ${d.differing} of ${d.total} pixels (${d.width}x${d.height}); text, boxes and styles equal`);
            expect(d.differing / d.total, `${label}: share of differing pixels`).toBeLessThanOrEqual(PIXEL_TOLERANCE);
          }
        }
      }
    }, 120000);
  }
});
