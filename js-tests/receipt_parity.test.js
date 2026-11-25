// The receipt modules' module-slot scripts against the frozen receipt golden
// (tests/testdata/receipt/oracle-golden.json.gz: what the Python modules, the
// scripts' twins, made of every case; tests/test_receipt_oracle_golden.py holds
// it to them while they exist). For every receipt fixture
// under tests/testdata/receipt/ (single copies, seller and producer copies,
// compositions, the deal-view golden, and the copies capsulectl as capsule-cli
// main builds it cut, main-*) at every audience a page may be for,
// and for each copy whose seller kind was dropped or added, each of the
// three scripts must:
//   - accept (canRender) exactly the cases the golden records as accepted;
//   - build the same model, field for field (dataclasses.asdict on the
//     Python side);
//   - render the same result at L0, L1 and L2: the golden's HTML and
//     the script's DOM, each parsed and serialised one canonical way
//     (attributes sorted), must be equal.
// Both sides are handed the same inputs the page's runtime does not give a
// module: capsulectl's verification and assurance for the bundle and each
// carried copy, and the page's audience. A module the runtime registers
// takes no audience (the copy's own); that case is checked against the
// Python twin at the audience each copy was cut for.
//
// Run with RECEIPT_SCRIPT_DIR=<dir holding mutated receipt_*.js> to see it
// fail on a mutant.
import { beforeAll, describe, expect, it } from "vitest";
import { caseInputs, canonHtml, canonNodes, KINDS, levelNodes, loadScript, packAddsOnly, receiptGolden, renderInto, withAddedWords, withCurrentPack, withoutAmountCard, withoutSettlement, withoutSettlementLine } from "./receiptScripts.js";

// What the frozen twin never draws, compared apart: the settlement line
// (withoutSettlement in receiptScripts.js). These are the cases whose copy
// draws it: each discloses an action naming a rail other than the simulated
// one and carries no settlement leg.
const SETTLEMENT_LINES = {
  "golden-2 @keep unilateral": "missing",
  "keep @keep unilateral": "missing",
  "keep+one-producer @keep unilateral": "missing",
  "keep+producer-removed @keep unilateral": "missing",
  "main-buyer-keep @keep unilateral": "missing",
  "main-standalone-keep @keep unilateral": "missing",
};


