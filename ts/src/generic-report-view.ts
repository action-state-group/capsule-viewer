// SPDX-License-Identifier: BSD-3-Clause
import type {
  BundleVerificationResult,
  ResultClaim,
  ResultRoot,
} from "@action-state-group/agent-action-capsule";
import type { ClaimReason } from "./claim-reasons.js";
import type { Words } from "./contract-report-wording.js";
import { ROW_TIERS, type RowTier, type TierOf } from "./evidence-contract.js";
import { leadWithProvenance, renderCheckYourself } from "./report-front.js";
import { GENERIC_REPORT_CSS } from "./generic-report-styles.js";
import {
  assuranceRow,
  levelToggle,
  proofList,
  reportSummary,
  withheldMark,
  wordPill,
  type Tone,
} from "./report-levels.js";
import { tagSource } from "./report-legend.js";
import { provenanceLines, renderProvenance } from "./report-provenance.js";

/**
 * The `generic` grouping of the contract-report module (contract-report.ts):
 * the view of a Result that opts into `contract-report/v1` and carries
 * neither Outcomes `lines` nor EU `groups` data (contract-report/v1 module
 * spec section 2). It reads the Result alone: a row is one (`contract_ref`,
 * `requirement_ref`) pair with its claims, its group is the part of the
 * `requirement_ref` before the first `.`, and every tally shows its
 * denominator ("2 of 5 claims"), never a percentage. A requirement tier
 * (from the page's contract), a claim not yet in force, and a claim that
 * failed verification keep the places the spec gives them.
 *
 * Every word is the pack's (`generic.*` and the section 3 keys, layered over
 * `wording/contract-report-generic.en.json`); a name no layer has is the raw
 * identifier. Page layout: L0 the title, summary and counts after the core's
 * strip; L1 the rows (a group is a heading, a row is a level-1 toggle);
 * L2 each claim's assurance and "Check this report yourself".
 */

/** The `generic` grouping's page wrapper: its element, class, page name and stylesheet. */
export const GENERIC_FRAME = {
  tag: "div",
  className: "gr",
  page: "contract-report",
  css: GENERIC_REPORT_CSS,
} as const;

const VERDICT_TONE: Readonly<Record<string, Tone>> = {
  met: "ok",
  not_met: "bad",
  not_evaluable: "ne",
  out_of_scope: "na",
  failed: "bad",
  unsupported: "ne",
};

/** What the claim shows as its verdict: failed verification and unsupported claims are not the producer's stated verdict (ER section 4). */
function shownVerdict(claim: ResultClaim): string {
  if (claim.failed) return "failed";
  return claim.support === "supported" ? claim.verdict : "unsupported";
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== "") node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

interface Row {
  readonly contractRef: string;
  readonly requirementRef: string;
  readonly claims: ResultClaim[];
}

/** The rows of `claims`, keyed by (contract_ref, requirement_ref), in order of first claim. */
function rowsOf(claims: readonly ResultClaim[]): Row[] {
  const rows = new Map<string, Row>();
  for (const claim of claims) {
    const key = JSON.stringify([claim.contractRef, claim.requirementRef]);
    const row = rows.get(key);
    if (row === undefined)
      rows.set(key, {
        contractRef: claim.contractRef,
        requirementRef: claim.requirementRef,
        claims: [claim],
      });
    else row.claims.push(claim);
  }
  return [...rows.values()];
}

/** The group a row sits in: the part of its `requirement_ref` before the first `.`, or none. */
function groupOf(requirementRef: string): string | undefined {
  const dot = requirementRef.indexOf(".");
  return dot <= 0 ? undefined : requirementRef.slice(0, dot);
}

function verdictPill(verdict: string, w: Words): HTMLElement {
  const word = w.enumWord("verdict", verdict);
  // `failed` and `unsupported` are this grouping's own verdicts (section 3
  // defines four), so they read through the grouping's key.
  const shown =
    verdict === "failed" || verdict === "unsupported"
      ? w.t(`generic.verdict.${verdict}`)
      : word;
  const pill = wordPill(
    { word: shown, tone: VERDICT_TONE[verdict] ?? "na" },
    verdict,
  );
  pill.dataset.verdict = verdict;
  return pill;
}

