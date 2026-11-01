// SPDX-License-Identifier: Apache-2.0
// A deal bundle's witness standing (capsule-viewer#214), for a presentation
// module, which verifies nothing itself (presentation-contract-v0 section 3).
//
// A deal's own checkpoint is never sent to a witness. capsulectl seals it as a
// leaf of a fixed-depth tree whose root is one entry of a cadence log, and the
// cadence log's checkpoint is what the witness receipts are over; the bundle
// carries that chain as its `x-cadence-witness/v0` extension, a capsule-cli
// private kind (cli/deal_cadence.go). This walks the chain as capsule-cli's
// own verifier does (cli/deal_cadence_verify.go `cadenceClaim`), with the
// same findings, using the verifiers the page already carries: cll's
// checkpoint and MMR proofs, and agent-action-capsule's JCS and witness
// receipt check. The receipts are checked under the reader's own witness list
// (reader-witnesses.ts), never anything the bundle names, and aggregated as
// agent-action-capsule's checkAnchorWitnessed aggregates an anchor's.
import {
  isVerifiedBundleContext,
  jcs,
} from "@action-state-group/agent-action-capsule";
import {
  verifyReceipt,
  type SignedCheckpointFields,
} from "@action-state-group/agent-action-capsule/witness";
import {
  checkpointMetadata,
  rootFromPeaks,
  verifyConsistency,
  verifyHexInclusion,
} from "@action-state-group/cll";
import { readerWitnessPolicy } from "./reader-witnesses.js";

/** The extension's name, then the names bundles carried it under before (the
 * last of which names its log `deal_log_id`). */
const CADENCE_EXTENSIONS = [
  "x-cadence-witness/v0",
  "cadence-witness/v0",
  "x-deal-cadence-v0",
] as const;
/** Every path is 16 hashes: up to 65535 deals per tick. */
const CADENCE_DEPTH = 16;

/** What {@link readerCadenceWitness} says about a bundle's cadence chain. */
export interface ReaderCadenceWitness {
  /** `PASS` only when every link holds and a receipt verifies under a key of
   * the reader's list; `NOT_PRESENT` when the bundle claims no witnessed
   * chain, or its chain carries no receipt. */
  readonly status: "PASS" | "FAIL" | "NOT_PRESENT" | "NOT_CHECKED";
  /** Why it is not `PASS`: capsule-cli's finding for a broken link
   * (`cadence_*`, `checkpoint_unverified`), or for the receipts
   * (`receipt_not_verified`, `receipt_not_checked`, `no_reader_witness`);
   * `not_a_verified_context` for anything the runtime did not build, and
   * `check_unavailable` when this page could not run a step. Null on `PASS`
   * and `NOT_PRESENT`. */
  readonly finding: string | null;
  /** The reader's name for the witness of the receipt it names. */
  readonly witness: string | null;
  /** That receipt's registration time (a NumericDate), when it carries one. */
  readonly witnessed_time: number | null;
}

type Json = Record<string, unknown>;
type Outcome = Pick<ReaderCadenceWitness, "status" | "finding">;

const object = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const result = (
  status: ReaderCadenceWitness["status"],
  finding: string | null = null,
  witness: string | null = null,
  witnessed_time: number | null = null,
): ReaderCadenceWitness => ({ status, finding, witness, witnessed_time });

// Go's hex.DecodeString: digit pairs in either case.
const fromHex = (value: unknown): Uint8Array<ArrayBuffer> | undefined => {
  if (typeof value !== "string" || !/^(?:[0-9a-fA-F]{2})*$/u.test(value))
    return undefined;
  const out = new Uint8Array(new ArrayBuffer(value.length / 2));
  for (let i = 0; i < out.length; i += 1)
    out[i] = Number.parseInt(value.slice(2 * i, 2 * i + 2), 16);
  return out;
};
const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const hashList = (value: unknown): Uint8Array[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const out = value.map(fromHex);
  return out.every((h) => h !== undefined) ? (out as Uint8Array[]) : undefined;
};

