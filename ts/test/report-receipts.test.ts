// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

// capsule-viewer#228: on a contract report whose claims are deals, each deal
// line opens the receipt module over the receipt bundle the page carries for
// that deal (the page's `receipts` option, deal id -> the bundle's JSON text).
// A stand-in receipt module takes the place of evidencebook's deal view here
// so every case runs fast in jsdom; report-receipts-browser.test.ts runs the
// real deal view in Chrome.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPresentationRegistry,
  renderEvidenceGraph,
} from "../src/evidence-graph-view.js";
import type {
  PresentationManifest,
  PresentationModule,
} from "../src/presentation-registry.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;
const data = (...parts: string[]): string =>
  readFileSync(resolve(process.cwd(), "test", "testdata", ...parts), "utf8");

const DEAL_VIEW = JSON.parse(
  data("deal-presentation-ambiguity", "capsulectl.deal-view.manifest.json"),
) as PresentationManifest;

/** A receipt module that draws the deal id the bundle names, as deal-view draws a receipt. */
const standIn: PresentationModule<string> = {
  manifest: DEAL_VIEW,
  canRender: () => true,
  buildModel: (context) => {
    const bundle = context.bundle as Obj;
    const input = ((bundle.disclosures as Obj)[bundle.root as string] as Obj)
      .agent_input as Obj;
    return (input["x-deal-v0"] as Obj).deal_id as string;
  },
  render: (model, host) => {
    const line = document.createElement("p");
    line.dataset.standInReceipt = model;
    line.textContent = `receipt of ${model}`;
    host.L1.append(line);
  },
};

/** A deal receipt bundle (an x-deal-v0 bundle naming `dealId`), sealed so it verifies, as JSON text. */
async function receiptText(dealId: string): Promise<string> {
  const bundle = JSON.parse(
    data("deal-presentation-ambiguity", "unilateral-deal-bundle.json"),
  ) as Obj;
  const input = (((bundle.disclosures as Obj).root as Obj).agent_input as Obj)[
    "x-deal-v0"
  ] as Obj;
  input.deal_id = dealId;
  const { bundle: sealed } = await sealEvidenceBundle(bundle);
  return JSON.stringify(sealed);
}

/** The Result with claims `d1::req-1`, `d2::req-2` and `plain` (no deal). */
function dealsResult(): Obj {
  const bundle = JSON.parse(data("result-root-bundle.json")) as Obj;
  bundle.extensions = {
    ...((bundle.extensions as Obj | undefined) ?? {}),
    "contract-report/v1": {},
  };
  const doc = ((bundle.disclosures as Obj).result as Obj).agent_input as Obj;
  const names: Record<string, string> = {
    "claim-1": "d1::req-1",
    "claim-2": "d2::req-2",
    "claim-3": "plain",
  };
  for (const claim of doc.claims as Obj[])
    claim.id = names[claim.id as string]!;
  const buckets = (doc.aggregate as Obj).buckets as Record<string, string[]>;
  for (const key of Object.keys(buckets))
    buckets[key] = buckets[key]!.map((id) => names[id]!);
  return bundle;
}

async function draw(
  receipts: Record<string, string | null> | undefined,
  withModule = true,
): Promise<HTMLElement> {
  const { bundle } = await sealEvidenceBundle(dealsResult());
  const root = document.createElement("main");
  document.body.append(root);
  const registry = createPresentationRegistry();
  if (withModule) registry.register(standIn);
  await renderEvidenceGraph(bundle, root, undefined, {
    depth: "L2",
    registry,
    ...(receipts === undefined ? {} : { receipts }),
  });
  return root;
}

const claim = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector<HTMLElement>(`[data-claim-ref="${id}"]`)!;
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 50));

