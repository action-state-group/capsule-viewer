// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

// contract-report/v1 section 4: resolution on real bundles. The module
// registers in place of aac.builtin.result-contract-report/v0 (verified in
// presentation-registry.test.ts and presentation-resolution-aac-vectors.test.ts);
// this file checks what it does to the two real cards' bundles once that
// block is added to them.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

function fixture(name: string): Obj {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "test", "testdata", name), "utf8"),
  ) as Obj;
}

async function render(bundle: unknown): Promise<HTMLElement> {
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root);
  return root;
}

const CARDS = [
  { file: "outcome-report-bundle.json", page: "outcome-report" },
  { file: "compliance-bundle.json", page: "compliance" },
] as const;

for (const { file, page } of CARDS) {
  it(`${page}: adding "contract-report/v1": {} resolves to the contract-report module and draws the same card`, async () => {
    const before = await render(
      (await sealEvidenceBundle(fixture(file))).bundle,
    );
    const beforeCard = before.querySelector(`[data-page="${page}"]`)!;
    expect(beforeCard).not.toBeNull();

    const source = fixture(file);
    (source.extensions as Obj)["contract-report/v1"] = {};
    const after = await render((await sealEvidenceBundle(source)).bundle);
    const afterCard = after.querySelector(`[data-page="${page}"]`)!;
    expect(afterCard).not.toBeNull();
    expect(afterCard.outerHTML).toBe(beforeCard.outerHTML);
  });

  it(`${page}: a malformed contract-report/v1 block ({"x":1}) is declined, and the old card draws, byte for byte the same`, async () => {
    const before = await render(
      (await sealEvidenceBundle(fixture(file))).bundle,
    );
    const beforeCard = before.querySelector(`[data-page="${page}"]`)!;

    const source = fixture(file);
    (source.extensions as Obj)["contract-report/v1"] = { x: 1 };
    const after = await render((await sealEvidenceBundle(source)).bundle);
    const afterCard = after.querySelector(`[data-page="${page}"]`)!;
    expect(afterCard).not.toBeNull();
    expect(afterCard.outerHTML).toBe(beforeCard.outerHTML);
    // present and malformed still means engaged for the verification page:
    // the block is listed, not silently dropped.
    const row = after.querySelector<HTMLElement>(
      '[data-extensions] [data-extension-id="contract-report/v1"]',
    );
    expect(row).not.toBeNull();
  });
}

it("a Result carrying only the contract-report/v1 block (neither outcome-report/v1 nor eu-ai-act-compliance/v1) draws the generic Result page", async () => {
  const source = fixture("result-root-bundle.json");
  source.extensions = { "contract-report/v1": {} };
  const { bundle } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  expect(root.querySelector('[data-page="result"]')).not.toBeNull();
  expect(root.querySelector('[data-page="outcome-report"]')).toBeNull();
  expect(root.querySelector('[data-page="compliance"]')).toBeNull();
});

it("the verification page lists contract-report/v1 as present and engaged, and the extension it drew its card from as interpreted", async () => {
  const source = fixture("outcome-report-bundle.json");
  (source.extensions as Obj)["contract-report/v1"] = {};
  const { bundle } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  const table = root.querySelector<HTMLElement>("[data-extensions]")!;
  expect(table).not.toBeNull();
  const contractReportRow = table.querySelector<HTMLElement>(
    '[data-extension-id="contract-report/v1"]',
  )!;
  expect(contractReportRow).not.toBeNull();
  expect(contractReportRow.dataset.integrity).toBe("covered");
  // agent-action-capsule 0.5.0's own extension-interpreter table (unexported,
  // and ExtensionInterpreterId is a closed union with no contract-report
  // member) has no entry for contract-report/v1 itself: the core runtime
  // ships no contract-report module (spec section 4), so this is the
  // package's correct, documented default -- "MAY list the block as
  // interpreted", not "MUST" -- and this viewer does not override a sealed
  // internal registry with an unsafe cast to claim an id the type does not
  // have. The block is still listed, never dropped (section 1).
  expect(contractReportRow.dataset.semantics).toBe("uninterpreted");
  // The outcome-report/v1 block this card actually drew its rows from shows
  // as interpreted, by the outcome-report-card reader: the module's draw was
  // applied, correctly credited to the extension it read.
  const outcomeRow = table.querySelector<HTMLElement>(
    '[data-extension-id="outcome-report/v1"]',
  )!;
  expect(outcomeRow.dataset.semantics).toBe("interpreted");
  expect(outcomeRow.textContent).toContain("Shown by the page's module");
});
