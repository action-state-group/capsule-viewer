// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// A deal copy carried in a report whose standalone report fails the page's
// own check (#398) reads as a receipt that did not pass its checks, never as
// one this page has no viewer for (Sherlock2, the #398 follow-up).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createPresentationRegistry,
  renderEvidenceGraph,
} from "../src/evidence-graph-view.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;
const repo = (...parts: string[]): string =>
  readFileSync(resolve(process.cwd(), "..", ...parts), "utf8");

/** A Result with one claim, `d1::req-1`, opted into contract-report/v1. */
function dealResult(): Obj {
  const bundle = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "test", "testdata", "result-root-bundle.json"),
      "utf8",
    ),
  ) as Obj;
  bundle.extensions = {
    ...((bundle.extensions as Obj | undefined) ?? {}),
    "contract-report/v1": {},
  };
  const doc = ((bundle.disclosures as Obj).result as Obj).agent_input as Obj;
  const names: Record<string, string> = {
    "claim-1": "d1::req-1",
    "claim-2": "plain-2",
    "claim-3": "plain-3",
  };
  for (const claim of doc.claims as Obj[])
    claim.id = names[claim.id as string]!;
  const buckets = (doc.aggregate as Obj).buckets as Record<string, string[]>;
  for (const key of Object.keys(buckets))
    buckets[key] = buckets[key]!.map((id) => names[id]!);
  return bundle;
}

describe("a carried deal copy whose standalone report fails", () => {
  it("says the receipt did not pass its checks", async () => {
    const keep = JSON.parse(
      repo("tests", "testdata", "receipt", "main-standalone-keep.bundle.json"),
    ) as Obj;
    // A change only the report check sees: the bundle's own checks still pass.
    const x = (keep["extensions"] as Obj)["x-deal-report/v0"] as Obj;
    (x["agent_input"] as Obj)["audience"] = "adjudicator";
    const { bundle } = await sealEvidenceBundle(dealResult());
    const root = document.createElement("main");
    document.body.append(root);
    await renderEvidenceGraph(bundle, root, undefined, {
      depth: "L2",
      registry: createPresentationRegistry(),
      receipts: { d1: JSON.stringify(keep) },
    });
    const line = root.querySelector<HTMLElement>(
      '[data-claim-ref="d1::req-1"]',
    )!;
    line
      .querySelector<HTMLButtonElement>('button[data-receipt="open"]')!
      .click();
    await vi.waitFor(
      () => {
        if (
          !line.querySelector(".rcpt-panel")?.hasAttribute("data-receipt-state")
        )
          throw new Error("the receipt has not finished opening");
      },
      { timeout: 10_000, interval: 5 },
    );
    const panel = line.querySelector(".rcpt-panel")!;
    expect(panel.getAttribute("data-receipt-state")).toBe("unverified");
    expect(panel.textContent).toBe(
      "This receipt did not pass its checks, so it is not shown. The rest of the report is unchanged.",
    );
  });
});
