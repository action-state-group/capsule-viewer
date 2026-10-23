// SPDX-License-Identifier: BSD-3-Clause
import type {
  BundleVerificationResult,
  OutcomeReportOptions,
  ResultRoot,
  WordingPackInput,
} from "@action-state-group/agent-action-capsule";
import type { CompliancePresentation } from "./compliance-presentation.js";
import { drawGroups, GROUPS_FRAME } from "./compliance-view.js";
import {
  contractReportWords,
  type ContractReportGrouping,
} from "./contract-report-wording.js";
import { drawLines, LINES_FRAME } from "./outcome-report-view.js";
import { refusedWordingNotice } from "./report-levels.js";
import { applyDepth, type ReportLevels } from "./report-front.js";

/**
 * The contract-report module: one view for every report that is an Evidence
 * Result over a contract, with its words from a wording pack.
 *
 * It resolves on `contract-report/v1` (agent-action-capsule
 * spec/contract-report-v1.md, registered in agent-action-capsule#352): its
 * manifest (CONTRACT_REPORT_MANIFEST, evidence-graph-view.ts) has section
 * 4's match and is registered in place of
 * `aac.builtin.result-contract-report/v0`, never beside it. The two earlier
 * display kinds keep their own built-in manifests until their removal
 * (section 5); a Result root that opts into `contract-report/v1` reaches
 * this module whether or not it also carries one of them.
 *
 * The module has one page frame (a wrapper with its own scoped stylesheet,
 * `data-levels="2"`), the front block (who judged, who witnessed, what
 * verified; report-provenance.ts), the two levels of toggles and nothing
 * deeper (report-levels.ts), and two groupings of a Result's rows:
 *
 *   lines   result lines, results rule by rule, day by day, human spot
 *           checks (outcome-report-view.ts); the Outcomes report
 *   groups  requirement groups and the tests under each
 *           (compliance-view.ts); the EU AI Act Results
 *
 * A report is a grouping plus a wording pack. The pack names its grouping
 * (`layout.grouping`) and holds the module's own words; the module holds no
 * pack's words of its own. Not every word on the page is the pack's: the
 * bundle's own producer-supplied text (obligation titles, test names,
 * sealed rule wording) and two lines agent-action-capsule's outcome model
 * writes (the outcome statement, the resolution rule) are not pack entries.
 * A new report over the same Result shape is a new pack, never a new
 * module.
 *
 * The block itself is empty (section 1): the data a grouping reads still
 * comes from the sealed records the bundle carries beside it, the earlier
 * kinds' blocks (`outcome-report/v1` for `lines`,
 * `eu-ai-act-compliance/v1` for `groups`), read by their own readers,
 * unchanged (section 5). A Result that opts in and carries neither draws
 * the generic Result page, as the built-in this module replaces does
 * (capsule-viewer#56 tracks a view of its own for it).
 *
 * Words (section 3). The module reads the keys `contract-report/v1`
 * defines, layered over its default pack entry by entry, each layer bound
 * by its own `wording_sha256` and named in the proofs:
 *
 *   report.title, report.summary      the card's title, its one-line summary
 *   group.<segment>.title             a group's heading
 *   row.<requirement_ref>.label, .detail, .not_evaluable
 *   verdict.<value>, tier.<value>     the verdict and tier words
 *   grade.<value>, sufficiency.<value>, status.<value>
 *                                     each claim's assurance, in its proofs
 *
 * `row.*` and `group.*` apply only when every claim cites one
 * `contract_ref`; otherwise rows and groups keep what they show without a
 * pack. A word no layer has, or whose assembled key is not a valid
 * WordingKey, shows its raw token; a missing `report.summary` shows none.
 * A host layer that does not check is refused and contributes no words: the
 * card is drawn with the default layer and says so. The module's own keys
 * stay off section 3's prefixes (`card.`, `lines.`, `groups.` and the
 * shared `prov.`, `chat.`, `case.`, `judge.`), and its own verdict words
 * stay under its grouping prefix (`lines.verdict.*`, `groups.verdict.*`):
 * its rows also draw `failed`, `unsupported`, `not_applicable` and
 * `not_yet_in_force`, which section 3's verdict enum does not define. A
 * section 3 `verdict.*` or `tier.*` word sets the grouping's word for the
 * same value, and is checked exactly as that word would be.
 */

