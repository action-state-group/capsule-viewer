// The data side of the card's "Coverage and gaps" (gap recommendations) and
// "Obligations" (clause -> requirement -> status) sections: over the
// synthetic release-approval example (examples/result-v0/build_side_inputs.py)
// and the coverage report fixture vendored from the engine
// (tests/testdata/pos-coverage-report-*.json).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadViewer } from "./loadViewer.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = resolve(HERE, "..", "examples", "result-v0");
const TESTDATA = resolve(HERE, "..", "tests", "testdata");

function read(dir, name) {
  return JSON.parse(readFileSync(resolve(dir, name), "utf8"));
}

function panels() {
  loadViewer();
  return globalThis.window.CapsuleViewerResultPanels;
}

const result = () => read(EXAMPLES, "release-approval-result-with-coverage.json");
const plainResult = () => read(EXAMPLES, "release-approval-result.json");
const contract = () => read(EXAMPLES, "release-approval-contract.json");
const register = () => read(EXAMPLES, "release-approval-register.json");
const engineResult = () => read(TESTDATA, "pos-coverage-report-result.json");
const engineContract = () => read(TESTDATA, "pos-coverage-report-contract.json");

function req(out, ref) {
  return out.requirements.find((r) => r.requirement_ref === ref);
}

describe("coverageGaps", () => {
  it("the example's coverage report recomputes, and every joined claim is counted once", () => {
    const r = result();
    const out = panels().coverageGaps(r, contract());
    expect(out.issues).toEqual([]);
    expect(out.diagnostics).toEqual([]);
    expect(out.summary.stated).toEqual(out.summary.recomputed);
    expect(out.foreign_claims).toEqual([]);
    expect(out.unjoinable_claims).toEqual([]);
    const totals = { met: 0, not_met: 0, not_evaluable: 0 };
    out.requirements.forEach((row) => {
      for (const k of Object.keys(totals)) totals[k] += row.counts[k];
    });
    expect(totals).toEqual({
      met: r.aggregate.buckets.met.length,
      not_met: r.aggregate.buckets.not_met.length,
      not_evaluable: r.aggregate.buckets.not_evaluable.length,
    });
  });

  it("a missing source carries the report's remedy and, from its epistemic type, the tier it can support", () => {
    const out = panels().coverageGaps(result(), contract());
    const notes = req(out, "release_notes_published");
    expect(notes.statement).toBe("release notes were published for the release");
    expect(notes.counts.not_evaluable).toBe(3);
    expect(notes.recommendations).toHaveLength(1);
    expect(notes.recommendations[0]).toMatchObject({
      kind: "missing_source",
      source: "docs-site-publication-log",
      remedy: { connector: "native_emission", raises_to: "observed" },
      tier: { tier: "recomputed", assurance: "Verifiable" },
    });
    expect(notes.recommendations[0].claims.sort()).toEqual(
      ["R-103/release_notes_published", "R-104/release_notes_published", "R-106/release_notes_published"].sort(),
    );
  });

  it("records from one producer are correlation: the gap is kept with no remedy, and independence is unmet", () => {
    const out = panels().coverageGaps(result(), contract());
    const risk = req(out, "change_risk_assessed_correctly");
    expect(risk.independence).toEqual({ required_producers: 2, independent_producers: 1, correlated_records: 11, met: false });
    expect(risk.recommendations.map((g) => g.kind)).toEqual(["missing_source", "correlated_only"]);
    expect(risk.recommendations[0]).toMatchObject({
      source: "second-reviewer-signoff",
      remedy: { connector: "human_approval", raises_to: "committed" },
      tier: { tier: "judged", assurance: "Attested" },
    });
    expect(risk.recommendations[1]).toMatchObject({ source: null, remedy: null, tier: null });
    expect(out.summary.recomputed.gaps_without_remedy).toBe(1);
  });

  it("a withheld claim gets a disclosure recommendation, never a new source", () => {
    const out = panels().coverageGaps(result(), contract());
    const recs = req(out, "deployment_observed").recommendations;
    expect(recs).toEqual([
      expect.objectContaining({ kind: "disclosure", claims: ["R-103/deployment_observed"], remedy: null, tier: null }),
    ]);
  });

  it("a covered requirement with no not_evaluable claims gets no recommendation", () => {
    const out = panels().coverageGaps(result(), contract());
    expect(req(out, "tests_passed_on_release_commit").recommendations).toEqual([]);
    expect(req(out, "tests_passed_on_release_commit").status).toBe("SATISFIED");
  });

  it("reads the engine's fixture as produced: remedy as stated, no tier where no epistemic type is given", () => {
    const out = panels().coverageGaps(engineResult(), engineContract());
    expect(out.issues).toEqual([]);
    expect(out.diagnostics).toEqual([]);
    expect(out.contract_ref).toBe("ec:ai-act-human-oversight:2026-09-21@1");
    const two = req(out, "req-human-role-2");
    expect(two.statement).toBe("the reviewer could interpret the system's output");
    expect(two.recommendations).toEqual([
      expect.objectContaining({
        kind: "missing_source",
        source: "ui-explanation-capability-record",
        remedy: { connector: "system_of_record", raises_to: "retrospectively_evidenced" },
        tier: null,
        claims: ["claim-2"],
      }),
    ]);
    const three = req(out, "req-human-role-3");
    expect(three.independence.met).toBe(false);
    expect(three.recommendations.map((g) => g.kind)).toEqual(["correlated_only"]);
  });

  it("a hand-edited summary is flagged, not trusted", () => {
    const r = result();
    r.coverage_report.summary.satisfied = 4;
    const out = panels().coverageGaps(r, contract());
    expect(out.diagnostics).toEqual(["summary.satisfied is 4 but recomputes to 2"]);
  });

  it("a row whose sufficiency does not follow its status is flagged", () => {
    const r = result();
    r.coverage_report.requirements[3].sufficiency = "SATISFIED";
    const out = panels().coverageGaps(r, contract());
    expect(out.diagnostics).toContain(
      'requirement "release_notes_published" status NOT_FOUND requires sufficiency GAP, got "SATISFIED"',
    );
  });

  it("a row naming a claim that does not exist, or one for another requirement, is flagged", () => {
    const r = result();
    r.coverage_report.requirements[1].claim_ids.push("R-999/tests_passed_on_release_commit", "R-101/deployment_observed");
    const out = panels().coverageGaps(r, contract());
    expect(out.diagnostics).toContain(
      'requirement "tests_passed_on_release_commit" names claim "R-999/tests_passed_on_release_commit", which has no claim',
    );
    expect(out.diagnostics.some((d) => d.startsWith('claim "R-101/deployment_observed" is for'))).toBe(true);
  });

  it("independence relabelled as met is flagged", () => {
    const r = result();
    r.coverage_report.requirements[0].independence.met = true;
    const out = panels().coverageGaps(r, contract());
    expect(out.diagnostics).toContain(
      'requirement "change_risk_assessed_correctly": independence.met disagrees with its producer counts',
    );
  });

  it("a SATISFIED row with a gap is flagged", () => {
    const r = result();
    r.coverage_report.requirements[1].gaps.push({ kind: "no_sources_declared", detail: "x", remedy: null });
    const out = panels().coverageGaps(r, contract());
    expect(out.diagnostics).toContain('requirement "tests_passed_on_release_commit" is SATISFIED but has gaps or unmet independence');
  });

  it("source counts that do not add up are flagged", () => {
    const r = result();
    r.coverage_report.requirements[1].sources[0].backfilled_count = 1;
    const out = panels().coverageGaps(r, contract());
    expect(out.diagnostics).toContain(
      'requirement "tests_passed_on_release_commit" source "ci-run-record": contemporaneous + backfilled != record_count',
    );
  });

  it("without a coverage report it says what is not known and invents nothing", () => {
    const out = panels().coverageGaps(plainResult(), contract());
    expect(out.requirements).toEqual([]);
    expect(out.issues).toEqual([
      "the Result carries no coverage_report -- which sources were found and what closes each gap is not known",
    ]);
  });

  it("a contract for another version is not used for statements", () => {
    const c = contract();
    c.version = "0.2";
    const out = panels().coverageGaps(result(), c);
    expect(out.issues[0]).toContain("its statements and sources are not used");
    expect(req(out, "release_notes_published").statement).toBeNull();
  });

  it("claims under another contract version are listed as foreign, never joined", () => {
    const r = result();
    r.claims[0].contract_ref = "ec:example-software-release-approval@0.2";
    const out = panels().coverageGaps(r, contract());
    expect(out.foreign_claims).toEqual([{ id: r.claims[0].id, contract_ref: "ec:example-software-release-approval@0.2" }]);
    expect(req(out, "change_risk_assessed_correctly").counts.met).toBe(3);
  });

  it("a malformed claim is listed as unjoinable, not skipped", () => {
    const r = result();
    delete r.claims[2].verdict;
    const out = panels().coverageGaps(r, contract());
    expect(out.unjoinable_claims).toEqual([r.claims[2].id]);
  });

  it("a producer's own claim lifts no tier", () => {
    expect(panels().raisesTo("producer_claim")).toEqual({ tier: null, assurance: "self-attested only" });
    expect(panels().raisesTo("something_else").tier).toBeNull();
  });
});

