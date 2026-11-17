// The receipt modules' module-slot scripts as a page runs them.
//
// (1) jsdom, real copies: the bundles capsulectl (capsule-cli main) cut,
//     main-buyer-{keep,counterparty} and main-seller-{keep,counterparty}
//     (examples/receipt/cut_main_bundles.sh) and main-standalone-{keep,counterparty}
//     (cut_standalone_bundles.sh: the report is a standalone record), each through the three scripts as
//     the page's runtime would load them (EvidenceGraph.registerPresentation),
//     with the context the page's verifier gives (aacContext.js, capsulectl
//     verify's verdicts on those bytes) and nothing else: no page audience, no
//     oracle input. Exactly one module accepts each copy (a buyer's is the
//     unilateral receipt's, a seller's the seller receipt's); the owner's copy
//     shows PRIVATE and the copy shared with the counterparty does not; one
//     level of details; the kit stylesheet goes in once, as the manifest pins it.
// (2) headless Chromium at 390px and 1280px: the same six, and no page
//     scrolls sideways.
//     (The script pages were once compared, text, boxes, styles and pixels, with
//     the pages the Python receipt modules drew (capsule-viewer#71); that
//     comparison ran green until those modules were removed. The scripts are now
//     held to the frozen golden, tests/testdata/receipt/oracle-golden.json.gz,
//     by receipt_parity.test.js.)
//
// Same skip/fail rule as the layout suites: the Chromium part is skipped
// locally with a warning when there is no Chromium, and fails under CI.
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { standInContext } from "./aacContext.js";
import { scriptPage } from "./receiptPage.js";
import { CLOSE_TIMEOUT_MS, findChrome, launch } from "./headlessChrome.js";
import {
  caseInputs, KINDS, loadScript, manifestOf, receiptGolden, readBundle, readVerify, serializeContext,
} from "./receiptScripts.js";

const MAIN = [
  { name: "main-buyer-keep", module: "unilateral", keep: true },
  { name: "main-buyer-counterparty", module: "unilateral", keep: false },
  { name: "main-standalone-keep", module: "unilateral", keep: true },
  { name: "main-standalone-counterparty", module: "unilateral", keep: false },
  { name: "main-seller-keep", module: "seller", keep: true },
  { name: "main-seller-counterparty", module: "seller", keep: false },
];

// A page holding all three scripts, as `presentation build` writes one: each
// registers its module with the page's runtime (stood in for here).
function threeScripts() {
  const libs = KINDS.map((kind) => loadScript(kind));
  return libs.map((lib, i) => ({ kind: KINDS[i], lib, module: lib.registered[0] }));
}

describe("a declined ask, with the page's own verifier", () => {
  it("one-sided-refusal-keep is incomplete, never verified, under the default environment", async () => {
    // The oracle's inputs for the member copy and the audience; the bundle's verification is the script's own
    // (pageVerification), which cannot see capsulectl's INCOMPLETE verdict for the refusal member.
    const c = receiptGolden().cases.find((x) => x.name === "one-sided-refusal-keep" && x.audience === "keep");
    const { context, env } = caseInputs(c);
    delete env.verification;
    const lib = loadScript("bilateral");
    const module = lib.api.createModule("bilateral", env);
    expect(await module.canRender(context)).toBe(true);
    const model = await module.buildModel(context);
    expect(model.case).toBe("limit");
    expect(model.verification.outcome).toBe("incomplete");
    expect(model.verification.checks.at(-1)).toEqual({ name: "declined member", outcome: "not_checked", detail: "policy_declined" });
  });
});

