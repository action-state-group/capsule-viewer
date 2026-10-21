// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { buildComplianceModel } from "../src/compliance.js";
import { readCompliancePresentation } from "../src/compliance-presentation.js";
import { buildResultRoot } from "@action-state-group/agent-action-capsule";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

function fixture(name: string): Obj {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "test", "testdata", name), "utf8"),
  ) as Obj;
}

// test/testdata/compliance-bundle.json is a small, hand-written fixture (two
// sessions, five eu-ai-act-obligations tests each) sealed by the test-only
// sealEvidenceBundle helper. Only the art5 reports state a clause_claim, so
// the other tests' wording reads "not stated".
async function sealedComplianceBundle(
  mutate?: (source: Obj) => void,
): Promise<{ bundle: Obj; ids: Record<string, string> }> {
  const source = fixture("compliance-bundle.json");
  mutate?.(source);
  return sealEvidenceBundle(source);
}

async function model(mutate?: (source: Obj) => void) {
  const { bundle } = await sealedComplianceBundle(mutate);
  const result = await buildResultRoot(bundle);
  const presentation = readCompliancePresentation(bundle)!;
  return buildComplianceModel(result, presentation);
}

it("counts sessions per test, never an overall percentage", async () => {
  const m = await model();
  expect(m.totalSessions).toBe(2);
  const art5 = m.obligations[0]!.rows[0]!;
  expect(art5.criterionId).toBe("art5.no_manipulation_or_deception");
  expect(art5.metCount).toBe(1);
  expect(art5.notMetCount).toBe(1);
  expect(art5.notEvaluableCount).toBe(0);
  expect(art5.notApplicableCount).toBe(0);
});

it("a criterion with no claim in a session reads not_applicable, never a silent gap", async () => {
  const m = await model();
  const art26r = m.obligations
    .flatMap((o) => o.rows)
    .find((r) => r.criterionId === "art26.allowed_action_rules")!;
  expect(art26r.metCount).toBe(1);
  expect(art26r.notApplicableCount).toBe(1);
  const session1 = m.sessions.find(
    (s) => s.conversationId === "tau2:airline:task-1:trial-0",
  )!;
  const test = session1.tests.find(
    (t) => t.criterionId === "art26.allowed_action_rules",
  )!;
  expect(test.verdict).toBe("not_applicable");
});

it("the disclosure-before-first-turn row is always not_evaluable here and NEVER produces a finding", async () => {
  const m = await model();
  const row = m.obligations
    .flatMap((o) => o.rows)
    .find((r) => r.criterionId === "art50.disclosure_before_first_turn")!;
  expect(row.notEvaluableCount).toBe(2);
  expect(row.metCount).toBe(0);
  expect(row.notMetCount).toBe(0);
  expect(row.finding).toBeUndefined();
  expect(
    m.findings.some(
      (f) => f.criterionId === "art50.disclosure_before_first_turn",
    ),
  ).toBe(false);
});

it("findings are derived from the verdicts: a row with a finding template and a nonzero not-met count produces one", async () => {
  const m = await model();
  const byId = new Map(m.findings.map((f) => [f.id, f]));
  expect(byId.has("F-01")).toBe(true); // art5, 1 not_met
  expect(byId.get("F-01")!.sessionIds).toEqual(["tau2:airline:task-1:trial-0"]);
  expect(byId.has("F-02")).toBe(true); // art50.disclosure_clear_or_obvious, 1 not_met
  expect(byId.get("F-02")!.sessionIds).toEqual(["tau2:airline:task-0:trial-0"]);
});

it("a row with a finding template but zero not-met sessions produces no finding", async () => {
  const m = await model();
  // art26.allowed_action_rules: met=1, not_applicable=1, not_met=0
  expect(
    m.findings.some((f) => f.criterionId === "art26.allowed_action_rules"),
  ).toBe(false);
  // art26.consequential_actions_vs_instructions: met=2, not_met=0
  expect(
    m.findings.some(
      (f) => f.criterionId === "art26.consequential_actions_vs_instructions",
    ),
  ).toBe(false);
});

it("each session carries all five tests, tier included", async () => {
  const m = await model();
  const session0 = m.sessions.find(
    (s) => s.conversationId === "tau2:airline:task-0:trial-0",
  )!;
  expect(session0.tests).toHaveLength(5);
  const tiers = new Map(session0.tests.map((t) => [t.criterionId, t.tier]));
  expect(tiers.get("art50.disclosure_before_first_turn")).toBe("recomputed");
  expect(tiers.get("art26.allowed_action_rules")).toBe("recomputed");
  expect(tiers.get("art5.no_manipulation_or_deception")).toBe("judged");
});

