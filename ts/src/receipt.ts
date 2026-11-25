// SPDX-License-Identifier: Apache-2.0
/**
 * The deal receipt for a browser consumer (capsule-viewer#383, CV-TS): the
 * same receipt modules the Go package `receipt` ships to Go page builders,
 * built from the one source (go/receipt/receipt_core.js), for a page that
 * bundles them itself, such as a saved receipt page or an exchanges row.
 *
 * It verifies the bundle with agent-action-capsule's runtime, resolves it
 * among the four receipt modules at the reader's audience, and draws the
 * receipt the module chose. It never draws a receipt the runtime did not
 * verify. The words are the receipt modules' own (the example English
 * pack), so a consumer carries no receipt words of its own.
 */
import {
  buildVerifiedBundleContext,
  bundleVerified,
  Sha256UnavailableError,
  type VerifiedBundleContext,
} from "@action-state-group/agent-action-capsule";
import {
  PresentationRegistry,
  type PresentationModule,
} from "./presentation-registry.js";
import { RECEIPT_CORE, RECEIPT_MANIFESTS } from "./receipt-core.generated.js";

/** The receipt kinds, as go/receipt names them. */
export const RECEIPT_KINDS = [
  "unilateral",
  "seller",
  "bilateral",
  "deal",
] as const;
export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

/** What a receipt check found. */
export type ReceiptResult =
  /** Verified and drawn (or drawable) by `module`; `both` only for a two-sided receipt both sides stamped. */
  | {
      readonly kind: "checked";
      readonly module: string;
      readonly both: boolean;
    }
  /** The bundle did not verify, or could not be read: do not rely on it. */
  | { readonly kind: "did_not_verify" }
  /** This browser cannot verify it (no SHA-256 or Ed25519): no verdict. */
  | { readonly kind: "cannot_check" }
  /** Verified, but no receipt module draws it (not a deal receipt). */
  | { readonly kind: "no_module" };

export interface ReceiptOptions {
  /** The reader's audience; default `keep`, the owner's own copy. */
  readonly audience?: string;
  /** Opened at this depth; default `L0`. */
  readonly depth?: "L0" | "L1" | "L2";
  /**
   * `report` when the receipt is carried in a report: the owner's copy then
   * reads as a shared copy and never addresses the reader as its owner.
   */
  readonly carrier?: "report";
}

interface Core {
  createModule(kind: ReceiptKind, env: object): PresentationModule;
  WORDS: Record<string, string>;
}
const core = RECEIPT_CORE as Core;

/** The four receipt modules, each with the manifest go/receipt ships for it. */
export function receiptModules(): PresentationModule[] {
  return RECEIPT_KINDS.map((kind) => {
    const module = core.createModule(kind, {
      localTime: true,
      memberContext: (bundle: unknown) => buildVerifiedBundleContext(bundle),
    });
    return {
      ...module,
      manifest: (RECEIPT_MANIFESTS as Record<string, unknown>)[
        kind
      ] as PresentationModule["manifest"],
    };
  });
}

async function verified(
  bundle: unknown,
): Promise<VerifiedBundleContext | ReceiptResult> {
  let value: unknown = bundle;
  try {
    if (typeof bundle === "string") value = JSON.parse(bundle);
    const context = await buildVerifiedBundleContext(value);
    // No strict result: no Ed25519 here, so a producer-selected bundle
    // cannot be checked in this browser.
    if (context.strict === undefined) return { kind: "cannot_check" };
    return bundleVerified(context.verification)
      ? context
      : { kind: "did_not_verify" };
  } catch (error) {
    if (error instanceof Sha256UnavailableError)
      return { kind: "cannot_check" };
    return { kind: "did_not_verify" };
  }
}

async function resolved(
  bundle: unknown,
  audience: string,
): Promise<
  | { result: ReceiptResult }
  | { context: VerifiedBundleContext; module: PresentationModule }
> {
  const context = await verified(bundle);
  if ("kind" in context) return { result: context };
  const registry = new PresentationRegistry();
  for (const module of receiptModules()) registry.register(module);
  const resolution = await registry.resolve(context, audience, "html");
  if (resolution.kind !== "module") return { result: { kind: "no_module" } };
  return { context, module: resolution.module };
}

const bothSides = (model: unknown): boolean =>
  typeof model === "object" &&
  model !== null &&
  (model as { case?: unknown }).case === "both";

/** Check a receipt bundle (its JSON text, or the parsed value) without drawing it. */
export async function checkReceipt(
  bundle: unknown,
  options: ReceiptOptions = {},
): Promise<ReceiptResult> {
  const found = await resolved(bundle, options.audience ?? "keep");
  if ("result" in found) return found.result;
  const model = await found.module.buildModel(found.context);
  return {
    kind: "checked",
    module: found.module.manifest.id,
    both: bothSides(model),
  };
}

/**
 * Draw a receipt bundle into `host` (its L0, L1 and L2 regions are created
 * inside it). Nothing is drawn unless the result is `checked`.
 */
export async function renderReceipt(
  bundle: unknown,
  host: HTMLElement,
  options: ReceiptOptions = {},
): Promise<ReceiptResult> {
  const found = await resolved(bundle, options.audience ?? "keep");
  if ("result" in found) return found.result;
  const model = await found.module.buildModel(found.context);
  const doc = host.ownerDocument;
  if (options.carrier === "report")
    host.setAttribute("data-receipt-carrier", "report");
  const region = (name: string): HTMLElement => {
    const node = doc.createElement("div");
    node.dataset.region = name;
    return node;
  };
  const regions = { L0: region("L0"), L1: region("L1"), L2: region("L2") };
  host.replaceChildren(regions.L0, regions.L1, regions.L2);
  await found.module.render(
    model,
    {
      ...regions,
      depth: options.depth ?? "L0",
      setChromeClass: () => undefined,
    },
    undefined as never,
  );
  return {
    kind: "checked",
    module: found.module.manifest.id,
    both: bothSides(model),
  };
}

/**
 * The one-line label an exchanges row shows for a result, in the receipt
 * modules' words; null where the result has no label.
 */
export function receiptLabel(
  result: ReceiptResult | { kind: "no_record" },
): string | null {
  const key =
    result.kind === "checked"
      ? result.both
        ? "summary.both"
        : "summary.one_sided"
      : result.kind === "no_record"
        ? "summary.none"
        : result.kind === "cannot_check"
          ? "summary.cannot_check"
          : result.kind === "did_not_verify"
            ? "summary.did_not_verify"
            : null;
  return key === null ? null : (core.WORDS[key] ?? null);
}
