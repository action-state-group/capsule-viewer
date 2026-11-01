// SPDX-License-Identifier: Apache-2.0
// A deal bundle's witness standing (capsule-viewer#214): the runtime's
// readerCadenceWitness on bundles a real capsulectl-deal wrote
// (tests/testdata/deal-witness/), held to the verdict capsule-cli's own
// cadenceClaim gave them (expected.json), and each link tampered to the
// finding capsule-cli names for it. The receipts are TEST-KEYED.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVerifiedBundleContext } from "@action-state-group/agent-action-capsule";
import { beforeEach, describe, expect, it } from "vitest";
import { readerCadenceWitness } from "../src/cadence-witness.js";
import { setReaderWitnessPolicy } from "../src/reader-witnesses.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(ROOT, "tests", "testdata", "deal-witness");
const EXPECTED = JSON.parse(
  readFileSync(join(DATA, "expected.json"), "utf8"),
) as {
  witness_spki_hex: string;
  go_witnesses: Record<
    string,
    { status: string; receipts: { registration_time: number }[] }
  >;
};
const READER_LIST = {
  witnesses: [{ name: "test witness", keys: [EXPECTED.witness_spki_hex] }],
};
// Another Ed25519 key, as hex DER SubjectPublicKeyInfo.
const OTHER_KEY = "302a300506032b6570032100" + "11".repeat(32);

type Json = Record<string, any>;
const bundleOf = (name: string): Json =>
  JSON.parse(readFileSync(join(DATA, `${name}.bundle.json`), "utf8"));
const chainIn = (bundle: Json): Json =>
  bundle.extensions["x-cadence-witness/v0"];
const check = async (bundle: Json) =>
  readerCadenceWitness(await buildVerifiedBundleContext(bundle));

// Flip one hex digit of a hash, keeping it hex.
const flipHex = (h: string) => (h[0] === "0" ? "1" : "0") + h.slice(1);
// Flip one byte in the middle of an unpadded base64url string's bytes.
const flipB64 = (s: string) => {
  const bytes = Buffer.from(s, "base64url");
  bytes[bytes.length >> 1]! ^= 0x01;
  return bytes.toString("base64url");
};

beforeEach(() => {
  setReaderWitnessPolicy(READER_LIST);
});

