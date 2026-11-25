// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// A receipt page (the receipt modules in its registry, as go/emitter's
// module slot puts them) refuses a deal copy whose standalone report fails
// this page's own check: AAC's refused banner, no module, no fallback page,
// and the failed condition among the checks (Sherlock2, #412).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VERIFICATION_BANNER_LINES } from "@action-state-group/agent-action-capsule";
import {
  createPresentationRegistry,
  renderEvidenceGraph,
} from "../src/evidence-graph-view.js";
import { receiptModules } from "../src/receipt.js";

type Obj = Record<string, unknown>;
const keep = (): Obj =>
  JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "..",
        "tests",
        "testdata",
        "receipt",
        "main-standalone-keep.bundle.json",
      ),
      "utf8",
    ),
  ) as Obj;

async function page(bundle: Obj): Promise<HTMLElement> {
  const registry = createPresentationRegistry();
  for (const module of receiptModules()) registry.register(module);
  const root = document.createElement("main");
  document.body.append(root);
  await renderEvidenceGraph(bundle, root, undefined, { depth: "L2", registry });
  return root;
}

describe("a receipt page and a deal copy's standalone report (#412)", () => {
  it("draws the receipt when the report passes", async () => {
    const root = await page(keep());
    expect(
      root.querySelector("[data-verify]")?.getAttribute("data-verify"),
    ).not.toBe("failed");
    expect(
      root.querySelector(
        '[data-receipt-module="capsuleviewer.receipt.unilateral/v0"]',
      ),
    ).not.toBeNull();
  });

  it("refuses the copy when the report fails: refused banner, no page, the failed condition named", async () => {
    const b = keep();
    // A change only the report check sees: the bundle's own checks pass.
    const x = (b["extensions"] as Obj)["x-deal-report/v0"] as Obj;
    (x["agent_input"] as Obj)["audience"] = "adjudicator";
    const root = await page(b);
    const banner = root.querySelector("[data-verify]");
    expect(banner?.getAttribute("data-verify")).toBe("failed");
    expect(banner?.textContent).toBe(VERIFICATION_BANNER_LINES.refused);
    // AAC's own refused banner: an invalid verdict and no details line.
    expect(banner?.getAttribute("data-verdict")).toBe("invalid");
    expect(root.querySelector("[data-banner-detail]")?.textContent ?? "").toBe(
      "",
    );
    // No record's payload is shown, every section opened: AAC's refusal says
    // records, rows and payloads are not shown. "money.purchase" is in a
    // disclosed payload of this copy.
    // Record bodies are built when their section opens (deferBody).
    for (let round = 0; round < 3; round++)
      for (const d of root.querySelectorAll("details")) {
        (d as HTMLDetailsElement).open = true;
        d.dispatchEvent(new Event("toggle"));
      }
    expect(root.textContent).not.toContain("money.purchase");
    // No module and no fallback page: no L0 or L1 region, no receipt, no rows.
    expect(root.querySelector('[data-region="L0"]')).toBeNull();
    expect(root.querySelector("[data-receipt-module]")).toBeNull();
    expect(root.querySelector('[data-page="report-rows"]')).toBeNull();
    const failed = root.querySelector('[data-checks="failed"]');
    expect(
      failed?.querySelector('[data-check="deal-report-capsule"]')?.textContent,
    ).toBe(
      "Didn't verify: the deal report carried outside the log does not match its Capsule.",
    );
    // Only the condition that failed is named.
    expect(
      failed?.querySelectorAll('[data-check^="deal-report-"]'),
    ).toHaveLength(1);
    // The bundle's own checks that passed stay beside it.
    expect(root.querySelector('[data-checks="page"]')).not.toBeNull();
    // The folded section's line counts it, never "passed".
    expect(root.querySelector("[data-checked] summary")?.textContent).toContain(
      "failed",
    );
  });
});
