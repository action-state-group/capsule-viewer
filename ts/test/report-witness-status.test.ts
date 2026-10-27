// SPDX-License-Identifier: BSD-3-Clause
// The front's "Witnessed by" line and the banner on one page follow AAC's
// strict witness status alone (capsule-viewer#46, from evidencebook#115).
// A page's verified context has no witness directory, so on a page a
// well-formed receipt is NOT_CHECKED and only an entry AAC fails is
// INVALID; VERIFIED, which needs a directory, is covered on the line itself
// in report-provenance.test.ts, over AAC's own strict vectors.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
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
): Promise<{ banner: HTMLElement; witness: HTMLElement; brief: string }> {
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
  };
}

for (const { card, file } of CARDS) {
  it(`${card} card: no receipt: nothing to witness, and the banner does not fail on it`, async () => {
    const { banner, witness } = await page(file, []);
    expect(banner.dataset.verify).not.toBe("failed");
    expect(witness.dataset.witness).toBe("absent");
    expect(witness.textContent).toMatch(/^not stated in this bundle/u);
  });

  it(`${card} card: NOT_CHECKED: a receipt AAC could not check keeps "stated by the bundle, not checked here"`, async () => {
    const { banner, witness, brief } = await page(file, [RECEIPT]);
    expect(banner.dataset.verify).not.toBe("failed");
    expect(witness.dataset.witness).toBe("not-checked");
    expect(witness.textContent).toMatch(
      /^"https:\/\/witness\.example\/log" \(tree size 1,234\): stated by the bundle, not checked here\./u,
    );
    expect(witness.textContent).not.toContain("verifies");
    expect(brief).toContain("witness receipt in this bundle");
  });

  it(`${card} card: INVALID: an entry AAC fails never reads as witnessed, and the banner fails`, async () => {
    const { banner, witness, brief } = await page(file, [RECEIPT, "x"]);
    expect(banner.dataset.verify).toBe("failed");
    expect(witness.dataset.witness).toBe("invalid");
    expect(witness.textContent).toMatch(
      /^not witnessed: the witness check failed\. 1 entry in its witness list cannot be read\./u,
    );
    expect(witness.textContent).not.toContain("stated by the bundle");
    expect(witness.textContent).not.toContain("witness.example");
    expect(brief).toContain("witness check failed");
  });
}