describe("readerCadenceWitness, with the reader's own witness list", () => {
  it.each(["cadence-all", "cadence-part"])(
    "passes %s as capsule-cli does, naming the reader's witness and the receipt's time",
    async (name) => {
      const go = EXPECTED.go_witnesses[name]!;
      expect(go.status).toBe("pass");
      expect(await check(bundleOf(name))).toEqual({
        status: "PASS",
        finding: null,
        witness: "test witness",
        witnessed_time: go.receipts[0]!.registration_time,
      });
    },
  );

  it("is witnessed in part for a deal with a step after its tick", () => {
    expect(chainIn(bundleOf("cadence-all")).extent).toBe("all");
    expect(chainIn(bundleOf("cadence-part")).extent).toBe("part");
  });

  it.each([
    ["cadence-witness/v0", false],
    ["x-deal-cadence-v0", true],
  ])(
    "reads the chain under %s, a name bundles carried it under before",
    async (name, dealLogId) => {
      const bundle = bundleOf("cadence-part");
      const chain = chainIn(bundle);
      delete bundle.extensions["x-cadence-witness/v0"];
      if (dealLogId) {
        chain.deal_log_id = chain.log_id;
        delete chain.log_id;
      }
      bundle.extensions[name] = chain;
      expect((await check(bundle)).status).toBe("PASS");
    },
  );

  it("with no list of the reader's (the default), checks no receipt", async () => {
    setReaderWitnessPolicy(null);
    expect(await check(bundleOf("cadence-all"))).toMatchObject({
      status: "NOT_CHECKED",
      finding: "no_reader_witness",
      witness: null,
    });
  });

  it("fails a receipt no key on the reader's list verifies, never trusting the bundle's witness", async () => {
    setReaderWitnessPolicy({
      witnesses: [{ name: "someone else", keys: [OTHER_KEY] }],
    });
    expect(await check(bundleOf("cadence-all"))).toMatchObject({
      status: "FAIL",
      finding: "receipt_not_verified",
      witness: null,
    });
  });

  it("checks only a context the runtime built, never a raw bundle", async () => {
    expect(await readerCadenceWitness(bundleOf("cadence-all"))).toMatchObject({
      status: "NOT_CHECKED",
      finding: "not_a_verified_context",
    });
  });

  it.each([
    ["no chain", (b: Json) => delete b.extensions["x-cadence-witness/v0"]],
    [
      "a chain that is not witnessed",
      (b: Json) =>
        (b.extensions["x-cadence-witness/v0"] = { state: "not_configured" }),
    ],
    ["no receipt", (b: Json) => (chainIn(b).cadence.witnesses = [])],
    [
      "receipts that are not a list, as capsule-cli reads them",
      (b: Json) => (chainIn(b).cadence.witnesses = {}),
    ],
  ])("with %s, is NOT_PRESENT", async (_why, edit) => {
    const bundle = bundleOf("cadence-all");
    edit(bundle);
    expect(await check(bundle)).toEqual({
      status: "NOT_PRESENT",
      finding: null,
      witness: null,
      witnessed_time: null,
    });
  });

  it("does not walk a chain from a bundle checkpoint that did not authenticate", async () => {
    const bundle = bundleOf("cadence-all");
    delete bundle.checkpoint.cose;
    expect(await check(bundle)).toMatchObject({
      status: "NOT_CHECKED",
      finding: "checkpoint_unverified",
    });
  });

  // Each link of capsule-cli's cadenceClaim, broken, with its finding.
  const tampered: [string, string, string, (c: Json) => void][] = [
    [
      "cadence-all",
      "a changed salt",
      "cadence_entry_not_included",
      (c) => (c.salt = c.salt + "0"),
    ],
    [
      "cadence-all",
      "another position",
      "cadence_entry_not_included",
      (c) => (c.index = c.index ^ 1),
    ],
    [
      "cadence-all",
      "a position past the tree",
      "cadence_leaf_malformed",
      (c) => (c.index = 65536),
    ],
    [
      "cadence-all",
      "an empty salt",
      "cadence_leaf_malformed",
      (c) => (c.salt = ""),
    ],
    [
      "cadence-all",
      "another size",
      "cadence_leaf_does_not_name_this_checkpoint",
      (c) => (c.size = c.size + 1),
    ],
    [
      "cadence-all",
      "another deal log",
      "cadence_leaf_does_not_name_this_checkpoint",
      (c) => (c.log_id = c.log_id + "x"),
    ],
    [
      "cadence-all",
      "a short path",
      "cadence_path_malformed",
      (c) => c.path.pop(),
    ],
    [
      "cadence-all",
      "a path hash that is not hex",
      "cadence_path_malformed",
      (c) => (c.path[3] = "zz".repeat(32)),
    ],
    [
      "cadence-all",
      "a changed path hash",
      "cadence_entry_not_included",
      (c) => (c.path[3] = flipHex(c.path[3])),
    ],
    [
      "cadence-all",
      "a cadence checkpoint that is not base64url",
      "cadence_checkpoint_malformed",
      (c) => (c.cadence.checkpoint.cose = "!"),
    ],
    [
      "cadence-all",
      "a changed cadence checkpoint",
      "cadence_checkpoint_signature_invalid",
      (c) => (c.cadence.checkpoint.cose = flipB64(c.cadence.checkpoint.cose)),
    ],
    [
      "cadence-all",
      "another cadence log id",
      "cadence_log_id_mismatch",
      (c) => (c.cadence.log_id = c.cadence.log_id + "x"),
    ],
    [
      "cadence-all",
      "another cadence entry",
      "cadence_entry_not_included",
      (c) => (c.cadence.entry_index = c.cadence.entry_index + 1),
    ],
    // The fixtures' cadence log holds one entry, so its proof is empty.
    [
      "cadence-all",
      "an inclusion proof with a hash too many",
      "cadence_entry_not_included",
      (c) => c.cadence.inclusion_proof.witness.push("00".repeat(32)),
    ],
    [
      "cadence-all",
      "an inclusion proof for another size",
      "cadence_entry_not_included",
      (c) => (c.cadence.inclusion_proof.size += 1),
    ],
    [
      "cadence-all",
      "a changed receipt",
      "receipt_not_verified",
      (c) =>
        (c.cadence.witnesses[0].receipt_b64 = Buffer.from(
          flipB64(
            Buffer.from(c.cadence.witnesses[0].receipt_b64, "base64").toString(
              "base64url",
            ),
          ),
          "base64url",
        ).toString("base64")),
    ],
    [
      "cadence-part",
      "a changed earlier checkpoint",
      "cadence_earlier_checkpoint_signature_invalid",
      (c) => (c.earlier.checkpoint.cose = flipB64(c.earlier.checkpoint.cose)),
    ],
    [
      "cadence-part",
      "an earlier checkpoint that is not base64url",
      "cadence_earlier_checkpoint_malformed",
      (c) => (c.earlier.checkpoint.cose = "!"),
    ],
    [
      "cadence-part",
      "a changed consistency proof",
      "cadence_earlier_checkpoint_not_a_prefix",
      (c) => {
        const p = c.earlier.consistency_proof;
        p.old_peaks[0] = flipHex(p.old_peaks[0]);
      },
    ],
  ];
  it.each(tampered)(
    "%s with %s fails: %s",
    async (name, _why, finding, edit) => {
      const bundle = bundleOf(name);
      edit(chainIn(bundle));
      expect(await check(bundle)).toEqual({
        status: "FAIL",
        finding,
        witness: null,
        witnessed_time: null,
      });
    },
  );

  it.each([
    ["not an object", () => "x"],
    ["missing tree_size", (r: Json) => (delete r.tree_size, r)],
    ["with an empty ts_url", (r: Json) => ({ ...r, ts_url: "" })],
    [
      "with receipt_b64 that is not canonical base64",
      (r: Json) => ({ ...r, receipt_b64: r.receipt_b64 + "=" }),
    ],
  ])(
    "fails the whole result for an entry %s beside a passing receipt, as capsule-cli does",
    async (_why, entry) => {
      const bundle = bundleOf("cadence-all");
      const list = chainIn(bundle).cadence.witnesses;
      list.push(entry(structuredClone(list[0])));
      expect(await check(bundle)).toMatchObject({
        status: "FAIL",
        finding: "receipt_malformed",
      });
    },
  );

  it("passes on the receipt the reader's list verifies, beside one it does not", async () => {
    const bundle = bundleOf("cadence-all");
    const list = chainIn(bundle).cadence.witnesses;
    const other = structuredClone(list[0]);
    other.receipt_b64 = Buffer.from(
      flipB64(Buffer.from(other.receipt_b64, "base64").toString("base64url")),
      "base64url",
    ).toString("base64");
    list.unshift(other);
    expect(await check(bundle)).toMatchObject({
      status: "PASS",
      witness: "test witness",
    });
  });

  it("does not check a stub receipt, which never reached a witness", async () => {
    const bundle = bundleOf("cadence-all");
    const list = chainIn(bundle).cadence.witnesses;
    list[0].is_stub = true;
    expect(await check(bundle)).toMatchObject({
      status: "NOT_CHECKED",
      finding: "receipt_not_checked",
    });
  });

  it("fails an earlier checkpoint that is the bundle's own: it is not earlier", async () => {
    const bundle = bundleOf("cadence-part");
    chainIn(bundle).earlier.checkpoint.cose = bundle.checkpoint.cose;
    expect(await check(bundle)).toMatchObject({
      status: "FAIL",
      finding: "cadence_earlier_checkpoint_not_this_deal",
    });
  });
});
