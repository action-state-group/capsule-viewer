// SPDX-License-Identifier: BSD-3-Clause
import {
  AGENT_INPUT_ORIGINALS_EXTENSION,
  BOOK_PAYLOADS_EXTENSION,
  buildVerifiedBundleContext,
  carriedCapsuleCommitment,
  committedDigest,
  disclosureOf,
  logCoordinates,
  PUBLISHED_CAPSULE_RECORD_TYPE,
  recordTimes,
  resolveCarriedInput,
  isVerifiedBundleContext,
  REQUIREMENT_CLAIM,
  readOutcomeReportTerms,
  withCountersigners,
  type BundleVerificationResult,
  type VerifiedBundleContext,
} from "@action-state-group/agent-action-capsule";
import type { PresentationManifest } from "./presentation-registry.js";
import {
  BUILTIN_MANIFEST_COMPOSED,
  BUILTIN_MANIFEST_EVALUATION_SUMMARY_GRAPH,
  BUILTIN_MANIFEST_NO_AGGREGATE,
  BUILTIN_MANIFEST_REPORT_ROWS,
  BUILTIN_MANIFEST_RESULT,
  BUILTIN_MANIFEST_RESULT_COMPLIANCE,
  BUILTIN_MANIFEST_RESULT_CONTRACT_REPORT,
  BUILTIN_MANIFEST_RESULT_OUTCOME_REPORT,
} from "./builtin-manifests.js";
import {
  classifyCountersignatures,
  declaredProducerKeys,
  type CountersignatureStamp,
  type CountersignerSource,
  type CountersignStatementView,
} from "@action-state-group/agent-action-capsule";
import {
  buildEvidenceGraph,
  EvidenceGraphError,
  type ActNode,
  type AxisJudgment,
  type CalibrationCount,
  type CalibrationNode,
  type CaseNode,
  type DisclosureState,
  type EvidenceGraph,
  type RecordTimes,
  type ReportNode,
  zoneStatement,
} from "@action-state-group/agent-action-capsule";
import { digestCapability } from "@action-state-group/agent-action-capsule";
import {
  citesOneContract,
  renderContractReport,
  type ContractReportInput,
} from "./contract-report.js";
import type {
  PresentationDepth,
  WordingPackInput,
} from "./presentation-fragment.js";
import {
  readOutcomeReportPresentation,
  type OutcomeReportPresentation,
} from "./outcome-report-presentation.js";
import { composedSectionModule } from "./composed-view.js";
import {
  DEFAULT_WORDS,
  contractReportWords,
} from "./contract-report-wording.js";
import {
  CORE_STRIP_ATTRIBUTE,
  coreStripModel,
  renderCoreStrip,
  type CoreStripModel,
} from "./core-strip.js";
import { RECORD_CONTENT_CSS, renderContent } from "./record-content.js";
import {
  deferBody,
  recordAddress,
  revealRecord,
  revealRecordsByHash,
} from "./report-levels.js";
import {
  readCompliancePresentation,
  type CompliancePresentation,
} from "./compliance-presentation.js";
import { readPresentationBlock } from "@action-state-group/agent-action-capsule";
import {
  bundleVerified,
  PresentationAmbiguityError,
  PresentationRegistry,
  type PresentationBadgeState,
  type PresentationFormat,
  type PresentationHost,
  type PresentationModule,
  type PresentationRefusal,
  type PresentationRegistration,
  type PresentationResolution,
  type PresentationResolver,
  type PresentationRuntime,
  type PresentationServices,
  presentationExtensionRows,
  presentationRefusalNotices,
  type PresentationExtensionRow,
  type PresentationRefusalNotice,
} from "./presentation-registry.js";
import {
  aacInterpreters,
  aliasExtensionRows,
  type PageInterpreterId,
} from "./alias-interpreters.js";
import {
  buildReportRows,
  type ReportRow,
  type ReportRowCitation,
  type ReportRows,
} from "@action-state-group/agent-action-capsule";
import {
  buildResultRoot,
  isResultRoot,
  UNVERIFIED_KEY_LABEL,
  type CountField,
  type CountMismatch,
  type ResultClose,
  type CitedRecord,
  type ResultClaim,
  type ResultRoot,
} from "@action-state-group/agent-action-capsule";
import {
  buildVerificationPageModel,
  CHECKED_ON_THIS_PAGE,
  CHECKS_SCOPE_LINE,
  FAILED_ON_THIS_PAGE,
  FULL_VERIFIER_LINE,
  NOT_CHECKED_ON_THIS_PAGE,
  RECEIPT_GRADE_DISPLAY,
  VERIFICATION_BANNER_LINES,
  verificationBanner,
  verificationCheckWords,
  type VerificationBanner,
  type VerificationCheckLists,
  type CheckSummary,
  type CompletenessStatement,
  type CoverageStatement,
  type ReceiptEntry,
  type RecordCoverage,
  type RecordCoverageStatus,
} from "@action-state-group/agent-action-capsule";

function element(tag: string, text?: string): HTMLElement {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  return value;
}

