// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

import { expect, it } from "vitest";
import type { ResultClaim } from "@action-state-group/agent-action-capsule";
import { LOCKED_ENTRIES } from "../src/contract-report-wording.js";
import { withheldMark } from "../src/report-levels.js";
import { ladderWords } from "./helpers/ladder-pack.js";

const L = ladderWords();
const claim = (status: string, extra: Partial<ResultClaim> = {}): ResultClaim =>
  ({
    presentation: { kind: "disclosure", status },
    evidence: [{ digest: "sha256:aa", resolved: false }],
    failed: false,
    ...extra,
  }) as unknown as ResultClaim;

it("draws the red mark for a claim sealed WITHHELD, with its cited digest and no level", () => {
  const mark = withheldMark(claim("WITHHELD"), L)!;
  expect(mark.dataset.mark).toBe("withheld");
  expect(mark.textContent).toBe("Withheld by the holder · cites sha256:aa");
  expect(mark.textContent).not.toMatch(/tier|level|gated/iu);
});

it("lists every cited digest", () => {
  const two = claim("WITHHELD", {
    evidence: [
      { digest: "sha256:aa", resolved: false },
      { digest: "sha256:bb", resolved: true },
    ],
  });
  expect(withheldMark(two, L)!.textContent).toBe(
    "Withheld by the holder · cites sha256:aa, sha256:bb",
  );
});

it("says only that the holder withheld it when the claim cites no digest", () => {
  const mark = withheldMark(claim("WITHHELD", { evidence: [] }), L)!;
  expect(mark.textContent).toBe("Withheld by the holder");
});

it("draws nothing for any other status, or for a claim that failed verification", () => {
  for (const status of ["NOT_FOUND", "NOT_COMMITTED", "UNKNOWN", "SATISFIED"])
    expect(withheldMark(claim(status), L)).toBeUndefined();
  expect(withheldMark(claim("WITHHELD", { failed: true }), L)).toBeUndefined();
});

it("locks the mark's words so a pack cannot reword them", () => {
  expect(LOCKED_ENTRIES.has("card.mark.withheld")).toBe(true);
  expect(LOCKED_ENTRIES.has("card.mark.withheld.cited")).toBe(true);
});
