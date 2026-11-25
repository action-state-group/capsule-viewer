// The v1 deal receipt (capsuleviewer.receipt.deal/v1) against evidencebook's
// sealed report, docs/design/461-deal-profile.md section 9: each row's computed
// status is shown as the report gives it, the deal-level line is the start state
// and "settled" or nothing, and a copy that withholds the rows says so. The
// reports here are fixtures written from section 9; they are held to the
// producer's real output once that is on evidencebook main (capsule-viewer#322).
import { describe, expect, it } from "vitest";
import { loadScript, manifestOf, renderInto, KINDS, v1Extension } from "./receiptScripts.js";

const ROW = {
  id: "as_described", owed_by: "seller", owed: {},
  due: "2026-11-04T09:12:00Z", window_end: "2026-11-18T09:12:00Z",
  status: "agreed", value: "met", remedy: null, remedy_made: false, local: false, check: "not_recomputed",
  ruling: null, relied_on: [{ record: "rec-1", side: "buyer", time: "2026-11-03T10:00:00Z", witnessed: true }],
};
const content = (over = {}) => ({
  type: "deal_report", profile: "x-deal-v1", deal_id: "deal-1", audience: "keep", nonce: "0".repeat(64),
  as_of: "2026-11-10T12:00:00Z", deal_checkpoint: { log_id: "l", mmr_size: 7, root: "ab" }, pack_digest: "sha256:pack",
  start: { state: "started", local: false, by: "offerer_in_time" }, settled: false, rows_state: "listed", rows: [ROW],
  rests_on: { own: { log_id: "l", size: 7, last: "rec-1" }, counterparty: { log_id: "m", counted: 6, last: "rec-9", fork_at: 0 }, counterparty_layer: true, witnesses: [] },
  report: { scope: "One deal." },
  ...over,
});
const context = (c, extensions = {}) => ({
  bundle: {
    records: [],
    extensions: {
      "x-deal-v1": v1Extension(c),
      "x-deal-report/v0": { record: { capsule_id: "rep-1", action_id: "capsulectl-deal-report" }, agent_input: c },
      ...extensions,
    },
  },
  records: [], resolvedDisclosures: new Map(), root: null, completeness: { memberships: {} },
});
const env = (audience = null) => ({
  audience,
  verification: () => ({ verifier: "test", outcome: "verified", checks: [] }),
  assurance: () => ({ bundle_digest: "ab".repeat(32), witnesses: "absent", countersignatures: [], report_checked: "pass" }),
});

async function page(c, depth = "L2", audience = null, extensions) {
  const lib = loadScript("deal");
  const module = lib.api.createModule("deal", env(audience));
  const ctx = context(c, extensions);
  if (!(await module.canRender(ctx))) return { lib, module, shown: false };
  const model = await module.buildModel(ctx);
  const host = renderInto(lib, module, model, depth);
  return { lib, module, model, host, shown: true, text: [host.L0, host.L1, host.L2].map((h) => h.textContent).join("\n") };
}