/** The row's tally: its claims counted by shown verdict, each with its denominator. */
function tally(row: Row, w: Words, later: boolean): HTMLElement {
  const counts = new Map<string, number>();
  for (const claim of row.claims) {
    const verdict = shownVerdict(claim);
    counts.set(verdict, (counts.get(verdict) ?? 0) + 1);
  }
  const box = el("div", "tally");
  for (const [verdict, n] of counts) {
    const part = el("span", "");
    part.dataset.tally = verdict;
    // A later claim's verdict is readiness only (ER section 4.3): its
    // tally says so, so a later not_met never reads as a violation.
    if (later) part.append(w.t("generic.later.readiness"), " ");
    part.append(verdictPill(verdict, w), " ");
    part.append(
      w.t("generic.tally", {
        n: n.toLocaleString(),
        total: row.claims.length.toLocaleString(),
      }),
    );
    box.append(part);
  }
  return box;
}

function claimProofs(claim: ResultClaim, w: Words): HTMLElement {
  const body = el("div", "pf-b");
  const rows: (
    | readonly [string, string]
    | readonly [string, string, Record<string, string>]
  )[] = [
    [w.t("generic.claim.contract"), claim.contractRef],
    [w.t("generic.claim.requirement"), claim.requirementRef],
    assuranceRow(claim, w),
  ];
  if (claim.type !== "requirement")
    rows.push([
      w.t("generic.claim.type"),
      claim.recognized
        ? claim.type
        : w.t("generic.claim.unrecognized", { type: claim.type }),
    ]);
  if (claim.failed && claim.failure !== undefined)
    rows.push([w.t("generic.claim.failure"), claim.failure]);
  body.append(proofList(rows));
  const mark = withheldMark(claim, w);
  if (mark !== undefined) body.append(mark);
  return body;
}

/** The reasons the Result's producer gives for claims, by claim id (claim-reasons.ts). */
type ReasonsOf = ReadonlyMap<string, ClaimReason>;

/**
 * A claim's reason, one line beside its verdict and grade (module spec
 * section 2, Reasons): the pack's sentence for the code, else a core line
 * naming the raw code; both said to be the producer's. A finding is drawn in
 * the warning tone, never as fine print. On a decided claim the reason
 * explains the grade, so the line names the grade.
 */
function reasonLines(
  claim: ResultClaim,
  w: Words,
  reasons?: ReasonsOf,
): HTMLElement[] {
  const found = reasons?.get(claim.id);
  if (found === undefined) return [];
  const { code } = found;
  const packText = found.keyable
    ? w.reason(claim.requirementRef, code)
    : undefined;
  const coreText =
    packText === undefined && found.core
      ? w.t(`generic.reason.token.${code}`)
      : undefined;
  const text = packText ?? coreText;
  const line = el("p", "rreason");
  line.dataset.reasonCode = code;
  line.dataset.reasonKind = found.kind;
  line.dataset.tone = found.kind === "finding" ? "warn" : "note";
  // A later claim's reason shows under its readiness label (ER section 4.4).
  if (claim.later) line.append(w.t("generic.later.readiness"), " ");
  if (claim.verdict !== "not_evaluable")
    line.append(
      w.t("generic.reason.grade", { grade: w.enumWord("grade", claim.grade) }),
      " ",
    );
  line.append(
    tagSource(
      el(
        "span",
        "",
        text !== undefined
          ? w.t("generic.reason.says", { text })
          : w.t("generic.reason.unworded", { code }),
      ),
      packText !== undefined ? "pack" : "core",
    ),
  );
  return [line];
}

/** What opening a carried receipt came to: drawn, no module for it, not readable, or read but not passing its checks. */
export type ReceiptOpen = "opened" | "no-module" | "unreadable" | "unverified";

/**
 * A deal that had no settlement or delivery recorded when the page was built:
 * it has no receipt yet, which is not a fault of the page and not a holder's
 * choice (capsule-viewer#358, Sherlock2's what). Any other object is read as
 * an entry nothing here understands, and reads as not carried.
 */
export interface ReceiptNotClosed {
  readonly state: "not-closed";
}

/** One deal's entry in the `receipts` option: a receipt bundle's JSON text, `null` (kept off the page by the holder's policy) or {@link ReceiptNotClosed}. */
export type DealReceiptEntry = string | null | ReceiptNotClosed;

/**
 * The deal receipts a report page carries (the page's `receipts` option):
 * each deal's receipt bundle as the JSON text the node served, by deal id, and
 * the runtime's way to draw one into a panel. The page never reads a
 * receipt's content itself; the receipt module the page also carries draws it.
 */
