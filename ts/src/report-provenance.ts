// SPDX-License-Identifier: BSD-3-Clause
import {
  asString,
  isObject,
  jcs,
  reportState,
  verifyJudgePin,
  type BundleVerificationResult,
  type CitedRecord,
  type JudgePinComponents,
  type ObjectValue,
  type ResultClaim,
} from "@action-state-group/agent-action-capsule";
import { buildVerificationPageModel } from "@action-state-group/agent-action-capsule";
import { VIEWER_BUILD, type ViewerBuild } from "./viewer-build.js";
import { DEFAULT_WORDS, type Words } from "./contract-report-wording.js";
import { levelToggle } from "./report-levels.js";

/**
 * Who judged, who witnessed, and what verified: one folded line at the top
 * of L1 of every contract report (a few words per entry), with the full
 * lines inside, so a reader does not have to open the proofs to learn it. Its words are the card's wording pack's (`prov.*`); "Witnessed
 * by" always says the witnesses are stated by the bundle and not checked
 * here, because this page does not check witness receipts.
 *
 * Every value comes from the verified bundle, or, for "this page", from the
 * viewer's own build constants (viewer-build.ts). Nothing is inferred: a
 * fact the bundle does not carry reads "not stated", and withheld reports
 * read "withheld". Values from the bundle are untrusted and are only ever
 * set as text.
 *
 * The block is the same in every packaging of a page (offline file,
 * fragment, embedded, static): it names no run-time fact such as the
 * page's own script digest.
 */

// ---------------------------------------------------------------------------
// The judge, as the cited reports state it
// ---------------------------------------------------------------------------

/** One distinct judge pin across the cited reports. */
export interface JudgePinCount {
  readonly digest: string;
  readonly count: number;
  /** The model the reports name for this pin, only when every report with this pin names the same components and they recompute to it. */
  readonly model?: string;
  /** Why no model is named: the reports carry no components, carry different ones, or theirs do not recompute to the pin. */
  readonly modelNotShown?:
    | "not_stated"
    | "partly_stated"
    | "differs"
    | "does_not_recompute";
}

export interface JudgeTally {
  /** Claims citing a report, carried or not. */
  readonly cited: number;
  /** Claims citing a report this bundle does not carry. */
  readonly notCarried: number;
  readonly pins: readonly JudgePinCount[];
  readonly withheld: number;
  /** Reports supplied but not matching their commitment, not an object, or whose capsule is missing or does not check out (`reportState` mismatch, unreadable, invalid). */
  readonly unread: number;
  /** Recomputed (`recomputed_determination`) reports that name a checker (`checker_ref`), by checker; a bare `checker_ref` alone no longer puts a report here. */
  readonly checkers: readonly {
    readonly ref: string;
    readonly count: number;
  }[];
  /** Disclosed reports that state they were recomputed (`recomputed_determination`) but name no checker. */
  readonly recomputedUnnamed: number;
  /** Disclosed reports naming neither a judge pin nor a checker, and not stating they were recomputed. */
  readonly unnamed: number;
}

/**
 * A claim's cited report, when the bundle discloses it. A book record's own
 * agent_input is the book's header; the report is the input of the capsule
 * it carries.
 */
function reportPayload(
  records: ReadonlyMap<string, CitedRecord>,
  claim: ResultClaim,
): ObjectValue | undefined {
  const digest = claim.evidence[0]?.digest;
  if (digest === undefined) return undefined;
  const record = records.get(digest);
  if (record === undefined) return undefined;
  const input = record.carriedInput ?? record.agentInput;
  if (input.state !== "disclosed") return undefined;
  return isObject(input.payload) ? input.payload : undefined;
}

function pinComponents(value: unknown): JudgePinComponents | undefined {
  if (!isObject(value)) return undefined;
  const modelId = asString(value.model_id);
  const promptDigest = asString(value.prompt_digest);
  const axesDigest = asString(value.axes_digest);
  if (
    modelId === undefined ||
    promptDigest === undefined ||
    axesDigest === undefined
  )
    return undefined;
  const modelVersion = asString(value.model_version);
  return {
    modelId,
    ...(modelVersion === undefined ? {} : { modelVersion }),
    promptDigest,
    axesDigest,
    ...(isObject(value.sampling_params)
      ? { samplingParams: value.sampling_params }
      : {}),
  };
}

