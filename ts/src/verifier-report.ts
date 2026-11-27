// SPDX-License-Identifier: Apache-2.0

/**
 * capsulectl's own verify report for an x-deal-v1 copy, carried into a page
 * (capsule-viewer#405 route 1). A page cannot run the x-deal-v1 report rule
 * (`xdealv1.VerifyReportBundle`) itself, so it shows what the one Go
 * verifier, `capsulectl deal verify --bundle`, reported for this very bundle,
 * and says so: the receipt's line is `summary.standalone` ("capsulectl verify
 * reported its signature check as: pass. This page did not check the
 * signature itself."). The page decides nothing itself, and claims no check
 * it did not run.
 *
 * The report is read only for the bundle it was made for, by the rules the
 * Python twin applies (`capsule_viewer.verifier_report.context_from_capsulectl`):
 * its `spec_version` is capsulectl's result format, its `bundle_digest` is
 * this bundle's, and its record identities name exactly this bundle's
 * records. A report for another bundle, or none, gives no answer, so the
 * receipt draws the can't-check line (#407).
 */

import {
  bundleVerified,
  declaredProducerKeys,
  jcs,
  sha256Hex,
  type VerifiedBundleContext,
} from "@action-state-group/agent-action-capsule";
import {
  counterpartyKey,
  listsParties,
  type CountersignedCopyStamp,
} from "./countersigned-copy.js";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});

/** capsulectl's result format (`capsule-cli-result/v1`), as the Python twin reads it. */
export const VERIFIER_REPORT_VERSION = "capsule-cli-result/v1";
const DEAL_V0 = "x-deal-v0";
const DEAL_V1 = "x-deal-v1";
const STANDALONE = "x-deal-report/v0";

/**
 * The countersignature states capsulectl reports (capsule-cli
 * `VerifyCountersignatures`, `cli/countersign.go`) that a page may show as
 * capsulectl's finding. `invalid` is not among them: capsulectl refuses to
 * show a countersignature that does not verify, and so does the page.
 */
const COUNTERSIGN_STATES = new Set([
  "resolved",
  "not_independent",
  "unresolved_signer",
  "unverified",
]);

/**
 * One countersignature as capsulectl verify reported it on an x-deal-v0 copy,
 * read from capsule-cli's `CountersignatureReport` (state, signer.key_id,
 * signer_name, receipt, checks): strings only.
 */
export interface ReportedCountersignature {
  readonly state: string;
  readonly key_id: string;
  readonly signer_name?: string;
  /** Its log signature: verified, absent or unverified. */
  readonly receipt?: string;
  /** The countersigner's own results, as it stated them. */
  readonly checks?: readonly {
    readonly name: string;
    readonly result: string;
  }[];
}

/** capsulectl's countersign rung of an x-deal-v0 copy: the directory it resolved signers in, and each entry. */
export interface ReportedCountersign {
  readonly directory: string;
  readonly entries: readonly ReportedCountersignature[];
}

/**
 * What capsulectl reported of this bundle's x-deal-v1 standalone report:
 *  - `pass`: the x-deal-v1 entry passed, with the report standalone, and the
 *    bundle's verdict is VALID, or INCOMPLETE only as a producer selection;
 *  - `fail` with `report`: the entry did not pass (Sherlock2's first line);
 *  - `fail` with `verdict`: the entry passed but capsulectl's verdict for the
 *    bundle is not VALID, for a reason that is not the report; the page says
 *    the verdict, never that the report failed (Sherlock2's second line);
 *  - null: the bundle is not an x-deal-v1 copy with a standalone report, or
 *    the report is not this bundle's, or names no standalone x-deal-v1 entry.
 * A report is never read for any other bundle (Codex, #417).
 */
