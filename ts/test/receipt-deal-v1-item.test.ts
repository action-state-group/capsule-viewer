// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
/**
 * capsule-viewer#461 item 1: the x-deal-v1 receipt names the item from the
 * holder's own sealed offer, given to the page as `dealOffer`, only when the
 * offer is the one the copy's own sealed agreement cites (SHA-256 over its
 * JCS bytes). Sherlock2's rule on #384 (buzz 92cd3346, 1623c8d3): the item is
 * the offer's `terms.item`; the seller is left out until a record seals its
 * name (evidencebook#1031), and a key id is never drawn as one.
 *
 * Fixture: tests/testdata/deal-v1/offer, one real deal written by capsulectl
 * (see its README): the buyer's keep copy, capsulectl's verify report on it
 * (VALID, x-deal-v1 pass) and the buyer's own sealed offer.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPresentationRegistry,
  renderEvidenceGraph,
} from "../src/evidence-graph-view.js";
import { receiptModules } from "../src/receipt.js";
import { RECEIPT_CORE } from "../src/receipt-core.generated.js";

type Obj = Record<string, unknown>;
const data = (name: string): Obj =>
  JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "..",
        "tests",
        "testdata",
        "deal-v1",
        "offer",
        name,
      ),
      "utf8",
    ),
  ) as Obj;
const ITEM = "200 conference badges, delivered by Friday";
const core = RECEIPT_CORE as {
  recordDigest(value: unknown): string | null;
};

async function page(
  bundle: Obj,
  options: { dealOffer?: unknown; verifierReport?: unknown },
): Promise<HTMLElement> {
  const registry = createPresentationRegistry();
  for (const module of receiptModules()) registry.register(module);
  const root = document.createElement("main");
  document.body.append(root);
  await renderEvidenceGraph(bundle, root, undefined, {
    depth: "L0",
    registry,
    verifierReport: data("keep-copy.verify.json"),
    ...options,
  });
  return root;
}
const item = (root: HTMLElement): string | null =>
  root.querySelector("[data-hero-item]")?.textContent ?? null;

describe("#461: the item from the holder's own sealed offer, on a page", () => {
  it("the real offer the agreement cites: the hero names its item", async () => {
    const root = await page(data("keep-copy.bundle.json"), {
      dealOffer: data("offer.json"),
    });
    expect(root.querySelector("[data-receipt-surface]")).not.toBeNull();
    expect(item(root)).toBe(ITEM);
    // Inside the hero, under the top line; no seller is named.
    expect(root.querySelector(".cv-rcpt-hero [data-hero-item]")).not.toBeNull();
  });

  it("no offer given: no item, and the rest of the receipt is unchanged", async () => {
    const without = await page(data("keep-copy.bundle.json"), {});
    expect(item(without)).toBeNull();
    const withOffer = await page(data("keep-copy.bundle.json"), {
      dealOffer: data("offer.json"),
    });
    withOffer.querySelector("[data-hero-item]")?.remove();
    expect(withOffer.innerHTML).toBe(without.innerHTML);
  });

  it("an offer the agreement does not cite draws no item", async () => {
    const offer = structuredClone(data("offer.json"));
    ((offer["body"] as Obj)["terms"] as Obj)["item"] = "something else";
    const root = await page(data("keep-copy.bundle.json"), {
      dealOffer: offer,
    });
    expect(root.querySelector("[data-receipt-surface]")).not.toBeNull();
    expect(item(root)).toBeNull();
    expect(root.textContent).not.toContain("something else");
  });

  it("without capsulectl's report the receipt is not drawn, and neither is the item", async () => {
    const root = await page(data("keep-copy.bundle.json"), {
      dealOffer: data("offer.json"),
      verifierReport: undefined,
    });
    expect(item(root)).toBeNull();
  });

  it("an agreement re-sealed to cite another offer, with its hash chain redone but not re-signed, draws no item", async () => {
    // The trust boundary is the record's signature, which the page's runtime
    // checks before any module draws: the module's own hash chain (payload ->
    // header -> agent_input_digest) is redone here so only the signature is wrong.
    const forged = structuredClone(data("offer.json"));
    ((forged["body"] as Obj)["terms"] as Obj)["item"] = "forged item";
    const bundle = structuredClone(data("keep-copy.bundle.json"));
    const agreement = ((bundle["extensions"] as Obj)["x-deal-v1"] as Obj)[
      "book"
    ] as Obj;
    const pair = agreement["agreement"] as Obj;
    const payload = pair["payload"] as Obj;
    ((payload["body"] as Obj)["offer"] as Obj)["digest"] =
      core.recordDigest(forged);
    const header = pair["header"] as Obj;
    header["payload_commitments"] = [core.recordDigest(payload)];
    const id = (pair["record"] as Obj)["capsule_id"];
    const record = (bundle["records"] as Obj[]).find(
      (r) => r["capsule_id"] === id,
    )!;
    ((record["model_attestation"] as Obj)["compute_attestation"] as Obj)[
      "agent_input_digest"
    ] = core.recordDigest(header);
    (pair["record"] as Obj)["model_attestation"] = record["model_attestation"];
    const root = await page(bundle, { dealOffer: forged });
    expect(item(root)).toBeNull();
    expect(root.textContent).not.toContain("forged item");
  });
});
