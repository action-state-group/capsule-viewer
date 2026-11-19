// evidencebook#562 (testdata/deal-v1/pair-names): a member spelled otherwise than a field name (another case, U+017F long s,
// U+212A Kelvin sign) is refused at every level the reader reads, beside the real one or in its place. The vectors there are
// sent and book pairs, which this page does not read; the report payload's members are the same rule, held here on real reports.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadScript } from "./receiptScripts.js";

const vectors = JSON.parse(readFileSync(new URL("../tests/testdata/deal-v1/report-vectors.json", import.meta.url), "utf8"));
const base = vectors.cases.find((c) => c.name === "appendix-a-26-nov");
const context = (report) => ({
  bundle: { records: [], extensions: { "x-deal-v1": { sealed_report: "rep-1" }, "x-deal-report/v0": { record: { capsule_id: "rep-1", action_id: "capsulectl-deal-report" }, agent_input: report } } },
  records: [], resolvedDisclosures: new Map(), root: null, completeness: { memberships: {} },
});
const env = (audience) => ({
  audience,
  verification: () => ({ verifier: "test", outcome: "verified", checks: [] }),
  assurance: () => ({ bundle_digest: "ab".repeat(32), witnesses: "absent", countersignatures: [], report_checked: "pass" }),
});
const draws = async (report) => {
  const lib = loadScript("deal");
  return lib.api.createModule("deal", env(report.audience)).canRender(context(report));
};
const clone = () => JSON.parse(JSON.stringify(base.report));
// Each: [where, a function giving the object to respell in, the field name]
const PLACES = [
  ["a row", (r) => r.rows[0], "status"],
  ["a row's ruling", (r) => r.rows.find((x) => x.ruling).ruling, "against"],
  ["a relied_on entry", (r) => r.rows.find((x) => x.relied_on.length).relied_on[0], "witnessed"],
  ["rests_on", (r) => r.rests_on, "own"],
  ["the start", (r) => r.start, "state"],
  ["the checkpoint", (r) => r.deal_checkpoint, "root"],
  ["a row (Kelvin sign)", (r) => r.rows[0], "check"],
  ["a witness (Kelvin sign)", (r) => r.rests_on.witnesses[0], "key_id"],
];
const RESPELLINGS = (name) => [name.toUpperCase(), name[0].toUpperCase() + name.slice(1), name.replace("s", "ſ"), name.replace("k", "K")].filter((s) => s !== name);

describe("the deal/v1 receipt refuses a member spelled otherwise than a field name", () => {
  it("draws the real report", async () => expect(await draws(clone())).toBe(true));
  for (const [where, at, name] of PLACES) {
    for (const spelling of RESPELLINGS(name)) {
      it(`${where}: ${JSON.stringify(spelling)} beside ${name}`, async () => {
        const r = clone();
        at(r)[spelling] = at(r)[name];
        expect(await draws(r)).toBe(false);
      });
      it(`${where}: ${JSON.stringify(spelling)} in place of ${name}`, async () => {
        const r = clone();
        const o = at(r);
        o[spelling] = o[name];
        delete o[name];
        expect(await draws(r)).toBe(false);
      });
    }
  }
  it("leaves the free-form report text and a term's owed alone", async () => {
    const r = clone();
    r.report.Scope = "free text";
    r.rows[0].owed = { Item: "lamp", STATUS: 1 };
    expect(await draws(r)).toBe(true);
  });
});

describe("the respellings really include the Kelvin sign and the long s", () => {
  it("check and key_id have a U+212A spelling, status a U+017F one", () => {
    expect(RESPELLINGS("check")).toContain("checK");
    expect(RESPELLINGS("key_id")).toContain("Key_id");
    expect(RESPELLINGS("status")).toContain("ſtatus");
  });
});