export type VerifierReading =
  | {
      readonly kind: "pass";
      /** capsulectl's status for the copy's counterparty half, when it reported one. */
      readonly counterpartyHalf?: string;
      /** capsulectl's report of the holder's own book's witness time (verify --stamp-proof), as given. */
      readonly witnessed?: unknown;
      /**
       * capsulectl's own result for each bundle check it names (REPORTED_CHECKS),
       * status and findings as strings only, so the receipt's proof panel says
       * capsulectl's answer and never the page's own (#382).
       */
      readonly checks?: Readonly<Record<string, ReportedCheck>>;
      /** capsulectl's verdict for the bundle: VALID, or INCOMPLETE for a producer selection. */
      readonly verdict?: string;
      /** The deal profile the report was read for: x-deal-v1 (the default), or x-deal-v0. */
      readonly profile?: typeof DEAL_V0;
      /** capsulectl's countersign rung of an x-deal-v0 copy, bound to this copy's countersignatures. */
      readonly countersign?: ReportedCountersign;
    }
  | { readonly kind: "fail"; readonly why: "report" }
  /** An x-deal-v0 copy: capsulectl's x-deal-v0 entry did not pass. */
  | { readonly kind: "fail"; readonly why: "deal" }
  /** An x-deal-v0 copy: capsulectl reported a countersignature that does not verify. */
  | { readonly kind: "fail"; readonly why: "countersign" }
  | {
      readonly kind: "fail";
      readonly why: "verdict";
      readonly verdict: string;
    };

/**
 * One countersignature as the page classified it, for the receipt's
 * COUNTERSIGNED stamp: its kind (hollow, unverified, invalid,
 * not-independent, unresolved-signer, resolved), and for a resolved one the
 * signer's name and the time it says it recomputed, by its own clock.
 */
export interface CountersignedStamp {
  readonly kind: string;
  readonly name?: string;
  readonly at?: string;
}

/** The receipt's view of AAC's countersignature stamps: strings only. */
export function countersignedStamps(
  stamps: readonly unknown[],
): CountersignedStamp[] {
  return stamps.map((raw) => {
    const s = obj(raw);
    const kind = typeof s["kind"] === "string" ? s["kind"] : "unknown";
    const name = s["name"];
    const at = obj(s["statement"])["recomputedAt"];
    return {
      kind,
      ...(kind === "resolved" && typeof name === "string" ? { name } : {}),
      ...(kind === "resolved" && typeof at === "string" ? { at } : {}),
    };
  });
}

/** One of capsulectl's bundle checks, as its report states it. */
export interface ReportedCheck {
  readonly status: string;
  readonly findings: readonly string[];
}

/**
 * The bundle checks of capsulectl's report the receipt's proof panel shows,
 * in its order (#382): producer signatures, interval coverage, graph closure,
 * per-record membership, the checkpoint and the witnesses.
 */
export const REPORTED_CHECKS = [
  "producer_signatures",
  "interval_coverage",
  "graph_closure",
  "per_record_membership",
  "checkpoint",
  "witnesses",
] as const;

/** Each check of REPORTED_CHECKS the report states with a string status. */
function reportedChecks(r: Obj): Record<string, ReportedCheck> {
  const out: Record<string, ReportedCheck> = {};
  for (const name of REPORTED_CHECKS) {
    const c = obj(r[name]);
    if (typeof c["status"] !== "string") continue;
    const findings = Array.isArray(c["findings"])
      ? c["findings"].filter((f): f is string => typeof f === "string")
      : [];
    out[name] = { status: c["status"], findings };
  }
  return out;
}

export async function verifierReportReading(
  context: VerifiedBundleContext,
  given: unknown,
): Promise<VerifierReading | null> {
  // The report as capsulectl prints it (JSON text) or already parsed.
  let report = given;
  if (typeof given === "string")
    try {
      report = JSON.parse(given);
    } catch {
      return null;
    }
  const extensionsOf = obj(obj(context.bundle)["extensions"]);
  const v1 = DEAL_V1 in extensionsOf;
  // An x-deal-v1 copy is read only with its standalone report; an x-deal-v0
  // copy in any report form (a Mesh copy seals its report in the log).
  if (v1 ? !(STANDALONE in extensionsOf) : !(DEAL_V0 in extensionsOf))
    return null;
  const r = obj(report);
  if (!boundToBundle(context, r)) return null;
  const extensions = Array.isArray(r["extensions"]) ? r["extensions"] : [];
  if (!v1) return dealV0Reading(context, r, extensions.map(obj));
  const entry = extensions
    .map(obj)
    .find((e) => e["kind"] === DEAL_V1 && e["report"] === "standalone");
  if (entry === undefined) return null;
  if (entry["status"] !== "pass") return { kind: "fail", why: "report" };
  const halfStatus = obj(entry["counterparty_half"])["status"];
  const pass: VerifierReading = {
    kind: "pass",
    ...(typeof halfStatus === "string" ? { counterpartyHalf: halfStatus } : {}),
    ...(isObj(entry["witnessed"])
      ? { witnessed: witnessedOf(context, entry["witnessed"]) }
      : {}),
    checks: reportedChecks(r),
    ...(typeof r["verdict"] === "string" ? { verdict: r["verdict"] } : {}),
  };
  return withVerdict(r, pass);
}