describe("receipt scripts vs the Python modules (the oracle)", () => {
  let oracle;
  const loaded = {};
  beforeAll(() => {
    // The oracle's pages are read with the current pack's sha256 only while the pack adds keys and changes none.
    expect(packAddsOnly()).toEqual({ changed: [], sameId: false }); // the id differs by design (evidencebook#956)
    oracle = receiptGolden();
    for (const kind of KINDS) loaded[kind] = loadScript(kind);
  }, 120000);

  it("reads an oracle value as a word only where the pack added that word (#391)", () => {
    const { document: doc } = loaded.unilateral;
    const span = (key, value) => `<p>Deal: <span class="cv-mono" data-unworded="${key}">${value}</span></p>`;
    expect(withAddedWords(doc, span("deal_type.service", "service"))).toBe("<p>Deal: Service</p>");
    expect(withAddedWords(doc, span("deal_type.rental", "rental"))).toBe("<p>Deal: Rental</p>");
    // A key no pack words stays unworded, as both sides draw it.
    expect(withAddedWords(doc, span("deal_type.barter", "barter"))).toBe(span("deal_type.barter", "barter"));
    // The oracle does draw the Mesh exchange's "service" unworded.
    expect(oracle.cases.some((c) => Object.values(c.modules).some((m) => Object.values(m.html || {}).some((h) => h.includes('data-unworded="deal_type.service"'))))).toBe(true);
  });

  it("covers every receipt fixture, at every audience, and the edited copies", () => {
    const names = new Set(oracle.cases.map((c) => c.name));
    expect(oracle.cases.length).toBe(110);
    expect([...names].filter((n) => !n.includes("+")).length).toBe(29);
    expect([...names].filter((n) => n.includes("+")).length).toBe(23);
  });

  it("compares every case, model and depth (the count is the parity result)", async () => {
    const compared = { cases: 0, accepted: 0, models: 0, renders: 0, bytes: 0 };
    const settled = {};
    const differences = [];
    for (const c of oracle.cases) {
      compared.cases += 1;
      const { context, env } = caseInputs(c);
      for (const kind of KINDS) {
        const py = c.modules[kind];
        const lib = loaded[kind];
        const module = lib.api.createModule(kind, env);
        const accepts = await module.canRender(context);
        if (accepts !== py.can_render) {
          differences.push(`${c.name} @${c.audience} ${kind}: canRender ${accepts}, Python ${py.can_render}`);
          continue;
        }
        if (!accepts) continue;
        compared.accepted += 1;
        const model = await module.buildModel(context);
        compared.models += 1;
        const line = (model.settlement || (model.receipt && model.receipt.settlement) || {}).state;
        if (line !== undefined) settled[`${c.name} @${c.audience} ${kind}`] = line;
        try {
          expect(withoutSettlement(model)).toEqual(py.model);
        } catch (err) {
          differences.push(`${c.name} @${c.audience} ${kind}: model differs\n${String(err.message).slice(0, 2000)}`);
          continue;
        }
        for (const [depth, html] of Object.entries(py.html)) {
          compared.renders += 1;
          const js = canonNodes(lib.document, withoutSettlementLine(levelNodes(renderInto(lib, module, model, depth))));
          const py0 = withAddedWords(lib.document, withCurrentPack(html));
          const want = canonHtml(lib.document, model.headline && model.headline.amount === "not_present" ? withoutAmountCard(lib.document, py0) : py0);
          compared.bytes += want.length;
          if (js !== want) {
            let at = 0;
            while (at < js.length && js[at] === want[at]) at += 1;
            differences.push(`${c.name} @${c.audience} ${kind} ${depth}: render differs at ${at}\n  js: ${js.slice(Math.max(0, at - 200), at + 200)}\n  py: ${want.slice(Math.max(0, at - 200), at + 200)}`);
          }
        }
      }
    }
    console.log(`receipt parity: ${JSON.stringify(compared)}`);
    expect(differences).toEqual([]);
    expect(settled).toEqual(SETTLEMENT_LINES);
    // 29 fixtures x 3 audiences + 23 edited copies (21 declined by
    // all three, as the Python twin declines it; the two producer ones are accepted by the unilateral module, at L2 only); 34 accepted (module, case)
    // pairs, the 32 fixture pairs rendered at L0, L1 and L2.
    expect({ ...compared, bytes: undefined }).toEqual({ cases: 110, accepted: 34, models: 34, renders: 98, bytes: undefined });
    expect(compared.bytes).toBeGreaterThan(1000000);
  }, 600000);

  it("a registered module (no page audience) shows each copy as the Python twin does for the audience it was cut for", async () => {
    for (const c of oracle.cases) {
      if (c.name.includes("+") || c.audience !== oracle.audience_of[c.name]) continue;
      const { context, env } = caseInputs(c, null);
      for (const kind of KINDS) {
        const py = c.modules[kind];
        const lib = loaded[kind];
        const module = lib.api.createModule(kind, env);
        expect(await module.canRender(context), `${c.name} ${kind}`).toBe(py.can_render);
        if (!py.can_render) continue;
        const model = await module.buildModel(context);
        expect(withoutSettlement(model)).toEqual(py.model);
        const js = canonNodes(lib.document, withoutSettlementLine(levelNodes(renderInto(lib, module, model, "L2"))));
        const py2 = withAddedWords(lib.document, withCurrentPack(py.html.L2));
        expect(js).toBe(canonHtml(lib.document, model.headline && model.headline.amount === "not_present" ? withoutAmountCard(lib.document, py2) : py2));
      }
    }
  }, 300000);

  it("each script registers exactly its own module, under its manifest", () => {
    for (const kind of KINDS) {
      const lib = loadScript(kind);
      expect(lib.registered.length).toBe(1);
      expect(lib.registered[0].manifest.id).toBe(`capsuleviewer.receipt.${kind}/v0`);
    }
  });
});
