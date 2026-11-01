// The History card module, src/capsule_viewer/static/standard_history_card.js,
// run directly: the bytes the manifest pins (executable.script_sha256), with
// only the page runtime stood in for, as js-tests/history_card.test.js does.
//
// (1) The check is AAC's: every vector of agent-action-capsule's
//     vectors/standard-history-v0/ (a byte copy at 1037a1c) gives the six
//     properties and the standard verdict the vector expects.
// (2) Every committed bundle (examples/standard-history/cut_fixtures.sh: cut
//     by capsulectl, VALID by capsulectl verify) carries its case's card and
//     block, and the module finds what the AAC reference found at cut time.
// (3) The negatives: no percentage or share anywhere on a page; no size row
//     that names two currencies; undecided never drawn in the agreed tone; a
//     copy that carries deal entries never drawn as the card to send, and no
//     deal entry ever drawn.
// (4) The counts recount from the deal entries on the holder's own copy, and
//     a copy whose entries say otherwise is refused.
// (5) The same pages in headless Chromium at 390px and 1280px: one column on
//     the phone, two on the laptop, no horizontal scroll, and the goldens in
//     tests/goldens/ (UPDATE_GOLDENS=1 rewrites them).
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLOSE_TIMEOUT_MS, findChrome, launch } from "./headlessChrome.js";
import { aacBundleVerified, standInContext } from "./aacContext.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_BYTES = readFileSync(join(ROOT, "src", "capsule_viewer", "static", "standard_history_card.js"));
const SCRIPT = SCRIPT_BYTES.toString("utf8");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "src", "capsule_viewer", "standard_history", "manifest.json"), "utf8"));
const DATA = join(ROOT, "tests", "testdata", "standard-history");
const VECTORS_BYTES = readFileSync(join(DATA, "aac", "vectors.json"));
const VECTORS = JSON.parse(VECTORS_BYTES.toString("utf8"));
const CASES = JSON.parse(readFileSync(join(DATA, "cases.json"), "utf8"));
const GOLDENS = join(ROOT, "tests", "goldens");
const UPDATE = process.env.UPDATE_GOLDENS === "1";
const EXT = "x-standard-history/v0";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const clone = (v) => JSON.parse(JSON.stringify(v));

const bundleOf = (name) => JSON.parse(readFileSync(join(DATA, `${name}.bundle.json`), "utf8"));
const verifyOf = (name) => JSON.parse(readFileSync(join(DATA, "verify", `${name}.json`), "utf8"));
const contextOf = (name, bundle = bundleOf(name)) => standInContext(bundle, { verify: verifyOf(name) });

function load() {
  const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", { runScripts: "outside-only" });
  const registered = [];
  dom.window.EvidenceGraph = { registerPresentation: (m) => registered.push(m) };
  dom.window.eval(SCRIPT);
  return { window: dom.window, document: dom.window.document, registered, api: dom.window.CapsuleViewerStandardHistory };
}

function renderAll(loaded, model, depth = "L2") {
  const doc = loaded.document;
  const host = { L0: doc.createElement("div"), L1: doc.createElement("div"), L2: doc.createElement("div"), depth };
  doc.body.replaceChildren(host.L0, host.L1, host.L2);
  loaded.registered[0].render(model, host, {});
  return host;
}

const pageText = (host) => [host.L0, host.L1, host.L2].map((r) => r.textContent).join("\n");
const pageHtml = (host) => [host.L0, host.L1, host.L2].map((r) => r.innerHTML).join("\n");
const modelOf = (loaded, ctx) => JSON.parse(JSON.stringify(loaded.api.buildModelSync(ctx)));

describe("the script and its manifest", () => {
  it("is the script the manifest pins, and registers exactly one module, the manifest's", () => {
    expect(sha256(SCRIPT_BYTES)).toBe(MANIFEST.executable.script_sha256);
    const l = load();
    expect(l.registered).toHaveLength(1);
    expect(l.registered[0].manifest.id).toBe(MANIFEST.id);
    expect(MANIFEST.requires.extensions.required).toEqual([EXT]);
  });
  it("carries the consumer/en pack the manifest pins, and its stylesheets have no percentage", () => {
    const pack = readFileSync(join(ROOT, "src", "capsule_viewer", "standard_history", "wording-consumer-en.json"));
    expect(sha256(pack)).toBe(MANIFEST.executable.wording_sha256);
    const l = load();
    expect(l.api.PACK).toEqual({ id: "capsuleviewer.wording.consumer-en/v0", sha256: MANIFEST.executable.wording_sha256 });
    expect(l.api.WORDS).toEqual(JSON.parse(pack.toString("utf8")).entries);
    const css = readFileSync(join(ROOT, "src", "capsule_viewer", "static", "standard_history.css"), "utf8");
    expect(css).not.toMatch(/%/);
    expect(Object.values(l.api.WORDS).filter((w) => /%|percent/i.test(w))).toEqual([]);
  });
});

