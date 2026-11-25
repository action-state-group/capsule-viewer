// SPDX-License-Identifier: Apache-2.0
// capsule-viewer#383 (Sherlock2's ruling on the deal-view lines the viewer
// gains): the x-deal-v0 buyer receipt says how the payment settled,
// by rail, with a Lightning proof checked by the page's runtime
// (EvidenceGraph.paymentPreimageCheck, ts/src/payment-preimage.ts) and the
// exchange's size band (ruling u94: one band per exchange, none for a zero or
// absent amount).
//
// No fixture carries a settled leg a receipt module accepts, so the legs here
// are STUBBED onto the stand-in context of a real fixture: a record's
// `settlement` member and its disclosed agent_input's `body.preimage` are set
// on the context the runtime would hand the module, not sealed in a bundle.
// The module never verifies, so it reads them as it would read a verified
// copy's. Every preimage is synthetic ("11" x 32); none is a real settlement's.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paymentPreimageCheck } from "../ts/src/payment-preimage.ts";
import { caseInputs, loadScript, receiptGolden, renderInto } from "./receiptScripts.js";

const PREIMAGE = "11".repeat(32);
const HASH = createHash("sha256").update(Buffer.from(PREIMAGE, "hex")).digest("hex");
const OTHER_HASH = "22".repeat(32);
const BTC = "bip122:000000000019d6689c085ae165831e93/slip44:0";

const money = (value, assetCode = "USD", assetScale = 2) => ({ value, assetCode, assetScale });
const leg = ({ ref = { type: "ln.payment_hash", value: HASH }, received = money("2000"), fee = money("0"), status = "settled", kind = "payee_observed" } = {}) => ({
  version: "0", leg: kind, sealer_role: "payee", payment_ref: ref, received, receive_fee: fee, status, observed_at: "2026-10-30T19:50:00Z",
});

// The fixture's records whose capsule id starts with a key of `legs` carry that
// settlement; `preimages` (same keys) adds body.preimage to the disclosed
// agent_input; `withhold` (prefixes) makes a record's agent_input withheld.
function stub(context, { legs = {}, preimages = {}, withhold = [] }) {
  const pick = (table, id) => Object.entries(table).find(([k]) => id.startsWith(k))?.[1];
  const records = context.records.map((r) => (pick(legs, r.capsule_id) ? { ...r, settlement: pick(legs, r.capsule_id) } : r));
  const resolved = new Map(context.resolvedDisclosures);
  for (const [id, entry] of resolved) {
    if (withhold.some((p) => id.startsWith(p))) {
      resolved.set(id, { ...entry, agent_input: { state: "withheld" } });
      continue;
    }
    const preimage = pick(preimages, id);
    if (preimage === undefined || entry.agent_input.state !== "disclosed") continue;
    const payload = entry.agent_input.payload;
    resolved.set(id, { ...entry, agent_input: { state: "disclosed", payload: { ...payload, body: { ...payload.body, preimage } } } });
  }
  return { ...context, records, resolvedDisclosures: resolved };
}

// The module as a page runs it (no verifier's assurance given), with the
// runtime's preimage check (`check`: the real one, a stand-in, or none).
async function draw(name, { audience = "keep", kind = "unilateral", check = paymentPreimageCheck, ...stubbed } = {}) {
  const c = receiptGolden().cases.find((x) => x.name === name && x.audience === audience);
  const lib = loadScript(kind);
  if (check) lib.window.EvidenceGraph.paymentPreimageCheck = check;
  const { context, env } = caseInputs(c);
  // The stubbed context is a new object: it takes the fixture's verifier result.
  const module = lib.api.createModule(kind, { audience: env.audience, verification: () => env.verification(context) });
  const ctx = stub(context, stubbed);
  expect(await module.canRender(ctx)).toBe(true);
  const model = await module.buildModel(ctx);
  const host = renderInto(lib, module, model, "L2");
  const all = [host.L0, host.L1, host.L2].map((n) => n.textContent).join("\n");
  // A preimage is bearer proof of payment: the page never shows it.
  expect(all).not.toContain(PREIMAGE);
  const line = host.L0.querySelector('[data-rung="settlement"]');
  return { model, line, text: line && line.textContent, state: line && line.getAttribute("data-settlement") };
}

