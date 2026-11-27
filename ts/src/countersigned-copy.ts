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
  /**
   * The signer's directory row lists it as independent of both parties:
   * its `independent_of` names the holder's key (a producer key either
   * bundle declares) and the counterparty's key the holder's sealed
   * agreement names. Otherwise the page says the row does not (u649,
   * Sherlock2 on #457); the page never says who runs whom.
   */
  readonly independent: boolean;
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
      return {
        name: stamp.name,
        at: stamp.statement.recomputedAt,
        k,
        n,
        independent: listedIndependent(
          given["countersigners"] as unknown[],
          stamp.keyId,
          stamp.name,
          producers,
          counterpartyKey(shown.bundle),
        ),
      };
  return null;
}

// The counterparty's key the holder's own sealed agreement names
// (x-deal-v1 `book.agreement`, its body's `counterparty_key`), or null.
export function counterpartyKey(bundle: unknown): string | null {
  const agreement = obj(
    obj(obj(obj(bundle)["extensions"])["x-deal-v1"])["book"],
  )["agreement"];
  const key = obj(obj(obj(agreement)["payload"])["body"])["counterparty_key"];
  return typeof key === "string" && /^[0-9a-f]{64}$/u.test(key) ? key : null;
}

// Whether the row that names the signer (its name and key, as the
// classifier resolved them) lists it as independent of every party: the
// holder's keys and the counterparty's. A missing row, a missing list, a
// missing party or an unknown counterparty leaves it not listed (u650).
function listedIndependent(
  rows: readonly unknown[],
  keyId: string,
  name: string,
  holder: readonly string[],
  counterparty: string | null,
): boolean {
  const row = rows
    .map(obj)
    .find(
      (r) =>
        r["name"] === name &&
        Array.isArray(r["key_ids"]) &&
        r["key_ids"].includes(keyId),
    );
  return listsParties(row?.["independent_of"], holder, counterparty) === true;
}

/**
 * What a directory row's `independent_of` list says about the parties, as
 * far as the page knows them: false when the list is missing or leaves out
 * a party key the page knows (the holder's producer keys, the counterparty's
 * key), true when it names every one and the page knows both sides, and null
 * when it names every key the page knows but the page does not know both
 * sides, so it cannot tell. The countersigned copy reads null as not listed
 * (u650); the witness line draws nothing for it (capsule-viewer#508: never
 * assumed).
 */
export function listsParties(
  listed: unknown,
  holder: readonly string[],
  counterparty: string | null,
): boolean | null {
  // A list that names no key lists no one, whoever the parties are.
  if (!Array.isArray(listed) || listed.length === 0) return false;
  const known = counterparty === null ? holder : [...holder, counterparty];
  if (!known.every((key) => listed.includes(key))) return false;
  return holder.length > 0 && counterparty !== null ? true : null;
}
