// The receipt modules' module-slot scripts against their Python twins, which
// are the test oracle (tests/receipt_oracle.py). For every receipt fixture
// under tests/testdata/receipt/ (single copies, seller and producer copies,
// compositions, the deal-view golden, and the copies capsulectl as capsule-cli
// main builds it cut, main-*) at every audience a page may be for,
// and for each copy whose seller kind was dropped or added, each of the
// three scripts must:
//   - accept (canRender) exactly the cases its Python twin accepts;
//   - build the same model, field for field (dataclasses.asdict on the
//     Python side);
//   - render the same result at L0, L1 and L2: the Python module's HTML and
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
import { caseInputs, canonHtml, canonNodes, KINDS, levelNodes, loadScript, pythonOracle, renderInto } from "./receiptScripts.js";

const plain = (v) => JSON.parse(JSON.stringify(v));

describe("receipt scripts vs the Python modules (the oracle)", () => {
  let oracle;
  const loaded = {};
  beforeAll(() => {
    oracle = pythonOracle();
    for (const kind of KINDS) loaded[kind] = loadScript(kind);
  }, 120000);

  it("covers every receipt fixture, at every audience, and the edited copies", () => {
    const names = new Set(oracle.cases.map((c) => c.name));
    expect(oracle.cases.length).toBe(100);
    expect([...names].filter((n) => !n.includes("+")).length).toBe(27);
    expect([...names].filter((n) => n.includes("+")).length).toBe(19);
  });

  it("compares every case, model and depth (the count is the parity result)", async () => {
    const compared = { cases: 0, accepted: 0, models: 0, renders: 0, bytes: 0 };
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
        try {
          expect(plain(model)).toEqual(py.model);
        } catch (err) {
          differences.push(`${c.name} @${c.audience} ${kind}: model differs\n${String(err.message).slice(0, 2000)}`);
          continue;
        }
        for (const [depth, html] of Object.entries(py.html)) {
          compared.renders += 1;
          const js = canonNodes(lib.document, levelNodes(renderInto(lib, module, model, depth)));
          const want = canonHtml(lib.document, html);
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
    // 27 fixtures x 3 audiences + 19 edited copies (each edited copy declined by
    // all three, as the Python twin declines it); 30 accepted (module, case)
    // pairs, each rendered at L0, L1 and L2.
    expect({ ...compared, bytes: undefined }).toEqual({ cases: 100, accepted: 30, models: 30, renders: 90, bytes: undefined });
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
        expect(plain(model)).toEqual(py.model);
        const js = canonNodes(lib.document, levelNodes(renderInto(lib, module, model, "L2")));
        expect(js).toBe(canonHtml(lib.document, py.html.L2));
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
