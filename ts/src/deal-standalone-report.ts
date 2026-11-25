// SPDX-License-Identifier: Apache-2.0

/**
 * The page's check of a deal copy's standalone report (capsule-cli#294,
 * capsule-viewer#397): an x-deal-v0 copy whose report rides in
 * `x-deal-report/v0`, on no log, bound to the deal checkpoint the copy is
 * made at. It applies what `capsulectl deal verify --bundle` applies
 * (evidencebook `capsulectl/internal/deal/deal_verify_entry.go` and
 * `deal_verify_report.go` `standaloneReportEntry`, the x-deal-v0 path), so a
 * receipt page reads the report only when this check passed, as it reads it
 * only when capsulectl reported it passed:
 *
 *  1. the x-deal-v0 section is a pointer alone (`sealed_report`), with no
 *     x-deal-v1 section beside it, and `x-deal-report/v0` is exactly
 *     `{record, agent_input}`, its record the pointer's Capsule and a deal
 *     report (`action_id` `capsulectl-deal-report`);
 *  2. the record's producer signature verifies under its own `key_id`, and
 *     that key is the verified key of the deal's last step (the record at
 *     the highest log position whose evidence record header is a step's);
 *  3. its agent_input matches the digest the record's Capsule commits;
 *  4. its payload is a `deal_report` of the bundle's deal (its `deal_id` is
 *     the log id's suffix after `deal/`) under the x-deal-v0 profile, for a
 *     copy audience;
 *  5. its `deal_checkpoint` is the bundle's checkpoint (log id, MMR size,
 *     root) and holds nothing else;
 *  6. the bundle holds no report record;
 *  7. its lifecycle's `as_of` is the checkpoint's signed time, to the
 *     nanosecond.
 *
 * The x-deal-v1 report is not checked here yet: it passes only under the
 * profile's own rule (evidencebook `xdealv1.VerifyReportBundle`), which this
 * page does not run, so a v1 copy gets no answer and its receipt declines.
 */

import {
  ed25519Available,
  verifyDisclosureEnvelope,
  verifyProducerEnvelope,
  type ParsedJson,
} from "@action-state-group/agent-action-capsule";

type Obj = Record<string, unknown>;

const DEAL_V0 = "x-deal-v0";
const DEAL_V1 = "x-deal-v1";
const STANDALONE = "x-deal-report/v0";
const POINTER = "sealed_report";
const REPORT_ACTION = "capsulectl-deal-report";
const STEP_TYPES = new Set(["deal_step", "step_completed", "step_failed"]);
const COPY_AUDIENCES = new Set(["counterparty", "adjudicator", "keep"]);

const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const obj = (value: unknown): Obj => (isObj(value) ? value : {});

/**
 * The status of a copy's standalone x-deal-v0 report: `pass` or `fail` as
 * `capsulectl deal verify --bundle` would report it, or null when the bundle
 * carries none this page checks (no `x-deal-report/v0`, an x-deal-v1 copy),
 * or when this browser cannot verify Ed25519.
 */
export async function dealStandaloneReport(
  bundle: unknown,
): Promise<"pass" | "fail" | null> {
  const failed = await dealStandaloneReportFailures(bundle);
  return failed === null ? null : failed.length === 0 ? "pass" : "fail";
}

/**
 * Which of the report's checks failed, so a page can name each (Sherlock2,
 * #412):
 *  - `report`: it is not this deal's report (conditions 1 and 4: the
 *    pointer, the record, the payload's type, profile, audience and deal);
 *  - `second`: the log holds a report record beside it, so the page can't
 *    tell which report counts (6);
 *  - `signer`: it is not signed by the key of the deal's last step (2);
 *  - `capsule`: its payload is not the one its Capsule commits (3);
 *  - `checkpoint`: it is not bound to this bundle's checkpoint and time (5, 7).
 * (`verifier` and `verdict` are never returned here: they are a page's
 * reading of capsulectl's own report, verifier-report.ts.)
 * An empty list is a pass. Null when there is nothing this page checks, as
 * for dealStandaloneReport. When the record itself cannot be read
 * (condition 1), only `report` is given: the other checks have nothing to
 * read.
 */
export type StandaloneReportFailure =
  | "verifier"
  | "verdict"
  | "report"
  | "second"
  | "signer"
  | "capsule"
  | "checkpoint";

export async function dealStandaloneReportFailures(
  bundle: unknown,
): Promise<StandaloneReportFailure[] | null> {
  const value = obj(bundle);
  const extensions = obj(value["extensions"]);
  if (!(STANDALONE in extensions) || DEAL_V1 in extensions) return null;
  if (!ed25519Available()) return null;
  return standaloneReportFailures(value, extensions);
}

