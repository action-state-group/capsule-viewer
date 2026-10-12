// The History Card module, src/capsule_viewer/static/history_card.js, run
// directly: the same bytes the manifest pins (executable.script_sha256), no
// transpilation, no mocking of the module. Only the page runtime is stood in
// for: EvidenceGraph.registerPresentation captures what the script registers,
// and the tests call its canRender, buildModel and render as the runtime
// would, with a context carrying the bundle and a host with L0, L1 and L2.
// The stand-in fixtures carry no signatures, so the real runtime would refuse
// them before any module runs; that is the container verb's to change.
//
// (1) the nested stand-in fixture recomputes in the module and renders the card;
// (2) the mutant (one flipped outcome) renders the mismatch, never the card;
// and the module agrees with the Python check (python -m capsule_viewer.history
// check) on the fixture and on every mutant below.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChrome, launch } from "./headlessChrome.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_BYTES = readFileSync(join(ROOT, "src", "capsule_viewer", "static", "history_card.js"));
const SCRIPT = SCRIPT_BYTES.toString("utf8");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "src", "capsule_viewer", "history", "manifest.json"), "utf8"));
const DATA = join(ROOT, "tests", "testdata", "history");
const NESTED = JSON.parse(readFileSync(join(DATA, "nested-selection.bundle.json"), "utf8"));
const MUTANT = JSON.parse(readFileSync(join(DATA, "nested-mutant-flipped-outcome.bundle.json"), "utf8"));
const FLAT = JSON.parse(readFileSync(join(DATA, "selection.bundle.json"), "utf8"));
const EXT = "x-history-selection/v0";
const PY = process.env.PYTHON || "python3";
const PY_ENV = { ...process.env, PYTHONPATH: join(ROOT, "src") };

const clone = (v) => JSON.parse(JSON.stringify(v));

// The script in a fresh window, with a stand-in runtime that captures the registration.
function load() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
  const registered = [];
  dom.window.EvidenceGraph = { registerPresentation: (m) => registered.push(m) };
  dom.window.eval(SCRIPT);
  return { H: dom.window.CapsuleViewerHistory, registered, document: dom.window.document };
}

// canRender, buildModel and render, as the runtime calls them.
function present(bundle) {
  const { registered, document } = load();
  const module = registered[0];
  const context = { bundle };
  const host = { L0: document.createElement("div"), L1: document.createElement("div"), L2: document.createElement("div"), depth: "L0" };
  if (!module.canRender(context)) return { declined: true };
  const model = module.buildModel(context);
  module.render(model, host, {});
  return { model, host };
}

function pythonErrors(bundle, dir, name) {
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify(bundle));
  const res = spawnSync(PY, ["-m", "capsule_viewer.history", "check", file], { cwd: ROOT, env: PY_ENV, encoding: "utf8" });
  return JSON.parse(res.stdout);
}

const member = (b, cid) => Object.values(b.extensions[EXT].deals).find((m) => m.records.some((r) => r.capsule_id === cid));

describe("the module and its pin", () => {
  it("the manifest pins these exact script bytes", () => {
    expect(MANIFEST.executable).toEqual({ carrier: "module-slot", script_sha256: createHash("sha256").update(SCRIPT_BYTES).digest("hex") });
  });

  it("registers exactly one module at load, with the manifest (pin zeroed)", () => {
    const { registered } = load();
    expect(registered).toHaveLength(1);
    const expected = clone(MANIFEST);
    expected.executable.script_sha256 = "0".repeat(64);
    expect(clone(registered[0].manifest)).toEqual(expected);
    for (const m of ["canRender", "buildModel", "render"]) expect(typeof registered[0][m]).toBe("function");
  });

  it("canRender takes any selection block, and nothing else", () => {
    const { registered } = load();
    expect(registered[0].canRender({ bundle: NESTED })).toBe(true);
    expect(registered[0].canRender({ bundle: MUTANT })).toBe(true);
    const none = clone(NESTED);
    delete none.extensions[EXT];
    expect(registered[0].canRender({ bundle: none })).toBe(false);
  });
});