describe("real copies capsulectl cut, in jsdom", () => {
  for (const c of MAIN) {
    it(`${c.name}: the ${c.module} receipt and no other; PRIVATE ${c.keep ? "shown" : "not shown"}`, async () => {
      const context = standInContext(readBundle(c.name), { verify: readVerify(c.name) });
      const all = threeScripts();
      const accepting = [];
      for (const { kind, module } of all) if (await module.canRender(context)) accepting.push(kind);
      expect(accepting).toEqual([c.module]);
      const { lib, module } = all.find((x) => x.kind === c.module);
      expect(module.manifest).toEqual({ ...manifestOf(c.module), executable: { ...manifestOf(c.module).executable, script_sha256: "0".repeat(64) } });
      const model = await module.buildModel(context);
      expect(model.receipt?.report.audience ?? model.report.audience).toBe(c.keep ? "keep" : "counterparty");
      // The page's runtime hands one element as L0, L1 and L2, and its depth (L2 unless the page says otherwise).
      const root = lib.document.createElement("div");
      lib.document.body.appendChild(root);
      module.render(model, { L0: root, L1: root, L2: root, depth: "L0" });
      const banners = root.querySelectorAll('[data-banner="private"]');
      expect(banners.length).toBe(c.keep ? 1 : 0);
      expect(root.textContent.includes("PRIVATE")).toBe(c.keep);
      if (c.keep) expect(banners[0].closest('[data-level="L0"]')).not.toBeNull();
      else expect(root.querySelector("[data-shared]").getAttribute("data-shared")).toBe("counterparty");
      // One text node per run of text, as the Python page parses (render normalises).
      const split = [...root.querySelectorAll("*")].filter((e) => [...e.childNodes].some((n, i, all) => n.nodeType === 3 && all[i + 1]?.nodeType === 3));
      expect(split.length).toBe(0);
      expect(root.querySelectorAll("details").length).toBe(2);
      expect(root.querySelectorAll("details details").length).toBe(0);
      expect(root.querySelectorAll("details[open]").length).toBe(0);
      expect(root.querySelector("h2").textContent).toBe(c.module === "seller" ? "Sale receipt" : "Deal report");
      // The verifier's checks shown are the page verifier's, by name.
      expect([...root.querySelectorAll(".cv-check span:nth-child(2)")].slice(0, 3).map((e) => e.textContent))
        .toEqual(["graph closure", "interval coverage", "per record membership"]);
      // The stylesheet: once, the bytes style_sha256 pins.
      const styles = lib.document.querySelectorAll("#cv-kit-css");
      expect(styles.length).toBe(1);
      expect(createHash("sha256").update(styles[0].textContent, "utf8").digest("hex")).toBe(manifestOf(c.module).executable.style_sha256[0]);
      module.render(model, { L0: root, L1: root, L2: root, depth: "L2" });
      expect(lib.document.querySelectorAll("#cv-kit-css").length).toBe(1);
    });
  }

  it("a standalone report is read only when the verifier reported its check as passed, as in Python", async () => {
    const unilateral = threeScripts().find((x) => x.kind === "unilateral").module;
    const edits = {
      "no status": (verify) => { delete verify.extensions.find((e) => e.kind === "x-deal-v0").report; },
      "a failed status": (verify) => { verify.extensions.find((e) => e.kind === "x-deal-v0").status = "fail"; },
    };
    for (const [why, edit] of Object.entries(edits)) {
      const verify = readVerify("main-standalone-keep");
      edit(verify);
      expect(await unilateral.canRender(standInContext(readBundle("main-standalone-keep"), { verify })), why).toBe(false);
    }
    const asReported = standInContext(readBundle("main-standalone-keep"), { verify: readVerify("main-standalone-keep") });
    expect(await unilateral.canRender(asReported)).toBe(true);
    const bundle = readBundle("main-standalone-keep");
    bundle.extensions["x-deal-report/v0"].record.capsule_id = "0".repeat(64);
    expect(await unilateral.canRender(standInContext(bundle, { verify: readVerify("main-standalone-keep") }))).toBe(false);
  });

  it("a standalone report beside a report record on the log is declined, disclosed or not, as in Python", async () => {
    const unilateral = threeScripts().find((x) => x.kind === "unilateral").module;
    const other = readBundle("main-buyer-keep");
    const otherVerify = readVerify("main-buyer-keep");
    const reportId = other.extensions["x-deal-v0"].sealed_report;
    for (const disclosed of [false, true]) {
      const bundle = readBundle("main-standalone-keep");
      const verify = readVerify("main-standalone-keep");
      bundle.records.push(other.records.find((r) => r.capsule_id === reportId));
      verify.record_identity[reportId] = "passed";
      if (disclosed) {
        bundle.disclosures[reportId] = other.disclosures[reportId];
        verify.disclosures.push(otherVerify.disclosures.find((d) => d.capsule_id === reportId));
      }
      expect(await unilateral.canRender(standInContext(bundle, { verify })), `disclosed ${disclosed}`).toBe(false);
    }
    // The same edit without the second report leaves the copy accepted: the decline is the second report's.
    expect(await unilateral.canRender(standInContext(readBundle("main-standalone-keep"), { verify: readVerify("main-standalone-keep") }))).toBe(true);
  });

  it("a journey row is worded as capsulectl's deal page words it, at its edges", async () => {
    const all = threeScripts();
    const { lib, module } = all.find((x) => x.kind === "unilateral");
    const bundle = readBundle("main-standalone-keep");
    const report = bundle.extensions["x-deal-report/v0"].agent_input.report;
    const step = report.journey[0].step;
    const move = (key, facts) => ({ by: "agent", move: "x", key, step, facts });
    report.journey = [
      move("journey.agent.couldnt", { reason: "new_reason" }),
      move("journey.agent.couldnt.who", { reason: "new_reason", who: "Example Shop" }),
      move("journey.agent.couldnt", { reason: "other", detail: "the site was down" }),
      move("journey.agent.couldnt", { reason: "other" }),
      move("journey.agent.couldnt", {}),
      move("journey.agent.no_such_key", {}),
      { by: "agent", step, facts: {} },
      { ...move("journey.user.approved.share_contact", { classes: [] }), by: "user" },
      { ...move("journey.user.approved.share_contact", {}), by: "user" },
      move("journey.agent.told", { who: "Example Shop", classes: ["credential", "id_document", "other_contact"] }),
      { ...move("journey.agent.paused", {}), by: "somebody" },
    ];
    const context = standInContext(bundle, { verify: readVerify("main-standalone-keep") });
    const model = await module.buildModel(context);
    const root = lib.document.createElement("div");
    lib.document.body.appendChild(root);
    module.render(model, { L0: root, L1: root, L2: root, depth: "L2" });
    const heading = [...root.querySelectorAll("h2")].find((h) => h.textContent === "How it went");
    const rows = [...heading.closest("section").querySelectorAll(":scope > .cv-section__body > [data-item] > p")].map((p) => p.textContent.replace(/^\d{4}-[\d-]+T[\d:]+Z · /, ""));
    expect(rows).toEqual([
      "Your agent · Couldn't",
      "Your agent · Couldn't (Example Shop)",
      "Your agent · Couldn't (the site was down)",
      "Your agent",
      "Your agent",
      "Your agent",
      "Your agent",
      "You · OK'd sharing your ",
      "You",
      "Your agent · Told Example Shop your login, ID document and contact details",
      "Someone · Waited for your OK",
    ]);
  });

  it("a seller copy whose kind was dropped is no module's, in the page as in Python", async () => {
    const bundle = readBundle("main-seller-keep");
    delete bundle.extensions["x-deal-seller/v0"];
    const context = standInContext(bundle, { verify: readVerify("main-seller-keep") });
    for (const { module } of threeScripts()) expect(await module.canRender(context)).toBe(false);
  });
});

