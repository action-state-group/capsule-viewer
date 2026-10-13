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
// (1) the shareable Histories (audience history) render the card, with outcome
// and action class not proven; (2) each refused file renders its refusal and
// no card value; (3) the module and the Python check (python -m
// capsule_viewer.history check) agree on every file and on every edit below;
// (4) no rendered text calls a signature verified, valid or checked by this
// page; (5) the same in headless Chromium at 390px and 1280px.
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
// capsulectl-verified context. The three outer mutants fail the page's verifier
// itself (graph closure; checkpoint; the re-sealed root's membership): the
// runtime would call no module for them, and the module, called anyway, says so
// first and draws no card.
const CLOSED = D.closed, PRIVATE_DEAL = D.private, FLOOR = D.floor;
const KEEP = ["history_audience_keep", ...PICKED.map((d) => `deal_audience_keep:${d}`)];
const SALES = [D.sale_a, D.sale_b].sort();
const MATRIX = {
  "history-history": ["card", []],
  "history-keep": ["not_shareable", KEEP],
  "history-two-buyers": ["card", []],
  "history-two-buyers-keep": ["not_shareable", ["history_audience_keep", ...SALES.map((d) => `deal_audience_keep:${d}`)]],
  "mutant-flipped-status": ["invalid", [`deal_bundle_not_the_selected_one:${CLOSED}`, `deal_record_id_mismatch:${CLOSED}`, `deal_invalid:${CLOSED}`]],
  "mutant-mixed-signer": ["not_shareable", [`deal_not_in_selection:${D.second_profile}`, "deal_signers_differ"]],
  "mutant-not-in-selection": ["not_shareable", [`deal_not_in_selection:${D.other}`]],
  "mutant-selection-not-root": ["invalid", ["history_bundle_unverified", "selection_record_not_root"]],
  "mutant-not-history-log": ["invalid", ["history_bundle_unverified", "not_a_history_log"]],
  "mutant-payload-disclosed": ["invalid", [`deal_bundle_not_the_selected_one:${CLOSED}`, `deal_payload_disclosed:${CLOSED}`]],
  "mutant-counterparty-member": ["invalid", [`deal_bundle_not_the_selected_one:${PRIVATE_DEAL}`, `deal_audience_not_selected:${PRIVATE_DEAL}`, `deal_payload_disclosed:${PRIVATE_DEAL}`]],
  "mutant-audience-not-history": ["invalid", ["history_bundle_unverified", "history_log_unproven", "selection_audience_not_history", ...PICKED.map((d) => `deal_audience_not_selected:${d}`)]],
  "mutant-wrong-nonce": ["invalid", ["history_bundle_unverified", "not_a_history_log"]],
  "mutant-recipient-missing": ["invalid", ["history_bundle_unverified", "history_log_unproven", "selection_recipient_missing"]],
  "mutant-steps-negative": ["invalid", ["history_bundle_unverified", "history_log_unproven", `selection_entry_malformed:${FLOOR}`, `deal_not_in_selection:${FLOOR}`]],
  "mutant-steps-not-integer": ["invalid", ["history_bundle_unverified", "history_log_unproven", `selection_entry_malformed:${FLOOR}`, `deal_not_in_selection:${FLOOR}`]],
};
// The mutants whose selection record is re-sealed (make_mutants.py): its old signature kept.
const RESEALED = ["mutant-audience-not-history", "mutant-recipient-missing", "mutant-steps-negative", "mutant-steps-not-integer"];
const OUTER_FAILS = ["mutant-selection-not-root", "mutant-not-history-log", "mutant-wrong-nonce", ...RESEALED];
// What capsulectl verify finds that this page cannot: a signature that does not verify.
const SIGNATURE_ONLY = Object.fromEntries(RESEALED.map((name) => [name, ["selection_record_unsigned"]]));
// The L0 limitation: who presents the copies, never who made the deals.
const LIMITATION = "A History shows only that the holder of key K presents these copies, each of which verifies on its own. " +
  "It does not show that the holder of key K made, took part in or owns these deals.";
// A History for another audience, re-sealed in memory (capsule_viewer.history.fixture.with_audience):
// capsulectl refuses to write one for counterparty or adjudicator.
const withAudience = (name, audience) => JSON.parse(execFileSync(PY, ["-c",
  "import json, sys\nfrom capsule_viewer.history.fixture import with_audience\n" +
  "print(json.dumps(with_audience(json.load(open(sys.argv[1])), sys.argv[2])))",
  join(DATA, `${name}.bundle.json`), audience], { cwd: ROOT, env: PY_ENV, encoding: "utf8", maxBuffer: 1 << 26 }));
