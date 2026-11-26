// SPDX-License-Identifier: Apache-2.0
// The countersigned copy an x-deal-v1 receipt page carries beside its fresh
// copy (capsule-viewer#456, evidencebook#1015). A countersigner signs the
// withheld form of the holder's deal book; the page fills COUNTERSIGNED only
// from its own check of that signed copy (u523 as Sherlock2 read it on
// evidencebook-skills#383): the copy verifies, a countersignature on it
// verifies over the copy's own digest and resolves under the countersigner
// rows the page was given, and its records 1 to k are the records 1 to k of
// the copy the page shows. Deal contents still come from the fresh copy.

import {
  buildVerifiedBundleContext,
  bundleVerified,
  classifyCountersignatures,
  declaredProducerKeys,
  type VerifiedBundleContext,
} from "@action-state-group/agent-action-capsule";

/** What the page was handed: the countersigned copy and the countersigner rows. */
export interface CountersignedCopyInput {
  readonly bundle: unknown;
  /** Countersigner rows, `[{name, key_ids}]` (AAC's `CountersignerSource`). */
  readonly countersigners: unknown;
}

/**
 * The page's own finding on a countersigned copy that passed every check:
 * the resolved signer's name, the time its statement says it recomputed (its
 * own clock), and how far into the shown book the copy reaches (record k of
 * the shown n).
 */
export interface CountersignedCopyStamp {
  readonly name: string;
  readonly at: string;
  readonly k: number;
  readonly n: number;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};

/**
 * Check `input` against the shown copy's verified context, or return null
 * when any check fails: the copy is not a bundle that verifies, its records
 * are not the shown copy's first records, no countersignature on it resolves,
 * or the input is not of the expected shape. A failure is never shown as a
 * reason: the stamp then reads as it would without the copy.
 */
export async function checkCountersignedCopy(
  shown: VerifiedBundleContext,
  input: unknown,
): Promise<CountersignedCopyStamp | null> {
  const given = obj(input);
  if (!Array.isArray(given["countersigners"])) return null;
  let copy: VerifiedBundleContext;
  try {
    copy = await buildVerifiedBundleContext(given["bundle"]);
  } catch {
    return null;
  }
  if (
    !bundleVerified(copy.verification) ||
    copy.strict?.verdict !== "VALID" ||
    shown.strict === undefined
  )
    return null;
  // The record digests: each record's capsule_id, which the verifier checked
  // the record against (identityOk), in log order.
  const copied = copy.strict.records;
  const records = shown.strict.records;
  const k = copied.length,
    n = records.length;
  if (k === 0 || k > n) return null;
  for (let i = 0; i < k; i++) {
    const a = copied[i]!,
      b = records[i]!;
    if (!a.identityOk || !b.identityOk) return null;
    if (a.capsuleId !== b.capsuleId || a.seq !== b.seq) return null;
  }
  // A countersignature by either copy's declared producer key is the
  // holder's own, never an independent one.
  const producers = [
    ...declaredProducerKeys(copy.bundle),
    ...declaredProducerKeys(shown.bundle),
  ];
  const stamps = await classifyCountersignatures(
    copy.countersignatures.map((entry) => entry.value),
    copy.verification.bundleDigest,
    producers,
    given["countersigners"] as never,
  );
  for (const stamp of stamps)
    if (stamp.kind === "resolved")
      return { name: stamp.name, at: stamp.statement.recomputedAt, k, n };
  return null;
}