it("a resolved test's rationale, contract and judge pin are read from its cited evaluation-report, never asserted", async () => {
  const m = await model();
  const session0 = m.sessions.find(
    (s) => s.conversationId === "tau2:airline:task-0:trial-0",
  )!;
  const art5 = session0.tests.find(
    (t) => t.criterionId === "art5.no_manipulation_or_deception",
  )!;
  expect(art5.rationale).toContain("No manufactured pressure");
  expect(art5.contract).toBe("eu-ai-act-obligations@0.1.0");
  expect(art5.judgePinDigest).toBe("pin-1");
});

it("run info is pinned when every cited report agrees on contract and judge pin", async () => {
  const m = await model();
  expect(m.runInfo.pinned).toBe(true);
  expect(m.runInfo.contract).toBe("eu-ai-act-obligations@0.1.0");
  expect(m.runInfo.judgePinDigest).toBe("pin-1");
});

it("a requirement claim from a DIFFERENT pack sharing the same book never creates a phantom session", async () => {
  // Regression: the Result v0 document's claims[] is not scoped to one pack
  // -- a claim shaped like <conversationId>::<requirementRef> for a
  // completely different contract must never be grouped as one of this
  // card's own sessions just because the id happens to match the shape.
  const m = await model((source) => {
    const ai = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
    (ai.claims as Obj[]).push({
      id: "some-other-conversation::safety.unrelated_check",
      contract_ref: "some-other-pack@1.0.0",
      requirement_ref: "safety.unrelated_check",
      tier: "judged",
      grade: "self-attested",
      sufficiency: "SATISFIED",
      verdict: "met",
      evidence: [{ digest_alg: "SHA-256", digest: "s1.art5" }],
      proofs: [],
      presentation: {
        kind: "disclosure",
        status: "SATISFIED",
        evidence: [{ digest_alg: "SHA-256", digest: "s1.art5" }],
      },
    });
    ((ai.aggregate as Obj).buckets as Obj).met = [
      ...(((ai.aggregate as Obj).buckets as Obj).met as string[]),
      "some-other-conversation::safety.unrelated_check",
    ];
  });
  expect(m.totalSessions).toBe(2);
  expect(
    m.sessions.some((s) => s.conversationId === "some-other-conversation"),
  ).toBe(false);
  const art50f = m.obligations
    .flatMap((o) => o.rows)
    .find((r) => r.criterionId === "art50.disclosure_before_first_turn")!;
  expect(art50f.notEvaluableCount).toBe(2);
  expect(
    art50f.metCount +
      art50f.notMetCount +
      art50f.notEvaluableCount +
      art50f.notApplicableCount,
  ).toBe(2);
});

it("test wording comes from the sealed clause_claim, or reads not stated", async () => {
  const m = await model();
  const rows = m.obligations.flatMap((o) => o.rows);
  const art5 = rows.find(
    (r) => r.criterionId === "art5.no_manipulation_or_deception",
  )!;
  expect(art5.wording).toEqual({
    text: "No manipulative or deceptive technique is used to distort the customer's decision.",
    source: "sealed",
  });
  const art26j = rows.find(
    (r) => r.criterionId === "art26.consequential_actions_vs_instructions",
  )!;
  expect(art26j.wording).toEqual({ text: "not stated", source: "unstated" });
});

it("the pack id and version come from the claims' contract_ref", async () => {
  const m = await model();
  expect(m.pack).toEqual({ id: "eu-ai-act-obligations", version: "0.1.0" });
});

it("tiers come from the sealed reports' epistemic_type, not the extension", async () => {
  const m = await model((source) => {
    const block = (source.extensions as Obj)["eu-ai-act-compliance/v1"] as Obj;
    for (const o of block.obligations as Obj[])
      for (const r of o.rows as Obj[]) r.tier = "judged";
  });
  const art50f = m.obligations
    .flatMap((o) => o.rows)
    .find((r) => r.criterionId === "art50.disclosure_before_first_turn")!;
  expect(art50f.tier).toBe("recomputed");
});

it("an obligation the claims name but the extension does not map reads not stated", async () => {
  const m = await model((source) => {
    const block = (source.extensions as Obj)["eu-ai-act-compliance/v1"] as Obj;
    block.obligations = (block.obligations as Obj[]).filter(
      (o) => o.key !== "art26",
    );
  });
  const art26 = m.obligations.find((o) => o.key === "art26")!;
  expect(art26.mapped).toBe(false);
  expect(art26.article).toBe("not stated");
  expect(art26.applicability.note).toBe("not stated");
  expect(art26.rows.length).toBeGreaterThan(0);
});

it("without a transcript in the bundle, a session's transcript reads absent", async () => {
  const m = await model();
  expect(m.sessions[0]!.transcript.state).toBe("absent");
});