/**
 * Count the judge pins the cited reports state, each distinct pin with its
 * count (never one picked for all), with the model named only where the
 * reports' own components recompute to that pin.
 */
export async function tallyJudges(
  records: ReadonlyMap<string, CitedRecord>,
  claims: readonly ResultClaim[],
): Promise<JudgeTally> {
  let cited = 0;
  let notCarried = 0;
  let withheld = 0;
  let unread = 0;
  let unnamed = 0;
  let recomputedUnnamed = 0;
  const pins = new Map<
    string,
    { count: number; parts: Map<string, JudgePinComponents>; bare: number }
  >();
  const checkers = new Map<string, number>();
  for (const claim of claims) {
    // A claim with no evidence cites no report; one whose report is not in
    // the bundle still counts toward "N of M", as not carried.
    if (claim.evidence[0]?.digest === undefined) continue;
    const state = reportState(records, claim);
    cited += 1;
    if (state === "not_carried") {
      notCarried += 1;
      continue;
    }
    if (state === "withheld") {
      withheld += 1;
      continue;
    }
    if (state !== "disclosed") {
      unread += 1;
      continue;
    }
    const payload = reportPayload(records, claim);
    // "Recomputed" is decided by epistemic_type alone, checked before any
    // judge pin: a report can carry both a judge_pin_digest (kept for
    // traceability) and epistemic_type: "recomputed_determination", and
    // the card's own tier (keyed purely on epistemic_type) calls that
    // recomputed, not judged. Checking the pin first would contradict it,
    // the same way a bare checker_ref on a semantic_judgment report would.
    if (asString(payload?.epistemic_type) === "recomputed_determination") {
      const checker = asString(payload?.checker_ref);
      if (checker !== undefined)
        checkers.set(checker, (checkers.get(checker) ?? 0) + 1);
      else recomputedUnnamed += 1;
      continue;
    }
    const digest = asString(payload?.judge_pin_digest);
    if (digest !== undefined) {
      const entry = pins.get(digest) ?? {
        count: 0,
        parts: new Map<string, JudgePinComponents>(),
        bare: 0,
      };
      entry.count += 1;
      const parts = pinComponents(payload?.judge_pin);
      if (parts === undefined) entry.bare += 1;
      // Keyed by jcs's canonical bytes, not JSON.stringify: two reports
      // can state the same pin components with their keys in a different
      // order and still recompute to the same digest.
      else entry.parts.set(new TextDecoder().decode(jcs(parts)), parts);
      pins.set(digest, entry);
      continue;
    }
    unnamed += 1;
  }
  const counted: JudgePinCount[] = [];
  for (const [digest, entry] of pins) {
    let model: string | undefined;
    let modelNotShown: JudgePinCount["modelNotShown"];
    if (entry.parts.size === 0) modelNotShown = "not_stated";
    else if (entry.parts.size > 1) modelNotShown = "differs";
    else if (entry.bare > 0) modelNotShown = "partly_stated";
    else {
      const parts = [...entry.parts.values()][0]!;
      const checked = await verifyJudgePin({
        pinned: true,
        judgePinDigest: digest,
        judgePin: parts,
      });
      if (checked.judgePinRecomputes === true)
        model = quoted(
          parts.modelVersion === undefined
            ? parts.modelId
            : `${parts.modelId} ${parts.modelVersion}`,
        );
      else modelNotShown = "does_not_recompute";
    }
    counted.push({
      digest,
      count: entry.count,
      ...(model === undefined ? {} : { model }),
      ...(modelNotShown === undefined ? {} : { modelNotShown }),
    });
  }
  counted.sort((a, b) => b.count - a.count || (a.digest < b.digest ? -1 : 1));
  return {
    cited,
    notCarried,
    pins: counted,
    withheld,
    unread,
    checkers: [...checkers]
      .map(([ref, count]) => ({ ref, count }))
      .sort((a, b) => b.count - a.count || (a.ref < b.ref ? -1 : 1)),
    recomputedUnnamed,
    unnamed,
  };
}

// ---------------------------------------------------------------------------
// The three lines
// ---------------------------------------------------------------------------

export type ProvenanceState = "stated" | "withheld" | "not-stated" | "mixed";

export interface ProvenanceLine {
  readonly key: "judge" | "witness" | "verifier";
  readonly label: string;
  readonly text: string;
  /** A few words for the folded one-line summary; `text` is the whole line. */
  readonly brief: string;
  readonly state: ProvenanceState;
}

