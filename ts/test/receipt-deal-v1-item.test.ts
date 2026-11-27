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
import {
  bundleDigest,
  verifyBundle,
} from "@action-state-group/agent-action-capsule";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPresentationRegistry,
  renderEvidenceGraph,
} from "../src/evidence-graph-view.js";
import { receiptModules } from "../src/receipt.js";
import { RECEIPT_CORE } from "../src/receipt-core.generated.js";
import { pairOf, pointer } from "./helpers/receipt-anti-hardcode.js";

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

  // capsulectl's report rebound to *bundle*: its digest recomputed, its record
  // identities unchanged (the capsule ids stay), so the report's own binding
  // holds and only the page's verification of the bundle decides.
  const reboundReport = async (bundle: Obj): Promise<Obj> => {
    const r = structuredClone(data("keep-copy.verify.json"));
    r["bundle_digest"] = await bundleDigest(bundle as never);
    return r;
  };
  // The agreement re-sealed to cite *offer*, its hash chain redone (payload ->
  // header commitment -> the record's agent_input_digest) but not re-signed.
  const reSealed = (offer: Obj): Obj => {
    const bundle = structuredClone(data("keep-copy.bundle.json"));
    const book = ((bundle["extensions"] as Obj)["x-deal-v1"] as Obj)[
      "book"
    ] as Obj;
    const pair = book["agreement"] as Obj;
    const payload = pair["payload"] as Obj;
    ((payload["body"] as Obj)["offer"] as Obj)["digest"] =
      core.recordDigest(offer);
    const header = pair["header"] as Obj;
    header["payload_commitments"] = [core.recordDigest(payload)];
    const id = (pair["record"] as Obj)["capsule_id"];
    const record = (bundle["records"] as Obj[]).find(
      (r) => r["capsule_id"] === id,
    )!;
    ((record["model_attestation"] as Obj)["compute_attestation"] as Obj)[
      "agent_input_digest"
    ] = core.recordDigest(header);
    pair["record"] = record;
    return bundle;
  };

  it("a copy carrying the offer's sent pair as book.offer (#498): the hero names its item from the copy, with no side input", async () => {
    // evidencebook#1065 carries the pair `deal offer --out` wrote; until a
    // capsulectl writes it, the pair is put in the real keep copy here and
    // capsulectl's report rebound to that copy.
    const pair = data("offer.pair.json");
    const bundle = structuredClone(data("keep-copy.bundle.json"));
    ((bundle["extensions"] as Obj)["x-deal-v1"] as Obj)["book"] = {
      ...(((bundle["extensions"] as Obj)["x-deal-v1"] as Obj)["book"] as Obj),
      offer: pair,
    };
    const root = await page(bundle, {
      verifierReport: await reboundReport(bundle),
    });
    expect(root.querySelector("[data-receipt-surface]")).not.toBeNull();
    expect(item(root)).toBe(ITEM);
    const id = String((pair["record"] as Obj)["capsule_id"]);
    expect(
      root
        .querySelector("[data-hero-item] [data-ptr]")
        ?.getAttribute("data-ptr"),
    ).toBe(`record:${id}#/agent_input/body/terms/item`);
    // The anti-hardcode check reads that source back from the copy.
    expect(pointer(pairOf(bundle, id), "/agent_input/body/terms/item")).toBe(
      ITEM,
    );
  });

  it("control: a report rebound to the unchanged copy still binds, and the item is drawn", async () => {
    const bundle = data("keep-copy.bundle.json");
    const root = await page(bundle, {
      dealOffer: data("offer.json"),
      verifierReport: await reboundReport(bundle),
    });
    expect(item(root)).toBe(ITEM);
  });

  it("an agreement re-sealed to cite another offer, its hash chain redone but not re-signed, is refused by the page's own verification", async () => {
    // The trust boundary is the record's signature, which the page's runtime
    // checks before any module draws; the report here binds to the forged
    // bundle, so only that check stands between it and the receipt.
    const forged = structuredClone(data("offer.json"));
    ((forged["body"] as Obj)["terms"] as Obj)["item"] = "forged item";
    const bundle = reSealed(forged);
    const agreementId = String(
      (
        (
          (((bundle["extensions"] as Obj)["x-deal-v1"] as Obj)["book"] as Obj)[
            "agreement"
          ] as Obj
        )["record"] as Obj
      )["capsule_id"],
    );
    const checked = await verifyBundle(bundle);
    expect(checked.capsuleResults[agreementId]?.ok).toBe(false);
    const root = await page(bundle, {
      dealOffer: forged,
      verifierReport: await reboundReport(bundle),
    });
    expect(root.querySelector("[data-receipt-surface]")).toBeNull();
    expect(item(root)).toBeNull();
    expect(root.textContent).not.toContain("forged item");
  });
});
