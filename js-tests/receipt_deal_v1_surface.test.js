// The v1 receipt's top surface, as Steven's design draws it (capsule-viewer#382), on real copies:
// the ARD run's seller copy of deal-fe219bb1ab3d4dec (tests/testdata/deal-v1/counterparty-copy.bundle.json:
// agreement, payment received, delivery recorded as done, statement) and evidencebook's buyer keep copy
// (keep-copy.bundle.json: the agreement only). Every line says only what the copy holds or what
// capsulectl verify reported; the ladder, the records table and the rests-on lines stay, under
// "For checkers" (L1) and "Technical details" (L2).
//   * the header names the receipt by the holder's role, as its own sealed agreement states it;
//   * the seal and the top line follow Sherlock2's table (buzz 368bf508, 12969602): Done only when
//     settled, every term "both say the same" with value met, and the holder's settle record held;
//     "Didn't go as agreed" only on a final ruling of not met; otherwise no seal, a line in words;
//   * the steps are the records the copy carries, each once, each opening to what it records;
//   * the proof panel is capsulectl's answer per check; the stamps each from their own evidence;
//   * a shared copy, or a page shown to others, never says "your" or shows the holder's time.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLOSE_TIMEOUT_MS, findChrome, launch } from "./headlessChrome.js";
import { loadScript, renderInto, ROOT } from "./receiptScripts.js";

const DATA = join(ROOT, "tests", "testdata", "deal-v1");
const SELLER = JSON.parse(readFileSync(join(DATA, "counterparty-copy.bundle.json"), "utf8"));
const BUYER = JSON.parse(readFileSync(join(DATA, "keep-copy.bundle.json"), "utf8"));
const PASS = { status: "pass", findings: [] };
const ALL_PASS = {
  producer_signatures: PASS, interval_coverage: PASS, graph_closure: PASS, per_record_membership: PASS, checkpoint: PASS,
  witnesses: { status: "withheld", findings: ["witness_receipt_absent"] },
};

// The copy with its report edited by *edit* (the page rechecks no report digest: capsulectl's check is given).
function bundleOf(source, edit = (c) => c, editBundle = () => {}) {
  const b = structuredClone(source);
  const x = b.extensions["x-deal-report/v0"];
  x.agent_input = edit(x.agent_input);
  editBundle(b);
  return b;
}
const asKeep = (c) => ({ ...c, audience: "keep" });
function envOf(over = {}) {
  return {
    audience: null,
    verification: () => ({ verifier: "test", outcome: "verified", checks: [] }),
    assurance: () => ({
      bundle_digest: "cb525e5c".padEnd(60, "0") + "b59a", witnesses: "withheld", countersignatures: [], report_checked: "pass",
      counterparty_half: "verified", checks: ALL_PASS, verify_command: "capsulectl deal verify --bundle receipt.html", ...over,
    }),
  };
}
async function draw(bundle, { assurance = {}, depth = "L2", carrier = null } = {}) {
  const lib = loadScript("deal");
  const module = lib.api.createModule("deal", envOf(assurance));
  const ctx = { bundle, records: bundle.records, resolvedDisclosures: new Map(), root: null, completeness: { memberships: {} } };
  expect(await module.canRender(ctx)).toBe(true);
  const model = await module.buildModel(ctx);
  let host;
  if (carrier === null) host = renderInto(lib, module, model, depth);
  else {
    const doc = lib.document;
    const outer = doc.createElement("div");
    outer.setAttribute("data-receipt-carrier", carrier);
    host = { L0: doc.createElement("div"), L1: doc.createElement("div"), L2: doc.createElement("div"), depth };
    outer.append(host.L0, host.L1, host.L2);
    module.render(model, host, {});
  }
  return { lib, model, host, text: [host.L0, host.L1, host.L2].map((h) => h.textContent).join("\n") };
}
const q = (root, sel) => root.querySelector(sel);
const rows = (over) => (c) => ({ ...c, rows: c.rows.map((r) => ({ ...r, ...over })) });