const fmt = (n: number): string => n.toLocaleString();
/** A bundle-supplied string, quoted and capped, so it can never read as this page's own words. */
const quoted = (value: string): string =>
  JSON.stringify(value.length > 120 ? `${value.slice(0, 120)}…` : value);
const HEX_DIGEST = /^[0-9a-f]+$/iu;
/**
 * The short form, but only for a value shaped like a hex digest: both
 * pin.digest and checkpoint.root are bundle-supplied, and truncating
 * anything else as though it were a digest would print it as this page's
 * own text (e.g. the string "VERIFIED BY ") instead of quoting it as the
 * bundle's.
 */
const short = (digest: string): string =>
  HEX_DIGEST.test(digest)
    ? digest.length > 12
      ? `${digest.slice(0, 12)}…`
      : digest
    : quoted(digest);

/**
 * Whether any judge pin the cited reports state names a mock backend. It
 * fails closed (decision D4): a model id that says "mock" may weaken the
 * page, but nothing here ever reads a model id as proof of a live judge.
 */
export function judgedByMock(tally: JudgeTally): boolean {
  return tally.pins.some(
    (pin) => pin.model !== undefined && /\bmock\b/i.test(pin.model),
  );
}

/** "Judged by", from the tally alone. */
export function judgeLine(
  tally: JudgeTally,
  w: Words = DEFAULT_WORDS.lines,
): ProvenanceLine {
  const label = w.t("prov.judge.label");
  const of = (n: number): string =>
    w.t("prov.of", { count: fmt(n), total: fmt(tally.cited) });
  if (tally.cited === 0)
    return {
      key: "judge",
      label,
      text: w.t("prov.judge.none"),
      brief: w.t("prov.brief.judge.not-stated"),
      state: "not-stated",
    };
  const parts: string[] = [];
  for (const pin of tally.pins) {
    const model =
      pin.model ??
      w.t(
        pin.modelNotShown === "does_not_recompute"
          ? "prov.judge.model.does-not-recompute"
          : pin.modelNotShown === "differs"
            ? "prov.judge.model.differs"
            : pin.modelNotShown === "partly_stated"
              ? "prov.judge.model.partly-stated"
              : "prov.judge.model.not-stated",
      );
    parts.push(
      w.t("prov.judge.pin", {
        model,
        pin: short(pin.digest),
        of: of(pin.count),
      }),
    );
  }
  if (tally.withheld > 0)
    parts.push(
      w.t(
        tally.withheld === tally.cited
          ? "prov.judge.all-withheld"
          : "prov.judge.some-withheld",
        { of: of(tally.withheld) },
      ),
    );
  if (tally.notCarried > 0)
    parts.push(w.t("prov.judge.not-carried", { of: of(tally.notCarried) }));
  if (tally.unread > 0)
    parts.push(w.t("prov.judge.unread", { of: of(tally.unread) }));
  const recomputed =
    tally.checkers.reduce((n, c) => n + c.count, 0) + tally.recomputedUnnamed;
  if (recomputed > 0) {
    const by = tally.checkers.map((c) =>
      w.t("prov.judge.checker", {
        checker: quoted(c.ref),
        count: fmt(c.count),
      }),
    );
    if (tally.recomputedUnnamed > 0)
      by.push(
        w.t("prov.judge.checker-not-stated", {
          count: fmt(tally.recomputedUnnamed),
        }),
      );
    parts.push(
      w.t("prov.judge.recomputed", { of: of(recomputed), by: by.join(", ") }),
    );
  }
  if (tally.unnamed > 0)
    parts.push(w.t("prov.judge.unnamed", { of: of(tally.unnamed) }));
  const judged = tally.pins.length;
  const state: ProvenanceState =
    tally.withheld === tally.cited
      ? "withheld"
      : judged > 1 ||
          (judged === 1 &&
            (tally.withheld > 0 ||
              tally.notCarried > 0 ||
              tally.unread > 0 ||
              tally.unnamed > 0))
        ? "mixed"
        : judged === 1
          ? "stated"
          : "not-stated";
  // No pin at all, and nothing else to say: the plain absence.
  if (parts.length === 0) parts.push(w.t("prov.judge.nothing"));
  return {
    key: "judge",
    label,
    text: parts.join("; "),
    // "mixed" with one pin means some results name no pin; only two or
    // more pins are "several".
    // A mock judge is said once, by the L0 mark (report-front.ts,
    // decision D5 (b)); the brief leaves the judge out rather than say it
    // again. The judge's full line stays in the opened block.
    brief: judgedByMock(tally)
      ? ""
      : w.t(
          state === "mixed" && judged === 1
            ? "prov.brief.judge.partial"
            : `prov.brief.judge.${state}`,
        ),
    state,
  };
}

