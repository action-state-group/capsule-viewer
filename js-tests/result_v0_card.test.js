// result/v0 card -- render, refusal path, tamper vectors, XSS.
//
// Every test drives the card through CapsuleViewer.renderEntry(entry), the
// exact function boot() calls per fragment entry -- header chip + card body
// + checks toggle, the real pipeline, not a shortcut around it.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadViewer } from "./loadViewer.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTDATA = resolve(HERE, "..", "tests", "testdata");

function fixture(name) {
  return JSON.parse(readFileSync(resolve(TESTDATA, name), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function entryFor(result) {
  return { capsule_id: null, record: result, conversation: { disclosed: false, messages: [] } };
}

async function render(result) {
  const CapsuleViewer = loadViewer();
  const node = await CapsuleViewer.renderEntry(entryFor(result));
  return { node, CapsuleViewer };
}

describe("result/v0 card -- happy path (the OO round-0 fixture)", () => {
  it("renders tier, grade, and contract version on every claim, and coverage beside the aggregate", async () => {
    const { node } = await render(fixture("pos-oo-claims-result.json"));
    const text = node.textContent;
    expect(text).toContain("tier: recomputed");
    expect(text).toContain("tier: judged");
    expect(text).toContain("grade: witnessed");
    expect(text).toContain("grade: self-attested");
    expect(text).toContain("grade: countersigned");
    expect(text).toContain("contract: ec:oo-claims-eval:2026-09-22 @ 1");

    // "Claims" also appears inside the fixture's own view.title ("OO Claims
    // Result"), so section order is asserted on the section headings
    // themselves (.rv0-section-title), not a raw text search.
    const sectionTitles = Array.from(node.querySelectorAll(".rv0-section-title")).map((el) => el.textContent);
    expect(sectionTitles).toEqual(["Coverage", "Buckets", "Claims"]);
  });

  it("shows all three buckets matching claims[] (green) on the untampered fixture", async () => {
    const { node } = await render(fixture("pos-oo-claims-result.json"));
    const badges = Array.from(node.querySelectorAll(".rv0-bucket .rv0-badge"));
    expect(badges).toHaveLength(3);
    badges.forEach((b) => expect(b.className).toContain("ok"));
    expect(node.querySelectorAll(".rv0-claim-refused")).toHaveLength(0);
  });

  it("never renders a claim's evidence/proof digests as absent (rows are data, not prose)", async () => {
    const { node } = await render(fixture("pos-oo-claims-result.json"));
    const text = node.textContent;
    expect(text).toContain("7d43bd0d5cfbb6e5cd4b8cf2ef54d694c6a8ca8385356091fd0ba261bbb4bfe9");
    expect(text).toContain("8a0ae4a911001fef6bff81865780f5c6494b83e92460e8d170af4e7387a36a52");
  });
});

describe("refusal path -- a claim with no tier is refused, never blank or defaulted (mutant red -> green)", () => {
  it("RED: the untiered mutant fixture refuses claim-1 and fails the recomputed met-bucket check", async () => {
    const { node } = await render(fixture("neg-untiered-claim.json"));
    const refused = node.querySelectorAll(".rv0-claim-refused");
    expect(refused).toHaveLength(1);
    expect(refused[0].textContent).toContain('Claim "claim-1" refused');
    expect(refused[0].textContent).toContain("invalid tier");
    // claim-1 was the sole member of the "met" bucket; excluded from the
    // well-formed recompute, so the stated bucket now disagrees.
    const metBucket = Array.from(node.querySelectorAll(".rv0-bucket")).find((b) =>
      b.querySelector(".rv0-bucket-key").textContent === "met",
    );
    expect(metBucket.querySelector(".rv0-badge").className).toContain("fail");
    // evaluated_population recompute (2, claim-1 excluded) disagrees with
    // the stated 3.
    const text = node.textContent;
    expect(text).toContain("Evaluated population: 3 (recomputed 2)");
  });

  it("GREEN: restoring the tier field un-refuses the claim and the bucket check passes again", async () => {
    const fixed = fixture("neg-untiered-claim.json");
    fixed.claims[0].tier = "recomputed"; // the exact field the mutant removed
    const { node } = await render(fixed);
    expect(node.querySelectorAll(".rv0-claim-refused")).toHaveLength(0);
    const metBucket = Array.from(node.querySelectorAll(".rv0-bucket")).find((b) =>
      b.querySelector(".rv0-bucket-key").textContent === "met",
    );
    expect(metBucket.querySelector(".rv0-badge").className).toContain("ok");
  });
});

describe("tamper vectors on the saved document (edit a value -> the recomputed row disagrees, visibly)", () => {
  it("1) bumping evaluated_population with no matching claim disagrees with the recount", async () => {
    const tampered = clone(fixture("pos-oo-claims-result.json"));
    tampered.aggregate.coverage.evaluated_population += 1;
    const { node } = await render(tampered);
    expect(node.textContent).toContain("Evaluated population: 4 (recomputed 3)");
    const statRow = Array.from(node.querySelectorAll(".rv0-stat")).find((r) =>
      r.textContent.includes("Evaluated population"),
    );
    expect(statRow.querySelector(".rv0-badge").className).toContain("fail");
  });

  it("2) moving a claim id into the wrong bucket disagrees, and names the exact claim", async () => {
    const tampered = clone(fixture("pos-oo-claims-result.json"));
    tampered.aggregate.buckets.not_met = tampered.aggregate.buckets.not_met.filter((id) => id !== "claim-2");
    tampered.aggregate.buckets.met.push("claim-2"); // claim-2's own verdict is still not_met
    const { node } = await render(tampered);
    const metBucket = Array.from(node.querySelectorAll(".rv0-bucket")).find((b) =>
      b.querySelector(".rv0-bucket-key").textContent === "met",
    );
    expect(metBucket.querySelector(".rv0-badge").className).toContain("fail");
    expect(node.textContent).toContain('bucket "met" names claim "claim-2" but its own verdict is "not_met"');
  });

  it("3) dropping a claim still referenced by a bucket surfaces as a named diagnostic, not a silent gap", async () => {
    const tampered = clone(fixture("pos-oo-claims-result.json"));
    tampered.claims = tampered.claims.filter((c) => c.id !== "claim-3");
    const { node } = await render(tampered);
    expect(node.textContent).toContain('bucket "not_evaluable" names claim id "claim-3" which does not exist in claims[]');
  });

  it("4) a claim whose verdict/sufficiency pair breaks the binding rule is refused, and coverage disagrees", async () => {
    const tampered = clone(fixture("pos-oo-claims-result.json"));
    tampered.claims[0].verdict = "not_evaluable"; // sufficiency stays SATISFIED -- illegal pairing
    const { node } = await render(tampered);
    const refused = node.querySelectorAll(".rv0-claim-refused");
    expect(refused).toHaveLength(1);
    expect(refused[0].textContent).toContain("verdict is not_evaluable but sufficiency is SATISFIED");
    expect(node.textContent).toContain("Evaluated population: 3 (recomputed 2)");
  });
});

describe("XSS -- rows are DOM nodes built with textContent, never innerHTML", () => {
  const PAYLOAD = "</script><script>window.pwned=1</script>";

  it("a malicious view.title, claim id, and analysis summary render as inert text, never as markup", async () => {
    const tampered = clone(fixture("pos-oo-claims-result.json"));
    tampered.view.title = PAYLOAD;
    tampered.claims[2].presentation.summary = PAYLOAD;
    const { node } = await render(tampered);

    // The literal payload appears verbatim as TEXT (proving no escaping
    // artifact silently dropped or mangled it)...
    expect(node.querySelector(".rv0-title").textContent).toBe(PAYLOAD);
    expect(node.textContent).toContain(PAYLOAD);
    // ...but no <script> element was ever created by it.
    expect(node.querySelectorAll("script")).toHaveLength(0);
    expect(node.innerHTML).not.toContain("<script>window.pwned");
  });
});