describe("the header and the top line", () => {
  it("names the receipt by the holder's own sealed role: a seller's copy is a sale receipt", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep));
    expect(q(host.L0, "[data-receipt-title]").textContent).toBe("Sale receipt");
    expect(q(host.L0, '[data-banner="private"]').textContent).toBe("Private: your copy");
    const buyer = await draw(bundleOf(BUYER));
    expect(q(buyer.host.L0, "[data-receipt-title]").textContent).toBe("Order receipt");
  });

  it("a role the agreement's payload does not open is not named: the plain deal receipt", async () => {
    // Both places the agreement's payload can be read from no longer hold the sealed one.
    const b = bundleOf(BUYER, (c) => c, (x) => {
      const agreement = x.extensions["x-deal-v1"].book.agreement;
      agreement.payload.body.role = "seller";
      delete x.extensions["evidencebook/payloads"][agreement.header.payload_commitments[0]];
    });
    const { host, model } = await draw(b);
    expect(model.role).toBe(null);
    expect(q(host.L0, "[data-receipt-title]").textContent).toBe("Deal receipt");
    // A verified half shows the other party's agreement, not its role: the neutral words (#461, Codex round 1).
    expect(q(host.L0, '[data-check="counterparty_half"] .cv-rcpt-proof__label').textContent).toBe("The other side's signed agreement");
    expect(q(host.L0, '[data-else="half"]').textContent).toContain("This copy carries the other side's signed agreement.");
  });

  it("Done: settled, every term both say the same and met, and the holder's payment record held", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep));
    expect(q(host.L0, "svg[data-seal]").getAttribute("data-seal")).toBe("done");
    expect(q(host.L0, "svg[data-seal]").getAttribute("aria-hidden")).toBe("true");
    expect(q(host.L0, "[data-top-line]").textContent).toBe("Sale settled, as your records show");
    expect(q(host.L0, "[data-mood]").textContent).toBe("Done: recorded as settled, and both sides say the same");
    expect(host.L0.textContent).toContain("Intact, not true");
  });

  it("settled with a term only uncontested: the settled line, and no seal (silence is not agreement)", async () => {
    const { host } = await draw(bundleOf(SELLER, (c) => rows({ status: "uncontested" })(asKeep(c))));
    expect(q(host.L0, "svg[data-seal]")).toBeNull();
    expect(q(host.L0, "[data-top-line]").getAttribute("data-top-line")).toBe("settled");
  });

  it("settled with every term not reached: says no term came due, no seal", async () => {
    const { host } = await draw(bundleOf(SELLER, (c) => rows({ status: "not_reached", value: null })(asKeep(c))));
    expect(q(host.L0, "svg[data-seal]")).toBeNull();
    expect(q(host.L0, "[data-top-line]").textContent).toBe("Settled: no term came due");
  });

  it("settled after a conceded failure was remedied: its own line, no seal", async () => {
    const { host } = await draw(bundleOf(SELLER, (c) => ({ ...asKeep(c), rows: [{ ...c.rows[0], value: "not_met", remedy: "made", remedy_made: true }, c.rows[1]] })));
    expect(q(host.L0, "svg[data-seal]")).toBeNull();
    expect(q(host.L0, "[data-top-line]").textContent).toBe("Settled after a remedy: Payment as agreed not met, remedy made");
  });

  it("a final ruling of not met: Didn't go as agreed, the term in words, and its remedy", async () => {
    const ruled = (c) => ({ ...asKeep(c), settled: false, rows: [c.rows[0], { ...c.rows[1], status: "ruled", remedy: "none", ruling: { final: true, value: "not_met", against: "seller" } }] });
    const { host } = await draw(bundleOf(SELLER, ruled));
    expect(q(host.L0, "svg[data-seal]").getAttribute("data-seal")).toBe("not_as_agreed");
    expect(q(host.L0, "[data-mood]").textContent).toBe("Didn't go as agreed");
    expect(q(host.L0, "[data-top-line]").textContent).toBe("Ruled: Delivery not met");
    expect(q(host.L0, "[data-remedy]").getAttribute("data-remedy")).toBe("none");
  });

  it("paid but the terms still waiting for the other side: says so, no seal (the demo's case)", async () => {
    const { host } = await draw(bundleOf(SELLER, (c) => ({ ...rows({ status: "waiting" })(asKeep(c)), settled: false })));
    expect(q(host.L0, "svg[data-seal]")).toBeNull();
    expect(q(host.L0, "[data-top-line]").textContent).toBe("Payment recorded as received. Waiting for the buyer to say it too");
    expect(q(host.L0, "[data-card-status]").textContent).toBe("Waiting for the other side");
  });

  it("in dispute: says so, no seal; never a Waiting-for-you seal on a receipt", async () => {
    const { host, text } = await draw(bundleOf(SELLER, (c) => ({ ...rows({ status: "in_dispute" })(asKeep(c)), settled: false })));
    expect(q(host.L0, "svg[data-seal]")).toBeNull();
    expect(q(host.L0, "[data-top-line]").textContent).toBe("In dispute before the adjudicator");
    expect(text).not.toMatch(/Waiting for you/);
  });

  it("terms all at one status read in plain words, and one step is one step (Sherlock2's design review)", async () => {
    const { host } = await draw(bundleOf(BUYER));
    expect(q(host.L0, "[data-top-line]").textContent).toBe("Nothing is due yet");
    expect(host.L0.textContent).toContain("1 sealed step in this copy.");
    const mixed = await draw(bundleOf(SELLER, (c) => ({ ...asKeep(c), settled: false, rows: [{ ...c.rows[0], status: "not_due", value: null }, { ...c.rows[1], status: "agreed_so_far" }] })));
    expect(q(mixed.host.L0, "[data-top-line]").getAttribute("data-top-line")).toBe("terms");
  });

  it("no top line claims the deal closed or done unless the Done seal is earned", async () => {
    const { host } = await draw(bundleOf(BUYER));
    expect(q(host.L0, "svg[data-seal]")).toBeNull();
    expect(host.L0.textContent).not.toMatch(/closed|\bdone\b/i);
  });
});

