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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  });

  it("Done: settled, every term both say the same and met, and the holder's payment record held", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep));
    expect(q(host.L0, "svg[data-seal]").getAttribute("data-seal")).toBe("done");
    expect(q(host.L0, "svg[data-seal]").getAttribute("aria-hidden")).toBe("true");
    expect(q(host.L0, "[data-top-line]").textContent).toBe("Sale settled, as your records show");
    expect(q(host.L0, "[data-mood]").textContent).toBe("Done: paid, settled, and both sides say the same");
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
    expect(q(host.L0, "[data-top-line]").textContent).toBe("Payment received. Waiting for the buyer to say it too");
    expect(q(host.L0, "[data-card-status]").textContent).toBe("Waiting for the other side");
  });

  it("in dispute: says so, no seal; never a Waiting-for-you seal on a receipt", async () => {
    const { host, text } = await draw(bundleOf(SELLER, (c) => ({ ...rows({ status: "in_dispute" })(asKeep(c)), settled: false })));
    expect(q(host.L0, "svg[data-seal]")).toBeNull();
    expect(q(host.L0, "[data-top-line]").textContent).toBe("In dispute before the adjudicator");
    expect(text).not.toMatch(/Waiting for you/);
  });

  it("no top line claims the deal closed or done unless the Done seal is earned", async () => {
    const { host } = await draw(bundleOf(BUYER));
    expect(q(host.L0, "svg[data-seal]")).toBeNull();
    expect(host.L0.textContent).not.toMatch(/closed|\bdone\b/i);
  });
});

describe("the cards and the stamps", () => {
  it("the amount the holder's own payment record states, in sats and msat, with its time", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep));
    const paid = q(host.L0, '[data-card="paid"]');
    expect(q(paid, ".cv-rcpt-card__label").textContent).toBe("Received");
    expect(q(paid, ".cv-rcpt-card__value").textContent).toBe("2 sats2,000 msat");
    expect(q(host.L0, '[data-card="other"]').textContent).toContain("Their signed agreement checks out");
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
    expect(steps.map((s) => s.getAttribute("data-step-kind"))).toEqual(["agree", "settle", "perform", "statement"]);
    expect(steps.map((s) => q(s, ".cv-rcpt-step__title").textContent)).toEqual([
      "Deal agreed", "Payment received: 2,000 msat", "Recorded as done: delivered", "You said: Delivery: met; Payment as agreed: met",
    ]);
    expect(new Set(model.sealed_steps.map((s) => s.record)).size).toBe(SELLER.records.length);
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
    expect(kinds).toEqual(["agree", "settle", "withheld", "statement"]);
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
      ["producer_signatures", "pass"], ["interval_coverage", "pass"], ["graph_closure", "pass"], ["per_record_membership", "pass"], ["checkpoint", "pass"], ["witnesses", "absent"],
    ]);
    expect(q(host.L0, "[data-proof]").textContent).toBe("Yes. capsulectl verify passed every test when this page was made. The page shows its answer; it did not re-check by itself.");
    expect(host.L0.textContent).not.toMatch(/\bVerified\b/);
  });

  it("no answer from capsulectl: every row is not in this copy and the page says so; a failed check says no", async () => {
    const none = await draw(bundleOf(SELLER, asKeep), { assurance: { checks: null } });
    expect([...none.host.L0.querySelectorAll("[data-check-status]")].every((r) => r.getAttribute("data-check-status") === "absent")).toBe(true);
    expect(q(none.host.L0, "[data-proof]").getAttribute("data-proof")).toBe("none");
    const failed = await draw(bundleOf(SELLER, asKeep), { assurance: { checks: { ...ALL_PASS, graph_closure: { status: "fail", findings: ["x"] } } } });
    expect(q(failed.host.L0, "[data-proof]").getAttribute("data-proof")).toBe("failed");
  });

  it("prints capsulectl's command and the fingerprint to expect; with no command it says how to check", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep));
    expect(q(host.L0, "[data-verify-command]").textContent).toBe("capsulectl deal verify --bundle receipt.html");
    expect(q(host.L0, "[data-expect]").textContent).toBe("Expect: VALID, fingerprint cb525e5c…b59a.");
    const bare = await draw(bundleOf(SELLER, asKeep), { assurance: { verify_command: null } });
    expect(q(bare.host.L0, "[data-verify-command]")).toBeNull();
    expect(bare.host.L0.textContent).toContain("run capsulectl deal verify --bundle on it");
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

describe("the technical layer stays, under For checkers and Technical details", () => {
  it("L1 lists every sealed record once and the copy's own facts, then where the deal stands and its terms", async () => {
    const { host } = await draw(bundleOf(SELLER, asKeep));
    expect(q(host.L1, "summary").textContent).toBe("For checkers: every sealed record");
    const ids = [...host.L1.querySelectorAll("[data-inventory-record]")].map((e) => e.getAttribute("data-inventory-record"));
    expect(ids).toEqual(SELLER.records.map((r) => r.capsule_id));
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