/**
 * Whether the report is capsulectl's for this very bundle: its result
 * format, this bundle's digest, and record identities naming exactly this
 * bundle's records (the Python twin's rules).
 */
function boundToBundle(context: VerifiedBundleContext, r: Obj): boolean {
  if (r["spec_version"] !== VERIFIER_REPORT_VERSION) return false;
  const digest = context.verification.bundleDigest;
  if (typeof digest !== "string" || r["bundle_digest"] !== digest) return false;
  const identity = r["record_identity"];
  const records = Array.isArray(obj(context.bundle)["records"])
    ? (obj(context.bundle)["records"] as unknown[])
    : [];
  const ids = new Set(
    records
      .map((x) => obj(x)["capsule_id"])
      .filter((id): id is string => typeof id === "string"),
  );
  return (
    isObj(identity) &&
    Object.keys(identity).length === ids.size &&
    Object.keys(identity).every((id) => ids.has(id))
  );
}

/**
 * capsulectl's verdict over a passing deal entry: the pass, when the verdict
 * is VALID or INCOMPLETE only as a producer selection; otherwise a fail that
 * says the verdict, never that the deal entry failed.
 */
function withVerdict(
  r: Obj,
  pass: VerifierReading & { kind: "pass" },
): VerifierReading {
  const verdict = r["verdict"];
  if (verdict === "VALID") return pass;
  // A producer selection: capsulectl calls it INCOMPLETE only because the
  // interval coverage is withheld as selection_not_checkable, as the Python
  // twin reads it (verifier_report.py) and the page's own verdict allows it.
  // Its report passed, so the receipt draws, with the page's incomplete
  // outcome; it is never refused for that.
  const coverage = obj(r["interval_coverage"]);
  const findings = coverage["findings"];
  if (
    verdict === "INCOMPLETE" &&
    coverage["status"] === "withheld" &&
    Array.isArray(findings) &&
    findings.length === 1 &&
    findings[0] === "selection_not_checkable" &&
    [
      "graph_closure",
      "per_record_membership",
      "checkpoint",
      "producer_signatures",
    ].every((claim) => obj(r[claim])["status"] === "pass")
  )
    return pass;
  return {
    kind: "fail",
    why: "verdict",
    verdict:
      typeof verdict === "string" && verdict !== "" ? verdict : "not valid",
  };
}

/**
 * capsulectl's `witnessed` member with the page's own reading of the witness
 * row it reported (capsule-viewer#508, the reading contract of ops u652): when
 * the member carries `independent_of`, the directory row's list as the
 * reader's witness directory states it, the page decides, as for the
 * countersigned copy (#457), whether that list names both parties
 * (listsParties). The holder's keys are the producer key the copy declares
 * and, when the copy verifies, the keys its records are signed with (a fresh
 * copy declares none; the key a capsulectl copy declares is its records'
 * signing key). The counterparty's is the key the holder's sealed x-deal-v1
 * agreement names; an x-deal-v0 copy names none. `independent` is the
 * answer, left out when the member carries no list or the page cannot tell,
 * so the witness line then says nothing about independence. A member
 * capsulectl sent under that name is never taken as the page's answer.
 */
