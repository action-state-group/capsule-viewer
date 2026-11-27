// SPDX-License-Identifier: Apache-2.0
/**
 * The History view as a presentation module (capsule-viewer#478; the receipt
 * view-model note, docs/design/receipt-view-model.md section 7 row 8): it
 * reads the verified `x-standard-history/v0` bundle itself, through the
 * presentation contract, so no caller shapes a `history-view/v0` object.
 *
 * `buildModel` is the card's reading (src/standard-history-card.ts, the
 * Python module's rules) and then, in the Python module's order, the card's
 * signature, the snapshot's witness under the reader's own list and the card
 * statements' registration, each from the check this package already has
 * (card-signature.ts, reader-witnesses.ts, card-registered.ts). A check this
 * page cannot run is NOT_CHECKED, never a pass. `render` draws the History
 * view's card anatomy (docs/design/history-view.md section 11) from the
 * model; on a module page the core runtime draws the verification section
 * and the bundle's download, so the module draws neither.
 *
 * The shaped-input entry points (`historyViewHtml`, `renderHistoryView`) are
 * unchanged. This module is exported, not registered by default: it reads
 * the same bundles as the Python module-slot module
 * (`capsuleviewer.standard-history/v0`), so one registry holds one of them.
 */
import type { VerifiedBundleContext } from "@action-state-group/agent-action-capsule";
import { readerCardRegistered } from "./card-registered.js";
import { readerCardSignature } from "./card-signature.js";
import {
  historyElementToDom,
  historyModuleCardParts,
  historyViewStyles,
  type ModuleCard,
} from "./history-view.js";
import type {
  PresentationHost,
  PresentationManifest,
  PresentationModule,
} from "./presentation-registry.js";
import { readerAnchorWitness } from "./reader-witnesses.js";
import {
  CARD_PROPERTIES,
  type CardProperties,
  dealEntryReadable,
  type CardProperty,
  type CardReading,
  type Held,
  readStandardHistory,
  STANDARD_HISTORY_EXTENSION,
  standardHistoryBlock,
} from "./standard-history-card.js";

export const HISTORY_VIEW_MODULE_ID = "capsuleviewer.history-view/v0";

/**
 * The module's manifest: the Python module's selection clauses (every other
 * module that reads a deal bundle's own extension is forbidden, so no bundle
 * selects this module and another one), carried by the core runtime.
 */
export const HISTORY_VIEW_MANIFEST: PresentationManifest = Object.freeze({
  spec_version: "aac.presentation-manifest/v0",
  id: HISTORY_VIEW_MODULE_ID,
  presentation_api: "aac.presentation-api/v0",
  runtime_min: "0.1.0",
  trust_class: "trusted-executable",
  requires: {
    bundle_kind: "evidence-bundle/v2",
    extensions: { required: [STANDARD_HISTORY_EXTENSION] },
  },
  forbids: {
    profiles: [
      "spec_version:report/v1",
      "spec_version:evaluation-summary/v1",
      "result_version:evidence-result-v0",
    ],
    extensions: ["composed/v1", "x-deal-v0", "x-history-selection/v0"],
  },
  audiences: ["*"],
  formats: ["html"],
  fallback: false,
  priority: 1,
  // The stylesheet `render` inserts (historyViewStyles), pinned as a module's
  // stylesheets are (contract section 5.1): the module is not registered by
  // default, so the core runtime's own list does not carry it, and a page that
  // registers it adds this pin to its `style-src` (an emitter module's
  // `styleSha256`). The module test recomputes it.
  executable: {
    carrier: "core-runtime",
    style_sha256: [
      "657b325a53ff4b809b5101084e294c017ce0189949a71327bacb991bbf06c747",
    ],
  },
}) as PresentationManifest;

export type CardCheckStatus = "PASS" | "FAIL" | "NOT_PRESENT" | "NOT_CHECKED";

/**
 * Where a value came from (the receipt view model's `Sourced`,
 * docs/design/receipt-view-model.md section 2; PRD_PRESENTATION section 3):
 * `record` with `path`, a JSON pointer into the root record (`/key_id`,
 * `/timestamp`) or, under `/agent_input`, into the card it discloses;
 * `bundle`, a JSON pointer into the bundle (the `x-standard-history/v0`
 * block); `checked`, a check this page ran itself on the verified context.
 */
export type Source =
  | { readonly record: string; readonly path: string }
  | { readonly bundle: string }
  | {
      readonly checked:
        | "card_check"
        | "signature"
        | "anchor_witness"
        | "card_registered"
        | "membership";
    };

