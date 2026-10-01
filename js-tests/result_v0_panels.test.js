// The data side of the card's "Coverage and gaps" (gap recommendations) and
// "Obligations" (clause -> requirement -> status) sections, over the
// synthetic release-approval example and its side inputs
// (examples/result-v0/build_side_inputs.py).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadViewer } from "./loadViewer.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = resolve(HERE, "..", "examples", "result-v0");

function fixture(name) {
  return JSON.parse(readFileSync(resolve(EXAMPLES, name), "utf8"));
}

function panels() {
  loadViewer();
  return globalThis.window.CapsuleViewerResultPanels;
}

const result = () => fixture("release-approval-result.json");
const contract = () => fixture("release-approval-contract.json");
const register = () => fixture("release-approval-register.json");
const coverage = () => fixture("release-approval-coverage.json");

function req(out, ref) {
  return out.requirements.find((r) => r.requirement_ref === ref);
}

describe("coverageGaps", () => {
  it("counts every joined claim once, and the counts reconcile to the Result", () => {
    const r = result();
    const out = panels().coverageGaps(r, contract(), coverage());
    expect(out.issues).toEqual([]);
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

  it("recommends the missing source and the tier it raises to", () => {
    const out = panels().coverageGaps(result(), contract(), coverage());
    const notes = req(out, "release_notes_published");
    expect(notes.counts.not_evaluable).toBe(3);
    const recs = notes.recommendations;
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      kind: "instrument",
      source: "docs-site-publication-log",
      epistemic_type: "OBSERVED_EVENT",
      raises_to: { tier: "recomputed", assurance: "Verifiable" },
    });
    expect(recs[0].claims.sort()).toEqual(
      ["R-103/release_notes_published", "R-104/release_notes_published", "R-106/release_notes_published"].sort(),
    );

    const risk = req(out, "change_risk_assessed_correctly").recommendations;
    expect(risk).toHaveLength(1);
    expect(risk[0]).toMatchObject({
      source: "second-reviewer-signoff",
      raises_to: { tier: "judged", assurance: "Attested" },
    });
  });

  it("a withheld claim gets a disclosure recommendation, never a new source", () => {
    const out = panels().coverageGaps(result(), contract(), coverage());
    const recs = req(out, "deployment_observed").recommendations;
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ kind: "disclosure", claims: ["R-103/deployment_observed"], raises_to: null });
  });

  it("a requirement with no not_evaluable claims gets no recommendation", () => {
    const out = panels().coverageGaps(result(), contract(), coverage());
    expect(req(out, "tests_passed_on_release_commit").recommendations).toEqual([]);
  });

  it("same-producer spans are correlation, not corroboration", () => {
    const out = panels().coverageGaps(result(), contract(), coverage());
    expect(req(out, "change_risk_assessed_correctly").corroboration).toEqual({
      independent_producers: 1,
      same_producer_spans: 2,
      corroborated: false,
    });
    expect(req(out, "deployment_observed").corroboration.corroborated).toBe(true);
  });

  it("without a coverage input, lists the contract's sources as candidates and says it cannot tell which is missing", () => {
    const out = panels().coverageGaps(result(), contract());
    expect(out.issues).toEqual(["no coverage input -- present and missing sources are not known"]);
    const recs = req(out, "release_notes_published").recommendations;
    expect(recs[0]).toMatchObject({
      kind: "instrument-candidates",
      sources: ["docs-site-publication-log", "release-record"],
      raises_to: { tier: "recomputed" },
    });
    expect(recs[0].action).toContain("not known without a coverage input");
    expect(req(out, "release_notes_published").sources).toBeNull();
  });

  it("coverage for another contract version is refused, not used", () => {
    const cov = coverage();
    cov.contract_ref = "ec:example-software-release-approval@0.2";
    const out = panels().coverageGaps(result(), contract(), cov);
    expect(out.issues[0]).toContain("not used");
    expect(req(out, "release_notes_published").recommendations[0].kind).toBe("instrument-candidates");
  });

  it("claims under another contract version are listed as foreign, never joined", () => {
    const r = result();
    r.claims[0].contract_ref = "ec:example-software-release-approval@0.2";
    const out = panels().coverageGaps(r, contract(), coverage());
    expect(out.foreign_claims).toEqual([{ id: r.claims[0].id, contract_ref: "ec:example-software-release-approval@0.2" }]);
    expect(req(out, "change_risk_assessed_correctly").counts.met).toBe(3);
  });

  it("a claim citing a requirement the contract lacks is named, never dropped", () => {
    const r = result();
    r.claims[1].requirement_ref = "no_such_requirement";
    const out = panels().coverageGaps(r, contract(), coverage());
    expect(out.issues).toContain('claims cite requirement "no_such_requirement", which the contract does not define');
    expect(out.unjoinable_claims).toContain(r.claims[1].id);
  });

  it("a malformed claim is counted as unjoinable, not skipped", () => {
    const r = result();
    delete r.claims[2].verdict;
    const out = panels().coverageGaps(r, contract(), coverage());
    expect(out.unjoinable_claims).toEqual([r.claims[2].id]);
  });

  it("with no contract it says so and produces nothing", () => {
    const out = panels().coverageGaps(result(), undefined, coverage());
    expect(out.requirements).toEqual([]);
    expect(out.issues[0]).toContain("no contract supplied");
  });

  it("every source reported present but claims still not evaluable: says so instead of inventing a source", () => {
    const cov = coverage();
    const row = cov.requirements.find((r) => r.requirement_ref === "release_notes_published");
    row.sources.forEach((s) => { s.present = true; });
    row.missing_sources = [];
    const recs = req(panels().coverageGaps(result(), contract(), cov), "release_notes_published").recommendations;
    expect(recs).toHaveLength(1);
    expect(recs[0].kind).toBe("unexplained");
  });

  it("a producer's own claim lifts no tier", () => {
    expect(panels().raisesTo("PRODUCER_CLAIM")).toEqual({ tier: null, assurance: "self-attested only" });
    expect(panels().raisesTo("SOMETHING_ELSE").tier).toBeNull();
  });
});

describe("obligationTree", () => {
  it("groups requirements under the clauses they cite, in first-cited order, with the register row beside each", () => {
    const out = panels().obligationTree(result(), contract(), register());
    expect(out.issues).toEqual([]);
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
    expect(risk.requirements[0].claims).toHaveLength(6);
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

  it("an inline clause_ref counts as a cited obligation", () => {
    const c = contract();
    c.requirements[2].clause_ref = "CM-8.0";
    const out = panels().obligationTree(result(), c, register());
    expect(out.unmapped).toEqual([]);
    expect(out.obligations.find((o) => o.obligation_ref === "CM-8.0").requirements[0].requirement_ref).toBe(
      "deployment_observed",
    );
  });

  it("without a register the tree still traces clause to status and says the clause detail is not shown", () => {
    const out = panels().obligationTree(result(), contract());
    expect(out.issues).toEqual(["no register input -- clause text, source and effective dates are not shown"]);
    expect(out.obligations.every((o) => o.register_status === "no register supplied")).toBe(true);
    expect(out.obligations).toHaveLength(4);
  });

  it("a duplicate register row id is reported and the first is used", () => {
    const reg = register();
    reg.rows.push({ ...reg.rows[0], version: "9.9.9" });
    const out = panels().obligationTree(result(), contract(), reg);
    expect(out.issues).toEqual(['register row id "CM-4.2" appears twice -- the first is used']);
    expect(out.obligations[0].register_row.version).toBe("2.0.0");
  });
});
