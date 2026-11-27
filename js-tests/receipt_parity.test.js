// The receipt modules' module-slot scripts against the frozen receipt golden
// (tests/testdata/receipt/oracle-golden.json.gz: what the Python modules, the
// scripts' twins, made of every case; tests/test_receipt_oracle_golden.py holds
// it to them while they exist). For every receipt fixture
// under tests/testdata/receipt/ (single copies, seller and producer copies,
// compositions, the deal-view golden, and the copies capsulectl as capsule-cli
// main builds it cut, main-*) at every audience a page may be for,
// and for each copy whose seller kind was dropped or added, each of the
// three deal scripts, and the provider's own receipt (capsule-viewer#390) on
// those and on the provider's receipt with its records edited, must:
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
import { caseInputs, canonHtml, canonNodes, KINDS, levelNodes, loadScript, packAddsOnly, receiptGolden, renderInto, withAddedWords, withCurrentPack, VIEWER_FIELDS, withoutAmountCard, withoutViewerFields, withoutViewerLines } from "./receiptScripts.js";
// The receipt wording pack id, Go and Python alike (evidencebook#956, #439): never one named "example".
const PACK_ID = "capsuleviewer.receipt.wording.en/v1";

// What the frozen twin never draws, compared apart (VIEWER_FIELDS and
// VIEWER_LINES in receiptScripts.js), and pinned here: each line, by the
// cases whose copy draws it.
// - settlement: each copy discloses an action naming a rail other than the
//   simulated one and carries no settlement leg.
// - counterparty_named: no fixture's report opens who the deal was with or
//   their words accepting (capsulectl writes them on the holder's own copy
//   since evidencebook-deal#56; these fixtures predate it), so none draws it,
//   and no counterparty copy ever does.
// - authority_sealed: the seller's own copies of a deal sealed in typed
//   records, the only reports carrying AUTHORITY blocks (capsulectl writes
//   them on the holder's own copy only); every act in them is covered.
// - referee: no fixture's adjudicator copy seals a referee (capsulectl seals
//   one since --to on an adjudicator's copy; these predate it), so none draws it.
// - deal_id_title (the card's title, not a model field: model.deal_id is the
//   twin's): every copy whose sealed report names its deal, so all but the
//   Mesh payer's, whose report names none.
// - after_yes: every x-deal-v0 copy with an act or a withheld step. Only the
//   main-standalone copies place their steps in a book (their records carry
//   evidence_record_header): the keep copies pass, approved by the user; the
//   counterparty copy withholds steps, so it is not checked. Every other
//   copy's steps have no place in a book, so it is not checked either.
const VIEWER_LINES_DRAWN = {
  settlement: {
    "golden-2 @keep unilateral": "missing",
    "keep @keep unilateral": "missing",
    "keep+one-producer @keep unilateral": "missing",
    "keep+producer-removed @keep unilateral": "missing",
    "main-buyer-keep @keep unilateral": "missing",
    "main-standalone-keep @keep unilateral": "missing",
  },
  counterparty_named: {},
  referee: {},
  deal_id_title: {
    "adjudicator @adjudicator unilateral": " · deal-9afcfc8782fedcca",
    "buyer-producer-counterparty @counterparty unilateral": " · deal-9ad7aeb443087ea7",
    "counterparty @counterparty unilateral": " · deal-9afcfc8782fedcca",
    "golden-2 @keep unilateral": " · deal-498ba095c7031abb",
    "keep @keep unilateral": " · deal-9afcfc8782fedcca",
    "keep+one-producer @keep unilateral": " · deal-9afcfc8782fedcca",
    "keep+producer-removed @keep unilateral": " · deal-9afcfc8782fedcca",
    "main-buyer-counterparty @counterparty unilateral": " · deal-9bed034f785cd2d6",
    "main-buyer-keep @keep unilateral": " · deal-9bed034f785cd2d6",
    "main-seller-counterparty @counterparty seller": " · deal-8cb570c444b99417",
    "main-seller-keep @keep seller": " · deal-8cb570c444b99417",
    "main-standalone-counterparty @counterparty unilateral": " · deal-99f5cc056d8030ba",
    "main-standalone-keep @keep unilateral": " · deal-99f5cc056d8030ba",
    "main-standalone-simulated-keep @keep unilateral": " · deal-99f5cc056d8030ba",
    "seller-adjudicator @adjudicator seller": " · deal-5e11e7b1c7c1e0a1",
    "seller-counterparty @counterparty seller": " · deal-5e11e7b1c7c1e0a1",
    "seller-declined @counterparty seller": " · deal-a5aaeea750aeb168",
    "seller-keep @keep seller": " · deal-5e11e7b1c7c1e0a1",
    "seller-producer-adjudicator @adjudicator seller": " · deal-460f92d1e117c923",
    "seller-producer-counterparty @counterparty seller": " · deal-460f92d1e117c923",
    "seller-producer-keep @keep seller": " · deal-460f92d1e117c923",
  },
  authority_sealed: {
    "main-seller-keep @keep seller": "2 blocks, 0 uncovered",
    "seller-keep @keep seller": "4 blocks, 0 uncovered",
    "seller-producer-keep @keep seller": "2 blocks, 0 uncovered",
  },
  after_yes: {
    "adjudicator @adjudicator unilateral": "unplaced",
    "buyer-producer-counterparty @counterparty unilateral": "unplaced",
    "counterparty @counterparty unilateral": "unplaced",
    "golden-2 @keep unilateral": "unplaced",
    "keep @keep unilateral": "unplaced",
    "keep+one-producer @keep unilateral": "unplaced",
    "keep+producer-removed @keep unilateral": "unplaced",
    "main-buyer-counterparty @counterparty unilateral": "unplaced",
    "main-buyer-keep @keep unilateral": "unplaced",
    "main-seller-counterparty @counterparty seller": "unplaced",
    "main-seller-keep @keep seller": "unplaced",
    "main-standalone-counterparty @counterparty unilateral": "withheld",
    "main-standalone-keep @keep unilateral": "passed user",
    "main-standalone-simulated-keep @keep unilateral": "passed user",
    "mesh-payer-selected @keep unilateral": "unplaced",
    "seller-adjudicator @adjudicator seller": "unplaced",
    "seller-counterparty @counterparty seller": "unplaced",
    "seller-declined @counterparty seller": "unplaced",
    "seller-keep @keep seller": "unplaced",
    "seller-producer-adjudicator @adjudicator seller": "unplaced",
    "seller-producer-counterparty @counterparty seller": "unplaced",
    "seller-producer-keep @keep seller": "unplaced",
  },
};
// What the parity test records of each viewer line a case draws.
const SUMMARY = {
  settlement: (line) => line.state,
  counterparty_named: (named) => named,
  referee: (r) => r,
  authority_sealed: (a) => `${a.blocks.length} blocks, ${a.blocks.filter((b) => !b.covered).length} uncovered`,
  after_yes: (yes) => [yes.state, yes.why, yes.act && yes.act.step.slice(0, 8), ...yes.approvers].filter((x) => x !== undefined).join(" "),
};