// The shareable baseline: the history History, as capsulectl wrote it.
const SHAREABLE = read("history-history");
// The one wording of every signature status (PM u335).
const SIGNATURE_WORDS = "checked by capsulectl on the sender's machine, not by this page";
const NOT_PROVEN_WORDS = "not proven: the copy withholds the record payload";
// History Basic wording: the L0 golden (section 5.2), the T8 list (one data file, shared), the four page states (FR-32).
const L0_GOLDEN = JSON.parse(readFileSync(join(DATA, "l0-golden.json"), "utf8"));
const L0_TITLE = "History Card \u00b7 Delivery outcomes not established";
const T8 = JSON.parse(readFileSync(join(DATA, "t8-banned.json"), "utf8"));
const T8_PATTERNS = [
  ...T8.banned_deal_status.phrases.map((p) => [p, new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")]),
  ...T8.similarity_claim.patterns.map((p) => [p, new RegExp(p, "i")]),
];
// Every T8 hit in a text, one line at a time: [pattern, line].
const t8 = (text) => text.split("\n").flatMap((line) => T8_PATTERNS.filter(([, rx]) => rx.test(line)).map(([p]) => [p, line]));
const PAGE_STATES = ["checking", "integrity_checked", "failed", "unable_to_verify"];

// Every sentence of the rendered text (or of the HTML, tags as breaks) that
// names a signature and calls it verified, valid or checked by this page.
const BAD_SIGNATURE = /\bverified\b|\bvalid\b|checked by this page/i;
function signatureClaims(text) {
  return text.split(/\n+|(?<=\.)\s+/).filter((sentence) => /signature/i.test(sentence) && BAD_SIGNATURE.test(sentence));
}
// The text of each block of a rendered host, one per line, and its HTML with tags as line breaks.
const blocks = (root) => [...root.querySelectorAll("h2, h3, p, li, tr, dt, dd, summary")].map((e) => e.textContent).join("\n");
const htmlText = (html) => html.replace(/<[^>]*>/g, "\n");

const sha = (v) => createHash("sha256").update(Buffer.from(load().H.jcs(v), "utf8")).digest("hex");
const flip = (sig) => sig.slice(0, -2) + (sig.endsWith("00") ? "01" : "00");
// The selection record re-sealed over its edited agent_input: agent_input_digest, capsule id,
// disclosure key, membership key, root and selection_record follow (its signature does not).
function resealSelection(b, edit, carry = true) {
  const old = ext(b).selection_record;
  const sealed = b.disclosures[old];
  delete b.disclosures[old];
  edit(sealed.agent_input);
  const record = b.records.find((r) => r.capsule_id === old);
  record.model_attestation.compute_attestation.agent_input_digest = sha(sealed.agent_input);
  record.capsule_id = sha(Object.fromEntries(Object.entries(record).filter(([k]) => !["capsule_id", "signature", "key_id"].includes(k))));
  b.disclosures[record.capsule_id] = sealed;
  const memberships = b.completeness_certificate.memberships;
  memberships[record.capsule_id] = memberships[old];
  delete memberships[old];
  b.root = ext(b).selection_record = record.capsule_id;
  if (carry) ext(b).selection = clone(sealed.agent_input.selection);
  return b;
}
function forgeRootSignature(b) {
  const r = b.records.find((x) => x.capsule_id === b.root);
  r.signature = flip(r.signature);
  return b;
}
// One record of the closed deal's copy carries a forged signature (outside its capsule id); the
// selection is re-sealed over the copy's new digest, so every digest this page checks holds.
function forgeMemberSignature(b) {
  const member = ext(b).deals[CLOSED];
  member.records[0].signature = flip(member.records[0].signature);
  const digest = sha(member);
  return resealSelection(b, (sealed) => { sealed.selection.find((e) => e.deal_id === CLOSED).bundle_digest = digest; });
}

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
    // A history copy: an inline x-deal-v0 block naming the audience and the deal, no report text, no payload.
    for (const d of PICKED) {
      expect(ext(SHAREABLE).deals[d].extensions["x-deal-v0"]).toEqual({ audience: "history", deal_id: d });
      expect(H.sealedOrInlineReport(ext(SHAREABLE).deals[d]).audience).toBe("history");
      expect(H.payloadDisclosed(ext(SHAREABLE).deals[d])).toBe(false);
    }
    const keep = ext(read("history-keep")).deals;
    expect("sealed_report" in keep[D.private].extensions["x-deal-v0"]).toBe(true); // a sealed report, disclosed
    for (const d of PICKED) {
      expect(H.sealedOrInlineReport(keep[d]).audience).toBe("keep");
      expect(H.payloadDisclosed(keep[d])).toBe(true);
    }
  });
});