// The Evidence Layer's closed set, spelled exactly as agent-action-capsule's
// schemas/vendor/epistemic-types.json spells it (Steven's ruling 2026-10-01:
// epistemic-type values are lowercase in spec text, schemas, vectors, code).
const CANONICAL_EPISTEMIC_TYPES = [
  "observed_event",
  "system_of_record_fact",
  "producer_claim",
  "human_report",
  "semantic_judgment",
  "derived_metric",
  "adjudication",
  "obligation_reference",
];

describe("epistemic types", () => {
  it("lowercase is canonical: the tier map is keyed by exactly the closed set's lowercase tokens", () => {
    expect(Object.keys(panels().RAISES_TO).sort()).toEqual([...CANONICAL_EPISTEMIC_TYPES].sort());
    for (const t of CANONICAL_EPISTEMIC_TYPES) {
      expect(panels().epistemicTypeOf(t)).toEqual({ value: t, as_written: t, recognized: true, legacy_case: false });
      expect(panels().raisesTo(t).assurance).not.toBe("unknown epistemic type");
    }
  });

  it("the example's sources come out as canonical lowercase tokens, all recognized", () => {
    const out = panels().coverageGaps(result(), contract());
    const sources = out.requirements.flatMap((r) => r.sources).filter((s) => s.epistemic_type !== null);
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(CANONICAL_EPISTEMIC_TYPES).toContain(s.epistemic_type);
      expect(s.epistemic_type_as_written).toBe(s.epistemic_type);
      expect(s.epistemic_type_recognized).toBe(true);
    }
  });

  it("a legacy uppercase value from another tool is folded to lowercase for lookup and shown as recognized", () => {
    for (const t of CANONICAL_EPISTEMIC_TYPES) {
      const upper = t.toUpperCase();
      expect(panels().epistemicTypeOf(upper)).toEqual({ value: t, as_written: upper, recognized: true, legacy_case: true });
      expect(panels().raisesTo(upper)).toEqual(panels().raisesTo(t));
    }
    // A coverage row written by an uppercase producer: same tier, same
    // recommendation, the value normalized, the spelling kept beside it.
    const r = result();
    const row = r.coverage_report.requirements.find((x) => x.requirement_ref === "release_notes_published");
    row.sources.forEach((s) => { s.epistemic_type = s.epistemic_type.toUpperCase(); });
    const notes = req(panels().coverageGaps(r, contract()), "release_notes_published");
    expect(notes.recommendations[0].tier).toEqual({ tier: "recomputed", assurance: "Verifiable" });
    const log = notes.sources.find((s) => s.source === "docs-site-publication-log");
    expect(log).toMatchObject({ epistemic_type: "observed_event", epistemic_type_as_written: "OBSERVED_EVENT", epistemic_type_recognized: true });
  });

  it("the engine's vendored contract is canonical lowercase: recognized, no legacy fold", () => {
    const accepted = engineContract().requirements.flatMap((r) => (r.evidence_requirements || {}).accepted_epistemic_types || []);
    expect(accepted.length).toBeGreaterThan(0);
    for (const t of accepted) {
      expect(panels().epistemicTypeOf(t)).toEqual({ value: t, as_written: t, recognized: true, legacy_case: false });
      expect(CANONICAL_EPISTEMIC_TYPES).toContain(t);
    }
  });

  it("a genuinely unknown value is kept exactly as written and shown as unrecognized, never dropped", () => {
    expect(panels().epistemicTypeOf("Vibes_Based_Assertion")).toEqual({
      value: "Vibes_Based_Assertion", as_written: "Vibes_Based_Assertion", recognized: false, legacy_case: false,
    });
    expect(panels().raisesTo("vibes_based_assertion")).toEqual({ tier: null, assurance: "unknown epistemic type" });
    const r = result();
    const row = r.coverage_report.requirements.find((x) => x.requirement_ref === "release_notes_published");
    row.sources.forEach((s) => { s.epistemic_type = "vibes_based_assertion"; });
    const notes = req(panels().coverageGaps(r, contract()), "release_notes_published");
    expect(notes.sources.length).toBe(row.sources.length);
    for (const s of notes.sources) {
      expect(s).toMatchObject({ epistemic_type: "vibes_based_assertion", epistemic_type_as_written: "vibes_based_assertion", epistemic_type_recognized: false });
    }
    expect(notes.recommendations[0].tier).toEqual({ tier: null, assurance: "unknown epistemic type" });
  });
});

