// evidencebook's VerifyReport vectors (testdata/deal-v1/report-verify/vectors.json,
// evidencebook#555) against the v1 page. The page checks no signature and holds
// no first record, so it applies the rules that read the report's own payload:
// a ruling's against is buyer, seller or null and always present, no member
// outside section 9, the x-deal-v1 profile. The signature, deal and book binding
// cases are capsulectl verify's (the page shows what it reported).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadScript, renderInto } from "./receiptScripts.js";

const vectors = JSON.parse(readFileSync(new URL("../tests/testdata/deal-v1/report-verify-vectors.json", import.meta.url), "utf8"));
const context = (report) => ({
  bundle: { records: [], extensions: { "x-deal-v1": { sealed_report: "rep-1" }, "x-deal-report/v0": { record: { capsule_id: "rep-1", action_id: "capsulectl-deal-report" }, agent_input: report } } },
  records: [], resolvedDisclosures: new Map(), root: null, completeness: { memberships: {} },
});
const env = (audience) => ({
  audience,
  verification: () => ({ verifier: "test", outcome: "verified", checks: [] }),
  assurance: () => ({ bundle_digest: "ab".repeat(32), witnesses: "absent", countersignatures: [], report_checked: "pass" }),
});

// The cases Go refuses for what the report's own payload holds; the page declines the same.
const PAYLOAD_REFUSED = ["against-the-adjudicator", "against-in-another-case", "against-empty", "ruling-without-against", "against-misnamed", "an-unknown-member", "a-v0-profile"];
// Go gives a key_id: the page draws it.
const VERIFIED = vectors.cases.filter((c) => c.want.key_id).map((c) => c.name);

describe("the deal/v1 receipt against VerifyReport's vectors", () => {
  it("covers the vectors it is held to", () => {
    expect(vectors.cases.length).toBe(19);
    expect(VERIFIED).toEqual(["ruled-against-seller", "ruled-against-buyer", "ruling-against-null", "no-ruling"]);
    for (const n of PAYLOAD_REFUSED) expect(vectors.cases.find((c) => c.name === n).want.stage).toBe("report");
  });
  for (const c of vectors.cases.filter((x) => x.agent_input && (VERIFIED.includes(x.name) || PAYLOAD_REFUSED.includes(x.name)))) {
    it(`${VERIFIED.includes(c.name) ? "draws" : "declines"} ${c.name}`, async () => {
      const lib = loadScript("deal");
      const module = lib.api.createModule("deal", env(c.agent_input.audience));
      const ctx = context(c.agent_input);
      expect(await module.canRender(ctx)).toBe(VERIFIED.includes(c.name));
      if (VERIFIED.includes(c.name)) {
        const model = await module.buildModel(ctx);
        const host = renderInto(lib, module, model, "L1");
        expect(host.L1.textContent).toContain("A report that passes the check shows who signed it and which deal it covers. It does not show that its rows are correct.");
      }
    });
  }
});