async function standaloneReportFailures(
  value: Obj,
  extensions: Obj,
): Promise<StandaloneReportFailure[]> {
  const failed = new Set<StandaloneReportFailure>();
  // 1. A pointer-only section naming the record the extension carries.
  const section = extensions[DEAL_V0];
  if (!isObj(section) || Object.keys(section).length !== 1) return ["report"];
  const id = section[POINTER];
  const x = extensions[STANDALONE];
  if (typeof id !== "string" || !isObj(x) || Object.keys(x).length !== 2)
    return ["report"];
  const record = x["record"];
  const input = x["agent_input"];
  if (
    !isObj(record) ||
    !isObj(input) ||
    record["capsule_id"] !== id ||
    record["action_id"] !== REPORT_ACTION
  )
    return ["report"];

  // 2. Signed by the deal's last step's key.
  const reportKey = await verifiedProducerKey(record);
  const last = await lastStepRecord(value);
  if (
    reportKey === undefined ||
    last === undefined ||
    (await verifiedProducerKey(last)) !== reportKey
  )
    failed.add("signer");

  // 3. The disclosed payload is the one the Capsule commits.
  const capsule: Record<string, ParsedJson> = {};
  for (const [k, v] of Object.entries(record))
    if (k !== "signature" && k !== "key_id") capsule[k] = v as ParsedJson;
  const disclosed = await verifyDisclosureEnvelope({
    capsule,
    disclosures: { agent_input: input as ParsedJson },
  });
  if (!disclosed.ok || disclosed.disclosuresMatched !== 1)
    failed.add("capsule");

  // 4. This deal's report, under x-deal-v0, for a copy audience.
  const logId = obj(value["completeness_certificate"])["log_id"];
  const audience = input["audience"];
  if (
    typeof logId !== "string" ||
    !logId.startsWith("deal/") ||
    input["type"] !== "deal_report" ||
    input["profile"] !== DEAL_V0 ||
    typeof audience !== "string" ||
    !COPY_AUDIENCES.has(audience) ||
    input["deal_id"] !== logId.slice("deal/".length)
  )
    failed.add("report");

  // 5. Bound to this bundle's checkpoint and nothing else.
  const checkpoint = obj(value["checkpoint"]);
  const bound = input["deal_checkpoint"];
  const boundSize = isObj(bound) ? jsonUint(bound["mmr_size"]) : undefined;
  const size = jsonUint(checkpoint["mmr_size"]);
  if (
    !isObj(bound) ||
    Object.keys(bound).length !== 3 ||
    typeof logId !== "string" ||
    bound["log_id"] !== logId ||
    boundSize === undefined ||
    size === undefined ||
    boundSize !== size ||
    bound["root"] !== checkpoint["root"]
  )
    failed.add("checkpoint");

  // 6. No report record beside it.
  const records = Array.isArray(value["records"]) ? value["records"] : [];
  if (records.some((r) => obj(r)["action_id"] === REPORT_ACTION))
    failed.add("second");

  // 7. As of the checkpoint's signed time.
  const asOf = instant(obj(obj(input["report"])["lifecycle"])["as_of"]);
  const signed = instant(checkpoint["timestamp"]);
  if (asOf === undefined || signed === undefined || asOf !== signed)
    failed.add("checkpoint");

  // In the order the page runs them, for the lines it draws.
  return (
    ["report", "second", "signer", "capsule", "checkpoint"] as const
  ).filter((f) => failed.has(f));
}