/** A value and where it came from. A value with no source is absent, never guessed. */
export interface Sourced<T> {
  readonly value: T;
  readonly src: Source;
}

/** The card's signature: the root record's strict verdict. */
export interface CardSignature {
  readonly status: CardCheckStatus;
  /** The record's key on PASS, else null. */
  readonly key: string | null;
}

/** The snapshot's witness under the reader's own list. */
export interface CardWitness {
  readonly status: CardCheckStatus;
  /** Drawn only on PASS on a standard card whose as_of property is PASS. */
  readonly shown: boolean;
  /** The witness's name on the reader's list, and its registration time (seconds), when shown. */
  readonly witness?: string;
  readonly at?: number | null;
}

/** The card statements' registration under the reader's own list (SH 13): a note, never a property. */
export interface CardRegistration {
  readonly status: CardCheckStatus;
  readonly shown: boolean;
  readonly service?: string;
  readonly at?: number | null;
}

export type HistoryViewState =
  | "card"
  | "refused"
  | "unreadable"
  | "unverified"
  | "signature_failed";

/**
 * The module's view model: plain JSON, derived and never sealed, with no
 * published schema (it changes with the viewer). The page draws only from it,
 * so the JSON a page writer saves beside the page says what the page says.
 */
export interface HistoryViewModel {
  readonly state: HistoryViewState;
  /** `own`, the holder's copy (the block carries the deal entries), or `shared`. */
  readonly copy: Sourced<"own" | "shared">;
  /** The card's SH 6 properties, as this page checked them. */
  readonly properties: Sourced<CardProperties>;
  /** The properties that failed, on a refused card. */
  readonly fails?: readonly CardProperty[];
  /** The properties left unchecked because an earlier one failed. */
  readonly skipped?: readonly CardProperty[];
  /** Which of the policy, the snapshot and the deal entries the block carries. */
  readonly held?: Sourced<Held>;
  /** Under /3 and /4: the entries add up to the card (SH 11.7). */
  readonly entries_match?: Sourced<boolean>;
  /** Whether the checkpoint covers the root record itself. */
  readonly covered?: Sourced<boolean>;
  readonly signature?: Sourced<CardSignature>;
  readonly witness?: Sourced<CardWitness>;
  readonly registration?: Sourced<CardRegistration>;
  /** The root record's key and time. */
  readonly signer?: {
    readonly key: Sourced<string>;
    readonly signed_at: Sourced<string>;
  };
  /** Each member of the card, on a standard card only. */
  readonly card?: Readonly<Record<string, Sourced<unknown>>>;
  /** The block's snapshot, when it carries one. */
  readonly as_of?: Sourced<Record<string, unknown>>;
  /**
   * The block's deal entries (the holder's own copy), on a standard card
   * only, and only when every entry has the form the card's check requires
   * (the recount checks them only when it runs).
   */
  readonly deals?: readonly Sourced<Record<string, unknown>>[];
  /** The block carries deal entries, and one of them does not have that form: none is listed. */
  readonly deals_unreadable?: Sourced<true>;
}

const STATUSES: readonly CardCheckStatus[] = [
  "PASS",
  "FAIL",
  "NOT_PRESENT",
  "NOT_CHECKED",
];
const statusOf = (v: unknown): CardCheckStatus =>
  STATUSES.includes(v as CardCheckStatus)
    ? (v as CardCheckStatus)
    : "NOT_CHECKED";