describe("the cards and the stamps", () => {
  it("the amount the holder's own payment record states, once, in its recorded asset (u203, #476)", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep));
    const paid = q(host.L0, '[data-card="paid"]');
    expect(q(paid, ".cv-rcpt-card__label").textContent).toBe("Payment");
    expect(q(paid, ".cv-rcpt-card__value").textContent).toBe("2,000 msat");
    expect(q(paid, ".cv-rcpt-card__note").textContent).toBe("Recorded as received");
    expect(q(host.L0, '[data-card="other"]').textContent).toContain("Their signed agreement: checked");
    // The page checks no payment proof: nothing on the surface says "paid" in its own voice.
    expect(host.L0.textContent).not.toMatch(/\bPaid\b/);
  });

  it("a copy with no payment record draws no amount card", async () => {
    const { host } = await draw(bundleOf(BUYER));
    expect(q(host.L0, '[data-card="paid"]')).toBeNull();
  });

  it("RECORDED: capsulectl's checkpoint result, partial when its checkpoint covers fewer steps than the book", async () => {
    const state = async (assurance, edit) => q((await draw(bundleOf(SELLER, edit || asKeep), { assurance })).host.L0, '[data-stamp="recorded"]').getAttribute("data-stamp-state");
    expect(await state({})).toBe("filled");
    expect(await state({ checks: null })).toBe("not_checked");
    expect(await state({ checks: { ...ALL_PASS, checkpoint: { status: "fail", findings: [] } } })).toBe("failed");
    // An MMR of 4 nodes holds 3 leaves; the holder's own book has 4 records.
    const partial = await draw(bundleOf(SELLER, (c) => ({ ...asKeep(c), deal_checkpoint: { ...c.deal_checkpoint, mmr_size: 4 } })));
    expect(q(partial.host.L0, '[data-stamp="recorded"]').textContent).toContain("Checkpointed through step 3 of 4");
  });

  it("TIME-STAMPED: the holder's own book's witness time on the holder's own page only, matching the proof row", async () => {
    const witnessed = { book_witnessed: { status: "verified", witness: "Action State's witness", at: "2026-11-25T14:31:31Z" } };
    const own = await draw(bundleOf(SELLER, asKeep), { assurance: witnessed });
    expect(q(own.host.L0, '[data-stamp="time_stamped"]').getAttribute("data-stamp-state")).toBe("filled");
    expect(q(own.host.L0, '[data-check="witnesses"]').getAttribute("data-check-status")).toBe("pass");
    // The stamp says what was checked; the proof panel names capsulectl as the source (u219, #461).
    expect(q(own.host.L0, '[data-stamp="time_stamped"] .cv-rcpt-stamp__text').textContent).toMatch(/^Action State's witness · .+$/);
    expect(q(own.host.L0, '[data-stamp="time_stamped"]').textContent).not.toContain("capsulectl");
    for (const carrier of ["report", "page"]) {
      const shown = await draw(bundleOf(SELLER, asKeep), { assurance: witnessed, carrier });
      expect(q(shown.host.L0, '[data-stamp="time_stamped"]').getAttribute("data-stamp-state")).toBe("not_checked");
      expect(q(shown.host.L0, '[data-check="witnesses"]').getAttribute("data-check-status")).toBe("absent");
      expect(shown.host.L0.textContent).not.toContain("Action State's witness");
    }
    const theirs = await draw(bundleOf(SELLER), { assurance: witnessed });
    expect(q(theirs.host.L0, '[data-stamp="time_stamped"]').getAttribute("data-stamp-state")).toBe("not_checked");
    const failed = await draw(bundleOf(SELLER, asKeep), { assurance: { book_witnessed: { status: "failed" } } });
    expect(q(failed.host.L0, '[data-stamp="time_stamped"]').getAttribute("data-stamp-state")).toBe("failed");
    expect(q(failed.host.L0, '[data-check="witnesses"]').getAttribute("data-check-status")).toBe("fail");
  });

  it("COUNTERSIGNED never fills from the other side's verified half, nor from a countersignature this page did not check", async () => {
    const none = await draw(bundleOf(SELLER, asKeep));
    expect(q(none.host.L0, '[data-stamp="countersigned"]').getAttribute("data-stamp-state")).toBe("open");
    const unchecked = await draw(bundleOf(SELLER, asKeep), { assurance: { countersignatures: ["unverified"] } });
    expect(q(unchecked.host.L0, '[data-stamp="countersigned"]').getAttribute("data-stamp-state")).toBe("not_checked");
  });
});

describe("what happened, step by step", () => {
  it("one step per record the copy carries, each once, in the copy's order, opening to what it records", async () => {
    const { host, model } = await draw(bundleOf(SELLER, asKeep));
    const steps = [...host.L0.querySelectorAll("[data-step]")];
    // The other side's statement the rows rely on is carried only in the book's relied_on: a step too (#476),
    // after the holder's statement its block says it had seen.
    expect(steps.map((s) => s.getAttribute("data-step-kind"))).toEqual(["agree", "settle", "perform", "statement", "statement"]);
    expect(steps.map((s) => q(s, ".cv-rcpt-step__title").textContent)).toEqual([
      "Deal agreed", "Payment recorded as received: 2,000 msat", "Recorded as done: delivered",
      "You said: Delivery: met; Payment as agreed: met", "The other side said: Delivery: met; Payment as agreed: met",
    ]);
    const relied = Object.keys(SELLER.extensions["x-deal-v1"].book.relied_on);
    const carried = new Set(SELLER.records.map((r) => r.capsule_id).concat(relied));
    expect(model.sealed_steps.map((s) => s.record).sort()).toEqual([...carried].sort());
    const settle = steps[1];
    expect(q(settle, "[data-record-id]").getAttribute("data-record-id")).toBe(SELLER.records[1].capsule_id);
    expect(q(settle, ".cv-rcpt-fullid").textContent).toBe(SELLER.records[1].capsule_id);
    expect(settle.textContent).toContain("payee_observed · settled");
  });

  it("the agreement no term relies on is a step too, and a record whose payload is not the sealed one is withheld", async () => {
    const b = bundleOf(SELLER, asKeep, (x) => {
      const payloads = x.extensions["evidencebook/payloads"];
      const key = Object.keys(payloads).find((k) => JSON.parse(Buffer.from(payloads[k], "base64url").toString())["x-deal-v1"].record_type === "perform");
      payloads[key] = Buffer.from(JSON.stringify({ body: { act: "forged" }, "x-deal-v1": { record_type: "perform" } })).toString("base64url");
    });
    const { host } = await draw(b);
    const kinds = [...host.L0.querySelectorAll("[data-step]")].map((s) => s.getAttribute("data-step-kind"));
    expect(kinds).toEqual(["agree", "settle", "withheld", "statement", "statement"]);
    expect(host.L0.textContent).not.toContain("forged");
    expect(host.L0.textContent).toContain("A sealed step whose contents are not in this copy");
  });

  it("a shared copy, or the holder's copy shown to others, shows no record time (Sherlock2, u239)", async () => {
    for (const drawn of [await draw(bundleOf(SELLER)), await draw(bundleOf(SELLER, asKeep), { carrier: "report" })]) {
      // The report's own "as of" time is the holder's report's, shown on every copy as before; a record's is not.
      expect(drawn.host.L0.querySelector('[data-surface="steps"] [data-time]') === null).toBe(true);
      expect(drawn.host.L0.querySelector('[data-card="paid"] [data-time]') === null).toBe(true);
      expect([...drawn.host.L0.querySelectorAll(".cv-rcpt-step__time")].every((e) => e.textContent === "")).toBe(true);
    }
    const own = await draw(bundleOf(SELLER, asKeep));
    expect(q(own.host.L0, '[data-step="1"] .cv-rcpt-step__time [data-time]').getAttribute("data-time")).toBe("2026-11-25T14:31:25Z");
  });

  it("a shared copy says the holder's words, never 'your'", async () => {
    const { host } = await draw(bundleOf(SELLER));
    expect(q(host.L0, '[data-step="4"] .cv-rcpt-step__title').textContent).toBe("The holder said: Delivery: met; Payment as agreed: met");
    expect(q(host.L0, "[data-top-line]").textContent).toBe("Sale settled, as the holder's records show");
    expect(host.L0.textContent).not.toMatch(/\byour\b/i);
    expect(q(host.L0, '[data-banner="private"]')).toBeNull();
  });
});