function witnessedOf(context: VerifiedBundleContext, given: Obj): Obj {
  const { independent: _sent, ...witnessed } = given;
  const listed = witnessed["independent_of"];
  if (!Array.isArray(listed) || !listed.every((key) => typeof key === "string"))
    return witnessed;
  const independent = listsParties(
    listed,
    holderKeys(context),
    counterpartyKey(context.bundle),
  );
  return independent === null ? witnessed : { ...witnessed, independent };
}

function holderKeys(context: VerifiedBundleContext): string[] {
  const keys = new Set(declaredProducerKeys(context.bundle));
  if (bundleVerified(context.verification)) {
    const records = obj(context.bundle)["records"];
    for (const record of Array.isArray(records) ? records : []) {
      const key = obj(record)["key_id"];
      if (typeof key === "string" && /^[0-9a-f]{64}$/u.test(key)) keys.add(key);
    }
  }
  return [...keys];
}

/**
 * capsulectl's report of an x-deal-v0 copy (capsule-viewer#383, CV3b): its
 * one x-deal-v0 entry, and on a pass the two members only capsulectl can
 * check:
 *  - `witnessed`, the holder's own book's witness time (verify --stamp-proof),
 *    in the shape x-deal-v1 reports it;
 *  - `countersign`, the countersign rung resolved against the directory
 *    capsulectl was given: `{directory, countersignatures_sha256, entries}`,
 *    each entry capsule-cli's CountersignatureReport as printed.
 * In this order: an entry that did not pass refuses the copy; the
 * countersign member is bound to this copy (the SHA-256 of the JCS of its
 * whole countersignatures array, which the bundle digest does not cover, and
 * one entry per countersignature, signer key ids in order), and an unbound
 * one is ignored; a bound entry in state `invalid` refuses the copy, as
 * capsulectl refuses to show it; only then are the display members read,
 * and a malformed one draws nothing (the page keeps its own line).
 */
async function dealV0Reading(
  context: VerifiedBundleContext,
  r: Obj,
  extensions: readonly Obj[],
): Promise<VerifierReading | null> {
  const entries = extensions.filter((e) => e["kind"] === DEAL_V0);
  if (entries.length !== 1) return null;
  const entry = entries[0]!;
  if (entry["status"] === "fail") return { kind: "fail", why: "deal" };
  if (entry["status"] !== "pass") return null;
  const bound = await boundCountersign(context, entry["countersign"]);
  if (bound?.some((e) => e["state"] === "invalid"))
    return { kind: "fail", why: "countersign" };
  const countersign = bound === null ? null : reportedCountersign(bound, entry);
  return withVerdict(r, {
    kind: "pass",
    profile: DEAL_V0,
    ...(isObj(entry["witnessed"])
      ? { witnessed: witnessedOf(context, entry["witnessed"]) }
      : {}),
    ...(countersign === null ? {} : { countersign }),
    ...(typeof r["verdict"] === "string" ? { verdict: r["verdict"] } : {}),
  });
}

/**
 * The countersign member's entries when it is bound to this copy's
 * countersignatures, else null: its `countersignatures_sha256` is the
 * lowercase hex SHA-256 of the JCS of the copy's whole countersignatures
 * array, and it has one entry per countersignature whose signer key id is
 * that countersignature's, in order.
 */
async function boundCountersign(
  context: VerifiedBundleContext,
  given: unknown,
): Promise<Obj[] | null> {
  const raw = obj(given);
  const list = raw["entries"];
  const carried = obj(context.bundle)["countersignatures"];
  if (!Array.isArray(list) || !Array.isArray(carried) || carried.length === 0)
    return null;
  if (list.length !== carried.length) return null;
  let digest: string;
  try {
    digest = await sha256Hex(jcs(carried));
  } catch {
    return null;
  }
  if (raw["countersignatures_sha256"] !== digest) return null;
  const entries = list.map(obj);
  const signed = carried.map((c) => obj(obj(c)["signer"])["key_id"]);
  return entries.every((e, i) => {
    const id = obj(e["signer"])["key_id"];
    return typeof id === "string" && id !== "" && id === signed[i];
  })
    ? entries
    : null;
}

/**
 * capsulectl's countersign rung from its bound entries, or null when any
 * display member is malformed: the page then keeps its own line.
 */
