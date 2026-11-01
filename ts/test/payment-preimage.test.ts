// SPDX-License-Identifier: Apache-2.0
// A Lightning settlement's preimage against its payment hash
// (capsule-viewer#214; lightning-v0's `preimage` check). The preimages here
// are synthetic, like evidencebook#260's vectors: no real payment's.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paymentPreimageCheck } from "../src/payment-preimage.js";

const PREIMAGE = "5a".repeat(32);
const HASH = createHash("sha256")
  .update(Buffer.from(PREIMAGE, "hex"))
  .digest("hex");
const ln = (value: unknown) => ({ type: "ln.payment_hash", value });

describe("paymentPreimageCheck", () => {
  it("passes a preimage whose SHA-256 is the payment hash", async () => {
    expect(await paymentPreimageCheck(ln(HASH), PREIMAGE)).toBe("PASS");
  });

  it("reads the hex of either side in either case, as the adapter does", async () => {
    expect(
      await paymentPreimageCheck(
        ln(HASH.toUpperCase()),
        PREIMAGE.toUpperCase(),
      ),
    ).toBe("PASS");
  });

  it.each([
    ["hashes to another payment hash", "a5".repeat(32)],
    ["is short", "5a".repeat(31)],
    ["is long", "5a".repeat(33)],
    ["is an odd number of hex digits", "5a".repeat(31) + "5"],
    ["is not hex", "zz".repeat(32)],
    ["is empty", ""],
    ["is not a string", 42],
  ])("fails a preimage that %s", async (_why, preimage) => {
    expect(await paymentPreimageCheck(ln(HASH), preimage)).toBe("FAIL");
  });

  it("fails a payment hash that is not the preimage's", async () => {
    expect(await paymentPreimageCheck(ln("00".repeat(32)), PREIMAGE)).toBe(
      "FAIL",
    );
  });

  it.each([
    ["no preimage", ln(HASH), undefined],
    ["a null preimage", ln(HASH), null],
    ["no payment reference", undefined, PREIMAGE],
    ["no payment hash", ln(undefined), PREIMAGE],
    ["an empty payment hash", ln(""), PREIMAGE],
  ])("with %s, is NOT_PRESENT", async (_why, ref, preimage) => {
    expect(await paymentPreimageCheck(ref, preimage)).toBe("NOT_PRESENT");
  });

  it.each(["x402.transaction", "card.charge"])(
    "does not check a %s reference: that rail's finality is not a preimage",
    async (type) => {
      expect(await paymentPreimageCheck({ type, value: HASH }, PREIMAGE)).toBe(
        "NOT_CHECKED",
      );
    },
  );

  it("returns a status only, never the preimage", async () => {
    const out = await paymentPreimageCheck(ln("00".repeat(32)), PREIMAGE);
    expect(JSON.stringify(out)).not.toContain(PREIMAGE);
  });
});
