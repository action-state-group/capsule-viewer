// SPDX-License-Identifier: Apache-2.0
// capsule-viewer#383 (Sherlock2's ruling on the deal-view lines the viewer
// gains): the x-deal-v0 buyer receipt and seller copy say how the payment
// settled, by rail, with a Lightning proof checked by the page's runtime
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
function stub(context, { legs = {}, preimages = {}, withhold = [], bodies = {}, blocks = {} }) {
  const pick = (table, id) => Object.entries(table).find(([k]) => id.startsWith(k))?.[1];
  const records = context.records.map((r) => (pick(legs, r.capsule_id) ? { ...r, settlement: pick(legs, r.capsule_id) } : r));
  const resolved = new Map(context.resolvedDisclosures);
  for (const [id, entry] of resolved) {
    if (withhold.some((p) => id.startsWith(p))) {
      resolved.set(id, { ...entry, agent_input: { state: "withheld" } });
      continue;
    }
    const preimage = pick(preimages, id);
    // `bodies` (same keys) merges members into the disclosed agent_input's body.
    // `blocks` (same keys) merges members into its x-deal-v0 block (its record_type, say).
    const patch = { ...(pick(bodies, id) || {}), ...(preimage === undefined ? {} : { preimage }) };
    const block = pick(blocks, id);
    if ((!Object.keys(patch).length && !block) || entry.agent_input.state !== "disclosed") continue;
    const payload = entry.agent_input.payload;
    const deal = block ? { "x-deal-v0": { ...payload["x-deal-v0"], ...block } } : {};
    resolved.set(id, { ...entry, agent_input: { state: "disclosed", payload: { ...payload, ...deal, body: { ...payload.body, ...patch } } } });
  }
  return { ...context, records, resolvedDisclosures: resolved };
}

