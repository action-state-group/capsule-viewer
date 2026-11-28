// SPDX-License-Identifier: Apache-2.0
/**
 * Whether a receipt's incomplete verdict comes only from a producer
 * selection (capsule-viewer#523): every strict claim passed with no
 * finding, except interval coverage, withheld only because the producer
 * chose the records. Internal to receipt.ts; not a package export.
 */
import {
  isProducerSelection,
  SELECTION_NOT_CHECKABLE,
  type VerifiedBundleContext,
} from "@action-state-group/agent-action-capsule";

export function selectionOnly(
  context: Pick<VerifiedBundleContext, "strict" | "verification">,
): boolean {
  const strict = context.strict;
  if (strict === undefined || !isProducerSelection(context.verification))
    return false;
  return strict.claims.every((claim) =>
    claim.name === "interval_coverage"
      ? claim.findings.length === 1 &&
        claim.findings[0] === SELECTION_NOT_CHECKABLE
      : claim.status === "pass" && claim.findings.length === 0,
  );
}
