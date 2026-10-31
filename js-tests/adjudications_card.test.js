// The Adjudications module, src/capsule_viewer/static/adjudications_card.js, run
// directly: the bytes the manifest pins (executable.script_sha256), with only the
// page runtime stood in for, as js-tests/standard_history_card.test.js does.
//
// (1) The script is the one the manifest pins, with the pack and styles it pins.
// (2) The canvas scenario (38 adjudications, 35 concur, 3 differ, five terms,
//     three adjudicators) draws its numbers from the records, and every figure
//     recomputes from them.
// (3) The negatives: no calibration summary, no adjudication sampled (never 0%),
//     k above n, a rating that is not blind, an unknown block member, a recount
//     that does not match the summary, an unverified bundle; and a percentage
//     only ever beside the k and n it is computed from.
// (4) What the bundle does not carry is named on the page, never drawn: no
//     rationale text, no book or controller, however a record's strings read.
// (5) The same pages in headless Chromium at 390px and 1280px: no horizontal
//     scroll, no nested toggles, and the goldens in tests/goldens/
//     (UPDATE_GOLDENS=1 rewrites them).
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLOSE_TIMEOUT_MS, findChrome, launch } from "./headlessChrome.js";
import { standInContext } from "./aacContext.js";
import { EXT, TERMS, build, reseal, sha } from "./adjudicationsFixture.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATIC = join(ROOT, "src", "capsule_viewer", "static");
const SCRIPT_BYTES = readFileSync(join(STATIC, "adjudications_card.js"));
const SCRIPT = SCRIPT_BYTES.toString("utf8");
const PKG = join(ROOT, "src", "capsule_viewer", "adjudications");
const MANIFEST = JSON.parse(readFileSync(join(PKG, "manifest.json"), "utf8"));
const GOLDENS = join(ROOT, "tests", "goldens");
const UPDATE = process.env.UPDATE_GOLDENS === "1";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

function load() {
  const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", { runScripts: "outside-only" });
  const registered = [];
  dom.window.EvidenceGraph = { registerPresentation: (m) => registered.push(m) };
  dom.window.eval(SCRIPT);
  return { window: dom.window, document: dom.window.document, registered, api: dom.window.CapsuleViewerAdjudications };
}
const claims = { intervalCoverage: { status: "pass", findings: [] }, perRecordMembership: { status: "pass", findings: [] } };
const ctxOf = (bundle) => standInContext(bundle, { claims });
const modelOf = (l, bundle) => JSON.parse(JSON.stringify(l.registered[0].buildModel(ctxOf(bundle))));
function renderAll(l, model, depth = "L2") {
  const doc = l.document;
  const host = { L0: doc.createElement("div"), L1: doc.createElement("div"), L2: doc.createElement("div"), depth };
  doc.body.replaceChildren(host.L0, host.L1, host.L2);
  l.registered[0].render(model, host, {});
  return host;
}
const text = (h) => [h.L0, h.L1, h.L2].map((r) => r.textContent).join("\n");
const html = (h) => [h.L0, h.L1, h.L2].map((r) => r.innerHTML).join("\n");
const page = (bundle, depth) => { const l = load(); return { l, host: renderAll(l, modelOf(l, bundle), depth), model: modelOf(l, bundle) }; };

describe("the script and its manifest", () => {
  it("is the script the manifest pins, and registers exactly one module, the manifest's", () => {
    expect(sha256(SCRIPT_BYTES)).toBe(MANIFEST.executable.script_sha256);
    const l = load();
    expect(l.registered).toHaveLength(1);
    expect(l.registered[0].manifest.id).toBe(MANIFEST.id);
    expect(MANIFEST.requires.extensions.required).toEqual([EXT]);
  });
  it("carries the pack and stylesheets the manifest pins", () => {
    const pack = readFileSync(join(PKG, "wording-en.json"));
    expect(sha256(pack)).toBe(MANIFEST.executable.wording_sha256);
    const l = load();
    expect(l.api.PACK.sha256).toBe(MANIFEST.executable.wording_sha256);
    expect(l.api.WORDS).toEqual(JSON.parse(pack.toString("utf8")).entries);
    expect(MANIFEST.executable.style_sha256).toEqual([sha256(readFileSync(join(STATIC, "kit.css"))), sha256(readFileSync(join(STATIC, "adjudications.css")))]);
  });
});