describe("receipt scripts vs the Python modules (the oracle)", () => {
  let oracle;
  const loaded = {};
  beforeAll(() => {
    // The oracle's pages are read with the current pack's sha256 only while the pack adds keys and changes none.
    expect(packAddsOnly()).toEqual({ changed: [], frozenId: PACK_ID, currentId: PACK_ID });
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
    expect(oracle.cases.length).toBe(170);
    expect([...names].filter((n) => !n.includes("+")).length).toBe(29);
    // 23 deal edits, 60 of the provider's receipt.
    expect([...names].filter((n) => n.includes("+")).length).toBe(83);
  });

  it("compares every case, model and depth (the count is the parity result)", async () => {
    const compared = { cases: 0, accepted: 0, models: 0, renders: 0, bytes: 0 };
    const drawn = Object.fromEntries(VIEWER_FIELDS.map((f) => [f, {}]));
    drawn.deal_id_title = {};
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
        const receipt = model.receipt || model;
        for (const f of VIEWER_FIELDS) if (receipt[f] !== undefined) drawn[f][`${c.name} @${c.audience} ${kind}`] = SUMMARY[f](receipt[f]);
        try {
          expect(withoutViewerFields(model)).toEqual(py.model);
        } catch (err) {
          differences.push(`${c.name} @${c.audience} ${kind}: model differs\n${String(err.message).slice(0, 2000)}`);
          continue;
        }
        for (const [depth, html] of Object.entries(py.html)) {
          compared.renders += 1;
          const nodes = levelNodes(renderInto(lib, module, model, depth));
          const title = nodes[0].querySelector("h2 [data-deal-id]");
          if (title) drawn.deal_id_title[`${c.name} @${c.audience} ${kind}`] = title.textContent;
          const js = canonNodes(lib.document, withoutViewerLines(nodes));
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
    expect(drawn).toEqual(VIEWER_LINES_DRAWN);
    // 29 fixtures x 3 audiences + 23 deal edits (21 declined by
    // all three, as the Python twin declines it; the two producer ones are accepted by the unilateral module, at L2 only)
    // + 60 edits of the provider's receipt (declined by all three); 34 accepted (module, case)
    // pairs, the 32 fixture pairs rendered at L0, L1 and L2.
    expect({ ...compared, bytes: undefined }).toEqual({ cases: 170, accepted: 34, models: 34, renders: 98, bytes: undefined });
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
        expect(withoutViewerFields(model)).toEqual(py.model);
        const js = canonNodes(lib.document, withoutViewerLines(levelNodes(renderInto(lib, module, model, "L2"))));
        const py2 = withAddedWords(lib.document, withCurrentPack(py.html.L2));
        expect(js).toBe(canonHtml(lib.document, model.headline && model.headline.amount === "not_present" ? withoutAmountCard(lib.document, py2) : py2));
      }
    }
  }, 300000);

  // The provider's module has one level: the twin's page is the script's L0
  // under the title the twin's page heads it with (the shell's, in Python),
  // and L1 and L2 are empty. Its served time stays in UTC, as the twin's.
  it("the provider's own receipt: the same cases, model and page as the Python twin (#390)", async () => {
    const lib = loadScript("provider");
    const compared = { accepted: 0, declined: 0 };
    const differences = [];
    for (const c of oracle.cases) {
      const py = c.modules.provider;
      const { context, env } = caseInputs(c);
      // The edited copies are the module's cases, not report checks: a page
      // asks nothing of a provider's receipt beyond the runtime's gate.
      const asked = [];
      const module = lib.api.createModule("provider", {
        ...env,
        reportCheck: () => asked.push("report"),
        preimageCheck: () => asked.push("preimage"),
      });
      const accepts = await module.canRender(context);
      if (accepts !== py.can_render) {
        differences.push(`${c.name} @${c.audience}: canRender ${accepts}, Python ${py.can_render}`);
        continue;
      }
      if (!accepts) {
        compared.declined += 1;
        continue;
      }
      compared.accepted += 1;
      const model = await module.buildModel(context);
      expect(model, c.name).toEqual(py.model);
      const host = renderInto(lib, module, model, "L2");
      const [l0, l1, l2] = levelNodes(host);
      expect(l1.childNodes.length, c.name).toBe(0);
      expect(l2.childNodes.length, c.name).toBe(0);
      const [title, ...page] = [...l0.children];
      // The owner's title: a failed or dispatched exchange was not served (#465).
      expect(title.outerHTML).toBe(
        model.effect === "confirmed" ? "<h2>Your receipt for an exchange you served</h2>" : "<h2>Your record of an exchange you were asked to serve</h2>",
      );
      const js = canonNodes(lib.document, page);
      const want = canonHtml(lib.document, py.html.page);
      if (js !== want) differences.push(`${c.name}: page differs\n  js: ${js}\n  py: ${want}`);
      expect(asked, c.name).toEqual([]);
    }
    expect(differences).toEqual([]);
    // The fixture at its three audiences (the twin's module takes any; the
    // manifest names the owner's only) and 42 edited copies it still accepts:
    // 31 confirmed, 9 failed (no reason, each reason class, an unknown one,
    // no payment with and without a reason) and 2 dispatched (#465).
    expect(compared).toEqual({ accepted: 45, declined: 125 });
  }, 300000);

  it("each script registers exactly its own module, under its manifest", () => {
    for (const kind of [...KINDS, "provider"]) {
      const lib = loadScript(kind);
      expect(lib.registered.length).toBe(1);
      expect(lib.registered[0].manifest.id).toBe(`capsuleviewer.receipt.${kind}/v0`);
    }
  });
});
