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

/**
 * The registered tokens the core words itself (`generic.reason.token.<code>`):
 * ER section 4.4 gives each one meaning for every producer, so a page with no
 * pack word still says what it means. Any other token is shown raw.
 */
export const CORE_REASON_CODES: ReadonlySet<string> = new Set([
  "capsule_signature_did_not_verify",
  "capsule_signer_not_trusted",
  "counterparty_leg_signature_did_not_verify",
  "counterparty_leg_signer_not_trusted",
]);

export interface ClaimReason {
  readonly code: string;
  /** `finding` is drawn in the warning tone; `setting` and `unregistered` neutrally (section 4.4). */
  readonly kind: "finding" | "setting" | "unregistered";
  /**
   * True when a pack may word the code (`row.<ref>.reason.<code>`): a
   * registered token that is not a reserved row suffix. An unregistered token
   * is always shown raw (section 4.4).
   */
  readonly keyable: boolean;
  /** True when the core has words for the code. */
  readonly core: boolean;
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
    const kind = claim.reasonKind ?? "unregistered";
    out.set(claim.id, {
      code: claim.reason,
      kind,
      keyable: kind !== "unregistered" && !RESERVED.has(claim.reason),
      core: CORE_REASON_CODES.has(claim.reason),
    });
  }
  return out;
}
