// SPDX-License-Identifier: Apache-2.0
// capsule-viewer#383 (Sherlock2's ruling on the deal-view lines the viewer
// gains): the lines evidencebook's deal view drew on an x-deal-v0 copy, drawn
// by the receipt modules (the buyer receipt and the seller copy), each saying
// only what the page itself checked:
// - line 3: who the deal was with and their words accepting the offer,
//   recomputed against what the deal sealed.
// - line 4: each act came after the holder's yes, recomputed from the order
//   of the copy's deal log.
//
// Where a fixture carries no such data, it is STUBBED onto the stand-in
// context of a real fixture (the sealed report's members, a record's
// disclosed agent_input), as js-tests/receipt_settlement.test.js stubs its
// legs: the module never verifies, so it reads them as it would read a
// verified copy's. Every name, key and nonce is synthetic.
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { caseInputs, loadScript, receiptGolden, renderInto } from "./receiptScripts.js";

// The fixture's records whose capsule id starts with a key of `payloads` have
// their disclosed agent_input replaced by that function's answer; `report`
// merges members into the sealed report (the deal_report record's `report`).
function stub(context, { payloads = {}, report, top } = {}) {
  const pick = (table, id) => Object.entries(table).find(([k]) => id.startsWith(k))?.[1];
  const resolved = new Map(context.resolvedDisclosures);
  for (const [id, entry] of resolved) {
    if (entry.agent_input.state !== "disclosed") continue;
    let payload = entry.agent_input.payload;
    const edit = pick(payloads, id);
    if (edit) payload = edit(structuredClone(payload));
    if (payload && payload.type === "deal_report" && (report || top)) payload = { ...payload, ...(top || {}), report: { ...payload.report, ...(report || {}) } };
    resolved.set(id, { ...entry, agent_input: { state: "disclosed", payload } });
  }
  // A standalone report (x-deal-report/v0) is the bundle's, not a record's.
  let bundle = context.bundle;
  const standalone = bundle.extensions && bundle.extensions["x-deal-report/v0"];
  if (standalone && (report || top)) {
    const content = { ...standalone.agent_input, ...(top || {}), report: { ...standalone.agent_input.report, ...(report || {}) } };
    bundle = { ...bundle, extensions: { ...bundle.extensions, "x-deal-report/v0": { ...standalone, agent_input: content } } };
  }
  return { ...context, bundle, resolvedDisclosures: resolved };
}

// The module as a page runs it, on a fixture's copy, stubbed; drawn at L2.
async function draw(name, { audience = "keep", kind = "unilateral", carrier, ...stubbed } = {}) {
  const c = receiptGolden().cases.find((x) => x.name === name && x.audience === audience);
  const lib = loadScript(kind);
  const { context, env } = caseInputs(c);
  const module = lib.api.createModule(kind, { audience: env.audience, verification: () => env.verification(context) });
  const ctx = stub(context, stubbed);
  expect(await module.canRender(ctx)).toBe(true);
  const model = await module.buildModel(ctx);
  const doc = lib.document;
  const host = { L0: doc.createElement("div"), L1: doc.createElement("div"), L2: doc.createElement("div"), depth: "L2" };
  if (carrier) {
    const panel = doc.createElement("section");
    panel.setAttribute("data-receipt-carrier", carrier);
    panel.append(host.L0, host.L1, host.L2);
    doc.body.append(panel);
  }
  module.render(model, host, {});
  const receipt = model.receipt || model;
  const lines = (rung) => [...host.L0.querySelectorAll(`[data-rung="${rung}"]`)].map((n) => n.textContent);
  return { model, receipt, host, lines };
}

// ---- line 3 -----------------------------------------------------------------

const KEY = "a5".repeat(32);
// dealprofile.Fingerprint over an already normalized value.
const fp = (kind, normalized, key = KEY) => createHmac("sha256", Buffer.from(key, "hex")).update(`x-deal-v0/fp\u0000${kind}\u0000${normalized}`).digest("hex");
const NONCE = "3c".repeat(32);
// dealprofile.CommitText: SHA-256 over JCS({nonce, text}).
const commit = (text, nonce = NONCE) => createHash("sha256").update(JSON.stringify({ nonce, text })).digest("hex");
const ACCEPTANCE = "counterparty-acceptance-observation";
const WORDS = "Yes, the cat sticker is yours for 4 dollars.";

