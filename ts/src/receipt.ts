// SPDX-License-Identifier: Apache-2.0
/**
 * The receipt for a browser consumer (capsule-viewer#383, CV-TS): the
 * same receipt modules the Go package `receipt` ships to Go page builders,
 * built from the one source (go/receipt/receipt_core.js), for a page that
 * bundles them itself, such as a saved receipt page or an exchanges row.
 *
 * It verifies the bundle with agent-action-capsule's runtime, resolves it
 * among the receipt modules at the reader's audience, and draws the
 * receipt the module chose. It never draws a receipt the runtime did not
 * verify. The words are the receipt modules' own (the example English
 * pack), so a consumer carries no receipt words of its own.
 */
import {
  buildVerifiedBundleContext,
  bundleVerified,
  Sha256UnavailableError,
  VERIFICATION_BANNER_LINES,
  verificationBanner,
  type VerifiedBundleContext,
} from "@action-state-group/agent-action-capsule";
import {
  PresentationRegistry,
  type PresentationHost,
  type PresentationModule,
} from "./presentation-registry.js";
import { dealStandaloneReport } from "./deal-standalone-report.js";
import { paymentPreimageCheck } from "./payment-preimage.js";
import {
  verifierReportReading,
  withVerifierReport,
} from "./verifier-report.js";
import { RECEIPT_CORE, RECEIPT_MANIFESTS } from "./receipt-core.generated.js";
import { selectionOnly } from "./receipt-selection.js";

/** The receipt kinds, as go/receipt names them. */
export const RECEIPT_KINDS = [
  "unilateral",
  "seller",
  "bilateral",
  "deal",
  "provider",
] as const;
export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

/** What a receipt check found. */
export type ReceiptResult =
  /** Verified and drawn (or drawable) by `module`. */
  | {
      readonly kind: "checked";
      readonly module: string;
      /** A two-sided receipt both sides stamped. */
      readonly both: boolean;
      /**
       * The runtime's banner line for the state it reached. When the runtime
       * draws no not-checked list for an incomplete verdict, the line also
       * names what was not run (capsule-viewer#523), since a row or saved
       * page shows this line and no list.
       */
      readonly runtimeLine: string;
      /** Records in the bundle, and how many are tied to a signed checkpoint. */
      readonly records: { readonly total: number; readonly tied: number };
    }
  /** The bundle did not verify, or could not be read: do not rely on it. */
  | { readonly kind: "did_not_verify"; readonly line: string }
  /**
   * This page cannot check it, so it shows nothing from it and no verdict:
   * this browser cannot verify (no SHA-256 or Ed25519), or, with `reason`
   * `report_rule`, the copy is an x-deal-v1 receipt whose report passes only
   * under its profile's own rule, which no page runs yet (#405); with
   * `downgraded`, the copy is an x-deal-v0 receipt that names no sealed
   * report to check its inline text against (#452).
   */
  | {
      readonly kind: "cannot_check";
      readonly reason?: "report_rule" | "downgraded";
    }
  /** Verified, but no receipt module draws it (not a deal receipt or a provider's own receipt). */
  | { readonly kind: "no_module" };

export interface ReceiptOptions {
  /** The reader's audience; default `keep`, the owner's own copy. */
  readonly audience?: string;
  /** Opened at this depth; default `L0`. */
  readonly depth?: "L0" | "L1" | "L2";
  /**
   * `report` when the receipt is carried in a report, `page` when it is
   * saved as a page for anyone to check (capsule-viewer#395): the owner's
   * copy then reads as a shared copy and never addresses the reader as its
   * owner. Left out, it is the owner's own copy.
   */
  readonly carrier?: "report" | "page";
  /**
   * capsulectl's own report of this bundle (`capsulectl deal verify
   * --bundle`), for an x-deal-v1 copy whose report no page can check itself
   * (#405). Read only when it is this bundle's: a pass draws the receipt,
   * saying capsulectl reported it and this page did not check it; a fail is
   * `did_not_verify`; any other report is ignored (verifier-report.ts).
   */
  readonly verifierReport?: unknown;
}

type Draw = (model: unknown, host: PresentationHost) => void | Promise<void>;

interface Core {
  createModule(kind: ReceiptKind, env: object): PresentationModule;
  WORDS: Record<string, string>;
}
const core = RECEIPT_CORE as Core;

/** The receipt modules, each with the manifest go/receipt ships for it. */
export function receiptModules(): PresentationModule[] {
  return RECEIPT_KINDS.map((kind) => {
    const module = core.createModule(kind, {
      localTime: true,
      memberContext: (bundle: unknown) => buildVerifiedBundleContext(bundle),
      reportCheck: dealStandaloneReport,
      // The x-deal-v0 receipts' settlement line checks each Lightning leg's proof (#383).
      preimageCheck: paymentPreimageCheck,
    });
    return {
      ...module,
      manifest: (RECEIPT_MANIFESTS as Record<string, unknown>)[
        kind
      ] as PresentationModule["manifest"],
    };
  });
}