describe("a deal line's receipt", () => {
  it("draws nothing on a page that carries no receipts, though claim ids contain ::", async () => {
    const root = await draw(undefined);
    expect(root.querySelector('[data-claim-ref="d1::req-1"]')).not.toBeNull();
    expect(root.querySelector(".rcpt")).toBeNull();
    expect(root.textContent).not.toContain("not carried");
  });

  it("gives a carried deal an open control, an uncarried deal a fixed line and no control, and a claim with no deal nothing", async () => {
    const root = await draw({ d1: await receiptText("d1") });
    const carried = claim(root, "d1::req-1");
    expect(
      carried.querySelector<HTMLButtonElement>('button[data-receipt="open"]')!
        .textContent,
    ).toBe("Open receipt");
    expect(carried.querySelector(".rcpt-panel")!.hasAttribute("hidden")).toBe(
      true,
    );
    const missing = claim(root, "d2::req-2");
    expect(
      missing.querySelector('[data-receipt="not-carried"]')!.textContent,
    ).toBe("Receipt not carried with this page.");
    expect(missing.querySelector("button")).toBeNull();
    // never "no record": that is the node's refusal, not this page's state
    expect(
      [...root.querySelectorAll(".rcpt")]
        .map((line) => line.textContent)
        .join(" "),
    ).not.toMatch(/no record/iu);
    expect(claim(root, "plain").querySelector(".rcpt")).toBeNull();
  });

  it("says a receipt the node's share policy keeps off the page is kept off on purpose, apart from one not carried", async () => {
    const root = await draw({ d1: null });
    const kept = claim(root, "d1::req-1");
    expect(kept.querySelector('[data-receipt="withheld"]')!.textContent).toBe(
      "This node's share policy keeps this receipt off the page.",
    );
    expect(kept.querySelector("button")).toBeNull();
    // a deal missing from the setting is a page built wrong, and says so
    expect(
      claim(root, "d2::req-2").querySelector('[data-receipt="not-carried"]')!
        .textContent,
    ).toBe("Receipt not carried with this page.");
  });

  it("opens the receipt module under its own claim, only that deal's receipt, and closes and reopens without drawing twice", async () => {
    const root = await draw({
      d1: await receiptText("deal-one"),
      d2: await receiptText("deal-two"),
    });
    const first = claim(root, "d1::req-1");
    const button = first.querySelector<HTMLButtonElement>(
      'button[data-receipt="open"]',
    )!;
    button.click();
    await settle();
    expect(first.querySelector(".rcpt-panel")!.hasAttribute("hidden")).toBe(
      false,
    );
    expect(button.textContent).toBe("Close receipt");
    expect(
      first
        .querySelector("[data-stand-in-receipt]")!
        .getAttribute("data-stand-in-receipt"),
    ).toBe("deal-one");
    // the other deal is untouched until it is opened
    expect(
      claim(root, "d2::req-2").querySelector("[data-stand-in-receipt]"),
    ).toBeNull();
    button.click();
    expect(first.querySelector(".rcpt-panel")!.hasAttribute("hidden")).toBe(
      true,
    );
    button.click();
    await settle();
    expect(first.querySelectorAll("[data-stand-in-receipt]")).toHaveLength(1);
    claim(root, "d2::req-2")
      .querySelector<HTMLButtonElement>('button[data-receipt="open"]')!
      .click();
    await settle();
    expect(
      claim(root, "d2::req-2")
        .querySelector("[data-stand-in-receipt]")!
        .getAttribute("data-stand-in-receipt"),
    ).toBe("deal-two");
    expect(root.querySelectorAll("[data-stand-in-receipt]")).toHaveLength(2);
  });

  it("says the page has no viewer for a receipt when no receipt module takes it, and draws no fallback page", async () => {
    const root = await draw({ d1: await receiptText("d1") }, false);
    const first = claim(root, "d1::req-1");
    first
      .querySelector<HTMLButtonElement>('button[data-receipt="open"]')!
      .click();
    await settle();
    const panel = first.querySelector(".rcpt-panel")!;
    expect(panel.getAttribute("data-receipt-state")).toBe("no-module");
    expect(panel.textContent).toBe(
      "This page has no viewer for this kind of receipt, so it is not shown.",
    );
    expect(panel.querySelector("[data-core-strip], .cv-shell-bar")).toBeNull();
  });

  it("says a receipt could not be read when it is not JSON, and that it did not pass its checks when it does not verify, and the report stays", async () => {
    const root = await draw({
      d1: "this is not json",
      d2: JSON.stringify({ bundle_kind: "evidence-bundle/v2", records: [] }),
    });
    for (const [id, state, words] of [
      [
        "d1::req-1",
        "unreadable",
        "This receipt could not be read, so it is not shown. The rest of the report is unchanged.",
      ],
      [
        "d2::req-2",
        "unverified",
        "This receipt did not pass its checks, so it is not shown. The rest of the report is unchanged.",
      ],
    ] as const) {
      const line = claim(root, id);
      line
        .querySelector<HTMLButtonElement>('button[data-receipt="open"]')!
        .click();
      await settle();
      expect(line.querySelector(".rcpt-panel")!.textContent).toBe(words);
      expect(
        line.querySelector(".rcpt-panel")!.getAttribute("data-receipt-state"),
      ).toBe(state);
    }
    expect(root.querySelectorAll("[data-claim-ref]")).toHaveLength(3);
    expect(root.querySelector('[data-page="contract-report"]')).not.toBeNull();
  });
});
