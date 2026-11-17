// The v1 deal receipt (capsuleviewer.receipt.deal/v1) against evidencebook's
// sealed report, docs/design/461-deal-profile.md section 9: each row's computed
// status is shown as the report gives it, the deal-level line is the start state
// and "settled" or nothing, and a copy that withholds the rows says so. The
// reports here are fixtures written from section 9; they are held to the
// producer's real output once that is on evidencebook main (capsule-viewer#322).
import { describe, expect, it } from "vitest";
import { loadScript, manifestOf, renderInto, KINDS } from "./receiptScripts.js";

const ROW = {
  id: "as_described", owed_by: "seller", owed: {},
  due: "2026-11-04T09:12:00Z", window_end: "2026-11-18T09:12:00Z",
  status: "agreed", value: "met", remedy: null, local: false, check: "not_recomputed",
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
      "x-deal-v1": { sealed_report: "rep-1" },
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
    expect(m.audiences).toEqual(["keep", "counterparty", "adjudicator"]);
  });

  it("shows each row's status as the report gives it, and never computes one", async () => {
    const statuses = ["not_reached", "not_due", "no_statement", "waiting", "uncontested", "agreed_so_far", "agreed", "in_disagreement", "in_dispute", "ruled"];
    const rows = statuses.map((status, i) => ({ ...ROW, id: `row_${i}`, status, remedy: status === "ruled" ? "due" : null }));
    const { host } = await page(content({ rows }), "L1");
    const shown = [...host.L1.querySelectorAll("[data-row-status]")].map((e) => [e.closest("tr").querySelector("[data-row-id]").getAttribute("data-row-id"), e.getAttribute("data-row-status")]);
    expect(shown).toEqual(statuses.map((s, i) => [`row_${i}`, s]));
    expect(host.L1.querySelector('[data-row-status="agreed_so_far"]').textContent).toBe("Agreed so far");
  });

  it("the deal-level line is the start state, then settled or nothing; no close, no done", async () => {
    const open = await page(content({ settled: false }), "L0");
    expect(open.host.L0.querySelector("[data-deal-state]").getAttribute("data-deal-state")).toBe("started");
    expect(open.host.L0.querySelector("[data-settled]")).toBeNull();
    const done = await page(content({ settled: true }), "L0");
    expect(done.host.L0.querySelector("[data-settled]").textContent).toBe("Settled");
    for (const p of [open, done]) expect(p.text).not.toMatch(/closed|close\b/i);
    const waiting = await page(content({ start: { state: "awaiting_agreement", local: false, by: null }, settled: false, rows_state: "not_started", rows: [] }), "L0");
    expect(waiting.host.L0.querySelector("[data-deal-state]").getAttribute("data-deal-state")).toBe("awaiting_agreement");
  });

  it("a settled flag on a deal that has not started shows nothing", async () => {
    const p = await page(content({ start: { state: "not_started", local: false, by: null }, settled: true, rows_state: "not_started", rows: [] }), "L0");
    expect(p.host.L0.querySelector("[data-settled]")).toBeNull();
    expect(p.host.L0.querySelector('[data-rows-state="not_started"]')).not.toBeNull();
  });

  it("one test per audience: keep and counterparty list the rows; the adjudicator's copy says withheld, not no rows", async () => {
    for (const audience of ["keep", "counterparty"]) {
      const p = await page(content({ audience }), "L1", audience);
      expect(p.host.L1.querySelectorAll("[data-row-status]").length).toBe(1);
      expect(p.host.L0.querySelector("[data-banner=private]") !== null).toBe(audience === "keep");
    }
    const adj = await page(content({ audience: "adjudicator", rows_state: "withheld", rows: [] }), "L1", "adjudicator");
    expect(adj.host.L1.querySelectorAll("[data-row-status]").length).toBe(0);
    expect(adj.host.L1.querySelector('[data-rows-state="withheld"]').textContent).toMatch(/does not show the rows/);
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

  it("shows late statements only when the report carries them, and the as_of as the holder's time", async () => {
    const without = await page(content());
    expect(without.text).not.toMatch(/Late:/);
    const withLate = await page(content({ rows: [{ ...ROW, late: { statements: [{ side: "seller", value: "met", record: "r" }], disputes: [] } }] }));
    expect(withLate.text).toMatch(/Late: 1 statements, 0 disputes/);
    expect(without.text).toMatch(/As the holder computed it at 2026-11-10T12:00:00Z\. This is not a time any witness attests\./);
  });

  it("marks a local row and shows not_set dates and the ruling", async () => {
    const p = await page(content({ rows: [{ ...ROW, status: "ruled", local: true, due: "not_set", remedy: "none", ruling: { record: "r", value: "not_met", against: "seller", final: true, remedy_due: null } }] }));
    expect(p.text).toMatch(/Local: this result rests on a record that has no time from a named witness/);
    expect(p.text).toMatch(/not set/);
    expect(p.text).toMatch(/Final ruling: not met, against seller/);
  });

  it("the three x-deal-v0 modules decline a v1 bundle", async () => {
    for (const kind of KINDS) {
      const lib = loadScript(kind);
      const module = lib.api.createModule(kind, env());
      expect(await module.canRender(context(content()))).toBe(false);
    }
  });
});
