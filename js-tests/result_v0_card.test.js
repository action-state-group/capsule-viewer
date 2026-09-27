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

// ---------------------------------------------------------------------------
// Claim types (PROPOSED, Steven's ruling 2026-09-25): "close + reconcile as
// claim types in result v0 ... A_ONLY / B_ONLY must never render like
// CONFLICTING, and UNILATERAL never like AGREED. one side missing isn't a
// finding; both sides disagreeing is. ... i want negative fixtures pinning
// it rather than leaving it to styling. and anything that meets a claim type
// it doesn't recognize should show 'unrecognized', never drop the row."
// ---------------------------------------------------------------------------

const RECONCILE_STATES = ["MATCHED", "A_ONLY", "B_ONLY", "CONFLICTING", "INSUFFICIENT", "UNRESOLVED"];
// The claim's `tallies` keys: lowercase, as schemas/judge/close-v1.json's
// ReconcileTallies spells them; the rendered data-state stays the uppercase
// state name.
const tallyKey = (state) => state.toLowerCase();

function claimRow(node, claimId) {
  return Array.from(node.querySelectorAll(".rv0-claim")).find((c) => {
    const idEl = c.querySelector(".rv0-claim-id");
    return idEl ? idEl.textContent === claimId : c.textContent.includes(`"${claimId}"`);
  });
}

function reconcileRowsByState(claimEl) {
  const rows = {};
  claimEl.querySelectorAll(".rv0-reconcile-count").forEach((r) => {
    rows[r.getAttribute("data-state")] = r;
  });
  return rows;
}

