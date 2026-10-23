// SPDX-License-Identifier: Apache-2.0
/**
 * The pieces of a contract report that every grouping shares, placed by the
 * contract-report layout note (docs/design/contract-report-layout.md):
 *
 * - L0: the mock-judge mark in the header (decision D5 (b)) and the sealed aggregate,
 *   coverage first, then the buckets (contract-report/v1 section 2,
 *   evidence-result-v0 section 3).
 * - Rows that open in place (expandableRow).
 * - L2, after the core's verification section: "Check this report
 *   yourself", the bundle's anchors and the steps to re-check them.
 * - The host's depth applied to the module's own toggles (presentation
 *   contract section 9.1). The core's section is never touched here.
 */
import {
  utcDateOf,
  type CountMismatch,
  type ResultRoot,
} from "@action-state-group/agent-action-capsule";
import type { Words } from "./contract-report-wording.js";
import { deferBody, openToggle } from "./report-levels.js";
import {
  judgedByMock,
  witnessEntries,
  type JudgeTally,
} from "./report-provenance.js";

/** The three host regions a contract report writes into, and the host's depth. */
export interface ReportLevels {
  readonly L0: HTMLElement;
  readonly L1: HTMLElement;
  readonly L2: HTMLElement;
  readonly depth: "L0" | "L1" | "L2";
}

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
 * Decision D5 (b): one L0 mark, drawn only when the judge was a mock. It
 * sits in the report's header right under the title (`placeMockMark`), so
 * a reader meets it before any figure; the folded provenance line then
 * leaves the judge out of its brief (report-provenance.ts).
 */
export function renderMockJudgeLine(
  tally: JudgeTally,
  w: Words,
): HTMLElement | undefined {
  if (!judgedByMock(tally)) return undefined;
  const line = el("p", "mockmark", w.t("front.mock"));
  line.dataset.section = "mock-judge";
  return line;
}

/** Put the mock-judge mark right under the header's title; a header without one takes it first. */
export function placeMockMark(
  header: HTMLElement,
  mark: HTMLElement | undefined,
): void {
  if (mark === undefined) return;
  const title = header.querySelector("h1");
  if (title === null) header.prepend(mark);
  else title.after(mark);
}

/**
 * The folded provenance line opens L1: it becomes the first row of the
 * section card that holds the report's rows, ruled off from them. Without
 * that section it keeps a card of its own.
 */
export function leadWithProvenance(
  host: HTMLElement,
  section: Element | null,
  provenance: HTMLElement,
): void {
  const row = el("div", "prov-row");
  row.append(provenance);
  if (section === null) host.prepend(frontCard(row));
  else section.prepend(row);
}

/**
 * The Result's sealed aggregate, coverage first and then the buckets, each
 * count with its unit (evaluations); `unknown_count` is "evaluations with
 * an unknown result", never "unresolved". The numbers are the producer's
 * (`statedCoverage`, the `buckets` lists), with a marker wherever the
 * claims give another. When a claim is dated, or the out-of-scope switch
 * is on, a line says the date "in force" is relative to and that these are
 * the producer's copy of the contract (ER sections 4.2 and 4.3).
 */
export function renderAggregate(result: ResultRoot, w: Words): HTMLElement {
  const section = el("section", "agg");
  section.dataset.section = "aggregate";
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
  section.append(line);

  const buckets = el("div", "agg-buckets");
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
    box.append(el("b", "", fmt(ids.length)));
    box.append(el("span", "", w.t(`front.agg.bucket.${verdict}`)));
    const marker = mismatchMarker(result, field, w);
    if (marker !== undefined) box.append(marker);
    buckets.append(box);
  }
  section.append(buckets);

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
    section.append(copied);
  }
  return section;
}

function bundleObject(bundle: unknown): Record<string, unknown> {
  return typeof bundle === "object" && bundle !== null && !Array.isArray(bundle)
    ? (bundle as Record<string, unknown>)
    : {};
}

/**
 * "Check this report yourself": the bundle's own anchors (producer key,
 * log, checkpoint root and size, record count) and the steps to re-check
 * them. Module detail: it goes in L2 after the core's verification section,
 * never in its place. The comparison step is drawn as a comparison only
 * when the bundle carries a witness receipt; otherwise it says only that
 * the bundle carries none, never that no outside checkpoint exists.
 */
