// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// The npm package's x-deal-v1 receipt on Steven's ARD run deal (2026-11-25):
// the counterparty copy of deal-fe219bb1ab3d4dec with capsulectl's verify
// report, a paid deal whose two terms both read met. Terms in words and
// sides that never break inside a word (#429), the terms' standing on the
// deal line (#430), the records table's times in the reader's zone (#431),
// why no payment record is shown (#432), and the named-witness yes in
// capsulectl's voice (#424).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderReceipt } from "../src/receipt.js";
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
    const basis = rows(host, BASIS);
    expect(basis.map((r) => [r[0]!.textContent, r[2]!.textContent])).toEqual([
      ["Paid as agreed", "buyer"],
      ["Paid as agreed", "seller"],
      ["Delivered", "buyer"],
      ["Delivered", "seller"],
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

  it("#431 and #424: each time in the reader's zone, and the yes in capsulectl's voice", async () => {
    const host = await drawn();
    for (const r of rows(host, BASIS)) {
      expect(
        r[3]!.querySelector("[data-time]")?.getAttribute("data-time"),
      ).toBe("2026-11-25T14:31:31Z");
      expect(r[3]!.textContent).toBe(local("2026-11-25T14:31:31Z"));
      expect(r[4]!.textContent).toBe("yes, as capsulectl reported it");
    }
    expect(host.textContent).not.toContain("2026-11-25T14:31:31Z");
  });

  it("#432: the paid deal says its terms rest on the sides' statements, not a payment record", async () => {
    const host = await drawn();
    expect(host.querySelector("[data-legs-why]")?.textContent).toBe(
      "Each term's status here rests on the sides' own statements, not on a payment record, so this page shows no payment and does not check one.",
    );
  });

  it("#430: before the contest window ends, the deal line says where the terms stand", async () => {
    // The run's report as drawn at 14:41, the window still open: both met so
    // far, not settled. The module is given capsulectl's check, as a page is.
    const b = bundle();
    const ext = b["extensions"] as Obj;
    const pair = ext["x-deal-report/v0"] as Obj;
    const content = structuredClone(pair["agent_input"]) as Obj;
    content["settled"] = false;
    content["rows"] = (content["rows"] as Obj[]).map((r) => ({
      ...r,
      status: "agreed_so_far",
    }));
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
      verification: () => ({
        verifier: "test",
        outcome: "verified",
        checks: [],
      }),
      assurance: () => ({
        bundle_digest: "ab".repeat(32),
        witnesses: "withheld",
        countersignatures: [],
        report_checked: "pass",
      }),
    });
    const context = {
      bundle: { records: [], extensions: ext },
      records: [],
      resolvedDisclosures: new Map(),
      root: null,
      completeness: { memberships: {} },
    };
    const model = await module.buildModel(context);
    const L0 = document.createElement("div");
    module.render(model, {
      L0,
      L1: document.createElement("div"),
      L2: document.createElement("div"),
      depth: "L0",
    });
    expect(L0.querySelector("[data-deal-state]")?.textContent).toBe(
      "Started · Terms: Both say the same so far (2 of 2)",
    );
  });
});
