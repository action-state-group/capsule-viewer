// SPDX-License-Identifier: Apache-2.0
// The History card's signature standing (capsule-viewer#211; rule F4.7,
// "Snapshot · witnessed · signed · policy v1"), for a presentation module,
// which verifies nothing itself (presentation-contract-v0 section 3).
//
// The card is the root record's agent_input. Whether the root record's
// producer signature verifies is already decided by the context's strict
// verification (agent-action-capsule verifyBundle with `strict`, which runs
// only when this browser can verify Ed25519): `authored` under the key the
// record names, `invalid`, or `unclaimed`. This reads that verdict for the
// root and nothing else. A pass says the card was signed with the key the
// record names; it says nothing about who holds that key.
import { isVerifiedBundleContext } from "@action-state-group/agent-action-capsule";

/** What {@link readerCardSignature} says about a History card's signature. */
export interface ReaderCardSignature {
  /** `PASS` when the root record's signature verifies under the key it names,
   * `FAIL` when it does not, `NOT_PRESENT` when the record claims none, and
   * `NOT_CHECKED` when this page has no strict result (no Ed25519 in this
   * browser) or was not handed a verified context. */
  readonly status: "PASS" | "FAIL" | "NOT_PRESENT" | "NOT_CHECKED";
  /** The record's key_id (lowercase hex of its Ed25519 public key) on `PASS`,
   * else null. */
  readonly key_id: string | null;
}

const result = (
  status: ReaderCardSignature["status"],
  keyId: string | null = null,
): ReaderCardSignature => ({ status, key_id: keyId });

/**
 * The History card's signature standing from a verified context
 * (`buildVerifiedBundleContext`): the strict verdict of the context's root
 * record. Never throws; a check this page cannot run is `NOT_CHECKED`, never
 * a pass.
 */
export async function readerCardSignature(
  context: unknown,
): Promise<ReaderCardSignature> {
  if (!isVerifiedBundleContext(context)) return result("NOT_CHECKED");
  const record = context.strict?.records.find(
    (r) => r.capsuleId === context.root,
  );
  if (record === undefined) return result("NOT_CHECKED");
  switch (record.signature) {
    case "authored":
      return record.keyId === null
        ? result("NOT_CHECKED")
        : result("PASS", record.keyId);
    case "invalid":
      return result("FAIL");
    case "unclaimed":
      return result("NOT_PRESENT");
  }
  return result("NOT_CHECKED");
}