describe("the check is AAC's reference check_card (agent-action-capsule vectors/standard-history-v0)", () => {
  it("is the byte copy AAC's manifest names", () => {
    expect(sha256(VECTORS_BYTES)).toBe("4126c66efaa5f5c94fa473432752f1eb596439a190476bd3799204afe3cb43c5");
    expect(VECTORS.cases).toHaveLength(28);
  });
  const { api } = load();
  for (const c of VECTORS.cases) {
    it(`${c.id}: ${c.expected.fails.length ? "fails " + c.expected.fails.join(", ") : "a standard card"}`, () => {
      const i = c.inputs;
      const props = { ...api.checkCard(clone(i.card), i.policy, i.as_of, i.deals) };
      expect(props).toEqual(c.expected.properties);
      expect(Object.keys(props)).toEqual(VECTORS.properties);
      expect(api.isStandard(props)).toBe(c.expected.standard);
    });
  }
  it("reads an assetScale written 2.0 as 2, the one input the reference refuses and JSON.parse cannot tell apart", () => {
    const i = VECTORS.cases[0].inputs;
    const deals = JSON.parse(JSON.stringify(i.deals).replace(/"assetScale":2/g, '"assetScale":2.0'));
    expect(api.checkCard(i.card, i.policy, i.as_of, deals).counts_recompute).toBe("PASS");
  });
  it("a \"__proto__\" member is a member: a band or a card carrying one is not a standard card", () => {
    const i = VECTORS.cases[0].inputs;
    const band = JSON.parse(JSON.stringify(i.card).replace('"currency":"BTC"', '"__proto__":{},"currency":"BTC"'));
    expect(api.checkCard(band, i.policy, i.as_of, i.deals).card_form).toBe("FAIL");
    const top = JSON.parse(JSON.stringify(i.card).replace('{"derivation"', '{"__proto__":0.5,"derivation"'));
    const props = api.checkCard(top, i.policy, i.as_of, i.deals);
    expect([props.card_form, props.counts_integral]).toEqual(["FAIL", "FAIL"]);
  });
  it("throws on a malformed input, never on a malformed card", () => {
    const i = VECTORS.cases[0].inputs;
    expect(() => api.checkCard("not a card", i.policy, i.as_of, i.deals)).not.toThrow();
    expect(() => api.checkCard(i.card, { ...i.policy, window: { months: 2.5 } }, i.as_of)).toThrow(/policy window/);
    expect(() => api.checkCard(i.card, i.policy, { ...i.as_of, first_checkpoint_time: "2026-02-30T00:00:00Z" })).toThrow(/IP §5.2 time/);
    const deals = clone(i.deals);
    deals[0].outcome = "met";
    expect(() => api.checkCard(i.card, i.policy, i.as_of, deals)).toThrow(/outcome/);
  });
});

