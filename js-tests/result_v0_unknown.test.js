// result/v0 card -- UNKNOWN sufficiency. The two pos-unknown-* fixtures are
// built by capsule-engine's emitter (same bytes in both repos). A reader that
// drops UNKNOWN claims, or shows UNKNOWN as another sufficiency, must fail
// here: the rendered sufficiency of every claim is pinned in order, and the
// card's own recount of unknown_count must agree with the stated one.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadViewer } from "./loadViewer.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTDATA = resolve(HERE, "..", "tests", "testdata");

const EXPECTED = {
  "pos-unknown-claim-result.json": { sufficiencies: ["SATISFIED", "UNKNOWN"], unknown: 1, population: 2 },
  "pos-unknown-count-aggregate-result.json": {
    sufficiencies: ["SATISFIED", "UNKNOWN", "GAP", "SATISFIED", "UNKNOWN", "INSUFFICIENT"],
    unknown: 2,
    population: 6,
  },
};

function fixture(name) {
  return JSON.parse(readFileSync(resolve(TESTDATA, name), "utf8"));
}

async function render(result) {
  const CapsuleViewer = loadViewer();
  return CapsuleViewer.renderEntry({ capsule_id: null, record: result, conversation: { disclosed: false, messages: [] } });
}

function renderedSufficiencies(node) {
  return Array.from(node.querySelectorAll(".rv0-claim .rv0-verdict-line")).map(
    (el) => el.textContent.match(/sufficiency: (\S+)/)[1],
  );
}

function statRow(node, label) {
  return Array.from(node.querySelectorAll(".rv0-stat")).find((r) => r.textContent.includes(label));
}

function remapUnknown(doc, to) {
  doc.claims.forEach((c) => {
    if (c.sufficiency === "UNKNOWN") c.sufficiency = to;
  });
  return doc;
}

describe.each(Object.keys(EXPECTED))("UNKNOWN fixture %s", (name) => {
  const want = EXPECTED[name];

  it("renders every claim, UNKNOWN included, with its sufficiency in order", async () => {
    const node = await render(fixture(name));
    expect(node.querySelectorAll(".rv0-claim-refused")).toHaveLength(0);
    expect(renderedSufficiencies(node)).toEqual(want.sufficiencies);
    expect(node.textContent).toContain("sufficiency: UNKNOWN -- verdict: not_evaluable");
  });

  it("recounts unknown_count and evaluated_population from claims[] and agrees with the stated aggregate", async () => {
    const node = await render(fixture(name));
    const unknownRow = statRow(node, "Unresolved (unknown)");
    expect(unknownRow.textContent).toContain(`Unresolved (unknown): ${want.unknown} (recomputed ${want.unknown})`);
    expect(unknownRow.querySelector(".rv0-badge").className).toContain("ok");
    const populationRow = statRow(node, "Evaluated population");
    expect(populationRow.textContent).toContain(`Evaluated population: ${want.population} (recomputed ${want.population})`);
    expect(populationRow.querySelector(".rv0-badge").className).toContain("ok");
  });

  it("RED: claims remapped UNKNOWN -> GAP under the stated aggregate -- the unknown recount disagrees", async () => {
    const node = await render(remapUnknown(fixture(name), "GAP"));
    const unknownRow = statRow(node, "Unresolved (unknown)");
    expect(unknownRow.textContent).toContain(`Unresolved (unknown): ${want.unknown} (recomputed 0)`);
    expect(unknownRow.querySelector(".rv0-badge").className).toContain("fail");
  });

  it("RED: UNKNOWN claims dropped under the stated aggregate -- population and buckets disagree", async () => {
    const doc = fixture(name);
    const dropped = doc.claims.filter((c) => c.sufficiency === "UNKNOWN").map((c) => c.id);
    doc.claims = doc.claims.filter((c) => c.sufficiency !== "UNKNOWN");
    const node = await render(doc);
    const populationRow = statRow(node, "Evaluated population");
    expect(populationRow.querySelector(".rv0-badge").className).toContain("fail");
    dropped.forEach((id) =>
      expect(node.textContent).toContain(`bucket "not_evaluable" names claim id "${id}" which does not exist in claims[]`),
    );
  });

  it("RED: a self-consistent remap (claims and unknown_count both rewritten) renders green, so only the pin catches it", async () => {
    const doc = remapUnknown(fixture(name), "GAP");
    doc.aggregate.coverage.unknown_count = 0;
    const node = await render(doc);
    expect(statRow(node, "Unresolved (unknown)").querySelector(".rv0-badge").className).toContain("ok");
    expect(renderedSufficiencies(node)).not.toEqual(want.sufficiencies);
  });
});
