// The v1 deal receipt shows the payment legs a payment row relied on, from the x-deal-v1
// extension's book (evidencebook#588, #597; capsule-viewer#330), against every case in
// testdata/deal-v1/report-bundle/vectors.json: a leg is shown as its record states it, found
// by its relied_on id; no leg is picked, and `check` stays the only verdict.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadScript, renderInto } from "./receiptScripts.js";

const vectors = JSON.parse(readFileSync(new URL("../tests/testdata/deal-v1/report-bundle-vectors.json", import.meta.url), "utf8"));

const context = (report, extension) => ({
  bundle: {
    records: [],
    extensions: {
      "x-deal-v1": extension,
      "x-deal-report/v0": { record: { capsule_id: extension.sealed_report, action_id: "capsulectl-deal-report" }, agent_input: report },
    },
  },
  records: [], resolvedDisclosures: new Map(), root: null, completeness: { memberships: {} },
});
const env = (audience) => ({
  audience,
  verification: () => ({ verifier: "test", outcome: "verified", checks: [] }),
  assurance: () => ({ bundle_digest: "ab".repeat(32), witnesses: "absent", countersignatures: [], report_checked: "pass" }),
});
async function draw(report, extension, namedReport) {
  const lib = loadScript("deal");
  const module = lib.api.createModule("deal", env(report.audience));
  const ctx = context(report, extension);
  if (namedReport !== undefined) ctx.bundle.extensions["x-deal-report/v0"].record.capsule_id = namedReport;
  if (!(await module.canRender(ctx))) return { shown: false };
  const model = await module.buildModel(ctx);
  const host = renderInto(lib, module, model, "L1");
  return { shown: true, host, model };
}
const legsOf = (extension) => Object.entries(extension.book.relied_on).filter(([, pair]) => pair.record.settlement !== undefined);