describe("claim types -- reconcile: six counts as counts, one-sided is never a finding", () => {
  it("renders every claim type with its type label, and the pre-existing fixture still renders as `requirement`", async () => {
    const { node } = await render(fixture("pos-oo-claims-result.json"));
    Array.from(node.querySelectorAll(".rv0-claim-type")).forEach((t) => expect(t.textContent).toBe("type: requirement"));
    expect(node.querySelectorAll(".rv0-claim-refused")).toHaveLength(0);
    expect(node.querySelectorAll(".rv0-claim-unrecognized")).toHaveLength(0);
  });

  it("shows all six states as integer counts equal to the document's tallies -- never a ratio, never a percentage", async () => {
    const doc = fixture("pos-oo-reconcile-result.json");
    const { node } = await render(doc);
    const claimEl = claimRow(node, "reconcile-1");
    expect(claimEl.querySelector(".rv0-claim-type").textContent).toBe("type: reconcile");
    const rows = claimEl.querySelectorAll(".rv0-reconcile-count");
    expect(rows).toHaveLength(6);
    expect(Array.from(rows).map((r) => r.getAttribute("data-state"))).toEqual(RECONCILE_STATES);
    const byState = reconcileRowsByState(claimEl);
    RECONCILE_STATES.forEach((state) => {
      const countText = byState[state].querySelector(".rv0-rs-count").textContent;
      expect(countText).toMatch(/^\d+$/);
      expect(Number(countText)).toBe(doc.claims[1].reconcile.tallies[tallyKey(state)]);
    });
    const reconcileText = claimEl.querySelector(".rv0-reconcile").textContent;
    expect(reconcileText).not.toContain("%");
    expect(reconcileText).not.toMatch(/\d\s*\/\s*\d/); // no "408/412"-style ratio anywhere
    // Zero is a count too: INSUFFICIENT and UNRESOLVED are 0 here and still shown.
    expect(byState.INSUFFICIENT.querySelector(".rv0-rs-count").textContent).toBe("0");
    expect(byState.UNRESOLVED.querySelector(".rv0-rs-count").textContent).toBe("0");
  });

  it("A_ONLY and B_ONLY render as 'one side missing' in a class disjoint from CONFLICTING's 'both sides disagree'", async () => {
    const { node } = await render(fixture("pos-oo-reconcile-result.json"));
    const byState = reconcileRowsByState(claimRow(node, "reconcile-1"));
    const aOnly = byState.A_ONLY;
    const bOnly = byState.B_ONLY;
    const conflicting = byState.CONFLICTING;

    // Class: one-sided rows carry rv0-rs-one-sided and NOTHING that reads as a finding/conflict.
    [aOnly, bOnly].forEach((row) => {
      expect(row.className).toContain("rv0-rs-one-sided");
      expect(row.className).not.toContain("rv0-rs-finding");
      expect(row.className).not.toMatch(/finding|conflict/i);
      Array.from(row.querySelectorAll("*")).forEach((child) => expect(child.className).not.toMatch(/finding|conflict/i));
      expect(row.querySelector(".rv0-rs-label").textContent).toContain("one side missing");
      expect(row.textContent).not.toMatch(/conflict|disagree/i);
    });
    // CONFLICTING carries rv0-rs-finding and NOT the one-sided class.
    expect(conflicting.className).toContain("rv0-rs-finding");
    expect(conflicting.className).not.toContain("rv0-rs-one-sided");
    expect(conflicting.querySelector(".rv0-rs-label").textContent).toContain("both sides disagree");
    expect(conflicting.textContent).not.toContain("one side missing");

    // And the two are visibly different: different class sets, different labels.
    expect(aOnly.className).not.toBe(conflicting.className);
    expect(bOnly.className).not.toBe(conflicting.className);
    expect(aOnly.querySelector(".rv0-rs-label").textContent).not.toBe(conflicting.querySelector(".rv0-rs-label").textContent);
  });

  it("NEGATIVE: when one-sided rows are the only non-matched rows, no finding class attaches to them and CONFLICTING still shows the count 0", async () => {
    const { node } = await render(fixture("neg-render-reconcile-one-sided-only.json"));
    const claimEl = claimRow(node, "reconcile-1");
    expect(claimEl.className).not.toContain("rv0-claim-refused");
    const byState = reconcileRowsByState(claimEl);
    expect(byState.A_ONLY.querySelector(".rv0-rs-count").textContent).toBe("3");
    expect(byState.B_ONLY.querySelector(".rv0-rs-count").textContent).toBe("2");
    // The only element on the whole claim carrying the finding class is the
    // CONFLICTING row itself -- and it reads "0", not hidden, not "--".
    const findingEls = Array.from(claimEl.querySelectorAll('[class*="finding"], [class*="conflict"]'));
    expect(findingEls).toHaveLength(1);
    expect(findingEls[0].getAttribute("data-state")).toBe("CONFLICTING");
    expect(findingEls[0].querySelector(".rv0-rs-count").textContent).toBe("0");
    // No one-sided row is inside, or shares a class with, the finding element.
    [byState.A_ONLY, byState.B_ONLY].forEach((row) => {
      expect(findingEls[0].contains(row)).toBe(false);
      expect(row.className.split(/\s+/).some((c) => findingEls[0].className.split(/\s+/).includes(c) && c !== "rv0-reconcile-count")).toBe(false);
    });
  });

  it("NEGATIVE: tallies missing a state are refused -- the missing state is never rendered as zero, and the row is not dropped", async () => {
    const doc = fixture("neg-reconcile-tallies-missing-state.json");
    const { node } = await render(doc);
    expect(node.querySelectorAll(".rv0-claim")).toHaveLength(doc.claims.length);
    const refused = node.querySelectorAll(".rv0-claim-refused");
    expect(refused).toHaveLength(1);
    expect(refused[0].textContent).toContain('Claim "reconcile-1" refused');
    expect(refused[0].textContent).toContain("reconcile.tallies.unresolved missing");
    expect(refused[0].textContent).toContain("an absent state is never zero");
    expect(refused[0].querySelectorAll(".rv0-reconcile-count")).toHaveLength(0);
    // The well-formed reconcile-2 on the same document still renders its six counts.
    expect(claimRow(node, "reconcile-2").querySelectorAll(".rv0-reconcile-count")).toHaveLength(6);
  });

  it("the GAP reconcile (INSUFFICIENT 3) keeps its base axes untouched: sufficiency GAP, verdict not_evaluable, bucketed as such", async () => {
    const { node } = await render(fixture("pos-oo-reconcile-result.json"));
    const claimEl = claimRow(node, "reconcile-2");
    expect(claimEl.querySelector(".rv0-verdict-line").textContent).toBe("sufficiency: GAP -- verdict: not_evaluable");
    expect(reconcileRowsByState(claimEl).INSUFFICIENT.querySelector(".rv0-rs-count").textContent).toBe("3");
    const bucket = Array.from(node.querySelectorAll(".rv0-bucket")).find((b) => b.querySelector(".rv0-bucket-key").textContent === "not_evaluable");
    expect(bucket.querySelector(".rv0-badge").className).toContain("ok");
    expect(bucket.textContent).toContain("reconcile-2");
  });
});

