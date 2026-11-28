// SPDX-License-Identifier: Apache-2.0
// capsule-viewer#523: the receipt line says "one can't be run on this file"
// only when a producer selection is the whole reason the verdict is
// incomplete. Any other unchecked claim keeps the runtime's own detail
// (receipt-not-run-line.test.ts), so the selection sentence never hides it.
import { describe, expect, it } from "vitest";
import { SELECTION_NOT_CHECKABLE } from "@action-state-group/agent-action-capsule";
import { selectionOnly } from "../src/receipt-selection.js";

type Claim = { name: string; status: string; findings: string[] };
const PASS = (name: string): Claim => ({ name, status: "pass", findings: [] });
const SELECTION: Claim = {
  name: "interval_coverage",
  status: "withheld",
  findings: [SELECTION_NOT_CHECKABLE],
};
const CLAIMS = [
  PASS("records"),
  PASS("signatures"),
  PASS("graph_closure"),
  PASS("checkpoint"),
  SELECTION,
  PASS("per_record_membership"),
  PASS("disclosures"),
];
const withheld = {
  intervalCoverage: { status: "withheld", findings: [SELECTION_NOT_CHECKABLE] },
};
const context = (claims: Claim[], verification: object = withheld) =>
  ({ strict: { claims }, verification }) as unknown as Parameters<
    typeof selectionOnly
  >[0];
const replace = (name: string, claim: Claim): Claim[] =>
  CLAIMS.map((c) => (c.name === name ? claim : c));

describe("selectionOnly (#523)", () => {
  it("is true when interval coverage, withheld for the selection, is the only unchecked claim", () => {
    expect(selectionOnly(context(CLAIMS))).toBe(true);
  });

  it.each([
    [
      "another claim did not pass",
      replace("signatures", {
        name: "signatures",
        status: "incomplete",
        findings: ["producer_signature_unclaimed:x"],
      }),
    ],
    [
      "a passing claim carries a finding",
      replace("per_record_membership", {
        name: "per_record_membership",
        status: "pass",
        findings: ["checkpoint_unverified"],
      }),
    ],
    [
      "interval coverage carries another finding too",
      replace("interval_coverage", {
        ...SELECTION,
        findings: [SELECTION_NOT_CHECKABLE, "checkpoint_unverified"],
      }),
    ],
    [
      "interval coverage is withheld for another reason",
      replace("interval_coverage", {
        ...SELECTION,
        findings: ["range_proof_absent"],
      }),
    ],
  ])("is false when %s", (_, claims) => {
    expect(selectionOnly(context(claims))).toBe(false);
  });

  it("is false when the bundle is not a producer selection, or has no strict result", () => {
    expect(
      selectionOnly(
        context(CLAIMS, { intervalCoverage: { status: "pass", findings: [] } }),
      ),
    ).toBe(false);
    expect(
      selectionOnly({ strict: undefined, verification: withheld } as never),
    ).toBe(false);
  });
});
