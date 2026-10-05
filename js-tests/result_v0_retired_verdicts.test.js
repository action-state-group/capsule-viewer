// Retired verdict spellings on already-sealed results.
//
// The verdict vocabulary is met / not_met / not_evaluable. Results sealed
// before that settled may spell not_evaluable as "insufficient_evidence".
// The card reads it as an alias, renders one spelling, says which spelling
// the sealed record carries, and never modifies the record itself.
//
// "not_applicable" is not a retired spelling. It names a requirement
// excluded from the evaluated population and was never a verdict, so a claim
// carrying it is refused as a defect, never read as not_evaluable. Any other
// unknown verdict is refused too.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadViewer } from "./loadViewer.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTDATA = resolve(HERE, "..", "tests", "testdata");
const EXAMPLES = resolve(HERE, "..", "examples", "result-v0");

function read(dir, name) {
  return JSON.parse(readFileSync(resolve(dir, name), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function render(result) {
  const CapsuleViewer = loadViewer();
  return CapsuleViewer.renderEntry({ capsule_id: null, record: result, conversation: { disclosed: false, messages: [] } });
}

function claimRow(node, id) {
  return Array.from(node.querySelectorAll(".rv0-claim")).find((el) => el.querySelector(".rv0-claim-id")?.textContent === id);
}

function bucketRow(node, key) {
  return Array.from(node.querySelectorAll(".rv0-bucket")).find((b) => b.querySelector(".rv0-bucket-key").textContent === key);
}

// The fixture's one not_evaluable claim, re-spelled the way an older sealed
// record carries it.
function withRetiredSpelling(spelling, { bucketKey } = {}) {
  const doc = clone(read(TESTDATA, "pos-example-org-claims-result.json"));
  const id = doc.aggregate.buckets.not_evaluable[0];
  doc.claims.find((c) => c.id === id).verdict = spelling;
  if (bucketKey) {
    doc.aggregate.buckets[bucketKey] = doc.aggregate.buckets.not_evaluable;
    delete doc.aggregate.buckets.not_evaluable;
  }
  return { doc, id };
}

describe("result/v0 card -- retired verdict spellings", () => {
  for (const spelling of ["insufficient_evidence"]) {
    it(`reads a sealed "${spelling}" as not_evaluable and renders only the canonical spelling`, async () => {
      const { doc, id } = withRetiredSpelling(spelling);
      const node = await render(doc);
      expect(node.querySelectorAll(".rv0-claim-refused")).toHaveLength(0);
      const row = claimRow(node, id);
      expect(row.querySelector(".rv0-verdict-line").textContent).toMatch(/verdict: not_evaluable$/);
      expect(row.querySelector(".rv0-retired-verdict").textContent).toContain(`"${spelling}"`);
      expect(bucketRow(node, "not_evaluable").querySelector(".rv0-badge").className).toContain("ok");
      expect(node.querySelector(".rv0-diagnostic")).toBeNull();
      expect(node.textContent).not.toContain(`verdict: ${spelling}`);
    });

    it(`reads a stated "${spelling}" bucket as the not_evaluable bucket`, async () => {
      const { doc, id } = withRetiredSpelling(spelling, { bucketKey: spelling });
      const node = await render(doc);
      const bucket = bucketRow(node, "not_evaluable");
      expect(bucket.querySelector(".rv0-badge").className).toContain("ok");
      expect(bucket.textContent).toContain(id);
      expect(bucketRow(node, spelling)).toBeUndefined();
    });
  }

  it("never modifies the sealed record it reads", async () => {
    const { doc } = withRetiredSpelling("insufficient_evidence", { bucketKey: "insufficient_evidence" });
    const before = clone(doc);
    await render(doc);
    expect(doc).toEqual(before);
  });

  it("a claim already spelled not_evaluable carries no retired-spelling note", async () => {
    const node = await render(read(TESTDATA, "pos-example-org-claims-result.json"));
    expect(node.querySelector(".rv0-retired-verdict")).toBeNull();
  });

  it("an unknown verdict that is not a retired spelling is still refused", async () => {
    const { doc, id } = withRetiredSpelling("inconclusive");
    const node = await render(doc);
    const refused = node.querySelectorAll(".rv0-claim-refused");
    expect(refused).toHaveLength(1);
    expect(refused[0].textContent).toContain(id);
    expect(refused[0].textContent).toContain("missing or invalid verdict");
  });
});

describe("result/v0 panels -- retired verdict spellings", () => {
  it("canonicalVerdict maps the retired spelling and passes every other value through, not_applicable included", () => {
    loadViewer();
    const { canonicalVerdict } = globalThis.window.CapsuleViewerResultPanels;
    expect(canonicalVerdict("insufficient_evidence")).toBe("not_evaluable");
    for (const v of ["met", "not_met", "not_evaluable", "not_applicable", "inconclusive"]) expect(canonicalVerdict(v)).toBe(v);
  });

  it("the obligation view joins a retired-spelling claim and counts it as not_evaluable", () => {
    loadViewer();
    const { obligationTree } = globalThis.window.CapsuleViewerResultPanels;
    const result = read(EXAMPLES, "release-approval-result.json");
    const contract = read(EXAMPLES, "release-approval-contract.json");
    const register = read(EXAMPLES, "release-approval-register.json");
    const baseline = obligationTree(result, contract, register);

    const retired = clone(result);
    retired.claims.filter((c) => c.verdict === "not_evaluable").forEach((c) => { c.verdict = "insufficient_evidence"; });
    const tree = obligationTree(retired, contract, register);

    expect(tree.unjoinable_claims).toEqual(baseline.unjoinable_claims);
    expect(tree.obligations.map((o) => o.counts)).toEqual(baseline.obligations.map((o) => o.counts));
    const shown = tree.obligations.flatMap((o) => o.requirements.flatMap((r) => r.claims.map((c) => c.verdict)));
    expect(shown).not.toContain("insufficient_evidence");
  });
});

describe("result/v0 -- not_applicable in a verdict field is a defect, never not_evaluable", () => {
  it("the card refuses the claim and names why", async () => {
    const { doc, id } = withRetiredSpelling("not_applicable");
    const node = await render(doc);
    const refused = node.querySelectorAll(".rv0-claim-refused");
    expect(refused).toHaveLength(1);
    expect(refused[0].textContent).toContain(id);
    expect(refused[0].textContent).toContain('verdict "not_applicable" is a population exclusion, not a verdict');
    expect(node.querySelector(".rv0-retired-verdict")).toBeNull();
  });

  it("the refused claim is not counted as evaluated, so the stated population disagrees visibly", async () => {
    const { doc } = withRetiredSpelling("not_applicable");
    const node = await render(doc);
    const stated = doc.aggregate.coverage.evaluated_population;
    const populationRow = Array.from(node.querySelectorAll(".rv0-stat")).find((r) => r.textContent.includes("Evaluated population"));
    expect(populationRow.textContent).toContain(`Evaluated population: ${stated} (recomputed ${stated - 1})`);
    expect(populationRow.querySelector(".rv0-badge").className).toContain("fail");
  });

  it("a stated not_applicable bucket is not read as the not_evaluable bucket", async () => {
    const { doc, id } = withRetiredSpelling("not_applicable", { bucketKey: "not_applicable" });
    const node = await render(doc);
    expect(bucketRow(node, "not_evaluable").textContent).not.toContain(id);
  });

  it("the obligation view leaves the claim unjoined rather than counting it not_evaluable", () => {
    loadViewer();
    const { obligationTree } = globalThis.window.CapsuleViewerResultPanels;
    const result = read(EXAMPLES, "release-approval-result.json");
    const contract = read(EXAMPLES, "release-approval-contract.json");
    const register = read(EXAMPLES, "release-approval-register.json");
    const doc = clone(result);
    const target = doc.claims.find((c) => c.verdict === "not_evaluable");
    target.verdict = "not_applicable";
    const tree = obligationTree(doc, contract, register);
    expect(tree.unjoinable_claims).toContain(target.id);
    const shown = tree.obligations.flatMap((o) => o.requirements.flatMap((r) => r.claims.map((c) => c.id)));
    expect(shown).not.toContain(target.id);
  });
});