// Unpadded base64url, as capsulectl writes a checkpoint's `cose`.
const fromBase64Url = (value: unknown): Uint8Array | undefined => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*$/u.test(value))
    return undefined;
  try {
    const binary = atob(value.replace(/-/gu, "+").replace(/_/gu, "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return undefined;
  }
};

// capsule-cli's JSONUint: a non-negative integer.
const uint = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

const sha256 = async (...parts: Uint8Array[]): Promise<Uint8Array> => {
  const joined = new Uint8Array(
    new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)),
  );
  let at = 0;
  for (const p of parts) {
    joined.set(p, at);
    at += p.length;
  }
  return new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", joined),
  );
};

// capsule-cli's CadenceLeaf and CadenceNode: leaves and nodes are
// domain-separated.
const cadenceLeaf = async (
  logId: string,
  size: number,
  checkpointSha256: string,
  salt: string,
): Promise<Uint8Array> =>
  sha256(
    Uint8Array.of(0),
    jcs({ checkpoint_sha256: checkpointSha256, log_id: logId, salt, size }),
  );
const cadenceRoot = async (
  leaf: Uint8Array,
  index: number,
  path: readonly Uint8Array[],
): Promise<Uint8Array> => {
  let h = leaf;
  for (let level = 0; level < path.length; level += 1)
    h =
      Math.floor(index / 2 ** level) % 2 === 0
        ? await sha256(Uint8Array.of(1), h, path[level]!)
        : await sha256(Uint8Array.of(1), path[level]!, h);
  return h;
};

// An inclusion proof as capsulectl writes it, checked as agent-action-capsule
// checks a record's (bundle.ts verifyProof): cll's verifier takes the path,
// then the peaks to the right bagged into one, then each peak to the left.
const included = async (
  root: Uint8Array,
  size: bigint,
  leafIndex: number,
  identity: string,
  raw: unknown,
): Promise<boolean> => {
  if (!object(raw) || raw.v !== 1 || raw.kind !== "inclusion") return false;
  const proofSize = uint(raw.size),
    proofIndex = uint(raw.leaf_index),
    witness = hashList(raw.witness),
    left = hashList(raw.peaks_left),
    right = hashList(raw.peaks_right);
  if (
    proofSize === undefined ||
    BigInt(proofSize) !== size ||
    proofIndex !== leafIndex ||
    !witness ||
    !left ||
    !right
  )
    return false;
  const flattened = [...witness];
  if (right.length) flattened.push(await rootFromPeaks(right));
  flattened.push(...left.toReversed());
  return verifyHexInclusion(root, size, BigInt(leafIndex), identity, flattened);
};

// A consistency proof as capsulectl writes it (capsule-cli parseConsistencyJSON).
const consistent = async (
  oldRoot: string,
  oldSize: bigint,
  newRoot: string,
  newSize: bigint,
  raw: unknown,
): Promise<boolean> => {
  if (!object(raw) || raw.v !== 1 || raw.kind !== "consistency") return false;
  const from = uint(raw.old_size),
    to = uint(raw.new_size),
    oldPeaks = hashList(raw.old_peaks),
    newPeaks = hashList(raw.new_peaks),
    steps = Array.isArray(raw.witness) ? raw.witness.map(hashList) : undefined,
    a = fromHex(oldRoot),
    b = fromHex(newRoot);
  if (
    from === undefined ||
    to === undefined ||
    BigInt(from) !== oldSize ||
    BigInt(to) !== newSize ||
    !oldPeaks ||
    !newPeaks ||
    !steps ||
    steps.some((s) => s === undefined) ||
    !a ||
    !b
  )
    return false;
  return verifyConsistency(a, b, {
    oldSize: oldSize,
    newSize: newSize,
    oldPeaks,
    witness: steps as Uint8Array[][],
    newPeaks,
  });
};