describe("is this record intact, and check it yourself", () => {
  it("each check as capsulectl verify reported it, the time stamp row from the same decision as the stamp", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep));
    const shown = [...host.L0.querySelectorAll("[data-check]")].map((r) => [r.getAttribute("data-check"), r.getAttribute("data-check-status")]);
    expect(shown).toEqual([
      ["producer_signatures", "pass"], ["interval_coverage", "pass"], ["graph_closure", "pass"], ["per_record_membership", "pass"], ["checkpoint", "pass"],
      ["counterparty_half", "pass"], ["witnesses", "absent"],
    ]);
    expect(q(host.L0, "[data-proof]").textContent).toBe("Yes. capsulectl verify passed every test when this page was made. The page shows its answer; it did not re-check by itself.");
    expect(host.L0.textContent).not.toMatch(/\bVerified\b/);
  });

  it("no answer from capsulectl: every row is not in this copy and the page says so; a failed check says no", async () => {
    const none = await draw(bundleOf(SELLER, asKeep), { assurance: { checks: null, counterparty_half: null } });
    expect([...none.host.L0.querySelectorAll("[data-check-status]")].every((r) => r.getAttribute("data-check-status") === "absent")).toBe(true);
    expect(q(none.host.L0, "[data-proof]").getAttribute("data-proof")).toBe("none");
    const failed = await draw(bundleOf(SELLER, asKeep), { assurance: { checks: { ...ALL_PASS, graph_closure: { status: "fail", findings: ["x"] } } } });
    expect(q(failed.host.L0, "[data-proof]").getAttribute("data-proof")).toBe("failed");
  });

  it("prints capsulectl's command and the fingerprint to expect; with no command it says how to check", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep));
    expect(q(host.L0, '[data-verify-command="page"]').textContent).toBe("capsulectl deal verify --bundle receipt.html");
    // The downloaded file is checked by its own name, not the page's.
    expect(q(host.L0, '[data-verify-command="download"]').textContent).toBe("capsulectl deal verify --bundle deal-fe219bb1ab3d4dec.bundle.json");
    expect(q(host.L0, "[data-expect]").textContent).toBe("Expect: VALID, fingerprint cb525e5c…b59a.");
    const bare = await draw(bundleOf(SELLER, asKeep), { assurance: { verify_command: null } });
    expect(q(bare.host.L0, '[data-verify-command="page"]')).toBeNull();
    expect(q(bare.host.L0, '[data-verify-command="download"]')).not.toBeNull();
    // A producer selection capsulectl read INCOMPLETE expects that verdict, not VALID.
    const selection = await draw(bundleOf(SELLER, asKeep), { assurance: { verdict: "INCOMPLETE" } });
    expect(q(selection.host.L0, "[data-expect]").textContent).toBe("Expect: INCOMPLETE, fingerprint cb525e5c…b59a.");
  });

  it("Download proof file saves the copy itself: its JCS, which is the file the page carries", async () => {
    const b = bundleOf(SELLER, asKeep);
    const { host, model, lib } = await draw(b);
    const link = q(host.L0, "[data-proof-download]");
    expect(link.getAttribute("download")).toBe("deal-fe219bb1ab3d4dec.bundle.json");
    expect(model.proof_file).toBe(lib.api.jcs(b));
    expect(JSON.parse(model.proof_file)).toEqual(b);
    // jsdom cannot follow the download; the module's own listener runs first and sets the file's URL.
    link.addEventListener("click", (e) => e.preventDefault());
    link.dispatchEvent(new lib.window.MouseEvent("click", { cancelable: true }));
    expect(link.getAttribute("href")).not.toBe("#");
  });
});

