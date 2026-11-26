// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// capsule-viewer#383, CV-TS: the npm package's receipt export draws a deal
// receipt from its bundle with the same modules the Go package ships, so a
// browser consumer (the Mesh plugin's saved receipt page and exchanges row)
// carries no receipt renderer or receipt words of its own.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildVerifiedBundleContext } from "@action-state-group/agent-action-capsule";
import {
  checkReceipt,
  RECEIPT_KINDS,
  receiptLabel,
  receiptModules,
  receiptPageLines,
  renderReceipt,
} from "../src/receipt.js";

type Obj = Record<string, unknown>;
// An x-deal-v1 keep copy (tests/testdata/deal-v1/README.md).
const v1Keep = (): string =>
  readFileSync(
    resolve(
      process.cwd(),
      "..",
      "tests",
      "testdata",
      "deal-v1",
      "keep-copy.bundle.json",
    ),
    "utf8",
  );
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

  it("saved as a page for anyone, draws the shared copy with the page's two lines (#395)", async () => {
    const page = host();
    const result = await renderReceipt(fixture("mesh-payer-selected"), page, {
      carrier: "page",
    });
    expect(page.getAttribute("data-receipt-carrier")).toBe("page");
    expect(page.querySelector('[data-banner="private"]')).toBeNull();
    const banner = page.querySelector('[data-banner="shared"]')?.textContent;
    expect(banner).toContain("Shared copy");
    expect(banner).toContain(
      "This node's own record of this exchange, saved as a page for anyone to check. It is not the other side's copy.",
    );
    const text = page.textContent ?? "";
    expect(text).not.toContain("report owner");
    expect(text).not.toContain("Receipts in the settlement report");
    expect(text).not.toContain("Do not forward");
    expect(text).not.toContain("Tell your agent");
    expect(page.querySelector('[data-checked="true"]')?.textContent).toContain(
      "Checked in this browser by",
    );

    // A Mesh exchange seals deal_type "service": the line reads it as a
    // word, never the raw token (#391 item 5, Sherlock2's words).
    const dealType = page.querySelector('[data-deal-type="true"]');
    expect(dealType?.textContent).toBe("Deal: Service");
    expect(dealType?.querySelector("[data-unworded]")).toBeNull();

    // Its lines above the receipt never call it the reader's own.
    expect(result.kind).toBe("checked");
    expect(receiptPageLines(result, { carrier: "page" })?.lines[0]).toBe(
      "Receipt: this node's receipt only",
    );
    const both = await checkReceipt(fixture("bilateral-keep"));
    expect(receiptPageLines(both, { carrier: "page" })?.lines[0]).toBe(
      "Receipt: stamped by both",
    );
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

  it("an x-deal-v1 keep copy: the page can't check its report, so it draws only that line and how to check it (#405)", async () => {
    const LINE =
      "This page can't check this receipt, so it shows nothing from it and no verdict. To check it, run capsulectl deal verify --bundle <file> on the receipt file. It needs the capsulectl-deal plugin.";
    const result = await checkReceipt(v1Keep());
    expect(result).toEqual({ kind: "cannot_check", reason: "report_rule" });
    expect(receiptLabel(result)).toBe("can't be checked here");
    expect(receiptPageLines(result)).toEqual({ tone: "bad", lines: [LINE] });
    for (const carrier of [undefined, "report", "page"] as const) {
      const drawn = host();
      expect(
        await renderReceipt(
          v1Keep(),
          drawn,
          carrier === undefined ? {} : { carrier },
        ),
      ).toEqual(result);
      // Not drawn: the page lines say it once (receiptPageLines).
      expect(drawn.childNodes.length, String(carrier)).toBe(0);
    }
  });

  it('the v1 module itself: a copy that did not verify is declined, never "can\'t check"', async () => {
    const deal = receiptModules().find(
      (m) => m.manifest.id === "capsuleviewer.receipt.deal/v1",
    )!;
    const b = JSON.parse(v1Keep()) as Obj;
    (b["records"] as Obj[])[0]!["timestamp"] = "2000-01-01T00:00:00Z";
    expect(await deal.canRender(await buildVerifiedBundleContext(b))).toBe(
      false,
    );
    const good = await buildVerifiedBundleContext(JSON.parse(v1Keep()));
    expect(await deal.canRender(good)).toBe(true);
    expect(await deal.buildModel(good)).toEqual({
      cannot_check: true,
      reason: "report_rule",
    });
  });

  it("an x-deal-v1 copy that does not verify says so, never that it can't be checked", async () => {
    const b = JSON.parse(v1Keep()) as Obj;
    const records = b["records"] as Obj[];
    records[0]!["timestamp"] = "2000-01-01T00:00:00Z";
    expect((await checkReceipt(b)).kind).toBe("did_not_verify");
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

// A downgraded x-deal-v0 copy (capsule-viewer#452): the report dropped and its
// text put inline in x-deal-v0, as evidencebook's check-deal-pages.sh
// deal-receipt-downgraded case makes it. Sherlock2's two lines, on #452.
const downgraded = (name = "main-standalone-keep"): Obj => {
  const b = JSON.parse(fixture(name)) as Obj;
  const extensions = b["extensions"] as Obj;
  const report = (
    (extensions["x-deal-report/v0"] as Obj)["agent_input"] as Obj
  )["report"] as Obj;
  extensions["x-deal-v0"] = { ...report, did_line: "A line nobody sealed." };
  delete extensions["x-deal-report/v0"];
  return b;
};

describe("a downgraded x-deal-v0 copy (#452)", () => {
  it("says its text is not shown and capsulectl's verdict on it, and draws nothing from it", async () => {
    const result = await checkReceipt(downgraded());
    expect(result).toEqual({ kind: "cannot_check", reason: "downgraded" });
    // Not "can't be checked here": deal verify reports it INVALID (Sherlock2, #453).
    expect(receiptLabel(result)).toBe("receipt text not checked");
    expect(receiptPageLines(result)).toEqual({
      tone: "bad",
      lines: [
        "⚠️ The receipt's text is not shown: this copy names no sealed report, so its text could not be checked.",
        "capsulectl deal verify --bundle <file> reports this copy as INVALID (sealed_report_not_named).",
      ],
    });
    const drawn = host();
    drawn.append(document.createElement("p"));
    expect(await renderReceipt(downgraded(), drawn)).toEqual(result);
    // Not drawn: the page lines say it once (receiptPageLines).
    expect(drawn.childNodes.length).toBe(0);
  });

  it("a downgraded copy whose records were changed did not verify, never that it can't be checked", async () => {
    const b = downgraded();
    (b["records"] as Obj[])[0]!["timestamp"] = "2000-01-01T00:00:00Z";
    expect((await checkReceipt(b)).kind).toBe("did_not_verify");
  });
});

// A command in the can't-check lines (#454): the module draws it as code and
// the page lines carry the same words without the backticks, so the two
// agree byte for byte and "<file>" stays literal (Sherlock2's choice).
describe("a command in the can't-check lines (#454)", () => {
  const COMMAND = "capsulectl deal verify --bundle <file>";
  for (const [kind, reason] of [
    ["unilateral", "downgraded"],
    ["deal", "report_rule"],
  ] as const) {
    it(`${reason}: the page lines hold the drawn command, with no backticks`, async () => {
      const module = receiptModules().find((m) =>
        m.manifest.id.startsWith(`capsuleviewer.receipt.${kind}/`),
      )!;
      const drawn = host();
      await (
        module.render as unknown as (
          model: unknown,
          host: Record<string, unknown>,
        ) => Promise<void>
      )(
        { cannot_check: true, reason },
        { L0: drawn, L1: drawn, L2: drawn, depth: "L2" },
      );
      const codes = [...drawn.querySelectorAll("code")].map(
        (c) => c.textContent,
      );
      expect(codes).toEqual([COMMAND]);
      const page = receiptPageLines({ kind: "cannot_check", reason });
      const lines = page!.lines;
      expect(lines.join("\n")).not.toContain("`");
      expect(lines.filter((l) => l.includes(codes[0]!))).toHaveLength(1);
      // The drawn line's text is the page line's, word for word.
      const drawnLine = [...drawn.querySelectorAll("p")]
        .map((p) => p.textContent)
        .find((t) => t!.includes(COMMAND));
      expect(lines.some((l) => l.endsWith(drawnLine!))).toBe(true);
    });
  }
});