describe("claim types -- close: three states; UNILATERAL never renders like AGREED, CONTESTED like neither", () => {
  // Everything a UNILATERAL row that names no peer must not carry.
  const AGREED_AFFORDANCES = ".rv0-close-agreed, .rv0-close-agreed-mark, .rv0-close-peer, .rv0-stamp";
  // Everything a CONTESTED row -- or a UNILATERAL row that names its peer --
  // must not carry: the peer line is legitimate there, but nothing that
  // reads as agreement.
  const AGREED_MARKS = ".rv0-close-agreed, .rv0-close-agreed-mark, .rv0-stamp";
  // The exact UNILATERAL class and label, pinned like CONTESTED's. The label
  // never says "acknowledges" -- that is AGREED's link word.
  const UNILATERAL_CLASS = "rv0-close-state rv0-close-unilateral";
  const UNILATERAL_LABEL = "UNILATERAL -- closed by this book alone; no peer record has responded to it";

  it("AGREED renders its own class and label, the agreed mark, the peer, and the peer's acknowledging Close by digest", async () => {
    const doc = fixture("pos-oo-close-agreed-result.json");
    const { node } = await render(doc);
    const claimEl = claimRow(node, "close-1");
    expect(claimEl.querySelector(".rv0-claim-type").textContent).toBe("type: close");
    const state = claimEl.querySelector(".rv0-close-state");
    expect(state.className).toContain("rv0-close-agreed");
    expect(state.className).not.toContain("rv0-close-unilateral");
    expect(state.textContent).toContain("AGREED");
    expect(claimEl.querySelector(".rv0-close-agreed-mark").textContent).toContain("oo-sor");
    expect(claimEl.querySelector(".rv0-close-peer").textContent).toBe("peer: oo-sor");
    expect(claimEl.querySelector(".rv0-close").textContent).toContain(doc.claims[1].close.peer_close_ref.digest);
  });

  it("UNILATERAL renders its own exact class and exact label -- neither AGREED's, and never AGREED's link word", async () => {
    const agreed = await render(fixture("pos-oo-close-agreed-result.json"));
    const unilateral = await render(fixture("pos-oo-close-unilateral-result.json"));
    const claimEl = claimRow(unilateral.node, "close-1");
    expect(claimEl.querySelector(".rv0-claim-type").textContent).toBe("type: close");
    const a = claimRow(agreed.node, "close-1").querySelector(".rv0-close-state");
    const u = claimEl.querySelector(".rv0-close-state");
    expect(u.className).toBe(UNILATERAL_CLASS);
    expect(u.textContent).toBe(UNILATERAL_LABEL);
    expect(u.className).not.toContain("rv0-close-agreed");
    expect(u.textContent).not.toMatch(/agreed|acknowledg/i);
    expect(u.className).not.toBe(a.className);
    expect(u.textContent).not.toBe(a.textContent);
    // Its base axes are untouched: the Close was sealed; the agreement axis is close_state alone.
    expect(claimEl.querySelector(".rv0-verdict-line").textContent).toBe("sufficiency: SATISFIED -- verdict: met");
  });

  it("NEGATIVE: a UNILATERAL close (no peer named) carries no agreed affordance, no peer affordance, and none of AGREED's wording", async () => {
    const { node } = await render(fixture("pos-oo-close-unilateral-result.json"));
    const claimEl = claimRow(node, "close-1");
    expect(claimEl.className).not.toContain("rv0-claim-refused");
    expect(claimEl.querySelectorAll(AGREED_AFFORDANCES)).toHaveLength(0);
    const closeBlock = claimEl.querySelector(".rv0-close");
    expect(closeBlock.textContent).not.toMatch(/agreed|acknowledg/i);
    expect(closeBlock.textContent).not.toContain("✓");
    expect(closeBlock.textContent).not.toMatch(/peer:/);
    expect(closeBlock.querySelectorAll(".rv0-badge, .rv0-mono")).toHaveLength(0);
    Array.from(closeBlock.querySelectorAll("*")).forEach((el) => expect(el.className).not.toMatch(/agreed|stamp|ok\b/));
    // ...and nowhere else on the page either (the base's recompute badges say "matches claims[]", not "agreed").
    expect(node.querySelectorAll(AGREED_AFFORDANCES)).toHaveLength(0);
  });

  it("a UNILATERAL close that names its peer renders the peer as unanswered -- same exact class and label, still no agreed affordance", async () => {
    const doc = fixture("pos-oo-close-unilateral-named-peer-result.json");
    const { node } = await render(doc);
    const claimEl = claimRow(node, "close-1");
    expect(claimEl.className).not.toContain("rv0-claim-refused");
    const state = claimEl.querySelector(".rv0-close-state");
    expect(state.className).toBe(UNILATERAL_CLASS);
    expect(state.textContent).toBe(UNILATERAL_LABEL);
    expect(claimEl.querySelector(".rv0-close-peer").textContent).toBe("peer: oo-sor -- no response from it");
    const closeBlock = claimEl.querySelector(".rv0-close");
    expect(closeBlock.textContent).not.toMatch(/agreed|acknowledg/i);
    expect(closeBlock.textContent).not.toContain("✓");
    expect(closeBlock.querySelectorAll(".rv0-mono")).toHaveLength(0); // nothing cited: no peer_close_ref on this fixture
    Array.from(closeBlock.querySelectorAll("*")).forEach((el) => expect(el.className).not.toMatch(/agreed|stamp|ok\b/));
    expect(node.querySelectorAll(AGREED_MARKS)).toHaveLength(0);
  });

  it("NEGATIVE: a UNILATERAL close that names AND cites its peer is rendered, not refused, and still carries nothing of AGREED's", async () => {
    const agreed = fixture("pos-oo-close-agreed-result.json");
    const tampered = clone(fixture("pos-oo-close-unilateral-named-peer-result.json"));
    tampered.claims[1].close.peer_close_ref = agreed.claims[1].close.peer_close_ref; // the peer's Close, reconciled with, not (yet) linking back
    const { node } = await render(tampered);
    expect(node.querySelectorAll(".rv0-claim")).toHaveLength(tampered.claims.length);
    expect(node.querySelectorAll(".rv0-claim-refused")).toHaveLength(0);
    const claimEl = claimRow(node, "close-1");
    const state = claimEl.querySelector(".rv0-close-state");
    expect(state.className).toBe(UNILATERAL_CLASS);
    expect(state.textContent).toBe(UNILATERAL_LABEL);
    const closeBlock = claimEl.querySelector(".rv0-close");
    expect(closeBlock.textContent).toContain("no link back");
    expect(closeBlock.textContent).toContain(agreed.claims[1].close.peer_close_ref.digest);
    expect(closeBlock.textContent).not.toMatch(/agreed|acknowledg/i);
    expect(closeBlock.textContent).not.toContain("✓");
    Array.from(closeBlock.querySelectorAll("*")).forEach((el) => expect(el.className).not.toMatch(/agreed|stamp|ok\b/));
    expect(node.querySelectorAll(AGREED_MARKS)).toHaveLength(0);
    // A malformed citation is still refused -- optional never means unchecked.
    const broken = clone(tampered);
    broken.claims[1].close.peer_close_ref = { digest_alg: "SHA-256" };
    const refused = (await render(broken)).node.querySelectorAll(".rv0-claim-refused");
    expect(refused).toHaveLength(1);
    expect(refused[0].textContent).toContain("close.peer_close_ref present but not a digest-ref");
  });

  it("CONTESTED renders its own class and label ('contested -- peer rebuts'), the peer, and the peer's rebutting record by digest", async () => {
    const doc = fixture("pos-oo-close-contested-result.json");
    const { node } = await render(doc);
    const claimEl = claimRow(node, "close-1");
    expect(claimEl.className).not.toContain("rv0-claim-refused");
    expect(claimEl.querySelector(".rv0-claim-type").textContent).toBe("type: close");
    const state = claimEl.querySelector(".rv0-close-state");
    expect(state.className).toContain("rv0-close-contested");
    expect(state.textContent).toContain("CONTESTED");
    expect(state.textContent).toContain("rebuts");
    const mark = claimEl.querySelector(".rv0-close-contested-mark");
    expect(mark.textContent).toContain("contested -- peer rebuts");
    expect(mark.textContent).toContain("oo-sor");
    expect(claimEl.querySelector(".rv0-close-peer").textContent).toBe("peer: oo-sor");
    expect(claimEl.querySelector(".rv0-close").textContent).toContain(doc.claims[1].close.peer_close_ref.digest);
    // Its base axes are untouched: the Close was sealed; the agreement axis is close_state alone.
    expect(claimEl.querySelector(".rv0-verdict-line").textContent).toBe("sufficiency: SATISFIED -- verdict: met");
  });

  it("NEGATIVE: a CONTESTED close never carries the agreed mark, the AGREED class, or AGREED's wording", async () => {
    const { node } = await render(fixture("pos-oo-close-contested-result.json"));
    const claimEl = claimRow(node, "close-1");
    expect(claimEl.querySelectorAll(AGREED_MARKS)).toHaveLength(0);
    const closeBlock = claimEl.querySelector(".rv0-close");
    expect(closeBlock.textContent).not.toMatch(/agreed|acknowledg/i);
    expect(closeBlock.textContent).not.toContain("✓");
    expect(closeBlock.querySelectorAll(".rv0-badge")).toHaveLength(0);
    Array.from(closeBlock.querySelectorAll("*")).forEach((el) => expect(el.className).not.toMatch(/agreed|stamp|ok\b/));
    // ...and nowhere else on the page either.
    expect(node.querySelectorAll(AGREED_MARKS)).toHaveLength(0);
  });

  it("NEGATIVE: a CONTESTED close never renders with UNILATERAL's class or label -- the three states are three classes and three wordings", async () => {
    const agreed = await render(fixture("pos-oo-close-agreed-result.json"));
    const unilateral = await render(fixture("pos-oo-close-unilateral-result.json"));
    const contested = await render(fixture("pos-oo-close-contested-result.json"));
    const a = claimRow(agreed.node, "close-1").querySelector(".rv0-close-state");
    const u = claimRow(unilateral.node, "close-1").querySelector(".rv0-close-state");
    const c = claimRow(contested.node, "close-1").querySelector(".rv0-close-state");
    expect(c.className).not.toContain("rv0-close-unilateral");
    expect(c.className).not.toContain("rv0-close-agreed");
    expect(c.textContent).not.toContain("UNILATERAL");
    expect(c.textContent).not.toMatch(/alone|unilateral/i);
    expect(c.textContent).not.toBe(u.textContent);
    expect(c.textContent).not.toBe(a.textContent);
    expect(new Set([a.className, u.className, c.className]).size).toBe(3);
    expect(new Set([a.textContent, u.textContent, c.textContent]).size).toBe(3);
    // The contested block carries nothing of UNILATERAL's wording anywhere.
    const closeBlock = claimRow(contested.node, "close-1").querySelector(".rv0-close");
    expect(closeBlock.textContent).not.toMatch(/unilateral/i);
    Array.from(closeBlock.querySelectorAll("*")).forEach((el) => expect(el.className).not.toMatch(/unilateral/));
  });

  it("NEGATIVE: a CONTESTED close with no peer_close_ref is refused -- never rendered as contested, never as agreed, never dropped", async () => {
    const doc = fixture("neg-close-contested-without-peer-close-ref.json");
    const { node } = await render(doc);
    expect(node.querySelectorAll(".rv0-claim")).toHaveLength(doc.claims.length);
    const refused = node.querySelectorAll(".rv0-claim-refused");
    expect(refused).toHaveLength(1);
    expect(refused[0].textContent).toContain('Claim "close-1" refused');
    expect(refused[0].textContent).toContain("CONTESTED but cites no peer_close_ref");
    expect(node.querySelectorAll(AGREED_AFFORDANCES)).toHaveLength(0);
    expect(node.querySelectorAll(".rv0-close-state, .rv0-close-contested, .rv0-close-contested-mark")).toHaveLength(0);
  });

  it("NEGATIVE: an AGREED close with no peer is refused -- never rendered as agreed, never dropped", async () => {
    const doc = fixture("neg-close-agreed-without-peer.json");
    const { node } = await render(doc);
    expect(node.querySelectorAll(".rv0-claim")).toHaveLength(doc.claims.length);
    const refused = node.querySelectorAll(".rv0-claim-refused");
    expect(refused).toHaveLength(1);
    expect(refused[0].textContent).toContain('Claim "close-1" refused');
    expect(refused[0].textContent).toContain("AGREED but names no peer");
    expect(node.querySelectorAll(AGREED_AFFORDANCES)).toHaveLength(0);
    expect(node.querySelectorAll(".rv0-close-state")).toHaveLength(0);
  });

});