describe("review round 1: payments, the summary, countersignatures and withheld terms", () => {
  const settleIndex = SELLER.records.findIndex((r) => r.settlement);
  const withStatus = (status) => (x) => { x.records[settleIndex].settlement.status = status; };

  it("a payment record not settled is never 'received': its title, card and the top line say its status", async () => {
    for (const status of ["pending", "failed", "reversed"]) {
      const { host } = await draw(bundleOf(SELLER, (c) => ({ ...rows({ status: "waiting" })(asKeep(c)), settled: false }), withStatus(status)));
      expect(q(host.L0, '[data-step="2"] .cv-rcpt-step__title').textContent).toBe(`Payment recorded as ${status}: 2,000 msat`);
      expect(q(host.L0, '[data-card="paid"] .cv-rcpt-card__label').textContent).toBe("Payment");
      expect(q(host.L0, '[data-card="paid"]').textContent).toContain(`Recorded as ${status}`);
      expect(q(host.L0, "[data-top-line]").textContent).toBe("Waiting for the buyer to say it too");
    }
    const settled = await draw(bundleOf(SELLER, asKeep, withStatus("pending")));
    expect(q(settled.host.L0, "svg[data-seal]")).toBeNull();
  });

  it("two payment records of the holder's: no amount is picked and no seal is drawn", async () => {
    const b = bundleOf(SELLER, asKeep, (x) => { x.records.push({ ...structuredClone(x.records[settleIndex]), capsule_id: "f".repeat(64) }); });
    const { host } = await draw(b);
    expect(q(host.L0, '[data-card="paid"] .cv-rcpt-card__value').textContent).toBe("2 payment records; see the steps");
    expect(q(host.L0, "svg[data-seal]")).toBeNull();
  });

  it("a check capsulectl ran but withheld for this copy is marked not run, and the summary does not say every test passed", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep), { assurance: { checks: { ...ALL_PASS, interval_coverage: { status: "withheld", findings: ["selection_not_checkable"] } } } });
    expect(q(host.L0, '[data-check="interval_coverage"]').getAttribute("data-check-status")).toBe("withheld");
    expect(q(host.L0, '[data-check="interval_coverage"]').textContent).toContain("not run on this copy");
    expect(q(host.L0, "[data-proof]").getAttribute("data-proof")).toBe("partial");
  });

  it("a failed outside time stamp makes the summary say a test failed, a withheld check beside it or not", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep), { assurance: { book_witnessed: { status: "failed" } } });
    expect(q(host.L0, "[data-proof]").getAttribute("data-proof")).toBe("failed");
    const withheld = { ...ALL_PASS, interval_coverage: { status: "withheld", findings: ["selection_not_checkable"] } };
    const both = await draw(bundleOf(SELLER, asKeep), { assurance: { checks: withheld, book_witnessed: { status: "failed" } } });
    expect(q(both.host.L0, "[data-proof]").getAttribute("data-proof")).toBe("failed");
  });

  it("COUNTERSIGNED: filled only by a resolved signer the page verified; a producer's, an unlisted or a failed one says so", async () => {
    const state = async (countersigned) => {
      const stamp = q((await draw(bundleOf(SELLER, asKeep), { assurance: { countersigned } })).host.L0, '[data-stamp="countersigned"]');
      return [stamp.getAttribute("data-stamp-state"), q(stamp, ".cv-rcpt-stamp__text").textContent];
    };
    const [filled, text] = await state([{ kind: "resolved", name: "Acme Audit", at: "2026-11-25T15:00:00Z" }]);
    expect(filled).toBe("filled");
    expect(text).toMatch(/^Acme Audit signed this record too · .+, by their clock$/);
    // AAC's classifier keeps fractions of a second; the stamp still fills, said to the second.
    const [fraction] = await state([{ kind: "resolved", name: "Acme Audit", at: "2026-11-25T15:00:00.123Z" }]);
    expect(fraction).toBe("filled");
    expect((await state([{ kind: "resolved", name: "Acme Audit", at: "yesterday" }]))[0]).toBe("not_checked");
    expect((await state([{ kind: "invalid", name: null, at: null }]))[0]).toBe("failed");
    expect((await state([{ kind: "not-independent", name: null, at: null }]))[0]).toBe("self");
    expect((await state([{ kind: "unresolved-signer", name: null, at: null }]))[0]).toBe("unresolved");
    expect((await state([{ kind: "unverified", name: null, at: null }]))[0]).toBe("not_checked");
    expect((await state([]))[0]).toBe("open");
  });

  it("an adjudicator's copy, whose terms are withheld, never reads as having no problems", async () => {
    const adj = (c) => ({ ...c, audience: "adjudicator", rows_state: "withheld", rows: [] });
    const b = bundleOf(SELLER, adj, (x) => { x.extensions["x-deal-v1"].book.relied_on = {}; });
    const lib = loadScript("deal");
    const module = lib.api.createModule("deal", { ...envOf(), audience: "adjudicator" });
    const ctx = { bundle: b, records: b.records, resolvedDisclosures: new Map(), root: null, completeness: { memberships: {} } };
    const host = renderInto(lib, module, await module.buildModel(ctx), "L2");
    expect(q(host.L0, '[data-else="problems"]').textContent).toBe("Problems spottedNot shown: each term's status is withheld from this reader");
  });

  it("no record time in any level of a shared copy, the checkers' payment table included (u239)", async () => {
    // The payment term relies on the seller's settle record, so the checkers' payment table has a row.
    const settle = SELLER.records[settleIndex];
    const withLeg = (c) => ({ ...c, rows: c.rows.map((r) => (r.id === "paid_as_agreed" ? { ...r, relied_on: [...r.relied_on, { record: settle.capsule_id, side: "seller", time: null, witnessed: false }] } : r)) });
    const addPair = (x) => { x.extensions["x-deal-v1"].book.relied_on[settle.capsule_id] = { record: structuredClone(settle) }; };
    const shared = await draw(bundleOf(SELLER, withLeg, addPair));
    const legRow = q(shared.host.L1, `[data-leg-record="${settle.capsule_id}"]`).closest("tr");
    expect(legRow.querySelector("[data-time]") === null).toBe(true);
    expect(legRow.textContent).toContain("no time");
    const own = await draw(bundleOf(SELLER, (c) => withLeg(asKeep(c)), addPair));
    expect(q(own.host.L1, `[data-leg-record="${settle.capsule_id}"]`).closest("tr").querySelector("[data-time]") === null).toBe(false);
  });
});

describe("the technical layer stays, under For checkers and Technical details", () => {
  it("L1 lists every sealed record once and the copy's own facts, then where the deal stands and its terms", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep));
    expect(q(host.L1, "summary").textContent).toBe("For checkers: every sealed record");
    const ids = [...host.L1.querySelectorAll("[data-inventory-record]")].map((e) => e.getAttribute("data-inventory-record"));
    // The bundle's records in their order, with the relied-on record the copy carries only in its book (#476).
    const bundled = SELLER.records.map((r) => r.capsule_id);
    expect(ids.filter((id) => bundled.includes(id))).toEqual(bundled);
    expect(ids).toHaveLength(new Set(bundled.concat(Object.keys(SELLER.extensions["x-deal-v1"].book.relied_on))).size);
    expect(q(host.L1, '[data-inventory="facts"]').textContent).toContain("capsuleviewer.receipt.wording.en/v1");
    expect(q(host.L1, '[data-inventory="facts"]').textContent).toContain("Producer versionnot recorded");
    expect(q(host.L1, "[data-deal-state]")).not.toBeNull();
    expect(host.L1.querySelectorAll("[data-row-status]").length).toBe(2);
  });

  it("L2 keeps the ladder of rungs, the records each term rests on and what the report rests on", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep));
    expect(q(host.L2, "summary").textContent).toBe("Technical details");
    expect(q(host.L2, '[data-rung="witness"]')).not.toBeNull();
    expect(q(host.L2, '[data-rung="countersign"]')).not.toBeNull();
    expect(q(host.L2, '[data-cv="verification-details"]')).not.toBeNull();
    expect(host.L2.textContent).toContain("What this report rests on");
    expect(q(host.L2, "[data-pack]")).not.toBeNull();
  });
});