describe("obligationTree", () => {
  it("groups requirements under the coverage report's obligation_refs, with the register row beside each", () => {
    const out = panels().obligationTree(result(), contract(), register());
    expect(out.issues).toEqual([]);
    expect(out.refs_from).toBe("coverage_report");
    expect(out.obligations.map((o) => o.obligation_ref)).toEqual(["CM-4.2", "CM-5.1", "CM-7.1", "CM-6.3"]);
    const risk = out.obligations[0];
    expect(risk.register_status).toBe("found");
    expect(risk.register_row).toMatchObject({
      source: "Example Change Management Policy (synthetic)",
      version: "2.0.0",
      effective_from: "2026-01-01",
      clause: { article: "§4.2 (Risk assessment)" },
    });
    expect(risk.requirements.map((r) => r.requirement_ref)).toEqual(["change_risk_assessed_correctly"]);
    expect(risk.counts).toEqual({ met: 4, not_met: 1, not_evaluable: 1 });
    expect(risk.requirements[0].claims[0]).toEqual({
      id: "R-101/change_risk_assessed_correctly",
      verdict: "met",
      sufficiency: "SATISFIED",
      tier: "judged",
      grade: "witnessed",
    });
  });

  it("a requirement citing two clauses appears under both", () => {
    const out = panels().obligationTree(result(), contract(), register());
    const cited = out.obligations.filter((o) =>
      o.requirements.some((r) => r.requirement_ref === "tests_passed_on_release_commit"),
    );
    expect(cited.map((o) => o.obligation_ref)).toEqual(["CM-5.1", "CM-7.1"]);
  });

  it("a cited clause missing from the register is shown and says so", () => {
    const out = panels().obligationTree(result(), contract(), register());
    const missing = out.obligations.find((o) => o.obligation_ref === "CM-7.1");
    expect(missing.register_status).toBe("not in the supplied register");
    expect(missing.register_row).toBeNull();
  });

  it("a requirement citing no clause is unmapped, never dropped", () => {
    const out = panels().obligationTree(result(), contract(), register());
    expect(out.unmapped.map((r) => r.requirement_ref)).toEqual(["deployment_observed"]);
    expect(out.unmapped[0].counts).toEqual({ met: 4, not_met: 1, not_evaluable: 1 });
  });

  it("without a coverage report, falls back to the contract's obligation_refs and inline clause_ref", () => {
    const c = contract();
    c.requirements[2].clause_ref = "CM-8.0";
    const out = panels().obligationTree(plainResult(), c, register());
    expect(out.refs_from).toBe("contract");
    expect(out.unmapped).toEqual([]);
    expect(out.obligations.find((o) => o.obligation_ref === "CM-8.0").requirements[0].requirement_ref).toBe(
      "deployment_observed",
    );
  });

  it("the engine's fixture traces all three requirements to the one clause they cite", () => {
    const out = panels().obligationTree(engineResult(), engineContract());
    expect(out.obligations).toHaveLength(1);
    expect(out.obligations[0]).toMatchObject({
      obligation_ref: "eu-ai-act:article-14",
      register_status: "no register supplied",
      counts: { met: 1, not_met: 0, not_evaluable: 2 },
    });
    expect(out.obligations[0].requirements.map((r) => r.requirement_ref)).toEqual([
      "req-human-role-1",
      "req-human-role-2",
      "req-human-role-3",
    ]);
  });

  it("without a register the tree still traces clause to status and says the clause detail is not shown", () => {
    const out = panels().obligationTree(result(), contract());
    expect(out.issues).toEqual(["no register input -- clause text, source and effective dates are not shown"]);
    expect(out.obligations.every((o) => o.register_status === "no register supplied")).toBe(true);
  });

  it("with neither a coverage report nor a contract it says so", () => {
    const out = panels().obligationTree(plainResult());
    expect(out.obligations).toEqual([]);
    expect(out.issues).toEqual(["neither a coverage_report nor a contract -- obligations cannot be traced"]);
  });

  it("a duplicate register row id is reported and the first is used", () => {
    const reg = register();
    reg.rows.push({ ...reg.rows[0], version: "9.9.9" });
    const out = panels().obligationTree(result(), contract(), reg);
    expect(out.issues).toEqual(['register row id "CM-4.2" appears twice -- the first is used']);
    expect(out.obligations[0].register_row.version).toBe("2.0.0");
  });
});