describe("the module's primitives", () => {
  it("SHA-256 agrees with node:crypto, on the empty input and across block boundaries", () => {
    const { H } = load();
    for (const n of [0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 1000]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 7 + n) & 0xff);
      expect(H.sha256Hex(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
  });

  it("UTF-8 and JCS: the definition digest is the one the design pins (a third implementation)", () => {
    const { H } = load();
    for (const text of ["plain", "é", "€ and 𝄞", "\u0000\u001f"]) expect(Buffer.from(H.utf8(text))).toEqual(Buffer.from(text, "utf8"));
    expect(() => H.utf8("\ud800")).toThrow();
    expect(() => H.jcs({ a: 1.5 })).toThrow();
    const def = NESTED.extensions[EXT].definition;
    expect(H.sha256Hex(H.utf8(H.jcs(def)))).toBe("a6cf2944408ac0b8b0fe0adaf54d40631e9772376838bb413220e0c77f2da2b1");
  });

  it("deal records are read only through selectedRecords, from the nested per-deal bundles", () => {
    const { H } = load();
    const selected = H.selectedRecords(NESTED);
    expect(selected).toHaveLength(8);
    expect(new Set(selected.map((s) => s.deal)).size).toBe(7);
    for (const s of selected) expect(s.agent_input).toEqual(member(NESTED, s.record.capsule_id).disclosures[s.record.capsule_id].agent_input);
    // check() takes only that output.
    expect(H.check(NESTED.extensions[EXT], selected)).toEqual([]);
    expect(H.check(NESTED.extensions[EXT], [])[0]).toMatch(/^selected but not disclosed/);
    // Top-level records (the flat design fixture's shape) are not read.
    expect(H.selectedRecords(FLAT)).toEqual([]);
  });
});

describe("acceptance (1): the nested stand-in fixture renders through the module", () => {
  it("recomputes in the module", () => {
    const { H } = load();
    expect(H.recomputeErrors(NESTED)).toEqual([]);
    expect(H.derive(H.selectedRecords(NESTED))).toEqual(NESTED.extensions[EXT].account.asserted_result);
  });

  it("renders the card: the four values, the holder's labelled value, one level of details", () => {
    const { model, host } = present(NESTED);
    expect(model.errors).toEqual([]);
    expect(host.L0.getAttribute("data-history-state")).toBe("card");
    expect(host.L0.querySelector('[data-history="card"]')).not.toBeNull();
    expect(host.L0.querySelector('[data-history="mismatch"]')).toBeNull();
    const value = (k) => host.L0.querySelector(`[data-history-value="${k}"]`).textContent;
    expect(value("selected_count")).toBe("8");
    expect(value("period")).toBe("2026-09-14T10:02:11Z to 2026-10-09T14:44:02Z");
    expect(value("completeness")).toBe("Not asserted");
    const buckets = [...host.L0.querySelectorAll("[data-bucket]")].map((li) => [li.getAttribute("data-bucket"), li.querySelector("strong").textContent]);
    expect(buckets).toEqual([["action_class:money.refund", "1"], ["effect.status:dispatched", "4"], ["none", "2"], ["outcome:mismatch", "1"]]);
    expect(host.L0.querySelector('[data-holder-asserted="records_held_in_period"]').textContent).toContain("holder_asserted");
    expect(host.L0.querySelector("[data-history-forbids]").textContent).toBe(load().H.WORDS.forbidding);
    // L1: each selected record with its deal; L2: how it was checked. One <details> each, none nested.
    const rows = [...host.L1.querySelectorAll("[data-record]")];
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r.children[1].textContent)).size).toBe(7);
    for (const level of [host.L1, host.L2]) expect(level.querySelectorAll("details")).toHaveLength(1);
    expect(host.L0.querySelectorAll("details")).toHaveLength(0);
  });
});

describe("acceptance (2): one flipped outcome", () => {
  it("the module finds the mismatch", () => {
    const { H } = load();
    const errors = H.recomputeErrors(MUTANT);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^outcome_evidence: recomputed .*"outcome:mismatch":1.* != asserted .*"outcome:match":1/);
  });

  it("renders the mismatch, never the card", () => {
    const { model, host } = present(MUTANT);
    expect(model.errors).toHaveLength(1);
    expect(host.L0.getAttribute("data-history-state")).toBe("mismatch");
    expect(host.L0.querySelector('[data-history="card"]')).toBeNull();
    expect(host.L0.querySelector("[data-history-value]")).toBeNull();
    expect(host.L1.childNodes).toHaveLength(0);
    expect(host.L2.childNodes).toHaveLength(0);
    expect(host.L0.textContent).toContain("This selection does not recompute");
    expect([...host.L0.querySelectorAll("[data-history-error]")].map((e) => e.textContent)).toEqual(model.errors);
  });

  it("a flipped outcome in a deal bundle's disclosed record is caught by its digest", () => {
    const b = clone(NESTED);
    const s = load().H.selectedRecords(b).find((x) => x.agent_input.body.outcome === "mismatch");
    member(b, s.record.capsule_id).disclosures[s.record.capsule_id].agent_input.body.outcome = "match";
    const { model, host } = present(b);
    expect(model.errors).toEqual([`record ${s.record.capsule_id}: disclosed agent_input does not match its agent_input_digest`]);
    expect(host.L0.querySelector('[data-history="card"]')).toBeNull();
  });
});

