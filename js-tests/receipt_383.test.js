// SPDX-License-Identifier: Apache-2.0
// capsule-viewer#383, CV2: a receipt carried in a report. The page's runtime
// marks a carried receipt's panel data-receipt-carrier="report"; the owner's
// own copy then reads as a shared copy (Sherlock2, ops bc71ecae): no PRIVATE
// banner and no do-not-forward line. Standing alone it keeps its PRIVATE
// banner. Every manifest lists "*", the audience a report opens a receipt for.
import { describe, expect, it } from "vitest";
import { caseInputs, KINDS, loadScript, manifestOf, packAddsOnly, receiptGolden } from "./receiptScripts.js";

const SHARED = "Shared copy The report owner's own record of this deal, included in this report because their \"Receipts in the settlement report\" setting is on. It is not the counterparty's copy.";

async function draw(name, audience, carrier, kind = "unilateral", depth = "L0") {
  const c = receiptGolden().cases.find((x) => x.name === name && x.audience === audience);
  expect(c, `${name} @${audience}`).toBeTruthy();
  const lib = loadScript(kind);
  const { context, env } = caseInputs(c, null);
  const module = lib.api.createModule(kind, env);
  const model = await module.buildModel(context);
  const doc = lib.document;
  const panel = doc.createElement("section");
  if (carrier !== undefined) panel.setAttribute("data-receipt-carrier", carrier);
  const host = { L0: doc.createElement("div"), L1: doc.createElement("div"), L2: doc.createElement("div"), depth };
  panel.append(host.L0, host.L1, host.L2);
  doc.body.append(panel);
  module.render(model, host, {});
  return panel;
}

describe("a receipt carried in a report (#383)", () => {
  it("the owner's keep copy in a report is a shared copy, in Sherlock2's words, with no PRIVATE banner", async () => {
    const panel = await draw("keep", "keep", "report");
    expect(panel.querySelector('[data-banner="private"]')).toBeNull();
    const shared = panel.querySelectorAll('[data-banner="shared"]');
    expect(shared.length).toBe(1);
    expect(shared[0].textContent).toBe(SHARED);
    expect(panel.textContent).not.toContain("Do not forward");
  });

  it("the same copy standing alone keeps its PRIVATE banner", async () => {
    for (const carrier of [undefined, "page", ""]) {
      const panel = await draw("keep", "keep", carrier);
      expect(panel.querySelector('[data-banner="shared"]'), String(carrier)).toBeNull();
      expect(panel.querySelector('[data-banner="private"]'), String(carrier)).not.toBeNull();
    }
  });

  it("a counterparty's copy in a report gains no banner: only the owner's own copy is marked", async () => {
    const panel = await draw("counterparty", "counterparty", "report");
    expect(panel.querySelector('[data-banner="shared"]')).toBeNull();
    expect(panel.querySelector('[data-banner="private"]')).toBeNull();
  });

  it("every receipt manifest lists \"*\", so a report's receipt resolves", () => {
    for (const kind of [...KINDS, "deal"]) expect(manifestOf(kind).audiences, kind).toContain("*");
  });

  it("the current wording pack only adds keys to the frozen one the Python oracle reads", () => {
    expect(packAddsOnly()).toEqual({ changed: [], sameId: true });
  });

  it("a producer-selected copy passes the gate as the page's verdict does; any other withheld coverage does not", () => {
    const { bundleVerified } = loadScript("unilateral").api;
    const pass = { status: "pass", findings: [] };
    const base = { graphClosure: pass, perRecordMembership: pass, capsuleResults: { a: { ok: true } }, disclosures: [{ status: "disclosure_match" }] };
    expect(bundleVerified({ ...base, intervalCoverage: pass })).toBe(true);
    expect(bundleVerified({ ...base, intervalCoverage: { status: "withheld", findings: ["selection_not_checkable"] } })).toBe(true);
    expect(bundleVerified({ ...base, intervalCoverage: { status: "withheld", findings: [] } })).toBe(false);
    expect(bundleVerified({ ...base, intervalCoverage: { status: "fail", findings: ["selection_not_checkable"] } })).toBe(false);
    expect(bundleVerified({ ...base, graphClosure: { status: "fail", findings: [] }, intervalCoverage: { status: "withheld", findings: ["selection_not_checkable"] } })).toBe(false);
  });

  it("in a report the words never address the reader as the owner: no prompts for the owner's agent, and the owner's side is named", async () => {
    // The unilateral page's prompts (L1) go in a report and stay standing alone.
    const carried = await draw("keep", "keep", "report", "unilateral", "L1");
    expect(carried.querySelector('[data-actions="true"]')).toBeNull();
    expect(carried.textContent).not.toContain("Tell your agent");
    const alone = await draw("keep", "keep", undefined, "unilateral", "L1");
    expect(alone.querySelector('[data-actions="true"]')).not.toBeNull();
    // The two-sided receipt: the owner's half is "The report owner's side", their half unchanged.
    const both = await draw("bilateral-keep", "keep", "report", "bilateral", "L1");
    const ours = both.querySelector('[data-half="ours"] .cv-half__label');
    expect(ours && ours.textContent).toBe("The report owner's side · in their book");
    expect(both.querySelector('[data-half="theirs"] .cv-half__label').textContent).toBe("Their side · as received");
    expect(both.querySelector('[data-actions="true"]')).toBeNull();
    const bothAlone = await draw("bilateral-keep", "keep", undefined, "bilateral", "L1");
    expect(bothAlone.querySelector('[data-half="ours"] .cv-half__label').textContent).toBe("Your side · in your book");
    expect(bothAlone.querySelector('[data-actions="true"]')).not.toBeNull();
  });
});
