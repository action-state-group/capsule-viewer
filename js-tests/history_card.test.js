// The History Card module, src/capsule_viewer/static/history_card.js, run
// directly: the same bytes the manifest pins (executable.script_sha256), no
// transpilation, no mocking of the module. Only the page runtime is stood in
// for: EvidenceGraph.registerPresentation captures what the script registers,
// and the tests call its canRender, buildModel and render as the runtime
// would, with a context and a host with L0, L1 and L2. The context is a
// stand-in for agent-action-capsule's VerifiedBundleContext (aacContext.js:
// AAC's buildVerifiedBundleContext cannot be imported here), its shape checked
// against AAC's interface; for a real file its verdicts are capsulectl verify's.
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
import { aacBundleVerified, interfaceFields, runtimeRender, standInContext } from "./aacContext.js";
import { existsSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_BYTES = readFileSync(join(ROOT, "src", "capsule_viewer", "static", "history_card.js"));
const SCRIPT = SCRIPT_BYTES.toString("utf8");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "src", "capsule_viewer", "history", "manifest.json"), "utf8"));
const DATA = join(ROOT, "tests", "testdata", "history");
const read = (name) => JSON.parse(readFileSync(join(DATA, `${name}.bundle.json`), "utf8"));
const report = (name) => JSON.parse(readFileSync(join(DATA, "verify", `${name}.json`), "utf8"));
const verified = (name) => ({ verdict: report(name).verdict, ...report(name).extensions.find((e) => e.kind === EXT) });
// A real file's context: capsulectl verify's verdicts on those exact bytes.
const realContext = (name) => standInContext(read(name), { verify: report(name) });
const CUT = JSON.parse(readFileSync(join(DATA, "cut.json"), "utf8"));
const D = CUT.deals;
const PICKED = [D.closed, D.private, D.floor].sort();
const EXT = "x-history-selection/v0";
const PY = process.env.PYTHON || "python3";
const PY_ENV = { ...process.env, PYTHONPATH: join(ROOT, "src") };

// What the page shows for each real file (the mutant matrix), under its
// capsulectl-verified context. 7ebf001 writes no "history" audience: every real
// file holds copies made for someone in particular, so none is shareable (u888),
// and each mutant of the counterparty History carries that beside its own
// finding. The two outer mutants fail the page's verifier itself (graph closure;
// checkpoint): the runtime would call no module for them, and the module, called
// anyway, says so first and draws no card.
const copies = (audience) => [`history_audience_${audience}`, ...PICKED.map((d) => `deal_audience_${audience}:${d}`)];
const CP = copies("counterparty");
const MATRIX = {
  "history-counterparty": ["not_shareable", CP],
  "history-adjudicator": ["not_shareable", copies("adjudicator")],
  "history-keep": ["not_shareable", copies("keep")],
  "mutant-flipped-outcome": ["not_shareable", [CP[0], `deal_bundle_not_the_selected_one:${D.closed}`, ...CP.slice(1)]],
  "mutant-mixed-signer": ["not_shareable", [CP[0], `deal_not_in_selection:${D.second_profile}`, ...CP.slice(1), "deal_signers_differ"]],
  "mutant-not-in-selection": ["not_shareable", [CP[0], `deal_not_in_selection:${D.other}`, ...CP.slice(1)]],
  "mutant-selection-not-root": ["invalid", ["history_bundle_unverified", "selection_record_not_root", ...CP]],
  "mutant-not-history-log": ["invalid", ["history_bundle_unverified", "not_a_history_log", ...CP]],
};
// The L0 limitation: who presents the copies, never who made the deals.
const LIMITATION = "A History shows only that the holder of key K presents these copies, each of which verifies on its own. " +
  "It does not show that the holder of key K made, took part in or owns these deals.";
// The shareable baseline: the counterparty History re-sealed in memory for the
// audience "history" (capsule_viewer.history.fixture.with_audience) until a
// producer that writes it (u888) is cut from. Its context's interval coverage
// and membership are ASSUMED (aacContext.js): a re-seal does not verify against
// the checkpoint.
const withAudience = (name, audience) => JSON.parse(execFileSync(PY, ["-c",
  "import json, sys\nfrom capsule_viewer.history.fixture import with_audience\n" +
  "print(json.dumps(with_audience(json.load(open(sys.argv[1])), sys.argv[2])))",
  join(DATA, `${name}.bundle.json`), audience], { cwd: ROOT, env: PY_ENV, encoding: "utf8", maxBuffer: 1 << 26 }));