describe("the deal/v1 receipt", () => {
  it("registers one module whose manifest requires x-deal-v1 and forbids x-deal-v0", () => {
    const lib = loadScript("deal");
    expect(lib.registered.map((m) => m.manifest.id)).toEqual(["capsuleviewer.receipt.deal/v1"]);
    const m = manifestOf("deal");
    expect(m.requires.extensions.required).toEqual(["x-deal-v1"]);
    expect(m.forbids.extensions).toContain("x-deal-v0");
    expect(m.audiences).toEqual(["keep", "counterparty", "adjudicator", "*"]);
  });

  it("shows each row's status as the report gives it, and never computes one", async () => {
    const statuses = ["not_reached", "not_due", "no_statement", "waiting", "uncontested", "agreed_so_far", "agreed", "in_disagreement", "in_dispute", "ruled"];
    const rows = statuses.map((status, i) => ({ ...ROW, id: `row_${i}`, status, remedy: status === "ruled" ? "due" : null }));
    const { host } = await page(content({ rows }), "L1");
    const shown = [...host.L1.querySelectorAll("[data-row-status]")].map((e) => [e.closest("tr").querySelector("[data-row-id]").getAttribute("data-row-id"), e.getAttribute("data-row-status")]);
    expect(shown).toEqual(statuses.map((s, i) => [`row_${i}`, s]));
    expect(host.L1.querySelector("th").textContent).toBe("Term");
    expect(host.L1.querySelector('[data-row-status="agreed_so_far"]').textContent).toBe("Both say the same so far");
  });

  it("the deal-level line is the start state, then settled or nothing; no close, no done", async () => {
    const open = await page(content({ settled: false }), "L0");
    expect(open.host.L0.querySelector("[data-deal-state]").getAttribute("data-deal-state")).toBe("started");
    expect(open.host.L0.querySelector("[data-settled]")).toBeNull();
    const done = await page(content({ settled: true }), "L0");
    expect(done.host.L0.querySelector("[data-settled]").textContent).toBe("Settled: every term has both sides saying the same, is uncontested, or is ruled with its remedy made, as the holder computed it.");
    for (const p of [open, done]) expect(p.text).not.toMatch(/closed|close\b/i);
    const waiting = await page(content({ start: { state: "awaiting_agreement", local: false, by: null }, settled: false, rows_state: "not_started", rows: [] }), "L0");
    expect(waiting.host.L0.querySelector("[data-deal-state]").getAttribute("data-deal-state")).toBe("awaiting_agreement");
  });

  it("a settled flag on a deal that has not started shows nothing", async () => {
    const p = await page(content({ start: { state: "not_started", local: false, by: null }, settled: true, rows_state: "not_started", rows: [] }), "L0");
    expect(p.host.L0.querySelector("[data-settled]")).toBeNull();
    expect(p.host.L0.querySelector('[data-rows-state="not_started"]').textContent).toBe("Nothing is agreed yet, so there are no terms to show.");
    expect(p.host.L0.querySelector("h2").textContent).toBe("Receipt report");
  });

  it("one test per audience: keep and counterparty list the rows; the adjudicator's copy says withheld, not no rows", async () => {
    for (const audience of ["keep", "counterparty"]) {
      const p = await page(content({ audience }), "L1", audience);
      expect(p.host.L1.querySelectorAll("[data-row-status]").length).toBe(1);
      expect(p.host.L0.querySelector("[data-banner=private]") !== null).toBe(audience === "keep");
    }
    const adj = await page(content({ audience: "adjudicator", rows_state: "withheld", rows: [] }), "L1", "adjudicator");
    expect(adj.host.L1.querySelectorAll("[data-row-status]").length).toBe(0);
    expect(adj.host.L1.querySelector('[data-rows-state="withheld"]').textContent).toBe("The holder has not shared each term's status with this reader.");
    expect(adj.host.L1.textContent).not.toMatch(/no rows/i);
    expect(adj.host.L0.querySelector('[data-shared="adjudicator"]')).not.toBeNull();
  });

  it("declines a copy cut for another audience, and rows listed where the state says none", async () => {
    expect((await page(content({ audience: "counterparty" }), "L0", "keep")).shown).toBe(false);
    expect((await page(content({ rows_state: "withheld" }))).shown).toBe(false);
  });

  it("declines a word outside section 9's closed sets instead of wording it itself", async () => {
    expect((await page(content({ rows: [{ ...ROW, status: "closed" }] }))).shown).toBe(false);
    expect((await page(content({ start: { state: "closed", local: false, by: null } }))).shown).toBe(false);
    expect((await page(content({ rows_state: "hidden" }))).shown).toBe(false);
    expect((await page(content({ rows: [{ ...ROW, check: "maybe" }] }))).shown).toBe(false);
    expect((await page(content({ profile: "x-deal-v0" }))).shown).toBe(false);
  });

  it("reads x-deal-v1, never x-deal-v0: a bundle carrying both is declined", async () => {
    expect((await page(content(), "L0", null, { "x-deal-v0": { sealed_report: "rep-1" } })).shown).toBe(false);
  });

  it("shows no late line (section 9 leaves late undefined), and the as_of as the holder's time", async () => {
    const without = await page(content());
    expect(without.text).not.toMatch(/Late/);
    const withLate = await page(content({ rows: [{ ...ROW, late: { statements: [{ side: "seller", value: "met", record: "r" }], disputes: [] } }] }));
    expect(withLate.shown).toBe(true);
    expect(withLate.text).not.toMatch(/Late/);
    expect(withLate.text).toMatch(/Payment check: not recomputed/);
    // A time is shown as written for a page with no script (the reader's own
    // zone replaces it when the page draws), and the data keeps UTC (#423).
    expect(without.text).toMatch(/As the holder computed it at Nov 10, 2026, 12:00 UTC\. This is not a time any witness attests\./);
    const asOf = [without.host.L0, without.host.L1, without.host.L2].map((h) => h.querySelector("[data-as-of] [data-time]")).find(Boolean);
    expect(asOf.getAttribute("data-time")).toBe("2026-11-10T12:00:00Z");
  });

  it("shows a deadline in the reader's zone with UTC beside it; a deadline that is not a UTC time refuses the copy (#423)", async () => {
    const p = await page(content({ rows: [{ ...ROW, due: "2026-11-01T23:59:59Z", window_end: "not_set" }] }));
    const row = p.host.L1.querySelector("[data-row-id]").closest("tr");
    expect(row.textContent).toContain("Nov 1, 2026, 23:59 UTC (23:59 UTC)");
    expect([...row.querySelectorAll("[data-time]")].map((n) => n.getAttribute("data-time"))).toEqual(["2026-11-01T23:59:59Z"]);
    // The model already refuses a deadline that is not an RFC 3339 UTC time, so none is ever drawn converted.
    for (const due of ["2026-11-01", "2026-11-01T10:00:00+05:00", "2026-02-30T10:00:00Z"])
      expect((await page(content({ rows: [{ ...ROW, due }] }))).shown).toBe(false);
  });

  it("marks a local row and shows not_set dates and the ruling", async () => {
    const p = await page(content({ rows: [{ ...ROW, status: "ruled", local: true, due: "not_set", remedy: "none", ruling: { record: "r", value: "not_met", against: "seller", final: true, remedy_due: null } }] }));
    expect(p.text).toMatch(/Holder's time only: this result rests on a record with no time from a named witness/);
    expect(p.text).toMatch(/not set/);
    expect(p.text).toMatch(/Ruling: not met, against the seller/);
    const bare = await page(content({ rows: [{ ...ROW, status: "ruled", remedy: "none", ruling: { record: "r", value: "not_met", against: null, final: true, remedy_due: null } }] }));
    expect(bare.text).toMatch(/Ruling: not met(?!, against)/);
    expect(p.text).not.toMatch(/Statement: /);
  });

  it("an adjudicator's copy that omits rests_on.counterparty, witnesses and the layer shows no zero for them", async () => {
    const adj = await page(content({ audience: "adjudicator", rows_state: "withheld", rows: [], rests_on: { own: { log_id: "l", size: 7, last: "rec-1" } } }), "L2", "adjudicator");
    expect(adj.text).not.toMatch(/Witnesses the agreement names/);
    expect(adj.text).not.toMatch(/other side/);
    const keep = await page(content());
    expect(keep.text).toMatch(/Witnesses the agreement names: 0/);
  });

  it("declines malformed members instead of showing a value the producer never asserted", async () => {
    for (const bad of [
      { rows: null }, { rows: {} }, { rows: [null] },
      { rows: [{ ...ROW, due: "waived" }] }, { rows: [{ ...ROW, window_end: "2026-13-45T99:00:00Z" }] }, { rows: [{ ...ROW, due: "2026-11-04" }] },
      { rows: [{ ...ROW, due: "2026-02-30T09:12:00Z" }] }, { rows: [{ ...ROW, window_end: "2026-11-04T24:00:00Z" }] },
      { rows: [{ ...ROW, ruling: { value: "not_met", against: "seller", final: false } }] },
      { rows: [{ ...ROW, ruling: { value: "not_met", against: "seller", final: "yes" } }] },
      { rows: [{ ...ROW, relied_on: [{ record: "r", side: "buyer", time: null, witnessed: "true" }] }] },
      { rows: [{ ...ROW, relied_on: null }] },
      { rows: [{ ...ROW, local: "no" }] },
      { rows: [{ ...ROW, ruling: { value: "not_met", against: "referee", final: true } }] },
      { rows: [{ ...ROW, ruling: { value: "not_met", against: "", final: true } }] },
      { rows: [{ ...ROW, ruling: { value: "not_met", against: 7, final: true } }] },
      { settled: "false" },
      { rests_on: { own: {}, counterparty_layer: "yes", witnesses: [] } },
      { rests_on: { own: {}, witnesses: {} } },
    ]) expect((await page(content(bad))).shown, JSON.stringify(bad)).toBe(false);
  });

  it("stamps its own module id (/v1) on the page and in its manifest, and shows how the report was checked", async () => {
    const p = await page(content(), "L1");
    expect(p.host.L1.querySelector("[data-receipt-module]").getAttribute("data-receipt-module")).toBe("capsuleviewer.receipt.deal/v1");
    expect(p.module.manifest.id).toBe("capsuleviewer.receipt.deal/v1");
    expect(p.host.L1.querySelector('[data-sealed="x-deal-report"]').textContent).toMatch(/signature check as: pass/);
  });

  it("the three x-deal-v0 modules decline a v1 bundle", async () => {
    for (const kind of KINDS) {
      const lib = loadScript(kind);
      const module = lib.api.createModule(kind, env());
      expect(await module.canRender(context(content()))).toBe(false);
    }
  });
});
