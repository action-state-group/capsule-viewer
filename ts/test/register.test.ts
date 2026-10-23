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

for (const { file, kind } of [
  { file: "outcome-report-bundle.json", kind: "outcome-report/v1" },
  { file: "compliance-bundle.json", kind: "eu-ai-act-compliance/v1" },
] as const)
  it(`the verification page lists contract-report/v1 as interpreted by the contract-report module, beside the ${kind} block it drew its card from`, async () => {
    const source = fixture(file);
    (source.extensions as Obj)["contract-report/v1"] = {};
    const { bundle } = await sealEvidenceBundle(source);
    const root = await render(bundle);
    const table = root.querySelector<HTMLElement>("[data-extensions]")!;
    expect(table).not.toBeNull();
    const contractReportRow = table.querySelector<HTMLElement>(
      '[data-extension-id="contract-report/v1"]',
    )!;
    expect(contractReportRow.dataset.integrity).toBe("covered");
    expect(contractReportRow.dataset.semantics).toBe("interpreted");
    expect(contractReportRow.textContent).toContain(
      "Shown by the page's module",
    );
    // The earlier block is still read by its own reader (contract-report/v1
    // section 5), and the card drew its data from it.
    const earlierRow = table.querySelector<HTMLElement>(
      `[data-extension-id="${kind}"]`,
    )!;
    expect(earlierRow.dataset.semantics).toBe("interpreted");
    expect(earlierRow.textContent).toContain("Shown by the page's module");
  });

it("a Result carrying only contract-report/v1 lists it as interpreted: the contract-report module drew the generic Result page", async () => {
  const source = fixture("result-root-bundle.json");
  source.extensions = { "contract-report/v1": {} };
  const { bundle } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  expect(root.querySelector('[data-page="result"]')).not.toBeNull();
  const row = root.querySelector<HTMLElement>(
    '[data-extensions] [data-extension-id="contract-report/v1"]',
  )!;
  expect(row.dataset.semantics).toBe("interpreted");
});

it("when the claims do not fit the card, contract-report/v1 is interpreted and the earlier block is not: the module drew the generic Result page", async () => {
  const source = fixture("compliance-bundle.json");
  (source.extensions as Obj)["contract-report/v1"] = {};
  const doc = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
  // a claim under a second contract: the card cannot place it
  const claim = (doc.claims as Obj[])[0]!;
  claim.contract_ref = `${claim.contract_ref as string}-other`;
  const { bundle } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  expect(root.querySelector('[data-notice="card-unfit"]')).not.toBeNull();
  expect(root.querySelector('[data-page="result"]')).not.toBeNull();
  const semantics = (kind: string) =>
    root.querySelector<HTMLElement>(
      `[data-extensions] [data-extension-id="${kind}"]`,
    )?.dataset.semantics;
  expect(semantics("contract-report/v1")).toBe("interpreted");
  expect(semantics("eu-ai-act-compliance/v1")).toBe("uninterpreted");
});

it("a declined contract-report/v1 block is listed as not interpreted", async () => {
  const source = fixture("outcome-report-bundle.json");
  (source.extensions as Obj)["contract-report/v1"] = { x: 1 };
  const { bundle } = await sealEvidenceBundle(source);
  const row = (await render(bundle)).querySelector<HTMLElement>(
    '[data-extensions] [data-extension-id="contract-report/v1"]',
  )!;
  expect(row.dataset.semantics).toBe("uninterpreted");
});