it("with the reports withheld (no transcripts attached): each test keeps the tier its signed claim states, and run info says withheld, not 'no judged sessions'", async () => {
  const { bundle } = await sealedComplianceBundle();
  const result = await buildResultRoot(bundle);
  const records = new Map(
    [...result.records].map(([id, record]) => [
      id,
      { ...record, agentInput: { state: "withheld" as const } },
    ]),
  );
  const m = buildComplianceModel(
    { ...result, records },
    readCompliancePresentation(bundle)!,
  );
  const judged = m.sessions[0]!.tests.find(
    (t) => t.criterionId === "art5.no_manipulation_or_deception",
  )!;
  expect(judged.tier).toBe(judged.claim!.tier);
  expect(judged.tier).not.toBe("not stated");
  expect(m.runInfo.judgePinDigest).toBeUndefined();
  expect(m.runInfo.reportsWithheld).toBeGreaterThan(0);
  expect(m.runInfo.reportsWithheld).toBe(m.runInfo.reportsCited);
});

it("mismatched reports are counted apart, never as withheld, and give no case from the claims", async () => {
  const { bundle } = await sealedComplianceBundle();
  const result = await buildResultRoot(bundle);
  const records = new Map(
    [...result.records].map(([id, record]) => [
      id,
      { ...record, agentInput: { state: "disclosure_mismatch" as const } },
    ]),
  );
  const m = buildComplianceModel(
    { ...result, records },
    readCompliancePresentation(bundle)!,
  );
  expect(m.runInfo.reportsWithheld).toBeUndefined();
  expect(m.runInfo.reportsMismatched).toBeGreaterThan(0);
  expect(m.runInfo.reportsMismatched).toBe(m.runInfo.reportsCited);
  for (const session of m.sessions) {
    expect(session.sourceCapsuleId).toBeUndefined();
    expect(session.transcript.state).not.toBe("verified");
    for (const test of session.tests)
      if (test.claim !== undefined) expect(test.reportState).toBe("mismatch");
  }
});

it("a book-form report whose capsule is missing or does not check out is invalid, never withheld, and gives no case from the claims", async () => {
  const { bundle } = await sealedComplianceBundle();
  const result = await buildResultRoot(bundle);
  // resolveCarriedInput says "withheld" when the capsule bytes are absent or
  // fail their digest; with no checked carried capsule (no carriedCapsuleId)
  // the report is broken, not withheld.
  const records = new Map(
    [...result.records].map(([id, record]) => [
      id,
      {
        ...record,
        agentInput: {
          state: "disclosed" as const,
          payload: { record_type: "published_capsule", subject_ref: id },
        },
        carriedInput: { state: "withheld" as const },
      },
    ]),
  );
  const m = buildComplianceModel(
    { ...result, records },
    readCompliancePresentation(bundle)!,
  );
  expect(m.runInfo.reportsWithheld).toBeUndefined();
  expect(m.runInfo.reportsInvalid).toBeGreaterThan(0);
  expect(m.runInfo.reportsInvalid).toBe(m.runInfo.reportsCited);
  for (const session of m.sessions) {
    expect(session.sourceCapsuleId).toBeUndefined();
    for (const test of session.tests)
      if (test.claim !== undefined) expect(test.reportState).toBe("invalid");
  }
});

it("with the reports withheld, the case every claim cites (a case record declaring the session) makes the transcript 'cited', never 'verified'", async () => {
  const { bundle } = await sealedComplianceBundle();
  const result = await buildResultRoot(bundle);
  const records = new Map(
    [...result.records].map(([id, record]) => [
      id,
      { ...record, agentInput: { state: "withheld" as const } },
    ]),
  ) as Map<string, unknown>;
  const claims = result.claims.map((claim) => {
    const sep = claim.id.indexOf("::");
    if (sep === -1) return claim;
    const session = claim.id.slice(0, sep);
    const [benchmark, domain, task, trial] = session.split(":");
    const key = `case:${session}`;
    records.set(key, {
      capsuleId: key,
      agentInput: { state: "disclosed", payload: {} },
      carriedInput: {
        state: "disclosed",
        payload: {
          case: {
            benchmark,
            domain,
            task_id: task?.replace("task-", ""),
            trial: Number(trial?.replace("trial-", "")),
          },
          agent_interaction: { messages: [{ role: "user", content: "hi" }] },
        },
      },
      // one case capsule id per session
      carriedCapsuleId: [...session]
        .map((ch) => ch.charCodeAt(0).toString(16))
        .join("")
        .slice(-64)
        .padStart(64, "c"),
      carriedInputDigest: "d".repeat(64),
      carriedActionId: `urn:${session}`,
      stated: { timestamp: "2025-06-05T16:09:32Z" },
      agentOutput: { state: "absent" },
      cites: [],
    });
    return {
      ...claim,
      evidence: [claim.evidence[0]!, { digest: key, resolved: true }],
    };
  });
  const m = buildComplianceModel(
    { ...result, claims, records } as unknown as typeof result,
    readCompliancePresentation(bundle)!,
  );
  expect(m.sessions.length).toBeGreaterThan(0);
  for (const session of m.sessions) {
    expect(session.caseFrom).toBe("claims");
    expect(session.transcript.state).toBe("cited");
  }
});