const HEX64 = /^[0-9a-f]{64}$/u;
/** The block's pointer: `~1` stands for the `/` in its name (RFC 6901). */
const BLOCK = `/extensions/${STANDARD_HISTORY_EXTENSION.replace(/~/gu, "~0").replace(/\//gu, "~1")}`;
const pointer = (k: string): string =>
  k.replace(/~/gu, "~0").replace(/\//gu, "~1");
const checked = <T>(
  check: Extract<Source, { checked: string }>["checked"],
  value: T,
): Sourced<T> => ({ value, src: { checked: check } });

type Read = Exclude<CardReading, { state: "unverified" | "unreadable" }>;

async function signatureOf(context: unknown): Promise<CardSignature> {
  try {
    const r = await readerCardSignature(context);
    let status = statusOf(r.status);
    if (
      status === "PASS" &&
      !(typeof r.key_id === "string" && HEX64.test(r.key_id))
    )
      status = "NOT_CHECKED";
    return { status, key: status === "PASS" ? r.key_id : null };
  } catch {
    return { status: "NOT_CHECKED", key: null };
  }
}

async function witnessOf(m: Read): Promise<CardWitness | "mismatch"> {
  const w = m.witnessIn;
  if (!w) return { status: "NOT_PRESENT", shown: false };
  try {
    const r = await readerAnchorWitness(w.anchor, w.checkpoint, w.receipts);
    // A checkpoint that is not the anchor's makes the block unreadable.
    if (r.checkpoint === "mismatch") return "mismatch";
    const status =
      r.checkpoint === "unchecked" && r.status === "PASS"
        ? "NOT_CHECKED"
        : statusOf(r.status);
    const shown =
      m.state === "card" &&
      status === "PASS" &&
      m.properties.as_of === "PASS" &&
      typeof r.witness === "string";
    return shown
      ? { status, shown, witness: r.witness!, at: r.witnessed_time }
      : { status, shown };
  } catch {
    return { status: w.receipts ? "NOT_CHECKED" : "NOT_PRESENT", shown: false };
  }
}

async function registrationOf(
  m: Read,
  context: unknown,
): Promise<CardRegistration> {
  if (!m.registerIn) return { status: "NOT_PRESENT", shown: false };
  try {
    const r = await readerCardRegistered(context, m.registerIn);
    let status = statusOf(r.status);
    // The statements are present, so a check that says none is not trusted to say it.
    if (status === "NOT_PRESENT") status = "NOT_CHECKED";
    // A pass with no service to name is not one this page can draw.
    if (status === "PASS" && typeof r.service !== "string")
      status = "NOT_CHECKED";
    const shown = m.state === "card" && status === "PASS";
    return shown
      ? { status, shown, service: r.service!, at: r.registration_time }
      : { status, shown };
  } catch {
    return { status: "NOT_CHECKED", shown: false };
  }
}

function noneChecked(): CardProperties {
  const none = {} as CardProperties;
  for (const p of CARD_PROPERTIES) none[p] = "NOT_CHECKED";
  return none;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function rootRecord(context: VerifiedBundleContext): {
  key_id: string;
  timestamp: string;
} {
  const records = (context.bundle as { records?: unknown }).records;
  const root = Array.isArray(records)
    ? (records as Record<string, unknown>[]).find(
        (r) =>
          r !== null &&
          typeof r === "object" &&
          r["capsule_id"] === context.root,
      )
    : undefined;
  return {
    key_id: typeof root?.["key_id"] === "string" ? root["key_id"] : "",
    timestamp: typeof root?.["timestamp"] === "string" ? root["timestamp"] : "",
  };
}

/**
 * The view model of a verified context, in the Python module's order: the
 * card's reading, its signature, the snapshot's witness, the statements'
 * registration.
 */
export async function buildHistoryViewModel(
  context: VerifiedBundleContext,
): Promise<HistoryViewModel> {
  const read = readStandardHistory(context);
  const copy: Sourced<"own" | "shared"> = {
    value: read.own ? "own" : "shared",
    // Derived by the card's reading (whether the block carries deal entries), not a member it points at.
    src: { checked: "card_check" },
  };
  if (read.state === "unverified" || read.state === "unreadable")
    return {
      state: read.state,
      copy,
      properties: checked("card_check", read.properties),
    };
  const m = read as Read;
  const rootId = context.root ?? "";
  const signature = await signatureOf(context);
  // The block's checkpoint is held to its anchor whenever it is carried, a
  // failed signature included: one that is not the anchor's makes the block
  // unreadable (the Python module runs the witness step after the signature's).
  const witness = await witnessOf(m);
  if (witness === "mismatch")
    return {
      state: "unreadable",
      copy,
      properties: checked("card_check", noneChecked()),
    };
  const root = rootRecord(context);
  const signer = {
    key: { value: root.key_id, src: { record: rootId, path: "/key_id" } },
    signed_at: {
      value: root.timestamp,
      src: { record: rootId, path: "/timestamp" },
    },
  };
  // A card whose signature does not check keeps the reading's diagnostics (as
  // the Python module keeps them) and loses its card, its counts and any
  // witness line; the registration step does not run on it.
  if (signature.status === "FAIL")
    return {
      state: "signature_failed",
      copy,
      properties: checked("card_check", m.properties),
      skipped: m.skipped,
      held: checked("card_check", m.held),
      ...(m.state === "refused" ? { fails: m.fails } : {}),
      signature: checked("signature", signature),
      witness: checked("anchor_witness", {
        status: witness.status,
        shown: false,
      }),
      signer,
    };
  const registration = await registrationOf(m, context);
  const common = {
    copy,
    properties: checked("card_check", m.properties),
    skipped: m.skipped,
    held: checked("card_check", m.held),
    signature: checked("signature", signature),
    witness: checked("anchor_witness", witness),
    registration: checked("card_registered", registration),
    signer,
  };
  const asOf =
    m.held.as_of && m.state === "card"
      ? { as_of: { value: clone(m.asOf), src: { bundle: `${BLOCK}/as_of` } } }
      : {};
  if (m.state === "refused")
    return { state: "refused", ...common, fails: m.fails };
  const card: Record<string, Sourced<unknown>> = {};
  for (const [k, v] of Object.entries(m.card as Record<string, unknown>))
    card[k] = {
      value: clone(v),
      src: { record: rootId, path: `/agent_input/${pointer(k)}` },
    };
  return {
    state: "card",
    ...common,
    ...asOf,
    entries_match: checked("card_check", m.entriesMatch),
    covered: checked("membership", m.covered),
    card,
    ...(m.deals === null
      ? {}
      : m.deals.every((d) =>
            dealEntryReadable(
              d,
              (m.card as Record<string, unknown>)["derivation"],
            ),
          )
        ? {
            deals: m.deals.map((d, i) => ({
              value: clone(d) as Record<string, unknown>,
              src: { bundle: `${BLOCK}/deals/${i}` },
            })),
          }
        : { deals_unreadable: checked("card_check", true as const) }),
  };
}

/**
 * The view model as the JSON a page writer saves beside the page it wrote
 * from the same model (PRD_PRESENTATION section 3, H3).
 */
export function historyViewModelJson(model: HistoryViewModel): string {
  return `${JSON.stringify(model, null, 2)}\n`;
}

/** What the drawer reads from the view model: its values only, so the JSON draws the same page. */
function moduleCard(model: HistoryViewModel): ModuleCard {
  const card =
    model.card === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(model.card).map(([k, v]) => [k, v.value]),
        );
  return {
    frame: {
      state: model.state,
      signature: model.signature?.value ?? { status: "NOT_CHECKED", key: null },
      properties: model.properties.value,
      fails: model.fails ?? [],
      skipped: model.skipped ?? [],
      held: model.held?.value,
      witness: model.witness?.value,
      registration: model.registration?.value,
    },
    own: model.copy.value === "own",
    card,
    keyId: model.signer?.key.value ?? "",
    signedAt: model.signer?.signed_at.value ?? "",
    asOf: model.as_of?.value,
    deals: model.deals?.map((d) => d.value),
    dealsUnreadable: model.deals_unreadable?.value === true,
  };
}

const STYLE_MARK = "data-history-view-styles";

/** The view's stylesheet, inserted once per document (it is one of the core runtime's pinned styles). */
function ensureStyles(doc: Document): void {
  if (doc.head === null || doc.head.querySelector(`style[${STYLE_MARK}]`))
    return;
  const style = doc.createElement("style");
  style.setAttribute(STYLE_MARK, "");
  style.textContent = historyViewStyles;
  doc.head.appendChild(style);
}

/** Draw a view model into the host's three depth regions. */
export function renderHistoryViewModel(
  model: HistoryViewModel,
  host: Pick<PresentationHost, "L0" | "L1" | "L2">,
): void {
  const doc = host.L0.ownerDocument;
  ensureStyles(doc);
  const parts = historyModuleCardParts(moduleCard(model));
  host.L0.appendChild(historyElementToDom(parts.L0, doc));
  host.L1.appendChild(historyElementToDom(parts.L1, doc));
  host.L2.appendChild(historyElementToDom(parts.L2, doc));
  host.L0.setAttribute("data-history-state", model.state);
  host.L0.setAttribute("data-history-copy", model.copy.value);
}

/** The History view as a presentation module over the `x-standard-history/v0` bundle. */
export const historyViewModule: PresentationModule<HistoryViewModel> =
  Object.freeze({
    manifest: HISTORY_VIEW_MANIFEST,
    canRender(context: VerifiedBundleContext): boolean {
      return standardHistoryBlock(context.bundle) !== undefined;
    },
    buildModel: buildHistoryViewModel,
    render(model: HistoryViewModel, host: PresentationHost): void {
      renderHistoryViewModel(model, host);
    },
  });