describe("the canvas scenario, from the records", () => {
  const bundle = build();
  const { host, model } = page(bundle);
  const strip = (kind) => host.L0.querySelector(`[data-adj-tile="${kind}"]`).textContent;

  it("states the strip's four tiles, each from the records", () => {
    expect(model.state).toBe("page");
    expect([model.k, model.n]).toEqual([35, 38]);
    expect(strip("adjudications")).toBe("38adjudications · of 59 judged verdicts in this bundle");
    expect(strip("concur")).toBe("35 of 38concur with the judge");
    expect(strip("differ")).toBe("3 of 38do not concur");
    expect(strip("percent")).toMatch(/^92%concurrence/);
  });
  it("draws the headline in words, and the contents-checked bar from what it checked", () => {
    expect(host.L0.querySelector('[data-adj="headline"]').textContent).toBe("Thirty-eight blind re-grades, thirty-five agree with the judge");
    expect(host.L0.querySelector('[data-adj="contents-checked"]').textContent).toBe(
      "Contents checked39 of 39 adjudication records cite a record in this bundle · 3 adjudicators · signatures not checked here");
    expect(host.L0.querySelector('[data-adj="core"]').textContent).toBe("CORE · 5 judged terms · judge jev-1.13.0 · summaries computed 2026-10-31");
  });
  it("draws By term from the summary, one row per term, each k of n and its derived percentage", () => {
    const rows = [...host.L1.querySelectorAll("[data-term]")];
    expect(rows.map((r) => [r.dataset.term, +r.dataset.k, +r.dataset.n])).toEqual([...TERMS].map(([t, n, k]) => [t, k, n]).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    const within = host.L1.querySelector('[data-term="within-fare-rules"]');
    expect(within.lastElementChild.textContent).toBe("11 of 12 · 92%");
  });
  it("draws By adjudicator closed, with its three adjudicators and no book or controller", () => {
    const d = host.L1.querySelector('[data-adj-section="adjudicators"]');
    expect(d.tagName).toBe("DETAILS");
    expect(d.open).toBe(false);
    const rows = [...d.querySelectorAll("[data-adjudicator]")];
    expect(rows.map((r) => r.dataset.adjudicator)).toEqual(["p-04", "p-07", "p-11"]);
    expect(d.textContent).toMatch(/not in this bundle/);
  });
  it("lists differences first, then at most three more, and says how many are left", () => {
    const rows = [...host.L1.querySelectorAll("[data-adj-row]")];
    expect(rows.map((r) => r.dataset.adjRow)).toEqual(["differs", "differs", "differs", "concurs", "concurs", "concurs"]);
    expect(host.L1.querySelector('[data-adj="more"]').textContent).toBe("33 more. Differences are listed first.");
  });
  it("opens a row to the judge's and the adjudicator's side, side by side, and names what is not there", () => {
    const row = host.L1.querySelector('[data-adj-row="differs"]');
    const judge = row.querySelector('[data-adj-panel="judge"]').textContent;
    const adj = row.querySelector('[data-adj-panel="adjudicator"]').textContent;
    expect(judge).toMatch(/^The judge · jev-1\.13\.0said (met|not met)Its words are not in this bundle/);
    expect(adj).toMatch(/^The adjudicator · p-\d\d · blindsaid (met|not met)Their words are not in this bundle/);
    expect(row.querySelector("summary").textContent).toMatch(/^task \d+, trial 0p-\d\d(met|not met)(met|not met)differsFri|Sat|Sun|Mon|Tue|Wed|Thu/);
  });
  it("counts the answer that is neither met nor not met in no count", () => {
    const l = load();
    const m = modelOf(l, bundle);
    expect(m.rows.filter((r) => r.match === "not_counted")).toHaveLength(1);
    expect(m.n).toBe(38);
  });
  it("draws no nested toggle and no HTML from a record", () => {
    const h = page(bundle, "L2").host;
    expect(h.L0.ownerDocument.querySelectorAll("details details")).toHaveLength(0);
    expect(h.L2.querySelector("details").open).toBe(true);
  });
});

describe("voice: the second person on the holder's own preview, the third when shared", () => {
  const own = page(build({ own: true })).host;
  const shared = page(build()).host;
  it("states the two voices, and only the own copy carries the banner", () => {
    expect(own.L0.querySelector('[data-banner="own"]')).not.toBeNull();
    expect(shared.L0.querySelector('[data-banner="own"]')).toBeNull();
    expect(text(own)).toMatch(/your pack's blind human sample/);
    expect(text(shared)).toMatch(/the pack's blind human sample/);
    expect(own.L0.getAttribute("data-adj-copy")).toBe("own");
    expect(shared.L0.getAttribute("data-adj-copy")).toBe("shared");
  });
  it("shares every figure between the voices", () => {
    expect(own.L0.querySelector('[data-adj-tile="percent"]').textContent).toBe(shared.L0.querySelector('[data-adj-tile="percent"]').textContent);
  });
  it("never says you or your in the shared copy", () => {
    expect(text(shared)).not.toMatch(/\byou(r|rs)?\b/i);
  });
});

describe("the checks", () => {
  it("passes the recount when every rating is in the bundle and equals the summary", () => {
    const { model } = page(build());
    expect(model.checks).toEqual({ bundle: "PASS", summary: "PASS", records: "PASS", recount: "PASS" });
  });
  it("does not check the recount when a rating's report is not in the bundle, and still draws the summary", () => {
    const b = build();
    const dropped = JSON.parse(JSON.stringify(b));
    const rating = dropped.records.find((r) => dropped.disclosures[r.capsule_id].agent_input.record_version === "human-rating/v1");
    const cited = dropped.disclosures[rating.capsule_id].agent_input.case.digest;
    dropped.records = dropped.records.filter((r) => r.capsule_id !== cited);
    delete dropped.disclosures[cited];
    const { model, host } = page(dropped);
    expect(model.state).toBe("page");
    expect(model.checks.recount).toBe("NOT_CHECKED");
    expect(model.rows.filter((r) => r.match === "unresolved")).toHaveLength(1);
    expect(host.L1.querySelector('[data-adj-section="terms"]')).not.toBeNull();
  });
  it("draws only the summary when the ratings are not in the bundle, and says so", () => {
    const b = build();
    const thin = JSON.parse(JSON.stringify(b));
    const isRating = (r) => thin.disclosures[r.capsule_id].agent_input.record_version === "human-rating/v1";
    const gone = thin.records.filter(isRating);
    thin.records = thin.records.filter((r) => !isRating(r));
    gone.forEach((r) => delete thin.disclosures[r.capsule_id]);
    const { model, host } = page(thin);
    expect(model.state).toBe("page");
    expect(model.checks.recount).toBe("NOT_CHECKED");
    expect(text(host)).toMatch(/adjudication records themselves are not in this bundle/);
    // Without the ratings nothing states "blind" or "human", so the page does not either.
    expect(host.L0.querySelector('[data-adj="headline"]').textContent).toBe("Thirty-eight re-grades, thirty-five agree with the judge");
    expect(text(host)).not.toMatch(/blind|human/i);
    expect(host.L0.querySelector('[data-adj="blind"]')).toBeNull();
  });
  it("calls a withheld rating a gap, not a mismatch, and still draws the summary", () => {
    const b = build();
    const gone = b.records.find((r) => b.disclosures[r.capsule_id].agent_input.record_version === "human-rating/v1");
    b.records = b.records.filter((r) => r !== gone);
    delete b.disclosures[gone.capsule_id];
    const { model } = page(b);
    expect(model.state).toBe("page");
    expect(model.checks.recount).toBe("NOT_CHECKED");
    expect([model.k, model.n]).toEqual([35, 38]);
  });
  it("draws no counts for two summaries it cannot tell apart from one counted twice", () => {
    const b = build();
    const second = JSON.parse(JSON.stringify(b.records.find((r) => r.capsule_id === b.root)));
    const input = JSON.parse(JSON.stringify(b.disclosures[b.root].agent_input));
    input.record_id = "summary-0";
    input.computed_at = "2026-10-24T02:00:00Z";
    second.model_attestation.compute_attestation.agent_input_digest = sha(input);
    delete second.capsule_id;
    second.capsule_id = sha(second);
    b.records.push(second);
    b.disclosures[second.capsule_id] = { agent_input: input };
    // With every rating in the bundle the sum is 70 of 76 against 39 ratings: not a count, never 70 of 76.
    expect(page(b).model.state).toBe("ambiguous");
    const thin = JSON.parse(JSON.stringify(b));
    const isRating = (r) => thin.disclosures[r.capsule_id].agent_input.record_version === "human-rating/v1";
    const gone = thin.records.filter(isRating);
    thin.records = thin.records.filter((r) => !isRating(r));
    gone.forEach((r) => delete thin.disclosures[r.capsule_id]);
    const { model, host } = page(thin);
    expect(model.state).toBe("ambiguous");
    expect(host.L0.querySelector("[data-adj-tile]")).toBeNull();
    expect(text(host)).not.toMatch(/70 of 76/);
  });
  it("counts a rating whose report holds several cases as not resolved, and says why", () => {
    const b = build({ terms: [["a-term", 2, 2]], uncounted: 0, unrated: 0 });
    const rating = b.records.map((r) => b.disclosures[r.capsule_id].agent_input).find((x) => x.record_version === "human-rating/v1");
    const target = b.records.find((r) => r.capsule_id === rating.case.digest);
    // The report grows a second case: its id changes, so the rating's citation is re-pointed with it.
    const input = JSON.parse(JSON.stringify(b.disclosures[target.capsule_id].agent_input));
    input.cases.push({ ...input.cases[0], case_id: "second" });
    const moved = { ...target, model_attestation: { compute_attestation: { agent_input_digest: sha(input) } } };
    delete moved.capsule_id;
    const id = sha(moved);
    b.records[b.records.indexOf(target)] = { ...moved, capsule_id: id };
    delete b.disclosures[target.capsule_id];
    b.disclosures[id] = { agent_input: input };
    const ratingRec = b.records.find((r) => b.disclosures[r.capsule_id].agent_input === rating);
    const newRating = { ...rating, case: { ...rating.case, digest: id } };
    const r2 = { ...ratingRec, model_attestation: { compute_attestation: { agent_input_digest: sha(newRating) } } };
    delete r2.capsule_id;
    const rid = sha(r2);
    b.records[b.records.indexOf(ratingRec)] = { ...r2, capsule_id: rid };
    delete b.disclosures[ratingRec.capsule_id];
    b.disclosures[rid] = { agent_input: newRating };
    const { model, host } = page(b);
    expect(model.state).toBe("page");
    expect(model.checks.recount).toBe("NOT_CHECKED");
    expect(model.rows.filter((r) => r.match === "unresolved")).toHaveLength(1);
    host.L1.querySelectorAll("details").forEach((d) => { d.open = true; });
    expect(host.L1.querySelector('[data-adj-row="unresolved"]').textContent).toMatch(/holds more than one case/);
  });
});

describe("the negatives", () => {
  const ratingOf = (i) => (x) => x.record_version === "human-rating/v1" && x.record_id === `rating-${i}`;

  it("draws no counts when the ratings do not recount to the summary", () => {
    // Rating 1 (within-fare-rules, concurs) flipped: the summary still says 11 of 12.
    const b = reseal(build(), ratingOf(1), (x) => { x.label = x.label === "met" ? "not_met" : "met"; });
    const { model, host } = page(b);
    expect(model.state).toBe("mismatch");
    expect(model.checks.recount).toBe("FAIL");
    expect(host.L0.querySelector("[data-adj-tile]")).toBeNull();
    expect(text(host)).not.toMatch(/\d+ of \d+|%/);
  });
  it("draws no percentage and no tile when nothing was sampled, never 0%", () => {
    const b = build({ terms: [["a-term", 0, 0]], uncounted: 0, unrated: 0 });
    const { model, host } = page(b);
    expect(model.state).toBe("none");
    expect(text(host)).toMatch(/None of the judged verdicts was sampled/);
    expect(text(host)).not.toMatch(/%/);
    expect(host.L0.querySelector("[data-adj-tile]")).toBeNull();
  });
  it("refuses a summary whose k is above its n", () => {
    const b = reseal(build(), (x) => x.record_version === "calibration-summary/v1", (x) => { x.clauses[0].agreement.k = 13; });
    expect(page(b).model.state).toBe("unreadable");
  });
  it("refuses a drift tally whose k is above its n, and blames the summary", () => {
    const b = reseal(build(), (x) => x.record_version === "calibration-summary/v1", (x) => { x.clauses[0].drift = { k: 99, n: 1 }; });
    const { model } = page(b);
    expect(model.state).toBe("unreadable");
    expect(model.checks.summary).toBe("FAIL");
  });
  it("refuses a rating that does not say it is blind, and blames the records, not the summary", () => {
    const b = reseal(build(), ratingOf(1), (x) => { x.blind = false; });
    const { model } = page(b);
    expect(model.state).toBe("unreadable");
    expect(model.checks).toEqual({ bundle: "PASS", summary: "NOT_CHECKED", records: "FAIL", recount: "NOT_CHECKED" });
  });
  it("refuses a block member it does not know, and draws a refusal without the error's text", () => {
    const b = build();
    b.extensions[EXT] = { own: true, secret: "SETTLEMENT-PREIMAGE" };
    const { model, host } = page(b);
    expect(model.state).toBe("unreadable");
    expect(text(host)).not.toMatch(/SETTLEMENT-PREIMAGE|secret/);
  });
  it("draws no percentage for an adjudicator with no counted answer", () => {
    // Every one of p-07's ratings neither met nor not met: sampled, but k of n is 0 of 0.
    let b = build({ terms: [["a-term", 2, 2]], uncounted: 0, unrated: 0 });
    b = reseal(b, (x) => x.record_version === "human-rating/v1" && x.rater_ref === "p-07", (x) => { x.label = "not_evaluable"; });
    const { model, host } = page(b);
    expect(model.state).toBe("page");
    const p07 = host.L1.querySelector('[data-adjudicator="p-07"]');
    expect(p07.lastElementChild.textContent).toBe("0 of 0");
    expect(p07.textContent).not.toMatch(/%/);
    const full = build({ terms: [["a-term", 3, 3]], uncounted: 0, unrated: 0 });
    const ok = page(full);
    const none = [...ok.host.L1.querySelectorAll("[data-adjudicator]")].map((r) => r.lastElementChild.textContent);
    expect(none.every((t) => /^\d+ of \d+ · \d+%$/.test(t))).toBe(true);
  });
  it("says there is no summary when the bundle carries none", () => {
    const b = build();
    b.records = b.records.filter((r) => b.disclosures[r.capsule_id].agent_input.record_version !== "calibration-summary/v1");
    b.root = b.records[0].capsule_id;
    expect(page(b).model.state).toBe("nosummary");
  });
  it("draws nothing from a bundle that did not verify", () => {
    const b = build();
    b.records[0] = { ...b.records[0], action_id: "tampered" };
    const { model, host } = page(b);
    expect(model.state).toBe("unverified");
    expect(host.L0.querySelector("[data-adj-tile]")).toBeNull();
    expect(host.L2.textContent).toBe("");
  });
  it("draws a percentage only beside the k and n it is computed from", () => {
    const host = page(build()).host;
    const cells = [...host.L1.querySelectorAll("td")].map((c) => c.textContent).filter((t) => /%/.test(t));
    expect(cells.length).toBe(TERMS.length + 3);
    for (const c of cells) {
      const [, k, n, p] = /^(\d+) of (\d+) · (\d+)%$/.exec(c);
      expect(+p).toBe(Math.floor((200 * +k + +n) / (2 * +n)));
    }
    // The only other percentage is the strip's tile, which sits beside "35 of 38".
    expect(host.L0.textContent.match(/%/g)).toHaveLength(1);
    expect(host.L1.textContent.match(/%/g)).toHaveLength(cells.length);
  });
  it("sets a hostile label and rater by textContent", () => {
    const b = reseal(build(), ratingOf(1), (x) => { x.label = "<img src=x onerror=alert(1)>"; x.rater_ref = "<script>x</script>"; });
    const { host } = page(b);
    expect(host.L1.querySelector("img, script")).toBeNull();
    expect(html(host)).not.toMatch(/<img[ >]/);
    expect(host.L1.textContent).toContain("<script>x</script>");
  });
  it("carries no rationale or book the bundle does not hold: a record's own strings never reach the judge's panel as words", () => {
    const b = reseal(build(), ratingOf(1), (x) => { x.note = "I think the customer asked for it"; });
    expect(page(b).model.state).toBe("page");
    expect(text(page(b).host)).not.toMatch(/I think the customer/);
  });
});

describe("the pack", () => {
  it("has a figure and a percentage only where the page derives them", () => {
    const l = load();
    const pct = Object.entries(l.api.WORDS).filter(([, v]) => /%/.test(v)).map(([k]) => k);
    expect(pct.sort()).toEqual(["term.concurrence", "tile.percent.value"]);
  });
  it("spells a count to 99 and gives digits above", () => {
    const { api } = load();
    expect([0, 7, 13, 21, 38, 99, 100].map(api.spell)).toEqual(["zero", "seven", "thirteen", "twenty-one", "thirty-eight", "ninety-nine", "100"]);
    expect([[35, 38], [1, 2], [0, 3], [11, 12]].map(([k, n]) => api.percent(k, n))).toEqual([92, 50, 0, 92]);
  });
});

describe("headless Chromium: 390px and 1280px", () => {
  const chromePath = findChrome();
  const CASES = [
    ["page-shared", build()],
    ["page-own", build({ own: true })],
    ["none", build({ terms: [["a-term", 0, 0]], uncounted: 0, unrated: 0 })],
  ];
  const GOLDEN_PAGES = ["page-shared", "page-own"];
  let dir, browser, tab;
  const urls = {};
  beforeAll(async () => {
    if (!chromePath) return;
    dir = mkdtempSync(join(tmpdir(), "adj-"));
    for (const [name, bundle] of CASES) {
      const ctx = ctxOf(bundle);
      const data = JSON.stringify({ bundle: ctx.bundle, root: ctx.root, verification: ctx.verification, disclosures: [...ctx.resolvedDisclosures] }).replace(/</g, "\\u003c");
      const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Adjudications</title></head>
<body class="cv-kit"><main class="cv-page"><div data-level="L0"></div><div data-level="L1"></div><div data-level="L2"></div></main>
<script>var EvidenceGraph = { registerPresentation: function (m) { window.__adj = m; } };</script>
<script>${SCRIPT}</script>
<script>(function () { var d = ${data}, m = window.__adj, q = function (l) { return document.querySelector('[data-level="' + l + '"]'); };
var ctx = { bundle: d.bundle, root: d.root, verification: d.verification, resolvedDisclosures: new Map(d.disclosures) };
if (m.canRender(ctx)) m.render(m.buildModel(ctx), { L0: q("L0"), L1: q("L1"), L2: q("L2"), depth: "L0" }, {}); })();</script></body></html>`;
      const file = join(dir, `${name}.html`);
      writeFileSync(file, doc);
      urls[name] = pathToFileURL(file).href;
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
    return {
      state: document.querySelector('[data-level="L0"]').getAttribute("data-adj-state"),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      nested: document.querySelectorAll("details details").length,
      tiles: [...new Set([...document.querySelectorAll("[data-adj-tile]")].map((e) => Math.round(e.getBoundingClientRect().top)))].length,
      panels: [...new Set([...document.querySelectorAll('[data-adj-row="differs"] [data-adj-panel]')].slice(0, 2).map((e) => Math.round(e.getBoundingClientRect().top)))].length,
    };
  })()`;
  for (const width of [390, 1280]) {
    for (const [name] of CASES) {
      it(`${name} at ${width}px`, async () => {
        if (!chromePath) return;
        await tab.open(urls[name], { width });
        const m = await tab.evaluate(MEASURE);
        expect(m.state).toBe(name === "none" ? "none" : "page");
        expect(m.overflow).toBe(false);
        expect(m.nested).toBe(0);
        if (name !== "none") {
          expect(m.tiles).toBe(width === 390 ? 2 : 1);
          expect(m.panels).toBe(width === 390 ? 2 : 1);
        }
        if (GOLDEN_PAGES.includes(name)) {
          await tab.open(urls[name], { width });
          await tab.evaluate(`document.querySelectorAll("details").forEach((d) => { d.open = true; })`);
          const shot = await tab.screenshot();
          const path = join(GOLDENS, `adjudications-${name}-${width}.png`);
          if (UPDATE) writeFileSync(path, shot);
          expect(existsSync(path), `golden ${path} is not committed; run with UPDATE_GOLDENS=1`).toBe(true);
          expect(readFileSync(path).readUInt32BE(16)).toBe(width);
        }
      }, 30000);
    }
  }
});
