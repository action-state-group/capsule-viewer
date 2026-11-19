// standard_history/3 (agent-action-capsule spec/standard-history-v0.md section 11) in the History card
// module, src/capsule_viewer/static/standard_history_card.js (capsule-viewer#324).
//
// (1) The check is AAC's: every vector of vectors/standard-history-v0/vectors-3.json (a byte copy at
//     agent-action-capsule 38f02a6) gives the six properties and the standard verdict it expects,
//     under the token the vector names.
// (2) A /3 card in the page: the lines section 11.8 adds, the recount wording that says the entries
//     were not checked against the shelf log, and no witness claim for a deal's rows.
// (3) The block's as_of carries coverage_start_time; /1 is unchanged (standard_history_card.test.js).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { standInContext } from "./aacContext.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = readFileSync(join(ROOT, "src", "capsule_viewer", "static", "standard_history_card.js"), "utf8");
const DATA = join(ROOT, "tests", "testdata", "standard-history");
const VECTORS_BYTES = readFileSync(join(DATA, "aac", "vectors-3.json"));
const VECTORS = JSON.parse(VECTORS_BYTES.toString("utf8"));
const EXT = "x-standard-history/v0";
const clone = (v) => JSON.parse(JSON.stringify(v));
const BASE = "person-own";

function load() {
  const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", { runScripts: "outside-only" });
  const registered = [];
  dom.window.EvidenceGraph = { registerPresentation: (m) => registered.push(m) };
  dom.window.eval(SCRIPT);
  return { window: dom.window, document: dom.window.document, registered, api: dom.window.CapsuleViewerStandardHistory };
}

// The base bundle's context with a /3 card as the root's disclosed agent_input and the block the vector gives:
// an in-memory edit of the committed bundle's card, so the record is not re-sealed (the page's own checks are what run).
function context3(input, { withDeals = true, editBlock = () => {}, editCard = () => {} } = {}) {
  const bundle = JSON.parse(readFileSync(join(DATA, `${BASE}.bundle.json`), "utf8"));
  const verify = JSON.parse(readFileSync(join(DATA, "verify", `${BASE}.json`), "utf8"));
  const block = { policy: clone(input.policy), as_of: clone(input.as_of) };
  if (withDeals) block.deals = clone(input.deals);
  editBlock(block);
  bundle.extensions[EXT] = block;
  const ctx = standInContext(bundle, { verify });
  const card = clone(input.card);
  editCard(card);
  const r = ctx.resolvedDisclosures.get(ctx.root);
  const resolved = new Map(ctx.resolvedDisclosures).set(ctx.root, { ...r, agent_input: { state: "disclosed", payload: card } });
  return { ...ctx, resolvedDisclosures: resolved };
}

function renderAll(loaded, model) {
  const doc = loaded.document;
  const host = { L0: doc.createElement("div"), L1: doc.createElement("div"), L2: doc.createElement("div"), depth: "L2" };
  doc.body.replaceChildren(host.L0, host.L1, host.L2);
  loaded.registered[0].render(model, host, {});
  return host;
}
const text = (host) => [host.L0, host.L1, host.L2].map((r) => r.textContent).join("\n");

describe("the check is AAC's reference check_card under standard_history/3", () => {
  it("is the byte copy AAC's manifest names", () => {
    expect(createHash("sha256").update(VECTORS_BYTES).digest("hex")).toBe("fe076a8249d76e3eaa35ebd0d97cd361bb72e6680a286e51058b286fad622df6");
    expect(VECTORS.cases).toHaveLength(27);
  });
  const { api } = load();
  for (const c of VECTORS.cases) {
    it(`${c.id}: ${c.expected.fails.length ? "fails " + c.expected.fails.join(", ") : "a standard card"}`, () => {
      const i = c.inputs;
      const props = { ...api.checkCard(clone(i.card), i.policy, i.as_of, i.deals, i.derivation) };
      expect(props).toEqual(c.expected.properties);
      expect(Object.keys(props)).toEqual(VECTORS.properties);
      expect(api.isStandard(props)).toBe(c.expected.standard);
    });
  }
  it("a token the check does not know is an input error", () => {
    const i = VECTORS.cases[0].inputs;
    expect(() => api.checkCard(clone(i.card), i.policy, i.as_of, i.deals, "standard_history/9")).toThrow(/token/);
  });
});

