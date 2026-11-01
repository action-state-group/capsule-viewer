// SPDX-License-Identifier: Apache-2.0
// A Lightning settlement's finality by its preimage (capsule-viewer#214), for
// a presentation module, which hashes nothing itself (presentation-contract-v0
// section 3). It is lightning-v0's `preimage` check (Mesh-LLM/capsules-plugin
// adapters/lightning-v0.md; crates/evidence-plugin/src/settlement_adapter.rs
// `preimage_check`): the preimage is 32 bytes of hex, in either case, and its
// SHA-256 equals the payment hash, compared without regard to case. A pass is
// that adapter's finality method `preimage_verified`. The result is a status
// only: it never carries the preimage, which is bearer proof of payment.

/** What {@link paymentPreimageCheck} says about one settlement leg. */
export type PaymentPreimageStatus =
  | "PASS"
  | "FAIL"
  | "NOT_PRESENT"
  | "NOT_CHECKED";

const PREIMAGE = /^[0-9a-fA-F]{64}$/u;

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * `PASS` when `paymentRef` (a settlement leg's `payment_ref`) is an
 * `ln.payment_hash` and SHA-256 of `preimage`'s 32 octets is its `value`;
 * `FAIL` when `preimage` is not 32 bytes of hex or hashes to anything else;
 * `NOT_PRESENT` with no preimage (or one that is not a string) or no payment
 * hash; `NOT_CHECKED` for a
 * reference of another rail, which has no preimage, or on a page with no
 * SHA-256. Never throws.
 */
export async function paymentPreimageCheck(
  paymentRef: unknown,
  preimage: unknown,
): Promise<PaymentPreimageStatus> {
  if (object(paymentRef) && paymentRef.type !== "ln.payment_hash")
    return "NOT_CHECKED";
  // The adapter reads the preimage as a string (serde `as_str`): anything
  // else is no preimage.
  if (typeof preimage !== "string") return "NOT_PRESENT";
  const hash = object(paymentRef) ? paymentRef.value : undefined;
  if (typeof hash !== "string" || hash === "") return "NOT_PRESENT";
  if (!PREIMAGE.test(preimage)) return "FAIL";
  const octets = new Uint8Array(new ArrayBuffer(32));
  for (let i = 0; i < 32; i += 1)
    octets[i] = Number.parseInt(preimage.slice(2 * i, 2 * i + 2), 16);
  let digest: ArrayBuffer;
  try {
    digest = await globalThis.crypto.subtle.digest("SHA-256", octets);
  } catch {
    return "NOT_CHECKED";
  }
  const hex = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return hex === hash.toLowerCase() ? "PASS" : "FAIL";
}
