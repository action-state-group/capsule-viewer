// SPDX-License-Identifier: Apache-2.0
// The History card's signature standing (capsule-viewer#211): the runtime's
// readerCardSignature on a card bundle a real capsulectl cut
// (tests/testdata/standard-history/witness/), and on the same bundle with its
// root record's signature tampered or removed.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVerifiedBundleContext } from "@action-state-group/agent-action-capsule";
import { describe, expect, it } from "vitest";
import { readerCardSignature } from "../src/card-signature.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(ROOT, "tests", "testdata", "standard-history", "witness");

type Json = Record<string, any>;
const bundle = (): Json =>
  JSON.parse(
    readFileSync(join(DATA, "person-shared-witnessed.bundle.json"), "utf8"),
  );
const rootRecord = (b: Json): Json =>
  b.records.find((r: Json) => r.capsule_id === b.root);
const check = async (b: Json) =>
  readerCardSignature(await buildVerifiedBundleContext(b));

describe("readerCardSignature", () => {
  it("passes a card signed under the key its record names, and names that key", async () => {
    const b = bundle();
    expect(await check(b)).toEqual({
      status: "PASS",
      key_id: rootRecord(b).key_id,
    });
  });

  it("fails a card whose signature does not verify", async () => {
    const b = bundle();
    const r = rootRecord(b);
    r.signature = (r.signature[0] === "0" ? "1" : "0") + r.signature.slice(1);
    expect(await check(b)).toEqual({ status: "FAIL", key_id: null });
  });

  it("fails a card signed under another key than the one its record names", async () => {
    const b = bundle();
    const r = rootRecord(b);
    r.key_id = (r.key_id[0] === "0" ? "1" : "0") + r.key_id.slice(1);
    expect(await check(b)).toEqual({ status: "FAIL", key_id: null });
  });

  it("says a card with no signature claims none", async () => {
    const b = bundle();
    const r = rootRecord(b);
    delete r.signature;
    delete r.key_id;
    expect(await check(b)).toEqual({ status: "NOT_PRESENT", key_id: null });
  });

  it("checks nothing it was not handed as a verified context", async () => {
    const context = await buildVerifiedBundleContext(bundle());
    expect(await readerCardSignature({ ...context })).toEqual({
      status: "NOT_CHECKED",
      key_id: null,
    });
    expect(await readerCardSignature(bundle())).toEqual({
      status: "NOT_CHECKED",
      key_id: null,
    });
  });
});
