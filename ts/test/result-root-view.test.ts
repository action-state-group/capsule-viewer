// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

// The generic Result page (evidence-graph-view.ts renderResultPage), ported
// from agent-action-capsule's own #368 (out_of_scope, the fourth bucket) and
// its applicability split (ER v0 section 4.3): the page this viewer draws
// for a Result root that carries neither outcome-report/v1 nor
// eu-ai-act-compliance/v1 data -- the same page the contract-report module
// falls back to when a Result opts into contract-report/v1 with neither
// (capsule-viewer#56 tracks a wording-pack-driven view of its own for it;
// this page's own text is the core's fixed text, per presentation-contract
// section 6, not from a pack).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

function fixture(): Obj {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "test", "testdata", "result-root-bundle.json"),
      "utf8",
    ),
  ) as Obj;
}

function doc(source: Obj): Obj {
  return ((source.disclosures as Obj).result as Obj).agent_input as Obj;
}

async function render(source: Obj): Promise<HTMLElement> {
  const { bundle } = await sealEvidenceBundle(source);
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root);
  return root;
}

it("the fourth bucket draws when the Result carries out_of_scope, counted on its own, never in met", async () => {
  const source = fixture();
  const d = doc(source);
  const claims = d.claims as Obj[];
  // claim-3 (previously not_evaluable) is judged out of scope.
  claims[2]!.verdict = "out_of_scope";
  claims[2]!.sufficiency = "SATISFIED";
  claims[2]!.out_of_scope_allowed = true;
  const aggregate = d.aggregate as Obj;
  (aggregate.buckets as Obj).not_evaluable = [];
  (aggregate.buckets as Obj).out_of_scope = ["claim-3"];
  const root = await render(source);
  // The core strip draws the fourth bucket's tile, counted beside the same
  // denominator as the others.
  const tile = root.querySelector<HTMLElement>(
    '[data-core-strip] [data-bucket="out_of_scope"]',
  )!;
  expect(tile.dataset.count).toBe("1");
  expect(tile.dataset.of).toBe("3");
  const buckets = root.querySelector<HTMLElement>('[data-buckets="verdict"]')!;
  const outOfScopeHeading = [...buckets.querySelectorAll("h3")].find(
    (h) => (h as HTMLElement).dataset.bucketOf === "outOfScope",
  ) as HTMLElement;
  expect(outOfScopeHeading).toBeDefined();
  expect(outOfScopeHeading.dataset.bucketCount).toBe("1");
  expect(
    buckets.querySelector(
      '[data-bucket="outOfScope"] [data-claim-ref="claim-3"]',
    ),
  ).not.toBeNull();
  // never counted as met
  const metList = buckets.querySelector('[data-bucket="met"]')!;
  expect(metList.textContent).not.toContain("claim-3");
  // the copied-fact note names the out-of-scope switch, with no dates on this Result
  const copied = root.querySelector<HTMLElement>("[data-copied-facts]")!;
  expect(copied).not.toBeNull();
  expect(copied.dataset.asOf).toBeUndefined();
  expect(copied.textContent).toBe(
    "The out-of-scope switch is copied from the contract, not re-checked here.",
  );
});

it("a claim not yet in force is shown in its own section, after the in-force buckets, with the as-of date and the copied-facts note -- never merged with them", async () => {
  const source = fixture();
  const d = doc(source);
  const claims = d.claims as Obj[];
  // claim-3's requirement applies from after generated_at (2026-09-16): later.
  claims[2]!.applies_from = "2027-01-01";
  const aggregate = d.aggregate as Obj;
  (aggregate.coverage as Obj).not_yet_in_force = 1;
  (aggregate.buckets as Obj).not_evaluable = [];
  const root = await render(source);
  const coverage = root.querySelector<HTMLElement>(
    "[data-core-strip] .agg-line",
  )!;
  expect(coverage.dataset.notYetInForce).toBe("1");
  expect(coverage.textContent).toContain("1 evaluation not yet in force");
  const copied = root.querySelector<HTMLElement>("[data-copied-facts]")!;
  expect(copied.dataset.asOf).toBe("2026-09-16");
  expect(copied.textContent).toBe(
    "In force as of 2026-09-16. The dates are copied from the contract, not re-checked here.",
  );
  const buckets = root.querySelector<HTMLElement>('[data-buckets="verdict"]')!;
  // never merged into not_evaluable: that bucket is empty
  const notEvaluableList = buckets.querySelector(
    '[data-bucket="notEvaluable"]',
  );
  expect(notEvaluableList).toBeNull();
  // its own section, after the verdict buckets
  const laterHeading = [...buckets.querySelectorAll("h3")].find(
    (h) => (h as HTMLElement).dataset.bucketOf === "notYetInForce",
  ) as HTMLElement;
  expect(laterHeading).toBeDefined();
  const laterItem = buckets.querySelector<HTMLElement>(
    '[data-bucket="notYetInForce"] [data-claim-ref="claim-3"]',
  )!;
  expect(laterItem).not.toBeNull();
  expect(laterItem.textContent).toBe(
    "claim-3 · applies from 2027-01-01 · readiness: not_evaluable",
  );
  const headingIndex = [...buckets.children].indexOf(laterHeading);
  const metHeadingIndex = [...buckets.children].findIndex(
    (c) => (c as HTMLElement).dataset.bucketOf === "met",
  );
  expect(headingIndex).toBeGreaterThan(metHeadingIndex);
});