/** A record's producer key, hex, when its signature verifies under its own key_id. */
async function verifiedProducerKey(record: Obj): Promise<string | undefined> {
  const id = record["capsule_id"];
  const signature = hexBytes(record["signature"]);
  const key = record["key_id"];
  if (typeof id !== "string" || id === "" || signature === undefined)
    return undefined;
  if (typeof key !== "string" || hexBytes(key) === undefined) return undefined;
  const result = await verifyProducerEnvelope(id, signature);
  if (!result.ok || result.publicKey === undefined) return undefined;
  const verified = Array.from(result.publicKey, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return verified === key.toLowerCase() ? key : undefined;
}

/**
 * The deal's last step: the record at the highest log position whose
 * evidence record header (see recordHeader) is a step's. As in Go
 * (`lastStepRecord`), a position must be a non-negative integer above 0: the
 * search starts at 0 and takes only a greater one.
 */
async function lastStepRecord(value: Obj): Promise<Obj | undefined> {
  const memberships = obj(
    obj(value["completeness_certificate"])["memberships"],
  );
  const records = Array.isArray(value["records"]) ? value["records"] : [];
  let last: Obj | undefined;
  let lastSeq = 0n;
  for (const raw of records) {
    const record = obj(raw);
    const type = (await recordHeader(value, record))?.["record_type"];
    if (typeof type !== "string" || !STEP_TYPES.has(type)) continue;
    const id = record["capsule_id"];
    if (typeof id !== "string") continue;
    const seq = jsonUint(obj(obj(memberships[id])["log_coordinates"])["seq"]);
    if (seq !== undefined && seq > lastSeq) {
      last = record;
      lastSeq = seq;
    }
  }
  return last;
}

/**
 * A record's evidence record header, as Go's `recordHeader` reads it: the
 * embedded `evidence_record_header` (an x-deal-v0 record's), taken as the
 * bundle states it; else the record's disclosed agent_input
 * (`disclosures[<capsule_id>].agent_input`, an x-deal-v1 book record's),
 * only when it matches the digest the record's Capsule commits. Undefined
 * when it has neither.
 */
async function recordHeader(value: Obj, record: Obj): Promise<Obj | undefined> {
  const embedded = record["evidence_record_header"];
  if (isObj(embedded)) return embedded;
  const id = record["capsule_id"];
  if (typeof id !== "string" || id === "") return undefined;
  const disclosed = obj(obj(value["disclosures"])[id])["agent_input"];
  if (!isObj(disclosed)) return undefined;
  const capsule: Record<string, ParsedJson> = {};
  for (const [k, v] of Object.entries(record))
    if (k !== "signature" && k !== "key_id") capsule[k] = v as ParsedJson;
  const checked = await verifyDisclosureEnvelope({
    capsule,
    disclosures: { agent_input: disclosed as ParsedJson },
  });
  return checked.ok && checked.disclosuresMatched === 1 ? disclosed : undefined;
}

/**
 * A JSON non-negative integer, as evidencebook's JSONUint reads one from a
 * bundle decoded with UseNumber: a number only, never a string, and never -0
 * (strconv.ParseUint refuses "-0"). One limit of the page's JSON.parse: a
 * number written `22.0` or `2.2e1` arrives here as 22, which Go refuses; the
 * page cannot see the spelling.
 */
export function jsonUint(value: unknown): bigint | undefined {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    !Object.is(value, -0)
    ? BigInt(value)
    : undefined;
}

function hexBytes(value: unknown): Uint8Array | undefined {
  if (
    typeof value !== "string" ||
    value.length % 2 !== 0 ||
    !/^[0-9a-fA-F]*$/u.test(value)
  )
    return undefined;
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(value.slice(2 * i, 2 * i + 2), 16);
  return out;
}

/**
 * An RFC 3339 time as one comparable instant, to the nanosecond, as Go's
 * time.Parse(time.RFC3339Nano) reads it and Equal compares it: the year read
 * as written (0000-9999), an upper-case T and Z, any number of fraction
 * digits of which nine are kept. Undefined when it is not one. Go's general
 * parser also takes a comma before the fraction and a one-digit hour, which
 * this refuses: capsulectl writes neither, and a refusal here only declines
 * a receipt Go would pass, never the other way.
 */
export function instant(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:(Z)|([+-])(\d{2}):(\d{2}))$/u.exec(
      value,
    );
  if (m === null) return undefined;
  const [, y, mo, d, h, mi, s, frac, z, sign, oh, om] = m;
  const fields = [y, mo, d, h, mi, s].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const [year, month, day, hour, minute, second] = fields;
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > civil(year, month + 1, 0).getUTCDate() ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return undefined;
  let offset = 0;
  if (z === undefined) {
    const offHour = Number(oh);
    const offMinute = Number(om);
    if (offHour > 23 || offMinute > 59) return undefined;
    offset = (sign === "-" ? -1 : 1) * (offHour * 60 + offMinute) * 60;
  }
  const at = civil(year, month, day);
  at.setUTCHours(hour, minute, second, 0);
  const seconds = BigInt(at.getTime() / 1000) - BigInt(offset);
  // Go reads any number of fraction digits and keeps nine.
  const nanos = (frac ?? "").slice(0, 9).padEnd(9, "0");
  return `${seconds}.${nanos}`;
}

/**
 * A UTC date with the year taken as written: Date.UTC reads a year 0-99 as
 * 1900-1999, setUTCFullYear does not.
 */
function civil(year: number, month: number, day: number): Date {
  const at = new Date(0);
  at.setUTCFullYear(year, month - 1, day);
  return at;
}
