// SPDX-License-Identifier: Apache-2.0
/**
 * The core strip: the first thing in L0 on every page whose bundle carries
 * an Evidence Result (capsule-viewer#81; presentation contract section
 * 9.1). The core draws it, never a module: the mock-judge mark when a judge
 * was a mock (decision D5 (b)), then the CORE identity line, then the
 * Result's sealed aggregate,
 * coverage first and then the buckets, each count beside its denominator
 * (contract-report/v1 section 2, evidence-result-v0 section 3). It carries
 * no percentage and no single figure. A page whose bundle carries no
 * Result draws no strip (the 2026-10-25 ruling on #81).
 *
 * A module, a section or a composed layout writes into L0 after the strip;
 * one that puts anything before it, or changes it, is discarded for the
 * refusal like one that alters the banner (evidence-graph-view.ts).
 */
import {
  utcDateOf,
  type CountMismatch,
  type ResultRoot,
} from "@action-state-group/agent-action-capsule";
import type { Words } from "./contract-report-wording.js";
import { OUTCOME_FRAME_VARS } from "./frame-tokens.generated.js";
import { judgedByMock, tallyJudges } from "./report-provenance.js";

/** The strip's marker attribute: the core's alone, refused anywhere else on a page. */
export const CORE_STRIP_ATTRIBUTE = "data-core-strip";

/**
 * The strip's stylesheet, inserted with it. The core runtime inserts it at
 * render time, so it is one of CORE_RUNTIME_STYLES and the page's CSP lists
 * its hash.
 */
export const CORE_STRIP_CSS = `
.cv-strip{${OUTCOME_FRAME_VARS}max-width:1080px;margin:0 auto 16px;padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:#FAF8F4;color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.cv-strip .mockmark{display:inline-block;margin:0 0 10px;padding:3px 10px;border:1px solid #F0D7A8;background:var(--gold-l);color:#8A5A0B;border-radius:8px;font-weight:600;font-size:13px;line-height:1.45}
.cv-strip .agg-line{font-size:14px;margin:0 0 12px}
.cv-strip .agg-buckets{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.cv-strip .agg-bucket{display:flex;flex-direction:column;gap:4px;border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:#fff}
.cv-strip .agg-bucket b{font-family:Georgia,"Iowan Old Style",Cambria,serif;font-size:28px;line-height:1.1;font-variant-numeric:tabular-nums}
.cv-strip .agg-bucket span{font-size:12.5px;color:var(--slate);overflow-wrap:anywhere}
.cv-strip .count.mismatch{font-size:12px;font-weight:600;color:var(--bad)}
.cv-strip .agg-note{font-size:12.5px;color:var(--slate);margin:6px 0 0}
.cv-strip .agg-bucket.met b{color:var(--ok)}
.cv-strip .agg-bucket.not_met b{color:var(--bad)}
.cv-strip .agg-bucket.not_evaluable b{color:#5F6672}
@media (max-width:640px){.cv-strip .agg-buckets{grid-template-columns:minmax(0,1fr)}.cv-strip .agg-bucket{flex-direction:row;flex-wrap:wrap;align-items:baseline;gap:4px 10px}.cv-strip .agg-bucket b{font-size:22px}}
@media print{.cv-strip{break-inside:avoid}}
`;

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== "") node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const fmt = (n: number): string => n.toLocaleString("en-US");

// The aggregate is drawn as sealed (contract-report/v1 section 2). Where
// the claims give another number (`countMismatches`), a marker beside the
// sealed one says what the claims give, so a disagreement reads as one and
// neither number is silently preferred (presentation contract section 3).
function mismatchMarker(
  result: ResultRoot,
  field: CountMismatch["field"],
  w: Words,
): HTMLElement | undefined {
  const mismatch = result.countMismatches.find(
    (entry) => entry.field === field,
  );
  if (mismatch === undefined) return undefined;
  const marker = el(
    "span",
    "count mismatch",
    w.t("front.agg.mismatch", { recomputed: fmt(mismatch.recomputed) }),
  );
  marker.dataset.countMismatch = field;
  marker.dataset.stated = String(mismatch.stated);
  marker.dataset.recomputed = String(mismatch.recomputed);
  return marker;
}

