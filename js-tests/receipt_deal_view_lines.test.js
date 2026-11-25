// SPDX-License-Identifier: Apache-2.0
// capsule-viewer#383 (Sherlock2's ruling on the deal-view lines the viewer
// gains): the lines evidencebook's deal view drew on an x-deal-v0 copy, drawn
// by the receipt modules (the buyer receipt and the seller copy), each saying
// only what the page itself checked:
// - line 3: who the deal was with and their words accepting the offer,
//   recomputed against what the deal sealed.
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
  return { ...context, resolvedDisclosures: resolved };
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
