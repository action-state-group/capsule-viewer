// SPDX-License-Identifier: Apache-2.0
// The reader's own witness list: the witnesses this reader accepts, which the
// History card checks a snapshot's witness Receipt against (agent-action-
// capsule spec/standard-history-v0.md SH-4; capsule-viewer#183). It is the
// reader's, never the bundle's: nothing a bundle carries can add a witness to
// it. The default is a visible empty list, so a page that was never given a
// list checks no Receipt and says so. The reader changes it from the History
// card's checks section, or a host page sets it before the page renders; it
// lives in this page's memory only. It is never stored where another page
// could write it: a page that planted a witness there would make every later
// card it vouched for read as witnessed by someone the reader never accepted.
import {
  checkAnchorWitnessed,
  type AnchorWitnessPolicy,
} from "@action-state-group/agent-action-capsule/witness";

/** The default: no witness accepted. */
export const DEFAULT_READER_WITNESSES: AnchorWitnessPolicy = Object.freeze({
  witnesses: Object.freeze([]),
});

const HEX_DER = /^(?:[0-9a-f]{2})+$/u;

/**
 * The list `value` states, or undefined when it is not one: {witnesses:
 * [{name, keys}]} with a non-empty name and hex DER SubjectPublicKeyInfo keys.
 * Nothing is dropped silently: a list with any malformed entry is no list.
 */
export function parseReaderWitnesses(
  value: unknown,
): AnchorWitnessPolicy | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const list = (value as { witnesses?: unknown }).witnesses;
  if (Object.keys(value).length !== 1 || !Array.isArray(list)) return undefined;
  const witnesses: { name: string; keys: string[] }[] = [];
  for (const row of list as unknown[]) {
    if (typeof row !== "object" || row === null || Array.isArray(row))
      return undefined;
    const { name, keys, ...rest } = row as Record<string, unknown>;
    if (Object.keys(rest).length > 0) return undefined;
    if (typeof name !== "string" || name.trim() === "") return undefined;
    if (
      !Array.isArray(keys) ||
      keys.length === 0 ||
      !keys.every((k) => typeof k === "string" && HEX_DER.test(k))
    )
      return undefined;
    witnesses.push({ name, keys: [...(keys as string[])] });
  }
  return { witnesses };
}

let held: AnchorWitnessPolicy | undefined;

/** The reader's witness list: the one they set, else the visible default. */
export function readerWitnessPolicy(): AnchorWitnessPolicy {
  return held ?? DEFAULT_READER_WITNESSES;
}

/**
 * Set the reader's list, or with `null` go back to the default. Returns
 * false, and changes nothing, when `value` is not a list.
 */
export function setReaderWitnessPolicy(value: unknown): boolean {
  if (value === null) {
    held = undefined;
    return true;
  }
  const parsed = parseReaderWitnesses(value);
  if (parsed === undefined) return false;
  held = parsed;
  return true;
}

/** What {@link readerAnchorWitness} says about a block's snapshot. */
export interface ReaderAnchorWitness {
  /** The block's `as_of.checkpoint` against its anchor: `match`, `mismatch`
   * (the block is malformed), `not_carried`, or `unchecked` (it is carried
   * and this page has no SHA-256 to compare it with). */
  readonly checkpoint: "match" | "mismatch" | "not_carried" | "unchecked";
  /** AAC's anchor_witnessed over the Receipts under the reader's list
   * (`NOT_PRESENT` with none), and the witness and registration time of the
   * Receipt it names. */
  readonly status: "PASS" | "FAIL" | "NOT_PRESENT" | "NOT_CHECKED";
  readonly witness: string | null;
  readonly witnessed_time: number | null;
}

const fromHex = (hex: string): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i += 1)
    out[i] = Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
};

/**
 * The History card's witness standing, for a presentation module, which
 * verifies nothing itself: the block's `as_of.checkpoint` (lowercase hex of
 * the anchor's octets, whose SHA-256 is the anchor) and `as_of.receipts`
 * (lowercase hex, one Receipt each) for `anchor`, checked by AAC's
 * `checkAnchorWitnessed` under the reader's own list ({@link
 * readerWitnessPolicy}). Never throws; a check this page cannot run is
 * `NOT_CHECKED` or `unchecked`, never a pass.
 */
export async function readerAnchorWitness(
  anchor: string,
  checkpoint: string | null,
  receipts: readonly string[] | null,
): Promise<ReaderAnchorWitness> {
  let same: ReaderAnchorWitness["checkpoint"] = "not_carried";
  if (checkpoint !== null) {
    try {
      const digest = await globalThis.crypto.subtle.digest(
        "SHA-256",
        fromHex(checkpoint),
      );
      same =
        Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("") === anchor
          ? "match"
          : "mismatch";
    } catch {
      same = "unchecked";
    }
  }
  if (receipts === null || receipts.length === 0 || same === "mismatch") {
    return {
      checkpoint: same,
      status: receipts === null ? "NOT_PRESENT" : "NOT_CHECKED",
      witness: null,
      witnessed_time: null,
    };
  }
  const report = await checkAnchorWitnessed(
    anchor,
    receipts.map(fromHex),
    readerWitnessPolicy(),
  );
  return {
    checkpoint: same,
    status: report.status,
    witness: report.witness,
    witnessed_time: report.witnessed_time,
  };
}