export interface WitnessEntry {
  readonly url?: string;
  readonly treeSize?: number;
  readonly stub: boolean;
  /** Not an object: no witness can be read from it. */
  readonly malformed: boolean;
}

/**
 * Mirrors agent-action-capsule's witness.ts isRecord/RECORD_FIELDS (ts/v0.5.0;
 * neither is exported from the package, so this is a local copy): an entry
 * is a receipt only when it has every one of these fields, not merely when
 * it is some object.
 */
const RECEIPT_FIELDS = [
  "ts_url",
  "entry_hash",
  "receipt_b64",
  "leaf_index",
  "tree_size",
] as const;

function isReceipt(
  value: unknown,
): value is ObjectValue & { readonly ts_url: string } {
  return (
    isObject(value) &&
    typeof value.ts_url === "string" &&
    RECEIPT_FIELDS.every((name) => Object.hasOwn(value, name))
  );
}

export function witnessEntries(checkpoint: unknown): WitnessEntry[] {
  if (!isObject(checkpoint) || !Array.isArray(checkpoint.witnesses)) return [];
  return checkpoint.witnesses.map((w: unknown): WitnessEntry => {
    // Mirrors upstream verifyWitnessReceipts (AAC ts/v0.5.0 witness.ts:588-599):
    // isReceipt (its isRecord) runs first, and is_stub is only ever checked
    // on a full record. A stub is a declared placeholder on an otherwise
    // complete record, never a licence to omit the other receipt fields.
    if (!isReceipt(w)) return { stub: false, malformed: true };
    if (w.is_stub === true) return { stub: true, malformed: false };
    const size = w.tree_size;
    return {
      url: w.ts_url,
      ...(typeof size === "number" && Number.isSafeInteger(size)
        ? { treeSize: size }
        : {}),
      stub: false,
      malformed: false,
    };
  });
}

/**
 * "Witnessed by": the bundle's witness receipts, and the checkpoint they
 * would cover. The receipts are named as the bundle states them and said to
 * be stated by the bundle, not checked here (`prov.witness.stated`): this
 * page does not check witness receipts.
 */
export function witnessLine(
  bundle: unknown,
  verified: BundleVerificationResult,
  w: Words = DEFAULT_WORDS.lines,
): ProvenanceLine {
  const checkpoint = isObject(bundle) ? bundle.checkpoint : undefined;
  const page = buildVerificationPageModel(bundle, verified);
  const logId = isObject(checkpoint) ? asString(checkpoint.log_id) : undefined;
  const facts: string[] = [];
  if (logId !== undefined)
    facts.push(w.t("prov.witness.log", { log: quoted(logId) }));
  if (page.checkpointSize !== undefined)
    facts.push(w.t("prov.witness.size", { size: fmt(page.checkpointSize) }));
  if (page.checkpointRoot !== undefined)
    facts.push(w.t("prov.witness.root", { root: short(page.checkpointRoot) }));
  const unchecked = [
    verified.intervalCoverage,
    verified.perRecordMembership,
  ].some((claim) => claim.findings.includes("checkpoint_unverified"));
  const about =
    facts.length === 0
      ? []
      : [
          w.t(
            isObject(checkpoint) && typeof checkpoint.cose === "string"
              ? unchecked
                ? "prov.witness.about.unchecked"
                : "prov.witness.about"
              : "prov.witness.about.unsigned",
            { facts: facts.join(", ") },
          ),
        ];
  const all = witnessEntries(checkpoint);
  const entries = all.filter((e) => !e.stub && !e.malformed);
  const stubs = all.filter((e) => e.stub).length;
  const malformed = all.filter((e) => e.malformed).length;
  const others = [
    stubs === 0 ? "" : w.p("prov.witness.stubs", stubs, { n: fmt(stubs) }),
    malformed === 0
      ? ""
      : w.p("prov.witness.malformed", malformed, { n: fmt(malformed) }),
  ].filter((t) => t !== "");
  const besides =
    others.length === 0
      ? []
      : [
          w.t("prov.witness.besides", {
            others:
              others.length === 1
                ? others[0]!
                : w.t("prov.witness.both", { a: others[0]!, b: others[1]! }),
          }),
        ];
  const label = w.t("prov.witness.label");
  if (entries.length === 0)
    return {
      key: "witness",
      label,
      text: [w.t("prov.witness.none"), ...besides, ...about].join(" "),
      brief: w.t("prov.brief.witness.not-stated"),
      state: "not-stated",
    };
  const named = entries.map((e) => {
    const url =
      e.url === undefined
        ? w.t("prov.witness.receipt-not-stated")
        : quoted(e.url);
    return e.treeSize === undefined
      ? url
      : w.t("prov.witness.entry", { witness: url, size: fmt(e.treeSize) });
  });
  return {
    key: "witness",
    label,
    text: [
      w.t("prov.witness.stated", { witnesses: named.join("; ") }),
      ...besides,
      ...about,
    ].join(" "),
    brief: w.t(
      others.length === 0
        ? "prov.brief.witness.stated"
        : "prov.brief.witness.mixed",
    ),
    state: others.length === 0 ? "stated" : "mixed",
  };
}