/**
 * A composed/v1 block that failed, or a carried copy whose own completeness
 * claims failed. The runtime's page gate reads neither (the composed status
 * and each member's claims are reported apart), so the receipt check does.
 */
function composedFailed(context: VerifiedBundleContext): boolean {
  return context.extensions.some((extension) => {
    const composed = (extension as { composed?: unknown }).composed as
      | {
          malformed?: boolean;
          status?: string;
          members?: readonly {
            bundle?: Record<string, { status?: string }>;
          }[];
        }
      | undefined;
    if (!composed) return false;
    if (composed.malformed || composed.status === "fail") return true;
    return (composed.members ?? []).some(
      (member) =>
        member.bundle !== undefined &&
        ["graphClosure", "intervalCoverage", "perRecordMembership"].some(
          (claim) => member.bundle?.[claim]?.status === "fail",
        ),
    );
  });
}

type Verified = {
  readonly context: VerifiedBundleContext;
  readonly runtimeLine: string;
  readonly records: { readonly total: number; readonly tied: number };
};

async function verified(bundle: unknown): Promise<Verified | ReceiptResult> {
  const refused = {
    kind: "did_not_verify",
    line: VERIFICATION_BANNER_LINES.refused,
  } as const;
  let value: unknown = bundle;
  let context: VerifiedBundleContext;
  try {
    if (typeof bundle === "string") value = JSON.parse(bundle);
    context = await buildVerifiedBundleContext(value);
  } catch (error) {
    if (error instanceof Sha256UnavailableError)
      return { kind: "cannot_check" };
    return refused;
  }
  // No strict result: no Ed25519 here, so a producer-selected bundle
  // cannot be checked in this browser.
  if (context.strict === undefined) return { kind: "cannot_check" };
  const banner = verificationBanner(context, []);
  if (banner.state === "failed")
    return { kind: "did_not_verify", line: banner.line };
  if (!bundleVerified(context.verification) || composedFailed(context))
    return refused;
  // A deal copy whose standalone report fails the page's own check did not
  // verify, and says so, never as a receipt that is simply not there
  // (Sherlock2, #398 follow-up).
  if ((await dealStandaloneReport(value)) === "fail") return refused;
  const records = (value as { records?: unknown }).records;
  const total = Array.isArray(records) ? records.length : 0;
  return {
    context,
    runtimeLine: runtimeLine(context, banner),
    records: { total, tied: Math.max(0, total - banner.uncheckpointed) },
  };
}

/**
 * The banner line, naming what was not run when the runtime's verdict is
 * incomplete and it draws no not-checked list (capsule-viewer#523). A
 * producer selection whose only unchecked claim is that nothing was left out
 * (a Mesh node's receipt) says so in Sherlock2's words; any other such
 * verdict carries the runtime's own sentence for it, as the full page's
 * banner detail does.
 */
function runtimeLine(
  context: VerifiedBundleContext,
  banner: ReturnType<typeof verificationBanner>,
): string {
  if (banner.line !== VERIFICATION_BANNER_LINES.incompleteNoList)
    return banner.line;
  if (selectionOnly(context)) return fill("row.page.not_run.selection");
  return banner.detail === ""
    ? banner.line
    : `${banner.line}. ${banner.detail}`;
}

type Found =
  | { readonly result: ReceiptResult }
  | (Verified & {
      readonly module: PresentationModule;
      readonly model: unknown;
    });

async function resolved(
  bundle: unknown,
  audience: string,
  verifierReport?: unknown,
): Promise<Found> {
  const found = await verified(bundle);
  if ("kind" in found) return { result: found };
  let checked = found;
  if (verifierReport !== undefined) {
    const reading = await verifierReportReading(
      checked.context,
      verifierReport,
    );
    if (reading?.kind === "fail")
      return {
        result: {
          kind: "did_not_verify",
          line: VERIFICATION_BANNER_LINES.refused,
        },
      };
    if (reading?.kind === "pass")
      checked = {
        ...checked,
        context: withVerifierReport(checked.context, reading),
      };
  }
  const registry = new PresentationRegistry();
  for (const module of receiptModules()) registry.register(module);
  const resolution = await registry.resolve(checked.context, audience, "html");
  if (resolution.kind !== "module") return { result: { kind: "no_module" } };
  // The registry's canRender built the model once already; building it again
  // costs a second pass over a two-sided receipt's carried copies, which the
  // modules' contract (canRender, then buildModel) asks for.
  const model = await resolution.module.buildModel(checked.context);
  return { ...checked, module: resolution.module, model };
}

const bothSides = (model: unknown): boolean =>
  typeof model === "object" &&
  model !== null &&
  (model as { case?: unknown }).case === "both";

function result(found: Found): ReceiptResult {
  if ("result" in found) return found.result;
  const model = found.model as { cannot_check?: unknown; reason?: unknown };
  if (
    typeof model === "object" &&
    model !== null &&
    model.cannot_check === true
  )
    return model.reason === "report_rule" || model.reason === "downgraded"
      ? { kind: "cannot_check", reason: model.reason }
      : { kind: "cannot_check" };
  return {
    kind: "checked",
    module: found.module.manifest.id,
    both: bothSides(found.model),
    runtimeLine: found.runtimeLine,
    records: found.records,
  };
}