type Checkpoint = NonNullable<Awaited<ReturnType<typeof checkpointMetadata>>>;
const signedOf = (cp: Checkpoint): SignedCheckpointFields => ({
  log_id: cp.logId,
  mmr_size: Number(cp.size),
  root: cp.root,
  key_id: cp.keyId,
  timestamp: cp.timestamp,
  prev_size: Number(cp.previousSize),
  prev_root: cp.previousRoot,
});

/** The cadence chain a bundle carries, under its name or an earlier one. */
const chainOf = (bundle: unknown): Json | undefined => {
  const extensions = object(bundle) ? bundle.extensions : undefined;
  if (!object(extensions)) return undefined;
  for (const name of CADENCE_EXTENSIONS)
    if (object(extensions[name])) return extensions[name];
  return undefined;
};

/**
 * Every link of the chain but the receipts (capsule-cli `cadenceClaim`, in
 * its order and with its findings), or the cadence checkpoint the receipts
 * are over when every link holds.
 */
async function walk(
  chain: Json,
  dealCose: Uint8Array,
): Promise<Outcome | { cadence: Checkpoint; cose: Uint8Array; inner: Json }> {
  const fail = (finding: string): Outcome => ({ status: "FAIL", finding });
  let dealStatement = dealCose;
  let deal = await checkpointMetadata(dealStatement);
  if (deal === undefined) return fail("cadence_deal_checkpoint_malformed");
  // Witnessed in part: the leaf holds an earlier checkpoint of this deal,
  // signed by the same key, which the bundle's checkpoint extends.
  if (chain.extent === "part") {
    const earlier = object(chain.earlier) ? chain.earlier : {};
    const cp = object(earlier.checkpoint) ? earlier.checkpoint : {};
    const statement = fromBase64Url(cp.cose);
    if (statement === undefined)
      return fail("cadence_earlier_checkpoint_malformed");
    const prior = await checkpointMetadata(statement);
    if (prior === undefined)
      return fail("cadence_earlier_checkpoint_signature_invalid");
    if (
      prior.keyId !== deal.keyId ||
      prior.logId !== deal.logId ||
      prior.size >= deal.size
    )
      return fail("cadence_earlier_checkpoint_not_this_deal");
    if (
      !(await consistent(
        prior.root,
        prior.size,
        deal.root,
        deal.size,
        earlier.consistency_proof,
      ))
    )
      return fail("cadence_earlier_checkpoint_not_a_prefix");
    dealStatement = statement;
    deal = prior;
  }
  let logId = typeof chain.log_id === "string" ? chain.log_id : "";
  if (logId === "" && typeof chain.deal_log_id === "string")
    logId = chain.deal_log_id;
  const salt = typeof chain.salt === "string" ? chain.salt : "";
  const size = uint(chain.size),
    index = uint(chain.index);
  if (logId !== deal.logId || size === undefined || BigInt(size) !== deal.size)
    return fail("cadence_leaf_does_not_name_this_checkpoint");
  if (index === undefined || index >= 2 ** CADENCE_DEPTH || salt === "")
    return fail("cadence_leaf_malformed");
  const path = hashList(chain.path);
  if (
    !path ||
    path.length !== CADENCE_DEPTH ||
    path.some((h) => h.length !== 32)
  )
    return fail("cadence_path_malformed");
  const leaf = await cadenceLeaf(
    logId,
    size,
    toHex(await sha256(dealStatement)),
    salt,
  );
  const root = await cadenceRoot(leaf, index, path);

  const inner = object(chain.cadence) ? chain.cadence : {};
  const cp = object(inner.checkpoint) ? inner.checkpoint : {};
  const cose = fromBase64Url(cp.cose);
  if (cose === undefined) return fail("cadence_checkpoint_malformed");
  const cadence = await checkpointMetadata(cose);
  if (cadence === undefined)
    return fail("cadence_checkpoint_signature_invalid");
  if (cadence.keyId !== deal.keyId)
    return fail("cadence_checkpoint_signer_differs");
  if (inner.log_id !== cadence.logId) return fail("cadence_log_id_mismatch");
  const entry = uint(inner.entry_index);
  const cadenceRootBytes = fromHex(cadence.root);
  if (
    entry === undefined ||
    !cadenceRootBytes ||
    !(await included(
      cadenceRootBytes,
      cadence.size,
      entry,
      toHex(root),
      inner.inclusion_proof,
    ))
  )
    return fail("cadence_entry_not_included");
  return { cadence, cose, inner };
}