/** "Verified by": the code that drew this page, and the producer the bundle names. */
export function verifierLine(
  bundle: unknown,
  /** The page's own build; `null` where a host's build states none. */
  build: ViewerBuild | null = VIEWER_BUILD,
  w: Words = DEFAULT_WORDS.lines,
): ProvenanceLine {
  const ran =
    build === null
      ? w.t("prov.verifier.ran.not-stated")
      : w.t(
          `prov.verifier.ran${build.cllVersion === undefined ? "" : ".cll"}`,
          {
            viewer: build.viewer,
            viewerVersion: build.viewerVersion,
            commit:
              build.commit === undefined
                ? w.t("prov.verifier.commit.not-stated")
                : build.commit,
            verifier: build.verifier,
            verifierVersion: build.verifierVersion,
            ...(build.cllVersion === undefined
              ? {}
              : { cll: build.cllVersion }),
          },
        );
  const report =
    isObject(bundle) && isObject(bundle.verification)
      ? bundle.verification
      : undefined;
  const producer = asString(report?.producer);
  const version =
    asString(report?.version) ?? asString(report?.producer_version);
  const built =
    producer === undefined
      ? w.t("prov.verifier.built.not-stated")
      : w.t("prov.verifier.built", {
          producer: quoted(producer),
          version:
            version === undefined
              ? w.t("prov.verifier.version.not-stated")
              : w.t("prov.verifier.version", { version: quoted(version) }),
        });
  return {
    key: "verifier",
    label: w.t("prov.verifier.label"),
    text: w.t("prov.verifier.text", { ran, built }),
    brief: w.t(
      build === null
        ? "prov.brief.verifier.not-stated"
        : "prov.brief.verifier.stated",
    ),
    state: build === null ? "not-stated" : "stated",
  };
}

export async function provenanceLines(
  records: ReadonlyMap<string, CitedRecord>,
  claims: readonly ResultClaim[],
  bundle: unknown,
  verified: BundleVerificationResult,
  w: Words = DEFAULT_WORDS.lines,
): Promise<ProvenanceLine[]> {
  return [
    judgeLine(await tallyJudges(records, claims), w),
    witnessLine(bundle, verified, w),
    verifierLine(bundle, VIEWER_BUILD, w),
  ];
}

/**
 * The block itself: one folded line of a few words per entry, and the full
 * list (pins, versions, checkpoint) inside, at level 1.
 */
export function renderProvenance(
  lines: readonly ProvenanceLine[],
): HTMLElement {
  const brief = document.createElement("span");
  brief.className = "prov-brief";
  brief.textContent = lines
    .map((line) => line.brief)
    .filter((text) => text !== "")
    .join(" · ");
  const toggle = levelToggle(
    1,
    brief,
    () => {
      const block = document.createElement("dl");
      block.className = "prov";
      for (const line of lines) {
        const dt = document.createElement("dt");
        dt.textContent = line.label;
        const dd = document.createElement("dd");
        dd.textContent = line.text;
        dd.dataset.prov = line.key;
        dd.dataset.state = line.state;
        block.append(dt, dd);
      }
      return block;
    },
    { className: "prov-fold", eager: true },
  );
  toggle.dataset.section = "provenance";
  return toggle;
}