/**
 * The Result's sealed aggregate, coverage first and then the buckets, each
 * count with its unit (evaluations) and beside its denominator, the
 * evaluated population every in-force claim's bucket is drawn from (ER
 * section 4.3); `unknown_count` is "evaluations with an unknown result",
 * never "unresolved". The numbers are the producer's (`statedCoverage`, the
 * `buckets` lists), with a marker wherever the claims give another. When a
 * claim is dated, or the out-of-scope switch is on, a line says the date
 * "in force" is relative to and that these are the producer's copy of the
 * contract (ER sections 4.2 and 4.3).
 */
function renderAggregate(result: ResultRoot, w: Words): DocumentFragment {
  const out = document.createDocumentFragment();
  const stated = result.statedCoverage;
  const requirements = new Set(
    result.claims
      .filter((claim) => !claim.later)
      .map((claim) =>
        JSON.stringify([claim.contractRef, claim.requirementRef]),
      ),
  ).size;
  const line = el("p", "agg-line");
  const marked = (text: string, field: CountMismatch["field"]): void => {
    line.append(text);
    const marker = mismatchMarker(result, field, w);
    if (marker !== undefined) line.append(" ", marker);
  };
  marked(
    w.t("front.agg.evaluated", {
      evaluations: w.p("front.agg.evaluations", stated.evaluatedPopulation, {
        n: fmt(stated.evaluatedPopulation),
      }),
      requirements: w.p("front.agg.requirements", requirements, {
        n: fmt(requirements),
      }),
    }),
    "evaluated_population",
  );
  line.append(
    " · ",
    w.t("front.agg.excluded", {
      excluded: fmt(stated.excludedNotApplicable),
    }),
    " · ",
  );
  marked(
    w.p("front.agg.unknown", stated.unknownCount, {
      n: fmt(stated.unknownCount),
    }),
    "unknown_count",
  );
  const later = stated.notYetInForce;
  if (
    later !== undefined ||
    result.countMismatches.some((m) => m.field === "not_yet_in_force")
  ) {
    line.append(" · ");
    marked(
      w.p("front.agg.later", later ?? 0, { n: fmt(later ?? 0) }),
      "not_yet_in_force",
    );
    line.dataset.notYetInForce = String(later ?? 0);
  }
  line.dataset.evaluated = String(stated.evaluatedPopulation);
  line.dataset.requirements = String(requirements);
  line.dataset.excluded = String(stated.excludedNotApplicable);
  line.dataset.unknown = String(stated.unknownCount);
  out.append(line);

  const buckets = el("div", "agg-buckets");
  const of = w.t("front.agg.of", { n: fmt(stated.evaluatedPopulation) });
  const entries: readonly [
    string,
    readonly string[] | undefined,
    CountMismatch["field"],
  ][] = [
    ["met", result.buckets.met, "buckets.met"],
    ["not_met", result.buckets.notMet, "buckets.not_met"],
    ["not_evaluable", result.buckets.notEvaluable, "buckets.not_evaluable"],
    ["out_of_scope", result.buckets.outOfScope, "buckets.out_of_scope"],
  ];
  for (const [verdict, ids, field] of entries) {
    if (ids === undefined) continue;
    const box = el("div", `agg-bucket ${verdict}`);
    box.dataset.bucket = verdict;
    box.dataset.count = String(ids.length);
    box.dataset.of = String(stated.evaluatedPopulation);
    box.append(el("b", "", fmt(ids.length)));
    // The canvas draws the tile's caption on one line: "Met · of N ...".
    const caption = el("div", "agg-cap");
    caption.append(
      el("span", "", w.t(`front.agg.bucket.${verdict}`)),
      document.createTextNode(" · "),
      el("span", "agg-of", of),
    );
    box.append(caption);
    const marker = mismatchMarker(result, field, w);
    if (marker !== undefined) box.append(marker);
    buckets.append(box);
  }
  out.append(buckets);

  const dated = result.claims.some((claim) => claim.appliesFrom !== undefined);
  const switched = result.buckets.outOfScope !== undefined;
  if (dated || switched) {
    const copied = el("p", "agg-note");
    if (dated) {
      // A dated Result passed validation, so generated_at parses.
      const date = utcDateOf(result.generatedAt) ?? result.generatedAt;
      copied.append(w.t("front.agg.as-of", { date }), " ");
      copied.dataset.asOf = date;
    }
    copied.append(
      w.t(
        dated && switched
          ? "front.agg.copied.both"
          : dated
            ? "front.agg.copied.dates"
            : "front.agg.copied.switch",
      ),
    );
    copied.dataset.copiedFacts = "contract";
    out.append(copied);
  }
  return out;
}

