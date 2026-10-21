// SPDX-License-Identifier: BSD-3-Clause
import {
  asString,
  isObject,
  type ObjectValue,
} from "@action-state-group/agent-action-capsule";
import type {
  ComplianceApplicability,
  ComplianceFinding,
  ComplianceObligation,
  CompliancePresentation,
  ComplianceRow,
} from "./compliance-presentation.js";
import {
  claimsCitedCase,
  findTranscript,
  NOT_STATED,
  readableId,
  reportSealedDay,
  reportState,
  withheldReports,
  type ConversationDate,
  type ConversationTranscript,
  type OutcomeReportDating,
  type ReportState,
} from "@action-state-group/agent-action-capsule";
import { buildDating, caseRecord, conversationDate } from "./record-dating.js";
import {
  REQUIREMENT_CLAIM,
  type CitedRecord,
  type ResultClaim,
  type ResultRoot,
} from "@action-state-group/agent-action-capsule";

/**
 * The EU AI Act obligations-report card, rendered from a verified Result v0
 * root. Results are stated as counts of sessions per TEST; there is no
 * per-conversation roll-up and no overall compliance percentage anywhere in
 * this model.
 *
 * Where each thing on the page comes from:
 *
 * - From the sealed records (or "not stated"): which obligations and tests
 *   exist (the requirement claims' `requirement_ref`s, `<obligation>.<test>`,
 *   in the order the claims first name them), every verdict and count, the
 *   pack id and version (the claims' one `contract_ref`), each test's wording
 *   (the cited reports' `clause_claim`, when they all agree), each test's
 *   tier (the cited reports' `epistemic_type`, when they all agree), the
 *   contract and judge pin, the rationale, and the transcript (only when the
 *   bundle carries it verifiably; see `findTranscript`).
 * - From the producer's `eu-ai-act-compliance/v1` extension, outside the
 *   signed records: the regulatory mapping -- article, obligation title,
 *   plain-language summary, applicability, method, the not-evaluable note and
 *   the finding templates (severity, recommendation, owner). The page labels
 *   it as the producer's mapping. An obligation the claims name but the
 *   extension does not map reads "not stated"; a test the extension names but
 *   no claim does is not drawn.
 *
 * A finding is drawn only for a test whose finding template exists AND whose
 * sealed not-met count is above zero.
 */

const CLAIM_ID_SEPARATOR = "::";

export type TestVerdict =
  | "met"
  | "not_met"
  | "not_evaluable"
  | "not_applicable"
  | "failed"
  | "unsupported";

/** A test's tier as the sealed reports state it. */
export type TierReading = "judged" | "recomputed" | "not stated" | "mixed";

export interface SealedText {
  readonly text: string;
  readonly source: "sealed" | "unstated" | "mixed";
}

export interface SessionTest {
  readonly criterionId: string;
  readonly verdict: TestVerdict;
  readonly tier: TierReading;
  readonly rationale?: string;
  readonly claim?: ResultClaim;
  readonly reportDigest?: string;
  readonly judgePinDigest?: string;
  readonly contract?: string;
  /** What the bundle shows of the cited report (outcome-report.ts `reportState`); present whenever `claim` is. */
  readonly reportState?: ReportState;
}

export interface Session {
  readonly conversationId: string;
  /** The date this session is counted under (`dated.date`): the case record's own date when the bundle carries it verifiably, as on the outcome card (see `ConversationDate`). */
  readonly day: string;
  readonly dated: ConversationDate;
  /** The day its reports were sealed under (`period`), whatever `dated` says. */
  readonly judgedDay: string;
  readonly tests: readonly SessionTest[];
  readonly sourceCapsuleId?: string;
  /** Where `sourceCapsuleId` was read: the disclosed reports, or the claims' own citations when the reports are withheld. */
  readonly caseFrom?: "reports" | "claims";
  readonly transcript: ConversationTranscript;
}

export interface ObligationRowModel {
  readonly criterionId: string;
  /** The producer's short label when it maps this test, else the test id made readable. */
  readonly name: string;
  /** True when `name` is the producer's label (unsigned), false when it is the sealed test id made readable. */
  readonly producerName: boolean;
  /** The wording the test was run against: the sealed `clause_claim`, or not stated. */
  readonly wording: SealedText;
  readonly tier: TierReading;
  readonly notEvaluableNote?: string;
  readonly finding?: ComplianceFinding;
  readonly metCount: number;
  readonly notMetCount: number;
  readonly notEvaluableCount: number;
  readonly notApplicableCount: number;
  /** Sessions whose claim for this test failed verification or cites evidence this bundle does not resolve: no verdict is drawn for them, so they are neither met nor not met. */
  readonly unverifiedCount: number;
  /** verdict bucket -> conversation ids, for the row's own drill-down. failed/unsupported are their own `unverified` bucket, never folded into not_met. */
  readonly sessionsByVerdict: ReadonlyMap<
    "met" | "not_met" | "not_evaluable" | "not_applicable" | "unverified",
    readonly string[]
  >;
}