describe("the committed bundles (capsulectl, VALID)", () => {
  const l = load();
  for (const c of CASES) {
    it(`${c.name}: ${c.expected.standard ? "the card" : "refused"}`, () => {
      const bundle = bundleOf(c.name);
      expect(verifyOf(c.name).verdict).toBe("VALID");
      expect(bundle.disclosures[bundle.root].agent_input).toEqual(c.card);
      expect(bundle.extensions[EXT]).toEqual(c.block);
      const ctx = contextOf(c.name);
      expect(aacBundleVerified(ctx.verification)).toBe(true);
      expect(l.registered[0].canRender(ctx)).toBe(true);
      const model = modelOf(l, ctx);
      expect(model.state).toBe(c.expected.standard ? "card" : "refused");
      expect(model.properties).toEqual(c.expected.properties);
      expect(model.own).toBe("deals" in c.block);
    });
  }
  it("a bundle without the block is not this module's", () => {
    const b = bundleOf("person-shared");
    delete b.extensions[EXT];
    expect(l.registered[0].canRender(standInContext(b))).toBe(false);
  });
  it("a block it cannot read draws why, and no count", () => {
    for (const edit of [(b) => { b.extensions[EXT] = []; }, (b) => { b.extensions[EXT].ratio = 0.5; }, (b) => { b.extensions[EXT].as_of.anchor_time = "yesterday"; }]) {
      const b = bundleOf("person-shared");
      edit(b);
      const model = modelOf(l, contextOf("person-shared", b));
      expect(model.state).toBe("unreadable");
      const host = renderAll(l, model);
      expect(host.L0.querySelector("[data-sh-total]")).toBeNull();
      expect(host.L2.children).toHaveLength(0);
    }
  });
  it("a malformed verification is a bundle that did not verify, never a crash", () => {
    const ctx = contextOf("person-shared");
    for (const verification of [null, { ...ctx.verification, capsuleResults: { x: null } }, { ...ctx.verification, disclosures: "x" },
      { ...ctx.verification, capsuleResults: { x: { ok: 1 } } }, { ...ctx.verification, perRecordMembership: { status: "fail", findings: "x" } }]) {
      expect(modelOf(l, { ...ctx, verification }).state).toBe("unverified");
    }
  });
  it("an unreadable deal entry is never quoted on the page", () => {
    const b = bundleOf("person-own");
    b.extensions[EXT].deals[0].outcome = "met";
    const m = modelOf(l, contextOf("person-own", b));
    expect(m.state).toBe("unreadable");
    expect(JSON.stringify(m)).not.toContain(b.extensions[EXT].deals[0].deal);
    expect(pageText(renderAll(l, m))).not.toContain(b.extensions[EXT].deals[0].deal);
  });
  it("deal entries without the policy say what is missing, never that the page holds no entries", () => {
    const b = bundleOf("person-own");
    delete b.extensions[EXT].policy;
    const m = modelOf(l, contextOf("person-own", b));
    expect(m.properties.counts_recompute).toBe("NOT_CHECKED");
    expect(renderAll(l, m).L0.querySelector("[data-sh-counts]").textContent).toBe(
      "This copy carries the deal entries but not the policy, so the counts were not recounted: they are the holder's own statement.");
  });
  it("says the snapshot covers the card only when the root record's own membership holds", () => {
    const ctx = contextOf("person-shared");
    const unbound = { ...ctx, verification: { ...ctx.verification, perRecordMembership: { status: "fail", findings: [`membership_record_unbound:${ctx.root}`] } } };
    const proves = (c) => renderAll(l, modelOf(l, c), "L1").L1.querySelector('[data-sh-section="proves"]').textContent;
    expect(proves(ctx)).toContain("which snapshot of the holder's log it is as of");
    expect(modelOf(l, unbound).state).toBe("card");
    expect(proves(unbound)).not.toContain("which snapshot of the holder's log it is as of");
  });
  it("a bundle that did not verify draws no count", () => {
    const b = bundleOf("person-shared");
    b.disclosures[b.root].agent_input.outcomes.held += 1;
    const model = modelOf(l, standInContext(b));
    expect(model.state).toBe("unverified");
    expect(renderAll(l, model).L0.querySelector("[data-sh-total]")).toBeNull();
  });
});

// Every page this module draws: each committed bundle, at every depth.
function everyPage(l) {
  const pages = [];
  for (const c of CASES) {
    for (const depth of ["L0", "L1", "L2"]) {
      const model = modelOf(l, contextOf(c.name));
      pages.push({ c, depth, model, host: renderAll(l, model, depth) });
    }
  }
  return pages;
}

describe("negative: no percentage, ratio or share is ever drawn", () => {
  const l = load();
  it("no page's text or markup has a percentage, and no element carries a style of its own", () => {
    for (const p of everyPage(l)) {
      expect(pageText(p.host), `${p.c.name} ${p.depth}`).not.toMatch(/%|percent|ratio|\bshare of\b/i);
      expect(pageHtml(p.host), `${p.c.name} ${p.depth}`).not.toMatch(/%|style=/);
    }
  });
  it("a card with a percentage member is refused and draws none of its counts", () => {
    const p = everyPage(l).find((x) => x.c.name === "neg-percentage-member" && x.depth === "L2");
    expect(p.model.state).toBe("refused");
    expect(p.model.fails).toContain("card_form");
    expect(p.host.L0.querySelector("[data-sh-total], [data-sh-section]")).toBeNull();
    expect(pageText(p.host)).not.toMatch(/\d+ of \d+/);
  });
  it("a share stated as a fraction fails counts_integral (AAC's percentage-fraction, which capsulectl will not seal)", () => {
    const c = VECTORS.cases.find((x) => x.id === "percentage-fraction");
    const props = l.api.checkCard(c.inputs.card, c.inputs.policy, c.inputs.as_of, c.inputs.deals);
    expect(props.counts_integral).toBe("FAIL");
    expect(l.api.isStandard(props)).toBe(false);
  });
});

