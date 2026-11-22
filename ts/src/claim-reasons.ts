// SPDX-License-Identifier: BSD-3-Clause

// The reason a claim gives for being unavailable or for a grade below
// countersigned (evidence-result-v0 section 4.4; contract-report-module-v1
// section 2, "Reasons"). The Result reader (`ResultClaim`) carries it as
// `reason` with its registry `reasonKind`. This is a display-only read: it
// never changes a verdict, grade, tally, bucket or any check, and the text
// it selects is labelled as the producer's statement.

import type { ResultClaim } from "@action-state-group/agent-action-capsule";

/**
 * Codes that would make `row.<ref>.reason.<code>` the same key as another
 * row key of a requirement named `<ref>.reason` (`row.<ref>.reason.label`,
 * `.detail`, `.not_evaluable`): never worded, shown as the raw code.
 */
const RESERVED: ReadonlySet<string> = new Set([
  "label",
  "detail",
  "not_evaluable",
]);

export interface ClaimReason {
  readonly code: string;
  /** `finding` is drawn in the warning tone; `setting` and `unregistered` neutrally (section 4.4). */
  readonly kind: "finding" | "setting" | "unregistered";
  /** False for a code that cannot form a `row.<ref>.reason.<code>` key. */
  readonly keyable: boolean;
}

/**
 * The reasons of `claims`, by claim id. A claim that failed verification
 * gets none: its row says it failed, not why it was unavailable.
 */
export function claimReasons(
  claims: readonly ResultClaim[],
): ReadonlyMap<string, ClaimReason> {
  const out = new Map<string, ClaimReason>();
  for (const claim of claims) {
    if (claim.failed || claim.reason === undefined) continue;
    out.set(claim.id, {
      code: claim.reason,
      kind: claim.reasonKind ?? "unregistered",
      keyable: !RESERVED.has(claim.reason),
    });
  }
  return out;
}