export interface ObligationModel {
  readonly key: string;
  /** True when the producer's extension maps this obligation; otherwise every mapping field reads not stated. */
  readonly mapped: boolean;
  readonly article: string;
  readonly title: string;
  readonly plain: string;
  readonly judgedTerms: readonly string[];
  readonly applicability: {
    readonly status: ComplianceApplicability["status"] | "not stated";
    readonly note: string;
  };
  readonly method: string;
  readonly rows: readonly ObligationRowModel[];
}

export interface ComplianceFindingModel {
  readonly id: string;
  readonly criterionId: string;
  readonly obligationKey: string;
  readonly article: string;
  readonly testName: string;
  readonly severity: string;
  readonly recommendation: string;
  readonly ownerDue: string;
  readonly sessionIds: readonly string[];
}

export interface ComplianceRunInfo {
  readonly contract?: string;
  readonly judgePinDigest?: string;
  readonly pinned: boolean;
  /** Claims whose cited report the bundle carries but does not disclose, of `reportsCited` (see outcome-report.ts `withheldReports`). Mismatched or unreadable reports are counted apart, never as withheld. */
  readonly reportsWithheld?: number;
  readonly reportsMismatched?: number;
  readonly reportsUnreadable?: number;
  readonly reportsInvalid?: number;
  readonly reportsCited?: number;
}

export interface CompliancePack {
  /** `<contract_id>` of the one `contract_ref` the counted claims name, else not stated. */
  readonly id: string;
  /** `<version>` of that `contract_ref`, else not stated. */
  readonly version: string;
}

export interface ComplianceDating extends OutcomeReportDating {
  /** The first and last session date (`Session.day`), when any session is dated. */
  readonly from?: string;
  readonly to?: string;
}

export interface ComplianceModel {
  readonly regulation: string;
  readonly pack: CompliancePack;
  readonly obligations: readonly ObligationModel[];
  readonly sessions: readonly Session[];
  readonly findings: readonly ComplianceFindingModel[];
  readonly totalSessions: number;
  /** How the sessions are dated, the same reading the outcome card uses. */
  readonly dating: ComplianceDating;
  readonly runInfo: ComplianceRunInfo;
  readonly qualityProtocol: CompliancePresentation["qualityProtocol"];
  readonly capsuleId: string;
}

function drawnVerdict(claim: ResultClaim): TestVerdict {
  if (claim.failed) return "failed";
  if (claim.support === "unsupported") return "unsupported";
  return claim.verdict;
}

/**
 * The claim's cited `evaluation-report/v1`, resolved against this bundle.
 * A book record's own agent_input is the book's header, not the report: the
 * report is the agent_input of the capsule the record carries
 * (`carriedInput`, digest-checked by result-root.ts).
 */
function reportPayload(
  records: ReadonlyMap<string, CitedRecord>,
  claim: ResultClaim,
): ObjectValue | undefined {
  const digest = claim.evidence[0]?.digest;
  if (digest === undefined) return undefined;
  const record = records.get(digest);
  if (record === undefined) return undefined;
  const input = record.carriedInput ?? record.agentInput;
  if (input.state !== "disclosed") return undefined;
  return isObject(input.payload) ? input.payload : undefined;
}

function dayOf(payload: ObjectValue | undefined): string {
  const period = asString(payload?.period);
  if (period === undefined) return NOT_STATED;
  const colon = period.indexOf(":");
  return colon === -1 ? period : period.slice(colon + 1);
}

function sealedTier(payload: ObjectValue | undefined): TierReading {
  const type = asString(payload?.epistemic_type);
  if (type === "semantic_judgment") return "judged";
  if (type === "recomputed_determination") return "recomputed";
  return "not stated";
}

function agree<T extends string>(values: readonly T[], none: T, mixed: T): T {
  const distinct = new Set(values.filter((v) => v !== none));
  if (distinct.size === 0) return none;
  return distinct.size === 1 ? [...distinct][0]! : mixed;
}

