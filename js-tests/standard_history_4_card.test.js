// standard_history/4 (agent-action-capsule spec/standard-history-v0.md section 12) in the History card
// module, src/capsule_viewer/static/standard_history_card.js (capsule-viewer#337).
//
// (1) The check is AAC's: every vector of vectors/standard-history-v0/vectors-4.json (a byte copy at
//     agent-action-capsule eeed5456 (#636 merged, python/v0.18.0) gives the six properties and the standard verdict it expects.
// (2) A /4 card in the page: a deal with no witnessed time is counted and drawn as local, and nothing says a deal was left out.
// (3) /3 refuses `no_witness_time`, /4 refuses `left_out`; /3 reading is unchanged (standard_history_3_card.test.js).
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
const VECTORS_BYTES = readFileSync(join(DATA, "aac", "vectors-4.json"));
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

describe("the check is AAC's reference check_card under standard_history/4", () => {
  it("is the byte copy of AAC eeed5456 vectors", () => {
    expect(createHash("sha256").update(VECTORS_BYTES).digest("hex")).toBe("21143e7bc1f3d6d9605882870be3077503fd156145d14f00ad43999b0b15eabf");
    expect(VECTORS.cases).toHaveLength(8);
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
});

describe("a /4 card in the page", () => {
  const l = load();
  const first = VECTORS.cases.find((c) => c.id === "no-witness-time-counted").inputs;
  const modelOf = (ctx) => JSON.parse(JSON.stringify(l.api.buildModelSync(ctx)));

  it("counts the deals with no witnessed time and draws them as local, with no left-out line", () => {
    const m = modelOf(context3(first));
    expect(m.state).toBe("card");
    expect(m.entriesMatch).toBe(true);
    const c = first.card;
    const host = renderAll(l, m);
    expect(host.L0.querySelector("[data-sh-local-times]").textContent).toContain(`${c.local_times.count} of ${c.local_times.of} counted deals`);
    expect(host.L0.querySelector("[data-sh-local-times]").textContent).toContain("no time any witness recorded");
    expect(host.L1.querySelector("[data-sh-not-counted]").textContent).toContain("shop purchases paid up front");
    expect(host.L1.querySelector("[data-sh-not-counted-reasons]")).toBeNull();
    expect(text(host)).not.toMatch(/left out/);
    expect(text(host)).not.toContain("no witness named in the agreement timed");
  });
  it("without the block's as_of the /4 line names the month, and a shared /4 card has no left-out reason", () => {
    const m = modelOf(context3(first, { editBlock: (b) => { delete b.as_of; } }));
    expect(m.state).toBe("card");
    const host = renderAll(l, m);
    expect(host.L1.textContent).toContain("before some day in");
    expect(text(host)).not.toMatch(/left out/);
    const shared = modelOf(context3(first, { withDeals: false }));
    expect(shared.state).toBe("card");
    const h2 = renderAll(l, shared);
    expect(h2.L1.querySelector("[data-sh-not-counted]").textContent).toContain("shop purchases paid up front");
    expect(h2.L1.querySelector("[data-sh-not-counted-reasons]")).toBeNull();
  });
  it("a /4 card has no not_counted tally and its entries have no left_out", () => {
    expect(Object.keys(first.card)).not.toContain("not_counted");
    const deals = clone(first.deals);
    deals[0].left_out = "no_witness_time";
    expect(() => l.api.checkCard(clone(first.card), first.policy, first.as_of, deals, "standard_history/4")).toThrow(/entry does not have/);
    const bad = clone(first.deals);
    bad[0].no_witness_time = false;
    expect(() => l.api.checkCard(clone(first.card), first.policy, first.as_of, bad, "standard_history/4")).toThrow(/no_witness_time/);
  });
  it("a /3 entry refuses no_witness_time", () => {
    const three = JSON.parse(readFileSync(join(DATA, "aac", "vectors-3.json"), "utf8")).cases[0].inputs;
    const deals = clone(three.deals);
    deals[0].no_witness_time = true;
    expect(() => l.api.checkCard(clone(three.card), three.policy, three.as_of, deals, "standard_history/3")).toThrow(/entry does not have/);
  });
});