/**
 * The cadence checkpoint's receipts under the reader's own witness list: each
 * receipt passes under the first key that verifies it, and the result is
 * checkAnchorWitnessed's aggregate (any pass, else any fail, else not
 * checked), naming the passing receipt with the earliest registration time.
 */
async function receipts(
  entries: unknown,
  signed: SignedCheckpointFields,
  cose: Uint8Array,
): Promise<ReaderCadenceWitness> {
  // capsule-cli reads receipts that are not a list as none.
  if (!Array.isArray(entries) || entries.length === 0)
    return result("NOT_PRESENT");
  const keys = readerWitnessPolicy().witnesses.flatMap(({ name, keys }) =>
    keys.map((key) => ({ name, key: fromHex(key)! })),
  );
  if (keys.length === 0) return result("NOT_CHECKED", "no_reader_witness");
  let failed = false;
  let chosen: { name: string; time: number | null } | undefined;
  for (const entry of entries) {
    if (!object(entry)) {
      failed = true;
      continue;
    }
    let passed: { name: string; time: number | null } | undefined;
    let unavailable = false;
    for (const { name, key } of keys) {
      const outcome = await verifyReceipt(signed, entry, key, cose);
      if (outcome.ok) {
        passed = { name, time: outcome.registrationTime };
        break;
      }
      if (outcome.notChecked) unavailable = true;
    }
    if (passed === undefined) {
      if (!unavailable) failed = true;
      continue;
    }
    if (
      chosen === undefined ||
      (passed.time !== null &&
        (chosen.time === null || passed.time < chosen.time))
    )
      chosen = passed;
  }
  if (chosen !== undefined)
    return result("PASS", null, chosen.name, chosen.time);
  if (failed) return result("FAIL", "receipt_not_verified");
  return result("NOT_CHECKED", "receipt_not_checked");
}

/**
 * The deal's witness standing, from a context this runtime built
 * (`buildVerifiedBundleContext`): its `x-cadence-witness/v0` chain walked from
 * the bundle's own checkpoint, which must have authenticated in the
 * context's strict checks, to the witnessed cadence checkpoint, whose
 * receipts are checked under the reader's own witness list ({@link
 * readerWitnessPolicy}). Never throws; a check this page cannot run is
 * `NOT_CHECKED`, never a pass.
 */
export async function readerCadenceWitness(
  context: unknown,
): Promise<ReaderCadenceWitness> {
  if (!isVerifiedBundleContext(context))
    return result("NOT_CHECKED", "not_a_verified_context");
  const chain = chainOf(context.bundle);
  if (chain === undefined || chain.state !== "witnessed")
    return result("NOT_PRESENT");
  if (context.strict?.checkpointAuthenticated !== true)
    return result("NOT_CHECKED", "checkpoint_unverified");
  try {
    const stated = (context.bundle as Json).checkpoint as Json;
    const dealCose = fromBase64Url(stated.cose);
    if (dealCose === undefined)
      return result("NOT_CHECKED", "checkpoint_unverified");
    const walked = await walk(chain, dealCose);
    if (!("cadence" in walked)) return result(walked.status, walked.finding);
    return await receipts(
      walked.inner.witnesses,
      signedOf(walked.cadence),
      walked.cose,
    );
  } catch {
    return result("NOT_CHECKED", "check_unavailable");
  }
}
