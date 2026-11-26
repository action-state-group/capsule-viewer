// SPDX-License-Identifier: Apache-2.0
// Writes tests/testdata/deal-v0-report/: capsulectl's verify report of an
// x-deal-v0 copy with the two members capsule-viewer#383 (CV3b) defines,
// `witnessed` and `countersign`, added to what capsulectl printed for that
// copy (tests/testdata/receipt/<name>.verify.json), and one keep copy
// carrying three countersign/v1 entries signed with generated TEST-ONLY keys.
// See tests/testdata/deal-v0-report/README.md for what each file is.
//
// Run from ts/:
//   node scripts/cut-deal-v0-report-fixtures.mjs
// The output is deterministic: fixed seeds, fixed times.
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  countersignV1SigningInput,
  jcs,
  sha256Hex,
} from "@action-state-group/agent-action-capsule";

const root = resolve(process.cwd(), "..");
const receipt = resolve(root, "tests", "testdata", "receipt");
const out = resolve(root, "tests", "testdata", "deal-v0-report");
mkdirSync(out, { recursive: true });
const read = (name) => JSON.parse(readFileSync(resolve(receipt, name), "utf8"));
const write = (name, value) =>
  writeFileSync(resolve(out, name), JSON.stringify(value, null, 2) + "\n");

// An Ed25519 key from a 32-byte seed (PKCS#8 with the RFC 8410 prefix), and
// its key id: the 32-byte public key (the end of its SPKI encoding), in hex.
const PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
function key(seedHex) {
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8, Buffer.from(seedHex, "hex")]),
    format: "der",
    type: "pkcs8",
  });
  const spki = createPublicKey(privateKey).export({
    format: "der",
    type: "spki",
  });
  return { privateKey, keyId: spki.subarray(spki.length - 32).toString("hex") };
}

// Three test countersigners: one the README's directory lists, one standing
// for the producer's own key (a profile's trusted key), one listed nowhere.
const LISTED = key("11".repeat(32));
const SELF = key("22".repeat(32));
const UNLISTED = key("33".repeat(32));

function entry(signer, id, digest, checks) {
  const body = {
    over: digest,
    signer: { id, key_id: signer.keyId },
    statement: {
      checks,
      recomputed_at: "2026-11-20T00:00:00Z",
      scope: { deal: "example" },
    },
    type: "countersign/v1",
  };
  const signature = sign(
    null,
    countersignV1SigningInput(body),
    signer.privateKey,
  ).toString("hex");
  return { ...body, signature };
}

const WITNESSED = {
  status: "verified",
  witness: "witness.example",
  at: "2026-10-27T22:10:00Z",
};
const entryOf = (report) =>
  report.extensions.find((e) => e.kind === "x-deal-v0");

// The plain copies: capsulectl's report, plus `witnessed` (deal verify --stamp-proof).
for (const name of [
  "main-standalone-keep",
  "main-standalone-counterparty",
  "mesh-payer-selected",
  "seller-keep",
]) {
  const report = read(`${name}.verify.json`);
  entryOf(report).witnessed = WITNESSED;
  write(`${name}.verify.json`, report);
}

// The countersigned keep copy: main-standalone-keep with three entries.
const bundle = read("main-standalone-keep.bundle.json");
const report = read("main-standalone-keep.verify.json");
const digest = report.bundle_digest;
bundle.countersignatures = [
  entry(LISTED, "did:web:countersign.example", digest, [
    { name: "chain consistency", result: "established" },
  ]),
  entry(SELF, "did:web:producer.example", digest, []),
  entry(UNLISTED, "did:web:unknown.example", digest, []),
];
write("countersigned-keep.bundle.json", bundle);
const deal = entryOf(report);
deal.witnessed = WITNESSED;
// capsule-cli's CountersignatureReport for each, as VerifyCountersignatures
// returns them against countersigners.json with SELF's key trusted as the
// producer's.
deal.countersign = {
  directory: "countersigners.json",
  countersignatures_sha256: await sha256Hex(jcs(bundle.countersignatures)),
  entries: [
    {
      state: "resolved",
      receipt: "absent",
      signer: { id: "did:web:countersign.example", key_id: LISTED.keyId },
      independent: true,
      signer_name: "Example Countersigners Ltd",
      checks: [{ name: "chain consistency", result: "established" }],
      recomputed_at: "2026-11-20T00:00:00Z",
    },
    {
      state: "not_independent",
      receipt: "absent",
      signer: { id: "did:web:producer.example", key_id: SELF.keyId },
      independent: false,
      recomputed_at: "2026-11-20T00:00:00Z",
    },
    {
      state: "unresolved_signer",
      receipt: "absent",
      signer: { id: "did:web:unknown.example", key_id: UNLISTED.keyId },
      independent: true,
      recomputed_at: "2026-11-20T00:00:00Z",
    },
  ],
};
write("countersigned-keep.verify.json", report);
write("countersigners.json", [
  { name: "Example Countersigners Ltd", key_ids: [LISTED.keyId] },
]);