// The module as a page runs it (no verifier's assurance given), with the
// runtime's preimage check (`check`: the real one, a stand-in, or none).
async function draw(name, { audience = "keep", kind = "unilateral", check = paymentPreimageCheck, reportCheck, unreported = false, ...stubbed } = {}) {
  const c = receiptGolden().cases.find((x) => x.name === name && x.audience === audience);
  const lib = loadScript(kind);
  if (check) lib.window.EvidenceGraph.paymentPreimageCheck = check;
  if (reportCheck) lib.window.EvidenceGraph.dealStandaloneReport = reportCheck;
  const { context, env } = caseInputs(c);
  // The stubbed context is a new object: it takes the fixture's verifier result.
  const module = lib.api.createModule(kind, { audience: env.audience, verification: () => env.verification(context) });
  const ctx = stub(context, stubbed);
  // `unreported`: the context's verifier reports no check of the standalone
  // report, as a page's runtime does not, so the module asks the page for it.
  if (unreported) ctx.verification = { ...ctx.verification, extensions: ctx.verification.extensions.filter((x) => x.kind !== "x-deal-v0") };
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
    expect(text).toBe("Payment: settled on Lightning; this page checked its proof against its invoice. Size: $10 – $99.");
  });

  it("says the proof did not match when any leg's check answers FAIL", async () => {
    const legs = { ...TWO, "3ad3f14b": leg({ ref: { type: "ln.payment_hash", value: OTHER_HASH } }) };
    const { state, text } = await draw("keep", { legs, preimages: BOTH });
    expect(state).toBe("failed");
    expect(text).toMatch(/^Payment: recorded as settled on Lightning, but its proof did not match its invoice when this page checked it\./);
  });

  it("says this copy does not show the proof when a leg's record is withheld", async () => {
    let asked = 0;
    const { state, text } = await draw("keep", { legs: TWO, preimages: BOTH, withhold: ["3ad3f14b"], check: async () => { asked += 1; return "PASS"; } });
    expect(asked).toBe(0);
    expect(state).toBe("withheld");
    expect(text).toMatch(/^Payment: recorded as settled on Lightning; this copy does not show its proof\./);
  });

  it("says the wallet reported it final when no leg carries a preimage", async () => {
    const { state, text } = await draw("keep", { legs: TWO });
    expect(state).toBe("final");
    expect(text).toMatch(/^Payment: the payee's wallet reported it final on Lightning; this file carries no proof to check\./);
  });

  it("says only some payments carry a proof when some legs do, and checks none", async () => {
    let asked = 0;
    const { state, text } = await draw("keep", { legs: TWO, preimages: { "290b1db4": PREIMAGE }, check: async () => { asked += 1; return "PASS"; } });
    expect(asked).toBe(0);
    expect(state).toBe("partial");
    expect(text).toMatch(/^Payment: recorded as settled on Lightning; this file carries a proof for only some of its payments, so this page checked none of them\./);
  });

  it("claims no check the page did not run: no runtime check, an unchecked answer, a throw", async () => {
    for (const check of [null, async () => "NOT_CHECKED", () => { throw new Error("no SHA-256"); }, async () => { throw new Error("rejected"); }]) {
      const { state, text } = await draw("keep", { legs: TWO, preimages: BOTH, check });
      expect(state).toBe("sealed");
      expect(text).toMatch(/^Payment: recorded as settled on Lightning; its proof is sealed in this file, so this page can't check it\./);
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
    expect((await draw("keep", { legs: x402 })).text).toBe("Payment: recorded as settled on x402; this page does not check the on-chain record. Size: $10 – $99.");
    const mixed = { ...x402, "3ad3f14b": leg() };
    const other = await draw("keep", { legs: mixed });
    expect(other.state).toBe("other");
    expect(other.text).toMatch(/^Payment: recorded as settled; this page can't check payments on this rail\./);
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

  it("names a real rail an action names after a simulated one", async () => {
    // The keep copy's action (290b1db4) names card; its approval (3ad3f14b), which comes
    // before it, is made an action naming the simulated rail, and must not hide the card.
    const { model, state, text } = await draw("keep", { blocks: { "3ad3f14b": { record_type: "action" } }, bodies: { "3ad3f14b": { rail: "simulated" } } });
    const earlier = model.steps.find((s) => s.capsule_id.startsWith("3ad3f14b"));
    expect(earlier.record_type).toBe("action");
    expect(earlier.facts).toContainEqual(expect.objectContaining({ name: "rail", value: "simulated" }));
    expect(state).toBe("missing");
    expect(text).toBe("Payment: a card payment; the card processor's report is not in this file.");
  });

  it("asks the standalone report's check and the proof's together, and uses both answers", async () => {
    let reports = 0, proofs = 0;
    const legs = { f2f75311: leg() };
    const { model, state } = await draw("main-standalone-keep", {
      legs, preimages: { f2f75311: PREIMAGE }, unreported: true,
      reportCheck: async () => { reports += 1; return "pass"; },
      check: async (ref, preimage) => { proofs += 1; return paymentPreimageCheck(ref, preimage); },
    });
    expect([reports, proofs]).toEqual([1, 1]);
    expect(state).toBe("proof");
    expect(model.report_checked).toBe("pass");
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

  describe("the seller copy's payment lines follow it", () => {
    // seller-keep's commit (8690c43a) as a settled leg the seller observed.
    const SALE = { "8690c43a": leg({ received: money("190000"), fee: money("0") }) };
    const sellerLines = async (stubbed) => {
      const c = receiptGolden().cases.find((x) => x.name === "seller-keep" && x.audience === "keep");
      const lib = loadScript("seller");
      lib.window.EvidenceGraph.paymentPreimageCheck = paymentPreimageCheck;
      const { context, env } = caseInputs(c);
      const module = lib.api.createModule("seller", { audience: env.audience, verification: () => env.verification(context) });
      const model = await module.buildModel(stub(context, stubbed));
      const host = renderInto(lib, module, model, "L2");
      const legRow = [...host.L2.querySelectorAll("tr")].find((tr) => tr.firstElementChild && tr.firstElementChild.textContent === "Payment");
      return {
        model,
        line: host.L0.querySelector('[data-rung="settlement"]'),
        headline: host.L0.querySelector('[data-seller-line="payment"]').textContent,
        note: host.L1.querySelector('[data-seller="payment"]').textContent,
        legRow: legRow && legRow.lastElementChild.textContent,
      };
    };

    it("draws the settlement line on the seller copy, and its payment lines agree with it", async () => {
      const proof = await sellerLines({ legs: SALE, preimages: { "8690c43a": PREIMAGE } });
      expect(proof.model.receipt.settlement.state).toBe("proof");
      expect(proof.line.textContent).toBe("Payment: settled on Lightning; this page checked its proof against its invoice. Size: $1,000 – $9,999.");
      expect(proof.headline).toBe("Payment: Settled on Lightning; this page checked its proof against its invoice");
      expect(proof.note).toBe("This copy carries a payment record: the payment line at the top says how it settled and what this page checked. Evidence the seller's agent recorded is listed with its source; this page does not check what it says.");
      expect(proof.legRow).toBe("recorded");
      for (const text of [proof.headline, proof.note, proof.legRow]) expect(text).not.toMatch(/not recorded|no payment record/i);
    });

    it("follows each state of the line in its headline", async () => {
      const cases = [
        [{ legs: SALE }, "final", "Payment: The payee's wallet reported it final on Lightning; this file carries no proof to check"],
        [{ legs: { "8690c43a": leg({ ref: { type: "ln.payment_hash", value: "22".repeat(32) } }) }, preimages: { "8690c43a": PREIMAGE } }, "failed", "Payment: Recorded as settled on Lightning, but its proof did not match its invoice when this page checked it"],
        [{ legs: { ...SALE, "0777698f": leg() }, preimages: { "8690c43a": PREIMAGE } }, "partial", "Payment: Recorded as settled on Lightning; this file carries a proof for only some of its payments, so this page checked none of them"],
        [{ legs: { "8690c43a": leg({ ref: { type: "x402.tx", value: "0xabc" } }) } }, "x402", "Payment: Recorded as settled on x402; this page does not check the on-chain record"],
        [{ legs: { "8690c43a": leg({ ref: { type: "x402.tx", value: "0xabc" } }), "0777698f": leg() } }, "other", "Payment: Recorded as settled; this page can't check payments on this rail"],
      ];
      for (const [stubbed, state, headline] of cases) {
        const got = await sellerLines(stubbed);
        expect(got.model.receipt.settlement.state, state).toBe(state);
        expect(got.headline, state).toBe(headline);
        expect(got.legRow, state).toBe("recorded");
      }
    });

    it("keeps \"not recorded\" with no settled leg, and draws no line", async () => {
      const none = await sellerLines({});
      expect(none.line).toBeNull();
      expect(none.model.receipt.settlement).toBeUndefined();
      expect(none.headline).toBe("Payment: Not recorded in this copy");
      expect(none.note).toMatch(/^This copy carries no payment record\./);
      expect(none.legRow).toBe("not recorded");
      // A leg not settled, or not the payee's, is no payment record either.
      const pending = await sellerLines({ legs: { "8690c43a": leg({ status: "pending" }) } });
      expect(pending.headline).toBe("Payment: Not recorded in this copy");
    });

    it("keeps \"not recorded\" when an action names a rail but no leg settled it", async () => {
      // The evidence record (f4eb6f65, x-deal-v0) is made an action naming the card rail: the line says no settlement record is here.
      const missing = await sellerLines({ blocks: { f4eb6f65: { record_type: "action" } }, bodies: { f4eb6f65: { rail: "card" } } });
      expect(missing.model.receipt.settlement).toEqual({ state: "missing", rail: "card", band: null });
      expect(missing.line.textContent).toBe("Payment: a card payment; the card processor's report is not in this file.");
      expect(missing.headline).toBe("Payment: Not recorded in this copy");
      expect(missing.note).toMatch(/^This copy carries no payment record\./);
      expect(missing.legRow).toBe("not recorded");
    });
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
        expect(text).toBe("Payment: the payee's wallet reported it final on Lightning; this file carries no proof to check.");
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
      expect(text).toBe("Payment: settled on Lightning; this page checked its proof against its invoice. Size: $10 – $99.");
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
