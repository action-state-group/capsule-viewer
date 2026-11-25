// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// capsule-viewer#383, CV-TS: the npm package's receipt export draws a deal
// receipt from its bundle with the same modules the Go package ships, so a
// browser consumer (the Mesh plugin's saved receipt page and exchanges row)
// carries no receipt renderer or receipt words of its own.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkReceipt,
  RECEIPT_KINDS,
  receiptLabel,
  receiptModules,
  receiptPageLines,
  renderReceipt,
} from "../src/receipt.js";

type Obj = Record<string, unknown>;
const fixture = (name: string): string =>
  readFileSync(
    resolve(
      process.cwd(),
      "..",
      "tests",
      "testdata",
      "receipt",
      `${name}.bundle.json`,
    ),
    "utf8",
  );
const goManifest = (kind: string): { id: string } =>
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "..", "go", "receipt", `manifest-${kind}.json`),
      "utf8",
    ),
  ) as { id: string };
const host = (): HTMLElement => {
  const node = document.createElement("div");
  document.body.append(node);
  return node;
};

describe("the receipt export (#383)", () => {
  it("offers the four modules with the manifests go/receipt ships", () => {
    expect(receiptModules().map((m) => m.manifest)).toEqual(
      RECEIPT_KINDS.map(goManifest),
    );
  });

  it("checks a Mesh node's keep copy (producer-selected) as the owner's own receipt, with the page's lines", async () => {
    const result = await checkReceipt(fixture("mesh-payer-selected"));
    expect(result).toMatchObject({
      kind: "checked",
      module: "capsuleviewer.receipt.unilateral/v0",
      both: false,
    });
    if (result.kind !== "checked") throw new Error("not checked");
    expect(result.records.total).toBeGreaterThan(0);
    expect(result.records.tied).toBeLessThanOrEqual(result.records.total);
    expect(result.runtimeLine).not.toBe("");
    expect(receiptLabel(result)).toBe("your receipt only");
    expect(receiptPageLines(result)).toEqual({
      tone: "warn",
      lines: [
        "Receipt: your receipt only",
        `${result.records.tied} of ${result.records.total} records in the receipt are tied to a signed checkpoint.`,
        result.runtimeLine,
      ],
    });
  });

  it("a receipt both sides stamped is `both`, tone ok", async () => {
    const result = await checkReceipt(fixture("bilateral-keep"));
    expect(result).toMatchObject({
      kind: "checked",
      module: "capsuleviewer.receipt.bilateral/v0",
      both: true,
    });
    expect(receiptLabel(result)).toBe("stamped by both");
    expect(receiptPageLines(result)?.tone).toBe("ok");
  });

  it("draws it standing alone with PRIVATE and its top line, and in a report as a shared copy", async () => {
    const alone = host();
    expect(
      (await renderReceipt(fixture("mesh-payer-selected"), alone)).kind,
    ).toBe("checked");
    expect(alone.querySelector('[data-banner="private"]')).not.toBeNull();
    expect(alone.querySelector('[data-checked="true"]')?.textContent).toContain(
      "Checked in this browser by",
    );

    const carried = host();
    await renderReceipt(fixture("mesh-payer-selected"), carried, {
      carrier: "report",
    });
    expect(carried.querySelector('[data-banner="private"]')).toBeNull();
    expect(
      carried.querySelector('[data-banner="shared"]')?.textContent,
    ).toContain("Shared copy");

    // The same host drawn again without the mark is the owner's copy again.
    await renderReceipt(fixture("mesh-payer-selected"), carried);
    expect(carried.hasAttribute("data-receipt-carrier")).toBe(false);
    expect(carried.querySelector('[data-banner="private"]')).not.toBeNull();
  });

  it("opens at the depth asked for", async () => {
    const shallow = host();
    await renderReceipt(fixture("keep"), shallow);
    const deep = host();
    await renderReceipt(fixture("keep"), deep, { depth: "L2" });
    const open = (node: HTMLElement): number =>
      node.querySelectorAll('[data-region="L2"] details[open]').length;
    expect(open(shallow)).toBe(0);
    expect(open(deep)).toBeGreaterThan(0);
  });

  it("refuses what did not verify, says why, and empties a host that held a receipt", async () => {
    const bundle = JSON.parse(fixture("keep")) as {
      records: { capsule_id: string }[];
    };
    bundle.records[0]!.capsule_id = "0".repeat(64);
    const page = host();
    await renderReceipt(fixture("keep"), page);
    expect(page.childNodes.length).toBe(3);
    const result = await renderReceipt(JSON.stringify(bundle), page);
    expect(result.kind).toBe("did_not_verify");
    expect(page.childNodes.length).toBe(0);
    if (result.kind !== "did_not_verify") throw new Error("verified");
    expect(result.line).not.toBe("");
    expect(receiptPageLines(result)).toEqual({
      tone: "bad",
      lines: ["the receipt did not verify: do not rely on it.", result.line],
    });
    expect((await checkReceipt("not json")).kind).toBe("did_not_verify");
  });

  it("a two-sided receipt whose carried copy was changed did not verify, though its envelope did", async () => {
    const bundle = JSON.parse(fixture("bilateral-keep")) as Obj;
    const members = (
      (bundle.extensions as Obj)["composed/v1"] as {
        members: { bundle: { records: Obj[] } }[];
      }
    ).members;
    members[1]!.bundle.records[0]!.timestamp = "2001-01-01T00:00:00Z";
    expect((await checkReceipt(bundle)).kind).toBe("did_not_verify");
  });

  it("labels the other results in the receipt words, and none for no module", async () => {
    expect(receiptLabel({ kind: "no_record" })).toBe("no record");
    expect(receiptLabel({ kind: "cannot_check" })).toBe(
      "this browser can't check the receipt",
    );
    expect(receiptPageLines({ kind: "cannot_check" })).toEqual({
      tone: "bad",
      lines: [
        "this browser can't check the receipt. Open the bundle in the offline viewer (capsule-viewer) to check it; this page shows no verdict for it.",
      ],
    });
    expect(receiptLabel({ kind: "no_module" })).toBeNull();
    expect(receiptPageLines({ kind: "no_module" })).toBeNull();
    expect(await checkReceipt(fixture("mesh-provider-selected"))).toEqual({
      kind: "no_module",
    });
  });
});