const chromePath = findChrome();
if (!chromePath && process.env.CI) throw new Error("receipt module-slot test: no Chromium found under CI; set CHROME_PATH");
if (!chromePath) console.warn("SKIPPED the Chromium part of receipt_module_slot.test.js: no Chromium found (set CHROME_PATH to run it)");

const MEASURE = `(() => ({
  rendered: document.body.getAttribute("data-rendered"),
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  banners: document.querySelectorAll('[data-banner="private"]').length,
  nested: document.querySelectorAll("details details").length,
  module: document.querySelector("[data-receipt-module]")?.getAttribute("data-receipt-module") ?? null,
}))()`;
describe.skipIf(!chromePath)("in headless Chromium", () => {
  let browser;
  let tab;
  let dir;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cv-receipt-slot-"));
    browser = await launch(chromePath);
    tab = await browser.newPage();
  }, 150000);
  afterAll(async () => {
    if (browser) await browser.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }, CLOSE_TIMEOUT_MS);

  const settle = async () => {
    for (let i = 0; i < 100; i += 1) {
      const m = await tab.evaluate(MEASURE);
      if (m.rendered) return m;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("the page did not render");
  };

  for (const c of MAIN) {
    for (const width of [390, 1280]) {
      it(`${c.name} at ${width}px: the ${c.module} receipt, PRIVATE ${c.keep ? "shown" : "not shown"}, no sideways scroll`, async () => {
        const context = standInContext(readBundle(c.name), { verify: readVerify(c.name) });
        const head = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>receipt</title></head><body>`;
        const html = scriptPage(head, "", "</body></html>", c.module, { kind: c.module, depth: "L2", context: serializeContext(context) });
        const file = join(dir, `${c.name}.html`);
        writeFileSync(file, html);
        await tab.open(pathToFileURL(file).href, { width, media: "screen" });
        const m = await settle();
        expect(m.rendered).toBe("true");
        expect(m.module).toBe(`capsuleviewer.receipt.${c.module}/v0`);
        expect(m.banners).toBe(c.keep ? 1 : 0);
        expect(m.nested).toBe(0);
        expect(m.overflowX).toBe(0);
      });
    }
  }
});