export interface ReceiptsInput {
  readonly texts: Readonly<Record<string, DealReceiptEntry>>;
  readonly open: (text: string, panel: HTMLElement) => Promise<ReceiptOpen>;
  /**
   * Each claim's deal by claim id, as the page's builder decided it
   * (`RenderEvidenceGraphOptions.receiptDeals`); a claim not here has none.
   * Absent, a claim's deal is its id's part before `::` ({@link dealIdOf}).
   */
  readonly deals?: Readonly<Record<string, string>>;
}

/** The deal a claim belongs to: its id before the first `::`, as the inference-deals Result writes it, or none. */
export function dealIdOf(claimId: string): string | undefined {
  const at = claimId.indexOf("::");
  return at > 0 ? claimId.slice(0, at) : undefined;
}

/**
 * A claim's deal on this page: the builder's when it gave them (the report
 * that checked the receipts reads it from the subject of the records the
 * claim cites, evidencebook#116), else its id's part before `::`.
 */
function dealOf(
  claim: ResultClaim,
  receipts: ReceiptsInput,
): string | undefined {
  if (receipts.deals === undefined) return dealIdOf(claim.id);
  return Object.prototype.hasOwnProperty.call(receipts.deals, claim.id)
    ? receipts.deals[claim.id]
    : undefined;
}

/**
 * The deal's receipt line under a claim. Only a page that carries a
 * `receipts` option draws one (a Result whose ids merely contain `::` is not
 * a deal report). A deal whose receipt is not carried says so and opens
 * nothing: it is a fault of how the page was built, never "no record". A deal
 * marked not closed says it has no receipt because it had not closed when the
 * page was built, and is not a fault.
 */
function receiptLine(
  claim: ResultClaim,
  w: Words,
  receipts: ReceiptsInput,
): HTMLElement[] {
  const deal = dealOf(claim, receipts);
  if (deal === undefined) return [];
  const line = el("div", "rcpt");
  line.dataset.receiptDeal = deal;
  const text = Object.prototype.hasOwnProperty.call(receipts.texts, deal)
    ? receipts.texts[deal]
    : undefined;
  if (typeof text !== "string") {
    // `null` is a receipt the holder's disclosure policy kept off the page on
    // purpose; the not-closed marker is a deal with no receipt yet. No entry,
    // or one this page does not know, is a page built without it, a fault.
    const kind =
      text === null
        ? "withheld"
        : text !== undefined && text.state === "not-closed"
          ? "not-closed"
          : "not-carried";
    const note = el(
      "p",
      "rcpt-note",
      w.t(
        kind === "withheld"
          ? "generic.receipt.withheld"
          : kind === "not-closed"
            ? "generic.receipt.not_closed"
            : "generic.receipt.not_carried",
      ),
    );
    note.dataset.receipt = kind;
    line.append(note);
    return [line];
  }
  const button = el(
    "button",
    "",
    w.t("generic.receipt.open"),
  ) as HTMLButtonElement;
  button.setAttribute("type", "button");
  button.setAttribute("aria-expanded", "false");
  button.dataset.receipt = "open";
  const panel = el("div", "rcpt-panel");
  panel.hidden = true;
  let state: "closed" | "shown" | "hidden" = "closed";
  button.addEventListener("click", () => {
    if (state === "shown") {
      panel.hidden = true;
      state = "hidden";
      button.setAttribute("aria-expanded", "false");
      button.textContent = w.t("generic.receipt.open");
      return;
    }
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    button.textContent = w.t("generic.receipt.close");
    if (state === "hidden") {
      state = "shown";
      return;
    }
    state = "shown";
    button.disabled = true;
    const showOutcome = (outcome: ReceiptOpen): void => {
      button.disabled = false;
      panel.dataset.receiptState = outcome;
      if (outcome === "opened") return;
      panel.replaceChildren(
        el(
          "p",
          "rcpt-note",
          w.t(
            outcome === "no-module"
              ? "generic.receipt.no_module"
              : outcome === "unverified"
                ? "generic.receipt.unverified"
                : "generic.receipt.unreadable",
          ),
        ),
      );
    };
    // A receipt that cannot be drawn leaves the report as it was and says
    // why under the claim; a rejection never reaches the page.
    receipts
      .open(text, panel)
      .then(showOutcome, () => showOutcome("unreadable"));
  });
  line.append(button, panel);
  return [line];
}

