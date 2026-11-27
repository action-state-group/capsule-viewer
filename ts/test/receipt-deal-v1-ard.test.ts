// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// The npm package's x-deal-v1 receipt on Steven's ARD run deal (2026-11-25):
// the counterparty copy of deal-fe219bb1ab3d4dec with capsulectl's verify
// report, a paid deal whose two terms both read met. Terms in words and
// sides that never break inside a word (#429), the terms' standing on the
// deal line (#430), the records table's times in the reader's zone (#431),
// why no payment record is shown (#432), and the named-witness yes as the
// report's (#424). Then the holder's own keep copy (keep-copy.bundle.json),
// the case Steven ran on Maya's copy, on a page with capsulectl's report.
// Only the holder's own page shows a record's time and named-witness flag
// (Sherlock2, u239).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPresentationRegistry,
  renderEvidenceGraph,
} from "../src/evidence-graph-view.js";
import { receiptModules, renderReceipt } from "../src/receipt.js";
import {
  RECEIPT_CORE,
  RECEIPT_MANIFESTS,
} from "../src/receipt-core.generated.js";

type Obj = Record<string, unknown>;
const data = (name: string): string =>
  readFileSync(
    resolve(process.cwd(), "..", "tests", "testdata", "deal-v1", name),
    "utf8",
  );
const bundle = (): Obj =>
  JSON.parse(data("counterparty-copy.bundle.json")) as Obj;
const report = (): Obj =>
  JSON.parse(data("counterparty-copy.verify.json")) as Obj;

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

async function drawn(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const result = await renderReceipt(bundle(), host, {
    verifierReport: report(),
    depth: "L2",
  });
  expect(result.kind).toBe("checked");
  return host;
}

// The rows of the table whose column headers are *head*.
function rows(root: HTMLElement, head: string[]): HTMLElement[][] {
  const table = Array.from(root.querySelectorAll("table")).find(
    (t) =>
      Array.from(t.querySelectorAll("th"))
        .map((th) => th.textContent)
        .join("|") === head.join("|"),
  );
  expect(table).toBeDefined();
  return Array.from(table!.querySelectorAll("tbody tr")).map(
    (tr) => Array.from(tr.children) as HTMLElement[],
  );
}
const BASIS = ["Term", "Record", "Side", "Time", "Time from a named witness"];

describe("the x-deal-v1 receipt of the ARD run's deal, from the npm package", () => {
  it("#429: terms in words, sides as words, and the receipt's own stylesheet pinned", async () => {
    const host = await drawn();
    const basis = rows(host, ["Term", "Record", "Side"]);
    expect(basis.map((r) => [r[0]!.textContent, r[2]!.textContent])).toEqual([
      ["Payment as agreed", "buyer"],
      ["Payment as agreed", "seller"],
      ["Delivery", "buyer"],
      ["Delivery", "seller"],
    ]);
    for (const r of basis)
      for (const i of [0, 2])
        expect(r[i]!.querySelector(".cv-receipt-word")).not.toBeNull();
    expect(
      basis[0]![0]!.querySelector("[data-row-id]")?.getAttribute("title"),
    ).toBe("paid_as_agreed");
    const style = document.getElementById("cv-receipt-css");
    expect(style?.textContent).toContain(
      "[data-receipt-module] .cv-receipt-word { overflow-wrap: normal; }",
    );
    const manifest = (
      RECEIPT_MANIFESTS as unknown as Record<
        string,
        { executable: { style_sha256: string[] } }
      >
    )["deal"]!;
    expect(manifest.executable.style_sha256).toHaveLength(3);
  });

  it("u239: the counterparty's copy lists the records with no record time and no named-witness column", async () => {
    const host = await drawn();
    expect(rows(host, ["Term", "Record", "Side"])).toHaveLength(4);
    expect(host.querySelector('[data-time="2026-11-25T14:31:31Z"]')).toBeNull();
    expect(host.textContent).not.toContain("Time from a named witness");
    expect(host.textContent).not.toContain(local("2026-11-25T14:31:31Z"));
    expect(host.textContent).not.toContain("2026-11-25T14:31:31Z");
  });

  it("#432: the paid deal says its records are the sides' statements, not a payment record", async () => {
    const host = await drawn();
    expect(host.querySelector("[data-legs-why]")?.textContent).toBe(
      "These terms rest only on what the sides say, not on a payment record, so this page does not show or check a payment.",
    );
  });

  it("#430: before the contest window ends, the deal line says where the terms stand, beside it", async () => {
    // The run's report as drawn at 14:41, the window still open: both met so
    // far, not settled. The module is given capsulectl's check, as a page is.
    // The deal line sits under "For checkers" (L1) since the redesign (#382).
    const { L1 } = await edited((content) => {
      content["settled"] = false;
      content["rows"] = (content["rows"] as Obj[]).map((r) => ({
        ...r,
        status: "agreed_so_far",
      }));
    });
    expect(L1.querySelector("[data-deal-state]")?.textContent).toBe(
      "Agreement: started",
    );
    expect(L1.querySelector("[data-deal-terms]")?.textContent).toBe(
      "Terms: Both say the same so far (2 of 2)",
    );
  });

  it("#431 and #424: the same copy as its holder's own says each time in the reader's zone, and 'your report'", async () => {
    const { L2 } = await edited((content) => {
      content["audience"] = "keep";
    });
    for (const r of rows(L2, BASIS)) {
      expect(
        r[3]!.querySelector("[data-time]")?.getAttribute("data-time"),
      ).toBe("2026-11-25T14:31:31Z");
      expect(r[3]!.textContent).toBe(local("2026-11-25T14:31:31Z"));
      expect(r[4]!.textContent).toBe("yes, as your report states it");
    }
    expect(L2.textContent).not.toContain("2026-11-25T14:31:31Z");
  });
});