describe("the module and the Python check agree", () => {
  let dir;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "cv-history-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const ext = (b) => b.extensions[EXT];
  const first = (b) => Object.values(ext(b).deals)[0];
  const MUTANTS = {
    fixture: () => {},
    "flipped outcome": (b) => Object.assign(b, clone(MUTANT)),
    "record dropped, reference kept": (b) => { const m = first(b); const r = m.records.pop(); delete m.disclosures[r.capsule_id]; },
    "record and reference dropped": (b) => {
      const m = first(b); const r = m.records.pop(); delete m.disclosures[r.capsule_id];
      const refs = ext(b).account.selection.input_identity.references; refs.splice(refs.indexOf(r.capsule_id), 1);
    },
    "record carried twice": (b) => { Object.values(ext(b).deals)[1].records.push(clone(first(b).records[0])); },
    "count edited": (b) => { ext(b).account.asserted_result.outcome_evidence.none = 1; },
    "completeness asserted": (b) => { ext(b).account.asserted_result.completeness = "complete"; },
    "extra count": (b) => { ext(b).account.asserted_result.records_held_in_period = 23; },
    "relabelled holder value": (b) => { ext(b).holder_asserted.records_held_in_period.label = "verified"; },
    "disclosure edited": (b) => { const m = first(b); m.disclosures[m.records[0].capsule_id].agent_input.body.amount_minor += 1; },
    "definition widened": (b) => { ext(b).definition.reads.push("agent_input.body.amount_minor"); },
    "unselected record": (b) => { ext(b).account.selection.input_identity.references.pop(); },
    "record header edited": (b) => { first(b).records[0].timestamp = "2026-09-14T10:02:12Z"; },
    "period edited": (b) => { ext(b).account.asserted_result.period.to = "2026-10-10T00:00:00Z"; },
    "flat shape": (b) => Object.assign(b, clone(FLAT)),
  };

  for (const [name, mutate] of Object.entries(MUTANTS)) {
    it(`${name}: same verdict, and the same reasons where the values print alike`, () => {
      const b = clone(NESTED);
      mutate(b);
      const js = load().H.recomputeErrors(b);
      const py = pythonErrors(b, dir, name.replace(/\W+/g, "-"));
      expect(js.length === 0).toBe(py.length === 0);
      expect(js.length === 0).toBe(name === "fixture");
      // Python prints values with repr, the module with JSON; the reason itself is the same.
      const head = (e) => e.split(/: | \(|, is /)[0];
      expect(js.map(head)).toEqual(py.map(head));
    });
  }
});

// In a real browser: the module rendered into a host on a page with the kit's
// stylesheet, at a phone's and a desktop's width.
const chromePath = findChrome();
if (!chromePath && process.env.CI) throw new Error("history card test: no Chromium found under CI; set CHROME_PATH");
if (!chromePath) console.warn("SKIPPED history card in headless Chromium: no Chromium found (set CHROME_PATH to run it)");

describe.skipIf(!chromePath)("the module in headless Chromium", () => {
  let browser;
  let tab;
  let dir;
  const urls = {};
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cv-history-page-"));
    const css = execFileSync(PY, ["-c", "from capsule_viewer.kit import kit_css; print(kit_css())"], { cwd: ROOT, env: PY_ENV, encoding: "utf8" });
    for (const [name, bundle] of [["fixture", NESTED], ["mutant", MUTANT]]) {
      const data = JSON.stringify(bundle).replace(/</g, "\\u003c");
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>
<body class="cv-kit"><main class="cv-page"><div data-level="L0"></div><div data-level="L1"></div><div data-level="L2"></div></main>
<script>var EvidenceGraph = { registerPresentation: function (m) { window.__history = m; } };</script>
<script>${SCRIPT}</script>
<script>(function () { var m = window.__history, ctx = { bundle: ${data} }, q = function (l) { return document.querySelector('[data-level="' + l + '"]'); };
if (m.canRender(ctx)) m.render(m.buildModel(ctx), { L0: q("L0"), L1: q("L1"), L2: q("L2"), depth: "L0" }, {}); })();</script></body></html>`;
      const file = join(dir, `${name}.html`);
      writeFileSync(file, html);
      urls[name] = pathToFileURL(file).href;
    }
    browser = await launch(chromePath);
    tab = await browser.newPage();
  }, 60000);
  afterAll(async () => {
    if (browser) await browser.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const STATE = `(() => ({
    state: document.querySelector('[data-level="L0"]').getAttribute("data-history-state"),
    card: !!document.querySelector('[data-history="card"]'),
    count: (document.querySelector('[data-history-value="selected_count"]') || {}).textContent || null,
    errors: [...document.querySelectorAll("[data-history-error]")].map((e) => e.textContent),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))()`;

  for (const width of [390, 1280]) {
    it(`fixture at ${width}px: the card`, async () => {
      await tab.open(urls.fixture, { width });
      expect(await tab.evaluate(STATE)).toMatchObject({ state: "card", card: true, count: "8", errors: [], overflow: false });
    }, 30000);

    it(`mutant at ${width}px: the mismatch, never the card`, async () => {
      await tab.open(urls.mutant, { width });
      const m = await tab.evaluate(STATE);
      expect(m).toMatchObject({ state: "mismatch", card: false, count: null, overflow: false });
      expect(m.errors).toHaveLength(1);
      expect(m.errors[0]).toMatch(/^outcome_evidence: recomputed/);
    }, 30000);
  }
});
