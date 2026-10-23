// SPDX-License-Identifier: Apache-2.0
/**
 * The pieces of a contract report that every grouping shares, placed by the
 * contract-report layout note (docs/design/contract-report-layout.md):
 *
 * - L0: the mock-judge line (decision D5 (b)) and the sealed aggregate,
 *   coverage first, then the buckets (contract-report/v1 section 2,
 *   evidence-result-v0 section 3).
 * - L2, after the core's verification section: "Check this report
 *   yourself", the bundle's anchors and the steps to re-check them.
 * - The host's depth applied to the module's own toggles (presentation
 *   contract section 9.1). The core's section is never touched here.
 */
import type {
  CountMismatch,
  ResultRoot,
} from "@action-state-group/agent-action-capsule";
import type { Words } from "./contract-report-wording.js";
import { openToggle } from "./report-levels.js";
import {
  judgedByMock,
  witnessEntries,
  type JudgeTally,
} from "./report-provenance.js";

export { judgedByMock };

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

// A recomputed headline number never wears the producer's value. When the
// two disagree the recomputed value is drawn and a `count mismatch` marker
// sits beside it; the stated value is kept on the marker's data attribute,
// never in the text a reader takes as the number.
export function countMismatchMarker(
  result: ResultRoot,
  field: CountMismatch["field"],
): HTMLElement | undefined {
  const mismatch = result.countMismatches.find(
    (entry) => entry.field === field,
  );
  if (mismatch === undefined) return undefined;
  const marker = el("span", "count mismatch");
  marker.dataset.countMismatch = field;
  marker.dataset.stated = String(mismatch.stated);
  marker.dataset.recomputed = String(mismatch.recomputed);
  return marker;
}

/** Decision D5 (b): one L0 line, drawn only when the judge was a mock. */
export function renderMockJudgeLine(
  tally: JudgeTally,
  w: Words,
): HTMLElement | undefined {
  if (!judgedByMock(tally)) return undefined;
  const line = el("p", "mockline", w.t("front.mock"));
  line.dataset.section = "mock-judge";
  return line;
}

/**
 * The Result's aggregate, coverage first and then the buckets, each count
 * with its unit (evaluations). `unknown_count` is "evaluations with an
 * unknown result", never "unresolved". The numbers are the claims'
 * (`coverage`, `bucketCounts`); where the producer stated another number
 * the count-mismatch marker sits beside it, as on the generic Result page.
 */
export function renderAggregate(result: ResultRoot, w: Words): HTMLElement {
  const section = el("section", "agg");
  section.dataset.section = "aggregate";
  const requirements = new Set(
    result.claims
      .filter((claim) => !claim.later)
      .map((claim) =>
        JSON.stringify([claim.contractRef, claim.requirementRef]),
      ),
  ).size;
  const line = el("p", "agg-line");
  line.append(
    w.t("front.agg.evaluated", {
      evaluated: fmt(result.coverage.evaluatedPopulation),
      requirements: fmt(requirements),
    }),
  );
  const evaluated = countMismatchMarker(result, "evaluated_population");
  if (evaluated !== undefined) line.append(" ", evaluated);
  line.append(
    " · ",
    w.t("front.agg.excluded", {
      excluded: fmt(result.coverage.excludedNotApplicable),
    }),
    " · ",
    w.t("front.agg.unknown", { unknown: fmt(result.coverage.unknownCount) }),
  );
  const unknown = countMismatchMarker(result, "unknown_count");
  if (unknown !== undefined) line.append(" ", unknown);
  const later = result.claims.filter((claim) => claim.later).length;
  if (later > 0) {
    line.append(" · ", w.t("front.agg.later", { later: fmt(later) }));
    line.dataset.notYetInForce = String(later);
  }
  line.dataset.evaluated = String(result.coverage.evaluatedPopulation);
  line.dataset.requirements = String(requirements);
  line.dataset.excluded = String(result.coverage.excludedNotApplicable);
  line.dataset.excludedBasis = "stated";
  line.dataset.unknown = String(result.coverage.unknownCount);
  section.append(line);

  const buckets = el("div", "agg-buckets");
  const entries: readonly [
    string,
    number | undefined,
    CountMismatch["field"],
  ][] = [
    ["met", result.bucketCounts.met, "buckets.met"],
    ["not_met", result.bucketCounts.notMet, "buckets.not_met"],
    [
      "not_evaluable",
      result.bucketCounts.notEvaluable,
      "buckets.not_evaluable",
    ],
    ["out_of_scope", result.bucketCounts.outOfScope, "buckets.out_of_scope"],
  ];
  for (const [verdict, count, field] of entries) {
    if (count === undefined) continue;
    const box = el("div", `agg-bucket ${verdict}`);
    box.dataset.bucket = verdict;
    box.dataset.count = String(count);
    const n = el("b", "", fmt(count));
    box.append(n);
    const marker = countMismatchMarker(result, field);
    if (marker !== undefined) box.append(" ", marker);
    box.append(el("span", "", w.t(`front.agg.bucket.${verdict}`)));
    buckets.append(box);
  }
  section.append(buckets);
  return section;
}

function bundleObject(bundle: unknown): Record<string, unknown> {
  return typeof bundle === "object" && bundle !== null && !Array.isArray(bundle)
    ? (bundle as Record<string, unknown>)
    : {};
}

const short = (value: string): string =>
  value.length > 32 ? `${value.slice(0, 32)}…` : value;

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
    cell(w.t("front.check.key"), short(producerKey), "producer-key");
  const checkpoint = bundleObject(b.checkpoint);
  if (typeof checkpoint.log_id === "string")
    cell(w.t("front.check.log"), checkpoint.log_id, "log");
  if (
    typeof checkpoint.root === "string" &&
    typeof checkpoint.mmr_size === "number"
  )
    cell(
      w.t("front.check.root"),
      `${short(checkpoint.root)} · ${fmt(checkpoint.mmr_size)}`,
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
 * A table row that opens and closes its full-width detail row: the row is
 * the control (a click, or Enter or Space on it), and the detail row shows
 * only while its toggle is open, whoever opened it (the host's depth, print).
 */
export function expandableRow(
  row: HTMLElement,
  detail: HTMLElement,
  toggle: HTMLDetailsElement,
  label: string,
): void {
  row.classList.add("x");
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-expanded", "false");
  row.setAttribute("aria-label", label);
  const sync = (): void => {
    detail.hidden = !toggle.open;
    row.setAttribute("aria-expanded", String(toggle.open));
  };
  toggle.addEventListener("toggle", sync);
  const flip = (): void => {
    if (toggle.open) {
      toggle.open = false;
      sync();
    } else openToggle(toggle);
  };
  row.addEventListener("click", flip);
  row.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    flip();
  });
}

/** A front card: the frame's centred white card, for blocks outside the sheet. */
export function frontCard(...children: HTMLElement[]): HTMLElement {
  const card = el("div", "front-card");
  card.append(...children);
  return card;
}

/**
 * Open the module's own toggles to the host's depth: at L0 none, at L1 the
 * level-1 toggles, at L2 every toggle (presentation contract section 9.1).
 * Only the module's regions are walked; the core's section is the core's.
 */
export function applyDepth(levels: ReportLevels): void {
  if (levels.depth === "L0") return;
  for (const region of [levels.L0, levels.L1, levels.L2])
    for (const toggle of region.querySelectorAll<HTMLDetailsElement>(
      "details.lv",
    ))
      if (levels.depth === "L2" || toggle.dataset.level === "1")
        openToggle(toggle);
}
