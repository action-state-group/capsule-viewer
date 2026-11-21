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
async function draw(report, extension) {
  const lib = loadScript("deal");
  const module = lib.api.createModule("deal", env(report.audience));
  const ctx = context(report, extension);
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
      const want = c.report.rows.flatMap((r) => r.relied_on.map((e) => e.record)).filter((id) => c.extension.book.relied_on[id]?.record.settlement !== undefined);
      expect(cells).toEqual(want);
      if (c.report.rows_state === "listed" && !want.length) expect(host.L1.querySelector('[data-legs="none"]')).not.toBeNull();
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

  it("a copy whose extension carries no book says so, and shows no leg", async () => {
    const c = vectors.cases.find((x) => x.name === "keep-copy");
    const { shown, host } = await draw(c.report, { sealed_report: c.extension.sealed_report });
    expect(shown).toBe(true);
    expect(host.L1.querySelector('[data-legs="no_book"]')).not.toBeNull();
    expect(host.L1.querySelector("[data-leg-record]")).toBeNull();
  });

  it("an adjudicator's copy withholds the rows and shows no legs section", async () => {
    const c = vectors.cases.find((x) => x.name === "adjudicator-copy");
    const { host } = await draw(c.report, c.extension);
    expect(host.L1.querySelector("[data-legs]")).toBeNull();
    expect(host.L1.querySelector("[data-leg-record]")).toBeNull();
  });

  it("declines a book that is missing a relied-on record, or keys a pair by another id, or has an unknown member", async () => {
    const keep = vectors.cases.find((x) => x.name === "keep-copy");
    const missing = structuredClone(keep.extension);
    delete missing.book.relied_on[Object.keys(missing.book.relied_on)[0]];
    expect((await draw(keep.report, missing)).shown).toBe(false);
    const rekeyed = structuredClone(keep.extension);
    const [k, pair] = Object.entries(rekeyed.book.relied_on)[0];
    pair.record.capsule_id = "0".repeat(64);
    expect(k).not.toBe(pair.record.capsule_id);
    expect((await draw(keep.report, rekeyed)).shown).toBe(false);
    expect((await draw(keep.report, { ...keep.extension, extra: 1 })).shown).toBe(false);
    const noAgreement = structuredClone(keep.extension);
    delete noAgreement.book.agreement;
    expect((await draw(keep.report, noAgreement)).shown).toBe(false);
  });
});
