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

describe("capsulectl's report: which reports are read, and how they fail (#417)", () => {
  const cannot = { kind: "cannot_check", reason: "report_rule" };
  const edited = (edit: (r: Obj) => void): Obj => {
    const r = report();
    edit(r);
    return r;
  };

  it("a report with no standalone x-deal-v1 entry is not read", async () => {
    for (const r of [
      edited((r) => delete r["extensions"]),
      edited((r) => {
        r["extensions"] = "not a list";
      }),
      edited((r) => {
        r["extensions"] = (r["extensions"] as Obj[]).filter(
          (e) => e["kind"] !== "x-deal-v1",
        );
      }),
      edited((r) => {
        v1Entry(r)["report"] = "in_log";
      }),
    ])
      expect(await checkReceipt(bundle(), { verifierReport: r })).toEqual(
        cannot,
      );
  });

  it("an entry that did not pass, whatever it says, refuses the copy", async () => {
    for (const status of ["fail", "not_checked", "withheld", "anything"]) {
      const r = edited((r) => {
        v1Entry(r)["status"] = status;
      });
      expect((await checkReceipt(bundle(), { verifierReport: r })).kind).toBe(
        "did_not_verify",
      );
    }
  });

  it("a report is never read for a bundle that is not an x-deal-v1 copy", async () => {
    // A v0 copy, with a report forged to its digest that says the v1 report
    // failed: the copy reads as it does with no report at all.
    const v0 = JSON.parse(
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
    const plain = await checkReceipt(v0);
    const forged = edited((r) => {
      v1Entry(r)["status"] = "fail";
    });
    const { buildVerifiedBundleContext } = await import(
      "@action-state-group/agent-action-capsule"
    );
    forged["bundle_digest"] = (
      await buildVerifiedBundleContext(v0)
    ).verification.bundleDigest;
    forged["record_identity"] = Object.fromEntries(
      (v0["records"] as Obj[]).map((x) => [x["capsule_id"], {}]),
    );
    expect(await checkReceipt(v0, { verifierReport: forged })).toEqual(plain);
  });

  it("a renderReceipt host that held a receipt is emptied when the next report fails", async () => {
    const host = document.createElement("div");
    await renderReceipt(bundle(), host, { verifierReport: report() });
    expect(host.childNodes.length).toBeGreaterThan(0);
    await renderReceipt(bundle(), host, {
      verifierReport: edited((r) => {
        v1Entry(r)["status"] = "fail";
      }),
    });
    expect(host.childNodes.length).toBe(0);
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

  it("an entry that passed in a bundle capsulectl calls INVALID or INCOMPLETE says that verdict, never that the report failed (Sherlock2)", async () => {
    for (const verdict of ["INVALID", "INCOMPLETE"]) {
      const r = report();
      r["verdict"] = verdict;
      const root = await page(r);
      expect(root.querySelector("[data-receipt-module]")).toBeNull();
      expect(
        root.querySelector('[data-check="deal-report-verdict"]')?.textContent,
      ).toBe(
        `Didn't verify: capsulectl deal verify reported this bundle as ${verdict}.`,
      );
      expect(
        root.querySelector('[data-check="deal-report-verifier"]'),
      ).toBeNull();
    }
  });

  it("another bundle's report is ignored: the can't-check line, no receipt", async () => {
    const other = report();
    other["bundle_digest"] = "0".repeat(64);
    const root = await page(other);
    expect(
      root.querySelector('[data-cannot-check-reason="report_rule"]'),
    ).not.toBeNull();
    expect(root.textContent).not.toContain(CAPSULECTL_LINE);
  });

  it("the page's own extension rows are its verifier's: one x-deal-v1 row", async () => {
    const root = await page(report());
    expect(
      root.querySelectorAll('[data-extension-id="x-deal-v1"]'),
    ).toHaveLength(1);
  });

  it("without a report draws only the can't-check line", async () => {
    const root = await page();
    expect(
      root.querySelector('[data-cannot-check-reason="report_rule"]'),
    ).not.toBeNull();
    expect(root.textContent).not.toContain(CAPSULECTL_LINE);
  });
});