// The keep copy's counterparty_profile (269d0d1c) seals the fingerprints, in
// its x-deal-v0 block; its check (ac2584f7) is made the acceptance.
const sealsIds = (ids) => (p) => ({ ...p, "x-deal-v0": { ...p["x-deal-v0"], counterparty: { ids } } });
const accepts = (text, nonce = NONCE) => (p) => ({ ...p, body: { ...p.body, kind: ACCEPTANCE, content_commitment: commit(text, nonce) } });
const PROFILE = "269d0d1c";
const CHECK = "ac2584f7";
function idOf(name, prefix) {
  const c = receiptGolden().cases.find((x) => x.name === name);
  return caseInputs(c).context.records.map((r) => r.capsule_id).find((id) => id.startsWith(prefix));
}

describe("line 3: who the deal was with and their words accepting (#383)", () => {
  const profile = idOf("keep", PROFILE);
  const check = idOf("keep", CHECK);
  const SEALED = { payee: fp("payee", "example stickers"), domain: fp("domain", "example.com") };

  it("names the other party and quotes their words when each recomputes to what the deal sealed", async () => {
    const { receipt, lines } = await draw("keep", {
      payloads: { [PROFILE]: sealsIds(SEALED), [CHECK]: accepts(WORDS) },
      report: {
        counterparty_openings: { key: KEY, steps: [{ step: profile, payee: "The Example Stickers, Inc.", domain: "https://shop.example.com:8443/cart?x=1" }] },
        acceptance_openings: [{ step: check, nonce: NONCE, text: WORDS }],
      },
    });
    expect(receipt.counterparty_named).toEqual({ who: "The Example Stickers, Inc. (https://shop.example.com:8443/cart?x=1)", unchecked: false, accepted: [{ step: check, text: WORDS }] });
    expect(lines("counterparty")).toEqual(["With The Example Stickers, Inc. (https://shop.example.com:8443/cart?x=1), as this page checked against what the deal sealed for them."]);
    expect(lines("accepted")).toEqual([`Their words accepting the offer, checked in this page against what was sealed: “${WORDS}”`]);
  });

  it("normalizes each kind as dealprofile does before the fingerprint", async () => {
    const cases = [
      ["phone", "(555) 010-0199 ext. 12", "+15550100199"],
      ["phone", "+44 20 7946 0958", "+442079460958"],
      ["email", "  Sales@Example.COM ", "sales@example.com"],
      ["payee", "Sales@Example.com", "sales@example.com"],
      ["payee", "555-010-0199", "+15550100199"],
      ["name", "STRASSE Gmbh", "strasse"],
      ["name", "Straße GmbH", "strasse"],
      ["name", "the Acme co. LLC", "acme"],
      ["domain", "WWW.Example.co.uk.", "example.co.uk"],
      ["domain", "user@mail.example.org", "example.org"],
    ];
    for (const [kind, raw, normalized] of cases) {
      const { receipt } = await draw("keep", {
        payloads: { [PROFILE]: sealsIds({ [kind]: fp(kind, normalized) }) },
        report: { counterparty_openings: { key: KEY, steps: [{ step: profile, [kind]: raw }] } },
      });
      expect(receipt.counterparty_named, `${kind} ${raw}`).toEqual({ who: raw, unchecked: false, accepted: [] });
    }
  });

  it("shows nothing it could not recompute, and says so", async () => {
    const cases = [
      // A value whose fingerprint differs.
      { ids: SEALED, steps: [{ step: profile, payee: "Another Shop" }] },
      // The wrong key.
      { ids: SEALED, key: "b6".repeat(32), steps: [{ step: profile, payee: "Example Stickers" }] },
      // No key at all, or not hex.
      { ids: SEALED, key: null, steps: [{ step: profile, payee: "Example Stickers" }] },
      { ids: SEALED, key: "zz", steps: [{ step: profile, payee: "Example Stickers" }] },
      // A step that seals no fingerprint of that kind, or that is not in the copy.
      { ids: { name: SEALED.payee }, steps: [{ step: profile, payee: "Example Stickers" }] },
      { ids: SEALED, steps: [{ step: "00".repeat(32), payee: "Example Stickers" }] },
      // A name in another script or in punycode: this page does not follow IDNA.
      { ids: { domain: fp("domain", "bücher.example") }, steps: [{ step: profile, domain: "bücher.example" }] },
      { ids: { domain: fp("domain", "xn--bcher-kva.example") }, steps: [{ step: profile, domain: "xn--bcher-kva.example" }] },
    ];
    for (const { ids, key = KEY, steps } of cases) {
      const { receipt, lines } = await draw("keep", {
        payloads: { [PROFILE]: sealsIds(ids) },
        report: { counterparty_openings: { key, steps } },
      });
      expect(receipt.counterparty_named, JSON.stringify(steps)).toEqual({ who: null, unchecked: true, accepted: [] });
      expect(lines("counterparty")).toEqual(["Some of who this exchange was with could not be checked against what the deal sealed, so this page does not show it."]);
    }
  });

  it("lets the last entry for a field decide it, and verifies a step's field once", async () => {
    const later = await draw("keep", {
      payloads: { [PROFILE]: sealsIds(SEALED) },
      report: { counterparty_openings: { key: KEY, steps: [{ step: profile, domain: "example.com" }, { step: check, domain: "example.com" }] } },
    });
    // The check seals no fingerprint: the later entry unnames the domain.
    expect(later.receipt.counterparty_named).toEqual({ who: null, unchecked: true, accepted: [] });
    const twice = await draw("keep", {
      payloads: { [PROFILE]: sealsIds(SEALED) },
      report: { counterparty_openings: { key: KEY, steps: [{ step: profile, payee: "Example Stickers" }, { step: profile, payee: "Example Stickers" }] } },
    });
    expect(twice.receipt.counterparty_named).toEqual({ who: null, unchecked: true, accepted: [] });
    // One field that recomputes still names them, beside the warning for another.
    const mixed = await draw("keep", {
      payloads: { [PROFILE]: sealsIds(SEALED) },
      report: { counterparty_openings: { key: KEY, steps: [{ step: profile, payee: "Example Stickers", domain: "example.net" }] } },
    });
    expect(mixed.receipt.counterparty_named).toEqual({ who: "Example Stickers", unchecked: true, accepted: [] });
    expect(mixed.lines("counterparty")).toHaveLength(2);
  });

  it("quotes no acceptance that does not open to its sealed commitment", async () => {
    const { receipt, lines } = await draw("keep", {
      payloads: { [CHECK]: accepts(WORDS) },
      report: {
        acceptance_openings: [
          { step: check, nonce: NONCE, text: "Yes, for 3 dollars." }, // other words
          { step: check, nonce: NONCE, text: WORDS }, // the step a second time
          { step: profile, nonce: NONCE, text: WORDS }, // a step that is no acceptance
          { step: check }, // no opening
          "not an opening",
        ],
      },
    });
    expect(receipt.counterparty_named.accepted.map((a) => a.text)).toEqual([null, null, null, null, null]);
    expect(lines("accepted")).toEqual(Array(5).fill("Their words accepting the offer could not be checked against what was sealed, so this page does not show them."));
    // The opening that recomputes, alone, is quoted.
    const alone = await draw("keep", { payloads: { [CHECK]: accepts(WORDS) }, report: { acceptance_openings: [{ step: check, nonce: NONCE, text: WORDS }] } });
    expect(alone.lines("accepted")).toHaveLength(1);
    expect(alone.lines("counterparty")).toEqual([]);
  });

  it("does not quote an acceptance whose record is withheld from the copy", async () => {
    // The adjudicator's copy withholds the check (ac2584f7).
    const { receipt } = await draw("adjudicator", { audience: "adjudicator", report: { acceptance_openings: [{ step: idOf("adjudicator", CHECK), nonce: NONCE, text: WORDS }] } });
    expect(receipt.counterparty_named.accepted).toEqual([{ step: idOf("adjudicator", CHECK), text: null }]);
  });

  it("draws on the seller copy too, from its own report", async () => {
    // seller-keep's claim (4b477906) seals the fingerprint, in its x-deal-v0 block.
    const claim = idOf("seller-keep", "4b477906");
    const { receipt, lines } = await draw("seller-keep", {
      kind: "seller",
      payloads: { "4b477906": sealsIds({ name: fp("name", "example buyer a") }) },
      report: { counterparty_openings: { key: KEY, steps: [{ step: claim, name: "Example Buyer A" }] } },
    });
    expect(receipt.counterparty_named.who).toBe("Example Buyer A");
    expect(lines("counterparty")).toEqual(["With Example Buyer A, as this page checked against what the deal sealed for them."]);
  });

  it("draws nothing when the copy opens neither, as capsulectl's counterparty copies do (u499)", async () => {
    for (const [name, kind] of [["counterparty", "unilateral"], ["main-buyer-counterparty", "unilateral"], ["main-standalone-counterparty", "unilateral"], ["main-seller-counterparty", "seller"], ["seller-counterparty", "seller"], ["keep", "unilateral"], ["seller-keep", "seller"]]) {
      const audience = name.includes("counterparty") ? "counterparty" : "keep";
      const c = receiptGolden().cases.find((x) => x.name === name && x.audience === audience);
      const lib = loadScript(kind);
      const { context, env } = caseInputs(c);
      const module = lib.api.createModule(kind, env);
      const model = await module.buildModel(context);
      expect((model.receipt || model).counterparty_named, name).toBeUndefined();
      const host = renderInto(lib, module, model, "L2");
      expect(host.L0.querySelector('[data-rung="counterparty"], [data-rung="accepted"]'), name).toBeNull();
    }
  });
});

