// The History Card module, src/capsule_viewer/static/history_card.js, run
// directly: the same bytes the manifest pins (executable.script_sha256), no
// transpilation, no mocking of the module. Only the page runtime is stood in
// for: EvidenceGraph.registerPresentation captures what the script registers,
// and the tests call its canRender, buildModel and render as the runtime
// would, with a context carrying the bundle and a host with L0, L1 and L2.
//
// The inputs are real Histories: capsulectl `deal history` wrote every file
// under tests/testdata/history/ (examples/history/cut_fixtures.sh), and
// verify/<name>.json is what `capsulectl verify --bundle` printed for it.
// (1) the shareable Histories render the card; (2) each refused file renders
// its refusal and no card value; (3) the module and the Python check
// (python -m capsule_viewer.history check) agree on every file and on every
// edit below; (4) the same in headless Chromium at 390px and 1280px.
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
const read = (name) => JSON.parse(readFileSync(join(DATA, `${name}.bundle.json`), "utf8"));
const verified = (name) => {
  const report = JSON.parse(readFileSync(join(DATA, "verify", `${name}.json`), "utf8"));
  return { verdict: report.verdict, ...report.extensions.find((e) => e.kind === EXT) };
};
const CUT = JSON.parse(readFileSync(join(DATA, "cut.json"), "utf8"));
const D = CUT.deals;
const PICKED = [D.closed, D.private, D.floor].sort();
const EXT = "x-history-selection/v0";
const PY = process.env.PYTHON || "python3";
const PY_ENV = { ...process.env, PYTHONPATH: join(ROOT, "src") };

// What the page shows for each real file (the mutant matrix).
const MATRIX = {
  "history-counterparty": ["card", []],
  "history-adjudicator": ["card", []],
  "history-keep": ["not_shareable", ["history_audience_keep", ...PICKED.map((d) => `deal_audience_keep:${d}`)]],
  "mutant-flipped-outcome": ["invalid", [`deal_bundle_not_the_selected_one:${D.closed}`]],
  "mutant-mixed-signer": ["not_shareable", [`deal_not_in_selection:${D.second_profile}`, "deal_signers_differ"]],
  "mutant-not-in-selection": ["not_shareable", [`deal_not_in_selection:${D.other}`]],
};
const SHAREABLE = read("history-counterparty");

const clone = (v) => JSON.parse(JSON.stringify(v));
const ext = (b) => b.extensions[EXT];

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

function python(bundle, dir, name) {
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify(bundle));
  const res = spawnSync(PY, ["-m", "capsule_viewer.history", "check", file], { cwd: ROOT, env: PY_ENV, encoding: "utf8" });
  return JSON.parse(res.stdout);
}

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
    for (const name of Object.keys(MATRIX)) expect(registered[0].canRender({ bundle: read(name) })).toBe(true);
    const none = clone(SHAREABLE);
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

  it("UTF-8 and JCS: each nested deal copy hashes to the digest capsulectl sealed", () => {
    const { H } = load();
    for (const text of ["plain", "é", "€ and 𝄞", "\u0000\u001f"]) expect(Buffer.from(H.utf8(text))).toEqual(Buffer.from(text, "utf8"));
    expect(() => H.utf8("\ud800")).toThrow();
    expect(() => H.jcs({ a: 1.5 })).toThrow();
    for (const entry of ext(SHAREABLE).selection) {
      expect(H.sha256Hex(H.utf8(H.jcs(ext(SHAREABLE).deals[entry.deal_id])))).toBe(entry.bundle_digest);
    }
  });

  it("deal records are read only through selectedRecords: the selected deals, in selection order", () => {
    const { H } = load();
    const selected = H.selectedRecords(SHAREABLE);
    const order = ext(SHAREABLE).selection.map((e) => e.deal_id);
    expect([...new Set(selected.map((s) => s.deal))]).toEqual(order);
    expect(selected).toHaveLength(order.reduce((n, d) => n + ext(SHAREABLE).deals[d].records.length, 0));
    // A deal carried but not selected is never read for values.
    const extra = read("mutant-not-in-selection");
    expect(H.selectedRecords(extra).some((s) => s.deal === D.other)).toBe(false);
  });

  it("reads each copy's audience as capsule-cli's sealedOrInlineReport does", () => {
    const { H } = load();
    const deals = ext(SHAREABLE).deals;
    expect("sealed_report" in deals[D.private].extensions["x-deal-v0"]).toBe(true); // a sealed report, disclosed
    expect("sealed_report" in deals[D.closed].extensions["x-deal-v0"]).toBe(false); // an inline one
    for (const d of PICKED) expect(H.sealedOrInlineReport(deals[d]).audience).toBe("counterparty");
  });
});

