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

// The format the receipt's localTimes writes, in this run's own zone.
const local = (iso: string): string =>
  new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));

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

  it("a producer selection (INCOMPLETE only for selection_not_checkable) draws, as the Python twin reads it", async () => {
    const r = edited((r) => {
      r["verdict"] = "INCOMPLETE";
      r["interval_coverage"] = {
        status: "withheld",
        findings: ["selection_not_checkable"],
      };
    });
    expect((await checkReceipt(bundle(), { verifierReport: r })).kind).toBe(
      "checked",
    );
    // Any other INCOMPLETE is still the verdict line's.
    const other = edited((r) => {
      r["verdict"] = "INCOMPLETE";
      r["interval_coverage"] = { status: "withheld", findings: ["other"] };
    });
    expect((await checkReceipt(bundle(), { verifierReport: other })).kind).toBe(
      "did_not_verify",
    );
  });

  it("takes the report as capsulectl prints it (JSON text) too", async () => {
    expect(
      (
        await checkReceipt(bundle(), {
          verifierReport: data("keep-copy.verify.json"),
        })
      ).kind,
    ).toBe("checked");
    expect(
      await checkReceipt(bundle(), { verifierReport: "{ not json" }),
    ).toEqual(cannot);
  });

  it("renderReceipt says a verified half too, a producer selection's included", async () => {
    const HALF =
      "Signed by both sides: this copy carries the other party's signed agreement, recorded in their own book. capsulectl verify reported it as verified; this page did not check it itself. It covers their agreement only, not anything after it.";
    const verified = edited((r) => {
      v1Entry(r)["counterparty_half"] = { status: "verified" };
    });
    const selected = edited((r) => {
      v1Entry(r)["counterparty_half"] = { status: "verified" };
      r["verdict"] = "INCOMPLETE";
      r["interval_coverage"] = {
        status: "withheld",
        findings: ["selection_not_checkable"],
      };
    });
    for (const r of [verified, selected]) {
      const host = document.createElement("div");
      await renderReceipt(bundle(), host, { verifierReport: r, depth: "L2" });
      expect(
        host.querySelector('[data-rung="counterparty-half"]')?.textContent,
      ).toBe(HALF);
    }
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

  it("capsulectl's reading has its own heading: nothing under 'Failed on this page' when every page check passed (Sherlock2)", async () => {
    for (const edit of [
      (r: Obj) => {
        v1Entry(r)["status"] = "fail";
      },
      (r: Obj) => {
        r["verdict"] = "INVALID";
      },
    ]) {
      const r = report();
      edit(r);
      const root = await page(r);
      const headings = [...root.querySelectorAll("h4")].map(
        (h) => h.textContent,
      );
      expect(headings).not.toContain("Failed on this page");
      expect(headings).toContain("Reported by capsulectl verify");
      expect(root.querySelectorAll('[data-checks="failed"] li')).toHaveLength(
        0,
      );
      expect(
        root.querySelectorAll('[data-checks="capsulectl"] li'),
      ).toHaveLength(1);
      expect(root.querySelector("summary")?.textContent).not.toContain(
        "on this page failed",
      );
    }
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

  it("a verdict with a $ in it is said as written", async () => {
    const r = report();
    r["verdict"] = "$&$'";
    const root = await page(r);
    expect(
      root.querySelector('[data-check="deal-report-verdict"]')?.textContent,
    ).toBe(
      "Didn't verify: capsulectl deal verify reported this bundle as $&$'.",
    );
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

  it("a counterparty half capsulectl verified is said, and the countersign line does not read as unsigned", async () => {
    const r = report();
    v1Entry(r)["counterparty_half"] = {
      key: "67d55ab77af8e004",
      status: "verified",
    };
    const root = await page(r);
    expect(
      root.querySelector('[data-rung="counterparty-half"]')?.textContent,
    ).toBe(
      "Signed by both sides: this copy carries the other party's signed agreement, recorded in their own book. capsulectl verify reported it as verified; this page did not check it itself. It covers their agreement only, not anything after it.",
    );
    expect(root.querySelector('[data-rung="countersign"]')?.textContent).toBe(
      "No countersignature in this copy (a separate signature over the whole copy). The other party's own signed agreement is the line above.",
    );
  });

  it("a half capsulectl verified in an entry that did not pass is never said: the copy is refused (Sherlock2)", async () => {
    const r = report();
    v1Entry(r)["counterparty_half"] = { status: "verified" };
    v1Entry(r)["status"] = "fail";
    const root = await page(r);
    expect(root.querySelector('[data-rung="counterparty-half"]')).toBeNull();
    expect(root.querySelector("[data-receipt-module]")).toBeNull();
  });

  it("without a verified half, no half line and the countersign line as before", async () => {
    for (const half of [undefined, { status: "withheld" }, "verified"]) {
      const r = report();
      if (half !== undefined) v1Entry(r)["counterparty_half"] = half;
      const root = await page(r);
      expect(root.querySelector('[data-rung="counterparty-half"]')).toBeNull();
      expect(root.querySelector('[data-rung="countersign"]')?.textContent).toBe(
        "Not countersigned in this copy. A signature from the other party, if there is one, is in their own copy.",
      );
    }
    // The page never says a half capsulectl did not report: no report, no line.
    const none = await page();
    expect(none.querySelector('[data-rung="counterparty-half"]')).toBeNull();
  });

  it("the holder's own book's witness time, as capsulectl reported it (amended u203)", async () => {
    const rung = async (
      witnessed?: unknown,
    ): Promise<string | null | undefined> => {
      const r = report();
      if (witnessed !== undefined) v1Entry(r)["witnessed"] = witnessed;
      const root = await page(r);
      return root.querySelector('[data-rung="witness"]')?.textContent;
    };
    expect(
      await rung({
        status: "verified",
        witness: "Action State's witness",
        at: "2026-11-25T14:41:19Z",
      }),
    ).toBe(
      `Time-stamped by Action State's witness at ${local("2026-11-25T14:41:19Z")} (14:41:19 UTC), as capsulectl verify reported on your own book. This file carries no witness receipt, so this page did not check it itself.`,
    );
    expect(await rung({ status: "failed", reason: "x" })).toBe(
      "capsulectl verify reported that your own book's witness time-stamp did not verify, so no time-stamp is shown. This page did not check it itself.",
    );
    expect(await rung({ status: "withheld" })).toBe(
      "capsulectl verify found no time-stamp for your own book from the witnesses it was given. That does not mean there is none. This page did not check it itself.",
    );
    // Nothing reported, or not a result: the line as before, never "Time-stamped".
    for (const w of [
      undefined,
      "verified",
      { status: "verified" },
      { status: "verified", witness: "", at: "t" },
      { status: "other" },
    ])
      expect(await rung(w)).toBe(
        "No witness result was reported to this page.",
      );
  });

  it("an x-deal-v1 page never draws the log line, only the file-scoped one (Sherlock2)", async () => {
    for (const r of [report(), undefined]) {
      const root = await page(r);
      expect(root.textContent).not.toContain("has vouched for this log");
      expect(root.textContent).toContain(
        "This file carries no witness receipt, so this page could not check a time-stamp itself.",
      );
    }
  });

  it("a counterparty's copy never shows the holder's witness time", async () => {
    const shared = JSON.parse(data("counterparty-copy.bundle.json")) as Obj;
    const r = JSON.parse(data("counterparty-copy.verify.json")) as Obj;
    v1Entry(r)["witnessed"] = { status: "verified", witness: "W", at: "t" };
    const host = document.createElement("div");
    await renderReceipt(shared, host, { verifierReport: r, depth: "L2" });
    expect(
      host.querySelector("[data-receipt-module]") ?? host.firstChild,
    ).not.toBeNull();
    expect(host.textContent).not.toContain("Time-stamped by");
    expect(host.textContent).toContain(
      "No witness result was reported to this page.",
    );
  });

  it("the holder's witness time is never shown on a shared page or report", async () => {
    const r = report();
    v1Entry(r)["witnessed"] = {
      status: "verified",
      witness: "W",
      at: "2026-11-25T14:41:19Z",
    };
    for (const carrier of ["page", "report"] as const) {
      const host = document.createElement("div");
      await renderReceipt(bundle(), host, {
        verifierReport: r,
        carrier,
        depth: "L2",
      });
      expect(host.textContent).not.toContain("Time-stamped by");
    }
    const own = document.createElement("div");
    await renderReceipt(bundle(), own, { verifierReport: r, depth: "L2" });
    expect(own.textContent).toContain("Time-stamped by W at ");
  });

  it("one witness line on the holder's own page: the header line is left out there only (#424)", async () => {
    const HEADER =
      "This file carries no witness receipt, so this page could not check a time-stamp itself.";
    const r = report();
    v1Entry(r)["witnessed"] = {
      status: "verified",
      witness: "W",
      at: "2026-11-25T14:41:19Z",
    };
    const own = await page(r);
    expect(own.textContent).not.toContain(HEADER);
    expect(own.querySelector('[data-rung="witness"]')?.textContent).toContain(
      "This file carries no witness receipt, so this page did not check it itself.",
    );
    // Failed, withheld or nothing reported: the header stays.
    for (const w of [{ status: "failed" }, { status: "withheld" }, undefined]) {
      const rr = report();
      if (w !== undefined) v1Entry(rr)["witnessed"] = w;
      expect((await page(rr)).textContent).toContain(HEADER);
    }
  });

  it("the header stays wherever the one line is not drawn (#424)", async () => {
    const HEADER =
      "This file carries no witness receipt, so this page could not check a time-stamp itself.";
    for (const w of [
      { status: "verified", witness: "W" },
      { status: "verified", at: "2026-11-25T14:41:19Z" },
      { status: "verified", witness: "W", at: "t" },
      { status: "verified", witness: "W", at: "2026-02-30T10:00:00Z" },
    ]) {
      const r = report();
      v1Entry(r)["witnessed"] = w;
      const root = await page(r);
      expect(root.textContent).toContain(HEADER);
      expect(root.textContent).not.toContain("Time-stamped by");
    }
    // A page drawn as a shared carrier keeps the header.
    const r = report();
    v1Entry(r)["witnessed"] = {
      status: "verified",
      witness: "W",
      at: "2026-11-25T14:41:19Z",
    };
    const registry = createPresentationRegistry();
    for (const module of receiptModules()) registry.register(module);
    const shared = document.createElement("main");
    shared.setAttribute("data-receipt-carrier", "page");
    const root = document.createElement("div");
    shared.append(root);
    document.body.append(shared);
    await renderEvidenceGraph(bundle(), root, undefined, {
      depth: "L2",
      registry,
      verifierReport: r,
    });
    expect(root.textContent).toContain(HEADER);
    expect(root.textContent).not.toContain("Time-stamped by");
  });

  it("the header stays when no receipt module draws the line, or its render is discarded (#424)", async () => {
    const HEADER =
      "This file carries no witness receipt, so this page could not check a time-stamp itself.";
    const r = report();
    v1Entry(r)["witnessed"] = {
      status: "verified",
      witness: "W",
      at: "2026-11-25T14:41:19Z",
    };
    // The default registry: no receipt module, so no line, so the header stays.
    const plain = document.createElement("main");
    document.body.append(plain);
    await renderEvidenceGraph(bundle(), plain, undefined, {
      depth: "L2",
      verifierReport: r,
    });
    expect(plain.textContent).not.toContain("Time-stamped by");
    expect(plain.textContent).toContain(HEADER);
    // A receipt module whose render throws: its output is discarded and the header comes back.
    const registry = createPresentationRegistry();
    for (const module of receiptModules()) {
      if (module.manifest.id === "capsuleviewer.receipt.deal/v1")
        registry.register({
          ...module,
          render: async () => {
            throw new Error("boom");
          },
        });
      else registry.register(module);
    }
    const broken = document.createElement("main");
    document.body.append(broken);
    await renderEvidenceGraph(bundle(), broken, undefined, {
      depth: "L2",
      registry,
      verifierReport: r,
    });
    expect(broken.textContent).not.toContain("Time-stamped by");
    expect(broken.textContent).toContain(HEADER);
  });

  it("the page's times are the reader's own, deadlines with UTC beside them (#423)", async () => {
    const root = await page(report());
    const asOf = root.querySelector("[data-as-of]");
    expect(asOf?.querySelector("[data-time]")?.getAttribute("data-time")).toBe(
      "2026-09-27T18:00:00Z",
    );
    expect(asOf?.textContent).toContain(local("2026-09-27T18:00:00Z"));
    const text = root.textContent ?? "";
    expect(text).toContain(`${local("2026-11-01T23:59:59Z")} (23:59 UTC)`);
    expect(text).toContain(`${local("2026-11-04T23:59:59Z")} (23:59 UTC)`);
    expect(text).not.toContain("2026-11-01T23:59:59Z");
  });

  it("a witnessed result in an entry that did not pass is never said: the copy is refused", async () => {
    const r = report();
    v1Entry(r)["witnessed"] = { status: "verified", witness: "W", at: "t" };
    v1Entry(r)["status"] = "fail";
    const root = await page(r);
    expect(root.textContent).not.toContain("Time-stamped by");
    expect(root.querySelector("[data-receipt-module]")).toBeNull();
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