function claimItem(
  claim: ResultClaim,
  w: Words,
  reasons?: ReasonsOf,
  receipts?: ReceiptsInput,
): HTMLElement {
  const item = el("li", "");
  item.dataset.claimRef = claim.id;
  const head = el("span", "");
  const id = tagSource(el("code", "cid", claim.id), "producer");
  head.append(id, " ", verdictPill(shownVerdict(claim), w));
  item.append(
    levelToggle(2, head, () => claimProofs(claim, w), { className: "claim" }),
    ...reasonLines(claim, w, reasons),
    ...(receipts === undefined ? [] : receiptLine(claim, w, receipts)),
  );
  return item;
}

function rowItem(
  row: Row,
  w: Words,
  later: boolean,
  tierOf?: TierOf,
  reasons?: ReasonsOf,
  receipts?: ReceiptsInput,
): HTMLElement {
  const label = w.row(row.requirementRef, "label");
  const name = el("span", "rname");
  if (label !== undefined)
    name.append(tagSource(el("span", "", label), "pack"));
  else name.append(tagSource(el("code", "", row.requirementRef), "producer"));
  const summary = el("span", "");
  summary.append(name);
  const tier = tierOf?.(row.contractRef, row.requirementRef);
  if (tier !== undefined) {
    const chip = el("span", "rtier", w.t(`requirement_tier.${tier}`));
    chip.dataset.requirementTier = tier;
    summary.append(" ", chip);
  }
  summary.append(tally(row, w, later));
  const given = row.claims.filter((claim) => reasons?.has(claim.id));
  if (given.length > 0) {
    const flag = el("span", "rflag", w.p("generic.reason.flag", given.length));
    flag.dataset.tone = given.some(
      (claim) => reasons!.get(claim.id)!.kind === "finding",
    )
      ? "warn"
      : "note";
    summary.append(" ", flag);
  }
  const toggle = levelToggle(
    1,
    summary,
    () => {
      const body = el("div", "row-b");
      const detail = w.row(row.requirementRef, "detail");
      if (detail !== undefined) body.append(el("p", "", detail));
      const undecided = row.claims.some(
        (claim) => !claim.failed && claim.verdict === "not_evaluable",
      );
      const note = w.row(row.requirementRef, "not_evaluable");
      if (undecided && note !== undefined) body.append(el("p", "rnote", note));
      if (later)
        for (const date of new Set(
          row.claims.flatMap((claim) =>
            claim.appliesFrom === undefined ? [] : [claim.appliesFrom],
          ),
        ))
          body.append(el("p", "rnote", w.t("generic.later.note", { date })));
      const list = el("ul", "claims");
      for (const claim of row.claims)
        list.append(claimItem(claim, w, reasons, receipts));
      body.append(el("h3", "", w.t("generic.claims.h")), list);
      return body;
    },
    { className: "row" },
  );
  toggle.dataset.row = row.requirementRef;
  toggle.dataset.contract = row.contractRef;
  return toggle;
}

/** A contract's rows as groups: a heading per group, the rows under it, a group with no title last. */
function groupedRows(
  rows: readonly Row[],
  w: Words,
  later: boolean,
  tierOf?: TierOf,
  reasons?: ReasonsOf,
  receipts?: ReceiptsInput,
): HTMLElement {
  const box = el("div", "groups");
  const order: (string | undefined)[] = [];
  const byGroup = new Map<string | undefined, Row[]>();
  for (const row of rows) {
    const group = groupOf(row.requirementRef);
    if (!byGroup.has(group)) {
      byGroup.set(group, []);
      order.push(group);
    }
    byGroup.get(group)!.push(row);
  }
  // A requirement_ref with no `.` is in a final group with no title.
  order.sort((a, b) => Number(a === undefined) - Number(b === undefined));
  for (const group of order) {
    const part = el("div", "group");
    if (group !== undefined) {
      part.dataset.group = group;
      const title = w.group(group);
      const heading = el("h3", "");
      heading.append(
        title !== undefined
          ? tagSource(el("span", "", title), "pack")
          : tagSource(el("span", "", group), "producer"),
      );
      part.append(heading);
    }
    for (const row of byGroup.get(group)!)
      part.append(rowItem(row, w, later, tierOf, reasons, receipts));
    box.append(part);
  }
  return box;
}

function contractHeading(contract: string, w: Words): HTMLElement {
  const heading = el("h2", "", w.t("generic.contract.h"));
  heading.append(" ", tagSource(el("code", "", contract), "producer"));
  return heading;
}