describe("the mutant matrix: each real file, in the module", () => {
  for (const [name, [state, findings]] of Object.entries(MATRIX)) {
    it(`${name}: ${state}`, () => {
      const { model, host } = present(read(name));
      expect(model.result.state).toBe(state);
      expect(model.result.findings).toEqual(findings);
      const v = verified(name);
      for (const f of v.findings) expect(model.result.findings).toContain(f);
      expect(model.result.holder_key).toBe(v.holder_key);
      expect(model.result.signer_keys).toEqual(v.signer_keys);
      expect(host.L0.getAttribute("data-history-state")).toBe(state);
      if (state === "card") {
        expect(host.L0.querySelector('[data-history="card"]')).not.toBeNull();
      } else {
        expect(host.L0.querySelector('[data-history="card"]')).toBeNull();
        expect(host.L0.querySelector("[data-history-value]")).toBeNull();
        expect(host.L1.childNodes).toHaveLength(0);
        expect([...host.L0.querySelectorAll("[data-history-error]")].map((e) => e.getAttribute("data-history-error"))).toEqual(findings);
      }
    });
  }

  it("the card: the four values, computed by this page, one level of details", () => {
    const { model, host } = present(SHAREABLE);
    const value = (k) => host.L0.querySelector(`[data-history-value="${k}"]`).textContent;
    expect(value("selected_count")).toBe("3");
    expect(value("completeness")).toBe("Not asserted");
    const v = model.result.values;
    expect(value("period")).toBe(`${v.period.from} to ${v.period.to}`);
    const buckets = [...host.L0.querySelectorAll("[data-bucket]")].map((li) => [li.getAttribute("data-bucket"), Number(li.querySelector("strong").textContent)]);
    expect(Object.fromEntries(buckets)).toEqual(v.outcome_evidence);
    expect(host.L0.querySelector("[data-history-provenance]").getAttribute("data-history-provenance")).toBe("computed");
    expect(host.L0.querySelector("[data-history-audience]").getAttribute("data-history-audience")).toBe("counterparty");
    expect(host.L0.querySelector("[data-history-forbids]").textContent).toBe(load().H.WORDS.forbidding);
    expect(host.L1.querySelectorAll("[data-deal]")).toHaveLength(3);
    for (const level of [host.L1, host.L2]) expect(level.querySelectorAll("details")).toHaveLength(1);
    expect(host.L0.querySelectorAll("details")).toHaveLength(0);
  });

  it("L2 lists each property's status, and never says verified", () => {
    const { host } = present(SHAREABLE);
    const status = Object.fromEntries([...host.L2.querySelectorAll("[data-property]")].map((r) => [r.getAttribute("data-property"), r.getAttribute("data-property-status")]));
    expect(Object.keys(status)).toEqual(load().H.PROPERTIES);
    for (const p of ["selection_record_signature", "history_log", "member_signatures", "member_logs"]) expect(status[p]).toBe("NOT_CHECKED");
    expect(status.values).toBe("NOT_PRESENT");
    expect(host.L2.textContent).not.toMatch(/\bverified\b/i);
    expect(host.L0.textContent).not.toMatch(/\bverified\b/i);
  });
});