const chromePath = findChrome();
describe.skipIf(!chromePath)("on a phone, in headless Chromium: one column, nothing wider than the screen", () => {
  let browser, tab, dir;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cv-deal-surface-"));
    browser = await launch(chromePath);
    tab = await browser.newPage();
  }, 150000);
  afterAll(async () => {
    if (browser) await browser.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }, CLOSE_TIMEOUT_MS);

  for (const width of [360, 390, 1280]) {
    it(`at ${width}px, every drawer and the technical layers open`, async () => {
      const { lib, host } = await draw(bundleOf(SELLER, asKeep));
      const styles = [...lib.document.head.querySelectorAll("style")].map((s) => s.outerHTML).join("");
      const body = [host.L0, host.L1, host.L2].map((h) => h.innerHTML).join("").replace(/<details(?![^>]*\bopen\b)/g, "<details open");
      const file = join(dir, `surface-${width}.html`);
      writeFileSync(file, `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>receipt</title>${styles}</head><body class="cv-kit"><main class="cv-page">${body}</main></body></html>`);
      await tab.open(pathToFileURL(file).href, { width, media: "screen" });
      await tab.evaluate("document.fonts.ready.then(() => true)");
      // The surface (L0) never scrolls sideways; the checkers' tables may scroll inside their own wrap.
      const overflow = await tab.evaluate(`(() => {
        const limit = document.documentElement.clientWidth + 1;
        return [...document.querySelectorAll('[data-receipt-surface] *')]
          .filter((e) => !e.closest('.cv-table-wrap') && e.getBoundingClientRect().right > limit)
          .map((e) => e.tagName + '.' + e.getAttribute('class'));
      })()`);
      expect(overflow).toEqual([]);
      const columns = await tab.evaluate(`getComputedStyle(document.querySelector('.cv-rcpt-grid')).gridTemplateColumns.split(' ').length`);
      expect(columns).toBe(width <= 720 ? 1 : 2);
    }, 60000);
  }
});

// capsule-viewer#461 (Steven's 11-26 hand run): the receipt names no one the copy does not name, says
// capsulectl once above the fold, and keeps the verify commands.
describe("#461: who and what, and capsulectl said once", () => {
  const witnessed = { book_witnessed: { status: "verified", witness: "Action State's witness", at: "2026-11-25T14:31:31Z" } };
  // "capsulectl" in L0 outside "Check it yourself", whose commands stay (item 3).
  const attributions = (host) => {
    const l0 = host.L0.cloneNode(true);
    l0.querySelector('[data-surface="check"]')?.remove();
    return (l0.textContent.match(/capsulectl/g) || []).length;
  };

  it("item 1: the hero names no party and no item when the copy carries none, and fills nothing in", async () => {
    for (const drawn of [await draw(bundleOf(SELLER, asKeep)), await draw(bundleOf(SELLER)), await draw(bundleOf(BUYER))]) {
      const hero = q(drawn.host.L0, ".cv-rcpt-hero").textContent;
      // The Alder copy's only near hints: the record's operator (the holder's own) and the seller's own perform observation.
      expect(hero).not.toMatch(/alder|badge|ard-/i);
    }
  });

  it("item 2: capsulectl is said once above the fold, by the proof panel, on own, shared, seller and buyer copies", async () => {
    const cases = [
      await draw(bundleOf(SELLER, asKeep), { assurance: witnessed }),
      await draw(bundleOf(SELLER)),
      await draw(bundleOf(SELLER, asKeep), { assurance: witnessed, carrier: "report" }),
      await draw(bundleOf(BUYER, asKeep), { assurance: witnessed }),
      await draw(bundleOf(SELLER, asKeep), { assurance: { ...witnessed, checks: null } }),
      await draw(bundleOf(SELLER, asKeep), { assurance: { ...witnessed, checks: { ...ALL_PASS, graph_closure: { status: "fail", findings: ["x"] } } } }),
    ];
    for (const { host } of cases) {
      expect(attributions(host)).toBe(1);
      expect(q(host.L0, '[data-surface="proof"] [data-proof]').textContent).toContain("capsulectl verify");
    }
  });

  it("item 2: the card, stamp, time stamp row and tile say what was checked", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep), { assurance: witnessed });
    expect(q(host.L0, '[data-card="other"] .cv-rcpt-card__value').textContent).toBe("Their signed agreement: checked");
    expect(q(host.L0, '[data-check="witnesses"] .cv-rcpt-proof__label').textContent).toMatch(/^Witness time stamp: Action State's witness at .+, on your own book$/);
    expect(q(host.L0, '[data-else="half"]').textContent).toContain("This copy carries the buyer's signed agreement. It covers their agreement only, not anything after it.");
    const shared = await draw(bundleOf(SELLER));
    expect(q(shared.host.L0, '[data-else="half"]').textContent).toContain("This copy carries the other side's signed agreement.");
    expect(q(shared.host.L0, '[data-check="counterparty_half"] .cv-rcpt-proof__label').textContent).toBe("The other side's signed agreement");
    const buyer = await draw(bundleOf(BUYER, asKeep));
    expect(q(buyer.host.L0, '[data-check="counterparty_half"] .cv-rcpt-proof__label').textContent).toBe("The seller's signed agreement");
  });

  it("item 2: the other side's agreement is a proof row as capsulectl reported it, and a failed one makes the summary say no", async () => {
    const row = (host) => q(host.L0, '[data-check="counterparty_half"]');
    const lede = (host) => q(host.L0, "[data-proof]");
    const ok = await draw(bundleOf(SELLER, asKeep));
    expect(row(ok.host).getAttribute("data-check-status")).toBe("pass");
    expect(lede(ok.host).getAttribute("data-proof")).toBe("passed");
    const none = await draw(bundleOf(SELLER, asKeep), { assurance: { counterparty_half: null } });
    expect(row(none.host)).toBeNull();
    expect(q(none.host.L0, '[data-card="other"] .cv-rcpt-card__value').textContent).toBe("Not in this copy");
    for (const checks of [ALL_PASS, { ...ALL_PASS, checkpoint: { status: "withheld", findings: [] } }, null]) {
      const failed = await draw(bundleOf(SELLER, asKeep), { assurance: { counterparty_half: "failed", checks } });
      expect(row(failed.host).getAttribute("data-check-status")).toBe("fail");
      expect(lede(failed.host).getAttribute("data-proof")).toBe("failed");
      expect(lede(failed.host).textContent).toBe("No. capsulectl verify failed a test when this page was made. The page shows its answers; it did not re-check by itself.");
    }
  });

  it("item 2: with no per-test answer, the rows capsulectl did answer are still attributed to it", async () => {
    for (const assurance of [{ checks: null }, { checks: null, counterparty_half: null, ...witnessed }]) {
      const { host } = await draw(bundleOf(SELLER, asKeep), { assurance });
      expect(q(host.L0, "[data-proof]").getAttribute("data-proof")).toBe("some");
      expect(q(host.L0, "[data-proof]").textContent).toBe("These are the only answers capsulectl verify gave this page; a test marked – was not among them. Download the proof file and check it yourself.");
    }
    const nothing = await draw(bundleOf(SELLER, asKeep), { assurance: { checks: null, counterparty_half: null } });
    expect(q(nothing.host.L0, "[data-proof]").getAttribute("data-proof")).toBe("none");
  });

  it("item 3: Check it yourself keeps both verify commands", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep), { assurance: witnessed });
    const check = q(host.L0, '[data-surface="check"]');
    expect(q(check, '[data-verify-command="page"]').textContent).toBe("capsulectl deal verify --bundle receipt.html");
    expect(q(check, '[data-verify-command="download"]').textContent).toBe("capsulectl deal verify --bundle deal-fe219bb1ab3d4dec.bundle.json");
  });
});