interface ParsedClaim {
  readonly claim: ResultClaim;
  readonly conversationId: string;
  readonly obligationKey: string;
}

function parseClaim(claim: ResultClaim): ParsedClaim | undefined {
  if (claim.type !== REQUIREMENT_CLAIM) return undefined;
  const sep = claim.id.indexOf(CLAIM_ID_SEPARATOR);
  if (sep <= 0) return undefined;
  const dot = claim.requirementRef.indexOf(".");
  if (dot <= 0 || dot === claim.requirementRef.length - 1) return undefined;
  return {
    claim,
    conversationId: claim.id.slice(0, sep),
    obligationKey: claim.requirementRef.slice(0, dot),
  };
}

/**
 * The claims this card counts, and the pack they belong to. When the claims
 * name one `contract_ref`, all of them. When they name more than one (a
 * bundle carrying a different pack's claims too), only the claims whose test
 * the producer's extension maps, and the pack reads not stated: a different
 * pack's claim is never grouped into this card's sessions.
 */
function countedClaims(
  result: ResultRoot,
  presentation: CompliancePresentation,
): { claims: ParsedClaim[]; pack: CompliancePack } {
  const parsed = result.claims.flatMap((c): ParsedClaim[] => {
    const p = parseClaim(c);
    return p === undefined ? [] : [p];
  });
  const refs = new Set(parsed.map((p) => p.claim.contractRef));
  if (refs.size === 1) {
    const ref = [...refs][0]!;
    const at = ref.lastIndexOf("@");
    return {
      claims: parsed,
      pack: {
        id: at <= 0 ? NOT_STATED : ref.slice(0, at),
        version:
          at <= 0 || at === ref.length - 1 ? NOT_STATED : ref.slice(at + 1),
      },
    };
  }
  const mapped = new Set(
    presentation.obligations.flatMap((o) => o.rows.map((r) => r.criterionId)),
  );
  return {
    claims: parsed.filter((p) => mapped.has(p.claim.requirementRef)),
    pack: { id: NOT_STATED, version: NOT_STATED },
  };
}

function buildSessions(
  result: ResultRoot,
  claims: readonly ParsedClaim[],
  testIds: readonly string[],
): Session[] {
  const byConversation = new Map<string, ResultClaim[]>();
  for (const p of claims) {
    const list = byConversation.get(p.conversationId) ?? [];
    list.push(p.claim);
    byConversation.set(p.conversationId, list);
  }
  const sessions: Session[] = [];
  for (const [conversationId, conversationClaims] of byConversation) {
    const tests: SessionTest[] = [];
    const sources = new Set<string>();
    let judgedDay: string = NOT_STATED;
    for (const criterionId of testIds) {
      const claim = conversationClaims.find(
        (c) => c.requirementRef === criterionId,
      );
      if (claim === undefined) {
        // The Result v0 schema has no not_applicable verdict: a test the
        // roll-up left out for this conversation reads not_applicable,
        // never a silent gap.
        tests.push({
          criterionId,
          verdict: "not_applicable",
          tier: "not stated",
        });
        continue;
      }
      const payload = reportPayload(result.records, claim);
      const rationale = asString(payload?.rationale);
      // The Result's own schema-checked contract_ref first, then what the
      // report states.
      const contract =
        claim.contractRef ||
        asString(payload?.contract_ref) ||
        asString(payload?.contract);
      const judgePinDigest = asString(payload?.judge_pin_digest);
      const source = asString(payload?.source_capsule_id);
      if (source !== undefined) sources.add(source);
      if (judgedDay === NOT_STATED)
        judgedDay = reportSealedDay(result.records, claim) ?? dayOf(payload);
      const reportDigest = claim.evidence[0]?.digest;
      tests.push({
        criterionId,
        verdict: drawnVerdict(claim),
        // The report's own epistemic_type when disclosed; when the report
        // is withheld, the tier the Result's signed claim states.
        tier: payload === undefined ? claim.tier : sealedTier(payload),
        claim,
        ...(reportDigest === undefined ? {} : { reportDigest }),
        ...(rationale === undefined ? {} : { rationale }),
        ...(contract === undefined ? {} : { contract }),
        ...(judgePinDigest === undefined ? {} : { judgePinDigest }),
        reportState: reportState(result.records, claim),
      });
    }
    // Only when every report of the session is withheld, and the one case
    // record every claim cites declares itself this session's case
    // (claimsCitedCase refuses otherwise): disclosed reports that name no
    // case, or mismatched, unreadable or invalid ones, leave it unresolved.
    let caseFrom: Session["caseFrom"] = "reports";
    if (sources.size === 0) {
      const cited = claimsCitedCase(
        result.records,
        conversationId,
        conversationClaims,
        result.claims,
      );
      if (cited !== undefined) {
        sources.add(cited);
        caseFrom = "claims";
      }
    }
    const sourceCapsuleId = sources.size === 1 ? [...sources][0]! : undefined;
    // A backfilled case record is dated by its source's own time, a plain
    // one by its own timestamp, else by the sealed day: the outcome card's
    // rule (conversationDate), so the two cards never date a session apart.
    const dated = conversationDate(
      caseRecord(result, conversationClaims, sourceCapsuleId),
      judgedDay,
    );
    sessions.push({
      conversationId,
      day: dated.date,
      dated,
      judgedDay,
      tests,
      ...(sourceCapsuleId === undefined ? {} : { sourceCapsuleId, caseFrom }),
      transcript: findTranscript(
        result,
        conversationId,
        conversationClaims,
        sourceCapsuleId,
        caseFrom,
      ),
    });
  }
  sessions.sort((a, b) =>
    a.day === b.day
      ? a.conversationId.localeCompare(b.conversationId)
      : a.day.localeCompare(b.day),
  );
  return sessions;
}

