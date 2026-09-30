// Example Result v0 fixtures (examples/result-v0/) -- what the card shows
// for each file. These pin the signal each file exists to show: the positive renders clean with the gap bucket
// separate from the failure bucket; the hand-edited copy shows a visible
// recount disagreement; the untiered copy shows a refusal row.
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

async function render(result) {
  const CapsuleViewer = loadViewer();
  return CapsuleViewer.renderEntry({ capsule_id: null, record: result, conversation: { disclosed: false, messages: [] } });
}

function bucketRow(node, key) {
  return Array.from(node.querySelectorAll(".rv0-bucket")).find(
    (row) => row.querySelector(".rv0-bucket-key").textContent === key,
  );
}

describe("example Result v0 fixtures", () => {
  it("the positive renders every claim, all checks agreeing, gaps apart from failures", async () => {
    const result = fixture("release-approval-result.json");
    const node = await render(result);
    expect(node.querySelectorAll(".rv0-claim").length).toBe(result.claims.length);
    expect(node.querySelectorAll(".rv0-claim-refused").length).toBe(0);
    expect(node.querySelectorAll(".rv0-badge.fail").length).toBe(0);
    expect(bucketRow(node, "met").querySelector(".rv0-bucket-count").textContent).toBe("16");
    expect(bucketRow(node, "not_met").querySelector(".rv0-bucket-count").textContent).toBe("3");
    expect(bucketRow(node, "not_evaluable").querySelector(".rv0-bucket-count").textContent).toBe("5");
    expect(bucketRow(node, "not_met").textContent).not.toContain("R-103/release_notes_published");
    expect(node.textContent).toContain("contract: ec:example-software-release-approval @ 0.3");
  });

  it("the hand-edited copy shows the met and not_evaluable buckets disagreeing with the claims", async () => {
    const node = await render(fixture("release-approval-result-hand-edited.json"));
    for (const key of ["met", "not_evaluable"]) {
      expect(bucketRow(node, key).querySelector(".rv0-badge.fail")).not.toBeNull();
    }
    expect(bucketRow(node, "not_met").querySelector(".rv0-badge.fail")).toBeNull();
    expect(node.textContent).toContain(
      'bucket "met" names claim "R-103/release_notes_published" but its own verdict is "not_evaluable"',
    );
  });

  it("the untiered copy refuses the claim visibly and the recount disagrees", async () => {
    const result = fixture("release-approval-result-untiered.json");
    const node = await render(result);
    const refused = node.querySelectorAll(".rv0-claim-refused");
    expect(refused.length).toBe(1);
    expect(refused[0].textContent).toContain(result.claims[0].id);
    // a refused row is still a row (.rv0-claim.rv0-claim-refused): none dropped
    expect(node.querySelectorAll(".rv0-claim").length).toBe(result.claims.length);
    expect(node.querySelector(".rv0-coverage .rv0-badge.fail")).not.toBeNull();
  });
});