/** Rows by contract first, in order of first appearance (module spec section 2: several contracts). */
function byContract(
  rows: readonly Row[],
  w: Words,
  later: boolean,
  tierOf?: TierOf,
  reasons?: ReasonsOf,
  receipts?: ReceiptsInput,
): HTMLElement {
  const contracts = [...new Set(rows.map((row) => row.contractRef))];
  if (contracts.length <= 1)
    return groupedRows(rows, w, later, tierOf, reasons, receipts);
  const box = el("div", "contracts");
  for (const contract of contracts) {
    const part = el("div", "contract");
    part.dataset.contract = contract;
    part.append(
      contractHeading(contract, w),
      groupedRows(
        rows.filter((row) => row.contractRef === contract),
        w,
        later,
        tierOf,
        reasons,
        receipts,
      ),
    );
    box.append(part);
  }
  return box;
}

/**
 * Draw the `generic` grouping into the three region wrappers
 * (contract-report.ts made them and put the stylesheet in L0).
 */
export async function drawGeneric(
  levels: {
    readonly L0: HTMLElement;
    readonly L1: HTMLElement;
    readonly L2: HTMLElement;
  },
  result: ResultRoot,
  bundle: unknown,
  verified: BundleVerificationResult,
  w: Words,
  tierOf?: TierOf,
  reasons?: ReasonsOf,
  receipts?: ReceiptsInput,
): Promise<void> {
  const tierFor = (claim: ResultClaim): RowTier =>
    tierOf === undefined
      ? "unstated"
      : tierOf(claim.contractRef, claim.requirementRef);
  const inForce = result.claims.filter((claim) => !claim.later);
  const later = result.claims.filter((claim) => claim.later);
  // The derived counts leave informational rows out (module spec section 2);
  // contract-report.ts says so above, whenever the Result has one.
  const counted = inForce.filter(
    (claim) => !(tierOf !== undefined && tierFor(claim) === "informational"),
  );

  // L0, after the core's strip: the title, the pack's summary and the counts.
  const sheet = el("div", "l0-card front-card");
  sheet.append(el("h1", "", w.t("generic.title")));
  const summary = reportSummary(w);
  if (summary !== undefined) sheet.append(summary);
  const counts = el(
    "p",
    "counts",
    `${w.p("generic.counts.claims", counted.length)} · ${w.p(
      "generic.counts.rows",
      rowsOf(counted).length,
    )}`,
  );
  counts.dataset.counts = "";
  sheet.append(counts);
  levels.L0.append(sheet);

  // L1, why: the rows, led by who judged, who witnessed, what verified.
  const section = el("section", "front-card");
  section.dataset.section = "rows";
  const rows = rowsOf(inForce);
  if (tierOf === undefined)
    section.append(byContract(rows, w, false, undefined, reasons, receipts));
  else
    for (const tier of ROW_TIERS) {
      const inTier = rows.filter(
        (row) => tierOf(row.contractRef, row.requirementRef) === tier,
      );
      if (inTier.length === 0) continue;
      const part = el("div", "tier-section");
      part.dataset.tierSection = tier;
      part.append(
        el(
          "h2",
          "",
          w.t(`generic.rtier.${tier}.title`, {
            n: inTier.length.toLocaleString(),
          }),
        ),
        el("p", "rnote", w.t(`generic.rtier.${tier}.note`)),
        byContract(inTier, w, false, tierOf, reasons, receipts),
      );
      section.append(part);
    }
  // Claims not yet in force: their own section after the in-force rows,
  // never merged with them, and counted in no total above (ER section 4.3).
  if (later.length > 0) {
    const part = el("div", "later-section");
    part.dataset.section = "not-yet-in-force";
    const laterRows = rowsOf(later);
    part.append(
      el(
        "h2",
        "",
        w.t("generic.later.title", { n: later.length.toLocaleString() }),
      ),
      byContract(laterRows, w, true, tierOf, reasons, receipts),
    );
    section.append(part);
  }
  section.append(
    tagSource(el("p", "rnote", w.t("generic.producer.note")), "core"),
  );
  levels.L1.append(section);
  leadWithProvenance(
    levels.L1,
    section,
    renderProvenance(
      await provenanceLines(result.records, result.claims, bundle, verified, w),
    ),
  );

  // L2, module detail after the core's verification section.
  levels.L2.append(renderCheckYourself(bundle, w));
}