const SHAREABLE = withAudience("history-counterparty", "history");
const MEMBER_WORDS = "verified by capsulectl on the sender's machine, not by this page";

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

// canRender, buildModel and render, as the runtime calls them. The context is
// the stand-in VerifiedBundleContext (a real file's: realContext).
function present(bundle, context = standInContext(bundle)) {
  const { registered, document } = load();
  const module = registered[0];
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
    const deals = ext(read("history-counterparty")).deals;
    expect("sealed_report" in deals[D.private].extensions["x-deal-v0"]).toBe(true); // a sealed report, disclosed
    expect("sealed_report" in deals[D.closed].extensions["x-deal-v0"]).toBe(false); // an inline one
    for (const d of PICKED) expect(H.sealedOrInlineReport(deals[d]).audience).toBe("counterparty");
    // The in-memory "history" re-seal changes the report each way reads it from.
    for (const d of PICKED) expect(H.sealedOrInlineReport(ext(SHAREABLE).deals[d]).audience).toBe("history");
  });
});

describe("the mutant matrix: each real file, in the module", () => {
  for (const [name, [state, findings]] of Object.entries(MATRIX)) {
    it(`${name}: ${state}`, () => {
      const { model, host } = present(read(name), realContext(name));
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
    expect(host.L0.querySelector("[data-history-audience]").getAttribute("data-history-audience")).toBe("history");
    expect(host.L0.querySelector("[data-history-forbids]").textContent).toBe(load().H.WORDS.forbidding);
    // The presenter limitation, word for word, in L0; key K beside it.
    expect(host.L0.querySelector("[data-history-limitation]").textContent).toBe(LIMITATION);
    expect(load().H.WORDS.limitation).toBe(LIMITATION);
    expect(host.L0.querySelector("[data-history-key]").textContent).toBe(model.result.holder_key);
    expect(host.L1.querySelectorAll("[data-deal]")).toHaveLength(3);
    for (const level of [host.L1, host.L2]) expect(level.querySelectorAll("details")).toHaveLength(1);
    expect(host.L0.querySelectorAll("details")).toHaveLength(0);
  });

  it("L2 lists each property's status, and says verified only of capsulectl on the sender's machine", () => {
    const { host } = present(SHAREABLE);
    const rows = [...host.L2.querySelectorAll("[data-property]")];
    const status = Object.fromEntries(rows.map((r) => [r.getAttribute("data-property"), r.getAttribute("data-property-status")]));
    expect(Object.keys(status)).toEqual(load().H.PROPERTIES);
    // The page's verifier checks no record signature: the selection record's stays NOT_CHECKED.
    expect(status.selection_record_signature).toBe("NOT_CHECKED");
    expect(status.history_log).toBe("PASS"); // read from the context (here a stand-in's assumed log verdicts)
    expect(status.selection_root).toBe("PASS");
    expect(status.values).toBe("NOT_PRESENT");
    // The nested member bundles: NOT_CHECKED, in exactly these words.
    for (const p of ["member_signatures", "member_logs"]) {
      expect(status[p]).toBe("NOT_CHECKED");
      expect(rows.find((r) => r.getAttribute("data-property") === p).lastChild.textContent).toBe(`NOT_CHECKED ${MEMBER_WORDS}`);
    }
    expect(load().H.WORDS.memberNotChecked).toBe(MEMBER_WORDS);
    expect(host.L2.textContent.split(MEMBER_WORDS).join("")).not.toMatch(/\bverified\b/i);
    expect(host.L0.textContent).not.toMatch(/\bverified\b/i);
  });
});

const SHAPE = JSON.parse(readFileSync(join(ROOT, "tests", "testdata", "aac-context", "verified-bundle-context-shape.json"), "utf8")).interfaces;
const AAC_SRC = process.env.AAC_TS_SRC || resolve(ROOT, "..", "agent-action-capsule--main", "ts", "src");
const required = (fields) => fields.filter((f) => !f.endsWith("?"));
const allowed = (fields) => fields.map((f) => f.replace(/\?$/, ""));
const host = (document) => ({ L0: document.createElement("div"), L1: document.createElement("div"), L2: document.createElement("div"), depth: "L0" });
const rootRecord = (b) => b.records.find((r) => r.capsule_id === b.root);

describe("the page's verifier: agent-action-capsule's VerifiedBundleContext", () => {
  it("the stand-in context has the interface's shape", () => {
    const ctx = standInContext(SHAREABLE);
    const fits = (o, name) => {
      const f = SHAPE[name].fields;
      for (const k of required(f)) expect(Object.hasOwn(o, k), `${name}.${k}`).toBe(true);
      for (const k of Object.keys(o)) expect(allowed(f), `${name}.${k}`).toContain(k);
    };
    fits(ctx, "VerifiedBundleContext");
    fits(ctx.completeness, "VerifiedBundleContext.completeness");
    fits(ctx.verification, "BundleVerificationResult");
    for (const c of ["graphClosure", "intervalCoverage", "perRecordMembership"]) fits(ctx.verification[c], "ClaimResult");
    for (const r of Object.values(ctx.verification.capsuleResults)) fits(r, "VerificationResult");
    for (const d of ctx.verification.disclosures) fits(d, "DisclosureResult");
    expect(ctx.resolvedDisclosures).toBeInstanceOf(Map);
    expect(ctx.recordIndex).toBeInstanceOf(Map);
    expect(Object.isFrozen(ctx) && Object.isFrozen(ctx.verification)).toBe(true);
  });

  it.skipIf(!existsSync(join(AAC_SRC, "bundle.ts")))("the vendored shape is AAC's interface source", () => {
    for (const [name, { file, fields }] of Object.entries(SHAPE)) {
      const [iface, nested] = name.split(".");
      expect(interfaceFields(readFileSync(join(AAC_SRC, file), "utf8"), iface, nested), name).toEqual(fields);
    }
  });

  it("a real History: the selection record and the history log PASS under capsulectl's verdicts; NOT_CHECKED from the file alone", () => {
    const { H } = load();
    const b = read("history-counterparty");
    const withContext = H.check(b, realContext("history-counterparty")).properties;
    expect(withContext.selection_record).toBe("PASS");
    expect(withContext.selection_root).toBe("PASS");
    expect(withContext.history_log).toBe("PASS");
    expect(withContext.selection_record_signature).toBe("NOT_CHECKED");
    const alone = H.check(b).properties;
    expect(alone.history_log).toBe("NOT_CHECKED");
    expect(alone.selection_record_signature).toBe("NOT_CHECKED");
  });

  it("the module's gate is the runtime's, on every real file", () => {
    const { H } = load();
    for (const name of Object.keys(MATRIX)) {
      const ctx = realContext(name);
      expect(H.bundleVerified(ctx.verification), name).toBe(aacBundleVerified(ctx.verification));
      expect(aacBundleVerified(ctx.verification), name).toBe(!["mutant-selection-not-root", "mutant-not-history-log"].includes(name));
    }
  });

  it("a checkpoint the verifier could not authenticate leaves the history log NOT_CHECKED", () => {
    const unauthenticated = { status: "pass", findings: ["checkpoint_unverified"] };
    const ctx = standInContext(SHAREABLE, { claims: { intervalCoverage: unauthenticated, perRecordMembership: unauthenticated } });
    const { model } = present(SHAREABLE, ctx);
    expect(model.result.properties.history_log).toBe("NOT_CHECKED");
    expect(model.result.state).toBe("card");
  });

  it("the selection record's membership fails: history_log FAIL and no card", () => {
    const ctx = standInContext(SHAREABLE, { claims: { perRecordMembership: { status: "fail", findings: [`membership_proof_invalid:${SHAREABLE.root}`] } } });
    const { model, host: h } = present(SHAREABLE, ctx);
    expect(model.result.properties.history_log).toBe("FAIL");
    expect(model.result.findings).toEqual(["history_bundle_unverified", "history_log_unproven"]);
    expect(model.result.state).toBe("invalid");
    expect(h.L0.querySelector('[data-history="card"]')).toBeNull();
    expect(h.L0.querySelector("[data-history-value]")).toBeNull();
  });

  it("the outer root record broken: selection_record FAIL, no card, and the runtime calls no module", () => {
    const b = clone(SHAREABLE);
    rootRecord(b).timestamp = "2020-01-01T00:00:00Z"; // its capsule id no longer recomputes
    const ctx = standInContext(b);
    expect(ctx.verification.capsuleResults[b.root].ok).toBe(false);
    expect(ctx.verification.graphClosure.status).toBe("fail");
    // The runtime's gate refuses before canRender (presentation-registry.ts resolveModules, step 1).
    const { registered, document } = load();
    let called = 0;
    const spy = { ...registered[0], canRender: (c) => { called += 1; return registered[0].canRender(c); }, buildModel: (c) => { called += 1; return registered[0].buildModel(c); } };
    expect(runtimeRender(spy, ctx, host(document))).toBeNull();
    expect(called).toBe(0);
    // Called anyway, the module draws no card and says why first.
    const { model, host: h } = present(b, ctx);
    expect(model.result.state).toBe("invalid");
    expect(model.result.findings[0]).toBe("history_bundle_unverified");
    expect(model.result.properties.selection_record).toBe("FAIL");
    expect(model.result.values).toBeNull();
    expect(h.L0.querySelector('[data-history="card"]')).toBeNull();
    expect(h.L0.querySelector("[data-history-value]")).toBeNull();
  });

  it("the outer root signature broken: the context carries no signature verdict, so it stays NOT_CHECKED", () => {
    // AAC's verifyBundle checks no record signature (verify.ts verifyClass1 leaves signature and
    // key_id out of the capsule id and checks neither): the context is the same, and the page
    // cannot say FAIL. capsulectl verify does check it. This pins that gap.
    const b = clone(SHAREABLE);
    const r = rootRecord(b);
    r.signature = r.signature.slice(0, -2) + (r.signature.endsWith("00") ? "01" : "00");
    const broken = standInContext(b), intact = standInContext(SHAREABLE);
    expect(JSON.stringify(broken.verification)).toBe(JSON.stringify(intact.verification));
    const { model } = present(b, broken);
    expect(model.result.properties.selection_record_signature).toBe("NOT_CHECKED");
    expect(model.result.properties).toEqual(present(SHAREABLE, intact).model.result.properties);
  });

  for (const audience of ["counterparty", "adjudicator", "keep"]) {
    it(`audience ${audience}: not a shareable History, in its own words`, () => {
      const b = withAudience("history-counterparty", audience);
      const { model, host: h } = present(b);
      expect(model.result.state).toBe("not_shareable");
      expect(model.result.findings).toEqual(copies(audience));
      expect(h.L0.querySelector('[data-history="card"]')).toBeNull();
      const words = load().H.WORDS.finding;
      const items = [...h.L0.querySelectorAll("[data-history-error]")].map((li) => li.textContent);
      expect(items[0]).toBe(`${words[`history_audience_${audience}`]} [history_audience_${audience}]`);
      expect(items[1].startsWith(`${words[`deal_audience_${audience}`]} (`)).toBe(true);
    });
  }

  it("audience history: the card", () => {
    const { model, host: h } = present(SHAREABLE);
    expect(model.result.audience).toBe("history");
    expect(model.result.state).toBe("card");
    expect(h.L0.querySelector("[data-history-audience]").textContent).toBe(`${load().H.WORDS.audience.history} (history)`);
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
  // Two fields a later #209 may add: "recipient" in the sealed selection,
  // "steps_after_checkpoint" in each entry. The selection record is re-sealed
  // over them (agent_input_digest, capsule id, disclosure key, root).
  const sha = (v) => createHash("sha256").update(Buffer.from(load().H.jcs(v), "utf8")).digest("hex");
  const futureFields = (b, carry) => {
    const old = ext(b).selection_record;
    const sealed = b.disclosures[old];
    delete b.disclosures[old];
    sealed.agent_input.recipient = "recipient-not-shown-7f3a";
    sealed.agent_input.selection.forEach((e, i) => { e.steps_after_checkpoint = i + 2; });
    const record = b.records.find((r) => r.capsule_id === old);
    record.model_attestation.compute_attestation.agent_input_digest = sha(sealed.agent_input);
    const pre = Object.fromEntries(Object.entries(record).filter(([k]) => !["capsule_id", "signature", "key_id"].includes(k)));
    record.capsule_id = sha(pre);
    b.disclosures[record.capsule_id] = sealed;
    const memberships = b.completeness_certificate.memberships;
    memberships[record.capsule_id] = memberships[old];
    delete memberships[old];
    b.root = ext(b).selection_record = record.capsule_id;
    if (carry) ext(b).selection = clone(sealed.agent_input.selection);
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
    "root set to another id": (b) => { b.root = "0".repeat(64); },
    "checkpoint log id set to a deal's log": (b) => { b.checkpoint.log_id = D.closed; },
    "recipient and steps_after_checkpoint added, carried as sealed": (b) => futureFields(b, true),
    "recipient and steps_after_checkpoint sealed, not carried": (b) => futureFields(b, false),
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
    expect(state(EDITS["root set to another id"])).toBe("invalid");
    expect(state(EDITS["checkpoint log id set to a deal's log"])).toBe("invalid");
    expect(state(EDITS["recipient and steps_after_checkpoint sealed, not carried"])).toBe("invalid");
  });

  it("the two future fields: the card renders, and neither field is shown", () => {
    const b = clone(SHAREABLE);
    EDITS["recipient and steps_after_checkpoint added, carried as sealed"](b);
    expect(b.disclosures[ext(b).selection_record].agent_input.recipient).toBe("recipient-not-shown-7f3a");
    expect(ext(b).selection.every((e) => "steps_after_checkpoint" in e)).toBe(true);
    const { model, host } = present(b);
    expect(model.result.state).toBe("card");
    expect(model.result.findings).toEqual([]);
    expect(model.result.values).toEqual(present(clone(SHAREABLE)).model.result.values);
    const text = host.L0.textContent + host.L1.textContent + host.L2.textContent;
    const attrs = [host.L0, host.L1, host.L2].map((h) => h.innerHTML).join("");
    for (const hidden of ["recipient", "steps_after_checkpoint"]) {
      expect(text).not.toContain(hidden);
      expect(attrs).not.toContain(hidden);
    }
    // The comparison is of full entries: one extra field changed in the carried copy is not the sealed selection.
    const changed = clone(SHAREABLE);
    EDITS["recipient and steps_after_checkpoint added, carried as sealed"](changed);
    ext(changed).selection[0].steps_after_checkpoint = 99;
    expect(present(changed).model.result.findings).toEqual(["selection_not_sealed"]);
  });
});

// In a real browser: the module rendered into a host on a page with the kit's
// stylesheet, at a phone's and a desktop's width.
const chromePath = findChrome();
if (!chromePath && process.env.CI) throw new Error("history card test: no Chromium found under CI; set CHROME_PATH");
if (!chromePath) console.warn("SKIPPED history card in headless Chromium: no Chromium found (set CHROME_PATH to run it)");

// Every real file, and the in-memory "history" History (the one card).
const SHAREABLE_PAGE = "history-audience-history (in memory)";
const PAGES = { ...MATRIX, [SHAREABLE_PAGE]: ["card", []] };

describe.skipIf(!chromePath)("the module in headless Chromium", () => {
  let browser;
  let tab;
  let dir;
  const urls = {};
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cv-history-page-"));
    const css = execFileSync(PY, ["-c", "from capsule_viewer.kit import kit_css; print(kit_css())"], { cwd: ROOT, env: PY_ENV, encoding: "utf8" });
    for (const name of Object.keys(PAGES)) {
      // The context, as data: the module reads its bundle, root, verification and completeness.
      const ctx = name === SHAREABLE_PAGE ? standInContext(SHAREABLE) : realContext(name);
      const data = JSON.stringify(ctx).replace(/</g, "\\u003c");
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>
<body class="cv-kit"><main class="cv-page"><div data-level="L0"></div><div data-level="L1"></div><div data-level="L2"></div></main>
<script>var EvidenceGraph = { registerPresentation: function (m) { window.__history = m; } };</script>
<script>${SCRIPT}</script>
<script>(function () { var m = window.__history, ctx = ${data}, q = function (l) { return document.querySelector('[data-level="' + l + '"]'); };
if (m.canRender(ctx)) m.render(m.buildModel(ctx), { L0: q("L0"), L1: q("L1"), L2: q("L2"), depth: "L0" }, {}); })();</script></body></html>`;
      const file = join(dir, `${name.replace(/\W+/g, "-")}.html`);
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
    limitation: (document.querySelector("[data-history-limitation]") || {}).textContent || null,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))()`;

  for (const width of [390, 1280]) {
    for (const [name, [state, findings]] of Object.entries(PAGES)) {
      it(`${name} at ${width}px: ${state}`, async () => {
        await tab.open(urls[name], { width });
        const m = await tab.evaluate(STATE);
        expect(m).toMatchObject({ state, card: state === "card", count: state === "card" ? "3" : null, errors: findings, limitation: state === "card" ? LIMITATION : null, overflow: false });
      }, 30000);
    }
  }
});