// Two settled legs on the keep copy (its action and its approval record).
const TWO = { "290b1db4": leg(), "3ad3f14b": leg({ received: money("1500"), fee: money("100") }) };
const BOTH = { "290b1db4": PREIMAGE, "3ad3f14b": PREIMAGE };

describe("the settlement line (#383)", () => {
  it("passes the proof when the runtime answers PASS for every leg", async () => {
    const { state, text } = await draw("keep", { legs: TWO, preimages: BOTH });
    expect(state).toBe("proof");
    expect(text).toBe("Payment: settled on Lightning; its proof matches its invoice, checked in this page. Size: $10 – $99.");
  });

  it("says the proof did not match when any leg's check answers FAIL", async () => {
    const legs = { ...TWO, "3ad3f14b": leg({ ref: { type: "ln.payment_hash", value: OTHER_HASH } }) };
    const { state, text } = await draw("keep", { legs, preimages: BOTH });
    expect(state).toBe("failed");
    expect(text).toMatch(/^Payment: settled on Lightning; its proof did not match its invoice in this page's check\./);
  });

  it("says this copy does not show the proof when a leg's record is withheld", async () => {
    let asked = 0;
    const { state, text } = await draw("keep", { legs: TWO, preimages: BOTH, withhold: ["3ad3f14b"], check: async () => { asked += 1; return "PASS"; } });
    expect(asked).toBe(0);
    expect(state).toBe("withheld");
    expect(text).toMatch(/^Payment: settled on Lightning; this copy does not show its proof\./);
  });

  it("says the wallet reported it final when no leg carries a preimage", async () => {
    const { state, text } = await draw("keep", { legs: TWO });
    expect(state).toBe("final");
    expect(text).toMatch(/^Payment: settled on Lightning, as the payee's wallet reported it final; this file carries no proof to check\./);
  });

  it("says the wallet reported it final when only some legs carry a preimage, and asks no check", async () => {
    let asked = 0;
    const { state } = await draw("keep", { legs: TWO, preimages: { "290b1db4": PREIMAGE }, check: async () => { asked += 1; return "PASS"; } });
    expect(asked).toBe(0);
    expect(state).toBe("final");
  });

  it("claims no check the page did not run: no runtime check, an unchecked answer, a throw", async () => {
    for (const check of [null, async () => "NOT_CHECKED", () => { throw new Error("no SHA-256"); }, async () => { throw new Error("rejected"); }]) {
      const { state, text } = await draw("keep", { legs: TWO, preimages: BOTH, check });
      expect(state).toBe("sealed");
      expect(text).toMatch(/^Payment: settled on Lightning; its proof is sealed in this file, and this page can't check it\./);
    }
  });

  it("claims no check when a verifier's report is given instead of the page's own (the twin's inputs)", async () => {
    const c = receiptGolden().cases.find((x) => x.name === "keep" && x.audience === "keep");
    const lib = loadScript("unilateral");
    let asked = 0;
    lib.window.EvidenceGraph.paymentPreimageCheck = async () => { asked += 1; return "PASS"; };
    const { context, env } = caseInputs(c);
    const twin = { ...env, verification: () => env.verification(context), assurance: () => env.assurance(context) };
    const model = await lib.api.createModule("unilateral", twin).buildModel(stub(context, { legs: TWO, preimages: BOTH }));
    expect(asked).toBe(0);
    expect(model.settlement.state).toBe("sealed");
  });

  it("names x402 and another rail without checking either", async () => {
    const x402 = { "290b1db4": leg({ ref: { type: "x402.tx", value: "0xabc" } }) };
    expect((await draw("keep", { legs: x402 })).text).toBe("Payment: settled on x402; the chain lookup is not checked on this page. Size: $10 – $99.");
    const mixed = { ...x402, "3ad3f14b": leg() };
    const other = await draw("keep", { legs: mixed });
    expect(other.state).toBe("other");
    expect(other.text).toMatch(/^Payment: settled; this page checks no settlement on this rail\./);
  });

  it("counts only settled payee-observed legs", async () => {
    const legs = { "290b1db4": leg({ status: "pending" }), "3ad3f14b": leg({ kind: "payer_sent" }) };
    const { state, text } = await draw("keep", { legs });
    // No leg: the disclosed action's rail (card) speaks instead.
    expect(state).toBe("missing");
    expect(text).toBe("Payment: a card payment; the card processor's report is not in this file.");
  });

  it("with no leg, names the rail a disclosed action names", async () => {
    const card = await draw("keep");
    expect(card.state).toBe("missing");
    expect(card.text).toBe("Payment: a card payment; the card processor's report is not in this file.");
  });

  it("says nothing more of test money: the simulated rail draws no line", async () => {
    // Test money is said once, at the top (money.test, the 0.25.0 top line).
    const simulated = await draw("main-standalone-simulated-keep");
    expect(simulated.line).toBeNull();
    expect(simulated.model.settlement).toBeUndefined();
  });

  it("draws no line with neither a leg nor a rail", async () => {
    // The seller's keep copy discloses no action naming a rail.
    const { model, line } = await draw("seller-keep", { kind: "seller" });
    expect(line).toBeNull();
    expect(model.receipt.settlement).toBeUndefined();
  });

  it("draws nothing on the seller copy yet, whose payment lines say not recorded", async () => {
    const legs = { "8690c43a": leg({ received: money("12000", "EUR"), fee: money("0", "EUR") }) };
    const { model, line } = await draw("seller-keep", { kind: "seller", legs });
    expect(line).toBeNull();
    expect(model.receipt.settlement).toBeUndefined();
  });

  describe("the size band (ruling u94)", () => {
    const band = async (legs) => (await draw("keep", { legs })).text.replace(/^.*?\.(?= Size|$)/, "");
    it("sums the legs into one band", async () => {
      expect(await band(TWO)).toBe(" Size: $10 – $99.");
      expect(await band({ "290b1db4": leg({ received: money("950"), fee: money("0") }) })).toBe(" Size: under $10.");
      expect(await band({ "290b1db4": leg({ received: money("123456789"), fee: money("0") }) })).toBe(" Size: $1,000,000 – $9,999,999.");
    });
    it("names Bitcoin by its CAIP-19 id as BTC, in its own units", async () => {
      const sats = { "290b1db4": leg({ received: money("995", BTC, 11), fee: money("5", BTC, 11) }) };
      expect(await band(sats)).toBe(" Size: 0.00000001 to under 0.0000001 BTC.");
    });
    it("draws no band for a zero sum, no amount, mixed currencies or a value that is not a whole number", async () => {
      const cases = [
        { "290b1db4": leg({ received: money("0"), fee: money("0") }) },
        { "290b1db4": { ...leg(), received: undefined, receive_fee: undefined } },
        { "290b1db4": leg({ received: money("2000"), fee: money("100", "EUR") }) },
        { "290b1db4": leg({ received: money("2000"), fee: money("100", "USD", 3) }) },
        { "290b1db4": leg({ received: money("-2000") }) },
        { "290b1db4": leg({ received: money("20.00") }) },
      ];
      for (const legs of cases) {
        const { model, text } = await draw("keep", { legs });
        expect(model.settlement.band).toBeNull();
        expect(text).toBe("Payment: settled on Lightning, as the payee's wallet reported it final; this file carries no proof to check.");
      }
    });
  });

  describe("a counterparty's copy draws only what it discloses", () => {
    it("draws no line when the action naming the rail is withheld", async () => {
      const { line } = await draw("counterparty", { audience: "counterparty" });
      expect(line).toBeNull();
    });
    it("says the proof is not shown when a leg's record is withheld from it", async () => {
      const legs = { "290b1db4": leg(), "3ad3f14b": leg() };
      const { state } = await draw("counterparty", { audience: "counterparty", legs, preimages: { "3ad3f14b": PREIMAGE } });
      expect(state).toBe("withheld");
    });
    it("checks the proof when every leg's record is disclosed in it", async () => {
      const legs = { "3ad3f14b": leg() };
      const { state, text } = await draw("counterparty", { audience: "counterparty", legs, preimages: { "3ad3f14b": PREIMAGE } });
      expect(state).toBe("proof");
      expect(text).toBe("Payment: settled on Lightning; its proof matches its invoice, checked in this page. Size: $10 – $99.");
    });
  });

  it("is not drawn by the bilateral module", async () => {
    const c = receiptGolden().cases.find((x) => x.name === "bilateral-keep" && x.audience === "keep");
    const lib = loadScript("bilateral");
    const { context, env } = caseInputs(c);
    const module = lib.api.createModule("bilateral", env);
    const model = await module.buildModel(context);
    const host = renderInto(lib, module, model, "L2");
    expect(host.L0.querySelector('[data-rung="settlement"]')).toBeNull();
  });
});