export function renderCheckYourself(bundle: unknown, w: Words): HTMLElement {
  const b = bundleObject(bundle);
  const section = el("section", "check front-card");
  section.dataset.section = "check-yourself";
  section.append(el("h2", "", w.t("front.check.h")));
  const anchors = el("div", "anchors");
  const cell = (label: string, value: string, key: string): void => {
    const box = el("div", "anchor");
    box.dataset.anchor = key;
    box.append(el("span", "k", label), el("code", "", value));
    anchors.append(box);
  };
  const extensions = bundleObject(b.extensions);
  const producerKey = bundleObject(extensions["producer-key/v1"]).public_key;
  if (typeof producerKey === "string")
    cell(w.t("front.check.key"), producerKey, "producer-key");
  const checkpoint = bundleObject(b.checkpoint);
  if (typeof checkpoint.log_id === "string")
    cell(w.t("front.check.log"), checkpoint.log_id, "log");
  if (
    typeof checkpoint.root === "string" &&
    typeof checkpoint.mmr_size === "number"
  )
    cell(
      w.t("front.check.root"),
      `${checkpoint.root} · ${fmt(checkpoint.mmr_size)}`,
      "checkpoint",
    );
  if (Array.isArray(b.records))
    cell(w.t("front.check.records"), fmt(b.records.length), "records");
  section.append(anchors);

  const receipts = witnessEntries(b.checkpoint).filter(
    (entry) => !entry.stub && !entry.malformed,
  );
  const steps = el("ol", "steps");
  steps.append(
    el("li", "", w.t("front.check.s1")),
    el("li", "", w.t("front.check.s2")),
  );
  const compare = el(
    "li",
    "",
    w.t(receipts.length > 0 ? "front.check.s3.receipt" : "front.check.s3.none"),
  );
  compare.dataset.receipt = receipts.length > 0 ? "present" : "absent";
  steps.append(compare, el("li", "", w.t("front.check.s4")));
  section.append(steps);
  return section;
}

/**
 * A table row that opens its full-width detail row, with no script needed:
 * the row's name (the rule, test or obligation it opens) becomes the
 * summary of a level-1 disclosure in its first cell, and the stylesheet
 * shows the detail row while that disclosure is open. The row stays a
 * table row and the disclosure takes its name from the row's own words.
 * The detail's body is built when it first opens (or at once with
 * `eager`); a click anywhere on the row opens it too. `key` names the
 * detail row's id from what the row is, so every packaging of one bundle
 * draws the same ids.
 */
export function expandableRow(
  row: HTMLElement,
  name: HTMLElement,
  detail: HTMLElement,
  build: () => Node,
  key: string,
  eager = false,
): HTMLDetailsElement {
  row.classList.add("x");
  detail.classList.add("x-detail");
  detail.id = `cr-x-${key.replace(/[^A-Za-z0-9_.-]/gu, "_")}`;
  const cell = detail.firstElementChild as HTMLElement;
  const toggle = document.createElement("details");
  toggle.className = "lv lv1 rx";
  toggle.dataset.level = "1";
  const summary = document.createElement("summary");
  summary.setAttribute("aria-controls", detail.id);
  name.replaceWith(toggle);
  summary.append(name);
  toggle.append(summary);
  deferBody(toggle, build, eager, cell);
  // The summary's own click toggles natively; anywhere else on the row
  // does the same.
  row.addEventListener("click", (event) => {
    if ((event.target as Element).closest("summary") !== null) return;
    if (toggle.open) toggle.open = false;
    else openToggle(toggle);
  });
  return toggle;
}

/** A front card: the frame's centred white card, for blocks outside the sheet. */
export function frontCard(...children: HTMLElement[]): HTMLElement {
  const card = el("div", "front-card");
  card.append(...children);
  return card;
}

/**
 * Open the module's own toggles to the host's depth (presentation contract
 * section 9.1): at L0 none; at L1 the toggles in the L1 region; at L2 every
 * toggle in every region, including the ones a toggle builds when it opens
 * (see `openBuiltToDepth`). The core's section is the core's.
 */
export function applyDepth(levels: ReportLevels): void {
  if (levels.depth === "L0") return;
  const regions =
    levels.depth === "L1" ? [levels.L1] : [levels.L0, levels.L1, levels.L2];
  for (const region of regions) {
    if (levels.depth === "L2") region.dataset.openAll = "";
    for (const toggle of region.querySelectorAll<HTMLDetailsElement>(
      "details.lv",
    ))
      openToggle(toggle);
  }
}
