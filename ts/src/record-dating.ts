// SPDX-License-Identifier: BSD-3-Clause
import {
  asString,
  zoneStatement,
  type CitedRecord,
  type ConversationDate,
  type OutcomeReportDating,
  type ResultClaim,
  type ResultRoot,
} from "@action-state-group/agent-action-capsule";

// The outcome card's record-dating rule (agent-action-capsule
// ts/src/outcome-report.ts: caseRecord, conversationDate, buildDating),
// repeated here so the obligations card dates a session the same way.
// Copied from ts/v0.5.0, where the three are identical to these. Neither
// the published 0.5.0 package nor agent-action-capsule's main exports them
// (checked 2026-10-21), and no agent-action-capsule issue tracks exporting
// them yet: this file tracks that export, listed as a follow-up on this
// pull request. Once a release exports them, import them instead and
// delete this file.

const STATED_DAY = /^(\d{4}-\d{2}-\d{2})/u;

/** The case record the reports name, when this bundle cites it and its capsule checks out. */
export function caseRecord(
  result: ResultRoot,
  claims: readonly ResultClaim[],
  sourceCapsuleId: string | undefined,
): CitedRecord | undefined {
  if (sourceCapsuleId === undefined) return undefined;
  for (const claim of claims)
    for (const ref of claim.evidence) {
      const record = result.records.get(ref.digest);
      if (record === undefined || record.stated === undefined) continue;
      if (
        record.carriedCapsuleId === sourceCapsuleId ||
        (record.carriedCapsuleId === undefined &&
          record.bookRecordId === undefined &&
          record.capsuleId === sourceCapsuleId)
      )
        return record;
    }
  return undefined;
}

/** See `ConversationDate`: source (backfilled), record (own timestamp), else the judged day. */
export function conversationDate(
  record: CitedRecord | undefined,
  judgedDay: string,
): ConversationDate {
  const judged: ConversationDate = { basis: "judged", date: judgedDay };
  const stated = record?.stated;
  if (stated === undefined) return judged;
  const mode = stated.provenanceMode;
  if (asString(mode?.mode) === "backfilled") {
    const source = asString(mode?.source_asserted_at);
    const day = source === undefined ? undefined : STATED_DAY.exec(source)?.[1];
    if (source === undefined || day === undefined) return judged;
    const importedAt = asString(mode?.imported_at);
    return {
      basis: "source",
      date: day,
      stated: source,
      zone: zoneStatement(source),
      ...(importedAt === undefined ? {} : { importedAt }),
    };
  }
  const timestamp = stated.timestamp;
  const day =
    timestamp === undefined ? undefined : STATED_DAY.exec(timestamp)?.[1];
  if (timestamp === undefined || day === undefined) return judged;
  return {
    basis: "record",
    date: day,
    stated: timestamp,
    zone: zoneStatement(timestamp),
  };
}

/** How a set of dated conversations is dated as a whole. */
export function buildDating(
  conversations: readonly {
    readonly dated: ConversationDate;
    readonly judgedDay: string;
  }[],
): OutcomeReportDating {
  const counts = { source: 0, record: 0, judged: 0 };
  for (const c of conversations) counts[c.dated.basis] += 1;
  const used = (Object.keys(counts) as ConversationDate["basis"][]).filter(
    (basis) => counts[basis] > 0,
  );
  return {
    basis:
      used.length === 1 ? used[0]! : used.length === 0 ? "judged" : "mixed",
    counts,
    judgedDays: [...new Set(conversations.map((c) => c.judgedDay))].sort(),
    zoneNotStated: conversations.filter((c) => c.dated.zone === "not-stated")
      .length,
  };
}