describe("negative: no size row names two currencies", () => {
  const l = load();
  it("every size row names its own currency and no other, under its currency's group", () => {
    let rows = 0;
    for (const p of everyPage(l).filter((x) => x.model.state === "card")) {
      const currencies = p.model.card.bands.map((b) => b.currency);
      for (const r of p.host.L1.querySelectorAll("[data-band-currency]")) {
        rows += 1;
        const mine = r.getAttribute("data-band-currency");
        expect(r.closest("[data-currency-rows]").getAttribute("data-currency-rows")).toBe(mine);
        // A row names its currency by its code or, for a currency with a symbol, by that symbol.
        const symbols = { USD: "$", EUR: "\u20ac", GBP: "\u00a3" };
        expect(r.textContent.includes(mine) || (symbols[mine] !== undefined && r.textContent.includes(symbols[mine]))).toBe(true);
        for (const other of currencies.filter((x) => x !== mine)) {
          expect(r.textContent).not.toContain(other);
          if (symbols[other] !== undefined) expect(r.textContent).not.toContain(symbols[other]);
        }
      }
      // Bands of one currency that read the same (below the first whole unit) are one row.
      const labels = {};
      for (const b of p.model.bands) (labels[b.currency] ||= new Set()).add(b.label);
      expect(p.host.L1.querySelectorAll("[data-band-currency]").length).toBe(Object.values(labels).reduce((n, set) => n + set.size, 0));
    }
    expect(rows).toBeGreaterThan(0);
  });
  it("two currencies in one decade stay two rows in two groups", () => {
    const p = everyPage(l).find((x) => x.c.name === "two-currencies-own" && x.depth === "L1");
    const groups = [...p.host.L1.querySelectorAll("[data-currency-group]")].map((g) => g.textContent);
    expect(groups).toEqual(["EUR", "USD"]);
    const labels = [...p.host.L1.querySelectorAll("[data-band-currency]")].map((r) => r.firstChild.textContent);
    expect(labels).toEqual(["\u20ac10 \u2013 \u20ac99", "under $10", "$10 \u2013 $99"]);
  });
  it("a negative decade and a zero amount read in the currency's own units", () => {
    expect(l.api.bandLabel({ currency: "BTC", decade: -7 })).toBe("0.0000001 to under 0.000001 BTC");
    // A currency with a symbol reads as the canvas draws it, and its sub-unit bands are "under $10".
    expect(l.api.bandLabel({ currency: "USD", decade: -1 })).toBe("under $10");
    expect(l.api.bandLabel({ currency: "USD", decade: null })).toBe("under $10");
    expect(l.api.bandLabel({ currency: "USD", decade: 3 })).toBe("$1,000 \u2013 $9,999");
    expect(l.api.bandLabel({ currency: "XAU", decade: null })).toBe("zero amount, XAU");
    // The largest decade that reads as "$" amounts, and the one past it in the currency's own units.
    expect(l.api.bandLabel({ currency: "USD", decade: 17 })).toBe("$100,000,000,000,000,000 \u2013 $999,999,999,999,999,999");
    expect(l.api.bandLabel({ currency: "USD", decade: 18 })).toBe("1000000000000000000 to under 1e19 USD");
    const p = everyPage(l).find((x) => x.c.name === "small-and-zero-shared" && x.depth === "L1");
    expect([...p.host.L1.querySelectorAll("[data-band-currency]")].map((r) => r.firstChild.textContent)).toContain("under $10");
  });
  it("a band whose currency is free text is refused", () => {
    const p = everyPage(l).find((x) => x.c.name === "neg-currency-free-text");
    expect(p.model.state).toBe("refused");
    expect(p.model.fails).toEqual(["card_form"]);
    expect(pageText(p.host)).not.toContain("Example Bakery");
  });
});