describe("the module and the Python check agree", () => {
  let dir;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "cv-history-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const asserted = (b, flip) => {
    const values = clone(load().H.check(b).values);
    if (flip) {
      values.outcome_evidence["effect.status:failed"] = values.outcome_evidence["effect.status:dispatched"];
      delete values.outcome_evidence["effect.status:dispatched"];
    }
    ext(b).asserted_result = values;
  };
  const EDITS = {
    ...Object.fromEntries(Object.keys(MATRIX).map((name) => [name, (b) => Object.assign(b, read(name))])),
    "asserted_result that recomputes": (b) => asserted(b, false),
    "asserted_result with a flipped outcome": (b) => asserted(b, true),
    "a selected deal dropped": (b) => { delete ext(b).deals[D.floor]; },
    "the keep copy of one deal spliced in": (b) => { ext(b).deals[D.closed] = ext(read("history-keep")).deals[D.closed]; },
    "another key under a picked deal's name": (b) => { ext(b).deals[D.closed] = ext(read("mutant-mixed-signer")).deals[D.second_profile]; },
    "the carried selection edited": (b) => { ext(b).selection = ext(b).selection.slice(0, 2); },
    "the sealed selection edited": (b) => {
      const sealed = b.disclosures[ext(b).selection_record].agent_input;
      sealed.selection = sealed.selection.slice(0, 2);
      ext(b).selection = clone(sealed.selection);
    },
    "a nested record header edited": (b) => { ext(b).deals[D.closed].records[0].timestamp = "2026-01-01T00:00:00Z"; },
    "a nested disclosure edited": (b) => {
      const m = ext(b).deals[D.closed];
      const id = Object.keys(m.disclosures).find((k) => "agent_input" in m.disclosures[k]);
      m.disclosures[id].agent_input.body.edited = true;
    },
    "every signature removed": (b) => { for (const m of [b, ...Object.values(ext(b).deals)]) for (const r of m.records) delete r.signature; },
    "every checkpoint removed": (b) => { for (const m of [b, ...Object.values(ext(b).deals)]) delete m.checkpoint; },
    "no selection block": (b) => { delete b.extensions[EXT]; },
  };

  for (const [name, edit] of Object.entries(EDITS)) {
    it(`${name}: same state, findings and property statuses`, () => {
      const b = clone(SHAREABLE);
      edit(b);
      const js = load().H.check(b);
      const py = python(b, dir, name.replace(/\W+/g, "-"));
      expect(js.state).toBe(py.state);
      expect(js.properties).toEqual(py.properties);
      expect(js.values).toEqual(py.values);
      // Python prints values with repr, the module with JSON; the reason itself is the same.
      const head = (e) => e.split(/: /)[0];
      expect(js.findings.map(head)).toEqual(py.findings.map(head));
    });
  }

  it("each state, for the edits", () => {
    const state = (edit) => { const b = clone(SHAREABLE); edit(b); return present(b).model.result.state; };
    expect(state(EDITS["asserted_result that recomputes"])).toBe("card");
    expect(state(EDITS["asserted_result with a flipped outcome"])).toBe("mismatch");
    expect(state(EDITS["a selected deal dropped"])).toBe("not_shareable");
    expect(state(EDITS["the keep copy of one deal spliced in"])).toBe("not_shareable");
    expect(state(EDITS["another key under a picked deal's name"])).toBe("not_shareable");
    expect(state(EDITS["every signature removed"])).toBe("invalid");
    expect(state(EDITS["every checkpoint removed"])).toBe("invalid");
  });
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
    for (const name of Object.keys(MATRIX)) {
      const data = JSON.stringify(read(name)).replace(/</g, "\\u003c");
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
    errors: [...document.querySelectorAll("[data-history-error]")].map((e) => e.getAttribute("data-history-error")),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))()`;

  for (const width of [390, 1280]) {
    for (const [name, [state, findings]] of Object.entries(MATRIX)) {
      it(`${name} at ${width}px: ${state}`, async () => {
        await tab.open(urls[name], { width });
        const m = await tab.evaluate(STATE);
        expect(m).toMatchObject({ state, card: state === "card", count: state === "card" ? "3" : null, errors: findings, overflow: false });
      }, 30000);
    }
  }
});
