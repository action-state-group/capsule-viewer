// SPDX-License-Identifier: Apache-2.0

// The compiled Evidence Contract as a builder setting (evidence-contract.ts):
// the check every path runs, against the vectors the Go twin reads too
// (go/emitter/testdata/contract-vectors.json, TestCheckContractVectors),
// and how a row's tier is read from it.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkContractInput,
  ContractError,
  rowTier,
} from "../src/evidence-contract.js";

interface Vector {
  readonly name: string;
  readonly text: string;
  readonly sha256: string;
  readonly error?: string;
  readonly ref?: string;
  readonly tiers?: Readonly<Record<string, string>>;
}

const { vectors } = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "..",
      "go",
      "emitter",
      "testdata",
      "contract-vectors.json",
    ),
    "utf8",
  ),
) as { vectors: Vector[] };

describe("the contract check, shared with the Go twin", () => {
  it("has vectors", () => expect(vectors.length).toBeGreaterThan(10));
  for (const v of vectors)
    it(v.name, async () => {
      const checked = checkContractInput({ text: v.text, sha256: v.sha256 });
      if (v.error !== undefined) {
        await expect(checked).rejects.toThrow(ContractError);
        await expect(checked).rejects.toThrow(v.error);
        return;
      }
      const contract = await checked;
      expect(contract.ref).toBe(v.ref);
      expect(contract.sha256).toBe(v.sha256);
      expect(
        Object.fromEntries(
          [...contract.tiers].map(([id, tier]) => [id, tier ?? ""]),
        ),
      ).toEqual(v.tiers);
    });
});

describe("a row's tier", () => {
  it("is the contract's when the row cites it; otherwise not stated, never must-have", async () => {
    const text =
      '{"id":"airline/v1","version":"1.5.0","requirements":[{"id":"a.x","tier":"must_have"},{"id":"a.y","tier":"informational"},{"id":"a.z"}]}';
    const { createHash } = await import("node:crypto");
    const contract = await checkContractInput({
      text,
      sha256: createHash("sha256").update(text).digest("hex"),
    });
    const ref = "airline/v1@1.5.0";
    expect(rowTier(contract, ref, "a.x")).toBe("must_have");
    expect(rowTier(contract, ref, "a.y")).toBe("informational");
    // Listed with no tier, not listed, another contract, another version,
    // no contract at all.
    expect(rowTier(contract, ref, "a.z")).toBe("unstated");
    expect(rowTier(contract, ref, "b.q")).toBe("unstated");
    expect(rowTier(contract, "other@1.5.0", "a.x")).toBe("unstated");
    expect(rowTier(contract, "airline/v1@1.4.0", "a.x")).toBe("unstated");
    expect(rowTier(undefined, ref, "a.x")).toBe("unstated");
    // An inherited member is not a requirement.
    expect(rowTier(contract, ref, "constructor")).toBe("unstated");
  });
});