const shortDigest = (digest: string): string =>
  digest.length > 12 ? `${digest.slice(0, 4)}…${digest.slice(-4)}` : digest;

/**
 * The CORE identity line (Terms Pack canvas, "CORE · covers ... "): the
 * facts about this Result the core itself can read, each stated only when
 * the bundle states it. The pack and version are the claims' `contract_ref`;
 * the Result is named by its capsule id and its generation time, never by a
 * "closed" time the Result does not carry; the judge pins are the cited
 * reports'. What the Result and the claims do not carry (coverage window,
 * pack digest, skills, book, agent key, controller, developer, epoch, model,
 * countersign state) is not drawn and not replaced with a placeholder.
 */
function renderCoreIdentity(model: CoreStripModel): HTMLElement {
  const { result, words: w } = model;
  const refs = [
    ...new Set(result.claims.filter((c) => !c.later).map((c) => c.contractRef)),
  ];
  const kicker: string[] = [w.t("front.core.label")];
  if (refs.length === 1) {
    const at = refs[0]!.lastIndexOf("@");
    kicker.push(
      at > 0
        ? w.t("front.core.pack", {
            id: refs[0]!.slice(0, at),
            version: refs[0]!.slice(at + 1),
          })
        : refs[0]!,
    );
  } else if (refs.length > 1)
    kicker.push(w.t("front.core.packs", { n: fmt(refs.length) }));
  const generated =
    utcDateOf(result.generatedAt) === undefined
      ? undefined
      : result.generatedAt;
  if (generated !== undefined)
    kicker.push(w.t("front.core.generated", { time: generated }));
  const facts: string[] = [
    w.t("front.core.result", { digest: shortDigest(result.capsuleId) }),
  ];
  if (model.pins.length === 1)
    facts.push(w.t("front.core.pin", { digest: shortDigest(model.pins[0]!) }));
  else if (model.pins.length > 1)
    facts.push(w.t("front.core.pins", { n: fmt(model.pins.length) }));
  const block = el("div", "core-id");
  block.dataset.section = "core-identity";
  const top = el("p", "agg-note core-kicker", kicker.join(" · "));
  top.dataset.coreKicker = "";
  const rest = el("p", "agg-note core-facts", facts.join(" · "));
  rest.dataset.coreFacts = "";
  block.append(top, rest);
  return block;
}

/** What the strip draws from, read once before the page is written. */
export interface CoreStripModel {
  readonly result: ResultRoot;
  readonly words: Words;
  /** Whether any claim's cited report names a mock judge (decision D5 (b)). */
  readonly mock: boolean;
  /** The distinct judge pins the cited reports name, in `tallyJudges` order. */
  readonly pins: readonly string[];
}

export async function coreStripModel(
  result: ResultRoot,
  words: Words,
): Promise<CoreStripModel> {
  const tally = await tallyJudges(result.records, result.claims);
  return {
    result,
    words,
    mock: judgedByMock(tally),
    pins: tally.pins.map((pin) => pin.digest),
  };
}

/**
 * The strip, drawn afresh each time the page frame is: the mock-judge mark
 * first when a judge was a mock, so a reader meets it before any figure
 * (D5 (b)), then the aggregate.
 */
export function renderCoreStrip(model: CoreStripModel): HTMLElement {
  const strip = el("section", "cv-strip");
  strip.setAttribute(CORE_STRIP_ATTRIBUTE, "");
  strip.dataset.section = "aggregate";
  const style = document.createElement("style");
  style.textContent = CORE_STRIP_CSS;
  strip.append(style);
  if (model.mock) {
    const mark = el("p", "mockmark", model.words.t("front.mock"));
    mark.dataset.section = "mock-judge";
    strip.append(mark);
  }
  strip.append(renderCoreIdentity(model));
  strip.append(renderAggregate(model.result, model.words));
  return strip;
}
