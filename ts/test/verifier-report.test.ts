// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// capsulectl's own verify report carried into a page for an x-deal-v1 copy
// (#405 route 1): a pass draws the v1 receipt and says capsulectl reported
// it and the page did not check it; a fail refuses the copy; a missing
// report, or another bundle's, keeps the can't-check line. Never a pass the
// report did not give.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VERIFICATION_BANNER_LINES } from "@action-state-group/agent-action-capsule";
import {
  createPresentationRegistry,
  renderEvidenceGraph,
} from "../src/evidence-graph-view.js";
import { checkReceipt, receiptModules, renderReceipt } from "../src/receipt.js";

type Obj = Record<string, unknown>;
const data = (name: string): string =>
  readFileSync(
    resolve(process.cwd(), "..", "tests", "testdata", "deal-v1", name),
    "utf8",
  );
const bundle = (): Obj => JSON.parse(data("keep-copy.bundle.json")) as Obj;
const report = (): Obj => JSON.parse(data("keep-copy.verify.json")) as Obj;
const v1Entry = (r: Obj): Obj =>
  (r["extensions"] as Obj[]).find((e) => e["kind"] === "x-deal-v1")!;

const CAPSULECTL_LINE =
  "This report's text is carried in the file outside the log. capsulectl verify reported its signature check as: pass. This page did not check the signature itself.";

describe("capsulectl's report of an x-deal-v1 copy, in the receipt API (#405)", () => {
  it("draws the v1 receipt and says capsulectl reported the check, not the page", async () => {
    expect(
      await checkReceipt(bundle(), { verifierReport: report() }),
    ).toMatchObject({
      kind: "checked",
      module: "capsuleviewer.receipt.deal/v1",
    });
    const host = document.createElement("div");
    await renderReceipt(bundle(), host, {
      verifierReport: report(),
      depth: "L1",
    });
    expect(host.textContent).toContain(CAPSULECTL_LINE);
    expect(host.textContent).not.toContain("This page checked it itself");
  });

  it("without a report, or with another bundle's, keeps the can't-check line", async () => {
    const cannot = { kind: "cannot_check", reason: "report_rule" };
    expect(await checkReceipt(bundle())).toEqual(cannot);
    const other = report();
    other["bundle_digest"] = "0".repeat(64);
    expect(await checkReceipt(bundle(), { verifierReport: other })).toEqual(
      cannot,
    );
    const wrongFormat = report();
    wrongFormat["spec_version"] = "something-else/v1";
    expect(
      await checkReceipt(bundle(), { verifierReport: wrongFormat }),
    ).toEqual(cannot);
    const otherRecords = report();
    otherRecords["record_identity"] = { ["f".repeat(64)]: {} };
    expect(
      await checkReceipt(bundle(), { verifierReport: otherRecords }),
    ).toEqual(cannot);
    expect(
      await checkReceipt(bundle(), { verifierReport: "not a report" }),
    ).toEqual(cannot);
  });

  it("a report that fails reads as not verified, never drawn", async () => {
    const failed = report();
    v1Entry(failed)["status"] = "fail";
    expect(await checkReceipt(bundle(), { verifierReport: failed })).toEqual({
      kind: "did_not_verify",
      line: VERIFICATION_BANNER_LINES.refused,
    });
    const invalid = report();
    invalid["verdict"] = "INVALID";
    expect(
      (await checkReceipt(bundle(), { verifierReport: invalid })).kind,
    ).toBe("did_not_verify");
  });
});

describe("capsulectl's report of an x-deal-v1 copy, on a receipt page (#405)", () => {
  async function page(verifierReport?: unknown): Promise<HTMLElement> {
    const registry = createPresentationRegistry();
    for (const module of receiptModules()) registry.register(module);
    const root = document.createElement("main");
    document.body.append(root);
    await renderEvidenceGraph(bundle(), root, undefined, {
      depth: "L2",
      registry,
      ...(verifierReport === undefined ? {} : { verifierReport }),
    });
    return root;
  }

  it("draws the v1 receipt with capsulectl's line", async () => {
    const root = await page(report());
    expect(
      root.querySelector(
        '[data-receipt-module="capsuleviewer.receipt.deal/v1"]',
      ),
    ).not.toBeNull();
    expect(root.textContent).toContain(CAPSULECTL_LINE);
    expect(
      root.querySelector("[data-verify]")?.getAttribute("data-verify"),
    ).not.toBe("failed");
  });

  it("refuses the copy when capsulectl's report fails, and names that", async () => {
    const failed = report();
    v1Entry(failed)["status"] = "fail";
    const root = await page(failed);
    const banner = root.querySelector("[data-verify]");
    expect(banner?.getAttribute("data-verify")).toBe("failed");
    expect(banner?.textContent).toBe(VERIFICATION_BANNER_LINES.refused);
    expect(root.querySelector("[data-receipt-module]")).toBeNull();
    expect(
      root.querySelector('[data-check="deal-report-verifier"]')?.textContent,
    ).toBe(
      "Didn't verify: capsulectl deal verify reported that the deal report carried outside the log did not pass.",
    );
  });

  it("without a report draws only the can't-check line", async () => {
    const root = await page();
    expect(
      root.querySelector('[data-cannot-check-reason="report_rule"]'),
    ).not.toBeNull();
    expect(root.textContent).not.toContain(CAPSULECTL_LINE);
  });
});