function sealedWording(
  result: ResultRoot,
  claims: readonly ParsedClaim[],
  criterionId: string,
): SealedText {
  const texts = new Set<string>();
  for (const p of claims) {
    if (p.claim.requirementRef !== criterionId) continue;
    const text = asString(reportPayload(result.records, p.claim)?.clause_claim);
    if (text !== undefined) texts.add(text);
  }
  if (texts.size === 1) return { text: [...texts][0]!, source: "sealed" };
  return { text: NOT_STATED, source: texts.size === 0 ? "unstated" : "mixed" };
}

function buildRow(
  criterionId: string,
  mapping: ComplianceRow | undefined,
  wording: SealedText,
  sessions: readonly Session[],
): ObligationRowModel {
  const byVerdict = new Map<
    "met" | "not_met" | "not_evaluable" | "not_applicable" | "unverified",
    string[]
  >([
    ["met", []],
    ["not_met", []],
    ["not_evaluable", []],
    ["not_applicable", []],
    ["unverified", []],
  ]);
  const tiers: TierReading[] = [];
  for (const session of sessions) {
    const test = session.tests.find((t) => t.criterionId === criterionId);
    if (test === undefined) continue;
    tiers.push(test.tier);
    // failed/unsupported (a claim that failed verification, or cites
    // evidence this bundle can't resolve) is never read as met, and never
    // as not met either: its verdict was never drawn, so it is its own
    // bucket.
    const bucket =
      test.verdict === "failed" || test.verdict === "unsupported"
        ? "unverified"
        : test.verdict;
    byVerdict.get(bucket)!.push(session.conversationId);
  }
  return {
    criterionId,
    name:
      mapping?.name ??
      readableId(criterionId.slice(criterionId.indexOf(".") + 1)),
    producerName: mapping !== undefined,
    wording,
    tier: agree<TierReading>(tiers, "not stated", "mixed"),
    ...(mapping?.notEvaluableNote === undefined
      ? {}
      : { notEvaluableNote: mapping.notEvaluableNote }),
    ...(mapping?.finding === undefined ? {} : { finding: mapping.finding }),
    metCount: byVerdict.get("met")!.length,
    notMetCount: byVerdict.get("not_met")!.length,
    notEvaluableCount: byVerdict.get("not_evaluable")!.length,
    notApplicableCount: byVerdict.get("not_applicable")!.length,
    unverifiedCount: byVerdict.get("unverified")!.length,
    sessionsByVerdict: byVerdict,
  };
}

function buildObligation(
  key: string,
  mapping: ComplianceObligation | undefined,
  rows: readonly ObligationRowModel[],
): ObligationModel {
  if (mapping === undefined)
    return {
      key,
      mapped: false,
      article: NOT_STATED,
      title: readableId(key),
      plain: NOT_STATED,
      judgedTerms: [],
      applicability: { status: "not stated", note: NOT_STATED },
      method: NOT_STATED,
      rows,
    };
  return {
    key,
    mapped: true,
    article: mapping.article,
    title: mapping.title,
    plain: mapping.plain,
    judgedTerms: mapping.judgedTerms,
    applicability: mapping.applicability,
    method: mapping.method,
    rows,
  };
}

