// The v1 deal receipt against evidencebook's real report output: every case in
// testdata/deal-v1/report/vectors.json (evidencebook main, written by the
// producer's TestReportVectors) is drawn by the page, never declined.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadScript, renderInto, v1Extension } from "./receiptScripts.js";

const vectors = JSON.parse(readFileSync(new URL("../tests/testdata/deal-v1/report-vectors.json", import.meta.url), "utf8"));

const context = (report) => ({
  bundle: {
    records: [],
    extensions: {
      "x-deal-v1": v1Extension(report),
      "x-deal-report/v0": { record: { capsule_id: "rep-1", action_id: "capsulectl-deal-report" }, agent_input: report },
    },
  },
  records: [], resolvedDisclosures: new Map(), root: null, completeness: { memberships: {} },
});
const env = (audience) => ({
  audience,
  verification: () => ({ verifier: "test", outcome: "verified", checks: [] }),
  assurance: () => ({ bundle_digest: "ab".repeat(32), witnesses: "absent", countersignatures: [], report_checked: "pass" }),
});

describe("the deal/v1 receipt against the producer's report vectors", () => {
  for (const c of vectors.cases) {
    it(`draws ${c.name}`, async () => {
      const lib = loadScript("deal");
      const module = lib.api.createModule("deal", env(c.copy.audience));
      const ctx = context(c.report);
      expect(await module.canRender(ctx)).toBe(true);
      const model = await module.buildModel(ctx);
      const host = renderInto(lib, module, model, "L2");
      const text = [host.L0, host.L1, host.L2].map((h) => h.textContent).join("\n");
      const shown = [...host.L1.querySelectorAll("[data-row-status]")].map((e) => e.getAttribute("data-row-status"));
      expect(shown).toEqual(c.report.rows.map((r) => r.status));
      expect(text).not.toMatch(/capsulectl wrote|closed\b/i);
      if (c.report.rows.some((r) => r.remedy === "not_counted")) expect(text).toContain("a payment, ordered by the ruling; not checked yet");
      if (c.report.rows.some((r) => r.remedy === "not_counted" && r.remedy_made)) expect(text).toContain("The owing side has recorded making it (not checked).");
      if (c.report.rows.some((r) => r.remedy === "not_counted" && !r.remedy_made)) expect(text).toContain("a payment, ordered by the ruling; not checked yet");
      if (c.report.rows.some((r) => r.ruling !== null)) expect(text).toMatch(/Ruling: .*, against the (buyer|seller)/);
    });
  }
});