describe("negative: undecided is never drawn as agreed", () => {
  const l = load();
  it("every undecided mark is the undecided tone, and the agreed total counts held only", () => {
    for (const p of everyPage(l).filter((x) => x.model.state === "card")) {
      const o = p.model.card.outcomes;
      for (const node of p.host.L0.querySelectorAll('[data-outcome="undecided"] .cv-sh__dot')) {
        expect(node.className).toBe("cv-sh__dot cv-sh__dot--undecided");
      }
      expect(p.host.L0.querySelectorAll(".cv-tone--positive")).toHaveLength(0);
      const total = p.host.L0.querySelector('[data-sh-total="held"]');
      if (o.of) expect(total.textContent).toBe(`${o.held} of ${o.of}`);
      const undecided = p.host.L0.querySelector('[data-outcome="undecided"]');
      if (o.of) expect(undecided.textContent).toBe(`${o.undecided} of ${o.of} we couldn't tell`);
    }
  });
  it("a card where nothing held draws 0 as agreed and its undecided deals as undecided", () => {
    const p = everyPage(l).find((x) => x.c.name === "all-undecided-own" && x.depth === "L1");
    expect(p.host.L0.querySelector('[data-sh-total="held"]').textContent).toBe("0 of 2");
    expect(p.host.L0.querySelector('[data-outcome="undecided"]').textContent).toBe("2 of 2 we couldn't tell");
    expect(p.host.L0.querySelectorAll(".cv-sh__dot--held")).toHaveLength(1);
    expect([...p.host.L1.querySelectorAll("[data-band-currency]")].map((r) => r.lastChild.textContent)).toEqual([
      "2 \u00b7 2 unsure",
    ]);
  });
  it("the undecided mark's tone is not the agreed one in the stylesheet", () => {
    const css = l.api.MANIFEST && readFileSync(join(ROOT, "src", "capsule_viewer", "static", "standard_history.css"), "utf8");
    const rule = (sel) => css.split("\n").find((line) => line.startsWith(sel + " {"));
    expect(rule(".cv-sh__dot--held")).toContain("--cv-color-positive-fg");
    expect(rule(".cv-sh__dot--undecided")).not.toMatch(/positive/);
  });
});

describe("negative: deal entries never travel as the card to send", () => {
  const l = load();
  it("a copy that carries deals is the holder's own: the PRIVATE banner first, never a shared card", () => {
    for (const p of everyPage(l)) {
      const own = "deals" in p.c.block;
      expect(p.host.L0.getAttribute("data-sh-copy")).toBe(own ? "own" : "shared");
      const banner = p.host.L0.querySelector('[data-banner="private"]');
      if (!own) {
        expect(banner).toBeNull();
        continue;
      }
      // The first thing drawn: the module's wrap, its card or refusal, and (for a card) its columns.
      let first = p.host.L0.firstElementChild.firstElementChild;
      if (first.firstElementChild.classList.contains("cv-sh__cols")) first = first.firstElementChild;
      expect(first.firstElementChild === banner, `${p.c.name} ${p.depth}`).toBe(true);
    }
  });
  it("no deal entry is drawn: no deal reference, amount value or agreed time", () => {
    for (const p of everyPage(l)) {
      const text = pageText(p.host);
      for (const d of p.c.block.deals || []) {
        expect(text).not.toContain(d.deal);
        expect(text).not.toContain(d.agreed_at);
        // As a whole number: a digest's hex may hold the same digits.
        if (d.amount.value.length > 2) expect(text).not.toMatch(new RegExp(`(?<![0-9a-f])${d.amount.value}(?![0-9a-f])`));
      }
    }
  });
});

describe("the counts recount from the deal entries (the holder's own copy)", () => {
  const l = load();
  it("person-own and node-own recount, and say so; a shared card says its counts are the holder's statement", () => {
    for (const name of ["person-own", "node-own", "two-currencies-own", "all-undecided-own"]) {
      const m = modelOf(l, contextOf(name));
      expect(m.properties.counts_recompute, name).toBe("PASS");
      expect(renderAll(l, m).L0.querySelector("[data-sh-counts]").getAttribute("data-sh-counts")).toBe("recomputed");
    }
    const shared = modelOf(l, contextOf("person-shared"));
    expect(shared.properties.counts_recompute).toBe("NOT_CHECKED");
    expect(renderAll(l, shared).L0.querySelector("[data-sh-counts]").getAttribute("data-sh-counts")).toBe("statement");
  });
  it("entries that count one deal differently fail the recount, and the card is refused", () => {
    for (const edit of [
      (deals) => deals.pop(),
      (deals) => { deals[0].outcome = deals[0].outcome === "held" ? "undecided" : "held"; },
      (deals) => { deals[0].amount = { ...deals[0].amount, assetCode: "EUR" }; },
    ]) {
      const b = bundleOf("person-own");
      edit(b.extensions[EXT].deals);
      const m = modelOf(l, contextOf("person-own", b));
      expect(m.properties.counts_recompute).toBe("FAIL");
      expect(m.state).toBe("refused");
    }
    expect(modelOf(l, contextOf("neg-counted-shop-purchase-own")).fails).toEqual(["counts_recompute"]);
  });
});