function buildRunInfo(
  result: ResultRoot,
  sessions: readonly Session[],
): ComplianceRunInfo {
  const contracts = new Set<string>();
  const pins = new Set<string>();
  for (const session of sessions)
    for (const test of session.tests) {
      if (test.contract !== undefined) contracts.add(test.contract);
      if (test.judgePinDigest !== undefined) pins.add(test.judgePinDigest);
    }
  return {
    ...(contracts.size === 1 ? { contract: [...contracts][0]! } : {}),
    ...(pins.size === 1 ? { judgePinDigest: [...pins][0]! } : {}),
    pinned: contracts.size <= 1 && pins.size <= 1,
    ...withheldOf(result, sessions),
  };
}

function withheldOf(
  result: ResultRoot,
  sessions: readonly Session[],
): {
  reportsWithheld?: number;
  reportsMismatched?: number;
  reportsUnreadable?: number;
  reportsInvalid?: number;
  reportsCited?: number;
} {
  const counted = withheldReports(
    result.records,
    sessions.flatMap((s) =>
      s.tests.flatMap((t) => (t.claim === undefined ? [] : [t.claim])),
    ),
  );
  return {
    ...(counted.withheld > 0 ? { reportsWithheld: counted.withheld } : {}),
    ...(counted.mismatched > 0
      ? { reportsMismatched: counted.mismatched }
      : {}),
    ...(counted.unreadable > 0
      ? { reportsUnreadable: counted.unreadable }
      : {}),
    ...(counted.invalid > 0 ? { reportsInvalid: counted.invalid } : {}),
    ...(counted.withheld +
      counted.mismatched +
      counted.unreadable +
      counted.invalid >
    0
      ? { reportsCited: counted.total }
      : {}),
  };
}

function buildFindings(
  obligations: readonly ObligationModel[],
): ComplianceFindingModel[] {
  const findings: ComplianceFindingModel[] = [];
  for (const obligation of obligations)
    for (const row of obligation.rows) {
      // Derived from the sealed verdicts: a test with no finding template
      // can never produce one, and a test WITH one produces nothing when
      // its not-met count is zero.
      if (row.finding === undefined || row.notMetCount === 0) continue;
      findings.push({
        id: row.finding.id,
        criterionId: row.criterionId,
        obligationKey: obligation.key,
        article: obligation.article,
        testName: row.name,
        severity: row.finding.severity,
        recommendation: row.finding.recommendation,
        ownerDue: row.finding.ownerDue,
        sessionIds: row.sessionsByVerdict.get("not_met") ?? [],
      });
    }
  return findings;
}

function complianceDating(sessions: readonly Session[]): ComplianceDating {
  const days = sessions
    .map((s) => s.day)
    .filter((d) => d !== NOT_STATED)
    .sort();
  return {
    ...buildDating(sessions),
    ...(days.length === 0
      ? {}
      : { from: days[0]!, to: days[days.length - 1]! }),
  };
}

export function buildComplianceModel(
  result: ResultRoot,
  presentation: CompliancePresentation,
): ComplianceModel {
  const { claims, pack } = countedClaims(result, presentation);
  // Obligations and tests in the order the claims first name them.
  const tests = new Map<string, string[]>();
  for (const p of claims) {
    const list = tests.get(p.obligationKey) ?? [];
    if (!list.includes(p.claim.requirementRef))
      list.push(p.claim.requirementRef);
    tests.set(p.obligationKey, list);
  }
  const testIds = [...tests.values()].flat();
  const sessions = buildSessions(result, claims, testIds);
  const mappings = new Map(presentation.obligations.map((o) => [o.key, o]));
  const obligations = [...tests.entries()].map(([key, ids]) => {
    const mapping = mappings.get(key);
    const rowMappings = new Map(
      (mapping?.rows ?? []).map((r) => [r.criterionId, r]),
    );
    return buildObligation(
      key,
      mapping,
      ids.map((id) =>
        buildRow(
          id,
          rowMappings.get(id),
          sealedWording(result, claims, id),
          sessions,
        ),
      ),
    );
  });
  return {
    regulation: presentation.regulation,
    pack,
    obligations,
    sessions,
    findings: buildFindings(obligations),
    totalSessions: sessions.length,
    dating: complianceDating(sessions),
    runInfo: buildRunInfo(result, sessions),
    qualityProtocol: presentation.qualityProtocol,
    capsuleId: result.capsuleId,
  };
}
