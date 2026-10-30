// SPDX-License-Identifier: BSD-3-Clause
// The front's "Witnessed by" line and the banner on one page follow AAC's
// strict witness status alone (capsule-viewer#46, from evidencebook#115).
// A page's verified context has no witness directory, so on a page a
// well-formed receipt is NOT_CHECKED and only an entry AAC fails is
// INVALID; VERIFIED, which needs a directory, is covered on the line itself
// in report-provenance.test.ts, over AAC's own strict vectors.
//
// The banner carries a witness notice when no receipt was checked
// (capsule-viewer#162, from evidencebook#209), from the same status as the
// line; the notice for a passed receipt and for no strict result at all is
// covered on `witnessNotice` itself, below.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import {
  WITNESS_NOTICE_LINES,
  witnessNotice,
  witnessStatus,
} from "../src/report-provenance.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

// A DOM constructed directly with jsdom rather than a whole-file environment
// override: under the jsdom environment the signed checkpoint's bytes come
// from another realm and the page cannot check them (as in
// viewer-core-text-vectors.test.ts).
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new () => { window: Window & typeof globalThis };
};
const dom = new JSDOM();
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

type Obj = Record<string, unknown>;

const fixture = (name: string): Obj =>
  JSON.parse(
    readFileSync(resolve(process.cwd(), "test", "testdata", name), "utf8"),
  ) as Obj;

/** A well-formed receipt (AAC reads it as a record) that no directory names. */
const RECEIPT = {
  ts_url: "https://witness.example/log",
  entry_hash: "00",
  receipt_b64: "AAAA",
  leaf_index: 0,
  tree_size: 1234,
};

const CARDS = [
  { card: "outcome", file: "outcome-report-bundle.json" },
  { card: "EU", file: "compliance-bundle.json" },
] as const;

async function page(
  file: string,
  witnesses: unknown[],
): Promise<{
  banner: HTMLElement;
  witness: HTMLElement;
  brief: string;
  notices: HTMLElement[];
}> {
  const { bundle } = await sealEvidenceBundle(fixture(file), {
    signCheckpoint: true,
  });
  (bundle.checkpoint as Obj).witnesses = witnesses;
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root);
  const block = root.querySelector<HTMLElement>('[data-section="provenance"]')!;
  return {
    banner: root.querySelector<HTMLElement>(".cv-pill")!,
    witness: block.querySelector<HTMLElement>('dd[data-prov="witness"]')!,
    brief: block.querySelector(":scope > summary")!.textContent!,
    notices: [...root.querySelectorAll<HTMLElement>("[data-witness-notice]")],
  };
}

/** The one witness notice on a page, which sits right under the banner's bar (or its details line). */
function expectNotice(
  notices: HTMLElement[],
  banner: HTMLElement,
  kind: keyof typeof WITNESS_NOTICE_LINES,
): void {
  expect(notices).toHaveLength(1);
  const [notice] = notices as [HTMLElement];
  expect(notice.dataset.witnessNotice).toBe(kind);
  // In the warning colour, never the details line's muted grey alone.
  expect(notice.classList.contains("cv-witness-notice")).toBe(true);
  expect(notice.textContent).toBe(WITNESS_NOTICE_LINES[kind]);
  const bar = banner.parentElement!;
  const before = notice.previousElementSibling!;
  expect(
    before === bar ||
      (before.hasAttribute("data-banner-detail") &&
        before.previousElementSibling === bar),
  ).toBe(true);
}

for (const { card, file } of CARDS) {
  it(`${card} card: no receipt: nothing to witness, and the banner does not fail on it`, async () => {
    const { banner, witness, notices } = await page(file, []);
    expect(banner.dataset.verify).not.toBe("failed");
    expect(witness.dataset.witness).toBe("absent");
    expect(witness.textContent).toMatch(/^not stated in this bundle/u);
    expectNotice(notices, banner, "not-witnessed");
  });

  it(`${card} card: NOT_CHECKED: a receipt AAC could not check keeps "stated by the bundle, not checked here"`, async () => {
    const { banner, witness, brief, notices } = await page(file, [RECEIPT]);
    expect(banner.dataset.verify).not.toBe("failed");
    expect(witness.dataset.witness).toBe("not-checked");
    expectNotice(notices, banner, "not-witnessed");
    expect(witness.textContent).toMatch(
      /^"https:\/\/witness\.example\/log" \(tree size 1,234\): stated by the bundle, not checked here\./u,
    );
    expect(witness.textContent).not.toContain("verifies");
    expect(brief).toContain("witness receipt in this bundle");
  });

  it(`${card} card: INVALID: an entry AAC fails never reads as witnessed, and the banner fails`, async () => {
    const { banner, witness, brief, notices } = await page(file, [
      RECEIPT,
      "x",
    ]);
    expect(banner.dataset.verify).toBe("failed");
    expect(witness.dataset.witness).toBe("invalid");
    expect(notices).toHaveLength(0);
    expect(witness.textContent).toMatch(
      /^not witnessed: the witness check failed\. 1 entry in its witness list cannot be read\./u,
    );
    expect(witness.textContent).not.toContain("stated by the bundle");
    expect(witness.textContent).not.toContain("witness.example");
    expect(brief).toContain("witness check failed");
  });
}

for (const { card, file } of CARDS)
  it(`${card} card: no signed checkpoint: nothing for a witness to cover, so no witness notice`, async () => {
    const { bundle } = await sealEvidenceBundle(fixture(file));
    const root = document.createElement("main");
    await renderEvidenceGraph(bundle, root);
    const banner = root.querySelector<HTMLElement>(".cv-pill")!;
    expect(banner.dataset.verify).toBe("incomplete");
    expect(banner.dataset.checkpoint).not.toBe("verified");
    expect(root.querySelector("[data-witness-notice]")).toBeNull();
  });

// The two states a page cannot reach without a witness directory or with
// one: a receipt AAC passed, and no strict result at all (on a runtime with
// no Ed25519, where the checkpoint signature cannot verify either).
it("witnessNotice: none when a receipt passed or the check failed; unreported with no strict result", () => {
  const bundle = { checkpoint: { cose: "00", witnesses: [RECEIPT] } };
  const run = (witnesses: unknown) =>
    ({ strict: { witnesses } }) as unknown as Parameters<
      typeof witnessNotice
    >[1];
  const passed = run({
    status: "pass",
    findings: [],
    receipts: [{ status: "pass", tsUrl: RECEIPT.ts_url }],
  });
  expect(witnessStatus(bundle, passed)).toBe("verified");
  expect(witnessNotice(bundle, passed)).toBeUndefined();
  const withheld = run({
    status: "withheld",
    findings: [],
    receipts: [{ status: "withheld", tsUrl: RECEIPT.ts_url }],
  });
  expect(witnessStatus(bundle, withheld)).toBe("not-checked");
  expect(witnessNotice(bundle, withheld)).toBe("not-witnessed");
  const failed = run({ status: "fail", findings: [], receipts: [] });
  expect(witnessStatus(bundle, failed)).toBe("invalid");
  expect(witnessNotice(bundle, failed)).toBeUndefined();
  const none = {} as Parameters<typeof witnessNotice>[1];
  expect(witnessStatus(bundle, none)).toBe("not-checked");
  expect(witnessNotice(bundle, none)).toBe("witness-unreported");
  expect(witnessNotice({ checkpoint: { cose: "00" } }, none)).toBe(
    "witness-unreported",
  );
  expect(witnessNotice({ checkpoint: { cose: "00" } }, run(null))).toBe(
    "not-witnessed",
  );
});
