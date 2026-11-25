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
  renderReceipt,
} from "../src/receipt.js";

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

describe("the receipt export (#383)", () => {
  it("offers the four modules with the manifests go/receipt ships", () => {
    const modules = receiptModules();
    expect(modules.map((m) => m.manifest)).toEqual(
      RECEIPT_KINDS.map(goManifest),
    );
  });

  it("checks a Mesh node's keep copy (producer-selected) as the owner's unilateral receipt", async () => {
    const result = await checkReceipt(fixture("mesh-payer-selected"));
    expect(result).toEqual({
      kind: "checked",
      module: "capsuleviewer.receipt.unilateral/v0",
      both: false,
    });
    expect(receiptLabel(result)).toBe("your receipt only");
  });

  it("draws it standing alone with PRIVATE and its top line, and in a report as a shared copy", async () => {
    const alone = document.createElement("div");
    document.body.append(alone);
    expect(
      (await renderReceipt(fixture("mesh-payer-selected"), alone)).kind,
    ).toBe("checked");
    expect(alone.querySelector('[data-banner="private"]')).not.toBeNull();
    expect(alone.querySelector('[data-checked="true"]')?.textContent).toContain(
      "Checked by",
    );

    const carried = document.createElement("div");
    document.body.append(carried);
    await renderReceipt(fixture("mesh-payer-selected"), carried, {
      carrier: "report",
    });
    expect(carried.querySelector('[data-banner="private"]')).toBeNull();
    expect(
      carried.querySelector('[data-banner="shared"]')?.textContent,
    ).toContain("Shared copy");
  });

  it("refuses what did not verify and draws nothing", async () => {
    const bundle = JSON.parse(fixture("keep")) as {
      records: { capsule_id: string }[];
    };
    bundle.records[0]!.capsule_id = "0".repeat(64);
    const host = document.createElement("div");
    expect(await renderReceipt(JSON.stringify(bundle), host)).toEqual({
      kind: "did_not_verify",
    });
    expect(host.childNodes.length).toBe(0);
    expect(await checkReceipt("not json")).toEqual({ kind: "did_not_verify" });
    expect(receiptLabel({ kind: "did_not_verify" })).toBe(
      "the receipt did not verify: do not rely on it",
    );
    expect(receiptLabel({ kind: "no_record" })).toBe("no record");
    expect(receiptLabel({ kind: "cannot_check" })).toBe(
      "this browser can't check the receipt",
    );
    expect(receiptLabel({ kind: "no_module" })).toBeNull();
  });

  it("says no module for a verified bundle that is not a deal receipt", async () => {
    expect(await checkReceipt(fixture("mesh-provider-selected"))).toEqual({
      kind: "no_module",
    });
  });
});
