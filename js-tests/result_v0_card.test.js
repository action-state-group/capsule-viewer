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

function entryFor(result, records) {
  const entry = { capsule_id: null, record: result, conversation: { disclosed: false, messages: [] } };
  if (records !== undefined) entry.records = records;
  return entry;
}

// `records`: the record headers a close claim cites (the vendored
// `<name>.records.json` sidecars) -- when supplied, the card recomputes
// every close_state from their links; when not, it shows the asserted
// state under a producer-asserted chip.
async function render(result, records) {
  const CapsuleViewer = loadViewer();
  const node = await CapsuleViewer.renderEntry(entryFor(result, records));
  return { node, CapsuleViewer };
}

function recordsFor(name) {
  return fixture(name.replace(/\.json$/, ".records.json"));
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

  it("AGREED renders its own class and label, the peer, and the peer's acknowledging Close by digest -- and NO mark of its own: no check, no badge", async () => {
    const doc = fixture("pos-oo-close-agreed-result.json");
    const { node } = await render(doc);
    const claimEl = claimRow(node, "close-1");
    expect(claimEl.querySelector(".rv0-claim-type").textContent).toBe("type: close");
    const state = claimEl.querySelector(".rv0-close-state");
    expect(state.className).toContain("rv0-close-agreed");
    expect(state.className).not.toContain("rv0-close-unilateral");
    expect(state.textContent).toContain("AGREED");
    expect(claimEl.querySelector(".rv0-close-peer").textContent).toBe("peer: oo-sor");
    const closeBlock = claimEl.querySelector(".rv0-close");
    expect(closeBlock.textContent).toContain(doc.claims[1].close.peer_close_ref.digest);
    expect(closeBlock.textContent).toContain("cited Close: SHA-256: " + doc.claims[1].close.close_ref.digest);
    // the ✓ affordance is gone (2026-09-28): AGREED is a label and a cited
    // record, never a check-mark or a badge the card could not have earned
    expect(claimEl.querySelectorAll(".rv0-close-agreed-mark, .rv0-badge, .rv0-stamp")).toHaveLength(0);
    expect(closeBlock.textContent).not.toContain("✓");
    expect(closeBlock.textContent).not.toMatch(/acknowledged by/);
    Array.from(closeBlock.querySelectorAll("*")).forEach((el) => expect(el.className).not.toMatch(/mark|stamp|badge|ok\b/));
    // and with no records supplied the state is the Result's own word, chipped as such -- never bare
    const chips = closeBlock.querySelectorAll(".rv0-close-derivation");
    expect(chips).toHaveLength(1);
    expect(chips[0].className).toContain("rv0-close-producer-asserted");
    expect(chips[0].getAttribute("data-derivation")).toBe("producer-asserted");
    expect(chips[0].textContent).toContain("producer-asserted");
    expect(closeBlock.querySelectorAll(".rv0-close-state-mismatch")).toHaveLength(0);
  });

  // Maintainer's fourth pass (2026-09-29): the card never sees keys, so
  // every AGREED row says so -- whether the state is producer-asserted or
  // recomputed from supplied records -- and no other state carries it.
  it("every AGREED row carries a visible 'peer key not checked' caveat (text + class); UNILATERAL and CONTESTED rows do not", async () => {
    const CAVEAT = "peer key not checked -- this card sees no signing keys, so it cannot show the peer's record was signed under a key other than this Close's";
    const agreedName = "pos-oo-close-agreed-result.json";
    for (const records of [undefined, recordsFor(agreedName)]) {
      const { node } = await render(fixture(agreedName), records);
      const claimEl = claimRow(node, "close-1");
      expect(claimEl.querySelector(".rv0-close-state").className).toContain("rv0-close-agreed");
      const caveats = claimEl.querySelectorAll(".rv0-close-key-unchecked");
      expect(caveats).toHaveLength(1);
      expect(caveats[0].className).toBe("rv0-close-key-unchecked");
      expect(caveats[0].textContent).toBe(CAVEAT);
      expect(caveats[0].getAttribute("data-key-checked")).toBe("false");
      // it sits right after the state label, on the row a reader sees
      expect(caveats[0].previousElementSibling.className).toContain("rv0-close-agreed");
    }
    for (const name of [
      "pos-oo-close-contested-result.json",
      "pos-oo-close-unilateral-result.json",
      "pos-oo-close-unilateral-named-peer-result.json",
    ]) {
      const { node } = await render(fixture(name), recordsFor(name));
      const claimEl = claimRow(node, "close-1");
      expect(claimEl.querySelectorAll(".rv0-close-key-unchecked")).toHaveLength(0);
      expect(claimEl.textContent).not.toContain("peer key not checked");
    }
    // a relabelled AGREED the records read CONTESTED draws no AGREED, so no caveat either
    const relabelled = await render(
      fixture("neg-close-agreed-relabelled-contested.json"),
      recordsFor("neg-close-agreed-relabelled-contested.json"),
    );
    expect(claimRow(relabelled.node, "close-1").querySelectorAll(".rv0-close-key-unchecked")).toHaveLength(0);
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
    expect(closeBlock.querySelectorAll(".rv0-badge, .rv0-mono:not(.rv0-close-ref)")).toHaveLength(0); // nothing cited but its own Close
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
    expect(closeBlock.querySelectorAll(".rv0-mono:not(.rv0-close-ref)")).toHaveLength(0); // nothing cited but its own Close: no peer_close_ref on this fixture
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
    // A CONTESTED Close never counts as met (2026-09-28, maintainer's second
    // pass): the vendored positive carries not_met, bucketed as such.
    expect(claimEl.querySelector(".rv0-verdict-line").textContent).toBe("sufficiency: SATISFIED -- verdict: not_met");
    expect(doc.aggregate.buckets.not_met).toEqual(["close-1"]);
    expect(doc.aggregate.buckets.met).toEqual(["claim-1"]);
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

    it(`close.peer = ${JSON.stringify(PAYLOAD)} renders verbatim on the peer line as text (AGREED without records; with records the renamed peer makes the row UNILATERAL -- the payload is still text)`, async () => {
      const tampered = clone(fixture("pos-oo-close-agreed-result.json"));
      tampered.claims[1].close.peer = PAYLOAD;
      for (const records of [undefined, recordsFor("pos-oo-close-agreed-result.json")]) {
        const { node } = await render(tampered, records);
        const claimEl = claimRow(node, "close-1");
        expect(claimEl.className).not.toContain("rv0-claim-refused");
        // Without records: the asserted AGREED, producer-asserted, peer line
        // "peer: <payload>". With records (third pass): the acknowledger's
        // book `oo-sor` is no longer the claim's named peer, so the row is
        // UNILATERAL and the peer line says the (renamed) peer has not
        // responded. Either way the payload reaches the DOM as text only.
        expect(claimEl.querySelector(".rv0-close-peer").textContent).toBe(
          records === undefined ? "peer: " + PAYLOAD : "peer: " + PAYLOAD + " -- no response from it",
        );
        expect(claimEl.querySelectorAll(".rv0-close-agreed-mark")).toHaveLength(0);
        if (records !== undefined) {
          expect(claimEl.querySelector(".rv0-close-state").className).toContain("rv0-close-unilateral");
          expect(claimEl.querySelectorAll(".rv0-close-ignored-link")).toHaveLength(1);
        }
        assertInert(node);
      }
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

    it(`close.peer_close_ref.digest = ${JSON.stringify(PAYLOAD)} never reaches the DOM at all -- the digest-format gate refuses the row (2026-09-28), nothing echoes it, nothing is dropped`, async () => {
      // Before the digest-format rule this payload rendered verbatim as
      // text on the cited-record line; a digest that is not 64 lowercase
      // hex is now refused before any line is built, so the payload is
      // never in the DOM in any form -- the same posture as the enum gates.
      for (const name of ["pos-oo-close-agreed-result.json", "pos-oo-close-contested-result.json"]) {
        const tampered = clone(fixture(name));
        tampered.claims[1].close.peer_close_ref.digest = PAYLOAD;
        const { node } = await render(tampered, recordsFor(name));
        expect(node.querySelectorAll(".rv0-claim"), name).toHaveLength(tampered.claims.length);
        const claimEl = claimRow(node, "close-1");
        expect(claimEl.className, name).toContain("rv0-claim-refused");
        expect(claimEl.textContent, name).toMatch(/cites no peer_close_ref/);
        expect(node.textContent, name).not.toContain(PAYLOAD);
        expect(node.querySelectorAll(".rv0-close, .rv0-close-state, .rv0-close-derivation"), name).toHaveLength(0);
        // not assertInert: the payload is not in the DOM even as escaped text
        assertNoElementCreated(node);
        expect(node.innerHTML, name).not.toContain("&lt;img");
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
      "neg-close-agreed-relabelled-contested.json",
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

// ---------------------------------------------------------------------------
// close_state is DERIVABLE, never asserted (the maintainer's adversarial
// review, 2026-09-28: "a contested close relabelled 'agreed' validates").
// When the entry carries the records a close claim cites, the card
// recomputes the state from the links those records make to the cited
// Close and marks a disagreement; when it does not, the asserted state is
// shown under a producer-asserted chip. Never bare, either way.
// ---------------------------------------------------------------------------

describe("close_state is recomputed from the supplied records' links, never taken from the claim", () => {
  const CLOSE_FIXTURES = [
    ["pos-oo-close-agreed-result.json", "AGREED", "rv0-close-agreed", 1],
    ["pos-oo-close-contested-result.json", "CONTESTED", "rv0-close-contested", 1],
    ["pos-oo-close-unilateral-result.json", "UNILATERAL", "rv0-close-unilateral", 0],
    ["pos-oo-close-unilateral-named-peer-result.json", "UNILATERAL", "rv0-close-unilateral", 0],
  ];

  for (const [name, expected, cls, linkCount] of CLOSE_FIXTURES) {
    it(`${name}: with its records supplied the state is recomputed (${expected}, ${linkCount} link(s)) and matches -- no mismatch, no producer-asserted chip`, async () => {
      const doc = fixture(name);
      const { node } = await render(doc, recordsFor(name));
      const claimEl = claimRow(node, "close-1");
      expect(claimEl.className).not.toContain("rv0-claim-refused");
      const state = claimEl.querySelector(".rv0-close-state");
      expect(state.className).toContain(cls);
      expect(state.textContent).toContain(expected);
      const chips = claimEl.querySelectorAll(".rv0-close-derivation");
      expect(chips).toHaveLength(1);
      expect(chips[0].className).toContain("rv0-close-recomputed");
      expect(chips[0].getAttribute("data-derivation")).toBe("recomputed");
      expect(chips[0].textContent).toBe(
        "recomputed from " + linkCount + (linkCount === 1 ? " link" : " links") + " to the cited Close in the supplied records",
      );
      expect(claimEl.querySelectorAll(".rv0-close-state-mismatch, .rv0-close-peer-ref-mismatch, .rv0-close-producer-asserted")).toHaveLength(0);
      expect(claimEl.querySelector(".rv0-close").textContent).not.toContain("✓");
    });
  }

  it("NEGATIVE: the CONTESTED positive relabelled AGREED (neg-close-agreed-relabelled-contested) renders CONTESTED with a state mismatch marker -- never AGREED, never the agreed wording", async () => {
    const doc = fixture("neg-close-agreed-relabelled-contested.json");
    expect(doc.claims[1].close.close_state).toBe("AGREED"); // the lie, as vendored
    const { node } = await render(doc, recordsFor("neg-close-agreed-relabelled-contested.json"));
    expect(node.querySelectorAll(".rv0-claim")).toHaveLength(doc.claims.length);
    const claimEl = claimRow(node, "close-1");
    expect(claimEl.className).not.toContain("rv0-claim-refused");
    const state = claimEl.querySelector(".rv0-close-state");
    expect(state.className).toBe("rv0-close-state rv0-close-contested");
    expect(state.textContent).toBe("CONTESTED -- peer rebuts this Close");
    const closeBlock = claimEl.querySelector(".rv0-close");
    expect(closeBlock.textContent).not.toMatch(/agreed|acknowledg/i);
    expect(closeBlock.textContent).not.toContain("✓");
    expect(closeBlock.querySelectorAll(".rv0-close-agreed, .rv0-close-agreed-mark")).toHaveLength(0);
    const mismatch = closeBlock.querySelectorAll(".rv0-close-state-mismatch");
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].textContent).toContain("state mismatch");
    // the asserted value is on the marker's data attribute, never in the text
    expect(mismatch[0].getAttribute("data-asserted-state")).toBe("AGREED");
    expect(mismatch[0].getAttribute("data-recomputed-state")).toBe("CONTESTED");
    expect(closeBlock.querySelector(".rv0-close-derivation").className).toContain("rv0-close-recomputed");
    expect(closeBlock.querySelectorAll(".rv0-close-peer-ref-mismatch")).toHaveLength(0); // peer_close_ref does cite the rebutting record
    // the base axes and the aggregate are untouched by the relabel (the
    // CONTESTED positive it derives from carries not_met since 2026-09-28)
    expect(claimEl.querySelector(".rv0-verdict-line").textContent).toBe("sufficiency: SATISFIED -- verdict: not_met");
    expect(node.textContent).toContain("Evaluated population: 2 (recomputed 2)");
  });

  it("NEGATIVE: the same relabelled close WITHOUT records renders the asserted AGREED under a producer-asserted chip -- never bare", async () => {
    const doc = fixture("neg-close-agreed-relabelled-contested.json");
    const { node } = await render(doc);
    const claimEl = claimRow(node, "close-1");
    expect(claimEl.querySelector(".rv0-close-state").className).toContain("rv0-close-agreed");
    const chip = claimEl.querySelector(".rv0-close-derivation");
    expect(chip.className).toContain("rv0-close-producer-asserted");
    expect(chip.textContent).toContain("producer-asserted");
    expect(chip.textContent).toContain("unverified here");
    expect(claimEl.querySelectorAll(".rv0-close-state-mismatch")).toHaveLength(0); // nothing to compare against
    expect(claimEl.querySelectorAll(".rv0-close-agreed-mark")).toHaveLength(0);
    expect(claimEl.querySelector(".rv0-close").textContent).not.toContain("✓");
  });

  it("NEGATIVE: the AGREED positive over records whose link is flipped to rebuts renders CONTESTED with a state mismatch (the records, not the claim, decide)", async () => {
    const doc = fixture("pos-oo-close-agreed-result.json");
    const records = clone(recordsFor("pos-oo-close-agreed-result.json"));
    records.forEach((r) => r.links.forEach((l) => { if (l.type === "acknowledges") l.type = "rebuts"; }));
    const { node } = await render(doc, records);
    const claimEl = claimRow(node, "close-1");
    expect(claimEl.querySelector(".rv0-close-state").className).toContain("rv0-close-contested");
    expect(claimEl.querySelectorAll(".rv0-close-state-mismatch")).toHaveLength(1);
    expect(claimEl.querySelector(".rv0-close").textContent).not.toMatch(/agreed|acknowledg/i);
  });

  it("NEGATIVE: an AGREED close over records that carry no link to it is UNILATERAL with a state mismatch -- a peer record that does not link back agrees to nothing", async () => {
    const doc = fixture("pos-oo-close-agreed-result.json");
    const records = clone(recordsFor("pos-oo-close-agreed-result.json"));
    records.forEach((r) => { r.links = r.links.filter((l) => l.type !== "acknowledges"); });
    const { node } = await render(doc, records);
    const claimEl = claimRow(node, "close-1");
    const state = claimEl.querySelector(".rv0-close-state");
    expect(state.className).toBe("rv0-close-state rv0-close-unilateral");
    expect(claimEl.querySelectorAll(".rv0-close-state-mismatch")).toHaveLength(1);
    expect(claimEl.querySelector(".rv0-close-derivation").textContent).toContain("recomputed from 0 links");
    expect(claimEl.querySelector(".rv0-close").textContent).not.toMatch(/agreed|acknowledg/i);
  });

  it("NEGATIVE: an AGREED close whose peer_close_ref cites a record that carries no acknowledges link is marked as such, the state still recomputed", async () => {
    const doc = clone(fixture("pos-oo-close-agreed-result.json"));
    doc.claims[1].close.peer_close_ref = doc.claims[1].close.close_ref; // cites its own Close
    const { node } = await render(doc, recordsFor("pos-oo-close-agreed-result.json"));
    const claimEl = claimRow(node, "close-1");
    expect(claimEl.querySelector(".rv0-close-state").className).toContain("rv0-close-agreed");
    expect(claimEl.querySelectorAll(".rv0-close-state-mismatch")).toHaveLength(0);
    expect(claimEl.querySelectorAll(".rv0-close-peer-ref-mismatch")).toHaveLength(1);
  });

  it("NEGATIVE: records supplied but the cited Close not among them -> producer-asserted, never a recompute over the wrong record", async () => {
    const doc = fixture("pos-oo-close-contested-result.json");
    const { node } = await render(doc, recordsFor("pos-oo-close-agreed-result.json").slice(1)); // only the peer's acknowledging Close
    const claimEl = claimRow(node, "close-1");
    expect(claimEl.querySelector(".rv0-close-state").className).toContain("rv0-close-contested");
    expect(claimEl.querySelector(".rv0-close-derivation").className).toContain("rv0-close-producer-asserted");
    expect(claimEl.querySelectorAll(".rv0-close-state-mismatch")).toHaveLength(0);
  });

  it("NEGATIVE: a close claim without close_ref is refused -- there is nothing to recompute the state from, so no state is shown", async () => {
    const doc = clone(fixture("pos-oo-close-agreed-result.json"));
    delete doc.claims[1].close.close_ref;
    const { node } = await render(doc, recordsFor("pos-oo-close-agreed-result.json"));
    expect(node.querySelectorAll(".rv0-claim")).toHaveLength(doc.claims.length);
    const refused = node.querySelectorAll(".rv0-claim-refused");
    expect(refused).toHaveLength(1);
    expect(refused[0].textContent).toContain("close.close_ref missing");
    expect(node.querySelectorAll(".rv0-close-state, .rv0-close-derivation")).toHaveLength(0);
  });

  // The maintainer's third pass (2026-09-29): "neither book_id nor signer
  // alone is enough, since a producer can mint a second book or a second
  // key equally easily." A link makes a state only from the COUNTERPARTY:
  // (1) a different book_id that (2) is the claim's named peer, and (3) a
  // different signer key. The card sees record headers (book_id, no
  // signer), so it applies (1) and (2); (3) is the emitter's and the CLI's.
  // Each vendored negative asserts AGREED over an acknowledger that is not
  // the counterparty; each renders UNILATERAL with the state-mismatch
  // marker, lists the ignored link with its reason, and never carries
  // AGREED's class or wording.
  describe("the counterparty is the named peer's book (third pass) -- a self-, third-book, or book-less acknowledgement never renders AGREED", () => {
    const COUNTERPARTY_NEGATIVES = [
      ["neg-close-agreed-self-acknowledged.json", "the linking record is from the Close's own book"],
      ["neg-close-agreed-third-book.json", "the linking record's book_id is not the claim's named peer"],
      ["neg-close-agreed-bookless-close.json", "the cited Close names no book_id, so nothing can be its counterparty"],
    ];

    function expectNeverAgreed(claimEl, reason) {
      const state = claimEl.querySelector(".rv0-close-state");
      expect(state.className).toBe("rv0-close-state rv0-close-unilateral");
      expect(state.textContent).toContain("UNILATERAL");
      const closeBlock = claimEl.querySelector(".rv0-close");
      expect(closeBlock.querySelectorAll(".rv0-close-agreed, .rv0-close-agreed-mark")).toHaveLength(0);
      expect(closeBlock.textContent).not.toMatch(/agreed|acknowledg/i);
      expect(closeBlock.textContent).not.toContain("✓");
      const mismatch = closeBlock.querySelectorAll(".rv0-close-state-mismatch");
      expect(mismatch).toHaveLength(1);
      expect(mismatch[0].getAttribute("data-asserted-state")).toBe("AGREED");
      expect(mismatch[0].getAttribute("data-recomputed-state")).toBe("UNILATERAL");
      const chip = closeBlock.querySelector(".rv0-close-derivation");
      expect(chip.className).toContain("rv0-close-recomputed");
      expect(chip.textContent).toBe(
        "recomputed from 0 links to the cited Close in the supplied records (1 other link ignored -- not from the counterparty)",
      );
      const ignored = closeBlock.querySelectorAll(".rv0-close-ignored-link");
      expect(ignored).toHaveLength(1);
      expect(ignored[0].getAttribute("data-ignored-link")).toBe("acknowledges"); // the type lives on the attribute only
      expect(ignored[0].textContent).toMatch(/^link from [0-9a-f]{64} ignored -- not from the counterparty: /);
      expect(ignored[0].textContent).toContain(reason);
      // the peer line still names the peer the Result named -- as a peer that has not responded
      expect(closeBlock.querySelector(".rv0-close-peer").textContent).toBe("peer: oo-sor -- no response from it");
    }

    for (const [name, reason] of COUNTERPARTY_NEGATIVES) {
      it(`NEGATIVE (vendored): ${name} renders UNILATERAL with a state mismatch and the ignored link's reason -- never AGREED`, async () => {
        const doc = fixture(name);
        expect(doc.claims[1].close.close_state).toBe("AGREED"); // the lie, as vendored
        expect(doc.claims[1].close.peer).toBe("oo-sor");
        const { node } = await render(doc, recordsFor(name));
        expect(node.querySelectorAll(".rv0-claim")).toHaveLength(doc.claims.length);
        const claimEl = claimRow(node, "close-1");
        expect(claimEl.className).not.toContain("rv0-claim-refused");
        expectNeverAgreed(claimEl, reason);
        // the recount disagrees with the producer's met bucket only if the
        // card counted verdicts by state -- it does not (the verdict is the
        // claim's own field); the mismatch is on the close row itself
      });

      it(`NEGATIVE (vendored): ${name} WITHOUT records shows the asserted AGREED only under a producer-asserted chip -- never bare`, async () => {
        const { node } = await render(fixture(name));
        const claimEl = claimRow(node, "close-1");
        expect(claimEl.querySelector(".rv0-close-state").className).toContain("rv0-close-agreed");
        expect(claimEl.querySelector(".rv0-close-derivation").className).toContain("rv0-close-producer-asserted");
        expect(claimEl.querySelectorAll(".rv0-close-ignored-link")).toHaveLength(0);
      });
    }

    it("NEGATIVE: the AGREED positive with the claim's peer renamed -- the peer's own acknowledgement is now from a book that is not the named peer", async () => {
      const doc = clone(fixture("pos-oo-close-agreed-result.json"));
      doc.claims[1].close.peer = "oo-other";
      const { node } = await render(doc, recordsFor("pos-oo-close-agreed-result.json"));
      const claimEl = claimRow(node, "close-1");
      const state = claimEl.querySelector(".rv0-close-state");
      expect(state.className).toBe("rv0-close-state rv0-close-unilateral");
      expect(claimEl.querySelectorAll(".rv0-close-state-mismatch")).toHaveLength(1);
      const ignored = claimEl.querySelector(".rv0-close-ignored-link");
      expect(ignored.textContent).toContain("the linking record's book_id is not the claim's named peer");
      expect(claimEl.querySelector(".rv0-close").textContent).not.toMatch(/agreed|acknowledg/i);
    });

    it("NEGATIVE: the AGREED positive over records whose Close lost its book_id -- a Close naming no book takes no linker, not even the named peer's", async () => {
      const doc = fixture("pos-oo-close-agreed-result.json");
      const records = clone(recordsFor("pos-oo-close-agreed-result.json"));
      // the Close's digest changes with its content, so re-point the claim at it
      delete records[0].book_id;
      const { CapsuleViewer } = await render(doc, records);
      const closeDigest = await CapsuleViewer.jsonDigest(records[0]);
      const tampered = clone(doc);
      tampered.claims[1].close.close_ref.digest = closeDigest;
      tampered.claims[1].evidence[0].digest = closeDigest;
      tampered.claims[1].presentation.evidence[0].digest = closeDigest;
      records[1].links.forEach((l) => { if (l.type === "acknowledges") l.target = closeDigest; });
      const { node } = await render(tampered, records);
      const claimEl = claimRow(node, "close-1");
      expect(claimEl.querySelector(".rv0-close-state").className).toBe("rv0-close-state rv0-close-unilateral");
      expect(claimEl.querySelectorAll(".rv0-close-state-mismatch")).toHaveLength(1);
      expect(claimEl.querySelector(".rv0-close-ignored-link").textContent).toContain("the cited Close names no book_id");
    });

    it("a rebuttal from a non-counterparty makes no CONTESTED either: the CONTESTED positive with the rebutting record moved to the Close's own book reads UNILATERAL", async () => {
      const doc = fixture("pos-oo-close-contested-result.json");
      const records = clone(recordsFor("pos-oo-close-contested-result.json"));
      records[1].book_id = "oo"; // the rebuttal now comes from the Close's own book
      const rebuttalDigest = await (await render(doc, records)).CapsuleViewer.jsonDigest(records[1]);
      const tampered = clone(doc);
      tampered.claims[1].close.peer_close_ref.digest = rebuttalDigest;
      tampered.claims[1].evidence[1].digest = rebuttalDigest;
      tampered.claims[1].presentation.evidence[1].digest = rebuttalDigest;
      const { node } = await render(tampered, records);
      const claimEl = claimRow(node, "close-1");
      expect(claimEl.querySelector(".rv0-close-state").className).toBe("rv0-close-state rv0-close-unilateral");
      expect(claimEl.querySelectorAll(".rv0-close-contested, .rv0-close-contested-mark")).toHaveLength(0);
      expect(claimEl.querySelectorAll(".rv0-close-state-mismatch")).toHaveLength(1);
      expect(claimEl.querySelector(".rv0-close-ignored-link").getAttribute("data-ignored-link")).toBe("rebuts");
    });

    it("the honest positives carry no ignored link: every inbound link on them is from the named peer's book", async () => {
      for (const [name] of CLOSE_FIXTURES) {
        const { node } = await render(fixture(name), recordsFor(name));
        expect(node.querySelectorAll(".rv0-close-ignored-link"), name).toHaveLength(0);
      }
    });
  });

  it("every close row carries exactly one derivation chip, whatever the state or the records -- an asserted state is never shown bare", async () => {
    const names = CLOSE_FIXTURES.map(([name]) => name).concat([
      "neg-close-agreed-relabelled-contested.json",
      "neg-close-agreed-self-acknowledged.json",
      "neg-close-agreed-third-book.json",
      "neg-close-agreed-bookless-close.json",
    ]);
    for (const name of names) {
      for (const records of [undefined, recordsFor(name)]) {
        const { node } = await render(fixture(name), records);
        const closeBlocks = node.querySelectorAll(".rv0-close");
        expect(closeBlocks, name).toHaveLength(1);
        expect(closeBlocks[0].querySelectorAll(".rv0-close-derivation"), name).toHaveLength(1);
        expect(closeBlocks[0].querySelector(".rv0-close-derivation").className, name).toContain(
          records === undefined ? "rv0-close-producer-asserted" : "rv0-close-recomputed",
        );
      }
    }
  });

  it("deriveCloseState: any rebuts wins, else acknowledges, else UNILATERAL", async () => {
    const { CapsuleViewer } = await render(fixture("pos-oo-claims-result.json"));
    void CapsuleViewer;
    const { deriveCloseState } = window.__resultV0CardInternals;
    expect(deriveCloseState([])).toBe("UNILATERAL");
    expect(deriveCloseState([{ type: "acknowledges", record: "a" }])).toBe("AGREED");
    expect(deriveCloseState([{ type: "rebuts", record: "b" }])).toBe("CONTESTED");
    expect(deriveCloseState([{ type: "acknowledges", record: "a" }, { type: "rebuts", record: "b" }])).toBe("CONTESTED");
  });
});

describe("digest format -- a digest-ref is SHA-256 + exactly 64 lowercase hex; anything else is refused, never resolved", () => {
  // The format every vendored vector carries (schema $defs/HexDigest, the
  // output of the canonicalization's json_digest). Maintainer's second
  // pass, 2026-09-28: the check used to accept any non-empty string.
  const GOOD = fixture("pos-oo-close-agreed-result.json").claims[1].close.close_ref.digest;
  const MALFORMED = [
    ["sha256: prefixed", "sha256:" + GOOD],
    ["63 hex characters", GOOD.slice(0, 63)],
    ["65 hex characters", GOOD + "0"],
    ["uppercase hex", GOOD.toUpperCase()],
    ["non-hex characters", "g".repeat(64)],
    ["empty", ""],
    ["not a string", 12345678],
  ];

  it("isDigestRef accepts exactly the vectors' form", async () => {
    await render(fixture("pos-oo-claims-result.json"));
    const { isDigestRef } = window.__resultV0CardInternals;
    expect(GOOD).toMatch(/^[0-9a-f]{64}$/);
    expect(isDigestRef({ digest_alg: "SHA-256", digest: GOOD })).toBe(true);
    expect(isDigestRef({ digest_alg: "SHA-512", digest: GOOD })).toBe(false);
    expect(isDigestRef({ digest: GOOD })).toBe(false);
    for (const [label, digest] of MALFORMED) {
      expect(isDigestRef({ digest_alg: "SHA-256", digest }), label).toBe(false);
    }
  });

  for (const [label, digest] of MALFORMED) {
    it(`NEGATIVE: close_ref.digest ${label} -> the claim is refused; no state, no derivation chip, nothing resolved -- even with the records supplied`, async () => {
      const doc = clone(fixture("pos-oo-close-agreed-result.json"));
      doc.claims[1].close.close_ref.digest = digest;
      const { node } = await render(doc, recordsFor("pos-oo-close-agreed-result.json"));
      expect(node.querySelectorAll(".rv0-claim")).toHaveLength(doc.claims.length);
      const refused = node.querySelectorAll(".rv0-claim-refused");
      expect(refused).toHaveLength(1);
      expect(refused[0].textContent).toContain("close.close_ref missing or not a digest-ref (SHA-256, 64 lowercase hex)");
      expect(node.querySelectorAll(".rv0-close, .rv0-close-state, .rv0-close-derivation, .rv0-close-state-mismatch")).toHaveLength(0);
      expect(node.textContent).not.toMatch(/recomputed from \d+ link|producer-asserted --/);
      // and the recount excludes the refused claim, so the aggregate disagrees visibly
      expect(node.textContent).toContain("Evaluated population: 2 (recomputed 1)");
    });
  }

  it("NEGATIVE: a malformed digest in evidence[] refuses the claim -- a row that is not in the vectors' digest form can never resolve", async () => {
    const doc = clone(fixture("pos-oo-claims-result.json"));
    doc.claims[0].evidence[0].digest = "sha256:" + doc.claims[0].evidence[0].digest;
    const { node } = await render(doc);
    const refused = node.querySelectorAll(".rv0-claim-refused");
    expect(refused).toHaveLength(1);
    expect(refused[0].textContent).toContain('Claim "claim-1" refused');
    expect(refused[0].textContent).toContain("evidence[] missing or not all digest-refs (SHA-256, 64 lowercase hex)");
    expect(node.querySelectorAll(".rv0-claim")).toHaveLength(3);
  });

  it("NEGATIVE: an AGREED close whose peer_close_ref.digest is uppercase hex is refused as citing no peer_close_ref -- never rendered agreed", async () => {
    const doc = clone(fixture("pos-oo-close-agreed-result.json"));
    doc.claims[1].close.peer_close_ref.digest = doc.claims[1].close.peer_close_ref.digest.toUpperCase();
    const { node } = await render(doc, recordsFor("pos-oo-close-agreed-result.json"));
    const refused = node.querySelectorAll(".rv0-claim-refused");
    expect(refused).toHaveLength(1);
    expect(refused[0].textContent).toContain("close is AGREED but cites no peer_close_ref");
    expect(node.querySelectorAll(".rv0-close-agreed, .rv0-close-state")).toHaveLength(0);
  });

  it("every vendored fixture's digests are in the vectors' form: no positive is refused for a digest", async () => {
    for (const name of [
      "pos-oo-claims-result.json",
      "pos-oo-reconcile-result.json",
      "pos-oo-close-agreed-result.json",
      "pos-oo-close-unilateral-result.json",
      "pos-oo-close-unilateral-named-peer-result.json",
      "pos-oo-close-contested-result.json",
    ]) {
      const { node } = await render(fixture(name));
      expect(node.querySelectorAll(".rv0-claim-refused"), name).toHaveLength(0);
    }
  });

  it("(kept) deriveCloseState table, unchanged by the digest rule", async () => {
    const { CapsuleViewer } = await render(fixture("pos-oo-claims-result.json"));
    void CapsuleViewer;
    const { deriveCloseState } = window.__resultV0CardInternals;
    expect(deriveCloseState([])).toBe("UNILATERAL");
    expect(deriveCloseState([{ type: "acknowledges", record: "a" }])).toBe("AGREED");
    expect(deriveCloseState([{ type: "rebuts", record: "b" }])).toBe("CONTESTED");
    expect(deriveCloseState([{ type: "acknowledges", record: "a" }, { type: "rebuts", record: "b" }])).toBe("CONTESTED");
  });

  it("XSS: a hostile link type or target in the supplied records is never echoed -- links are matched by exact value, never rendered", async () => {
    const PAYLOAD = "<img src=x onerror=window.pwned=1>";
    const records = clone(recordsFor("pos-oo-close-agreed-result.json"));
    records[1].links.push({ type: PAYLOAD, target: PAYLOAD });
    const { node } = await render(fixture("pos-oo-close-agreed-result.json"), records);
    expect(node.querySelectorAll("img")).toHaveLength(0);
    expect(node.textContent).not.toContain(PAYLOAD);
    // the record's digest changed with the extra link, so it is no longer
    // the cited peer record: the state still recomputes from what links
    // remain (none now target the Close under the peer's new digest? no --
    // the acknowledges link is still there, on a record with a new digest)
    const claimEl = claimRow(node, "close-1");
    expect(claimEl.querySelector(".rv0-close-state").className).toContain("rv0-close-agreed");
    expect(claimEl.querySelectorAll(".rv0-close-peer-ref-mismatch")).toHaveLength(1); // peer_close_ref names the OLD digest
  });
});