// ---- line 4 -----------------------------------------------------------------

// main-standalone-keep places its steps in a book: its check (762d140a, seq 8)
// asks to pay, its verdict (7f8c6534, 10) answers the check, the user's
// approval (42bdb703, 11) proceeds on the verdict, and its action (04a4b4c4,
// 12) is authorized by the approval.
const STANDALONE = "main-standalone-keep";
function digestOf(name, prefix) {
  const c = receiptGolden().cases.find((x) => x.name === name);
  const r = caseInputs(c).context.records.find((x) => x.capsule_id.startsWith(prefix));
  return r.evidence_record_header.payload_commitments[0];
}
const body = (patch) => (p) => ({ ...p, body: { ...p.body, ...patch } });
const block = (patch) => (p) => ({ ...p, "x-deal-v0": { ...p["x-deal-v0"], ...patch } });
const both = (...edits) => (p) => edits.reduce((q, e) => e(q), p);
const OWN_YES = "How each was approved, as recorded: your yes is in your words, recorded by your agent.";

describe("line 4: each act came after the holder's yes (#383)", () => {
  const D = (prefix) => digestOf(STANDALONE, prefix);
  const yes = async (stubbed = {}, opts = {}) => {
    const out = await draw(opts.name || STANDALONE, { audience: opts.audience || "keep", kind: opts.kind || "unilateral", carrier: opts.carrier, ...stubbed });
    const lines = out.lines("after-yes");
    const line = out.host.L0.querySelector('[data-rung="after-yes"]');
    return { yes: out.receipt.after_yes, text: lines[0], count: lines.length, state: line && line.getAttribute("data-after-yes") };
  };

  it("passes when each act follows its approval, which answers the check's verdict first", async () => {
    const { yes: model, text, state } = await yes();
    expect(model).toEqual({ state: "passed", approvers: ["user"] });
    expect(state).toBe("passed");
    expect(text).toBe(`Each act came after your yes: passed, recomputed in this page from the order of this log. ${OWN_YES}`);
  });

  it("fails, naming the act, when an act was sealed without an approval", async () => {
    const cases = [
      { "e4c5d1d2": both(block({ record_type: "outcome", refs: [] }), body({ status: "unchecked_action" })) },
      { "e4c5d1d2": both(block({ record_type: "disclosure", refs: [] }), body({ authority: "none" })) },
      { "e4c5d1d2": both(block({ record_type: "claim", refs: [] }), body({ unchecked: true })) },
    ];
    for (const payloads of cases) {
      const { yes: model, text, state } = await yes({ payloads });
      expect(model.state).toBe("failed");
      expect(model.why).toBe("unapproved");
      expect(model.act.step.startsWith("e4c5d1d2")).toBe(true);
      expect(state).toBe("failed");
      // The act is named by its line in the sealed report.
      expect(text).toBe("Each act came after your yes: failed; “Noted the payee for this profile's own history (never shared)” was taken without your yes.");
    }
  });

  it("fails, naming the act, when it does not follow its approval in this log", async () => {
    const order = "Each act came after your yes: failed; “Pay done, as checked” does not follow its approval in this log.";
    const cases = {
      "the approval does not proceed": { "42bdb703": body({ proceed: false }) },
      "an earlier answer to the same verdict": { "e4c5d1d2": block({ record_type: "approval", refs: [{ rel: "approves", digest: D("7f8c6534") }] }) },
      "standing intent on a verdict that did not pass": { "42bdb703": body({ approver: "standing_intent" }) },
      "the check asked about another act": { "762d140a": body({ action: "refund" }) },
      "the approval names no verdict": { "42bdb703": block({ refs: [] }) },
      "the act cites a step that is not an approval": { "04a4b4c4": block({ refs: [{ rel: "authorized_by", digest: D("e4c5d1d2") }] }) },
      "the act cites a later step": { "04a4b4c4": block({ refs: [{ rel: "authorized_by", digest: D("04a4b4c4") }] }) },
      "the act cites nothing in this log": { "04a4b4c4": block({ refs: [{ rel: "authorized_by", digest: "00".repeat(32) }] }) },
    };
    for (const [why, payloads] of Object.entries(cases)) {
      const { yes: model, text } = await yes({ payloads });
      expect(model, why).toEqual({ state: "failed", why: "order", act: { step: expect.stringMatching(/^04a4b4c4/), action: "pay" }, approvers: [] });
      expect(text, why).toBe(order);
    }
  });

  it("names an act with no sealed line by its action, else as a step", async () => {
    // The report's own step lines are dropped, so the act is named from its record.
    const report = { steps: [] };
    const named = await yes({ report, payloads: { "42bdb703": body({ proceed: false }) } });
    expect(named.text).toBe("Each act came after your yes: failed; the pay step does not follow its approval in this log.");
    const unnamed = await yes({ report, payloads: { "42bdb703": body({ proceed: false }), "04a4b4c4": body({ action: undefined }), "762d140a": body({ action: undefined }) } });
    expect(unnamed.text).toBe("Each act came after your yes: failed; a step does not follow its approval in this log.");
  });

  it("is missing when an approval's check is withheld from the copy", async () => {
    const { yes: model, text, state } = await yes({ payloads: { "762d140a": () => undefined } });
    expect(model).toEqual({ state: "missing", act: { step: expect.stringMatching(/^04a4b4c4/), action: "pay" }, approvers: [] });
    expect(state).toBe("missing");
    expect(text).toBe("Each act came after your yes: missing; the approval for “Pay done, as checked” is not in this copy.");
  });

  it("is not checked when any step is withheld, since that step may be an act", async () => {
    const { yes: model, text, state } = await yes({ payloads: { f2f75311: () => undefined } });
    expect(model).toEqual({ state: "withheld", approvers: ["user"] });
    expect(state).toBe("withheld");
    expect(text).toBe(`Each act came after your yes: not checked; steps are withheld from this copy. ${OWN_YES}`);
  });

  it("is not drawn when the log holds no act and withholds nothing", async () => {
    const { yes: model, count } = await yes({ payloads: { "04a4b4c4": block({ record_type: "intent", refs: [] }) } });
    expect(model).toBeUndefined();
    expect(count).toBe(0);
  });

  it("reads typed records: an evaluation that says DO, or the user's own approval of an ASK", async () => {
    const typed = (type, refs, b) => () => ({ type, refs, body: b });
    const checks = [{ rel: "checks", digest: D("762d140a") }];
    const evaluation = (disposition) => ({
      "7f8c6534": typed("action-evaluation/v0", checks, { disposition }),
      "04a4b4c4": block({ refs: [{ rel: "authorized_by", digest: D("7f8c6534") }] }),
    });
    const go = await yes({ payloads: evaluation("DO") });
    expect(go.yes).toEqual({ state: "passed", approvers: ["task_authority"] });
    expect(go.text).toBe("Each act came after your yes: passed, recomputed in this page from the order of this log. How each was approved, as recorded: allowed by the task you gave your agent, recorded by your agent.");
    expect((await yes({ payloads: evaluation("ASK") })).yes.state).toBe("failed");
    const approval = (authority) => ({
      "7f8c6534": typed("action-evaluation/v0", checks, { disposition: "ASK" }),
      "42bdb703": typed("action-approval/v0", [{ rel: "approves", digest: D("7f8c6534") }], { authority, proceed: true }),
    });
    expect((await yes({ payloads: approval("user_approval") })).yes).toEqual({ state: "passed", approvers: ["user"] });
    expect((await yes({ payloads: approval("standing_rule") })).yes.state).toBe("failed");
  });

  it("names the holder, never \"your\", on another's copy or a page for others", async () => {
    const shared = await yes({}, { carrier: "report" });
    expect(shared.text).toBe("Each act came after the holder's yes: passed, recomputed in this page from the order of this log. How each was approved, as recorded: the holder's yes is in their words, recorded by their agent.");
    const theirs = await yes({}, { name: "main-standalone-counterparty", audience: "counterparty" });
    // The counterparty's copy withholds the act itself: no act is read, and none is approved.
    expect(theirs.yes).toEqual({ state: "withheld", approvers: [] });
    expect(theirs.text).toBe("Each act came after the holder's yes: not checked; steps are withheld from this copy.");
  });

  it("is not checked on a copy whose steps have no place in a book, on either module", async () => {
    for (const [name, kind] of [["keep", "unilateral"], ["seller-keep", "seller"]]) {
      const { yes: model, text } = await yes({}, { name, kind });
      expect(model, name).toEqual({ state: "unplaced", approvers: [] });
      expect(text, name).toBe("Each act came after your yes: not checked; this copy's steps have no place in a book's log.");
    }
  });
});
