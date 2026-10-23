// SPDX-License-Identifier: BSD-3-Clause
import {
  computeCapsuleId,
  jsonDigest,
  sha256Hex,
} from "@action-state-group/agent-action-capsule";

type Obj = Record<string, unknown>;

/**
 * Adds an evidence-book `published_capsule` record to a Result fixture
 * (test/testdata/result-root-bundle.json shape, before sealing): its
 * disclosed header carries a capsule, whose bytes, envelope and (unless
 * `withOriginal` is false) agent_input original ride in
 * `evidencebook/payloads`, and the first claim cites the carried capsule by
 * its own id, so the record is reached through `bookRecordId`. Modelled on
 * agent-action-capsule ts/test/result-root.test.ts `carried`.
 *
 * Returns the alias of the book record (sealing gives it its id) and the
 * carried capsule's id.
 */
export async function withCarriedCapsule(
  source: Obj,
  original: unknown,
  options: { withOriginal?: boolean } = {},
): Promise<{ alias: string; carriedId: string }> {
  const enc = new TextEncoder();
  const b64url = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/u, "");
  const capsule: Obj = {
    action_id: "urn:tau2:airline:task-0:trial-0",
    action_type: "fyi",
    assurance: {
      attestation_mode: "self_attested",
      effect_mode: "not_applicable",
      ledger_mode: "standalone",
    },
    canonicalization_id: "jcs",
    developer: "test",
    format_version: "4",
    model_attestation: {
      compute_attestation: { agent_input_digest: await jsonDigest(original) },
    },
    operator: "test",
    spec_version: "draft-mih-scitt-agent-action-capsule-05",
    timestamp: "2025-06-05T16:06:22Z",
  };
  capsule.capsule_id = await computeCapsuleId(capsule as never);
  const parts = [
    enc.encode(JSON.stringify(capsule)),
    Uint8Array.from([0xd2, 0x84, 0x58, 0x4c]),
  ];
  if (options.withOriginal !== false)
    parts.push(enc.encode(JSON.stringify(original)));
  const payloads: Obj = {};
  const commitments: string[] = [];
  for (const bytes of parts) {
    const digest = await sha256Hex(bytes);
    commitments.push(digest);
    payloads[digest] = b64url(bytes);
  }
  const alias = "book-case";
  (source.records as Obj[]).push({ capsule_id: alias });
  (source.disclosures as Obj)[alias] = {
    agent_input: {
      v: 1,
      book_id: "sealed-fixture-log",
      record_type: "published_capsule",
      subject_ref: capsule.capsule_id,
      payload_commitments: commitments,
    },
  };
  source.extensions = {
    ...((source.extensions as Obj | undefined) ?? {}),
    "evidencebook/payloads": payloads,
  };
  const result = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
  const claim = (result.claims as Obj[])[0]!;
  (claim.evidence as Obj[]).push({
    digest_alg: "SHA-256",
    digest: capsule.capsule_id,
  });
  return { alias, carriedId: capsule.capsule_id as string };
}