function reportedCountersign(
  bound: readonly Obj[],
  entry: Obj,
): ReportedCountersign | null {
  const directory = obj(entry["countersign"])["directory"];
  if (typeof directory !== "string" || directory === "") return null;
  const entries: ReportedCountersignature[] = [];
  for (const e of bound) {
    const state = e["state"];
    if (typeof state !== "string" || !COUNTERSIGN_STATES.has(state))
      return null;
    const name = e["signer_name"];
    // A resolved signer is named; any other state names none.
    if (state === "resolved" && (typeof name !== "string" || name === ""))
      return null;
    // Every display member present must be well formed: a malformed one
    // drops the whole member, so the page keeps its own line.
    const receipt = e["receipt"];
    if (
      receipt !== undefined &&
      (typeof receipt !== "string" ||
        !["verified", "absent", "unverified"].includes(receipt))
    )
      return null;
    const given = e["checks"];
    if (given !== undefined && !Array.isArray(given)) return null;
    const checks: { name: string; result: string }[] = [];
    for (const c of (given ?? []) as unknown[]) {
      const check = obj(c);
      if (
        typeof check["name"] !== "string" ||
        typeof check["result"] !== "string"
      )
        return null;
      checks.push({ name: check["name"], result: check["result"] });
    }
    entries.push({
      state,
      key_id: obj(e["signer"])["key_id"] as string,
      ...(state === "resolved" ? { signer_name: name as string } : {}),
      ...(typeof receipt === "string" ? { receipt } : {}),
      ...(state === "resolved" && checks.length > 0 ? { checks } : {}),
    });
  }
  return { directory, entries };
}

/**
 * The context the receipt module reads, with capsulectl's passing check of
 * the x-deal-v1 standalone report: an x-deal-v1 entry naming the report
 * standalone and its status, as capsulectl's own report entry does, beside
 * the page verifier's own entries, for the receipt module only: the page's
 * own verification (its banner, its extension rows) reads the context
 * without it (Codex, #417). Only a "pass" reading is ever added.
 */
export function withVerifierReport(
  context: VerifiedBundleContext,
  reading: VerifierReading & { kind: "pass" } = { kind: "pass" },
  verifyCommand?: string,
  countersigned?: readonly CountersignedStamp[],
  countersignedCopy?: CountersignedCopyStamp,
  dealOffer?: unknown,
): VerifiedBundleContext {
  if (reading.profile === DEAL_V0) return withDealV0Report(context, reading);
  const extensions = [
    ...context.verification.extensions,
    {
      kind: DEAL_V1,
      status: "pass",
      report: "standalone",
      integrityCovered: true,
      // The other party's half, as capsulectl reported it (x-deal-v1-counterparty-half).
      ...(reading.counterpartyHalf === undefined
        ? {}
        : { counterparty_half: { status: reading.counterpartyHalf } }),
      // The holder's own book's witness time, as capsulectl reported it; the
      // receipt module reads only its status, witness and at.
      ...(reading.witnessed === undefined
        ? {}
        : { witnessed: reading.witnessed }),
      // capsulectl's own result for each bundle check it reported, for the
      // receipt's proof panel (#382); the page's banner reads its own.
      ...(reading.checks === undefined ? {} : { checks: reading.checks }),
      // The command the page's maker gave for checking this copy (the page's
      // verifyCommand option), for the receipt's "Check it yourself".
      ...(verifyCommand === undefined ? {} : { verify_command: verifyCommand }),
      ...(reading.verdict === undefined ? {} : { verdict: reading.verdict }),
      // The page's own classification of each countersignature (AAC's
      // classifyCountersignatures), for the receipt's COUNTERSIGNED stamp.
      ...(countersigned === undefined ? {} : { countersigned }),
      // The page's own check of the countersigned copy it carries
      // (countersigned-copy.ts): present only when every check passed.
      ...(countersignedCopy === undefined
        ? {}
        : { countersigned_copy: countersignedCopy }),
      // The holder's sealed offer record as the page's maker gave it
      // (dealOffer), unchecked: the receipt module checks it against the
      // copy's own sealed agreement before drawing its item (#461).
      ...(dealOffer === undefined ? {} : { deal_offer: dealOffer }),
    },
  ] as unknown as VerifiedBundleContext["verification"]["extensions"];
  return {
    ...context,
    verification: { ...context.verification, extensions },
  };
}