/** What a grouping draws from: the verified Result and the extension that opted it in. */
export type ContractReportInput =
  | { readonly grouping: "lines"; readonly options: OutcomeReportOptions }
  | {
      readonly grouping: "groups";
      readonly presentation: CompliancePresentation;
    };

const FRAMES: Readonly<
  Record<ContractReportGrouping, typeof LINES_FRAME | typeof GROUPS_FRAME>
> = { lines: LINES_FRAME, groups: GROUPS_FRAME };

/** Every claim cites the same `contract_ref` (contract-report/v1 section 3: only then do `row.*` and `group.*` apply). */
export function citesOneContract(result: ResultRoot): boolean {
  return new Set(result.claims.map((claim) => claim.contractRef)).size <= 1;
}

/**
 * Render a contract report into `root`. `wording` is the host's pack (the
 * page's `wording`, bound by `wording_sha256`), layered over the grouping's
 * default pack; omitted, the default pack alone. A pack that does not check,
 * or does not fit this module, is refused: it contributes no words, and the
 * card is drawn with the default pack and says so (contract-report/v1
 * section 3). The presentation builder refuses to write such a page.
 */
export async function renderContractReport(
  result: ResultRoot,
  input: ContractReportInput,
  bundle: unknown,
  verified: BundleVerificationResult,
  host: ReportLevels | HTMLElement,
  wording?: WordingPackInput,
): Promise<void> {
  const w = await contractReportWords(input.grouping, wording, {
    singleContract: citesOneContract(result),
  });
  const frame = FRAMES[input.grouping];
  // One frame per host region, so the frame's scoped stylesheet applies in
  // each; the stylesheet itself is written once, in L0. A bare element (an
  // old caller) stands for all three regions at depth L0.
  const regions: ReportLevels =
    host instanceof HTMLElement
      ? { L0: host, L1: host, L2: host, depth: "L0" }
      : host;
  const wrap = (level: "L0" | "L1" | "L2"): HTMLElement => {
    const wrapper = document.createElement(frame.tag);
    wrapper.className = frame.className;
    wrapper.dataset.page = frame.page;
    wrapper.dataset.level = level;
    wrapper.dataset.levels = "2";
    return wrapper;
  };
  const levels = { L0: wrap("L0"), L1: wrap("L1"), L2: wrap("L2") };
  const style = document.createElement("style");
  style.textContent = frame.css;
  levels.L0.append(style);
  const refused = refusedWordingNotice(w);
  if (refused !== undefined) levels.L0.append(refused);
  if (input.grouping === "lines")
    await drawLines(levels, result, input.options, bundle, verified, w);
  else
    await drawGroups(levels, result, input.presentation, bundle, verified, w);
  regions.L0.append(levels.L0);
  regions.L1.append(levels.L1);
  regions.L2.append(levels.L2);
  applyDepth({ ...levels, depth: regions.depth });
}

/** The Outcomes report: the contract-report module, `lines`, default pack. Kept for callers of the card's old entry point. */
export function renderOutcomeReportPage(
  result: ResultRoot,
  options: OutcomeReportOptions,
  bundle: unknown,
  verified: BundleVerificationResult,
  root: HTMLElement,
): Promise<void> {
  return renderContractReport(
    result,
    { grouping: "lines", options },
    bundle,
    verified,
    root,
  );
}

/** The EU AI Act Results: the contract-report module, `groups`, default pack. Kept for callers of the card's old entry point. */
export function renderCompliancePage(
  result: ResultRoot,
  presentation: CompliancePresentation,
  bundle: unknown,
  verified: BundleVerificationResult,
  root: HTMLElement,
): Promise<void> {
  return renderContractReport(
    result,
    { grouping: "groups", presentation },
    bundle,
    verified,
    root,
  );
}