function display(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function appendValue(parent: HTMLElement, label: string, value: unknown): void {
  parent.append(element("dt", label));
  parent.append(element("dd", display(value)));
}

// A written time is printed exactly as the source wrote it. When it states no
// zone, a visible marker follows it; no zone is ever assigned and no `Z` or
// UTC label is ever printed on a time that did not carry one.
function renderTime(value: string): HTMLElement {
  const zone = zoneStatement(value);
  const time = element("span", value);
  time.dataset.tz = zone;
  if (zone === "not-stated") {
    const marker = element("span", " (timezone not stated)");
    marker.dataset.tzMarker = "not-stated";
    time.append(marker);
  }
  return time;
}

function appendTime(
  parent: HTMLElement,
  label: string,
  value: string | undefined,
  absent: string,
): void {
  parent.append(element("dt", label));
  const cell = element("dd");
  if (value === undefined) {
    cell.textContent = absent;
    cell.dataset.time = "not-stated";
  } else {
    cell.append(renderTime(value));
  }
  parent.append(cell);
}

const recordsWord = (count: number): string =>
  `${count} ${count === 1 ? "record" : "records"}`;

// The banner is drawn from AAC's banner model alone (presentation contract
// section 6.2) and precedes every row in the DOM; a bundle that fails the
// page's own checks gets the refusal line here and no rows at all, so a
// reader never meets a payload before the verdict on the bundle that carries
// it. It is a pill in the page's top bar: `data-verify` is the state the
// reader is told (`verified` only for a `valid` verdict), `data-verdict` the
// strict verdict and `data-checkpoint` what became of the checkpoint
// signature. Its line is the core's fixed text for the state; the details
// line under the bar names the findings. The bar also says, from the
// verification section, how many checks passed, and links down to it.
function renderVerificationBanner(
  root: HTMLElement,
  model: VerificationBanner,
  coverage: { uncheckpointed: number; total: number },
): HTMLElement {
  const bar = element("div");
  // A failed bundle's bar is a callout on every page, with or without a
  // report's frame (the shell's .cv-failed); in a report's frame an
  // incomplete one takes its own colours (.cv-incomplete). data-verify
  // stays the banner's.
  bar.className =
    model.state === "failed"
      ? "cv-shell-bar cv-failed"
      : model.state === "incomplete"
        ? "cv-shell-bar cv-incomplete"
        : "cv-shell-bar";
  const banner = element("span", model.line);
  banner.className = "cv-pill";
  banner.dataset.verify = model.state;
  banner.dataset.verdict = model.verdict;
  banner.dataset.checkpoint = model.checkpoint;
  banner.dataset.uncheckpointed = String(model.uncheckpointed);
  bar.append(banner);
  // The verification section's own summary line, filled in once that
  // section is drawn (at the end of renderEvidenceGraph), and a link down
  // to the section.
  const summary = element("span");
  summary.className = "cv-shell-detail";
  summary.dataset.verifySummary = "";
  bar.append(summary);
  if (model.refusal === undefined && coverage.uncheckpointed > 0) {
    const note = element(
      "span",
      `${coverage.uncheckpointed} of ${recordsWord(coverage.total)} not in the checkpoint`,
    );
    note.className = "cv-shell-note";
    note.dataset.uncheckpointedNote = "";
    bar.append(note);
  }
  const link = element("a", CHECKED_SECTION_TITLE);
  link.className = "cv-shell-link";
  link.setAttribute("href", `#${CHECKED_SECTION_ID}`);
  link.addEventListener("click", () => {
    const section = root.ownerDocument.getElementById(CHECKED_SECTION_ID);
    if (section instanceof root.ownerDocument.defaultView!.HTMLDetailsElement)
      section.open = true;
  });
  bar.append(link);
  root.append(bar);
  if (model.detail !== "") {
    const detail = element("p", model.detail);
    detail.className = "cv-banner-detail";
    detail.dataset.bannerDetail = "";
    root.append(detail);
  }
  if (model.refusal === undefined) return bar;
  const refusal = element("p", model.refusal);
  refusal.dataset.refusal = "unverified-bundle";
  root.append(refusal);
  return bar;
}

/**
 * Draw the `checking` state into `root`, replacing what it held: the
 * banner alone, with no verdict and no row, until the checks finish
 * (presentation contract section 6.2). Returns that banner's bar.
 */
export function renderChecking(root: HTMLElement): HTMLElement {
  const bar = element("div");
  bar.className = "cv-shell-bar";
  const banner = element("span", VERIFICATION_BANNER_LINES.checking);
  banner.className = "cv-pill";
  banner.dataset.verify = "checking";
  bar.append(banner);
  root.replaceChildren(bar);
  return bar;
}

/** The words a page says when this viewer cannot verify the bundle at all. */
export const UNABLE_TO_VERIFY_LINES = {
  banner: VERIFICATION_BANNER_LINES.unable,
  reason:
    "This viewer cannot compute the SHA-256 digests the checks need, so nothing was checked and no records are shown. This is not a failed check: the file may well be valid.",
  command: "To check this file, run:",
  noCommand:
    "To check this file, open it from a secure (https) page, or check it with a verifier outside this viewer.",
} as const;

/**
 * Render the "unable to verify in this viewer" state into `root`: drawn,
 * in place of any verification result, when this runtime has no SHA-256
 * (`digestCapability() === "none"`). It never says the bundle failed, and
 * it shows no record. `verifyCommand` is the exact command a reader runs
 * to check the file elsewhere; without one, the page says where to check
 * it instead.
 */
export function renderUnableToVerify(
  root: HTMLElement,
  options: { readonly verifyCommand?: string } = {},
): void {
  root.replaceChildren();
  const banner = element("p", UNABLE_TO_VERIFY_LINES.banner);
  banner.dataset.verify = "unable";
  const reason = element("p", UNABLE_TO_VERIFY_LINES.reason);
  reason.dataset.refusal = "unable-to-verify";
  root.append(banner, reason);
  if (options.verifyCommand === undefined) {
    root.append(element("p", UNABLE_TO_VERIFY_LINES.noCommand));
    return;
  }
  const command = element("code", options.verifyCommand);
  command.dataset.verifyCommand = "";
  const block = element("pre");
  block.append(command);
  root.append(element("p", UNABLE_TO_VERIFY_LINES.command), block);
}

/**
 * The one line a closed "How this page was checked" section shows, so what
 * this page did not check stays in view with it folded: how many of the
 * checks passed (or failed), how many records the file carries, and the
 * signatures or other checks this page did not run.
 */
export function checkedSummaryLine(
  verified: boolean,
  model: {
    readonly checks: readonly { readonly status: string }[];
    readonly records: readonly unknown[];
    readonly checkLists: {
      readonly failed: readonly string[];
      readonly notChecked: readonly string[];
    };
  },
): string {
  const total = model.checks.length;
  const failed = model.checks.filter((c) => c.status === "fail").length;
  const passed = model.checks.filter((c) => c.status === "pass").length;
  const notRun = total - failed - passed;
  // A failure can sit outside the numbered checks (a disclosure that does not
  // match its digest, say, or a provenance error outside both counts): a
  // bundle that did not verify never reads as passed.
  // The page's own lists repeat the numbered checks' ground (digests,
  // record rules, closure, range, membership); a failure there is counted
  // only once, as the numbered check it shows up in.
  const pageFailed = model.checkLists.failed.filter(
    (id) => !NUMBERED_CHECK_GROUND.has(id),
  ).length;
  // Numbered checks that did not run are always said, so none reads as
  // passed or failed.
  const notRunNote = notRun > 0 ? `, ${notRun} not run` : "";
  const leads: string[] = [];
  if (failed > 0)
    leads.push(`${failed} of ${total} checks failed${notRunNote}`);
  if (pageFailed > 0)
    leads.push(
      `${pageFailed} ${pageFailed === 1 ? "check" : "checks"} on this page failed`,
    );
  if (failed === 0 && pageFailed === 0)
    leads.push(
      verified
        ? `${passed} of ${total} checks passed${notRunNote}`
        : SUMMARY_NOT_VERIFIED,
    );
  if (failed === 0 && (pageFailed > 0 || !verified) && notRun > 0)
    leads.push(`${notRun} of ${total} checks not run`);
  const parts = [...leads, recordsWord(model.records.length)];
  // Only the signature checks that are in the not-checked list are named, each
  // by its own words: a signature check that ran (or failed) is never said to
  // be unchecked, so the summary cannot contradict the lists under it.
  const signatures = model.checkLists.notChecked.flatMap((id) => {
    const words = SIGNATURE_CHECKS.get(id);
    return words === undefined ? [] : [words];
  });
  const others = model.checkLists.notChecked.length - signatures.length;
  if (signatures.length > 0)
    parts.push(
      `${
        signatures.length === 1
          ? signatures[0]
          : `${signatures.slice(0, -1).join(", ")} and ${signatures.at(-1)}`
      } not checked here`,
    );
  if (others > 0)
    parts.push(
      `${others} other ${others === 1 ? "check" : "checks"} not run here`,
    );
  return parts.join(" · ");
}

/** The summary's lead for a bundle that failed outside every counted check. */
export const SUMMARY_NOT_VERIFIED = "the bundle did not verify";

const NUMBERED_CHECK_GROUND: ReadonlySet<string> = new Set([
  "record-digests",
  "record-rules",
  "closure",
  "range",
  "membership",
]);

const SIGNATURE_CHECKS: ReadonlyMap<string, string> = new Map([
  ["checkpoint-signature", "checkpoint signature"],
  ["producer-signatures", "producer signatures"],
  ["cited-signers", "cited signers' signatures"],
  ["countersignatures", "countersignatures"],
]);

/** The folded verification section's heading. */
export const CHECKED_SECTION_TITLE = "How this page was checked";
/** The folded verification section's id, the banner link's target. */
const CHECKED_SECTION_ID = "cv-checked";

// presentation/v1 is rendered here, in the header only, and nowhere else in
// this module. Only readPresentationBlock's three known fields ever reach
// the DOM -- the chrome rule holds structurally, not by a rendering-site
// convention that a future edit could bypass.
function renderPresentationHeader(root: HTMLElement, bundle: unknown): void {
  const presentation = readPresentationBlock(bundle);
  if (presentation === undefined) return;
  const header = element("header");
  header.dataset.presentation = "header";
  if (presentation.logoDataUrl !== undefined) {
    const logo = document.createElement("img");
    logo.src = presentation.logoDataUrl;
    logo.alt = presentation.producerDisplayName ?? "producer logo";
    header.append(logo);
  }
  if (presentation.producerDisplayName !== undefined) {
    const name = element("span", presentation.producerDisplayName);
    name.dataset.presentationField = "producer-display-name";
    header.append(name);
  }
  if (presentation.title !== undefined) {
    const title = element("strong", presentation.title);
    title.dataset.presentationField = "title";
    header.append(title);
  }
  root.append(header);
}

function stampText(stamp: CountersignatureStamp): string {
  switch (stamp.kind) {
    case "hollow":
      return "Countersigned: none";
    case "unverified":
      return stamp.reason === "no-ed25519"
        ? `a ${stamp.type} countersignature is present; its signature is not checked in this viewer`
        : `a ${stamp.type} countersignature is present; this viewer does not verify that type`;
    case "invalid":
      return "a countersignature is present but failed to verify";
    case "not-independent":
      return `countersigned by the producer — not independent · recomputed ${stamp.statement.recomputedAt}`;
    case "unresolved-signer":
      return `countersigned by an unlisted signer, not in any countersigner list consulted · recomputed ${stamp.statement.recomputedAt}`;
    case "resolved":
      return `Countersigned by ${stamp.name} · recomputed ${stamp.statement.recomputedAt}`;
  }
}

// Each check and result is the signer's statement, listed as the signer gave
// it: never totalled, never presented as this viewer's own finding.
function renderSignerStatement(
  item: HTMLElement,
  signer: string,
  statement: CountersignStatementView,
): void {
  const label = element("p", `${signer}'s statement of what it recomputed:`);
  item.append(label);
  const checks = element("ul");
  checks.dataset.countersignStatement = "checks";
  statement.checks.forEach((check) => {
    const row = element("li", `${check.name}: ${check.result}`);
    row.dataset.checkResult = check.result;
    checks.append(row);
  });
  item.append(checks);
  if (statement.receipt === "unverified") {
    const receipt = element("p", "receipt present, not checked by this viewer");
    receipt.dataset.countersignReceipt = "unverified";
    item.append(receipt);
  }
}

function renderStamps(
  host: HTMLElement,
  stamps: readonly CountersignatureStamp[],
): void {
  host.append(element("h4", "Countersignatures"));
  const list = element("ul");
  stamps.forEach((stamp) => {
    const item = element("li");
    item.dataset.stampKind = stamp.kind;
    item.append(element("span", stampText(stamp)));
    if (stamp.kind === "resolved") {
      renderSignerStatement(item, stamp.name, stamp.statement);
    } else if (stamp.kind === "not-independent") {
      renderSignerStatement(item, "The producer", stamp.statement);
    } else if (stamp.kind === "unresolved-signer") {
      renderSignerStatement(item, "The unlisted signer", stamp.statement);
    }
    list.append(item);
  });
  host.append(list);
}

function renderReceipts(
  host: HTMLElement,
  receipts: readonly ReceiptEntry[],
): void {
  host.append(element("h4", "Receipts"));
  if (receipts.length === 0) {
    host.append(element("p", "no receipts disclosed"));
    return;
  }
  const list = element("ul");
  receipts.forEach((receipt) => {
    const item = element(
      "li",
      `${receipt.witness} · ${RECEIPT_GRADE_DISPLAY[receipt.grade]} · `,
    );
    item.append(renderTime(receipt.time));
    list.append(item);
  });
  host.append(list);
}

const COVERAGE_LABEL: Readonly<Record<RecordCoverageStatus, string>> =
  Object.freeze({
    checkpointed: "checkpointed",
    uncheckpointed: "uncheckpointed",
    membership_invalid: "membership invalid",
    unverified: "membership unverified",
  });

// One row per supplied record, in bundle order, each with its own standing
// under the checkpoint. When the claim established coverage the count is
// stated in words above the list. When it did not, the line says so and
// names the verifier's reason -- never "0 records uncheckpointed" on a
// bundle whose memberships were never verified -- and when the claim was
// withheld (no checkpoint to stand under) there are no counts by status.
// The records list follows either way: it is where every link to a record
// lands.
function renderCheckpointCoverage(
  host: HTMLElement,
  records: readonly RecordCoverage[],
  uncheckpointed: number,
  coverage: CoverageStatement,
  entries: RecordEntries,
  depth: "L0" | "L1" | "L2",
): void {
  host.append(element("h4", "Checkpoint coverage"));
  if (coverage.status === "established") {
    const count = element(
      "p",
      `${recordsWord(uncheckpointed)} uncheckpointed of ${recordsWord(records.length)} supplied`,
    );
    count.dataset.coverage = "uncheckpointed";
    count.dataset.count = String(uncheckpointed);
    host.append(count);
  } else {
    const line = element("p", `coverage not established: ${coverage.reason}`);
    line.dataset.coverage = "not-established";
    line.dataset.claim = coverage.status;
    host.append(line);
  }
  if (coverage.status !== "withheld")
    host.append(renderCoverageStatusCounts(records));
  host.append(renderRecordsList(records, entries, depth));
}

/** What the records list draws each record from (see `recordEntries`). */
interface RecordEntries {
  /** False for a bundle that did not verify: no record content is drawn. */
  readonly verified: boolean;
  /** Each record's reading, by bundle record id; empty when not verified. */
  readonly read: ReadonlyMap<string, CitedRecord>;
  /** Each record's kind, as the record (or its disclosed book header) names it. */
  readonly kind: (capsuleId: string) => string | undefined;
  readonly build: (capsuleId: string, record: CitedRecord) => Node;
}

// Records in this bundle: one entry per capsule id, each with its own address
// (`record-<capsule id>`, from the id alone, so every packaging of the page
// gives the same one), and, for an evidence-book record, a second address
// under the id of the capsule it carries, so a link by either id lands
// here. An id the bundle repeats is one entry with one address. The address sits
// inside the entry, not on it: a browser following a link opens every
// closed <details> around its target, so the entry itself opens too, with
// no script (and, where script runs, its body is built on that toggle).
// Closed until a link lands on it or the reader opens it; its body is built
// when it opens, or before a static page is written. At depth L2 the list
// is open, but not its entries: there are hundreds, and each opens when a
// link lands on it or the reader opens it. Other parts of the page link
// here and never draw a record themselves. For a bundle that did not
// verify, the list names each record, its kind and its standing, and draws
// no content.
function renderRecordsList(
  records: readonly RecordCoverage[],
  entries: RecordEntries,
  depth: "L0" | "L1" | "L2",
): HTMLElement {
  const details = document.createElement("details");
  details.dataset.records = "coverage-detail";
  details.open = depth === "L2";
  // One entry per capsule id, in first-listed order: a repeated id is one
  // record listed more than once, so it gets one entry, one address and a
  // note of how many times the bundle lists it, with each listing's status.
  const listings = new Map<string, RecordCoverage[]>();
  for (const record of records)
    listings.set(record.capsuleId, [
      ...(listings.get(record.capsuleId) ?? []),
      record,
    ]);
  const count =
    listings.size === records.length
      ? recordsWord(listings.size)
      : `${recordsWord(listings.size)} (${records.length} listings)`;
  const summary = element(
    "summary",
    `Records in this bundle: ${count}, by capsule id`,
  );
  details.append(summary);
  if (!entries.verified) {
    const note = element(
      "p",
      "Record content is not shown: this bundle did not verify.",
    );
    note.dataset.records = "not-shown";
    details.append(note);
  }
  const list = element("ul");
  list.dataset.records = "coverage";
  // Addresses in two passes, as AAC's Result reader resolves ids: every
  // record's own id first, then a carried capsule's id only where no record
  // has that id (and only once), so a book record listed before the capsule
  // it carries never takes that capsule's address.
  const owners = new Map<string, string>();
  for (const record of records)
    if (entries.verified && entries.read.has(record.capsuleId))
      if (!owners.has(record.capsuleId))
        owners.set(record.capsuleId, record.capsuleId);
  const own = new Set(records.map((record) => record.capsuleId));
  for (const record of records) {
    const carried = entries.read.get(record.capsuleId)?.carriedCapsuleId;
    if (
      entries.verified &&
      carried !== undefined &&
      !own.has(carried) &&
      !owners.has(carried)
    )
      owners.set(carried, record.capsuleId);
  }
  const used = new Set<string>();
  const address = (id: string, holder: string): HTMLElement | undefined => {
    const name = recordAddress(id);
    if (owners.get(id) !== holder || used.has(name)) return undefined;
    used.add(name);
    const anchor = element("span");
    anchor.className = "cv-record-anchor";
    anchor.id = name;
    return anchor;
  };
  for (const [capsuleId, listed] of listings) {
    const record = listed[0]!;
    const item = element("li");
    item.dataset.capsuleId = capsuleId;
    const kind = entries.kind(capsuleId);
    const status = element("span");
    listed.forEach((one, i) => {
      if (i > 0) status.append(" / ");
      const word = element("span", COVERAGE_LABEL[one.status]);
      word.dataset.recordStatus = one.status;
      word.className = `seal-${one.status}`;
      status.append(word);
    });
    if (listed.length > 1) {
      item.dataset.listed = String(listed.length);
      status.append(` · listed ${listed.length} times in this bundle`);
    }
    const label = `${capsuleId} · ${kind ?? "kind not stated"} · `;
    const read = entries.read.get(capsuleId);
    if (!entries.verified || read === undefined) {
      item.append(document.createTextNode(label), status);
      list.append(item);
      continue;
    }
    const fold = document.createElement("details");
    fold.className = "cv-record";
    fold.dataset.record = record.capsuleId;
    const head = element("summary", label);
    head.append(status);
    fold.append(head);
    const anchors = [record.capsuleId, read.carriedCapsuleId]
      .filter((id): id is string => id !== undefined)
      .map((id) => address(id, record.capsuleId))
      .filter((a): a is HTMLElement => a !== undefined);
    fold.append(...anchors);
    deferBody(fold, () => entries.build(record.capsuleId, read));
    // Where script runs, the body is built after the browser scrolled to
    // the address; bring it back into view once the body is in place.
    fold.addEventListener("toggle", () => {
      const hash = fold.ownerDocument.defaultView?.location?.hash;
      const target = anchors.find((a) => hash === `#${a.id}`);
      if (fold.open && target !== undefined) target.scrollIntoView?.();
    });
    item.append(fold);
    list.append(item);
  }
  details.append(list);
  return details;
}

/**
 * Each record's reading for the records list, from the verifier's resolved
 * context: the Result's reading where a claim reaches the record, otherwise
 * the record's own times, log position, committed digests and disclosed
 * members, and, for an evidence-book record, the capsule it carries,
 * checked as the Result reader checks it (`carriedCapsuleCommitment`,
 * `resolveCarriedInput`).
 */
async function recordEntries(
  context: VerifiedBundleContext,
  result: ResultRoot | undefined,
): Promise<Map<string, CitedRecord>> {
  const read = new Map<string, CitedRecord>();
  for (const record of result?.records.values() ?? []) {
    const id = record.bookRecordId ?? record.capsuleId;
    if (!read.has(id)) read.set(id, record);
  }
  const bundle = object(context.bundle);
  const memberships = context.completeness.memberships;
  const extensions = object(bundle.extensions);
  const payloads = object(extensions[BOOK_PAYLOADS_EXTENSION]);
  const originals = object(extensions[AGENT_INPUT_ORIGINALS_EXTENSION]);
  for (const raw of context.records) {
    const id = raw.capsule_id;
    if (read.has(id)) continue;
    const agentInput = disclosureOf(context, id, "agent_input");
    const header =
      agentInput.state === "disclosed" &&
      object(agentInput.payload).record_type === PUBLISHED_CAPSULE_RECORD_TYPE
        ? agentInput.payload
        : undefined;
    const carried =
      header === undefined
        ? undefined
        : await carriedCapsuleCommitment(header, payloads);
    const carriedInput =
      header === undefined
        ? undefined
        : await resolveCarriedInput(header, payloads, originals);
    const references = Array.isArray(raw.references) ? raw.references : [];
    const agentInputDigest = committedDigest(raw, "agent_input");
    const agentOutputDigest = committedDigest(raw, "agent_output");
    const coordinates = logCoordinates(memberships, id);
    read.set(id, {
      ...recordTimes(raw),
      capsuleId: id,
      agentInput,
      agentOutput: disclosureOf(context, id, "agent_output"),
      ...(agentInputDigest === undefined ? {} : { agentInputDigest }),
      ...(agentOutputDigest === undefined ? {} : { agentOutputDigest }),
      ...(coordinates === undefined ? {} : { logCoordinates: coordinates }),
      ...(carriedInput === undefined ? {} : { carriedInput }),
      ...(carried === undefined
        ? {}
        : {
            carriedCapsuleId: carried.capsuleId,
            carriedInputDigest: carried.inputDigest,
          }),
      cites: references.flatMap((ref) => {
        const r = object(ref);
        return r.citation_purpose === "acted_on" && typeof r.digest === "string"
          ? [r.digest]
          : [];
      }),
    });
  }
  return read;
}

/** A record's kind: its disclosed book header's `record_type`, else its own `action_type`. */
function recordKind(
  raw: unknown,
  read: CitedRecord | undefined,
): string | undefined {
  const header =
    read?.agentInput.state === "disclosed"
      ? object(read.agentInput.payload).record_type
      : undefined;
  if (typeof header === "string") return header;
  const own = object(raw).action_type;
  return typeof own === "string" ? own : undefined;
}

// Counts by seal status -- the line a reader actually needs (how many of
// each) without scrolling a list that is one row per record (500+ rows on a
// real day's book: 50 cases x 9 criteria + 50 cases + 1 Close). The full,
// per-capsule-id list stays available (renderCheckpointCoverage wraps it in
// a collapsed <details>), never removed, just not the first thing rendered.
function renderCoverageStatusCounts(
  records: readonly RecordCoverage[],
): HTMLElement {
  const counts = new Map<RecordCoverageStatus, number>();
  for (const record of records) {
    counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
  }
  const list = element("ul");
  list.dataset.records = "coverage-summary";
  for (const status of Object.keys(COVERAGE_LABEL) as RecordCoverageStatus[]) {
    const count = counts.get(status) ?? 0;
    if (count === 0) continue;
    const item = element(
      "li",
      `${recordsWord(count)} ${COVERAGE_LABEL[status]}`,
    );
    item.dataset.coverageStatus = status;
    item.dataset.count = String(count);
    list.append(item);
  }
  return list;
}

function renderCompletenessStatement(
  host: HTMLElement,
  completeness?: CompletenessStatement,
): void {
  host.append(element("h4", "Completeness statement"));
  const details = element("dl");
  appendValue(
    details,
    "closure depth",
    completeness?.closureDepth ?? "unstated",
  );
  appendValue(details, "records mode", completeness?.recordsMode ?? "unstated");
  appendValue(
    details,
    "payloads mode",
    completeness?.payloadsMode ?? "unstated",
  );
  appendValue(
    details,
    "suppressed fields",
    completeness?.suppressedFields ?? [],
  );
  host.append(details);
}

function renderChecks(
  host: HTMLElement,
  checks: readonly CheckSummary[],
): void {
  host.append(element("h4", "The ten checks"));
  const list = element("ol");
  checks.forEach((check) => {
    const item = element("li");
    item.dataset.checkStatus = check.status;
    item.append(element("strong", check.name));
    item.append(element("span", `: ${check.result}`));
    list.append(item);
  });
  host.append(list);
}

// One row per extension: id, integrity, semantics. The id is the bundle's
// own member name, set as text only. Integrity and semantics are separate
// cells so "covered" can never read as "understood": an uninterpreted block
// says so in words (EXTENSION_NOT_INTERPRETED). A row whose meaning a refused
// presentation module would have applied says that instead (presentation
// contract section 3.2), and names the module and the reason. A refused
// module with no extension of its own gets one line after the table. Nothing
// is drawn for a bundle with no extensions and no refusal.
function renderExtensions(
  host: HTMLElement,
  rows: readonly PresentationExtensionRow[],
  refusals: readonly PresentationRefusalNotice[],
): void {
  renderExtensionTable(host, rows);
  for (const notice of refusals) {
    const line = element("p", notice.line);
    line.dataset.presentationRefused = notice.id;
    line.dataset.refusal = notice.reason;
    host.append(line);
  }
}

function renderExtensionTable(
  host: HTMLElement,
  rows: readonly PresentationExtensionRow[],
): void {
  if (rows.length === 0) return;
  host.append(element("h4", "Extensions"));
  const table = element("table");
  table.dataset.extensions = "";
  const head = element("tr");
  for (const label of ["extension", "integrity", "semantics"])
    head.append(element("th", label));
  const thead = element("thead");
  thead.append(head);
  const body = element("tbody");
  for (const row of rows) {
    const tr = element("tr");
    tr.dataset.extensionId = row.id;
    tr.dataset.integrity = row.integrity;
    tr.dataset.semantics =
      row.refusal !== undefined
        ? "refused"
        : row.interpreter === undefined
          ? "uninterpreted"
          : "interpreted";
    // The interpreter that showed the block, as AAC's renderer wrote it.
    if (row.interpreter !== undefined) tr.dataset.interpreter = row.interpreter;
    if (row.refusal !== undefined) {
      tr.dataset.refusedModule = row.refusal.id;
      tr.dataset.refusal = row.refusal.reason;
    }
    tr.append(
      element("td", row.id),
      element("td", row.integrity),
      element("td", row.semantics),
    );
    body.append(tr);
  }
  table.append(thead, body);
  host.append(table);
}

// The page's own checks in up to three lists (presentation contract section
// 6.1): what ran here and passed, what ran here and failed, and what the
// bundle calls for that this page did not run. A list with no entries is not
// drawn. The not-checked list ends with the neutral pointer to a full
// verifier and, when the host supplied one, its own verifier text (shown as
// text, never markup).
function renderCheckLists(
  host: HTMLElement,
  lists: VerificationCheckLists,
  verifierHint: string | undefined,
): void {
  const groups = [
    ["page", CHECKED_ON_THIS_PAGE, lists.page],
    ["failed", FAILED_ON_THIS_PAGE, lists.failed],
    ["not-checked", NOT_CHECKED_ON_THIS_PAGE, lists.notChecked],
  ] as const;
  for (const [which, heading, ids] of groups) {
    if (ids.length === 0) continue;
    host.append(element("h4", heading));
    const list = element("ul");
    list.dataset.checks = which;
    for (const id of ids) {
      const item = element(
        "li",
        verificationCheckWords(
          id,
          which === "not-checked" ? "notChecked" : which,
          lists,
        ),
      );
      item.dataset.check = id;
      list.append(item);
    }
    host.append(list);
    if (which === "not-checked") {
      const pointer = element("p", FULL_VERIFIER_LINE);
      pointer.dataset.checks = "full-verifier";
      host.append(pointer);
      if (verifierHint !== undefined && verifierHint !== "") {
        const hint = element("pre", verifierHint);
        hint.dataset.verifierHint = "";
        host.append(hint);
      }
    }
  }
  const scope = element("p", CHECKS_SCOPE_LINE);
  scope.dataset.checks = "scope";
  host.append(scope);
}

// The viewer-owned verification page: the last page of the rendering, drawn
// entirely from VERIFIED data (the already-computed BundleVerificationResult
// and the countersignature stamp classification), never from bundle-supplied
// markup. It is never labeled a certificate.
//
// `styled` (true only when the outcome-report card rendered above it) draws
// this same page in that card's look: the section takes the card's `.oi`
// scope plus `.oi-vp`, and its content goes inside one `.sec` panel like
// every card section. Content, order and data attributes are identical
// either way, and it stays the last element of the rendering.
//
// `applied` is the set of extension interpreters this rendering ran; an
// extension row says "interpreted by" only for one of them. `refused` is
// every module this runtime refused that matched (page, then section).
async function renderVerificationPage(
  root: HTMLElement,
  context: VerifiedBundleContext,
  styled: boolean,
  applied: ReadonlySet<PageInterpreterId>,
  refused: readonly PresentationRefusal[],
  citedSigners: boolean,
  verifierHint: string | undefined,
  depth: "L0" | "L1" | "L2",
  stamps: readonly CountersignatureStamp[],
): Promise<string> {
  const { bundle, verification: verified } = context;
  const section = element("section");
  section.dataset.page = "verification";
  let page = section;
  if (styled) {
    section.className = "oi oi-vp";
    page = element("div");
    page.className = "sec";
    section.append(page);
  }
  page.append(element("h2", "Verification"));
  // The strict result too, so these lists are the ones the banner's line
  // points at (verificationBanner reads the same lists).
  const model = buildVerificationPageModel(
    bundle,
    verified,
    aacInterpreters(applied),
    {
      stamps,
      citedSigners,
      ...(context.strict === undefined ? {} : { strict: context.strict }),
    },
  );
  // AAC's page model carries no presentation refusals: this registry lays
  // its refusal rows over AAC's extension rows (the integrity words from
  // each row's own integrity) and adds a notice for each refused module
  // with no row (presentation contract section 3.2). The deprecated cards'
  // interpreters, which AAC 0.8.0 no longer reports, are applied first.
  const extensions = presentationExtensionRows(
    aliasExtensionRows(bundle, model.extensions, applied),
    refused,
  );
  const summary = element("dl");
  appendValue(summary, "bundle digest", model.bundleDigest ?? "uncomputable");
  appendValue(summary, "checkpoint root", model.checkpointRoot ?? "absent");
  appendValue(summary, "checkpoint size", model.checkpointSize ?? "absent");
  page.append(summary);
  renderReceipts(page, model.receipts);
  if (model.selfWitnessed) {
    // A checkpoint with no transparency-service receipt was witnessed by
    // nobody but the log that produced it -- stated here in those words.
    const witness = element(
      "p",
      "self-witnessed: no transparency-service receipt",
    );
    witness.dataset.witness = "self";
    page.append(witness);
  }
  // The content block's own styles: the records list is the core's, inside
  // no module's frame (record-content.ts RECORD_CONTENT_CSS).
  const contentStyle = element("style");
  contentStyle.textContent = RECORD_CONTENT_CSS;
  page.append(contentStyle);
  let result: ResultRoot | undefined;
  try {
    result = bundleVerified(verified) ? await resultRootOf(context) : undefined;
  } catch {
    result = undefined;
  }
  const read = bundleVerified(verified)
    ? await recordEntries(context, result)
    : new Map<string, CitedRecord>();
  const rawRecords = new Map<string, unknown>();
  for (const raw of Array.isArray(object(bundle).records)
    ? (object(bundle).records as unknown[])
    : [])
    if (typeof object(raw).capsule_id === "string")
      rawRecords.set(object(raw).capsule_id as string, raw);
  renderCheckpointCoverage(
    page,
    model.records,
    model.uncheckpointedCount,
    model.coverage,
    {
      verified: bundleVerified(verified),
      read,
      kind: (id) => recordKind(rawRecords.get(id), read.get(id)),
      build: (id, record) => renderRecordEntry(id, record),
    },
    depth,
  );
  renderStamps(page, stamps);
  renderCompletenessStatement(page, model.completeness);
  renderChecks(page, model.checks);
  renderExtensions(page, extensions, presentationRefusalNotices(refused));
  renderCheckLists(page, model.checkLists, verifierHint);
  page.append(element("p", model.verifyIndependentlyLine));
  // Folded into one section, closed for a bundle that verified; its summary
  // line keeps the counts and what was not checked in view.
  const folded = document.createElement("details");
  folded.className = "cv-checked";
  folded.id = CHECKED_SECTION_ID;
  folded.dataset.checked = "";
  // Open when the bundle did not verify, and at depth L2, where everything
  // is open (presentation contract section 9.1).
  folded.open = !bundleVerified(verified) || depth === "L2";
  const line = checkedSummaryLine(bundleVerified(verified), model);
  const heading = element("summary");
  heading.append(
    element("strong", CHECKED_SECTION_TITLE),
    document.createTextNode(` · ${line}`),
  );
  folded.append(heading, section);
  root.append(folded);
  return line;
}

function metRate(report: ReportNode): string {
  const required = report.outcomes.filter(
    (outcome) => outcome.role === "required",
  );
  if (required.length === 0) return "met rate unavailable";
  const passed = required.filter(
    (outcome) => outcome.aggregate === "pass",
  ).length;
  return `met rate ${passed}/${required.length}`;
}

function renderCalibration(calibration?: CalibrationNode): HTMLElement {
  const section = element("section");
  section.append(element("h2", "Human check"));
  if (calibration === undefined) {
    section.append(element("p", "no human-check data"));
    return section;
  }
  const details = element("dl");
  appendValue(details, "confusion matrix", calibration.confusion);
  appendCount(details, "agreement", calibration.agreement);
  appendCount(details, "corrected rate", calibration.correctedRate);
  appendValue(details, "period window", calibration.periodWindow);
  section.append(details);
  return section;
}

// A calibration figure is printed as the integers it is made of, "k of n";
// no rate is computed from them here, and a figure the producer stated only
// as a rate is said to be that, not converted.
function appendCount(
  parent: HTMLElement,
  label: string,
  count: CalibrationCount | undefined,
): void {
  parent.append(element("dt", label));
  const cell = element("dd");
  if (count === undefined) {
    cell.textContent = "not stated";
    cell.dataset.count = "not-stated";
  } else if ("rate" in count) {
    cell.textContent = "rate given, k and n not stated";
    cell.dataset.count = "not-stated";
  } else {
    cell.textContent = `${count.k} of ${count.n}`;
    cell.dataset.k = String(count.k);
    cell.dataset.n = String(count.n);
  }
  parent.append(cell);
}

// Both of a record's times are shown, each labelled and each as written. The
// action time is the source's own; when the record states none it says so --
// the seal time (the capsule's registration timestamp) never stands in for it.
function renderProvenance(
  capsuleId: string,
  coordinates: ActNode["logCoordinates"],
  times: RecordTimes,
): HTMLElement {
  const panel = element("section");
  panel.append(element("h4", "Provenance"));
  const details = element("dl");
  appendValue(details, "capsule ID", capsuleId);
  if (times.provenanceMode !== undefined)
    appendValue(details, "provenance", times.provenanceMode);
  appendTime(
    details,
    "action time",
    times.actionTime,
    "action time not stated",
  );
  appendTime(details, "seal time", times.sealTime, "seal time not stated");
  // The seal status is this record's own: coordinates exist only for a
  // record whose inclusion proof verified (the bundle renders only then), so
  // a record without them sits outside the checkpoint and says so.
  details.append(element("dt", "seal status"));
  const seal = element(
    "dd",
    coordinates === undefined ? "uncheckpointed" : "checkpointed",
  );
  seal.dataset.seal =
    coordinates === undefined ? "uncheckpointed" : "checkpointed";
  seal.className = `seal-${seal.dataset.seal}`;
  details.append(seal);
  if (coordinates !== undefined) {
    appendValue(details, "log ID", coordinates.logId);
    appendValue(details, "sequence", coordinates.seq);
    appendValue(details, "leaf", coordinates.leafIndex);
  }
  panel.append(details);
  return panel;
}

function renderJudgment(judgment: AxisJudgment): HTMLElement {
  const item = element("li");
  item.append(element("strong", `${judgment.axisId}: ${judgment.status}`));
  item.append(element("p", judgment.rationale));
  item.append(element("p", `evidence: ${judgment.evidenceIds.join(", ")}`));
  return item;
}

function renderAct(act: ActNode): HTMLElement {
  const section = element("section");
  section.append(element("h4", `Turn ${act.turnIdx}`));
  if (act.agentInput !== undefined)
    section.append(element("pre", display(act.agentInput)));
  if (act.agentOutput !== undefined)
    section.append(element("pre", display(act.agentOutput)));
  section.append(renderProvenance(act.capsuleId, act.logCoordinates, act));
  return section;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function renderWithheldActs(acts: ActNode[], host: HTMLElement): void {
  for (const act of acts) {
    if (act.agentInput !== undefined && act.agentOutput !== undefined) continue;
    const committed = object({
      agent_input_digest: act.agentInputDigest,
      agent_output_digest: act.agentOutputDigest,
    });
    const evidence = element("section");
    evidence.append(element("h4", "Undisclosed payload evidence"));
    const details = element("dl");
    appendValue(details, "capsule ID", act.capsuleId);
    for (const field of ["agent_input_digest", "agent_output_digest"]) {
      if (typeof committed[field] === "string")
        appendValue(details, field, committed[field]);
    }
    evidence.append(details);
    // A supplied value that does not hash to the committed digest is never
    // shown; the reader sees the digest above and this note, nothing else.
    for (const [field, state] of [
      ["agent_input", act.agentInputDisclosure],
      ["agent_output", act.agentOutputDisclosure],
    ] as const) {
      if (state !== "disclosure_mismatch") continue;
      const note = element(
        "p",
        `${field}: the disclosed value does not match the committed digest and is withheld`,
      );
      note.dataset.disclosure = state;
      evidence.append(note);
    }
    host.append(evidence);
  }
}

function renderCase(caseNode: CaseNode, host: HTMLElement): void {
  host.replaceChildren();
  host.append(element("h3", `Case ${caseNode.caseId}`));
  const judgments = element("ul");
  caseNode.judgments.forEach((judgment) =>
    judgments.append(renderJudgment(judgment)),
  );
  host.append(element("h4", "Axis judgments"), judgments);
  host.append(element("h4", "Disclosed transcript"));
  caseNode.acts.forEach((act) => host.append(renderAct(act)));
  renderWithheldActs(caseNode.acts, host);
}

function renderReport(
  report: ReportNode,
  host: HTMLElement,
  _records: unknown[],
): void {
  host.replaceChildren();
  const heading = element("h2", "Cases for ");
  heading.append(renderTime(report.date));
  host.append(heading);
  const outcomes = element("ul");
  report.outcomes.forEach((outcome) => {
    outcomes.append(
      element(
        "li",
        `${outcome.outcomeId} (${outcome.role}): ${outcome.aggregate ?? "unrated"}`,
      ),
    );
  });
  host.append(element("h3", "Outcome rollup"), outcomes);
  renderWithheldActs(report.withheldActs, host);

  const cases = element("section");
  const detail = element("section");
  report.cases.forEach((caseNode) => {
    const item = element(
      "button",
      `${caseNode.taskId}, trial ${caseNode.trial}: ${caseNode.aggregate ?? "unrated"}`,
    );
    item.setAttribute("type", "button");
    item.dataset.caseId = caseNode.caseId;
    item.addEventListener("click", () => renderCase(caseNode, detail));
    cases.append(item);
  });
  host.append(
    cases,
    detail,
    renderProvenance(report.capsuleId, report.logCoordinates, report),
  );
}

// report/v1: the generic row path. Every row is rendered from its own data
// -- label, status, reason, citations -- never from report-specific markup,
// so a pack this module has never heard of (obligations, Consumer Duty,
// anything else) renders the same way an outcomes report does.
function renderCitation(citation: ReportRowCitation): HTMLElement {
  const section = element("section");
  section.append(
    renderProvenance(citation.capsuleId, citation.logCoordinates, citation),
  );
  if (citation.disclosure === "disclosed") {
    section.append(element("pre", display(citation.disclosedPayload)));
  } else {
    const note = element(
      "p",
      citation.disclosure === "disclosure_mismatch"
        ? "withheld: the disclosed value does not match the committed digest"
        : "withheld",
    );
    note.dataset.disclosure = citation.disclosure;
    section.append(note);
  }
  return section;
}

function renderReportRow(row: ReportRow, host: HTMLElement): void {
  host.replaceChildren();
  host.append(element("h3", row.label));
  const status = element("p", row.status.replaceAll("_", " "));
  status.dataset.rowStatus = row.status;
  host.append(status);
  if (row.reason !== undefined) host.append(element("p", row.reason));
  host.append(element("h4", "Evidence"));
  if (row.citations.length === 0) {
    host.append(element("p", "no citation"));
  } else {
    row.citations.forEach((citation) => host.append(renderCitation(citation)));
  }
}

function renderReportRowsTable(
  reportRows: ReportRows,
  root: HTMLElement,
): void {
  const section = element("section");
  section.dataset.page = "report-rows";
  section.append(element("h1", reportRows.title ?? "Report"));
  const table = document.createElement("table");
  const detail = element("section");
  reportRows.rows.forEach((row) => {
    const tr = document.createElement("tr");
    const labelCell = document.createElement("td");
    const button = element("button", row.label);
    button.setAttribute("type", "button");
    button.dataset.rowId = row.rowId;
    button.addEventListener("click", () => renderReportRow(row, detail));
    labelCell.append(button);
    const statusCell = element("td", row.status.replaceAll("_", " "));
    statusCell.dataset.rowStatus = row.status;
    tr.append(labelCell, statusCell);
    table.append(tr);
  });
  section.append(
    table,
    detail,
    renderProvenance(
      reportRows.capsuleId,
      reportRows.logCoordinates,
      reportRows,
    ),
  );
  root.append(section);
}

// Result v0 root: headlines from the root Result, drill-downs from the
// records it cites. A cited record is drawn from its own data -- provenance,
// each committed member as disclosed or as `withheld · <digest>`, and the
// records it cites in turn -- so aggregate → daily → case → act is a walk
// over citations, never report-specific markup.
function renderCitedMember(
  host: HTMLElement,
  field: "agent_input" | "agent_output",
  resolution: CitedRecord["agentInput"],
  committed: string | undefined,
  label: string = field,
): void {
  // A value that does not match its commitment is always noted, even where
  // the caller has no committed digest to name (a record no claim reaches).
  if (
    resolution.state !== "disclosed" &&
    resolution.state !== "disclosure_mismatch" &&
    committed === undefined
  )
    return;
  host.append(element("h5", label));
  if (resolution.state === "disclosed") {
    // The core states what it established, once, beside the block; the
    // content module only draws the content (presentation contract 6.1).
    const checked = element(
      "p",
      "The content shown matches the digest the record commits to.",
    );
    checked.dataset.contentCheck = "digest";
    host.append(
      checked,
      renderContent(resolution.payload, DEFAULT_WORDS.lines),
    );
    return;
  }
  // A withheld member shows the digest the record committed to; a supplied
  // value that does not hash to it is never shown, only noted.
  const note = element(
    "p",
    resolution.state === "disclosure_mismatch"
      ? committed === undefined
        ? "withheld: the disclosed value does not match the committed digest"
        : `withheld · ${committed}: the disclosed value does not match the committed digest`
      : `withheld · ${committed}`,
  );
  note.dataset.disclosure = resolution.state;
  host.append(note);
}

function renderCitedRecord(
  record: CitedRecord,
  records: ReadonlyMap<string, CitedRecord>,
  host: HTMLElement,
): void {
  const section = element("section");
  section.dataset.citedRecord = record.capsuleId;
  section.append(
    renderProvenance(record.capsuleId, record.logCoordinates, record),
  );
  renderCitedMember(
    section,
    "agent_input",
    record.agentInput,
    record.agentInputDigest,
  );
  renderCitedMember(
    section,
    "agent_output",
    record.agentOutput,
    record.agentOutputDigest,
  );
  renderCarriedInput(section, record);
  if (record.cites.length > 0) {
    section.append(element("h5", "Cites"));
    renderCitationList(record.cites, records, section);
  }
  host.append(section);
}

// An evidence-book record's agent_input is the book's header; what the
// capsule it carries sealed is the carried input, drawn the same way.
function renderCarriedInput(host: HTMLElement, record: CitedRecord): void {
  if (record.carriedInput === undefined) return;
  renderCitedMember(
    host,
    "agent_input",
    record.carriedInput,
    record.carriedInputDigest,
    "agent_input of the capsule it carries",
  );
}

// A record's entry in the records section: its provenance (times, seal
// status, log position), each committed member as disclosed or withheld,
// the capsule it carries, and the records it cites as links to their
// entries.
function renderRecordEntry(
  capsuleId: string,
  record: CitedRecord,
): HTMLElement {
  const body = element("div");
  body.className = "cv-record-body";
  body.append(renderProvenance(capsuleId, record.logCoordinates, record));
  renderCitedMember(
    body,
    "agent_input",
    record.agentInput,
    record.agentInputDigest,
  );
  renderCitedMember(
    body,
    "agent_output",
    record.agentOutput,
    record.agentOutputDigest,
  );
  renderCarriedInput(body, record);
  if (record.cites.length > 0) {
    body.append(element("h5", "Cites"));
    const list = element("ul");
    for (const id of record.cites) {
      const item = element("li");
      const link = element("a", id);
      link.setAttribute("href", `#${recordAddress(id)}`);
      link.addEventListener("click", () => revealRecord(link, id));
      item.append(link);
      list.append(item);
    }
    body.append(list);
  }
  return body;
}

// One row per cited id, in citation order: a record supplied in this bundle
// opens under the list on click; one that is not says so and stays.
function renderCitationList(
  ids: readonly string[],
  records: ReadonlyMap<string, CitedRecord>,
  host: HTMLElement,
): HTMLElement {
  const list = element("ul");
  const detail = element("section");
  for (const id of ids) {
    const item = element("li");
    const target = records.get(id);
    if (target === undefined) {
      item.textContent = `${id} · not in this bundle`;
      item.dataset.citation = "missing";
    } else {
      const button = element("button", id);
      button.setAttribute("type", "button");
      button.dataset.citedId = id;
      button.addEventListener("click", () => {
        detail.replaceChildren();
        renderCitedRecord(target, records, detail);
      });
      item.append(button);
    }
    list.append(item);
  }
  host.append(list, detail);
  return list;
}

const CLAIM_TYPE_LABEL = (claim: ResultClaim): string =>
  claim.recognized ? claim.type : `unrecognized (${claim.type})`;

// A recomputed headline number never wears the producer's value. When the
// two disagree the recomputed value is drawn and a `count mismatch` marker
// sits beside it; the stated value is kept on the marker's data attribute,
// never in the text a reader takes as the number.
function countMismatchMarker(
  result: ResultRoot,
  field: CountMismatch["field"],
): HTMLElement | undefined {
  const mismatch = result.countMismatches.find(
    (entry) => entry.field === field,
  );
  if (mismatch === undefined) return undefined;
  const marker = element("span", "count mismatch");
  marker.dataset.countMismatch = field;
  marker.dataset.stated = String(mismatch.stated);
  marker.dataset.recomputed = String(mismatch.recomputed);
  return marker;
}

// The close state a reader sees is the one this bundle's links read
// whenever the cited Close is supplied; the Result's own value is drawn
// only when it is not, and then under a `producer-asserted` marker. When
// the two disagree the recomputed state is drawn with a `state mismatch`
// marker; the asserted value stays on the data attribute, never in the
// text. AGREED carries no mark of its own -- its label and the
// acknowledging peer's record are the whole affordance.
function appendCloseState(
  parent: HTMLElement,
  close: ResultClose,
  tag: "span" | "dd",
): HTMLElement {
  const cell = element(tag, close.state);
  cell.dataset.closeState = close.state;
  cell.dataset.closeDerivation = close.derivation;
  cell.dataset.assertedState = close.asserted;
  if (close.stateMismatch) {
    const marker = element("span", "state mismatch");
    marker.dataset.stateMismatch = "close_state";
    marker.dataset.asserted = close.asserted;
    marker.dataset.recomputed = close.state;
    cell.append(" ", marker);
  } else if (close.derivation === "producer-asserted") {
    const marker = element("span", "producer-asserted");
    marker.dataset.producerAsserted = "close_state";
    cell.append(" ", marker);
  }
  if (close.peerRefMismatch) {
    const marker = element("span", "peer_close_ref carries no such link");
    marker.dataset.peerRefMismatch = "peer_close_ref";
    cell.append(" ", marker);
  }
  parent.append(cell);
  return cell;
}

function renderClose(
  close: ResultClose,
  result: ResultRoot,
  host: HTMLElement,
): void {
  host.append(element("h4", "Close"));
  const details = element("dl");
  if (close.period !== undefined)
    appendValue(
      details,
      "period",
      `${close.period.start} → ${close.period.end}`,
    );
  details.append(element("dt", "state"));
  appendCloseState(details, close, "dd");
  details.append(element("dt", "derivation"));
  const derivation = element(
    "dd",
    close.derivation === "recomputed"
      ? `recomputed from ${close.links.length} counterparty ${close.links.length === 1 ? "link" : "links"} to the cited Close in this bundle${close.ignored.length === 0 ? "" : ` (${close.ignored.length} other ${close.ignored.length === 1 ? "link" : "links"} ignored)`}`
      : "producer-asserted: the cited Close is not a record in this bundle, so its links could not be read",
  );
  derivation.dataset.closeDerivationNote = close.derivation;
  details.append(derivation);
  if (close.peer !== undefined) appendValue(details, "peer", close.peer);
  if (close.bookId !== undefined) appendValue(details, "book", close.bookId);
  // A signer is drawn as verified only when its Producer Envelope verified
  // under the key_id (result-root.ts `signerOf`); otherwise it carries the
  // label, never a bare key.
  if (close.keyId !== undefined) {
    details.append(element("dt", "signer"));
    const signer = element(
      "dd",
      close.keyVerified === true
        ? `${close.keyId} (verified)`
        : `${close.keyId} · ${UNVERIFIED_KEY_LABEL}`,
    );
    signer.dataset.keyVerified = String(close.keyVerified === true);
    details.append(signer);
  }
  host.append(details);
  host.append(element("h5", "Cited Close"));
  renderCitationList([close.closeRef], result.records, host);
  if (close.peerCloseRef !== undefined) {
    host.append(element("h5", "Peer record"));
    renderCitationList([close.peerCloseRef], result.records, host);
  }
  if (close.links.length > 0) {
    host.append(element("h5", "Links to the cited Close"));
    const list = element("ul");
    for (const link of close.links) {
      const item = element(
        "li",
        `${link.type} · ${link.recordId} · signer ${link.keyId} (verified)`,
      );
      item.dataset.closeLink = link.type;
      item.dataset.linkRecord = link.recordId;
      list.append(item);
    }
    host.append(list);
  }
  // Inbound links that made no state -- from the Close's own book, a book
  // that is not the named peer, or the Close's own key -- are listed with
  // the reason, never counted: a reader sees why AGREED was not read.
  if (close.ignored.length > 0) {
    host.append(element("h5", "Links ignored (not from the counterparty)"));
    const list = element("ul");
    for (const link of close.ignored) {
      const item = element(
        "li",
        `${link.type} · ${link.recordId} · ${link.reason}`,
      );
      item.dataset.ignoredLink = link.type;
      item.dataset.linkRecord = link.recordId;
      list.append(item);
    }
    host.append(list);
  }
}

// The verdict a reader sees is the Result's own only when every cited id
// resolves in this bundle and the claim stands. A claim that FAILED
// verification (its close state is not what the links read) reads
// `failed` -- never `met`, never its stated verdict, which is kept on
// `data-stated-verdict` only. Otherwise an unresolved citation reads
// `unsupported`. The row stays in every case.
// The verdict a reader may see: never the producer's word for a claim that
// failed verification or whose evidence is not in the bundle.
function shownVerdict(claim: ResultClaim): string {
  return claim.failed
    ? "failed"
    : claim.support === "supported"
      ? claim.verdict
      : "unsupported";
}

function appendVerdict(parent: HTMLElement, claim: ResultClaim): HTMLElement {
  const shown = shownVerdict(claim);
  // A later claim's verdict is readiness only (ER section 4.3): never read
  // as a result that counts.
  const cell = element(
    parent.tagName === "TR" ? "td" : "dd",
    claim.later ? `${shown} (readiness)` : shown,
  );
  cell.dataset.verdict = shown;
  cell.dataset.support = claim.support;
  if (claim.later) cell.dataset.later = "true";
  if (claim.failed) {
    cell.dataset.statedVerdict = claim.verdict;
    cell.className = "claim-failed";
  } else if (claim.support === "unsupported")
    cell.className = "claim-unsupported";
  parent.append(cell);
  return cell;
}

// A failed claim's sufficiency is the producer's word too: the cell reads
// `failed`, the stated value on `data-stated-sufficiency` only.
function appendSufficiency(
  parent: HTMLElement,
  claim: ResultClaim,
): HTMLElement {
  const shown = claim.failed ? "failed" : claim.sufficiency;
  const cell = element(parent.tagName === "TR" ? "td" : "dd", shown);
  cell.dataset.sufficiency = shown;
  if (claim.failed) {
    cell.dataset.statedSufficiency = claim.sufficiency;
    cell.className = "claim-failed";
  }
  parent.append(cell);
  return cell;
}

function renderClaim(
  claim: ResultClaim,
  result: ResultRoot,
  host: HTMLElement,
): void {
  host.replaceChildren();
  host.append(element("h3", `Claim ${claim.id}`));
  const details = element("dl");
  appendValue(details, "contract", claim.contractRef);
  appendValue(details, "requirement", claim.requirementRef);
  details.append(element("dt", "type"));
  const type = element("dd", CLAIM_TYPE_LABEL(claim));
  type.dataset.claimType = claim.recognized ? claim.type : "unrecognized";
  if (!claim.recognized) type.className = "claim-unrecognized";
  details.append(type);
  appendValue(details, "tier", claim.tier);
  appendValue(details, "grade", claim.grade);
  details.append(element("dt", "sufficiency"));
  appendSufficiency(details, claim);
  details.append(element("dt", "verdict"));
  appendVerdict(details, claim);
  host.append(details);
  if (claim.failed) {
    const note = element(
      "p",
      `failed: ${claim.failure ?? "verification failed"}; sufficiency and verdict withheld`,
    );
    note.dataset.claimFailed = claim.failedOn ?? "close_state";
    host.append(note);
  }
  if (claim.close !== undefined) renderClose(claim.close, result, host);
  if (claim.support === "unsupported") {
    const note = element(
      "p",
      claim.missing.length === 0
        ? "unsupported: this claim cites no evidence"
        : `unsupported: cited evidence not in this bundle: ${claim.missing.join(", ")}`,
    );
    note.dataset.claimMissing = String(claim.missing.length);
    host.append(note);
  }
  host.append(element("h4", "Presentation"));
  const carrier = element("dl");
  appendValue(carrier, "carrier", claim.presentation.kind);
  appendValue(carrier, "status", claim.presentation.status);
  if (claim.presentation.summary !== undefined)
    appendValue(carrier, "summary", claim.presentation.summary);
  if (claim.presentation.narrative !== undefined)
    appendValue(carrier, "narrative", claim.presentation.narrative);
  host.append(carrier);
  // A disclosure carrier names the digests it discloses. They are drawn in
  // the same row shape as any other citation, resolved against this bundle;
  // the claim's own `evidence[]` below is the list the verdict rests on.
  if (claim.presentation.evidence !== undefined) {
    host.append(element("h5", "Carrier evidence"));
    const list = renderCitationList(
      claim.presentation.evidence,
      result.records,
      host,
    );
    list.dataset.carrierEvidence = String(claim.presentation.evidence.length);
  }
  host.append(element("h4", "Proofs"));
  if (claim.proofs.length === 0) {
    host.append(element("p", "no proof cited"));
  } else {
    const proofs = element("ul");
    for (const proof of claim.proofs)
      proofs.append(
        element("li", `${proof.kind} · ${proof.digest} · not resolved here`),
      );
    host.append(proofs);
  }
  host.append(element("h4", "Evidence"));
  for (const ref of claim.evidence) {
    const record = result.records.get(ref.digest);
    if (record === undefined) {
      const missing = element("p", `${ref.digest} · not in this bundle`);
      missing.dataset.evidence = "missing";
      host.append(missing);
    } else {
      renderCitedRecord(record, result.records, host);
    }
  }
}

const BUCKETS: ReadonlyArray<
  readonly [keyof ResultRoot["buckets"], string, CountField]
> = [
  ["met", "met", "buckets.met"],
  ["notMet", "not met", "buckets.not_met"],
  ["notEvaluable", "not evaluable", "buckets.not_evaluable"],
  // ER section 4.2: drawn only when the Result carries the fourth bucket.
  ["outOfScope", "out of scope", "buckets.out_of_scope"],
];

/**
 * The marks the core puts on a Result's counts: the strip, the bucket tallies
 * and lists, and the count-mismatch markers. A page whose root is no Result
 * shows none of them; a module that draws one there is discarded for the
 * refusal (renderVerifiedContext).
 */
const RESULT_COUNT_MARKS = `[${CORE_STRIP_ATTRIBUTE}], .cv-strip, [data-bucket], [data-bucket-count], [data-count-mismatch]`;

/** Said above the generic Result page when a Result opted into a card whose layout cannot hold its claims (`claimsFitCard`). */
export const CARD_UNFIT_NOTE =
  "This Result's claims don't fit the report layout, so every claim is listed below instead.";

// The Result page lists the claims by verdict, after the core strip, which
// draws coverage first and then the buckets, never a single figure
// (core-strip.ts). Every count drawn here is the recomputed one
// (`result.bucketCounts`); a producer figure the claims do not bear out
// shows as a `count mismatch` marker beside it. Each claim keeps its own
// tier and grade on its row.
function renderResultPage(result: ResultRoot, root: HTMLElement): void {
  const section = element("section");
  section.dataset.page = "result";
  section.append(element("h1", "Evidence result"));
  const later = result.claims.filter((claim) => claim.later);
  const byId = new Map(result.claims.map((claim) => [claim.id, claim]));
  const buckets = element("section");
  buckets.dataset.buckets = "verdict";
  buckets.append(element("h2", "Claims by verdict"));
  for (const [key, label, field] of BUCKETS) {
    const ids = result.buckets[key];
    if (ids === undefined) continue;
    const count = result.bucketCounts[key] ?? 0;
    const heading = element("h3", `${label}: ${count === 0 ? "none" : count}`);
    heading.dataset.bucketCount = String(count);
    heading.dataset.bucketOf = key;
    const marker = countMismatchMarker(result, field);
    if (marker !== undefined) heading.append(" ", marker);
    buckets.append(heading);
    if (ids.length === 0) {
      buckets.append(element("p", "none"));
      continue;
    }
    const list = element("ul");
    list.dataset.bucket = key;
    for (const id of ids) {
      const claim = byId.get(id);
      const item = element(
        "li",
        claim?.failed
          ? `${id} · failed`
          : claim?.support === "unsupported"
            ? `${id} · unsupported`
            : id,
      );
      item.dataset.claimRef = id;
      if (claim?.failed) item.className = "claim-failed";
      else if (claim?.support === "unsupported")
        item.className = "claim-unsupported";
      list.append(item);
    }
    buckets.append(list);
  }
  // The verifier's own state, after the producer's buckets: claims
  // that failed verification (a close state the links contradict). Drawn
  // always, `none` when empty, so a reader never has to infer from an
  // absent heading that nothing failed. Not a verdict bucket: a failed
  // claim is counted here and under no verdict, whatever bucket the
  // producer listed it in (that listing stays above, marked).
  const failedHeading = element(
    "h3",
    `failed: ${result.bucketCounts.failed === 0 ? "none" : result.bucketCounts.failed}`,
  );
  failedHeading.dataset.bucketCount = String(result.bucketCounts.failed);
  failedHeading.dataset.bucketOf = "failed";
  buckets.append(failedHeading);
  const failedIds = result.claims
    .filter((claim) => claim.failed)
    .map((claim) => claim.id);
  if (failedIds.length === 0) buckets.append(element("p", "none"));
  else {
    const list = element("ul");
    list.dataset.bucket = "failed";
    for (const id of failedIds) {
      const item = element("li", id);
      item.dataset.claimRef = id;
      item.className = "claim-failed";
      list.append(item);
    }
    buckets.append(list);
  }
  // ER section 4.3: claims not yet in force, their verdicts readiness only,
  // in no bucket above.
  if (later.length > 0) {
    const heading = element("h3", `not yet in force: ${later.length}`);
    heading.dataset.bucketOf = "notYetInForce";
    heading.dataset.bucketCount = String(later.length);
    buckets.append(heading);
    const list = element("ul");
    list.dataset.bucket = "notYetInForce";
    for (const claim of later) {
      const item = element(
        "li",
        `${claim.id} · applies from ${claim.appliesFrom ?? ""} · readiness: ${shownVerdict(claim)}`,
      );
      item.dataset.claimRef = claim.id;
      if (claim.failed) item.className = "claim-failed";
      else if (claim.support === "unsupported")
        item.className = "claim-unsupported";
      list.append(item);
    }
    buckets.append(list);
  }
  section.append(buckets);

  const table = document.createElement("table");
  table.dataset.claims = "rows";
  const detail = element("section");
  for (const claim of result.claims) {
    const tr = document.createElement("tr");
    tr.dataset.claimRow = claim.id;
    tr.dataset.support = claim.support;
    if (claim.support === "unsupported") tr.className = "claim-unsupported";
    if (claim.failed) {
      tr.classList.add("claim-failed");
      tr.dataset.failed = claim.failedOn ?? "close_state";
    }
    const idCell = document.createElement("td");
    const button = element("button", claim.id);
    button.setAttribute("type", "button");
    button.dataset.claimId = claim.id;
    button.addEventListener("click", () => renderClaim(claim, result, detail));
    idCell.append(button);
    tr.append(idCell, element("td", claim.requirementRef));
    appendSufficiency(tr, claim);
    appendVerdict(tr, claim);
    const tier = element("td", claim.tier);
    tier.dataset.tier = claim.tier;
    const grade = element("td", claim.grade);
    grade.dataset.grade = claim.grade;
    const type = element("td", CLAIM_TYPE_LABEL(claim));
    type.dataset.claimType = claim.recognized ? claim.type : "unrecognized";
    if (!claim.recognized) type.className = "claim-unrecognized";
    if (claim.close !== undefined) {
      type.append(" · ");
      appendCloseState(type, claim.close, "span");
    }
    tr.append(tier, grade, type);
    table.append(tr);
  }
  section.append(
    table,
    detail,
    renderProvenance(result.capsuleId, result.logCoordinates, result),
  );
  root.append(section);
}

function renderGraph(
  graph: EvidenceGraph,
  root: HTMLElement,
  records: unknown[],
): void {
  const aggregate = element("section");
  aggregate.append(element("h1", "Evidence graph"));
  const metrics = element("dl");
  appendValue(metrics, "per-axis", graph.aggregate.perAxis);
  appendValue(metrics, "counts", graph.aggregate.counts);
  aggregate.append(metrics);
  root.append(aggregate, renderCalibration(graph.calibration));

  const calendar = element("section");
  calendar.append(element("h2", "Daily reports"));
  const detail = element("section");
  [...graph.reports]
    .sort((left, right) => left.date.localeCompare(right.date))
    .forEach((report) => {
      // The label is the report's date as the producer wrote it -- a bare
      // day stays a day, a timestamp stays a timestamp, and one that states
      // no zone is marked so rather than tiled under an assigned one.
      const tile = element("button");
      tile.append(renderTime(report.date), `: ${metRate(report)}`);
      tile.setAttribute("type", "button");
      tile.dataset.reportDate = report.date;
      tile.addEventListener("click", () =>
        renderReport(report, detail, records),
      );
      calendar.append(tile);
    });
  root.append(calendar, detail);
}

// ---------------------------------------------------------------------------
// The built-in presentations (spec/presentation-contract-v0.md appendix A).
// Which one renders is decided by their manifests (builtin-manifests.ts),
// never here: each module only builds its model and draws it.
// ---------------------------------------------------------------------------

// A model built by canRender is kept for buildModel, per context, so a
// module never builds twice and canRender stays the one place that decides.
function memo<T>(
  build: (context: VerifiedBundleContext) => Promise<T>,
): (context: VerifiedBundleContext) => Promise<T> {
  const cache = new WeakMap<VerifiedBundleContext, Promise<T>>();
  return (context) => {
    let value = cache.get(context);
    if (value === undefined) {
      value = build(context);
      cache.set(context, value);
    }
    return value;
  };
}

const reportRowsOf = memo(buildReportRows);
// A Result root whose document is malformed makes buildResultRoot throw. The
// throw rejects renderEvidenceGraph before anything is written, exactly as
// before the registry: a malformed Result is refused, never rendered as one.
const resultRootOf = memo(async (context: VerifiedBundleContext) =>
  (await isResultRoot(context)) ? buildResultRoot(context) : undefined,
);
// EvidenceGraphError means "no evaluation-summary graph here" (the module
// declines and the fallback renders); any other error propagates.
const evidenceGraphOf = memo(async (context: VerifiedBundleContext) => {
  try {
    return await buildEvidenceGraph(context);
  } catch (err) {
    if (!(err instanceof EvidenceGraphError)) throw err;
    return undefined;
  }
});

function defined<T>(value: T | undefined, id: string): T {
  if (value === undefined)
    throw new Error(`${id}: buildModel called although canRender was false`);
  return value;
}

const reportRowsModule: PresentationModule<ReportRows> = {
  manifest: BUILTIN_MANIFEST_REPORT_ROWS,
  canRender: async (context) => (await reportRowsOf(context)) !== undefined,
  buildModel: async (context) =>
    defined(await reportRowsOf(context), BUILTIN_MANIFEST_REPORT_ROWS.id),
  render: (model, host) => renderReportRowsTable(model, host.L1),
};

/**
 * The host the page hands its module: the contract's host, plus the page's
 * wording pack when one was given (`RenderEvidenceGraphOptions.wording`),
 * which the contract-report module draws its words from.
 */
type WordedHost = PresentationHost & { readonly wording?: WordingPackInput };

/**
 * The context's verification with AAC's strict result in its `strict`
 * member, where this runtime reached one: the contract report's "Witnessed
 * by" line reads AAC's witness status from it (report-provenance.ts), the
 * same result the banner reads.
 */
function withStrict(context: VerifiedBundleContext): BundleVerificationResult {
  return context.strict === undefined
    ? context.verification
    : { ...context.verification, strict: context.strict };
}

interface ResultCardModel<Card> {
  readonly result: ResultRoot;
  readonly card: Card;
  readonly bundle: unknown;
  readonly verification: BundleVerificationResult;
}

const resultOutcomeReportModule: PresentationModule<
  ResultCardModel<OutcomeReportPresentation>
> = {
  manifest: BUILTIN_MANIFEST_RESULT_OUTCOME_REPORT,
  canRender: async (context) =>
    readOutcomeReportPresentation(context.bundle) !== undefined &&
    (await isResultRoot(context)),
  buildModel: async (context) => ({
    result: defined(
      await resultRootOf(context),
      BUILTIN_MANIFEST_RESULT_OUTCOME_REPORT.id,
    ),
    card: defined(
      readOutcomeReportPresentation(context.bundle),
      BUILTIN_MANIFEST_RESULT_OUTCOME_REPORT.id,
    ),
    bundle: context.bundle,
    verification: withStrict(context),
  }),
  render: async (model, host) => {
    // The banner and the verification page take the card's look.
    host.setChromeClass("oi");
    await renderContractReport(
      model.result,
      { grouping: "lines", options: model.card },
      model.bundle,
      model.verification,
      { L0: host.L0, L1: host.L1, L2: host.L2, depth: host.depth },
      (host as WordedHost).wording,
    );
  },
};

const resultComplianceModule: PresentationModule<
  ResultCardModel<CompliancePresentation>
> = {
  manifest: BUILTIN_MANIFEST_RESULT_COMPLIANCE,
  canRender: async (context) =>
    readCompliancePresentation(context.bundle) !== undefined &&
    (await isResultRoot(context)),
  buildModel: async (context) => ({
    result: defined(
      await resultRootOf(context),
      BUILTIN_MANIFEST_RESULT_COMPLIANCE.id,
    ),
    card: defined(
      readCompliancePresentation(context.bundle),
      BUILTIN_MANIFEST_RESULT_COMPLIANCE.id,
    ),
    bundle: context.bundle,
    verification: withStrict(context),
  }),
  render: async (model, host) => {
    // The card draws its own frame inside the page.
    host.setChromeClass(COMPLIANCE_CHROME);
    await renderContractReport(
      model.result,
      { grouping: "groups", presentation: model.card },
      model.bundle,
      model.verification,
      { L0: host.L0, L1: host.L1, L2: host.L2, depth: host.depth },
      (host as WordedHost).wording,
    );
  },
};

/**
 * The contract-report module's manifest (agent-action-capsule
 * spec/contract-report-v1.md section 4): the same match as
 * `aac.builtin.result-contract-report/v0`, which it replaces in this
 * registry. Registering both would be an ambiguity error (presentation
 * contract section 4.5). It carries no `executable.wording_sha256`: the pack
 * is a builder input, recorded as provenance.
 */
export const CONTRACT_REPORT_MANIFEST: PresentationManifest = Object.freeze({
  ...BUILTIN_MANIFEST_RESULT_CONTRACT_REPORT,
  id: "capsuleviewer.contract-report/v0",
}) as PresentationManifest;

interface ContractReportModel {
  readonly result: ResultRoot;
  /** The grouping the bundle's sealed data supports, or none: the generic Result page. */
  readonly input?: ContractReportInput;
  /** A grouping was supported, but the claims do not fit its card (see `claimsFitCard`). */
  readonly unfit?: true;
  readonly bundle: unknown;
  readonly verification: BundleVerificationResult;
}

/**
 * The data a contract report draws from, beside the empty
 * `contract-report/v1` block: an earlier kind's block, read by its own
 * reader (section 5), the outcome block first, as the built-in manifests'
 * precedence has it (the compliance card forbids `outcome-report/v1`).
 */
/** The grouping the contract-report module draws for `bundle`, or undefined when it draws the generic Result page. */
export function contractReportGroupingOf(
  bundle: unknown,
): ContractReportInput["grouping"] | undefined {
  return contractReportInput(bundle)?.grouping;
}

function contractReportInput(bundle: unknown): ContractReportInput | undefined {
  const options = readOutcomeReportPresentation(bundle);
  if (options !== undefined) return { grouping: "lines", options };
  const presentation = readCompliancePresentation(bundle);
  if (presentation !== undefined) return { grouping: "groups", presentation };
  return undefined;
}

/**
 * The contract-report module (contract-report.ts), resolved on
 * `contract-report/v1`. `canRender` is the generic Result page's, whatever
 * the pack or the number of contracts (section 4), so every Result root that
 * opts in reaches it. A Result that carries neither grouping's data draws
 * the generic Result page, exactly as the built-in it replaces.
 */
/**
 * Whether every claim has a place of its own on the outcome or EU card. The
 * cards lay a Result out one conversation by one requirement, so they can
 * show a claim only when it is a requirement claim whose id names its
 * conversation (`<conversation>::…`), no two claims share a conversation
 * and a requirement (a re-judged requirement), and all cite one contract.
 * The EU card also needs a grouped requirement (`<group>.<test>`); the
 * Outcomes card needs one of the terms' check and criterion pairs
 * (`readOutcomeReportTerms`), since agent-action-capsule's outcome model
 * leaves out any other. Any other Result is drawn as the generic Result
 * page, which lists every claim: a card never merges a claim into another
 * or leaves one out (contract-report/v1 section 2).
 */
function claimsFitCard(
  result: ResultRoot,
  grouping: ContractReportInput["grouping"],
): boolean {
  if (new Set(result.claims.map((c) => c.contractRef)).size > 1) return false;
  const placed =
    grouping === "lines"
      ? new Set(
          readOutcomeReportTerms(result).checks.flatMap((check) =>
            check.criteria.map((criterion) => `${check.id}.${criterion.id}`),
          ),
        )
      : undefined;
  const seen = new Set<string>();
  for (const claim of result.claims) {
    if (claim.type !== REQUIREMENT_CLAIM) return false;
    const sep = claim.id.indexOf("::");
    if (sep <= 0) return false;
    if (placed !== undefined && !placed.has(claim.requirementRef)) return false;
    if (grouping === "groups") {
      const dot = claim.requirementRef.indexOf(".");
      if (dot <= 0 || dot === claim.requirementRef.length - 1) return false;
    }
    const key = JSON.stringify([claim.id.slice(0, sep), claim.requirementRef]);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/** Which interpreters a contract-report render ran, by the bundle it drew: set when its model is built. */
const contractReportDrawn = new WeakMap<object, ContractReportInput | null>();

const contractReportModule: PresentationModule<ContractReportModel> = {
  manifest: CONTRACT_REPORT_MANIFEST,
  canRender: (context) => isResultRoot(context),
  buildModel: async (context) => {
    const result = defined(
      await resultRootOf(context),
      CONTRACT_REPORT_MANIFEST.id,
    );
    const supported = contractReportInput(context.bundle);
    const input =
      supported !== undefined && claimsFitCard(result, supported.grouping)
        ? supported
        : undefined;
    if (typeof context.bundle === "object" && context.bundle !== null)
      contractReportDrawn.set(context.bundle, input ?? null);
    return {
      result,
      ...(input === undefined ? {} : { input }),
      ...(supported !== undefined && input === undefined
        ? { unfit: true as const }
        : {}),
      bundle: context.bundle,
      verification: withStrict(context),
    };
  },
  render: async (model, host) => {
    if (model.input === undefined) {
      if (model.unfit === true) {
        const note = element("p", CARD_UNFIT_NOTE);
        note.dataset.notice = "card-unfit";
        host.L1.append(note);
      }
      renderResultPage(model.result, host.L1);
      return;
    }
    // The report's banner takes its frame's look (a callout at the top);
    // the outcome report's verification page takes its look too.
    host.setChromeClass(
      model.input.grouping === "lines" ? OUTCOME_CHROME : COMPLIANCE_CHROME,
    );
    await renderContractReport(
      model.result,
      model.input,
      model.bundle,
      model.verification,
      { L0: host.L0, L1: host.L1, L2: host.L2, depth: host.depth },
      (host as WordedHost).wording,
    );
  },
};

const resultModule: PresentationModule<ResultRoot> = {
  manifest: BUILTIN_MANIFEST_RESULT,
  canRender: (context) => isResultRoot(context),
  buildModel: async (context) =>
    defined(await resultRootOf(context), BUILTIN_MANIFEST_RESULT.id),
  render: (model, host) => renderResultPage(model, host.L1),
};

const evaluationSummaryGraphModule: PresentationModule<{
  readonly graph: EvidenceGraph;
  readonly records: unknown[];
}> = {
  manifest: BUILTIN_MANIFEST_EVALUATION_SUMMARY_GRAPH,
  canRender: async (context) => (await evidenceGraphOf(context)) !== undefined,
  buildModel: async (context) => {
    const records = object(context.bundle).records;
    return {
      graph: defined(
        await evidenceGraphOf(context),
        BUILTIN_MANIFEST_EVALUATION_SUMMARY_GRAPH.id,
      ),
      records: Array.isArray(records) ? records : [],
    };
  },
  render: (model, host) => renderGraph(model.graph, host.L1, model.records),
};

// The evaluation-summary/v1 aggregate is optional: a verified bundle whose
// root is none of the other families (a deal root, for example) renders
// without the aggregate panel and says so, instead of rendering nothing.
const noAggregateModule: PresentationModule<null> = {
  manifest: BUILTIN_MANIFEST_NO_AGGREGATE,
  canRender: () => true,
  buildModel: () => null,
  render: (_model, host) => {
    const note = document.createElement("p");
    note.setAttribute("data-notice", "no-aggregate");
    note.textContent =
      "This bundle carries no evaluation summary, so there is no aggregate view. The records and their verification are below.";
    host.L1.append(note);
  },
};

// The extension interpreters each built-in module runs when it renders: a
// Result page reads the book payload extensions, and each card reads its own
// block. The rows table, the graph and the no-aggregate note read none.
const BUILTIN_MODULE_INTERPRETERS: Readonly<
  Record<string, readonly PageInterpreterId[]>
> = Object.freeze({
  [BUILTIN_MANIFEST_RESULT_OUTCOME_REPORT.id]: [
    "result-root",
    "outcome-report-card",
  ],
  [BUILTIN_MANIFEST_RESULT_COMPLIANCE.id]: ["result-root", "compliance-card"],
  [BUILTIN_MANIFEST_RESULT.id]: ["result-root"],
  [BUILTIN_MANIFEST_COMPOSED.id]: ["aac.builtin.composed/v0"],
});

/**
 * The extension interpreters a module ran on `bundle`. The contract-report
 * module applies the `contract-report/v1` block it resolved on
 * (contract-report/v1 section 4) and runs the Result reader, plus the one
 * earlier kind's reader whose data it drew (contractReportInput), never both:
 * until their removal, earlier blocks are read by their own readers (section 5).
 */
function moduleInterpreters(
  id: string,
  bundle: unknown,
): readonly PageInterpreterId[] {
  if (id === CONTRACT_REPORT_MANIFEST.id) {
    const drawn =
      typeof bundle === "object" && bundle !== null
        ? contractReportDrawn.get(bundle)
        : undefined;
    const input =
      drawn === undefined ? contractReportInput(bundle) : (drawn ?? undefined);
    return input === undefined
      ? ["contract-report", "result-root"]
      : [
          "contract-report",
          "result-root",
          input.grouping === "lines"
            ? "outcome-report-card"
            : "compliance-card",
        ];
  }
  return BUILTIN_MODULE_INTERPRETERS[id] ?? [];
}

/**
 * The seven built-in modules, registered by default: agent-action-capsule's
 * seven built-in shapes, with the contract-report module in place of
 * `aac.builtin.result-contract-report/v0` (contract-report/v1 section 4).
 */
export const BUILTIN_PRESENTATIONS: readonly PresentationModule[] =
  Object.freeze([
    reportRowsModule,
    contractReportModule,
    resultOutcomeReportModule,
    resultComplianceModule,
    resultModule,
    evaluationSummaryGraphModule,
    noAggregateModule,
  ] as PresentationModule[]);

/** A fresh registry holding the seven built-in modules. */
export function createPresentationRegistry(): PresentationRegistry {
  const registry = new PresentationRegistry();
  for (const module of BUILTIN_PRESENTATIONS) registry.register(module);
  return registry;
}

const defaultRegistry = createPresentationRegistry();

/**
 * The built-in sections: modules resolved after the page module, in their
 * own registry, and rendered after its content. One today, the composition
 * section; see BUILTIN_MANIFEST_COMPOSED for why it is not a page module.
 */
export const BUILTIN_SECTIONS: readonly PresentationModule[] = Object.freeze([
  composedSectionModule,
] as PresentationModule[]);

/**
 * A fresh section registry holding the built-in sections. The section
 * registry applies the presentation ABI as the page registry does: under a
 * `runtime` that refuses a section, the section is registered as refused,
 * never drawn, and every page it matches names it.
 */
export function createSectionRegistry(
  runtime?: PresentationRuntime,
): PresentationRegistry {
  const registry = new PresentationRegistry(runtime);
  for (const module of BUILTIN_SECTIONS) registry.register(module);
  return registry;
}

const defaultSections = createSectionRegistry();

/**
 * Register a module with the registry `renderEvidenceGraph` uses by default
 * (the module-slot entry point). Throws when its manifest is malformed,
 * dead, a duplicate, or co-matchable with a registered module of its tier.
 * A module whose `presentation_api` this runtime does not implement (or
 * whose `runtime_min` it does not meet) is registered as refused: it is
 * never selected, and every page it would have rendered names it.
 */
export function registerPresentation(
  module: PresentationModule,
): PresentationRegistration {
  return defaultRegistry.register(module);
}

/** Resolve over the default registry (spec section 4.3). */
export function resolvePresentation(
  context: VerifiedBundleContext,
  audience: string = DEFAULT_AUDIENCE,
  format: PresentationFormat = DEFAULT_FORMAT,
): Promise<PresentationResolution> {
  return defaultRegistry.resolve(context, audience, format);
}

/** `"*"`: no particular audience, so only modules serving every audience. */
const DEFAULT_AUDIENCE = "*";
const DEFAULT_FORMAT: PresentationFormat = "html";

export interface RenderEvidenceGraphOptions {
  /** Resolves the presentation; the default registry when omitted. */
  readonly registry?: PresentationResolver;
  /** Resolves the section after the page; the built-in sections when omitted. */
  readonly sections?: PresentationResolver;
  readonly audience?: string;
  readonly format?: PresentationFormat;
  /** The opening depth handed to the module's host; "L0" when omitted. */
  readonly depth?: PresentationDepth;
  /**
   * The wording pack the page was built with, carried so the page holds
   * the exact words it was built with (presentation only; contract I3).
   * The contract-report module (the outcome and EU AI Act reports) draws
   * its words from it, over its default pack; the other built-in modules
   * use the core's own labels and do not read it.
   */
  readonly wording?: WordingPackInput;
  /**
   * The exact command that checks this file outside the page, shown when
   * this viewer cannot verify it (see {@link renderUnableToVerify}).
   */
  readonly verifyCommand?: string;
  /**
   * The host's own text for running a full verifier (for example its
   * command line), shown as plain text under the verification page's
   * not-checked list, after the core's neutral pointer. Presentation only:
   * it changes no list and no result. Omitted, only the pointer is shown.
   */
  readonly verifierHint?: string;
}

/**
 * True when the rendered page module checked the producer signature of the
 * records it cites as signers: the built-in Result page, on a Close (or a
 * record linking to it) that carries a `key_id` (result-root.ts `signerOf`).
 */
function citesCheckedSigners(
  selected: { module: PresentationModule; model: unknown } | undefined,
): boolean {
  if (selected === undefined || selected.module !== resultModule) return false;
  return (selected.model as ResultRoot).claims.some(
    (claim) =>
      claim.close !== undefined &&
      (claim.close.keyId !== undefined ||
        [...claim.close.links, ...claim.close.ignored].some(
          (link) => link.keyId !== undefined,
        )),
  );
}

const OUTCOME_CHROME = "oi";
const COMPLIANCE_CHROME = "cc";

function presentationServices(
  context: VerifiedBundleContext,
): PresentationServices {
  return Object.freeze({
    details(summary: string, open = false): HTMLDetailsElement {
      const details = document.createElement("details");
      if (open) details.open = true;
      details.append(element("summary", summary));
      return details;
    },
    badge(state: PresentationBadgeState): HTMLElement {
      const badge = element("span", state);
      badge.dataset.badge = state;
      return badge;
    },
    disclosure(
      capsuleId: string,
      member: "agent_input" | "agent_output",
    ): DisclosureState {
      return disclosureOf(context, capsuleId, member).state;
    },
  });
}

// The refusal for a verified bundle whose presentation could not be resolved
// (an ambiguity) or failed (a module threw while rendering): the core's
// words, no module content, the verification page below (contract I1).
const PRESENTATION_REFUSALS = {
  "presentation-unresolved":
    "The presentation for this bundle could not be resolved. No presentation content is shown; the verification page below lists the checks.",
  "presentation-failed":
    "The presentation for this bundle failed. No presentation content is shown; the verification page below lists the checks.",
} as const;

/**
 * Render a bundle into `root`. `countersigners` is the stamp's countersigner
 * source: the only way a verified, independent countersignature gets a name.
 * Omitted, the context's own source is used (see
 * `buildVerifiedBundleContext`); with neither, every independent signer
 * renders as unlisted. The emitted report.html shell passes a bare bundle
 * and no list; a host page that holds a list passes it here or builds the
 * context with it (see `pinnedCountersignerSource` to load one against a
 * pinned digest).
 *
 * Given a bundle, it is verified once here; given a context, its one
 * verification run is reused. The page shape comes from the presentation
 * registry: `resolve(context, audience, format)` picks one module by its
 * manifest, and the page is the header, the banner, that module's content
 * and the verification page.
 */
export async function renderEvidenceGraph(
  context: VerifiedBundleContext,
  root: HTMLElement,
  countersigners?: CountersignerSource,
  options?: RenderEvidenceGraphOptions,
): Promise<void>;
export async function renderEvidenceGraph(
  bundle: unknown,
  root: HTMLElement,
  countersigners?: CountersignerSource,
  options?: RenderEvidenceGraphOptions,
): Promise<void>;
export async function renderEvidenceGraph(
  input: unknown,
  root: HTMLElement,
  countersigners?: CountersignerSource,
  options: RenderEvidenceGraphOptions = {},
): Promise<void> {
  // With no SHA-256 nothing can be verified: say so, never "failed".
  if (!isVerifiedBundleContext(input) && digestCapability() === "none") {
    renderUnableToVerify(
      root,
      options.verifyCommand === undefined
        ? {}
        : { verifyCommand: options.verifyCommand },
    );
    return;
  }
  if (isVerifiedBundleContext(input))
    return renderVerifiedContext(
      countersigners === undefined
        ? input
        : withCountersigners(input, countersigners),
      root,
      options,
    );
  // Verify first. Until the verification result is in hand the page shows
  // `checking` and nothing else, and no module is consulted for a bundle
  // that did not verify. A render that rejects while its own `checking` is
  // still shown puts back what `root` held before the first of the renders
  // still checking on it began, so it still draws nothing. When another
  // render on the same root is still checking, its `checking` is put back
  // instead; another render's `checking` that has ended never is.
  const group = checkingRenders.get(root) ?? {
    before: [...root.childNodes],
    active: new Set<HTMLElement>(),
  };
  checkingRenders.set(root, group);
  const { active } = group;
  const checking = renderChecking(root);
  active.add(checking);
  try {
    await renderVerifiedContext(
      await buildVerifiedBundleContext(input, {
        ...(countersigners === undefined ? {} : { countersigners }),
      }),
      root,
      options,
    );
  } catch (err) {
    if (checking.parentNode === root) {
      const other = [...active].find((node) => node !== checking);
      if (other !== undefined) root.replaceChildren(other);
      else root.replaceChildren(...group.before);
    }
    throw err;
  } finally {
    active.delete(checking);
    if (active.size === 0) checkingRenders.delete(root);
  }
}

// The side margins are not in FRAME_LOOK: the shell centres the page root and
// the bar with `auto` margins, and a computed `auto` margin is its used
// width, which moves by half a classic scrollbar when a module's content
// makes the page scroll. They are compared to within SIDE_MARGIN_SLACK
// instead, a constant no module's stylesheet can change: a module that moves
// the banner by more is still caught. It assumes a classic scrollbar of up to
// 18 CSS px (a native 17px at zoom 100%); at a very low page zoom the
// scrollbar is wider in CSS px, and an honest module that makes the page
// scroll is then discarded, which fails closed.
const SIDE_MARGINS = ["margin-left", "margin-right"] as const;
const SIDE_MARGIN_SLACK = 9;
// The paddings and border widths: a module that widens them pushes the words
// inside out of view.
const BOX_EDGES = ["top", "right", "bottom", "left"].flatMap((side) => [
  `padding-${side}`,
  `border-${side}-width`,
]);
// On the root's ancestors, which in the embedded format are the host page's
// own elements, the offsets, paddings, border widths and a transform's
// translation are compared to within the same slack: a host that places its
// widget with `left: 50%`, `translateX(-50%)` or a percentage margin or
// padding resolves them to used px that move with the scrollbar too. A
// positioned element's `top` and `left` resolve to where it is, whichever of
// its offsets set that, so they stand for `right` and `bottom`, whose used px
// follow the height of the module's content and are not compared. A module can
// therefore still shift the banner by up to SIDE_MARGIN_SLACK per offset of
// each ancestor; `position` and a transform that was `none` are compared
// exactly. Those shifts add up, so where the bar sits in the document is
// bounded too: it may not rise by more than SIDE_MARGIN_SLACK, nor move
// sideways by more than one assumed classic scrollbar, twice
// SIDE_MARGIN_SLACK (a widget a host floats right moves by all of it).
// Downward is left to the per-ancestor caps, since a scrollbar only narrows
// the page and so pushes reflowing host content above the widget down; the
// caps keep a module from pushing the banner off the first screen, under
// fixed content of its own, through an ancestor. A host that centres a
// growing widget vertically lifts the banner by itself; an honest module there
// is discarded, which fails closed.
const ANCESTOR_OFFSETS = [
  "top",
  "left",
  "margin-top",
  "margin-bottom",
  ...BOX_EDGES,
] as const;
const ANCESTOR_UNCOMPARED = ["right", "bottom"];
type FrameLook = {
  readonly look: string;
  readonly offsets: readonly number[];
  readonly place: readonly [number, number];
  /** How far below the bar's top the core strip starts, in viewport px; 0 with no strip. */
  readonly below: number;
  readonly readable: "yes" | "no" | "unseen";
  readonly clips: readonly {
    readonly width: number;
    readonly height: number;
    readonly bar: number;
  }[];
};
// `a` is the frame now, `b` as it was before the module rendered. Words a
// reader sees where the page is now must not be covered or clipped (see
// readable), unless they already were before the module rendered: a host
// that covered or clipped the widget itself is no module's doing.
const sameLook = (a: FrameLook, b: FrameLook): boolean =>
  a.look === b.look &&
  (a.readable !== "no" || b.readable === "no") &&
  a.clips.length === b.clips.length &&
  a.clips.every(
    (box, i) =>
      box.width >= b.clips[i]!.width - 2 * SIDE_MARGIN_SLACK &&
      box.height >=
        b.clips[i]!.height - Math.max(0, box.bar - b.clips[i]!.bar) - 1,
  ) &&
  Math.abs(a.place[0] - b.place[0]) <= 2 * SIDE_MARGIN_SLACK &&
  Math.abs(a.below - b.below) <= SIDE_MARGIN_SLACK &&
  a.place[1] - b.place[1] >= -SIDE_MARGIN_SLACK &&
  a.offsets.length === b.offsets.length &&
  a.offsets.every((m, i) => Math.abs(m - b.offsets[i]!) <= SIDE_MARGIN_SLACK);

// The computed properties of the banner frame a module's stylesheet must not
// change (see looks in renderVerifiedContext): what decides whether the
// banner and its details line are shown, where, and whether their words can
// be read. Layout sizes are left out, since a module's content can change
// them without touching the frame.
const FRAME_LOOK = [
  "display",
  "visibility",
  "opacity",
  "color",
  "background-color",
  "background-image",
  "font-size",
  "text-indent",
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "transform",
  "scale",
  "translate",
  "rotate",
  "zoom",
  "margin-top",
  "margin-bottom",
  ...BOX_EDGES,
  "font-family",
  "-webkit-text-fill-color",
  "clip",
  "clip-path",
  "mask-image",
  "-webkit-mask-image",
  "filter",
  "mix-blend-mode",
  "overflow",
  "max-height",
  "max-width",
  "z-index",
  "content-visibility",
  "contain",
] as const;
const ANCESTOR_LOOK = FRAME_LOOK.filter(
  (name) =>
    name !== "transform" &&
    !(ANCESTOR_OFFSETS as readonly string[]).includes(name) &&
    !ANCESTOR_UNCOMPARED.includes(name),
);

// A computed transform split into its linear part, compared exactly, and its
// translation in px, compared within the slack. Anything else (`none`) is
// compared whole.
function splitTransform(value: string): [string, number[]] {
  const m = /^matrix(3d)?\((.*)\)$/.exec(value);
  if (m === null) return [value, []];
  const n = m[2]!.split(",").map(Number);
  const moves = m[1] === undefined ? [4, 5] : [12, 13, 14];
  return [
    `matrix${m[1] ?? ""}(${n.filter((_, i) => !moves.includes(i)).join(",")})`,
    moves.map((i) => n[i]!),
  ];
}

// Whether a reader sees every word of each part where the page is now: for
// each character other than white space whose box is in the viewport, the
// elements a hit test finds at the box's centre (`elementsFromPoint`) reach
// the character's own element before anything of the root's or in <head>
// that paints over it (see seeThrough): a module's content, or a module's
// rule laying out <head> or <style>. Nothing is scrolled to look. A
// character clipped where the page is now (a hit on an element around it
// first) is passed over: a reader may have scrolled it out of a scrolling
// host, and a module that shrinks a clipping box is caught by its size (see
// clips in looks). The host's other elements are passed over too, so a
// host's own fixed header a reader scrolls under is no module's doing. A set
// of parts none of whose words is seen is "unseen", as is any off a
// laid-out document (jsdom). For the test's duration a
// constructed stylesheet in a layer, which adds no element a module's rule
// could show, makes everything hit-testable, so an overlay with
// `pointer-events: none` is still found, even with an unlayered `!important`;
// one set important inline, or in the module's own layer, is not. Paint the
// browser does not hit-test (an outline, a shadow, a reflection) is not
// found either; see #125 for why this check targets a module's mistakes and
// not a module that sets out to hide the banner.
function readable(
  parts: readonly Element[],
  root: HTMLElement,
): "yes" | "no" | "unseen" {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (view === null || view.navigator.userAgent.includes("jsdom"))
    return "unseen";
  const tree = root.getRootNode() as Document | ShadowRoot;
  const scope = tree === doc ? [doc] : [doc, tree];
  const sheet = new view.CSSStyleSheet();
  sheet.replaceSync(
    "@layer cv-hit-test{*,*::before,*::after{pointer-events:auto!important}}",
  );
  for (const at of scope)
    at.adoptedStyleSheets = [...at.adoptedStyleSheets, sheet];
  // The viewport less its scrollbars: a point under a scrollbar hits nothing.
  const port = doc.scrollingElement ?? doc.documentElement;
  const [width, height] = [port.clientWidth, port.clientHeight];
  const range = doc.createRange();
  let seen = 0;
  try {
    for (const part of parts) {
      const text = doc.createTreeWalker(part, view.NodeFilter.SHOW_TEXT);
      for (let node = text.nextNode(); node !== null; node = text.nextNode()) {
        const own = node.parentElement!;
        let i = 0;
        for (const char of node.textContent ?? "") {
          range.setStart(node, i);
          i += char.length;
          range.setEnd(node, i);
          if (/\s/.test(char)) continue;
          for (const box of range.getClientRects()) {
            const x = box.left + box.width / 2;
            const y = box.top + box.height / 2;
            if (box.width <= 0 || box.height <= 0) continue;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            let shown = false;
            for (const hit of tree.elementsFromPoint(x, y)) {
              if (own.contains(hit)) {
                shown = true;
                break;
              }
              // Clipped where it is now, by the host or inside the banner:
              // see clips in looks.
              if (hit.contains(own)) break;
              if (
                (root.contains(hit) || doc.head?.contains(hit) === true) &&
                !seeThrough(hit, view)
              )
                return "no";
            }
            if (shown) seen++;
          }
        }
      }
    }
  } finally {
    for (const at of scope)
      at.adoptedStyleSheets = at.adoptedStyleSheets.filter(
        (other) => other !== sheet,
      );
  }
  return seen > 0 ? "yes" : "unseen";
}

// Whether a hit-tested element paints nothing of its own over what is under
// it: it is transparent (opacity 0, on it or an ancestor), or it has no
// background, border, shadow, backdrop filter, text of its own or generated
// content and is not replaced content, like a module's empty full-page
// container for toasts. A child that does paint is hit-tested on its own.
function seeThrough(element: Element, view: Window): boolean {
  for (let at: Element | null = element; at !== null; at = at.parentElement)
    if (view.getComputedStyle(at).opacity === "0") return true;
  const style = view.getComputedStyle(element);
  const clear = (color: string): boolean =>
    color === "transparent" || /^rgba\(.*,\s*0\)$/.test(color);
  return (
    clear(style.backgroundColor) &&
    style.backgroundImage === "none" &&
    style.boxShadow === "none" &&
    style.backdropFilter === "none" &&
    ["top", "right", "bottom", "left"].every(
      (side) => style.getPropertyValue(`border-${side}-width`) === "0px",
    ) &&
    !REPLACED.has(element.localName) &&
    ![...element.childNodes].some(
      (child) =>
        child.nodeType === 3 && (child.textContent ?? "").trim() !== "",
    ) &&
    ["::before", "::after"].every((pseudo) =>
      ["none", "normal"].includes(
        view.getComputedStyle(element, pseudo).content,
      ),
    )
  );
}
const REPLACED = new Set([
  "img",
  "video",
  "canvas",
  "iframe",
  "object",
  "embed",
  "svg",
  "input",
  "textarea",
  "select",
  "button",
  "meter",
  "progress",
]);

// The linear part of the transforms applied to `element`'s content in the
// viewport: its own and every ancestor's `transform`, `rotate`, `scale` and
// `zoom`. A scroll offset is in its container's own px; this maps it into the
// viewport px the bar's box is in. Every one of these properties is compared
// exactly on the root's ancestors (see looks), so no module can change it.
function linearTransform(element: Element, view: Window): DOMMatrix {
  let matrix = new DOMMatrix();
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    const style = view.getComputedStyle(at);
    const zoom = Number.parseFloat(style.zoom) || 1;
    const rotate = style.rotate === "none" ? "" : rotateFunction(style.rotate);
    const scale =
      style.scale === "none" ? "" : `scale3d(${scaleArgs(style.scale)})`;
    const transform = style.transform === "none" ? "" : style.transform;
    const local = new DOMMatrix(
      `${rotate} ${scale} ${transform}`.trim() || "none",
    ).scale(zoom, zoom);
    local.m41 = local.m42 = local.m43 = 0;
    matrix = local.multiply(matrix);
  }
  return matrix;
}
function rotateFunction(value: string): string {
  const parts = value.split(/\s+/);
  if (parts.length === 1) return `rotate(${value})`;
  const angle = parts.pop()!;
  const axis =
    parts.length === 1
      ? ({ x: "1 0 0", y: "0 1 0", z: "0 0 1" }[parts[0]!] ?? parts[0]!)
      : parts.join(" ");
  return `rotate3d(${axis.split(" ").join(",")},${angle})`;
}
function scaleArgs(value: string): string {
  const [x, y = x, z = "1"] = value.split(/\s+/);
  return `${x},${y},${z}`;
}

// Whether a box is the containing block of a `position: fixed` box inside
// it, in place of the viewport.
function holdsFixed(style: CSSStyleDeclaration): boolean {
  return (
    style.transform !== "none" ||
    style.translate !== "none" ||
    style.rotate !== "none" ||
    style.scale !== "none" ||
    style.perspective !== "none" ||
    style.filter !== "none" ||
    style.backdropFilter !== "none" ||
    /paint|layout|strict|content/.test(style.contain) ||
    /transform|perspective|filter/.test(style.willChange) ||
    style.containerType !== "normal" ||
    style.contentVisibility === "auto"
  );
}

// Resolves after the next frame and then the timers already due. A page
// that is not shown draws no frames, so a timer stands in for the frame
// there.
function settled(view: Window): Promise<void> {
  return new Promise((done) => {
    let waiting = true;
    const next = (): void => {
      if (!waiting) return;
      waiting = false;
      view.setTimeout(done, 0);
    };
    view.requestAnimationFrame(next);
    view.setTimeout(next, SETTLE_MS);
  });
}
// The longest the settle waits for a frame.
const SETTLE_MS = 100;

// By root, the renders still verifying on it: their `checking` bars, and
// what the root held before the first of them began.
const checkingRenders = new WeakMap<
  HTMLElement,
  { readonly before: readonly ChildNode[]; readonly active: Set<HTMLElement> }
>();

async function renderVerifiedContext(
  context: VerifiedBundleContext,
  root: HTMLElement,
  options: RenderEvidenceGraphOptions,
): Promise<void> {
  const { bundle, verification } = context;
  const verified = bundleVerified(verification);
  const registry = options.registry ?? defaultRegistry;
  let refusal: keyof typeof PRESENTATION_REFUSALS | undefined;
  let selected: { module: PresentationModule; model: unknown } | undefined;
  let resolution: PresentationResolution;
  try {
    resolution = await registry.resolve(
      context,
      options.audience ?? DEFAULT_AUDIENCE,
      options.format ?? DEFAULT_FORMAT,
    );
  } catch (err) {
    if (!(err instanceof PresentationAmbiguityError)) throw err;
    resolution = { kind: "no-presentation", refused: [] };
    refusal = "presentation-unresolved";
  }
  // A module this runtime refused (spec section 3.2) is never silent: the
  // page root names every one that matched, page and section alike, and the
  // verification page shows the contract's words in the extension rows
  // (presentationRefusalRow) or, for a module requiring no extension, in a
  // line after them (presentationRefusalLine).
  const refused: PresentationRefusal[] =
    resolution.kind === "refusal" ? [] : [...resolution.refused];

  if (resolution.kind === "refusal" && verified)
    throw new Error("resolver refused a bundle that verified");
  if (resolution.kind === "module" && !verified)
    throw new Error("resolver selected a module for an unverified bundle");
  // A module's model is built before the page is written, so a model that
  // cannot be built rejects with nothing drawn (as it always has).
  if (resolution.kind === "module")
    selected = {
      module: resolution.module,
      model: await resolution.module.buildModel(context),
    };
  // The section registry is resolved the same way, after the page and only
  // for a verified bundle whose page resolved: a section never stands in for
  // a refusal (contract I1), and its ambiguity is the page's refusal too.
  let section: { module: PresentationModule; model: unknown } | undefined;
  if (verified && refusal === undefined) {
    let sectionResolution: PresentationResolution;
    try {
      sectionResolution = await (options.sections ?? defaultSections).resolve(
        context,
        options.audience ?? DEFAULT_AUDIENCE,
        options.format ?? DEFAULT_FORMAT,
      );
    } catch (err) {
      if (!(err instanceof PresentationAmbiguityError)) throw err;
      sectionResolution = { kind: "no-presentation", refused: [] };
      selected = undefined;
      refusal = "presentation-unresolved";
    }
    // A refused section is named like a refused page module, never skipped.
    if (sectionResolution.kind !== "refusal")
      refused.push(...sectionResolution.refused);
    if (sectionResolution.kind === "module")
      section = {
        module: sectionResolution.module,
        model: await sectionResolution.module.buildModel(context),
      };
  }
  const stamps = await classifyCountersignatures(
    context.countersignatures.map((entry) => entry.value),
    verification.bundleDigest,
    declaredProducerKeys(bundle),
    context.countersigners,
  );
  const bannerModel = verificationBanner(context, stamps);
  const records = object(bundle).records;
  const coverage = {
    uncheckpointed: bannerModel.uncheckpointed,
    total: Array.isArray(records) ? records.length : 0,
  };

  // The core's strip opens L0 on a verified bundle whose root is an
  // Evidence Result (core-strip.ts; presentation contract section 9.1). Its
  // words are the contract report's, in the grouping the module draws and
  // the page's wording pack; a page with no Result draws no strip.
  let strip: CoreStripModel | undefined;
  if (verified) {
    const result = await resultRootOf(context);
    if (result !== undefined) {
      const grouping = contractReportGroupingOf(bundle) ?? "lines";
      strip = await coreStripModel(
        result,
        await contractReportWords(grouping, options.wording, {
          singleContract: citesOneContract(result),
        }),
      );
    }
  }

  // The host's three regions, in order after the banner and the header
  // (presentation contract section 9.1). L2 opens with the core's
  // verification section, drawn last but placed first; a module's L2 detail
  // follows it.
  const depth = options.depth ?? "L0";
  const region = (name: string): HTMLElement => {
    const node = document.createElement("div");
    node.dataset.region = name;
    return node;
  };
  let regions = {
    L0: root,
    L1: root,
    L2: root,
    core: root,
  };
  let bar!: HTMLElement;
  let stripNode: HTMLElement | undefined;
  const drawFrame = (): void => {
    root.replaceChildren();
    root.classList.remove("cv-shell-chrome");
    renderPresentationHeader(root, bundle);
    bar = renderVerificationBanner(root, bannerModel, coverage);
    const L2 = region("L2");
    const core = region("L2-core");
    const L2module = region("L2-module");
    L2.append(core, L2module);
    // On a failed bundle L0 and L1 are not created (presentation contract
    // section 9.1, I1): no module renders, and a notice goes before L2.
    if (verified) {
      regions = { L0: region("L0"), L1: region("L1"), L2: L2module, core };
      stripNode = strip === undefined ? undefined : renderCoreStrip(strip);
      if (stripNode !== undefined) regions.L0.append(stripNode);
      root.append(regions.L0, regions.L1, L2);
    } else {
      regions = { L0: root, L1: root, L2: L2module, core };
      root.append(L2);
    }
  };
  /** A page-level notice: first in L1, or before L2 on a failed bundle. */
  const notice = (note: HTMLElement): void => {
    if (verified) regions.L1.append(note);
    else root.insertBefore(note, regions.core.parentElement);
  };
  drawFrame();
  // The banner and its details line are the core's (contract sections 3 and
  // 6.2). A module that, while it renders, changes their words, structure or
  // attributes, hides or moves them, puts anything before them but the
  // core's own header, or draws a second banner, is discarded for the
  // refusal like one that throws. The bar's summary line is empty until the
  // verification section fills it, after every module has rendered. These
  // checks catch a module's mistakes; they do not hold against module code
  // written to hide the banner, which the builder's pin governs (#125).
  const snapshot = (parts: readonly Element[]): string =>
    JSON.stringify(parts.map((part) => part.outerHTML));
  // How the frame looks: the computed properties that decide whether its
  // words can be read, for every element of each part, the root and the
  // root's ancestors, with the root's chrome class as given (the one
  // restyling a module may ask for, setChromeClass). A stylesheet a module adds that changes any of
  // them, hiding the banner included, is caught by comparing with this as it
  // was before the module rendered, so a host that was already hidden (an
  // inactive tab) is no module's doing. Empty off a document, where no
  // styles apply; the static builder renders on a root in its document for
  // this reason.
  const looks = (parts: readonly Element[], chromed: boolean): FrameLook => {
    const view = root.ownerDocument.defaultView;
    if (!root.isConnected || view === null)
      return {
        look: "",
        offsets: [],
        place: [0, 0],
        below: 0,
        readable: "unseen",
        clips: [],
      };
    const had = root.classList.contains("cv-shell-chrome");
    root.classList.toggle("cv-shell-chrome", chromed);
    // The root's ancestors too, up to <html>: a transform, opacity, filter,
    // clip or offset on any of them scales, hides or moves the banner while
    // every value on the banner itself stays the same.
    const ancestors: Element[] = [];
    for (let at = root.parentElement; at !== null; at = at.parentElement)
      ancestors.push(at);
    // The L0 region's own box too, but not what a module writes in it: a
    // module that hides or moves the region hides the strip.
    const elements = [
      ...ancestors,
      root,
      ...(stripNode === undefined ? [] : [regions.L0]),
      ...parts.flatMap((part) => [part, ...part.querySelectorAll("*")]),
    ];
    // A browser also computes each element's ::before and ::after, whose
    // content can add words to the banner; jsdom computes no pseudo-element.
    const jsdom = view.navigator.userAgent.includes("jsdom");
    const pseudos = jsdom ? [null] : [null, "::before", "::after"];
    const offsets: number[] = [];
    const seen = JSON.stringify(
      elements.flatMap((element, at) =>
        pseudos.map((pseudo) => {
          const style = view.getComputedStyle(element, pseudo);
          const ancestor = at < ancestors.length;
          const [transform, moves] = ancestor
            ? splitTransform(style.getPropertyValue("transform"))
            : [undefined, []];
          offsets.push(...moves);
          return [
            ...(ancestor ? ANCESTOR_LOOK : FRAME_LOOK).map((name) =>
              style.getPropertyValue(name),
            ),
            ...(transform === undefined ? [] : [transform]),
            ...[...SIDE_MARGINS, ...(ancestor ? ANCESTOR_OFFSETS : [])].flatMap(
              (name) => {
                const value = style.getPropertyValue(name);
                const px = Number.parseFloat(value);
                offsets.push(Number.isNaN(px) ? 0 : px);
                return Number.isNaN(px) ? [value] : [];
              },
            ),
            ...(pseudo === null ? [] : [style.getPropertyValue("content")]),
          ];
        }),
      ),
    );
    // Where the bar sits in the document: its box plus every scroll offset
    // above it, so a reader's scrolling moves nothing. A scroll offset is in
    // its container's own px, mapped into viewport px by the transforms on
    // and above the container (linearTransform), which no module can
    // change; the viewport's own is in viewport px already.
    const box = parts[0]!.getBoundingClientRect();
    const place: [number, number] = [box.left, box.top];
    // A box with `position: fixed` stays put while the boxes between it and
    // its containing block scroll (the viewport, or the nearest ancestor that
    // makes one for it), so their offsets are left out.
    let fixed = false;
    for (let at = parts[0]!.parentElement; at !== null; at = at.parentElement) {
      const style = jsdom ? undefined : view.getComputedStyle(at);
      if (fixed && style !== undefined && holdsFixed(style)) fixed = false;
      if (!fixed && (at.scrollLeft !== 0 || at.scrollTop !== 0)) {
        const move =
          at === root.ownerDocument.scrollingElement || jsdom
            ? { x: at.scrollLeft, y: at.scrollTop }
            : linearTransform(at, view).transformPoint({
                x: at.scrollLeft,
                y: at.scrollTop,
              });
        place[0] += move.x;
        place[1] += move.y;
      }
      if (style?.position === "fixed") fixed = true;
    }
    // Every word of the banner and the strip: a module's content laid over
    // the strip is caught as one laid over the banner is.
    const words = readable(parts, root);
    // The strip stays where the banner puts it: nothing a module draws, laid
    // out ahead of it (a flex or grid `order`, a float), pushes it down.
    const strip = parts.length > 0 ? parts[parts.length - 1]! : undefined;
    const below =
      jsdom || strip === undefined || strip !== stripNode
        ? 0
        : strip.getBoundingClientRect().top - box.top;
    // The visible size of every box that clips the banner, from <html> down
    // to the banner's own elements: a module that shrinks one (a scrolling
    // host's height set to 0) clips the banner wherever the reader has
    // scrolled. Which boxes clip is compared exactly (`overflow` and
    // `contain` are in the looks). A width may shrink by one assumed classic
    // scrollbar, as when the page or the box itself grows one, and a height
    // by as much as the box's own scrollbar across its bottom grew. The size is
    // mapped into viewport px through the transforms on and above the box,
    // which no module can change.
    const clips = jsdom
      ? []
      : elements.flatMap((element) => {
          const style = view.getComputedStyle(element);
          if (
            style.overflowX === "visible" &&
            style.overflowY === "visible" &&
            !/paint|strict|content/.test(style.contain) &&
            style.contentVisibility !== "auto"
          )
            return [];
          // In viewport px, as the slack is: under a page zoom a scrollbar
          // takes more of a box's own px.
          const matrix = linearTransform(element, view);
          const across = matrix.transformPoint({ x: element.clientWidth });
          const down = matrix.transformPoint({ y: element.clientHeight });
          // The scrollbar across the box's bottom, in viewport px: the box's
          // height may shrink by only as much as that grows. A page's own
          // scrollbar leaves any other height alone. The viewport's is what
          // its height lacks of the window's.
          // The viewport's size is in viewport px already, as its scroll
          // offsets are.
          const viewport = element === root.ownerDocument.scrollingElement;
          const width = viewport
            ? element.clientWidth
            : Math.hypot(across.x, across.y);
          const height = viewport
            ? element.clientHeight
            : Math.hypot(down.x, down.y);
          const own = matrix.transformPoint({
            y:
              element instanceof view.HTMLElement && !viewport
                ? Math.max(
                    0,
                    element.offsetHeight -
                      element.clientHeight -
                      Number.parseFloat(style.borderTopWidth) -
                      Number.parseFloat(style.borderBottomWidth),
                  )
                : 0,
          });
          const bar = viewport
            ? Math.max(0, view.innerHeight - height)
            : Math.hypot(own.x, own.y);
          return [
            {
              width,
              height,
              bar,
            },
          ];
        });
    root.classList.toggle("cv-shell-chrome", had);
    return { look: seen, offsets, place, below, readable: words, clips };
  };
  // The core strip (core-strip.ts) is held to the same rules as the
  // banner: its words, structure and look are the core's, and it stays the
  // first thing in L0, right after the banner.
  const frameOf = () => {
    const detail = bar.nextElementSibling;
    const parts = [
      bar,
      ...(detail?.hasAttribute("data-banner-detail") ? [detail] : []),
    ];
    const held = [...parts, ...(stripNode === undefined ? [] : [stripNode])];
    return {
      parts,
      held,
      header: bar.previousElementSibling,
      words: snapshot(held),
      looks: {
        plain: looks(held, false),
        chrome: looks(held, true),
      },
    };
  };
  // Measured only when a module will render: it lays out the page.
  let frame =
    selected !== undefined || section !== undefined ? frameOf() : undefined;
  // The strip is L0's first node and L0 follows the banner directly; no
  // other node on the page carries the strip's marker. On a page with no
  // Result, nothing on it may carry the marks of the Result's counts
  // (RESULT_COUNT_MARKS): a module or layout there draws no claim counts,
  // tallies or coverage (the 2026-10-25 ruling on #81, condition 2).
  const stripIntact = (last: Element): boolean => {
    if (stripNode === undefined)
      return root.querySelector(RESULT_COUNT_MARKS) === null;
    return (
      regions.L0.parentNode === root &&
      regions.L0.previousSibling === last &&
      regions.L0.firstChild === stripNode &&
      !stripNode.hidden &&
      root.querySelectorAll(`[${CORE_STRIP_ATTRIBUTE}], .cv-strip`).length === 1
    );
  };
  const assertFrameIntact = (): void => {
    const at = frame!;
    const [top, detail] = at.parts as [HTMLElement, Element?];
    const pill = top.querySelector("[data-verify]");
    const banners = root.querySelectorAll(
      "[data-verify], [data-banner-detail]",
    );
    const expected = [pill, ...(detail === undefined ? [] : [detail])];
    if (
      pill === null ||
      banners.length !== expected.length ||
      expected.some((part, i) => banners[i] !== part) ||
      // Nodes, not elements: a bare text node before the banner is words
      // too. The core draws no text node at the root.
      root.firstChild !== (at.header ?? top) ||
      top.previousSibling !== at.header ||
      (at.header !== null && at.header.parentNode !== root) ||
      (detail !== undefined && detail.previousElementSibling !== top) ||
      top.parentNode !== root ||
      top.hidden ||
      !stripIntact(detail ?? top) ||
      snapshot(at.held) !== at.words ||
      !sameLook(
        looks(at.held, root.classList.contains("cv-shell-chrome")),
        root.classList.contains("cv-shell-chrome")
          ? at.looks.chrome
          : at.looks.plain,
      )
    )
      throw new Error("a module altered the verification banner");
  };
  if (refused.length > 0)
    root.dataset.presentationRefused = refused.map((r) => r.id).join(" ");
  else delete root.dataset.presentationRefused;
  let chrome: string | undefined;
  if (selected !== undefined) {
    const host: WordedHost = {
      L0: regions.L0,
      L1: regions.L1,
      L2: regions.L2,
      depth,
      ...(options.wording === undefined ? {} : { wording: options.wording }),
      setChromeClass(name: string): void {
        if (name !== OUTCOME_CHROME && name !== COMPLIANCE_CHROME)
          throw new Error(`unknown chrome class ${JSON.stringify(name)}`);
        chrome = name;
        // The card keeps its own frame; the pill keeps its look.
        root.classList.add("cv-shell-chrome");
      },
    };
    try {
      await selected.module.render(
        selected.model,
        host,
        presentationServices(context),
      );
      assertFrameIntact();
    } catch {
      // Everything the module wrote is discarded; no other module is tried.
      chrome = undefined;
      drawFrame();
      frame = frameOf();
      refusal = "presentation-failed";
    }
  }
  if (refusal === undefined && resolution.kind === "no-presentation") {
    const note = element(
      "p",
      "No presentation is available for this bundle, audience and format. The records and their verification are below.",
    );
    note.dataset.notice = "no-presentation";
    notice(note);
  }
  // The section renders after the page module, into the same regions. If it
  // throws, everything any module wrote is discarded for the refusal.
  if (section !== undefined && refusal === undefined) {
    try {
      await section.module.render(
        section.model,
        {
          L0: regions.L0,
          L1: regions.L1,
          L2: regions.L2,
          depth,
          setChromeClass(): void {
            throw new Error("a section has no chrome");
          },
        },
        presentationServices(context),
      );
      assertFrameIntact();
    } catch {
      chrome = undefined;
      drawFrame();
      refusal = "presentation-failed";
    }
  }
  // A module may still draw once its render has returned, from a timer or
  // the next frame: a toolbar or a modal it opens when its data is in. The
  // frame is checked again after the page settles, after the next frame and
  // then the timers already due. Anything a module draws later is out of
  // reach (#125). jsdom lays nothing out, so there the checks above are the
  // last.
  const view = root.ownerDocument.defaultView;
  if (
    refusal === undefined &&
    (selected !== undefined || section !== undefined) &&
    root.isConnected &&
    view !== null &&
    !view.navigator.userAgent.includes("jsdom")
  ) {
    await settled(view);
    try {
      assertFrameIntact();
    } catch {
      chrome = undefined;
      drawFrame();
      refusal = "presentation-failed";
    }
  }
  if (refusal !== undefined) {
    const note = element("p", PRESENTATION_REFUSALS[refusal]);
    note.dataset.refusal = refusal;
    notice(note);
  }
  // The interpreters this rendering actually ran (see extension-interpreters.ts):
  // the presentation header and the countersignature stamp always run; a
  // module's own interpreters only when that module rendered.
  const applied = new Set<PageInterpreterId>([
    "presentation-header",
    "countersignature-stamp",
  ]);
  if (refusal === undefined)
    for (const ran of [selected, section])
      if (ran !== undefined)
        for (const id of moduleInterpreters(
          ran.module.manifest.id,
          context.bundle,
        ))
          applied.add(id);
  const checkedLine = await renderVerificationPage(
    regions.core,
    context,
    chrome === OUTCOME_CHROME,
    applied,
    refused,
    refusal === undefined && citesCheckedSigners(selected),
    options.verifierHint,
    depth,
    stamps,
  );
  // The banner says the same counts as the section it links to.
  const summary = root.querySelector<HTMLElement>("[data-verify-summary]");
  if (summary !== null) summary.textContent = checkedLine;
  linkCitedBy(root);
  // A page opened at a record's address shows that record.
  revealRecordsByHash(root.ownerDocument);
}

// "Cited by" (capsule-viewer#83): each record a number on the page counts
// links back to that number. The numbers say what they count themselves
// (report-levels.ts `evidenceAction`: `data-cites`, the digests their claims
// cite that this bundle carries, and `data-evidence-name`); this reads them
// back once the module and the records section are drawn, and infers no
// citation. The list sits in the record's entry beside its address, outside
// the entry's lazily built body, so a page that runs no script carries it.
function linkCitedBy(root: ParentNode): void {
  const anchors = new Map<string, HTMLElement>();
  for (const anchor of root.querySelectorAll<HTMLElement>(".cv-record-anchor"))
    anchors.set(anchor.id, anchor);
  const citing = new Map<HTMLElement, HTMLElement[]>();
  for (const action of root.querySelectorAll<HTMLElement>(
    "details.cv-ev[data-cites]",
  ))
    for (const digest of (action.dataset.cites ?? "").split(" ")) {
      // One entry may hold two addresses (a book record and the capsule it
      // carries): its list is one, under the entry's last address.
      const entry = anchors
        .get(recordAddress(digest))
        ?.closest<HTMLElement>("details.cv-record");
      if (entry === undefined || entry === null) continue;
      const list = citing.get(entry) ?? [];
      if (!list.includes(action)) list.push(action);
      citing.set(entry, list);
    }
  for (const [entry, actions] of citing) {
    const own = entry.querySelectorAll(":scope > .cv-record-anchor");
    const anchor = own[own.length - 1]!;
    const line = element("p", "Cited by: ");
    line.className = "cv-cited-by";
    line.dataset.citedBy = actions.map((a) => a.id).join(" ");
    actions.forEach((action, i) => {
      if (i > 0) line.append(" · ");
      const link = element("a", action.dataset.evidenceName ?? action.id);
      link.setAttribute("href", `#${action.id}`);
      line.append(link);
    });
    anchor.after(line);
  }
}