// ---------------------------------------------------------------------------
// XSS through the five typed-body strings the card renders: reconcile's
// join_key / peer / state_of_record, close's peer, and peer_close_ref.digest.
// The base XSS suite above injects only through view.title, a summary, and
// `type`; a card whose renderReconcile switched to innerHTML would pass it.
// ---------------------------------------------------------------------------

describe("XSS -- the five typed-body strings reach the DOM as text, never as markup", () => {
  const PAYLOADS = [
    "<img src=x onerror=window.pwned=1>",
    "</script><script>window.pwned=1</script>",
    "\"'><b onmouseover=window.pwned=1>x</b>",
  ];
  const HOSTILE_ELEMENTS = "img, script, b";

  // No element was created from the payload, and its `<` reached the
  // serialized DOM escaped (`&lt;`) -- text, not a tag. (The attribute
  // names survive as text too; that is the point, not a leak.)
  function assertNoElementCreated(node) {
    expect(node.querySelectorAll(HOSTILE_ELEMENTS)).toHaveLength(0);
    expect(node.innerHTML).not.toMatch(/<(img|script|b)[\s>]/);
  }
  function assertInert(node) {
    assertNoElementCreated(node);
    expect(node.innerHTML).toContain("&lt;");
  }

  for (const PAYLOAD of PAYLOADS) {
    it(`reconcile.join_key = ${JSON.stringify(PAYLOAD)} renders verbatim in the head line as text`, async () => {
      const tampered = clone(fixture("pos-oo-reconcile-result.json"));
      const body = tampered.claims[1].reconcile;
      body.join_key = PAYLOAD;
      const { node } = await render(tampered);
      const claimEl = claimRow(node, "reconcile-1");
      expect(claimEl.className).not.toContain("rv0-claim-refused");
      expect(claimEl.querySelector(".rv0-reconcile-head").textContent).toBe(
        "reconcile: join on " + PAYLOAD + " · peer " + body.peer + " · period " + body.period.start + " → " + body.period.end + " · state of record: B (the peer)"
      );
      assertInert(node);
    });

    it(`reconcile.peer = ${JSON.stringify(PAYLOAD)} renders verbatim in the head line as text`, async () => {
      const tampered = clone(fixture("pos-oo-reconcile-result.json"));
      const body = tampered.claims[1].reconcile;
      body.peer = PAYLOAD;
      const { node } = await render(tampered);
      const claimEl = claimRow(node, "reconcile-1");
      expect(claimEl.className).not.toContain("rv0-claim-refused");
      expect(claimEl.querySelector(".rv0-reconcile-head").textContent).toBe(
        "reconcile: join on " + body.join_key + " · peer " + PAYLOAD + " · period " + body.period.start + " → " + body.period.end + " · state of record: B (the peer)"
      );
      assertInert(node);
    });

    it(`reconcile.state_of_record = ${JSON.stringify(PAYLOAD)} never reaches the DOM at all -- the enum gate refuses the row, nothing echoes it, nothing is dropped`, async () => {
      const tampered = clone(fixture("pos-oo-reconcile-result.json"));
      tampered.claims[1].reconcile.state_of_record = PAYLOAD;
      const { node } = await render(tampered);
      expect(node.querySelectorAll(".rv0-claim")).toHaveLength(tampered.claims.length);
      const refused = node.querySelectorAll(".rv0-claim-refused");
      expect(refused).toHaveLength(1);
      expect(refused[0].textContent).toContain("reconcile.state_of_record missing or invalid");
      expect(node.textContent).not.toContain(PAYLOAD);
      expect(node.querySelectorAll(".rv0-reconcile-head")).toHaveLength(1); // reconcile-2 still renders
      assertNoElementCreated(node);
      expect(node.innerHTML).not.toContain("&lt;"); // not even as escaped text: the value is gated, not echoed
    });

    it(`close.peer = ${JSON.stringify(PAYLOAD)} renders verbatim on the peer line and the agreed mark as text`, async () => {
      const tampered = clone(fixture("pos-oo-close-agreed-result.json"));
      tampered.claims[1].close.peer = PAYLOAD;
      const { node } = await render(tampered);
      const claimEl = claimRow(node, "close-1");
      expect(claimEl.className).not.toContain("rv0-claim-refused");
      expect(claimEl.querySelector(".rv0-close-peer").textContent).toBe("peer: " + PAYLOAD);
      expect(claimEl.querySelector(".rv0-close-agreed-mark").textContent).toBe("✓ acknowledged by " + PAYLOAD);
      assertInert(node);
    });

    it(`close.peer = ${JSON.stringify(PAYLOAD)} on a UNILATERAL close renders verbatim as text`, async () => {
      const tampered = clone(fixture("pos-oo-close-unilateral-named-peer-result.json"));
      tampered.claims[1].close.peer = PAYLOAD;
      const { node } = await render(tampered);
      const claimEl = claimRow(node, "close-1");
      expect(claimEl.className).not.toContain("rv0-claim-refused");
      expect(claimEl.querySelector(".rv0-close-peer").textContent).toBe("peer: " + PAYLOAD + " -- no response from it");
      assertInert(node);
    });

    it(`close.peer_close_ref.digest = ${JSON.stringify(PAYLOAD)} renders verbatim on the cited-record line as text`, async () => {
      for (const name of ["pos-oo-close-agreed-result.json", "pos-oo-close-contested-result.json"]) {
        const tampered = clone(fixture(name));
        tampered.claims[1].close.peer_close_ref.digest = PAYLOAD;
        const { node } = await render(tampered);
        const claimEl = claimRow(node, "close-1");
        expect(claimEl.className, name).not.toContain("rv0-claim-refused");
        const mono = claimEl.querySelector(".rv0-close .rv0-mono");
        expect(mono.textContent, name).toMatch(/^peer's (acknowledging Close|rebutting record): SHA-256: /);
        expect(mono.textContent.slice(mono.textContent.indexOf("SHA-256: ") + "SHA-256: ".length), name).toBe(PAYLOAD);
        assertInert(node);
      }
    });
  }
});

describe("claim types -- an unrecognized type is shown as 'unrecognized', never dropped", () => {
  it("a bogus type renders an unrecognized row with the raw type and contract_ref, and the rendered row count equals the claim count", async () => {
    const doc = fixture("neg-unrecognized-claim-type.json");
    const { node } = await render(doc);
    expect(node.querySelectorAll(".rv0-claim")).toHaveLength(doc.claims.length);
    const rows = node.querySelectorAll(".rv0-claim-unrecognized");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("unrecognized");
    expect(rows[0].querySelector(".rv0-claim-unrecognized-type").textContent).toBe("type: adjudication");
    expect(rows[0].querySelector(".rv0-contract").textContent).toBe("contract_ref: ec:oo-claims-eval:2026-09-22@1");
    expect(rows[0].textContent).toContain('claim "claim-1"');
    // Not refused: an unknown type is not a malformed claim.
    expect(node.querySelectorAll(".rv0-claim-refused")).toHaveLength(0);
    // Its base axes are the same axes every type carries, so the aggregate recount still agrees.
    expect(node.textContent).toContain("Evaluated population: 3 (recomputed 3)");
  });

  it("NEGATIVE: a non-string bogus type still renders as inert text -- no throw, no drop", async () => {
    const tampered = clone(fixture("pos-oo-claims-result.json"));
    tampered.claims[0].type = { kind: "x" };
    const { node } = await render(tampered);
    expect(node.querySelectorAll(".rv0-claim")).toHaveLength(tampered.claims.length);
    const row = node.querySelector(".rv0-claim-unrecognized");
    expect(row.textContent).toContain("unrecognized");
    expect(row.textContent).toContain('{"kind":"x"}');
  });

  it("NEGATIVE: a malformed claim with an unrecognized type is refused for its real reasons and says the type is not the reason", async () => {
    const tampered = clone(fixture("neg-unrecognized-claim-type.json"));
    delete tampered.claims[0].tier;
    const { node } = await render(tampered);
    expect(node.querySelectorAll(".rv0-claim")).toHaveLength(tampered.claims.length);
    const refused = node.querySelector(".rv0-claim-refused");
    expect(refused.textContent).toContain("invalid tier");
    expect(refused.querySelector(".rv0-claim-refused-note").textContent).toContain('type "adjudication" is unrecognized');
    expect(refused.textContent).toContain("not for its type");
  });

  it("every fixture renders exactly one row per input claim -- refused, unrecognized, or rendered", async () => {
    const names = [
      "pos-oo-claims-result.json",
      "pos-oo-reconcile-result.json",
      "pos-oo-close-agreed-result.json",
      "pos-oo-close-unilateral-result.json",
      "pos-oo-close-unilateral-named-peer-result.json",
      "pos-oo-close-contested-result.json",
      "neg-close-agreed-without-peer.json",
      "neg-close-contested-without-peer-close-ref.json",
      "neg-reconcile-tallies-missing-state.json",
      "neg-unrecognized-claim-type.json",
      "neg-render-reconcile-one-sided-only.json",
      "neg-untiered-claim.json",
    ];
    for (const name of names) {
      const doc = fixture(name);
      const { node } = await render(doc);
      expect(node.querySelectorAll(".rv0-claim"), name).toHaveLength(doc.claims.length);
    }
  });

  it("XSS: a malicious raw type renders as inert text on the unrecognized row", async () => {
    const PAYLOAD = "</script><script>window.pwned=1</script>";
    const tampered = clone(fixture("pos-oo-claims-result.json"));
    tampered.claims[0].type = PAYLOAD;
    const { node } = await render(tampered);
    expect(node.querySelector(".rv0-claim-unrecognized-type").textContent).toBe("type: " + PAYLOAD);
    expect(node.querySelectorAll("script")).toHaveLength(0);
  });
});
