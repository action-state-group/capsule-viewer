// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// capsule-viewer#383: the npm receipt export checks a Lightning leg's proof
// itself (receiptModules passes paymentPreimageCheck to the core), so the
// buyer receipt's settlement line says "matches" or "did not match" on this
// path too, never "sealed" for want of a page runtime.
//
// No fixture carries a settled leg a receipt module accepts, so the legs are
// stubbed onto the verified context of a real fixture, as
// js-tests/receipt_settlement.test.js does. The preimage is synthetic.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildVerifiedBundleContext } from "@action-state-group/agent-action-capsule";
import { receiptModules } from "../src/receipt.js";

type Obj = Record<string, unknown>;
const PREIMAGE = "11".repeat(32);
const HASH = createHash("sha256")
  .update(Buffer.from(PREIMAGE, "hex"))
  .digest("hex");

const keep = (): unknown =>
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "..", "tests", "testdata", "receipt", "keep.bundle.json"),
      "utf8",
    ),
  );

// The keep copy's action record (290b1db4…) as one settled Lightning leg
// whose disclosed agent_input carries the preimage.
async function legContext(hash: string): Promise<unknown> {
  const context = (await buildVerifiedBundleContext(keep())) as unknown as Obj;
  const records = (context["records"] as Obj[]).map((r) =>
    String(r["capsule_id"]).startsWith("290b1db4")
      ? {
          ...r,
          settlement: {
            version: "0",
            leg: "payee_observed",
            sealer_role: "payee",
            payment_ref: { type: "ln.payment_hash", value: hash },
            received: { value: "2000", assetCode: "USD", assetScale: 2 },
            receive_fee: { value: "0", assetCode: "USD", assetScale: 2 },
            status: "settled",
          },
        }
      : r,
  );
  const resolved = new Map(context["resolvedDisclosures"] as Map<string, Obj>);
  for (const [id, entry] of resolved) {
    const input = entry["agent_input"] as Obj | undefined;
    if (!id.startsWith("290b1db4") || input?.["state"] !== "disclosed") continue;
    const payload = input["payload"] as Obj;
    resolved.set(id, {
      ...entry,
      agent_input: {
        state: "disclosed",
        payload: { ...payload, body: { ...(payload["body"] as Obj), preimage: PREIMAGE } },
      },
    });
  }
  return { ...context, records, resolvedDisclosures: resolved };
}

const unilateral = () =>
  receiptModules().find(
    (m) => m.manifest.id === "capsuleviewer.receipt.unilateral/v0",
  )!;

describe("the npm receipt export's settlement line (#383)", () => {
  it("checks the proof itself: matches", async () => {
    const model = (await unilateral().buildModel(
      (await legContext(HASH)) as never,
    )) as Obj;
    expect((model["settlement"] as Obj)["state"]).toBe("proof");
  });

  it("checks the proof itself: does not match", async () => {
    const model = (await unilateral().buildModel(
      (await legContext("22".repeat(32))) as never,
    )) as Obj;
    expect((model["settlement"] as Obj)["state"]).toBe("failed");
  });
});
