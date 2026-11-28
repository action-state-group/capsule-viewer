// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom
// The banner's witness notice on an x-deal-v0 copy (capsule-viewer#527,
// Sherlock2 u286): since u225 a v0 copy carries no witness evidence, so a
// copy that carries none gets `file-no-receipt`, the sentence about this
// file, never `not-witnessed`'s "it could be a private copy of the log". The
// key is what the copy carries, not the profile: a copy written before u225
// carries its chain, and when this page cannot check it, it keeps
// `not-witnessed`. Never both lines on one page.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/evidence-graph-view.js";
import {
  WITNESS_CHAIN_EXTENSIONS,
  WITNESS_NOTICE_LINES,
  witnessNotice,
} from "../src/report-provenance.js";

type Obj = Record<string, unknown>;
type Verified = Parameters<typeof witnessNotice>[1];

const receiptCopy = (name: string): Obj =>
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "..", "tests", "testdata", "receipt", name),
      "utf8",
    ),
  ) as Obj;

async function notices(bundle: Obj): Promise<string[]> {
  const root = document.createElement("main");
  document.body.append(root);
  await renderEvidenceGraph(bundle, root);
  return [...root.querySelectorAll<HTMLElement>("[data-witness-notice]")].map(
    (n) => {
      expect(n.textContent).toBe(
        WITNESS_NOTICE_LINES[
          n.dataset.witnessNotice as keyof typeof WITNESS_NOTICE_LINES
        ],
      );
      return n.dataset.witnessNotice!;
    },
  );
}

describe("an x-deal-v0 copy's page", () => {
  it("draws file-no-receipt, and no not-witnessed line, for a copy that carries no witness evidence", async () => {
    // mesh-payer-selected: a v0 copy with no chain and no checkpoint receipt.
    const bundle = receiptCopy("mesh-payer-selected.bundle.json");
    expect(Object.keys(bundle["extensions"] as Obj)).toContain("x-deal-v0");
    expect(await notices(bundle)).toEqual(["file-no-receipt"]);
  });

  it("keeps not-witnessed, and no file-no-receipt line, for a pre-u225 copy whose chain this page could not check", async () => {
    // main-standalone-keep: a v0 copy written before u225, carrying its
    // x-cadence-witness/v0 chain; a page with no witness directory cannot
    // check its receipt.
    const bundle = receiptCopy("main-standalone-keep.bundle.json");
    expect(Object.keys(bundle["extensions"] as Obj)).toContain(
      "x-cadence-witness/v0",
    );
    expect(await notices(bundle)).toEqual(["not-witnessed"]);
  });
});

describe("witnessNotice on an x-deal-v0 bundle", () => {
  const strict = { strict: { witnesses: null } } as unknown as Verified;
  const none = {} as Verified;
  const v0 = (extra: Obj = {}, checkpoint: Obj = { cose: "00" }): Obj => ({
    checkpoint,
    extensions: { "x-deal-v0": {}, ...extra },
  });

  it("is file-no-receipt for a copy that carries nothing, with or without a strict result", () => {
    expect(witnessNotice(v0(), strict)).toBe("file-no-receipt");
    expect(witnessNotice(v0(), none)).toBe("file-no-receipt");
    expect(witnessNotice(v0({}, { cose: "00", witnesses: [] }), strict)).toBe(
      "file-no-receipt",
    );
    expect(witnessNotice(v0({}, { cose: "00", witnesses: null }), strict)).toBe(
      "file-no-receipt",
    );
    // A composed copy whose members carry nothing either.
    const composed = {
      "composed/v1": { members: [{ bundle: v0() }, { outcome: "absence" }] },
    };
    expect(witnessNotice(v0(composed), strict)).toBe("file-no-receipt");
  });

  it("is never file-no-receipt for a copy that carries a chain under any name, an object or not", () => {
    expect(WITNESS_CHAIN_EXTENSIONS).toEqual([
      "parent-log-witness/v1",
      "x-cadence-witness/v0",
      "cadence-witness/v0",
      "x-deal-cadence-v0",
    ]);
    for (const name of WITNESS_CHAIN_EXTENSIONS)
      for (const block of [{ state: "witnessed" }, "x", null]) {
        expect(witnessNotice(v0({ [name]: block }), strict), name).toBe(
          "not-witnessed",
        );
        expect(witnessNotice(v0({ [name]: block }), none), name).toBe(
          "witness-unreported",
        );
      }
  });

  it("is never file-no-receipt for a copy whose checkpoint lists a receipt, a stub included", () => {
    const receipt = {
      ts_url: "https://witness.example/log",
      entry_hash: "00",
      receipt_b64: "AAAA",
      leaf_index: 0,
      tree_size: 1,
    };
    for (const witnesses of [[receipt], [{ ...receipt, is_stub: true }]])
      expect(witnessNotice(v0({}, { cose: "00", witnesses }), strict)).toBe(
        "not-witnessed",
      );
  });

  it("is never file-no-receipt for a copy that carries evidence only in a composed member, however deep", () => {
    const chained = { extensions: { "parent-log-witness/v1": {} } };
    const listed = { checkpoint: { witnesses: [{}] } };
    for (const carried of [chained, listed]) {
      const one = { "composed/v1": { members: [{ bundle: carried }] } };
      expect(witnessNotice(v0(one), strict)).toBe("not-witnessed");
      const deep = {
        "composed/v1": {
          members: [{ bundle: { extensions: one } }, { bundle: v0() }],
        },
      };
      expect(witnessNotice(v0(deep), strict)).toBe("not-witnessed");
    }
  });

  it("is unchanged for a bundle that is not a deal copy", () => {
    expect(witnessNotice({ checkpoint: { cose: "00" } }, strict)).toBe(
      "not-witnessed",
    );
  });
});