// The run's copy with its report edited by *edit*, drawn by the module with
// capsulectl's check given (the edit changes the bundle, so a verify report
// for the original bytes would not be this bundle's).
async function edited(
  edit: (content: Obj) => void,
): Promise<{ L0: HTMLElement; L1: HTMLElement; L2: HTMLElement }> {
  const b = bundle();
  const ext = b["extensions"] as Obj;
  const pair = ext["x-deal-report/v0"] as Obj;
  const content = structuredClone(pair["agent_input"]) as Obj;
  edit(content);
  pair["agent_input"] = content;
  const core = RECEIPT_CORE as {
    createModule(
      kind: string,
      env: object,
    ): {
      buildModel(context: unknown): unknown;
      render(model: unknown, host: object): void;
    };
  };
  const module = core.createModule("deal", {
    localTime: true,
    verification: () => ({ verifier: "test", outcome: "verified", checks: [] }),
    assurance: () => ({
      bundle_digest: "ab".repeat(32),
      witnesses: "withheld",
      countersignatures: [],
      report_checked: "pass",
    }),
  });
  const model = await module.buildModel({
    bundle: { records: [], extensions: ext },
    records: [],
    resolvedDisclosures: new Map(),
    root: null,
    completeness: { memberships: {} },
  });
  const L0 = document.createElement("div");
  const L1 = document.createElement("div");
  const L2 = document.createElement("div");
  module.render(model, { L0, L1, L2, depth: "L2" });
  return { L0, L1, L2 };
}

// The holder's own keep copy, the case Steven ran on Maya's copy: its one
// term is not due yet and rests on no record, and capsulectl's report is
// given to the page as a page gives it (#405 route 1).
describe("the holder's x-deal-v1 keep copy on a page, with capsulectl's report", () => {
  const keepBundle = (): Obj =>
    JSON.parse(data("keep-copy.bundle.json")) as Obj;
  const keepReport = (witnessed?: Obj): Obj => {
    const r = JSON.parse(data("keep-copy.verify.json")) as Obj;
    const entry = (r["extensions"] as Obj[]).find(
      (e) => e["kind"] === "x-deal-v1",
    )!;
    if (witnessed !== undefined) entry["witnessed"] = witnessed;
    return r;
  };
  const HEADER =
    "This file carries no witness receipt, so this page could not check a time-stamp itself.";
  async function keepPage(verifierReport: Obj): Promise<HTMLElement> {
    const registry = createPresentationRegistry();
    for (const module of receiptModules()) registry.register(module);
    const root = document.createElement("main");
    document.body.append(root);
    await renderEvidenceGraph(keepBundle(), root, undefined, {
      depth: "L2",
      registry,
      verifierReport,
    });
    return root;
  }

  it("says capsulectl's verified time-stamp once, in its voice, in place of the header line (u219): the core's line (#489)", async () => {
    const root = await keepPage(
      keepReport({
        status: "verified",
        witness: "W",
        at: "2026-11-25T14:41:19Z",
      }),
    );
    expect(root.textContent).not.toContain(HEADER);
    // The core draws it under the banner; the receipt module draws none.
    expect(root.querySelector('[data-rung="witness"]')).toBeNull();
    const line = root.querySelector(
      '[data-witness-notice="book-witnessed"]',
    )?.textContent;
    expect(line).toContain("Time-stamped by W at ");
    expect(line).toContain(
      "as capsulectl verify reported on your own book. This file carries no witness receipt, so this page did not check it itself.",
    );
    // With no verified time-stamp reported, the header line stays.
    expect((await keepPage(keepReport())).textContent).toContain(HEADER);
  });

  it("#430 and #432: the tally of its one term, and why no payment record is shown", async () => {
    const root = await keepPage(keepReport());
    expect(root.querySelector("[data-deal-state]")?.textContent).toBe(
      "Agreement: started",
    );
    expect(root.querySelector("[data-deal-terms]")?.textContent).toBe(
      "Terms: Not due (1 of 1)",
    );
    expect(root.querySelector("[data-legs-why]")?.textContent).toBe(
      "No term's status rests on any record yet, so there is no payment record to show.",
    );
    // Its term rests on no record, so there is no named-witness row to word.
    expect(root.textContent).toContain("No record is listed for any term.");
    expect(root.textContent).not.toContain("as your report states it");
  });
});