describe("the deal/v1 receipt shows the payment legs the report relied on", () => {
  for (const c of vectors.cases.filter((x) => x.want.key_id !== undefined)) {
    it(`draws ${c.name}`, async () => {
      const { shown, host } = await draw(c.report, c.extension);
      expect(shown).toBe(true);
      const cells = [...host.L1.querySelectorAll("[data-leg-record]")].map((e) => e.getAttribute("data-leg-record"));
      // Listed rows tie each leg to a term; a copy that withholds them shows every leg the book holds.
      const want = c.report.rows_state === "withheld"
        ? legsOf(c.extension).map(([id]) => id)
        : c.report.rows.flatMap((r) => r.relied_on.map((e) => e.record)).filter((id) => c.extension.book.relied_on[id]?.record.settlement !== undefined);
      expect(cells).toEqual(want);
      if (["listed", "withheld"].includes(c.report.rows_state) && !want.length) expect(host.L1.querySelector('[data-legs="none"]')).not.toBeNull();
    });
  }

  it("shows a leg's settlement as recorded, and no verdict beside it", async () => {
    const c = vectors.cases.find((x) => x.name === "keep-copy");
    const [id, pair] = legsOf(c.extension)[0];
    const s = pair.record.settlement;
    const { host } = await draw(c.report, c.extension);
    const row = host.L1.querySelector(`[data-leg-record="${id}"]`).closest("tr");
    const text = row.textContent;
    expect(text).toContain(s.leg);
    expect(text).toContain(s.status);
    expect(text).toContain("60.00 USD");
    expect(text).toMatch(/received 60\.00 USD; receive_fee 0\.00 USD|amount 60\.00 USD/);
    expect(text).toContain(s.observed_at);
    expect(text).toContain(`${s.payment_ref.type} ${s.payment_ref.value}`);
    expect(host.L1.textContent).toContain("the payment check above is the only verdict");
    expect(host.L1.querySelector("[data-row-status]")).not.toBeNull();
  });

  it("an adjudicator's copy withholds the rows, so its legs are tied to no term and show the sealer as recorded", async () => {
    for (const name of ["adjudicator-copy", "ruling-adjudicator-copy"]) {
      const c = vectors.cases.find((x) => x.name === name);
      const { host } = await draw(c.report, c.extension);
      const legs = legsOf(c.extension);
      if (!legs.length) { expect(host.L1.querySelector('[data-legs="none"]').textContent).toContain("This copy withholds the terms."); continue; }
      const table = host.L1.querySelector("[data-leg-record]").closest("table");
      expect([...table.querySelectorAll("th")].map((e) => e.textContent)).toEqual(["Sealer, as recorded", "Leg", "Status as recorded", "Amounts as recorded", "Observed at (as recorded)", "Payment reference", "Record"]);
      for (const [id, pair] of legs) {
        const row = host.L1.querySelector(`[data-leg-record="${id}"]`).closest("tr");
        expect(row.querySelector("td").textContent).toBe(pair.record.settlement.sealer_role);
        expect(row.textContent).toContain(pair.record.settlement.leg);
      }
      expect(host.L1.querySelector("[data-row-id]")).toBeNull();
      expect(host.L1.querySelector('[data-legs="withheld"]').textContent).toBe("This copy withholds the terms, so these payment records are not tied to a term. They are the records the report's holder says its terms rest on, shown as each states it. This page does not check who signed them and does not judge the payment.");
      expect(host.L1.textContent).not.toContain("payment check above");
    }
  });

  it("an adjudicator's copy carrying payment legs is among the vectors", () => {
    const c = vectors.cases.find((x) => x.name === "adjudicator-copy");
    expect(legsOf(c.extension).length).toBeGreaterThan(0);
  });

  it("a not-started keep copy lists no rows and shows no legs section; an adjudicator's not-started copy, which withholds rows, says it holds no payment record", async () => {
    const keep = vectors.cases.find((x) => x.name === "not-started-keep-copy");
    expect((await draw(keep.report, keep.extension)).host.L1.querySelector("[data-legs]")).toBeNull();
    const adj = vectors.cases.find((x) => x.name === "not-started-adjudicator-copy");
    expect(legsOf(adj.extension)).toEqual([]);
    const none = (await draw(adj.report, adj.extension)).host.L1.querySelector('[data-legs="none"]');
    expect(none.textContent).toBe("This copy withholds the terms. Among the records the report's holder says they rest on, there is no payment record.");
  });

  // The refusals of VerifyReportBundle's vectors that read the extension's shape, which this page reads too. The ones
  // that need a signer or a log (signed by no party, a record of another deal, past a log's size, a referee) are
  // capsulectl's check, not this page's.
  const SHAPE_REFUSALS = ["wrong sealed_report", "a relied-on record missing", "a record no row relies on", "a key that is not its pair's id", "an unknown member", "a null relied_on", "no book", "a keep copy withheld"];
  for (const name of SHAPE_REFUSALS) {
    it(`declines what the producer refuses: ${name}`, async () => {
      const c = vectors.cases.find((x) => x.name === name);
      expect(c.want.error).toBeDefined();
      // A wrong sealed_report names a report this bundle does not carry: the page finds the report by the named id.
      const { shown } = await draw(c.report, c.extension, name === "wrong sealed_report" ? "other-report" : undefined);
      expect(shown).toBe(false);
    });
  }

  it("declines an adjudicator's copy whose pair is not keyed by its id, though no row names it", async () => {
    const c = vectors.cases.find((x) => x.name === "adjudicator-copy");
    const ext = structuredClone(c.extension);
    const [k, pair] = Object.entries(ext.book.relied_on)[0];
    pair.record.capsule_id = "0".repeat(64);
    expect(k).not.toBe(pair.record.capsule_id);
    expect((await draw(c.report, ext)).shown).toBe(false);
  });

  it("declines listed rows that name no record beside a book that holds some, but not a withheld or not-started copy", async () => {
    const keep = vectors.cases.find((x) => x.name === "keep-copy");
    const empty = { ...keep.report, rows: [] };
    expect((await draw(empty, keep.extension)).shown).toBe(false);
    const adj = vectors.cases.find((x) => x.name === "adjudicator-copy");
    expect((await draw(adj.report, adj.extension)).shown).toBe(true);
    const ns = vectors.cases.find((x) => x.name === "not-started-keep-copy");
    expect((await draw(ns.report, ns.extension)).shown).toBe(true);
  });

  it("shows a money member it cannot write as a decimal as recorded, and still draws the receipt", async () => {
    const c = vectors.cases.find((x) => x.name === "keep-copy");
    const cases = [["19", "1", "0.0000000000000000001 USD"], ["255", "7", null], ["0", "6000", "6000 USD"], ["2", "6000.5", "6000.5 USD scale 2"]];
    for (const [scale, value, want] of cases) {
      const ext = structuredClone(c.extension);
      const [, pair] = legsOf(ext)[0];
      pair.record.settlement.amount = { assetCode: "USD", assetScale: Number(scale), value };
      const { shown, host } = await draw(c.report, ext);
      expect(shown).toBe(true);
      const text = host.L1.querySelector("[data-leg-record]").closest("tr").textContent;
      if (want !== null) expect(text).toContain("amount " + want);
      else expect(text).toMatch(/amount 0\.0+7 USD/);
    }
  });

  it("shows no verdict, and no side the report does not name", async () => {
    const c = vectors.cases.find((x) => x.name === "keep-copy");
    const { host } = await draw(c.report, c.extension);
    expect(host.L1.textContent).toContain("This page does not check who signed each record");
    expect(host.L1.textContent).toContain("Side, as the report names it");
  });
});
