// Bundles for the Adjudications module's tests, built here from the AAC judge
// record shapes (agent-action-capsule schemas/judge/: calibration-summary-v1,
// human-rating-v1, evaluation-report-v1). Every record's capsule_id recomputes
// and its disclosure matches its committed agent_input digest, so the stand-in
// context (aacContext.js) verifies them as a real bundle verifies. The
// scenario is the canvas's: 38 counted adjudications, 35 concur, 3 differ,
// over five terms and three adjudicators.
import { createHash } from "node:crypto";

const EXCLUDED = new Set(["capsule_id", "signature", "key_id"]);
function jcs(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(jcs).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(",")}}`;
}
export const sha = (v) => createHash("sha256").update(Buffer.from(jcs(v), "utf8")).digest("hex");

export const EXT = "x-adjudications/v0";
const ref = (digest, purpose) => ({ type: "capsule", digest_alg: "SHA-256", digest, citation_purpose: purpose });

// The terms of the scenario: [clause_ref, counted adjudications n, of which concur k].
export const TERMS = [
  ["within-fare-rules", 12, 11],
  ["customers-request-addressed", 9, 9],
  ["policy-followed", 7, 7],
  ["no-unrequested-upsell", 6, 6],
  ["offered-an-alternative", 4, 2],
];
export const RATERS = ["p-04", "p-07", "p-11"];

export function build({ own = false, terms = TERMS, uncounted = 1, unrated = 20, mutate = {} } = {}) {
  const records = [];
  const disclosures = {};
  const add = (agentInput, label) => {
    const rec = { action_id: `${label}-${records.length}`, model_attestation: { compute_attestation: { agent_input_digest: sha(agentInput) } } };
    const id = sha(Object.fromEntries(Object.entries(rec).filter(([k]) => !EXCLUDED.has(k))));
    records.push({ ...rec, capsule_id: id });
    disclosures[id] = { agent_input: agentInput };
    return id;
  };
  let seq = 0;
  // One judged case: its act, its report (one case, one verdict), and a rating if rated.
  const judged = (verdict, label, rater, day) => {
    seq += 1;
    const act = add({ case: { conversation_id: `c${seq}`, turn_idx: 0, task_id: String(seq), trial: 0 } }, "act");
    const report = add({
      record_version: "evaluation-report/v1", record_id: `report-${seq}`, epistemic_type: "semantic_judgment",
      generated_at: "2026-10-31T00:00:00Z", contract_ref: "pack@1.6.0",
      judge_pin: { model_id: "jev-1.13.0", prompt_digest: { digest_alg: "SHA-256", digest: "a".repeat(64) }, sampling: {} },
      cases: [{ case_id: `case-${seq}`, verdict, acts: [ref(act, "grounds")], method: ref("b".repeat(64), "method") }],
    }, "report");
    if (label === null) return;
    add({
      record_version: "human-rating/v1", record_id: `rating-${seq}`, epistemic_type: "human_report",
      rated_at: `2026-10-${String(day).padStart(2, "0")}T12:00:00Z`, blind: true, rater_ref: rater,
      case: ref(report, "rated_case"), label,
    }, "rating");
  };
  let n = 0;
  terms.forEach(([, total, concur]) => {
    for (let i = 0; i < total; i += 1) {
      const agree = i < concur;
      const verdict = i % 2 === 0 ? "not_met" : "met";
      const label = agree ? verdict : verdict === "met" ? "not_met" : "met";
      judged(verdict, label, RATERS[n % RATERS.length], 1 + (n % 30));
      n += 1;
    }
  });
  for (let i = 0; i < uncounted; i += 1) judged("met", "not_evaluable", RATERS[0], 29);
  for (let i = 0; i < unrated; i += 1) judged("met", null, null, 1);
  const summary = add({
    record_version: "calibration-summary/v1", record_id: "summary-1", epistemic_type: "derived_metric",
    computed_at: "2026-10-31T02:00:00Z", judge_pin: ref("c".repeat(64), "calibrates"),
    clauses: terms.map(([clause_ref, total, concur]) => ({ clause_ref, agreement: { k: concur, n: total }, drift: { k: 0, n: total } })),
  }, "summary");
  const bundle = {
    bundle_version: "2", bundle_kind: "evidence-bundle/v2", root: summary, records, disclosures,
    completeness: { closure_depth: 2 }, extensions: { [EXT]: own ? { own: true } : {} },
  };
  return mutate.bundle ? mutate.bundle(bundle) : bundle;
}

// Re-seal after an edit to one record's agent_input: the id and the digest follow, so the bundle still verifies.
// Only for a record nothing cites (a rating, the summary); a cited record's new id would break its citers.
export function reseal(bundle, pick, edit) {
  const out = JSON.parse(JSON.stringify(bundle));
  const idx = out.records.findIndex((r) => pick(out.disclosures[r.capsule_id].agent_input));
  const old = out.records[idx].capsule_id;
  const input = out.disclosures[old].agent_input;
  edit(input);
  const rec = { ...out.records[idx], model_attestation: { compute_attestation: { agent_input_digest: sha(input) } } };
  delete rec.capsule_id;
  const id = sha(rec);
  out.records[idx] = { ...rec, capsule_id: id };
  delete out.disclosures[old];
  out.disclosures[id] = { agent_input: input };
  if (out.root === old) out.root = id;
  return out;
}