describe("a /3 card in the page", () => {
  const l = load();
  const first = VECTORS.cases.find((c) => c.id === "outcomes-from-rows").inputs;
  const modelOf = (ctx) => JSON.parse(JSON.stringify(l.api.buildModelSync(ctx)));

  it("the holder's own copy's entries add up to the card, but without the shelf handover counts_recompute stays NOT_CHECKED (SH 11.7)", () => {
    const m = modelOf(context3(first));
    expect(m.state).toBe("card");
    expect(m.entriesMatch).toBe(true);
    expect(m.properties.counts_recompute).toBe("NOT_CHECKED");
    const host = renderAll(l, m);
    expect(host.L0.querySelector("[data-sh-counts]").getAttribute("data-sh-counts")).toBe("entries");
    expect(text(host)).toContain("did not check them against the holder's whole log");
    expect(text(host)).not.toContain("Recounted here");
  });
  it("the entries need the snapshot's time but not the policy, and are counted over the card's own window", () => {
    expect(modelOf(context3(first, { editBlock: (b) => { delete b.policy; } })).entriesMatch).toBe(true);
    const i = clone(first);
    i.policy.window = { months: 1 };
    const m = modelOf(context3(i));
    expect(m.properties.window_from_policy).toBe("FAIL");
    expect(m.fails).toEqual(["window_from_policy"]);
  });
  it("the check, given deals and no policy, recounts a /3 card over its own window (as the reference does)", () => {
    const { api } = l;
    const props = api.checkCard(clone(first.card), null, first.as_of, first.deals, "standard_history/3");
    expect(props.counts_recompute).toBe("PASS");
    const bad = clone(first.deals);
    bad.pop();
    expect(api.checkCard(clone(first.card), null, first.as_of, bad, "standard_history/3").counts_recompute).toBe("FAIL");
  });
  it("coverage_start with a trailing newline is not a month", () => {
    const card = clone(first.card);
    card.coverage_start = "2026-04\n";
    expect(l.api.checkCard(card, first.policy, first.as_of, null, "standard_history/3").card_form).toBe("FAIL");
  });
  it("a deal left out for no witness time is not described as a shop purchase", () => {
    // A shared card (no entries): the exclusions are both left out for no witness time.
    const m = modelOf(context3(first, { withDeals: false, editCard: (card) => { card.not_counted = { of: 2, shop_preauth: 0, no_witness_time: 2 }; } }));
    expect(m.state).toBe("card");
    const host = renderAll(l, m);
    expect(host.L1.querySelector("[data-sh-not-counted]").textContent).toBe("Not counted: 2 of 13 deals in the window.");
    expect(host.L1.querySelector("[data-sh-not-counted-reasons]").textContent).toContain("of the 2 not counted: 0 shop purchases paid up front, and 2 left out");
    expect(text(host)).not.toContain("shop purchases paid up front. They stay");
  });
  it("draws remedied, not honoured, the coverage start, the local results and why deals are not counted", () => {
    const c = first.card;
    const host = renderAll(l, modelOf(context3(first)));
    expect(host.L0.querySelector("[data-sh-remedied]").textContent).toContain(`${c.remedied.count} of ${c.remedied.of} deals`);
    expect(host.L0.querySelector("[data-sh-not-honoured]").textContent).toContain(`${c.not_honoured.count} of ${c.not_honoured.of} deals`);
    // The block carries the coverage start's time, so the line says the day: the card names only the month.
    expect(host.L0.querySelector("[data-sh-coverage]").textContent).toContain(`complete from Apr 10, 2026`);
    expect(host.L0.querySelector("[data-sh-local-times]").textContent).toContain(`${c.local_times.count} of ${c.local_times.of} counted deals`);
    expect(host.L1.querySelector("[data-sh-not-counted-reasons]").textContent).toContain(`${c.not_counted.shop_preauth} shop purchases`);
    expect(host.L1.querySelector("[data-sh-unpriced]")).not.toBeNull();
  });
  it("neither remedied nor not honoured is a segment of the outcome bar, and no rate or witness claim for the rows is drawn", () => {
    const host = renderAll(l, modelOf(context3(first)));
    expect(host.L0.querySelectorAll(".cv-sh__bar rect")).toHaveLength(3);
    expect(text(host)).not.toMatch(/%/);
    expect(text(host)).not.toMatch(/rows? (is|are) witnessed/i);
  });
  it("a shared /3 card says its counts are the holder's statement", () => {
    const m = modelOf(context3(first, { withDeals: false }));
    expect(m.state).toBe("card");
    expect(m.properties.counts_recompute).toBe("NOT_CHECKED");
    const host = renderAll(l, m);
    expect(host.L0.querySelector("[data-sh-counts]").getAttribute("data-sh-counts")).toBe("statement");
    expect(host.L0.querySelector("[data-sh-coverage]")).not.toBeNull();
    expect(host.L0.querySelector("[data-sh-coverage]").textContent).toContain("complete from Apr 10, 2026");
  });
  it("without the block's as_of the coverage line says only the month the card names", () => {
    const m = modelOf(context3(first, { withDeals: false, editBlock: (b) => { delete b.as_of; } }));
    expect(m.state).toBe("card");
    expect(renderAll(l, m).L0.querySelector("[data-sh-coverage]").textContent).toContain("complete from some day in Apr 2026");
  });
  it("entries that count one deal differently fail the recount, and the card is refused", () => {
    const m = modelOf(context3(first, { editBlock: (block) => { block.deals.pop(); } }));
    expect(m.state).toBe("refused");
    expect(m.fails).toEqual(["counts_recompute"]);
    // The refusal page, not the card, says it: no broken "carries the entries but not ," sentence.
    const page = text(renderAll(l, m));
    expect(page).toContain("Failed: The counts recount from the deal entries");
    expect(page).not.toContain("but not ,");
  });
  it("a card without its coverage start is not a standard card", () => {
    const m = modelOf(context3(first, { editCard: (card) => { delete card.coverage_start; } }));
    expect(m.state).toBe("refused");
    expect(m.fails).toContain("card_form");
  });
  it("a block whose as_of has no coverage_start_time cannot be read for a /3 card", () => {
    const m = modelOf(context3(first, { editBlock: (block) => { delete block.as_of.coverage_start_time; } }));
    expect(m.state).toBe("unreadable");
  });
  it("a /2 card is read under /1, where its form fails", () => {
    const two = clone(first.card);
    two.derivation = "standard_history/2";
    const m = modelOf(context3(first, { editCard: (card) => { Object.assign(card, two); } }));
    expect(m.state).toBe("refused");
    expect(m.fails).toContain("card_form");
  });
});