/** Check a receipt bundle (its JSON text, or the parsed value) without drawing it. */
export async function checkReceipt(
  bundle: unknown,
  options: ReceiptOptions = {},
): Promise<ReceiptResult> {
  return result(
    await resolved(bundle, options.audience ?? "keep", options.verifierReport),
  );
}

/**
 * Draw a receipt bundle into `host`: its children are replaced by the L0, L1
 * and L2 regions of the receipt, or emptied when the result is not
 * `checked`, so a host drawn into before never keeps an earlier receipt.
 */
export async function renderReceipt(
  bundle: unknown,
  host: HTMLElement,
  options: ReceiptOptions = {},
): Promise<ReceiptResult> {
  const found = await resolved(
    bundle,
    options.audience ?? "keep",
    options.verifierReport,
  );
  if (options.carrier === "report" || options.carrier === "page")
    host.setAttribute("data-receipt-carrier", options.carrier);
  else host.removeAttribute("data-receipt-carrier");
  // Not checked: nothing is drawn. For a copy this page can't check (an
  // x-deal-v1 report, #405) the line is the page lines' (receiptPageLines),
  // said once there.
  const done = result(found);
  if (done.kind !== "checked" || "result" in found) {
    host.replaceChildren();
    return done;
  }
  const doc = host.ownerDocument;
  const region = (name: string): HTMLElement => {
    const node = doc.createElement("div");
    node.dataset.region = name;
    return node;
  };
  const regions = { L0: region("L0"), L1: region("L1"), L2: region("L2") };
  host.replaceChildren(regions.L0, regions.L1, regions.L2);
  // The receipt modules draw from the model and the host alone; they take
  // no core services and set no chrome class.
  await (found.module.render as unknown as Draw)(found.model, {
    ...regions,
    depth: options.depth ?? "L0",
    setChromeClass: () => undefined,
  });
  return done;
}

// The words as plain text: a command the pack marks with backticks, which a
// receipt page draws as code, loses only the backticks here, since callers
// draw these strings as text (Sherlock2 on capsule-viewer#454).
const fill = (
  key: string,
  values: Record<string, string | number> = {},
): string =>
  (core.WORDS[key] ?? `[${key}]`)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));

/**
 * The one-line label an exchanges row shows for a result, in the receipt
 * modules' words; null where the result has no label. It is for the owner's
 * own row only, never for a receipt carried in a report: its words address
 * the owner (Sherlock2, #387).
 */
export function receiptLabel(
  result: ReceiptResult | { kind: "no_record" },
): string | null {
  const key =
    result.kind === "checked"
      ? result.both
        ? "row.both"
        : "row.one_sided"
      : result.kind === "no_record"
        ? "row.none"
        : result.kind === "cannot_check"
          ? result.reason === "report_rule"
            ? "row.cannot_check.report_rule.row"
            : result.reason === "downgraded"
              ? "row.cannot_check.downgraded.row"
              : "row.cannot_check"
          : result.kind === "did_not_verify"
            ? "row.did_not_verify"
            : null;
  return key === null ? null : fill(key);
}

/**
 * The lines a saved receipt page shows above the receipt, and their tone:
 * `ok` only for a receipt both sides stamped, `warn` for one side's own
 * receipt, `bad` for one not checked or not verified. Null for `no_module`.
 * With `carrier: "page"` (a node's receipt saved as a page for anyone to
 * check), the label never addresses the reader as the owner: one side's own
 * receipt is "this node's receipt only" (capsule-viewer#395). A report draws
 * no page lines, so it takes no carrier here.
 */
export function receiptPageLines(
  result: ReceiptResult,
  options: { readonly carrier?: "page" } = {},
): { tone: "ok" | "warn" | "bad"; lines: string[] } | null {
  switch (result.kind) {
    case "checked":
      return {
        tone: result.both ? "ok" : "warn",
        lines: [
          fill("row.page.receipt", {
            label:
              options.carrier === "page" && !result.both
                ? fill("row.one_sided.page")
                : (receiptLabel(result) ?? ""),
          }),
          fill("row.page.records_tied", result.records),
          result.runtimeLine,
        ],
      };
    case "cannot_check":
      return {
        tone: "bad",
        lines: [
          result.reason === "report_rule"
            ? `${fill("row.cannot_check.report_rule")} ${fill("row.cannot_check.report_rule_pointer")}`
            : result.reason === "downgraded"
              ? fill("row.cannot_check.downgraded")
              : `${fill("row.cannot_check")}. ${fill("row.cannot_check_pointer")}`,
          ...(result.reason === "downgraded"
            ? [fill("row.cannot_check.downgraded_verdict")]
            : []),
        ],
      };
    case "did_not_verify":
      return {
        tone: "bad",
        lines: [`${fill("row.did_not_verify")}.`, result.line],
      };
    default:
      return null;
  }
}