describe("the mutant matrix: each real file, in the module", () => {
  for (const [name, [state, findings]] of Object.entries(MATRIX)) {
    it(`${name}: ${state}`, () => {
      const { model, host } = present(read(name), realContext(name));
      expect(model.result.state).toBe(state);
      expect(model.result.findings).toEqual(findings);
      const v = verified(name);
      for (const f of v.findings) if (!(SIGNATURE_ONLY[name] || []).includes(f)) expect(model.result.findings).toContain(f);
      expect(model.result.holder_key).toBe(v.holder_key);
      expect(model.result.signer_keys).toEqual(v.signer_keys);
      // D2/D3: the holder's statements, derived by the page as verify derives them.
      expect(model.result.holder_stated).toEqual(v.holder_stated);
      expect(v.holder_stated).toEqual(["recipient", "steps_after_checkpoint"]);
      expect(model.result.recipient).toBe(v.recipient || "");
      expect(model.result.deals.map((d) => [d.deal_id, d.steps_after_checkpoint])).toEqual(v.deals.map((d) => [d.deal_id, d.steps_after_checkpoint]));
      // not_proven, derived by the page from the withheld payloads, is verify's field exactly.
      expect(model.not_proven).toEqual(v.not_proven || []);
      expect(model.result.not_proven).toEqual(v.not_proven || []);
      expect(state === "card").toBe(v.verdict === "VALID" && v.audience === "history");
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

  it("the card: period, deals, effect status and completeness computed by this page; outcome and action class not proven", () => {
    const { model, host } = present(SHAREABLE, realContext("history-history"));
    const value = (k) => host.L0.querySelector(`[data-history-value="${k}"]`).textContent;
    expect(value("selected_count")).toBe("3");
    expect(value("completeness")).toBe("Not asserted");
    const v = model.result.values;
    expect(value("period")).toBe(`${v.period.from} to ${v.period.to}`);
    expect(v.effect_status).toEqual({ dispatched: 1 });
    const statuses = [...host.L0.querySelectorAll("[data-effect-status]")].map((li) => [li.getAttribute("data-effect-status"), Number(li.querySelector("strong").textContent)]);
    expect(Object.fromEntries(statuses)).toEqual(v.effect_status);
    // Outcome and action class: not proven, in these words, and nothing inferred.
    expect(model.not_proven).toEqual(["outcome", "action_class"]);
    expect(host.L0.querySelector("[data-history-not-proven]").getAttribute("data-history-not-proven")).toBe("outcome action_class");
    expect(value("not_proven:outcome")).toBe(NOT_PROVEN_WORDS);
    expect(value("not_proven:action_class")).toBe(NOT_PROVEN_WORDS);
    expect(host.L0.textContent).not.toMatch(/withheld outcome|outcome evidence|outcome:/i);
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

  it("the two-buyer History: a card of two deals, no effect status stated", () => {
    const { model, host } = present(read("history-two-buyers"), realContext("history-two-buyers"));
    expect(model.result.state).toBe("card");
    expect(host.L0.querySelector('[data-history-value="selected_count"]').textContent).toBe("2");
    expect(host.L0.querySelector('[data-history-value="effect_status"]').textContent).toBe(load().H.WORDS["effect_status.none"]);
    expect(model.not_proven).toEqual(["outcome", "action_class"]);
  });

  it("L2: every signature status is NOT_CHECKED in one wording; digests and the log are checked by this page", () => {
    const { H } = load();
    const { host } = present(SHAREABLE, realContext("history-history"));
    const rows = [...host.L2.querySelectorAll("[data-property]")];
    const status = Object.fromEntries(rows.map((r) => [r.getAttribute("data-property"), r.getAttribute("data-property-status")]));
    const words = (p) => rows.find((r) => r.getAttribute("data-property") === p).lastChild.textContent;
    expect(Object.keys(status)).toEqual(H.PROPERTIES);
    // The page's verifier checks no record signature: every signature status is NOT_CHECKED, in one string.
    for (const p of ["selection_record_signature", "member_signatures", "member_logs"]) {
      expect(status[p]).toBe("NOT_CHECKED");
      expect(words(p)).toBe(`NOT_CHECKED ${SIGNATURE_WORDS}`);
    }
    expect(H.WORDS.signature_not_checked).toBe(SIGNATURE_WORDS);
    expect(H.WORDS.member_not_checked).toBe(SIGNATURE_WORDS);
    expect(H.WORDS["l2.signing"].endsWith(`every signature status here is ${SIGNATURE_WORDS}.`)).toBe(true);
    // The digest and completeness properties: checked by this page.
    for (const p of ["selection_record", "selection_root", "history_log", "selection_sealed", "membership", "member_digests", "member_records"]) {
      expect(status[p]).toBe("PASS");
      expect(words(p)).toBe("PASS holds (checked by this page)");
    }
    expect(status.values).toBe("NOT_PRESENT");
    // What the holder states (D2/D3): never a pass, and the row says no one checks it.
    expect(status.holder_stated).toBe("NOT_CHECKED");
    expect(words("holder_stated")).toBe(`NOT_CHECKED ${H.WORDS.holder_stated_not_checked}`);
    expect(signatureClaims(blocks(host.L2))).toEqual([]);
    expect(host.L0.textContent).not.toMatch(/\bverified\b/i);
  });
});

describe("History Basic wording: L0, T8, the page states and the checks-ran list", () => {
  it("L0 golden: the module's first two lines match section 5.2 exactly", () => {
    const { H } = load();
    for (const c of L0_GOLDEN.cases) {
      let lines;
      if (c.fixture) {
        const { model, host } = present(read(c.fixture), realContext(c.fixture));
        lines = model.result.l0;
        // Drawn first in L0, in this order, before anything else of the card.
        expect([...host.L0.querySelectorAll("[data-history-l0]")].map((e) => e.textContent), c.name).toEqual(c.l0);
        const card = host.L0.querySelector('[data-history="card"]');
        expect(card.children[0].getAttribute("data-history-l0")).toBe("1");
        expect(card.children[1].getAttribute("data-history-l0")).toBe("2");
        expect(card.children[2].getAttribute("data-history-page-state")).toBe("integrity_checked");
      } else {
        const selected = c.selected.map((x) => ({ ...x, agent_input: null }));
        lines = H.l0Lines(H.derive(selected, c.selected_count), H.stepCounts(selected));
      }
      expect(lines, c.name).toEqual(c.l0);
      expect(lines[0]).toBe(L0_TITLE);
    }
  });

  it("K and F: deals with a confirmed record, deals with a failed one; nothing else counts", () => {
    const { H } = load();
    expect([H.COMPLETED_STATUS, H.FAILED_STATUS]).toEqual(["confirmed", "failed"]);
    const sel = (...pairs) => pairs.map(([deal, status]) => ({ deal, record: { timestamp: "2026-01-01T00:00:00Z", effect: { status } } }));
    expect({ ...H.stepCounts(sel(["a", "confirmed"], ["a", "confirmed"], ["b", "failed"], ["b", "confirmed"])) }).toEqual({ completed: 2, failed: 1 });
    expect({ ...H.stepCounts(sel(["a", "dispatched"], ["b", "planned"], ["c", "reverted"])) }).toEqual({ completed: 0, failed: 0 });
  });

  it("T8: the wording grep over the module's strings is 0", () => {
    expect(T8.banned_deal_status.phrases).toEqual(["done", "completed sale", "delivered"]);
    expect(t8(SCRIPT)).toEqual([]);
    const { H } = load();
    const strings = [];
    const walk = (v) => (typeof v === "string" ? strings.push(v) : v && typeof v === "object" && Object.values(v).forEach(walk));
    walk(H.WORDS);
    expect(strings.length).toBeGreaterThan(80);
    expect(t8(strings.join("\n"))).toEqual([]);
    // The grep finds what it is for.
    expect(t8("2 deals done\nDelivered\na completed sale\nitems similar to this one").length).toBe(4);
  });

  it("T8: no rendered text of any file says it either, and the card's first two lines say outcomes are not established", () => {
    for (const name of Object.keys(MATRIX)) {
      const { model, host } = present(read(name), realContext(name));
      expect(t8([host.L0, host.L1, host.L2].map(blocks).join("\n")), name).toEqual([]);
      if (model.result.state === "card") expect(model.result.l0.slice(0, 2).join(" ")).toMatch(/outcomes not established/);
    }
  });

  // One host per page state: checking (the checking model), integrity checked (the card),
  // failed (each refusal), unable to verify (a check that could not run).
  function drawState(pageState) {
    const { H, registered, document } = load();
    const module = registered[0];
    const h = host(document);
    if (pageState === "checking") module.render(H.checkingModel(), h, {});
    else if (pageState === "unable_to_verify") {
      const ctx = { ...standInContext(clone(SHAREABLE)) };
      delete ctx.verification;
      Object.defineProperty(ctx, "verification", { get() { throw new Error("the verifier did not load"); } });
      module.render(module.buildModel(ctx), h, {});
    } else {
      const name = pageState === "failed" ? "history-keep" : "history-history";
      module.render(module.buildModel(realContext(name)), h, {});
    }
    return h;
  }

  it("four page states, each drawn distinctly (FR-32), mapped from the module's outcomes", () => {
    const { H } = load();
    expect([...H.PAGE_STATES]).toEqual(PAGE_STATES);
    const map = Object.fromEntries(["card", "invalid", "mismatch", "not_shareable", "not_checked", "checking"].map((s) => [s, H.pageState(s)]));
    expect(map).toEqual({ card: "integrity_checked", invalid: "failed", mismatch: "failed", not_shareable: "failed", not_checked: "unable_to_verify", checking: "checking" });
    const drawn = PAGE_STATES.map((s) => {
      const h = drawState(s);
      expect(h.L0.getAttribute("data-history-page-state"), s).toBe(s);
      const line = [...h.L0.querySelectorAll("p[data-history-page-state]")];
      expect(line, s).toHaveLength(1);
      expect(line[0].getAttribute("data-history-page-state")).toBe(s);
      expect(line[0].querySelector("strong").textContent).toBe(H.WORDS[`page_state.${s}`]);
      expect(line[0].textContent).toBe(`${H.WORDS[`page_state.${s}`]}. ${H.WORDS[`page_state_note.${s}`]}`);
      // A value only in the integrity-checked state.
      expect(!!h.L0.querySelector("[data-history-value]"), s).toBe(s === "integrity_checked");
      for (const level of [h.L0, h.L1, h.L2]) {
        expect(signatureClaims(blocks(level)), s).toEqual([]);
        expect(t8(blocks(level)), s).toEqual([]);
      }
      return [line[0].textContent, line[0].className, h.L0.innerHTML];
    });
    for (const i of [0, 1, 2]) expect(new Set(drawn.map((d) => d[i])).size).toBe(4);
    // Unable to verify is not a finding about the file: its own title, never "does not check".
    const unable = drawState("unable_to_verify");
    expect(unable.L0.querySelector("h2").textContent).toBe(H.WORDS["not_checked.title"]);
    expect(unable.L0.getAttribute("data-history-state")).toBe("not_checked");
    expect(unable.L0.textContent).not.toContain(H.WORDS["invalid.title"]);
  });

  it("every real file's page state is the mapping of its state", () => {
    const { H } = load();
    for (const name of Object.keys(MATRIX)) {
      const { model, host: h } = present(read(name), realContext(name));
      expect(model.result.page_state, name).toBe(H.pageState(model.result.state));
      expect(h.L0.getAttribute("data-history-page-state"), name).toBe(model.result.page_state);
    }
  });

  it("the checks-ran list (FR-31): exactly what this page checked, what it did not and what is absent", () => {
    const { H } = load();
    const cases = [
      ["history-history", realContext("history-history")],
      ["history-history (no verifier context)", { bundle: SHAREABLE }],
      ["history-keep", realContext("history-keep")],
      ["every signature removed", null],
    ];
    for (const [name, ctx0] of cases) {
      let ctx = ctx0;
      if (!ctx) {
        const b = clone(SHAREABLE);
        for (const m of [b, ...Object.values(ext(b).deals)]) for (const r of m.records) delete r.signature;
        ctx = { bundle: b };
      }
      const { model, host: h } = present(ctx.bundle, ctx);
      const props = model.result.properties;
      const listed = (g) => [...h.L2.querySelectorAll(`[data-history-checks="${g}"] [data-check]`)].map((e) => e.getAttribute("data-check"));
      const want = (statuses) => H.PROPERTIES.filter((p) => statuses.includes(props[p]));
      expect(listed("ran"), name).toEqual(want(["PASS", "FAIL"]));
      expect(listed("not-ran"), name).toEqual(want(["NOT_CHECKED"]));
      expect(listed("absent"), name).toEqual(want(["NOT_PRESENT"]));
      expect([...listed("ran"), ...listed("not-ran"), ...listed("absent")].sort()).toEqual([...H.PROPERTIES].sort());
      // The signature rows are never under "checked by this page", and say who checks them.
      for (const p of ["selection_record_signature", "member_signatures"]) {
        expect(listed("ran"), name).not.toContain(p);
        const row = h.L2.querySelector(`[data-history-checks="not-ran"] [data-check="${p}"]`);
        if (props[p] === "NOT_CHECKED") expect(row.textContent).toBe(`${H.WORDS[`property.${p}`]}: ${SIGNATURE_WORDS}`);
      }
      expect(signatureClaims(blocks(h.L2)), name).toEqual([]);
    }
    // Without a verifier the history log is not listed as checked here.
    const bare = present(SHAREABLE, { bundle: SHAREABLE }).host;
    expect(bare.L2.querySelector('[data-history-checks="not-ran"] [data-check="history_log"]')).not.toBeNull();
    expect(bare.L2.querySelector('[data-history-checks="ran"] [data-check="history_log"]')).toBeNull();
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
    const b = read("history-history");
    const withContext = H.check(b, realContext("history-history")).properties;
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
      expect(aacBundleVerified(ctx.verification), name).toBe(!OUTER_FAILS.includes(name));
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

  // Every rendered text and HTML of a host: never a signature called verified, valid or checked by this page.
  const expectNoSignatureClaim = (h) => {
    for (const level of [h.L0, h.L1, h.L2]) {
      expect(signatureClaims(blocks(level))).toEqual([]);
      expect(signatureClaims(htmlText(level.innerHTML))).toEqual([]);
    }
  };

  it("the outer root signature forged: the context carries no signature verdict, it stays NOT_CHECKED, and nothing calls it verified", () => {
    // AAC's verifyBundle checks no record signature (verify.ts verifyClass1 leaves signature and
    // key_id out of the capsule id and checks neither): the context is the same, and the page
    // cannot say FAIL. capsulectl verify does check it. This pins that gap.
    const b = forgeRootSignature(clone(SHAREABLE));
    const broken = standInContext(b), intact = standInContext(SHAREABLE);
    expect(JSON.stringify(broken.verification)).toBe(JSON.stringify(intact.verification));
    const { model, host: h } = present(b, broken);
    expect(model.result.properties.selection_record_signature).toBe("NOT_CHECKED");
    expect(model.result.properties).toEqual(present(SHAREABLE, intact).model.result.properties);
    expect(model.result.state).toBe("card");
    expectNoSignatureClaim(h);
  });

  it("a member record's signature forged (the selection re-sealed over it): member_signatures NOT_CHECKED, nothing calls it verified", () => {
    const b = forgeMemberSignature(clone(SHAREABLE));
    const { model, host: h } = present(b);
    expect(model.result.state).toBe("card");
    expect(model.result.findings).toEqual([]);
    expect(model.result.properties.member_signatures).toBe("NOT_CHECKED");
    expect(model.result.properties.selection_record_signature).toBe("NOT_CHECKED");
    expectNoSignatureClaim(h);
    // Unforged, the same page: the forgery changes nothing this page can see.
    expect(model.result.properties).toEqual(present(clone(SHAREABLE), standInContext(SHAREABLE)).model.result.properties);
  });

  it("every real file: no rendered text calls a signature verified, valid or checked by this page", () => {
    for (const name of Object.keys(MATRIX)) expectNoSignatureClaim(present(read(name), realContext(name)).host);
  });

  for (const audience of ["counterparty", "adjudicator"]) {
    it(`audience ${audience} (capsulectl refuses it; re-sealed in memory): This History does not check`, () => {
      const b = withAudience("history-history", audience);
      const { model, host: h } = present(b);
      expect(model.result.state).toBe("invalid");
      expect(model.result.findings).toEqual(["selection_audience_not_history"]);
      expect(model.not_proven).toEqual([]);
      expect(h.L0.querySelector('[data-history="card"]')).toBeNull();
      expect(h.L0.querySelector("h2").textContent).toBe(load().H.WORDS["invalid.title"]);
      const words = load().H.WORDS["finding.selection_audience_not_history"];
      expect(h.L0.querySelector("[data-history-error]").textContent).toBe(`${words} [selection_audience_not_history]`);
    });
  }

  it("audience keep (re-sealed in memory): VALID to capsulectl, Not a shareable History here", () => {
    const { model, host: h } = present(withAudience("history-history", "keep"));
    expect(model.result.state).toBe("not_shareable");
    expect(model.result.findings).toEqual(KEEP);
    expect(h.L0.querySelector("h2").textContent).toBe(load().H.WORDS["not_shareable.title"]);
  });

  it("a payload disclosed, or the audience not history: This History does not check, never the card", () => {
    for (const name of ["mutant-payload-disclosed", "mutant-counterparty-member", "mutant-audience-not-history"]) {
      const { model, host: h } = present(read(name), realContext(name));
      expect(model.result.state, name).toBe("invalid");
      expect(h.L0.querySelector("h2").textContent, name).toBe(load().H.WORDS["invalid.title"]);
      expect(h.L0.querySelector('[data-history="card"]'), name).toBeNull();
      expect(verified(name).verdict, name).toBe("INVALID");
    }
  });

  it("audience history: the card", () => {
    const { model, host: h } = present(SHAREABLE);
    expect(model.result.audience).toBe("history");
    expect(model.result.state).toBe("card");
    expect(h.L0.querySelector("[data-history-audience]").textContent).toBe(`${load().H.WORDS["audience.history"]} (history)`);
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
      values.effect_status.failed = values.effect_status.dispatched;
      delete values.effect_status.dispatched;
    }
    ext(b).asserted_result = values;
  };
  // Fields a later head may add, in the sealed selection and in each entry: tolerated, never
  // shown. The selection record is re-sealed over them (agent_input_digest, capsule id,
  // disclosure key, root).
  const UNKNOWN = "unknown-field-not-shown-7f3a";
  const unknownFields = (b, carry) => resealSelection(b, (sealed) => {
    sealed.x_later_field = UNKNOWN;
    sealed.selection.forEach((e) => { e.x_later_field = UNKNOWN; });
  }, carry);
  const floorSteps = (value) => (b) => resealSelection(b, (sealed) => { sealed.selection.find((e) => e.deal_id === FLOOR).steps_after_checkpoint = value; });
  const EDITS = {
    ...Object.fromEntries(Object.keys(MATRIX).map((name) => [name, (b) => Object.assign(b, read(name))])),
    "asserted_result that recomputes": (b) => asserted(b, false),
    "asserted_result with a flipped effect status": (b) => asserted(b, true),
    "a selected deal dropped": (b) => { delete ext(b).deals[D.floor]; },
    "the keep copy of one deal spliced in": (b) => { ext(b).deals[D.closed] = ext(read("history-keep")).deals[D.closed]; },
    "one payload disclosed in a deal's copy": (b) => {
      const kept = ext(read("history-keep")).deals[D.closed];
      const id = Object.keys(kept.disclosures).find((k) => Object.keys(kept.disclosures[k]).length);
      ext(b).deals[D.closed].disclosures[id] = kept.disclosures[id];
    },
    "audience counterparty, re-sealed": (b) => Object.assign(b, withAudience("history-history", "counterparty")),
    "audience adjudicator, re-sealed": (b) => Object.assign(b, withAudience("history-history", "adjudicator")),
    "audience keep, re-sealed": (b) => Object.assign(b, withAudience("history-history", "keep")),
    "the sealed audience alone set to counterparty": (b) => resealSelection(b, (sealed) => { sealed.audience = "counterparty"; }),
    "a member record's signature forged": (b) => forgeMemberSignature(b),
    "the root signature forged": (b) => forgeRootSignature(b),
    "another key under a picked deal's name": (b) => { ext(b).deals[D.closed] = ext(read("mutant-mixed-signer")).deals[D.second_profile]; },
    "the carried selection edited": (b) => { ext(b).selection = ext(b).selection.slice(0, 2); },
    "the sealed selection edited": (b) => {
      const sealed = b.disclosures[ext(b).selection_record].agent_input;
      sealed.selection = sealed.selection.slice(0, 2);
      ext(b).selection = clone(sealed.selection);
    },
    "a nested record header edited": (b) => { ext(b).deals[D.closed].records[0].timestamp = "2026-01-01T00:00:00Z"; },
    "a nested disclosure edited (the keep History)": (b) => {
      Object.assign(b, read("history-keep"));
      const m = ext(b).deals[D.closed];
      const id = Object.keys(m.disclosures).find((k) => "agent_input" in m.disclosures[k]);
      m.disclosures[id].agent_input.body.edited = true;
    },
    "every signature removed": (b) => { for (const m of [b, ...Object.values(ext(b).deals)]) for (const r of m.records) delete r.signature; },
    "every checkpoint removed": (b) => { for (const m of [b, ...Object.values(ext(b).deals)]) delete m.checkpoint; },
    "no selection block": (b) => { delete b.extensions[EXT]; },
    "root set to another id": (b) => { b.root = "0".repeat(64); },
    "checkpoint log id set to a deal's log": (b) => { b.checkpoint.log_id = D.closed; },
    "unknown fields added, carried as sealed": (b) => unknownFields(b, true),
    "unknown fields sealed, not carried": (b) => unknownFields(b, false),
    "the recipient removed, re-sealed": (b) => resealSelection(b, (sealed) => { delete sealed.recipient; }),
    "the recipient blank, re-sealed": (b) => resealSelection(b, (sealed) => { sealed.recipient = "  "; }),
    "the recipient not a string, re-sealed": (b) => resealSelection(b, (sealed) => { sealed.recipient = 7; }),
    "steps_after_checkpoint negative, re-sealed": floorSteps(-1),
    "steps_after_checkpoint as text, re-sealed": floorSteps("1"),
    "steps_after_checkpoint removed, re-sealed": (b) => resealSelection(b, (sealed) => { delete sealed.selection.find((e) => e.deal_id === FLOOR).steps_after_checkpoint; }),
    "steps_after_checkpoint 1.5 (no JCS form; set in place)": (b) => {
      for (const sel of [b.disclosures[ext(b).selection_record].agent_input.selection, ext(b).selection]) sel.find((e) => e.deal_id === FLOOR).steps_after_checkpoint = 1.5;
    },
    "steps_after_checkpoint changed in the carried copy only": (b) => { ext(b).selection[0].steps_after_checkpoint = 99; },
    "log id with another nonce": (b) => { b.completeness_certificate.log_id = read("mutant-wrong-nonce").completeness_certificate.log_id; },
    "log id the fixed deal-history of earlier heads": (b) => { b.checkpoint.log_id = b.completeness_certificate.log_id = "deal-history"; },
    "the keep History (no recipient)": (b) => Object.assign(b, read("history-keep")),
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
      expect(js.not_proven).toEqual(py.not_proven);
      expect(js.page_state).toBe(py.page_state);
      expect(js.l0).toEqual(py.l0);
      // Python prints values with repr, the module with JSON; the reason itself is the same.
      const head = (e) => e.split(/: /)[0];
      expect(js.findings.map(head)).toEqual(py.findings.map(head));
    });
  }

  it("each state, for the edits", () => {
    const state = (edit) => { const b = clone(SHAREABLE); edit(b); return present(b).model.result.state; };
    expect(state(EDITS["asserted_result that recomputes"])).toBe("card");
    expect(state(EDITS["asserted_result with a flipped effect status"])).toBe("mismatch");
    expect(state(EDITS["a selected deal dropped"])).toBe("not_shareable");
    expect(state(EDITS["the keep copy of one deal spliced in"])).toBe("invalid");
    expect(state(EDITS["one payload disclosed in a deal's copy"])).toBe("invalid");
    expect(state(EDITS["audience counterparty, re-sealed"])).toBe("invalid");
    expect(state(EDITS["audience adjudicator, re-sealed"])).toBe("invalid");
    expect(state(EDITS["audience keep, re-sealed"])).toBe("not_shareable");
    expect(state(EDITS["the sealed audience alone set to counterparty"])).toBe("invalid");
    expect(state(EDITS["a member record's signature forged"])).toBe("card");
    expect(state(EDITS["the root signature forged"])).toBe("card");
    expect(state(EDITS["another key under a picked deal's name"])).toBe("not_shareable");
    expect(state(EDITS["every signature removed"])).toBe("invalid");
    expect(state(EDITS["every checkpoint removed"])).toBe("invalid");
    expect(state(EDITS["root set to another id"])).toBe("invalid");
    expect(state(EDITS["checkpoint log id set to a deal's log"])).toBe("invalid");
    expect(state(EDITS["unknown fields sealed, not carried"])).toBe("invalid");
    expect(state(EDITS["unknown fields added, carried as sealed"])).toBe("card");
    for (const name of Object.keys(EDITS).filter((n) => /^the recipient|^steps_after_checkpoint|^log id/.test(n))) expect(state(EDITS[name]), name).toBe("invalid");
    expect(state(EDITS["the keep History (no recipient)"])).toBe("not_shareable");
  });

  it("D2/D3/D4 findings, named as capsulectl names them", () => {
    const findings = (edit) => { const b = clone(SHAREABLE); edit(b); return present(b).model.result.findings; };
    for (const name of ["the recipient removed, re-sealed", "the recipient blank, re-sealed", "the recipient not a string, re-sealed"]) {
      expect(findings(EDITS[name]), name).toEqual(["selection_recipient_missing"]);
    }
    for (const name of ["steps_after_checkpoint negative, re-sealed", "steps_after_checkpoint as text, re-sealed", "steps_after_checkpoint removed, re-sealed"]) {
      expect(findings(EDITS[name]), name).toEqual([`selection_entry_malformed:${FLOOR}`, `deal_not_in_selection:${FLOOR}`]);
    }
    // 1.5 has no JCS form, so the sealed selection no longer matches its digest either.
    const fractional = findings(EDITS["steps_after_checkpoint 1.5 (no JCS form; set in place)"]);
    for (const f of [`selection_entry_malformed:${FLOOR}`, `deal_not_in_selection:${FLOOR}`]) expect(fractional).toContain(f);
    expect(findings(EDITS["steps_after_checkpoint changed in the carried copy only"])).toEqual(["selection_not_sealed"]);
    expect(findings(EDITS["log id with another nonce"])).toEqual(["not_a_history_log"]);
    expect(findings(EDITS["log id the fixed deal-history of earlier heads"])).toEqual(["not_a_history_log"]);
    const { H } = load();
    expect([0, 1, 7].map(H.stepCount)).toEqual([0, 1, 7]);
    expect([-1, 1.5, "1", true, null, undefined, 2 ** 53].map(H.stepCount)).toEqual([null, null, null, null, null, null, null]);
  });

  it("the holder's statements: shown as the holder's, never as checked; unknown fields never shown", () => {
    const { H } = load();
    const { model, host } = present(SHAREABLE, realContext("history-history"));
    expect(model.result.state).toBe("card");
    // D2: who the History is for, in L0, as the holder states it.
    expect(model.result.recipient).toBe(CUT.recipient["history-history"]);
    expect(host.L0.querySelector("[data-history-recipient]").textContent).toBe(`For ${CUT.recipient["history-history"]}, as stated by the holder`);
    expect(H.WORDS.recipient).toBe("For {recipient}, as stated by the holder");
    // D3: the floor deal (1 step after its checkpoint) and only it says later steps exist.
    const later = [...host.L1.querySelectorAll("[data-history-later-steps]")].map((e) => e.closest("[data-deal]").getAttribute("data-deal"));
    expect(later).toEqual([FLOOR]);
    expect(host.L1.querySelector("[data-history-later-steps]").textContent).toBe(" (later steps exist, per the holder)");
    expect(H.WORDS["l1.later_steps"]).toBe("later steps exist, per the holder");
    // Never as checked: the property is NOT_CHECKED, and no rendered line calls either statement checked or verified.
    expect(model.result.properties.holder_stated).toBe("NOT_CHECKED");
    const lines = blocks(host.L0).split("\n").concat(blocks(host.L1).split("\n")).filter((l) => /as stated by the holder|per the holder/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).not.toMatch(/verified|checked|valid/i);
    // The two-buyer History: for buyer B, no deal with later steps.
    const two = present(read("history-two-buyers"), realContext("history-two-buyers")).host;
    expect(two.L0.querySelector("[data-history-recipient]").textContent).toBe(`For ${CUT.recipient["history-two-buyers"]}, as stated by the holder`);
    expect(two.L1.querySelector("[data-history-later-steps]")).toBeNull();
    // No card, no recipient line: a refusal shows no statement of the file's.
    const keep = present(read("history-keep"), realContext("history-keep")).host;
    expect(keep.L0.querySelector("[data-history-recipient]")).toBeNull();
    // Unknown fields: the card renders, unchanged, and the field is never shown.
    const b = clone(SHAREABLE);
    EDITS["unknown fields added, carried as sealed"](b);
    const u = present(b);
    expect(u.model.result.state).toBe("card");
    expect(u.model.result.values).toEqual(present(clone(SHAREABLE)).model.result.values);
    const all = [u.host.L0, u.host.L1, u.host.L2].map((h) => h.innerHTML).join("");
    expect(all).not.toContain(UNKNOWN);
    expect(all).not.toContain("x_later_field");
  });
});

// In a real browser: the module rendered into a host on a page with the kit's
// stylesheet, at a phone's and a desktop's width.
const chromePath = findChrome();
if (!chromePath && process.env.CI) throw new Error("history card test: no Chromium found under CI; set CHROME_PATH");
if (!chromePath) console.warn("SKIPPED history card in headless Chromium: no Chromium found (set CHROME_PATH to run it)");

// Every real file, and the two forged signatures (in memory; each still a card).
const FORGED_ROOT = "forged root signature (in memory)";
const FORGED_MEMBER = "forged member signature (in memory)";
const CHECKING = "checking (before the model is built)";
const UNABLE = "the check could not run (in memory)";
const PAGES = { ...MATRIX, [FORGED_ROOT]: ["card", []], [FORGED_MEMBER]: ["card", []] };
// The page check state each page draws (FR-32), and the two pages that draw the other two.
const PAGE_STATE = Object.fromEntries(Object.entries(PAGES).map(([name, [state]]) => [name, state === "card" ? "integrity_checked" : "failed"]));
const STATE_PAGES = { [CHECKING]: "checking", [UNABLE]: "unable_to_verify" };
const COUNT = { "history-history": "3", "history-two-buyers": "2", [FORGED_ROOT]: "3", [FORGED_MEMBER]: "3" };
const PAGE_CONTEXT = {
  [FORGED_ROOT]: () => { const b = forgeRootSignature(clone(SHAREABLE)); return standInContext(b); },
  [FORGED_MEMBER]: () => standInContext(forgeMemberSignature(clone(SHAREABLE))),
};

const drawnStates = {};
describe.skipIf(!chromePath)("the module in headless Chromium", () => {
  let browser;
  let tab;
  let dir;
  const urls = {};
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cv-history-page-"));
    const css = execFileSync(PY, ["-c", "from capsule_viewer.kit import kit_css; print(kit_css())"], { cwd: ROOT, env: PY_ENV, encoding: "utf8" });
    for (const name of [...Object.keys(PAGES), ...Object.keys(STATE_PAGES)]) {
      // The context, as data: the module reads its bundle, root, verification and completeness.
      const ctx = PAGE_CONTEXT[name] ? PAGE_CONTEXT[name]() : STATE_PAGES[name] ? standInContext(SHAREABLE) : realContext(name);
      const data = JSON.stringify(ctx).replace(/</g, "\\u003c");
      // The checking page renders the checking model; the unable page's verifier throws when read.
      const run = name === CHECKING ? "m.render(window.CapsuleViewerHistory.checkingModel(), host, {});"
        : (name === UNABLE ? 'Object.defineProperty(ctx, "verification", { get: function () { throw new Error("the verifier did not load"); } }); ' : "") +
          "if (m.canRender(ctx)) m.render(m.buildModel(ctx), host, {});";
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>
<body class="cv-kit"><main class="cv-page"><div data-level="L0"></div><div data-level="L1"></div><div data-level="L2"></div></main>
<script>var EvidenceGraph = { registerPresentation: function (m) { window.__history = m; } };</script>
<script>${SCRIPT}</script>
<script>(function () { var m = window.__history, ctx = ${data}, q = function (l) { return document.querySelector('[data-level="' + l + '"]'); };
var host = { L0: q("L0"), L1: q("L1"), L2: q("L2"), depth: "L0" }; ${run} })();</script></body></html>`;
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
    pageState: document.querySelector('[data-level="L0"]').getAttribute("data-history-page-state"),
    drawn: [...document.querySelectorAll("[data-history-page-state]")].filter((e) => e.tagName === "P").map((e) => [e.getAttribute("data-history-page-state"), e.querySelector("strong").innerText, getComputedStyle(e).borderLeftColor + getComputedStyle(e).backgroundColor + getComputedStyle(e).color]),
    l0: [...document.querySelectorAll("[data-history-l0]")].map((e) => e.innerText),
    card: !!document.querySelector('[data-history="card"]'),
    count: (document.querySelector('[data-history-value="selected_count"]') || {}).textContent || null,
    errors: [...document.querySelectorAll("[data-history-error]")].map((e) => e.getAttribute("data-history-error")),
    limitation: (document.querySelector("[data-history-limitation]") || {}).textContent || null,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    text: [...document.querySelectorAll("main h2, main h3, main p, main li, main tr, main dt, main dd, main summary")].map((e) => e.innerText).join("\\n"),
    html: document.querySelector("main").outerHTML,
  }))()`;

  for (const width of [390, 1280]) {
    for (const [name, [state, findings]] of Object.entries(PAGES)) {
      it(`${name} at ${width}px: ${state}`, async () => {
        await tab.open(urls[name], { width });
        const m = await tab.evaluate(STATE);
        expect(m).toMatchObject({ state, card: state === "card", count: state === "card" ? COUNT[name] : null, errors: findings, limitation: state === "card" ? LIMITATION : null, overflow: false });
        // Nothing in the Chromium page calls a signature verified, valid or checked by this page.
        expect(signatureClaims(m.text)).toEqual([]);
        expect(signatureClaims(htmlText(m.html))).toEqual([]);
        // FR-32: the page check state, drawn once; FR-7a: the card's first line says outcomes are not established.
        expect(m.pageState).toBe(PAGE_STATE[name]);
        expect(m.drawn.map((d) => d[0])).toEqual([PAGE_STATE[name]]);
        if (state === "card") expect(m.l0[0]).toBe(L0_TITLE);
        else expect(m.l0).toEqual([]);
        expect(t8(m.text)).toEqual([]);
        drawnStates[`${width}:${m.drawn[0][0]}`] = m.drawn[0].slice(1);
      }, 30000);
    }
    for (const [name, pageState] of Object.entries(STATE_PAGES)) {
      it(`${name} at ${width}px: ${pageState}`, async () => {
        await tab.open(urls[name], { width });
        const m = await tab.evaluate(STATE);
        expect(m).toMatchObject({ pageState, card: false, count: null, overflow: false, l0: [] });
        expect(m.drawn.map((d) => d[0])).toEqual([pageState]);
        expect(m.text).not.toMatch(/data-history-value/);
        expect(t8(m.text)).toEqual([]);
        expect(signatureClaims(m.text)).toEqual([]);
        drawnStates[`${width}:${pageState}`] = m.drawn[0].slice(1);
      }, 30000);
    }
    it(`the four page states at ${width}px are drawn distinctly (label and colours)`, () => {
      const four = PAGE_STATES.map((s) => drawnStates[`${width}:${s}`]);
      expect(four.every(Boolean)).toBe(true);
      expect(new Set(four.map((d) => d[0])).size).toBe(4);
      expect(new Set(four.map((d) => d[1])).size).toBe(4);
    });
  }
});
