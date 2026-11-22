// SPDX-License-Identifier: Apache-2.0
// The History card's card_registered standing (capsule-viewer#342;
// agent-action-capsule spec/standard-history-v0.md section 13, cited as SH),
// for a presentation module, which verifies nothing itself (presentation-
// contract-v0 section 3).
//
// A card statement travels beside the card (SH 13.3): the module hands this
// the statements the block carries, as lowercase hex, and the context. The
// check is AAC's checkCardRegistered, unchanged, under the reader's own
// transparency-service list (readerWitnessPolicy), never one the bundle names.
// What it shows is existence at a time (SH 13): never that the counts are
// right, never anchor_inclusion, never that this is the holder's only card.
//
// The viewer has no envelope. SH 13.3 checks a statement's `iss` against the
// envelope's `responder` and its `sub` against the envelope's `anchor.digest`;
// here the key is the one the context's strict verdict names for the root
// record (the key readerCardSignature returns; nothing says whose it is) and
// the anchor is the card's own `anchor`. So a PASS says that key registered
// this card, and a record with no verified signature has no key to check
// against: NOT_CHECKED, never FAIL.
import {
  isVerifiedBundleContext,
  jcs,
} from "@action-state-group/agent-action-capsule";
import { checkCardRegistered } from "@action-state-group/agent-action-capsule/witness";
import { readerCardSignature } from "./card-signature.js";
import { readerWitnessPolicy } from "./reader-witnesses.js";

/** The most card statements one card is checked with (not SH's limit, which
 * is on Receipts inside one statement). More is NOT_CHECKED. */
export const MAX_CARD_STATEMENTS = 64;
/** A card statement is at most 10,485,760 octets (SH 13.1). */
export const MAX_STATEMENT_HEX = 2 * 10_485_760;

/** One statement's standing, as AAC's CardStatementReport. */
export interface ReaderCardStatement {
  readonly status: "PASS" | "FAIL" | "NOT_CHECKED";
  readonly service: string | null;
  readonly registration_time: number | null;
}

/** What {@link readerCardRegistered} says about the statements beside a card. */
export interface ReaderCardRegistered {
  /** AAC's card_registered over the statements: `NOT_PRESENT` with none. */
  readonly status: "PASS" | "FAIL" | "NOT_PRESENT" | "NOT_CHECKED";
  /** The service and registration time of one passing statement (always the
   * same Receipt's), else null. The time is null when the Receipt has none. */
  readonly service: string | null;
  readonly registration_time: number | null;
  /** One entry per statement, in the order received. */
  readonly statements: readonly ReaderCardStatement[];
  /** The key the statements were checked under (the root record's verified
   * key), else null. */
  readonly key_id: string | null;
}

const HEX = /^(?:[0-9a-f]{2})+$/u;
const ANCHOR = /^[0-9a-f]{64}$/u;

const none = (
  status: ReaderCardRegistered["status"],
  statements: readonly ReaderCardStatement[] = [],
  keyId: string | null = null,
): ReaderCardRegistered => ({
  status,
  service: null,
  registration_time: null,
  statements,
  key_id: keyId,
});

const fromHex = (hex: string): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i += 1)
    out[i] = Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
};

const FAILED: ReaderCardStatement = {
  status: "FAIL",
  service: null,
  registration_time: null,
};

/**
 * SH 13.3 over `statements` (lowercase hex, one card statement each) beside
 * `card` (the card's octets), under the key identifier `key`, the anchor
 * `anchor` and `policy`: AAC's checkCardRegistered, with an entry that is not
 * hex counted as a statement that is not in the form of SH 13.1 (FAIL, SH 13.3
 * step 1), and a report that keeps AAC's per-statement results. The vectors
 * run through this; {@link readerCardRegistered} supplies its inputs.
 */
export async function cardRegisteredUnder(
  card: Uint8Array,
  key: string,
  anchor: string,
  statements: readonly string[],
  policy: unknown,
): Promise<ReaderCardRegistered> {
  const parsable = statements.map((s) => HEX.test(s));
  const report = await checkCardRegistered(
    card,
    key,
    anchor,
    statements.map((s, i) => (parsable[i] ? fromHex(s) : new Uint8Array(0))),
    policy,
  );
  const reports: ReaderCardStatement[] = report.statements.map((r, i) =>
    parsable[i] ? r : FAILED,
  );
  const passed = reports.some((r) => r.status === "PASS");
  const status = passed
    ? "PASS"
    : reports.some((r) => r.status === "FAIL")
      ? "FAIL"
      : "NOT_CHECKED";
  return {
    status: reports.length === 0 ? "NOT_PRESENT" : status,
    service: passed ? report.service : null,
    registration_time: passed ? report.registration_time : null,
    statements: reports,
    key_id: key,
  };
}

/**
 * The card statements' standing for a presentation module: `statements`
 * (lowercase hex, one card statement each, as received beside the card) for
 * the root record's card (`agent_input.payload`, its octets the UTF-8 JCS of
 * the card, SH 4), under the reader's own list. Never throws; a check this
 * page cannot run is `NOT_CHECKED`, never a pass. An entry that is not hex is
 * a statement that is not in the form of SH 13.1, which is a failing
 * statement (SH 13.3 step 1) and changes nothing about the card.
 */
export async function readerCardRegistered(
  context: unknown,
  statements: readonly string[] | null,
): Promise<ReaderCardRegistered> {
  if (statements === null || statements.length === 0)
    return none("NOT_PRESENT");
  try {
    if (
      statements.length > MAX_CARD_STATEMENTS ||
      statements.some(
        (s) => typeof s !== "string" || s.length > MAX_STATEMENT_HEX,
      )
    )
      return none("NOT_CHECKED");
    if (!isVerifiedBundleContext(context)) return none("NOT_CHECKED");
    const signature = await readerCardSignature(context);
    const disclosed = context.root
      ? context.resolvedDisclosures.get(context.root)?.agent_input
      : undefined;
    if (
      signature.status !== "PASS" ||
      signature.key_id === null ||
      disclosed === undefined ||
      disclosed.state !== "disclosed"
    )
      return none("NOT_CHECKED");
    const card = disclosed.payload as { anchor?: unknown } | null;
    const anchor =
      card !== null && typeof card === "object" ? card.anchor : undefined;
    if (typeof anchor !== "string" || !ANCHOR.test(anchor))
      return none("NOT_CHECKED");
    return await cardRegisteredUnder(
      jcs(card),
      signature.key_id,
      anchor,
      statements,
      readerWitnessPolicy(),
    );
  } catch {
    return none("NOT_CHECKED");
  }
}