/**
 * The x-deal-v0 receipt modules' context with capsulectl's two members, in
 * an x-deal-v0 entry marked `reported_by: "capsulectl"` that carries no
 * `status` and no `report`: the module's own reading of the report's form
 * and the page's own check of a standalone report (#397) stay the page's,
 * and only these members are capsulectl's.
 */
function withDealV0Report(
  context: VerifiedBundleContext,
  reading: VerifierReading & { kind: "pass" },
): VerifiedBundleContext {
  if (reading.witnessed === undefined && reading.countersign === undefined)
    return context;
  const extensions = [
    ...context.verification.extensions,
    {
      kind: DEAL_V0,
      reported_by: "capsulectl",
      ...(reading.witnessed === undefined
        ? {}
        : { witnessed: reading.witnessed }),
      ...(reading.countersign === undefined
        ? {}
        : { countersign: reading.countersign }),
    },
  ] as unknown as VerifiedBundleContext["verification"]["extensions"];
  return {
    ...context,
    verification: { ...context.verification, extensions },
  };
}

/**
 * The audience a deal copy's sealed report names, where the receipt module
 * reads it: an x-deal-v1 copy's standalone report content; an x-deal-v0
 * copy's report object in any form (receipt_core.js copyAudience): the
 * standalone report's, a disclosed record's, or the x-deal-v0 section
 * itself when it names no sealed report.
 */
export function sealedAudience(context: VerifiedBundleContext): unknown {
  const exts = obj(obj(context.bundle)["extensions"]);
  const standalone = obj(obj(exts[STANDALONE])["agent_input"]);
  if (DEAL_V1 in exts) return standalone["audience"];
  const deal = obj(exts[DEAL_V0]);
  const named = deal["sealed_report"];
  if (typeof named !== "string") return deal["audience"];
  if (obj(obj(exts[STANDALONE])["record"])["capsule_id"] === named)
    return obj(standalone["report"])["audience"];
  const input = obj(context.resolvedDisclosures.get(named)?.agent_input);
  return input["state"] === "disclosed"
    ? obj(obj(input["payload"])["report"])["audience"]
    : undefined;
}

/** capsulectl's report of the holder's own book's witness time, in a state the receipt draws. */
export type BookWitness =
  | {
      readonly status: "verified";
      readonly witness: string;
      readonly at: string;
      /** The page's reading of the witness's directory row (witnessedOf), when it has one. */
      readonly independent?: boolean;
    }
  | {
      readonly status: "failed" | "withheld";
      /** The witness capsulectl names, when it names one. */
      readonly witness?: string;
    };

/**
 * capsulectl's book witness of a passing reading, read by the receipt
 * module's own rules (receipt_core.js bookWitnessed): failed or withheld as
 * they are, with the witness when capsulectl names one; verified only with a
 * witness and a UTC time, and with the page's reading of its directory row
 * when it has one; anything else, undefined. Whose page may show it is the
 * caller's (u219, u239).
 */
export function bookWitnessOf(
  reading: VerifierReading | null,
): BookWitness | undefined {
  if (reading?.kind !== "pass") return undefined;
  const got = obj(reading.witnessed);
  const named =
    typeof got["witness"] === "string" && got["witness"] !== ""
      ? got["witness"]
      : undefined;
  if (got["status"] === "failed" || got["status"] === "withheld")
    return named === undefined
      ? { status: got["status"] }
      : { status: got["status"], witness: named };
  if (
    got["status"] !== "verified" ||
    named === undefined ||
    !utcInstant(got["at"])
  )
    return undefined;
  return {
    status: "verified",
    witness: named,
    at: got["at"] as string,
    ...(typeof got["independent"] === "boolean"
      ? { independent: got["independent"] }
      : {}),
  };
}

/** A UTC RFC 3339 time to the second, as the receipt module's validUtcTime reads it. */
function utcInstant(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const ms = Date.parse(value);
  return (
    !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 19) + "Z" === value
  );
}
