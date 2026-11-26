// A downgraded x-deal-v0 copy (capsule-viewer#452): its x-deal-v0 block names
// no sealed report and carries the report's text inline, as a page from
// before reports were sealed, or a hand-edited one, does (evidencebook's
// check-deal-pages.sh deal-receipt-downgraded case). The x-deal-v0 modules
// draw Sherlock2's two lines in place of the receipt, never the inline text.
import { describe, expect, it } from "vitest";
import { readBundle, readVerify, loadScript } from "./receiptScripts.js";
import { standInContext } from "./aacContext.js";

const LINE = "⚠️ The receipt's text is not shown: this copy names no sealed report, so its text could not be checked.";
const VERDICT = "`capsulectl deal verify --bundle <file>` reports this copy as INVALID (sealed_report_not_named).";
const INLINE = "A line nobody sealed.";

// The report dropped and its text put inline, as check-deal-pages.sh does it.
function downgrade(name) {
  const b = readBundle(name);
  const ext = b.extensions;
  const report = ext["x-deal-report/v0"] ? ext["x-deal-report/v0"].agent_input.report : {};
  ext["x-deal-v0"] = { ...report, did_line: INLINE };
  delete ext["x-deal-report/v0"];
  return b;
}

// A page whose own check ran in full (strict present) unless strict is false.
function contextOf(bundle, name, strict = true) {
  const { strict: _none, ...rest } = standInContext(bundle, { verify: readVerify(name) });
  return strict ? { ...rest, strict: { verdict: "VALID" } } : rest;
}

async function draw(kind, context, env) {
  const lib = loadScript(kind);
  const module = env ? lib.api.createModule(kind, env) : lib.registered[0];
  const can = await module.canRender(context);
  if (!can) return { can, model: null, root: null };
  const model = await module.buildModel(context);
  const root = lib.document.createElement("div");
  lib.document.body.appendChild(root);
  module.render(model, { L0: root, L1: root, L2: root, depth: "L2" });
  return { can, model, root };
}

describe("a downgraded x-deal-v0 copy (#452, Sherlock2's words)", () => {
  it("the buyer's receipt draws the two lines in one block and nothing from the inline text", async () => {
    const { can, model, root } = await draw("unilateral", contextOf(downgrade("main-standalone-keep"), "main-standalone-keep"));
    expect(can).toBe(true);
    expect(model).toEqual({ cannot_check: true, reason: "downgraded" });
    const block = root.querySelector('[data-cannot-check-reason="downgraded"]');
    expect([...block.querySelectorAll("p")].map((p) => p.textContent)).toEqual([LINE, VERDICT]);
    expect(root.querySelectorAll("[data-cannot-check]").length).toBe(1);
    expect(root.textContent).not.toContain(INLINE);
    expect(root.textContent.trim()).toBe(LINE + VERDICT);
  });

  it("a seller's copy draws the same lines", async () => {
    const { model, root } = await draw("seller", contextOf(downgrade("main-seller-keep"), "main-seller-keep"));
    expect(model).toEqual({ cannot_check: true, reason: "downgraded" });
    expect(root.textContent).not.toContain(INLINE);
    expect(root.querySelector('[data-cannot-check-reason="downgraded"]').textContent).toBe(LINE + VERDICT);
  });

  it("holds when a verifier's report is given (capsulectl's page)", async () => {
    const name = "main-standalone-keep";
    const env = { verification: () => ({ outcome: "verified" }), assurance: () => ({ report_checked: "pass" }) };
    const { model } = await draw("unilateral", contextOf(downgrade(name), name), env);
    expect(model).toEqual({ cannot_check: true, reason: "downgraded" });
  });

  it("a sealed copy draws its receipt as before", async () => {
    const name = "main-standalone-keep";
    const { model, root } = await draw("unilateral", contextOf(readBundle(name), name));
    expect(model.cannot_check).toBeUndefined();
    expect(root.querySelector("[data-cannot-check]")).toBeNull();
  });

  it("where this browser can't check at all, that line comes first", async () => {
    const name = "main-standalone-keep";
    const { model } = await draw("unilateral", contextOf(downgrade(name), name, false));
    expect(model).toEqual({ cannot_check: true });
  });

  it("is declined, never the downgraded line, when the bundle did not verify", async () => {
    const name = "main-standalone-keep";
    const env = { verification: () => ({ outcome: "failed" }) };
    expect((await draw("unilateral", contextOf(downgrade(name), name), env)).can).toBe(false);
  });

  it("is declined when a disclosure does not match its commitment", async () => {
    const name = "main-standalone-keep";
    const context = contextOf(downgrade(name), name);
    const first = context.records[0].capsule_id;
    const resolved = new Map([[first, { agent_input: { state: "disclosure_mismatch" } }]]);
    expect((await draw("unilateral", { ...context, resolvedDisclosures: resolved })).can).toBe(false);
  });

  it("a bundle with no x-deal-v0 block is not taken for a downgraded copy", async () => {
    const name = "main-standalone-keep";
    const b = downgrade(name);
    delete b.extensions["x-deal-v0"];
    const { can } = await draw("unilateral", contextOf(b, name));
    expect(can).toBe(false);
  });
});
