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

/**
 * The contract-report module: one view for every report that is an Evidence
 * Result over a contract, with its words from a wording pack.
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
 * (`layout.grouping`) and holds every word the reader sees; the module holds
 * no pack's words. A new report over the same Result shape is a new pack,
 * never a new module.
 *
 * The data a grouping reads still arrives by the two extension kinds
 * agent-action-capsule selects today (`outcome-report/v1` for `lines`,
 * `eu-ai-act-compliance/v1` for `groups`), so the registry keeps those two
 * manifests and both resolve to this one module. Registering one neutral
 * contract-report kind is upstream (SEAMS ruling 2).
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

/**
 * Render a contract report into `root`. `wording` is the host's pack (the
 * page's `wording`, bound by `wording_sha256`); omitted, the grouping's
 * default pack. A pack that does not check, or does not fit this module,
 * throws before anything is drawn.
 */
export async function renderContractReport(
  result: ResultRoot,
  input: ContractReportInput,
  bundle: unknown,
  verified: BundleVerificationResult,
  root: HTMLElement,
  wording?: WordingPackInput,
): Promise<void> {
  const w = await contractReportWords(input.grouping, wording);
  const frame = FRAMES[input.grouping];
  const wrapper = document.createElement(frame.tag);
  wrapper.className = frame.className;
  wrapper.dataset.page = frame.page;
  wrapper.dataset.levels = "2";
  const style = document.createElement("style");
  style.textContent = frame.css;
  wrapper.append(style);
  if (input.grouping === "lines")
    await drawLines(wrapper, result, input.options, bundle, verified, w);
  else
    await drawGroups(wrapper, result, input.presentation, bundle, verified, w);
  root.append(wrapper);
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