// The golden pages: the surface (L0, toggles closed) of the holder's own copy, a shared copy, and the buyer's keep
// copy with its sealed offer, each one self-contained HTML page, its styles inlined and no script. The PNGs in
// tests/goldens/ are screenshots of these pages; the pages themselves are checked in beside them
// (receipt-deal-v1-<name>.html, capsule-viewer#509) so a reader outside these tests can open a current deal receipt.
// Fonts differ between machines, so the PNGs' pixels are not compared; the pages' bytes are. Regenerate both with
//   UPDATE_GOLDENS=1 npx vitest run js-tests/receipt_deal_v1_surface.test.js
const GOLDENS = join(ROOT, "tests", "goldens");
const UPDATE = process.env.UPDATE_GOLDENS === "1";
const witnessed = { book_witnessed: { status: "verified", witness: "Action State's witness", at: "2026-11-25T14:31:31Z" } };
const GOLDEN_PAGES = [
  { name: "own", bundle: () => bundleOf(SELLER, asKeep), assurance: witnessed },
  { name: "shared", bundle: () => bundleOf(SELLER), assurance: {} },
  // The buyer's keep copy with the buyer's own sealed offer: the item in the hero (#461 item 1).
  {
    name: "item",
    bundle: () => JSON.parse(readFileSync(join(DATA, "offer", "keep-copy.bundle.json"), "utf8")),
    assurance: { deal_offer: JSON.parse(readFileSync(join(DATA, "offer", "offer.json"), "utf8")) },
  },
];
async function goldenPage(page) {
  const { lib, host } = await draw(page.bundle(), { assurance: page.assurance, depth: "L0" });
  const styles = [...lib.document.head.querySelectorAll("style")].map((e) => e.outerHTML).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>receipt</title>${styles}</head><body class="cv-kit"><main class="cv-page">${host.L0.innerHTML}</main></body></html>\n`;
}

describe("the golden pages are checked in as the receipt draws them now (#509)", () => {
  for (const page of GOLDEN_PAGES) {
    it(`receipt-deal-v1-${page.name}.html`, async () => {
      const html = await goldenPage(page);
      const path = join(GOLDENS, `receipt-deal-v1-${page.name}.html`);
      if (UPDATE) writeFileSync(path, html);
      expect(existsSync(path), `golden ${path} is not committed; run with UPDATE_GOLDENS=1`).toBe(true);
      // A plain equality, not toBe: on a stale page the message is the command, not a 30 kB diff.
      expect(readFileSync(path, "utf8") === html, `golden ${path} differs from what the receipt draws now; run with UPDATE_GOLDENS=1`).toBe(true);
      // Self-contained: no script, nothing loaded from elsewhere.
      expect(html).not.toMatch(/<script|<link|<img|<iframe|\burl\(|@import/i);
    });
  }
});

// #461 in a real browser: on the first screen (900px high, as headlessChrome.js opens every page) the
// surface says capsulectl at most once outside "Check it yourself", at a phone's width and a desktop's.
describe.skipIf(!chromePath)("#461 above the fold, in headless Chromium, with its goldens", () => {
  let browser, tab, dir;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cv-deal-461-"));
    browser = await launch(chromePath);
    tab = await browser.newPage();
  }, 150000);
  afterAll(async () => {
    if (browser) await browser.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }, CLOSE_TIMEOUT_MS);

  for (const width of [390, 1280]) {
    for (const page of GOLDEN_PAGES) {
      it(`the ${page.name} copy at ${width}px`, async () => {
        // The same page the HTML golden holds, so the PNG is a screenshot of the checked-in page.
        const file = join(dir, `${page.name}-${width}.html`);
        writeFileSync(file, await goldenPage(page));
        await tab.open(pathToFileURL(file).href, { width, media: "screen" });
        await tab.evaluate("document.fonts.ready.then(() => true)");
        const said = await tab.evaluate(`(() => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const out = [];
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!/capsulectl/.test(n.textContent) || n.parentElement.closest('[data-surface="check"]')) continue;
            const r = n.parentElement.getBoundingClientRect();
            if (r.top < window.innerHeight && r.height > 0) out.push(n.textContent);
          }
          return out;
        })()`);
        expect(said.length).toBeLessThanOrEqual(1);
        const shot = await tab.screenshot();
        const path = join(GOLDENS, `receipt-deal-v1-${page.name}-${width}.png`);
        if (UPDATE) writeFileSync(path, shot);
        expect(existsSync(path), `golden ${path} is not committed; run with UPDATE_GOLDENS=1`).toBe(true);
        expect(readFileSync(path).readUInt32BE(16)).toBe(width);
      }, 60000);
    }
  }
});

// #461 item 1 at the module: the item from the holder's own sealed offer (tests/testdata/deal-v1/offer, a real deal
// written by capsulectl), drawn only when its SHA-256 over JCS is the digest the copy's own sealed agreement cites.
describe("#461: the item from the holder's sealed offer, in the module", () => {
  const OFFER_DIR = join(DATA, "offer");
  const KEEP = JSON.parse(readFileSync(join(OFFER_DIR, "keep-copy.bundle.json"), "utf8"));
  const OFFER = JSON.parse(readFileSync(join(OFFER_DIR, "offer.json"), "utf8"));
  const ITEM = "200 conference badges, delivered by Friday";
  const item = async (bundle, offer) => {
    const { host, model } = await draw(bundle, { assurance: { deal_offer: offer } });
    return { model: model.item === null ? null : model.item.value, drawn: q(host.L0, ".cv-rcpt-hero [data-hero-item]")?.textContent ?? null, host };
  };
  const edited = (edit) => { const o = structuredClone(OFFER); edit(o); return o; };

  it("the offer the agreement cites: its terms.item, in the hero", async () => {
    const got = await item(structuredClone(KEEP), OFFER);
    expect(got).toMatchObject({ model: ITEM, drawn: ITEM });
  });

  // The agreement re-sealed to cite *offer*, its hash chain redone (payload -> header commitment -> the record's
  // agent_input_digest), as a module sees it: the record's signature is the runtime's to check before any module
  // draws (ts/test/receipt-deal-v1-item.test.ts shows a page refuses such a copy).
  const citing = async (offer) => {
    const { lib } = await draw(structuredClone(KEEP));
    const digest = lib.api.recordDigest;
    const b = structuredClone(KEEP);
    const pair = b.extensions["x-deal-v1"].book.agreement;
    pair.payload.body.offer.digest = digest(offer);
    pair.header.payload_commitments = [digest(pair.payload)];
    const record = b.records.find((r) => r.capsule_id === pair.record.capsule_id);
    record.model_attestation.compute_attestation.agent_input_digest = digest(pair.header);
    pair.record = record;
    return b;
  };

  it("anything else draws no item: none given, another offer, a record that is not a propose record", async () => {
    for (const offer of [undefined, null, "text", edited((o) => { o.body.terms.item = "another"; })]) {
      expect((await item(structuredClone(KEEP), offer)).drawn).toBeNull();
    }
    // Cited by the agreement, but not a propose record.
    const agreeKind = edited((o) => { o["x-deal-v1"].record_type = "agree"; });
    expect((await item(await citing(agreeKind), agreeKind)).drawn).toBeNull();
  });

  it("an offer that is not canonical JSON (a non-integer number) has no digest and draws no item", async () => {
    const { lib } = await draw(structuredClone(KEEP));
    const o = edited((x) => { x.body.terms.quantity = 1.5; });
    expect(lib.api.recordDigest(o)).toBeNull();
    expect((await item(structuredClone(KEEP), o)).drawn).toBeNull();
  });

  it("on an offer the agreement cites: a missing, blank or non-string item draws nothing; a padded one is trimmed", async () => {
    // The chain helper itself works: the agreement now cites a changed offer, and its item is drawn.
    const changed = edited((x) => { x.body.terms.item = "changed"; });
    expect((await item(await citing(changed), changed)).drawn).toBe("changed");
    for (const value of [undefined, "   ", 7, null]) {
      const o = edited((x) => { if (value === undefined) delete x.body.terms.item; else x.body.terms.item = value; });
      expect((await item(await citing(o), o)).drawn).toBeNull();
    }
    const padded = edited((x) => { x.body.terms.item = `  ${ITEM}  `; });
    expect((await item(await citing(padded), padded)).drawn).toBe(ITEM);
  });

  it("an agreement payload that is not the sealed one draws no item, even with the offer it now names", async () => {
    const b = structuredClone(KEEP);
    const forged = edited((o) => { o.body.terms.item = "forged"; });
    const { lib } = await draw(structuredClone(KEEP));
    b.extensions["x-deal-v1"].book.agreement.payload.body.offer.digest = lib.api.recordDigest(forged);
    // The header still commits to the sealed agreement, so the page reads that one, which cites the real offer.
    expect((await item(b, forged)).drawn).toBeNull();
  });

  it("on the holder's own page only: a shared copy, or the holder's copy carried in a report or page, shows no item", async () => {
    const asShared = structuredClone(KEEP);
    const x = asShared.extensions["x-deal-report/v0"];
    x.agent_input = { ...x.agent_input, audience: "counterparty" };
    expect((await item(asShared, OFFER)).drawn).toBeNull();
    for (const carrier of ["report", "page"]) {
      const { host } = await draw(structuredClone(KEEP), { assurance: { deal_offer: OFFER }, carrier });
      expect(q(host.L0, "[data-hero-item]")).toBeNull();
      expect(host.L0.textContent).not.toContain(ITEM);
    }
  });

  it("names nothing about the seller: no key id, no name", async () => {
    const real = await item(structuredClone(KEEP), OFFER);
    const hero = q(real.host.L0, ".cv-rcpt-hero").textContent;
    const counterparty = KEEP.extensions["x-deal-v1"].book.agreement.payload.body.counterparty_key;
    expect(hero).not.toContain(counterparty.slice(0, 8));
    expect(hero.replace(ITEM, "")).not.toMatch(/seller:|from [A-Z]/);
  });
});
