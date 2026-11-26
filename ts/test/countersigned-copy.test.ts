// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// The countersigned copy an x-deal-v1 receipt page carries (#456): the page
// fills COUNTERSIGNED only from its own check of that copy (the copy
// verifies, a countersignature on it resolves under the rows given, and its
// records 1 to k are the shown copy's records 1 to k); otherwise the stamp
// reads as it does without the copy. The fixtures are one real deal
// (tests/testdata/deal-v1/countersigned/README.md).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildVerifiedBundleContext } from "@action-state-group/agent-action-capsule";
import {
  createPresentationRegistry,
  renderEvidenceGraph,
} from "../src/evidence-graph-view.js";
import { checkCountersignedCopy } from "../src/countersigned-copy.js";
import { receiptModules } from "../src/receipt.js";

type Obj = Record<string, unknown>;
const raw = (dir: string, name: string): string =>
  readFileSync(
    resolve(process.cwd(), "..", "tests", "testdata", dir, name),
    "utf8",
  );
const fixture = (name: string): Obj =>
  JSON.parse(raw("deal-v1/countersigned", name)) as Obj;
const otherDeal = (name: string): Obj =>
  JSON.parse(raw("deal-v1", name)) as Obj;

const copy = (): Obj => fixture("countersigned-copy.bundle.json");
const rows = (): unknown => fixture("countersigners.json");
const given = (bundle: unknown = copy(), countersigners: unknown = rows()) => ({
  bundle,
  countersigners,
});

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
const AT = "2026-09-16T00:00:00Z";

async function stamp(
  shown: string,
  countersignedCopy?: unknown,
  keep: (name: string) => Obj = fixture,
): Promise<{ state: string | null; text: string }> {
  const registry = createPresentationRegistry();
  for (const module of receiptModules()) registry.register(module);
  const root = document.createElement("main");
  document.body.append(root);
  await renderEvidenceGraph(keep(`${shown}.bundle.json`), root, undefined, {
    depth: "L2",
    registry,
    verifierReport: keep(`${shown}.verify.json`),
    ...(countersignedCopy === undefined
      ? {}
      : { countersignedCopy: countersignedCopy as never }),
  });
  const li = root.querySelector('[data-stamp="countersigned"]');
  expect(li, "the receipt draws the COUNTERSIGNED stamp").not.toBeNull();
  return {
    state: li!.getAttribute("data-stamp-state"),
    text: li!.querySelector(".cv-rcpt-stamp__text")!.textContent ?? "",
  };
}

const UNFILLED = { state: "open", text: "Not countersigned" };

describe("the countersigned copy a v1 receipt page carries (#456)", () => {
  it("fills COUNTERSIGNED from the page's own check, through record k of n", async () => {
    expect(await stamp("same-checkpoint", given())).toEqual({
      state: "filled",
      text: `Countersigned by Example Countersigner at ${local(AT)}, through record 1 of 1.`,
    });
    expect(await stamp("later-checkpoint", given())).toEqual({
      state: "filled",
      text: `Countersigned by Example Countersigner at ${local(AT)}, through record 1 of 2.`,
    });
  });

  it("without the copy the stamp is as before", async () => {
    expect(await stamp("same-checkpoint")).toEqual(UNFILLED);
  });

  it("stays dotted when any check fails", async () => {
    const badSignature = copy();
    const entry = (badSignature["countersignatures"] as Obj[])[0]!;
    entry["signature"] = "0".repeat(128);
    const edited = copy();
    (edited["checkpoint"] as Obj)["cose"] = "AAAA";
    const cases: [string, unknown][] = [
      ["a signature that does not verify", given(badSignature)],
      ["an unlisted signer", given(copy(), [])],
      [
        "the holder's own key, even listed under a name",
        given(
          fixture("self-countersigned-copy.bundle.json"),
          fixture("self-countersigners.json"),
        ),
      ],
      ["a copy edited after it was signed", given(edited)],
      ["rows that are not a list", given(copy(), { countersigners: rows() })],
      ["no bundle", { countersigners: rows() }],
      ["not an object", "copy"],
    ];
    for (const [why, input] of cases)
      expect(await stamp("same-checkpoint", input), why).toEqual(UNFILLED);
  });

  it("stays dotted when the copy is of other records, or reaches past the shown copy", async () => {
    // Another deal's keep copy: record 1 is not the signed copy's record 1.
    expect(await stamp("keep-copy", given(), otherDeal)).toEqual(UNFILLED);
    // A copy of two records against a shown copy of one: k > n.
    expect(
      await stamp(
        "same-checkpoint",
        given(
          fixture("two-record-countersigned-copy.bundle.json"),
          fixture("two-record-countersigners.json"),
        ),
      ),
    ).toEqual(UNFILLED);
  });

  it("checkCountersignedCopy compares the records' capsule ids in log order", async () => {
    const shown = await buildVerifiedBundleContext(
      fixture("later-checkpoint.bundle.json"),
    );
    expect(await checkCountersignedCopy(shown, given())).toEqual({
      name: "Example Countersigner",
      at: AT,
      k: 1,
      n: 2,
    });
    const two = given(
      fixture("two-record-countersigned-copy.bundle.json"),
      fixture("two-record-countersigners.json"),
    );
    expect(await checkCountersignedCopy(shown, two)).toMatchObject({
      k: 2,
      n: 2,
    });
    const other = await buildVerifiedBundleContext(
      otherDeal("keep-copy.bundle.json"),
    );
    expect(await checkCountersignedCopy(other, given())).toBeNull();
  });
});
