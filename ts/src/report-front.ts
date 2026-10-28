// SPDX-License-Identifier: Apache-2.0
/**
 * The pieces of a contract report that every grouping shares, placed by the
 * contract-report layout note (docs/design/contract-report-layout.md):
 *
 * - L0 opens with the core's strip (core-strip.ts): the mock-judge mark and
 *   the sealed aggregate are the core's, never a grouping's.
 * - Rows that open in place (expandableRow).
 * - L2, after the core's verification section: "Check this report
 *   yourself", the bundle's anchors and the steps to re-check them.
 * - The host's depth applied to the module's own toggles (presentation
 *   contract section 9.1). The core's section is never touched here.
 */
import type { Words } from "./contract-report-wording.js";
import { deferBody, openToggle } from "./report-levels.js";
import { witnessEntries } from "./report-provenance.js";

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

const fmt = (n: number): string => n.toLocaleString("en-US");

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
