// SPDX-License-Identifier: BSD-3-Clause
// The book-form bundle the chart goldens draw: chart-fixtures.ts's book (a
// daily run record on 28 of September 2026's 30 days, and cases), its dataset
// plan and dataset as records of their own, and a monthly Result whose
// plan_ref and dataset_ref name them. Each record's agent_input is its
// Evidence Layer header, as evidencebook seals a record it appends, so a
// dataset row's digest is the record's committed agent_input digest.
// Unsealed: pass it to sealEvidenceBundle.
import { jsonDigest } from "@action-state-group/agent-action-capsule";
import {
  BOOK_ID,
  bookHeaders,
  CONTRACT_REF,
  datasetOf,
  datasetPlan,
  RUN_TYPE,
} from "./chart-fixtures.js";

type Obj = Record<string, unknown>;

const alias = (seq: number): string => `r-${seq}`;

export async function chartBundleSource(
  book: { headers: Obj[]; recordTypes?: readonly string[] } = {
    headers: bookHeaders(),
  },
): Promise<{
  source: Obj;
  plan: Obj;
  dataset: Obj;
}> {
  const headers = book.headers;
  const plan = datasetPlan(headers.length, undefined, [], book.recordTypes);
  const { dataset } = await datasetOf(plan, headers);
  const next = headers.length + 1;
  const own = (seq: number, recordType: string, statement: Obj): Obj => ({
    v: 1,
    book_id: BOOK_ID,
    seq,
    record_type: recordType,
    epistemic_type: "derived_metric",
    committed_at: "2026-10-01T00:05:00Z",
    event_time_claim: "2026-10-01T00:00:00Z",
    statement,
  });
  const firstRun = headers.find((h) => h.record_type === RUN_TYPE)!;
  const result = {
    result_version: "evidence-result-v0",
    generated_at: "2026-10-01T00:00:00Z",
    claims: [
      {
        id: "claim-1",
        contract_ref: CONTRACT_REF,
        requirement_ref: "req-daily-check",
        tier: "recomputed",
        grade: "self-attested",
        sufficiency: "SATISFIED",
        verdict: "met",
        evidence: [
          { digest_alg: "SHA-256", digest: alias(firstRun.seq as number) },
        ],
        proofs: [],
        presentation: {
          kind: "disclosure",
          status: "SATISFIED",
          evidence: [
            { digest_alg: "SHA-256", digest: alias(firstRun.seq as number) },
          ],
        },
      },
    ],
    aggregate: {
      coverage: {
        evaluated_population: 1,
        excluded_not_applicable: 0,
        unknown_count: 0,
      },
      buckets: { met: ["claim-1"], not_met: [], not_evaluable: [] },
    },
    plan_ref: { digest_alg: "SHA-256", digest: await jsonDigest(plan) },
    dataset_ref: { digest_alg: "SHA-256", digest: await jsonDigest(dataset) },
  };
  const all = [
    ...headers,
    own(next, "evidence_plan", plan),
    own(next + 1, "evidence_dataset", dataset),
    own(next + 2, "evidence_result", result),
  ];
  const records: Obj[] = [];
  const disclosures: Obj = {};
  for (const h of all) {
    const id = alias(h.seq as number);
    records.push({ capsule_id: id, occurred_at: h.event_time_claim });
    disclosures[id] = { agent_input: h };
  }
  return {
    source: { root: alias(next + 2), records, disclosures },
    plan,
    dataset,
  };
}