describe("what the page claims", () => {
  const l = load();
  it("a check skipped because an earlier one failed says so, never 'not checked here'", () => {
    const p = everyPage(l).find((x) => x.c.name === "neg-percentage-member" && x.depth === "L2");
    const row = (k) => p.host.L2.querySelector(`[data-property="${k}"]`);
    for (const k of ["denominator", "counts_recompute"]) {
      expect(row(k).getAttribute("data-skipped")).toBe(k === "denominator" ? "true" : "false");
    }
    expect(row("denominator").lastChild.textContent).toBe("not run: an earlier check failed");
    const own = everyPage(l).find((x) => x.c.name === "neg-counted-shop-purchase-own" && x.depth === "L2");
    expect(own.host.L0.textContent).toContain("Failed: The counts recount from the deal entries");
  });
  it("the window line carries the snapshot's time in UTC, and only the holder's own copy says which snapshot the others see, with no witness claim", () => {
    for (const p of everyPage(l).filter((x) => x.depth === "L0" && x.model.state === "card" && x.model.held.as_of)) {
      const win = p.host.L0.querySelector('[data-sh-window="true"]').textContent;
      expect(win).toMatch(/ · as of [A-Z][a-z]{2} \d{1,2} \d{2}:\d{2} UTC$/);
      const level = p.host.L0.querySelector('[data-sh-lead="level"]');
      expect(level !== null).toBe(p.model.own === true);
      if (level) expect(level.textContent).toMatch(/^Level they see: Standard · .+ · snapshot [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
      expect(win + (level ? level.textContent : "")).not.toMatch(/witness/i);
    }
  });
  it("draws the outcomes tally as one bar of the three counts, with no figure of its own, and none when there is no counted deal", () => {
    for (const p of everyPage(l).filter((x) => x.depth === "L0" && x.model.state === "card")) {
      const o = p.model.card.outcomes;
      const bar = p.host.L0.querySelector('[data-sh-bar="outcomes"]');
      if (o.of === 0) { expect(bar).toBeNull(); continue; }
      expect(bar.getAttribute("viewBox")).toBe(`0 0 ${o.of} 1`);
      const segs = [...bar.querySelectorAll("rect")];
      // the widths are the counts themselves, in the order held, did not hold, undecided
      expect(segs.map((r) => [r.getAttribute("data-seg"), Number(r.getAttribute("width"))])).toEqual(
        [["held", o.held], ["did_not_hold", o.did_not_hold], ["undecided", o.undecided]].filter(([, n]) => n > 0));
      expect(segs.reduce((n, r) => n + Number(r.getAttribute("width")), 0)).toBe(o.of);
      expect(bar.getAttribute("aria-label")).toContain(`${o.held} of ${o.of} went as agreed`);
      expect(bar.outerHTML).not.toMatch(/%|percent|style=/i);
    }
  });
  it("never says a signature or a witness was checked, and names anchor_inclusion not checked", () => {
    for (const p of everyPage(l).filter((x) => x.depth === "L2" && x.model.state !== "unreadable")) {
      const row = p.host.L2.querySelector('[data-property="anchor_inclusion"]');
      expect(row.getAttribute("data-property-status")).toBe("NOT_CHECKED");
      // "signed" only where the page says it did not check the signature.
      const sentences = pageText(p.host).split(/(?<=\.)\s*|\n/).filter((s) => /\bsign(ed|ature)\b|witnessed/i.test(s));
      expect(sentences.filter((s) => !/does not check the signature/.test(s) && !/^That the holder's key signed it\.?$/.test(s.trim()))).toEqual([]);
    }
  });
});

// In a real browser: the module on a page, at a phone's and a laptop's width.
const chromePath = findChrome();
if (!chromePath && process.env.CI) throw new Error("standard history card test: no Chromium found under CI; set CHROME_PATH");
if (!chromePath) console.warn("SKIPPED standard history card in headless Chromium: no Chromium found (set CHROME_PATH to run it)");

const GOLDEN_PAGES = ["person-shared", "person-own", "node-shared", "neg-percentage-member"];

// The witnessed pages (capsule-viewer#183): bundles a real capsulectl cut
// (examples/standard-history/cut_witness_fixtures.sh) with TEST-KEYED Receipts
// from AAC's anchor-witness-v1 vectors. This page has no AAC code, so the
// runtime global here is a stand-in that answers with the report AAC's vectors
// expect for that Receipt (the case's witness_expected) under the reader's list
// named below; the real check, through the real runtime, runs on the same
// bundles in ts/test/standard-history-witness.test.ts.
const WITNESS_DATA = join(DATA, "witness");
const WITNESS_CASES = JSON.parse(readFileSync(join(WITNESS_DATA, "witness_cases.json"), "utf8"));
const WITNESS_VECTORS = JSON.parse(readFileSync(join(DATA, "aac", "anchor-witness-v1.json"), "utf8"));
const READER_NAMES = WITNESS_VECTORS.policies.default.witnesses.map((w) => w.name);
// name -> the reader's list the page holds: the vectors' witnesses, or none.
const WITNESS_PAGES = [
  ["person-shared-witnessed", READER_NAMES],
  ["person-shared-witnessed", [], "not-checked"],
  ["person-shared-unwitnessed", READER_NAMES],
  ["person-shared-witness-unlisted", READER_NAMES],
];
const witnessPageName = ([name, , variant]) => (variant ? `${name}-${variant}` : name);
describe.skipIf(!chromePath)("the module in headless Chromium", () => {
  let browser;
  let tab;
  let dir;
  const urls = {};
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cv-standard-history-"));
    for (const c of CASES) {
      const ctx = contextOf(c.name);
      const data = JSON.stringify({ bundle: ctx.bundle, root: ctx.root, verification: ctx.verification, disclosures: [...ctx.resolvedDisclosures] }).replace(/</g, "\\u003c");
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>History card</title></head>
<body class="cv-kit"><main class="cv-page"><div data-level="L0"></div><div data-level="L1"></div><div data-level="L2"></div></main>
<script>var EvidenceGraph = { registerPresentation: function (m) { window.__sh = m; } };</script>
<script>${SCRIPT}</script>
<script>(function () { var d = ${data}, m = window.__sh, q = function (l) { return document.querySelector('[data-level="' + l + '"]'); };
var ctx = { bundle: d.bundle, root: d.root, verification: d.verification, resolvedDisclosures: new Map(d.disclosures) };
if (m.canRender(ctx)) m.buildModel(ctx).then(function (model) { m.render(model, { L0: q("L0"), L1: q("L1"), L2: q("L2"), depth: "L0" }, {}); }); })();</script></body></html>`;
      const file = join(dir, `${c.name}.html`);
      writeFileSync(file, html);
      urls[c.name] = pathToFileURL(file).href;
    }
    for (const page of WITNESS_PAGES) {
      const [name, names] = page;
      const wc = WITNESS_CASES.find((c) => c.name === name);
      const ctx = standInContext(JSON.parse(readFileSync(join(WITNESS_DATA, `${name}.bundle.json`), "utf8")), {
        verify: JSON.parse(readFileSync(join(WITNESS_DATA, "verify", `${name}.json`), "utf8")),
      });
      const data = JSON.stringify({ bundle: ctx.bundle, root: ctx.root, verification: ctx.verification, disclosures: [...ctx.resolvedDisclosures] }).replace(/</g, "\\u003c");
      const report = names.length ? wc.witness_expected : { status: "NOT_CHECKED", receipts: [], witness: null, witnessed_time: null };
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>History card</title></head>
<body class="cv-kit"><main class="cv-page"><div data-level="L0"></div><div data-level="L1"></div><div data-level="L2"></div></main>
<script>var EvidenceGraph = { registerPresentation: function (m) { window.__sh = m; },
  readerAnchorWitness: function () { return Promise.resolve(${JSON.stringify({ checkpoint: "not_carried", ...report })}); },
  readerWitnessPolicy: function () { return { witnesses: ${JSON.stringify(names)}.map(function (n) { return { name: n, keys: [] }; }) }; },
  setReaderWitnessPolicy: function () { return true; } };</script>
<script>${SCRIPT}</script>
<script>(function () { var d = ${data}, m = window.__sh, q = function (l) { return document.querySelector('[data-level="' + l + '"]'); };
var ctx = { bundle: d.bundle, root: d.root, verification: d.verification, resolvedDisclosures: new Map(d.disclosures) };
if (m.canRender(ctx)) m.buildModel(ctx).then(function (model) { m.render(model, { L0: q("L0"), L1: q("L1"), L2: q("L2"), depth: "L0" }, {}); }); })();</script></body></html>`;
      const file = join(dir, `${witnessPageName(page)}.html`);
      writeFileSync(file, html);
      urls[witnessPageName(page)] = pathToFileURL(file).href;
    }
    browser = await launch(chromePath);
    tab = await browser.newPage();
  }, 60000);
  afterAll(async () => {
    if (browser) await browser.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }, CLOSE_TIMEOUT_MS);

  const MEASURE = `(() => {
    document.querySelectorAll("details").forEach((d) => { d.open = true; });
    const lefts = (sel) => [...new Set([...document.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().left)))];
    const dot = (o) => { const e = document.querySelector('[data-outcome="' + o + '"] .cv-sh__dot'); return e ? getComputedStyle(e).backgroundColor + "|" + getComputedStyle(e).borderStyle : null; };
    return {
      state: document.querySelector('[data-level="L0"]').getAttribute("data-sh-state"),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      columns: lefts('[data-sh-level="L1"] .cv-sh__cols > section').length,
      nested: document.querySelectorAll("details details").length,
      held: dot("held"), undecided: dot("undecided"),
      bannerTop: (document.querySelector('[data-banner="private"]') || { getBoundingClientRect: () => ({ top: null }) }).getBoundingClientRect().top,
      text: document.body.innerText,
    };
  })()`;

  for (const width of [390, 1280]) {
    for (const c of CASES) {
      it(`${c.name} at ${width}px`, async () => {
        await tab.open(urls[c.name], { width });
        const m = await tab.evaluate(MEASURE);
        expect(m.state).toBe(c.expected.standard ? "card" : "refused");
        expect(m.overflow).toBe(false);
        expect(m.nested).toBe(0);
        expect(m.text).not.toMatch(/%/);
        if (m.state === "card") {
          expect(m.columns).toBe(width === 390 ? 1 : 2);
          if (c.card.outcomes.of) expect(m.undecided).not.toBe(m.held);
        }
        if ("deals" in c.block) expect(m.bannerTop).toBeLessThan(200);
        if (GOLDEN_PAGES.includes(c.name)) {
          // Every toggle open, so the golden shows every section in its column.
          await tab.open(urls[c.name], { width });
          await tab.evaluate(`document.querySelectorAll("details").forEach((d) => { d.open = true; })`);
          const shot = await tab.screenshot();
          const path = join(GOLDENS, `standard-history-${c.name}-${width}.png`);
          if (UPDATE) writeFileSync(path, shot);
          expect(existsSync(path), `golden ${path} is not committed; run with UPDATE_GOLDENS=1`).toBe(true);
          expect(readFileSync(path).readUInt32BE(16)).toBe(width);
        }
      }, 30000);
    }
  }

  // The witness line on the page, with and without Receipts, at a phone's width and a laptop's.
  const WITNESS_LINE = "Snapshot recorded Nov 1, 2026 08:04 UTC by witness-a";
  for (const width of [390, 1280]) {
    for (const page of WITNESS_PAGES) {
      const key = witnessPageName(page);
      it(`${key} at ${width}px`, async () => {
        await tab.open(urls[key], { width });
        const m = await tab.evaluate(MEASURE);
        expect(m.state).toBe("card");
        expect(m.overflow).toBe(false);
        expect(m.nested).toBe(0);
        expect(m.columns).toBe(width === 390 ? 1 : 2);
        const line = key === "person-shared-witnessed";
        expect(m.text.includes(WITNESS_LINE)).toBe(line);
        // Only a Receipt that came and was not checked says so; none and a failed one say nothing.
        expect(m.text.includes("A witness receipt came with the card")).toBe(key.endsWith("not-checked"));
        expect(m.text.includes("receipt came") || m.text.includes("recorded")).toBe(line || key.endsWith("not-checked"));
        // The reader's own list is shown wherever Receipts came with the card.
        expect(m.text.includes("Witnesses you accept")).toBe(!key.includes("unwitnessed"));
        if (line || key.endsWith("not-checked")) {
          await tab.open(urls[key], { width });
          await tab.evaluate(`document.querySelectorAll("details").forEach((d) => { d.open = true; })`);
          const shot = await tab.screenshot();
          const path = join(GOLDENS, `standard-history-${key}-${width}.png`);
          if (UPDATE) writeFileSync(path, shot);
          expect(existsSync(path), `golden ${path} is not committed; run with UPDATE_GOLDENS=1`).toBe(true);
          expect(readFileSync(path).readUInt32BE(16)).toBe(width);
        }
      }, 30000);
    }
  }
});
