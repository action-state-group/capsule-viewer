// SPDX-License-Identifier: Apache-2.0
// capsule-viewer#383, CV2: a receipt carried in a report. The page's runtime
// marks a carried receipt's panel data-receipt-carrier="report"; the owner's
// own copy then reads as a shared copy (Sherlock2, ops bc71ecae): no PRIVATE
// banner and no do-not-forward line. Standing alone it keeps its PRIVATE
// banner. Every manifest lists "*", the audience a report opens a receipt for.
import { describe, expect, it } from "vitest";
import { caseInputs, KINDS, loadScript, manifestOf, packAddsOnly, readBundle, receiptGolden } from "./receiptScripts.js";

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
    for (const carrier of [undefined, "elsewhere", ""]) {
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
    expect(packAddsOnly()).toEqual({ changed: [], sameId: false }); // the id differs by design (evidencebook#956)
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

  // Every string a bundle carries: the producer's own sealed words, which the
  // page shows as recorded and may not reword.
  const sealedStrings = (value, out = []) => {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach((v) => sealedStrings(v, out));
    else if (value && typeof value === "object") Object.values(value).forEach((v) => sealedStrings(v, out));
    return out;
  };

  it("in a report or a page for anyone the page's own words never say \"you\" or \"your\", on any fixture, copy, module or depth (Sherlock2, #386, #395)", async () => {
    const offenders = [];
    let drawn = 0;
    for (const carrier of ["report", "page"])
    for (const c of receiptGolden().cases) {
      for (const kind of KINDS) {
        if (!c.modules[kind] || !c.modules[kind].can_render) continue;
        const lib = loadScript(kind);
        const { context, env } = caseInputs(c, null);
        const module = lib.api.createModule(kind, env);
        if (!(await module.canRender(context))) continue;
        const model = await module.buildModel(context);
        const doc = lib.document;
        const panel = doc.createElement("section");
        panel.setAttribute("data-receipt-carrier", carrier);
        const host = { L0: doc.createElement("div"), L1: doc.createElement("div"), L2: doc.createElement("div"), depth: "L2" };
        panel.append(host.L0, host.L1, host.L2);
        doc.body.append(panel);
        module.render(model, host, {});
        drawn += 1;
        // The producer's sealed text is quoted as recorded; only the page's words are held to the rule.
        let text = panel.textContent;
        const sealed = sealedStrings(c.bundle ?? readBundle(c.name)).filter((t) => /\byou(r)?\b/i.test(t)).sort((a, b) => b.length - a.length);
        for (const t of sealed) text = text.split(t).join("");
        const at = text.search(/\byou(r)?\b/i);
        if (at >= 0) offenders.push(`${carrier} ${c.name} @${c.audience} ${kind}: ${text.slice(Math.max(0, at - 60), at + 40)}`);
        // A page for anyone names no report owner and no report setting.
        if (carrier === "page" && /report owner|settlement report/.test(text)) offenders.push(`page ${c.name} @${c.audience} ${kind}: names a report`);
      }
    }
    expect(drawn).toBeGreaterThan(40);
    expect(offenders).toEqual([]);
  });

  it("a page saved for anyone (carrier page) is the report's shared copy with two lines of its own (Sherlock2, #395)", async () => {
    const PAGE = "Shared copy This node's own record of this exchange, saved as a page for anyone to check. It is not the other side's copy.";
    for (const [name, kind] of [["keep", "unilateral"], ["seller-keep", "seller"], ["bilateral-keep", "bilateral"]]) {
      const page = await draw(name, "keep", "page", kind, "L1");
      expect(page.querySelector('[data-banner="shared"]').textContent, kind).toBe(PAGE);
      expect(page.querySelector('[data-banner="private"]'), kind).toBeNull();
      expect(page.querySelector('[data-actions="true"]'), kind).toBeNull();
    }
    const both = await draw("bilateral-keep", "keep", "page", "bilateral", "L1");
    expect(both.querySelector('[data-half="ours"] .cv-half__label').textContent).toBe("This node's side · in its book");
    expect(both.querySelector('[data-half="theirs"] .cv-half__label').textContent).toBe("Their side · as received");
  });

  it("each owner's-copy module draws the shared copy in a report and PRIVATE standing alone", async () => {
    for (const [name, kind] of [["keep", "unilateral"], ["seller-keep", "seller"], ["bilateral-keep", "bilateral"]]) {
      const carried = await draw(name, "keep", "report", kind);
      expect(carried.querySelector('[data-banner="shared"]'), kind).not.toBeNull();
      expect(carried.querySelector('[data-banner="private"]'), kind).toBeNull();
      const alone = await draw(name, "keep", undefined, kind);
      expect(alone.querySelector('[data-banner="private"]'), kind).not.toBeNull();
      expect(alone.querySelector('[data-banner="shared"]'), kind).toBeNull();
    }
  });

  it("one script draws a carried copy and then a stand-alone one: the mark does not outlive its draw", async () => {
    const c = receiptGolden().cases.find((x) => x.name === "keep" && x.audience === "keep");
    const lib = loadScript("unilateral");
    const { context, env } = caseInputs(c, null);
    const module = lib.api.createModule("unilateral", env);
    const model = await module.buildModel(context);
    const doc = lib.document;
    const host = (carrier) => {
      const panel = doc.createElement("section");
      if (carrier) panel.setAttribute("data-receipt-carrier", carrier);
      const h = { L0: doc.createElement("div"), L1: doc.createElement("div"), L2: doc.createElement("div"), depth: "L1" };
      panel.append(h.L0, h.L1, h.L2);
      doc.body.append(panel);
      return [panel, h];
    };
    const [inReport, a] = host("report");
    module.render(model, a, {});
    const [alone, b] = host(null);
    module.render(model, b, {});
    expect(inReport.querySelector('[data-banner="shared"]')).not.toBeNull();
    expect(alone.querySelector('[data-banner="private"]')).not.toBeNull();
    expect(alone.querySelector('[data-actions="true"]')).not.toBeNull();
    expect(alone.textContent).toContain("Tell your agent");
  });
});
