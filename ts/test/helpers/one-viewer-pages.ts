// SPDX-License-Identifier: Apache-2.0
/**
 * Every page-producing entry point of capsule-viewer with its fixtures, each
 * emitted as a host emits it, for the acceptance test of section 2.2 of
 * docs/design/one-viewer.md (row 2 of its section 3, capsule-viewer#524).
 *
 * Module pages (the receipts, provider, contract report, and a page with no
 * module) are emitted through `emitEvidenceGraphHtml` with the core runtime
 * built from `src/browser.ts` and the module script go/receipt ships, as
 * `capsulectl deal report --html` emits them. The History card and row view
 * come from `historyViewDocument`, and `historyViewHtml` inside a static
 * shell, as loop's copy embeds it.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import {
  emitEvidenceGraphHtml,
  escapeJsonForHtmlScript,
} from "../../src/emitter.js";
import {
  historyViewDocument,
  historyViewHtml,
  historyViewStyles,
} from "../../src/history-view.js";
import { jcs } from "@action-state-group/agent-action-capsule";
import { readdirSync } from "node:fs";
import { TEST_KEYS, sealEvidenceBundle } from "./sealed-bundle.js";

export type Obj = Record<string, unknown>;

const repo = (...parts: string[]): string =>
  readFileSync(resolve(process.cwd(), "..", ...parts), "utf8");
const json = (...parts: string[]): Obj => JSON.parse(repo(...parts)) as Obj;
const hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

let runtime: Promise<string> | undefined;
/** The core runtime as a page carries it, built once per run. */
function coreRuntime(): Promise<string> {
  runtime ??= build({
    entryPoints: [resolve(process.cwd(), "src", "browser.ts")],
    bundle: true,
    format: "iife",
    globalName: "EvidenceGraph",
    footer: {
      js: "globalThis.renderEvidenceGraph = EvidenceGraph.renderEvidenceGraph;",
    },
    write: false,
  }).then((r) => r.outputFiles[0]!.text);
  return runtime;
}

/** A go/receipt module script and the styles its manifest pins. */
function receiptModule(kind: string) {
  const code = repo("go", "receipt", `receipt_${kind}.js`);
  const manifest = json("go", "receipt", `manifest-${kind}.json`) as {
    executable: { style_sha256: string[] };
  };
  return {
    code,
    sha256: hex(code),
    styleSha256: manifest.executable.style_sha256,
  };
}

/** How the page carries what a reader re-checks. */
export type Shape =
  /** A bundle, drawn by the core runtime (and a module). */
  | "bundle"
  /** The History card: its own card bundle, as capsulectl verify answered it. */
  | "card"
  /** Rows with no bundle of their own (section 2.2 point 2's exception). */
  | "rows";

/** The core's one check list, as the page is expected to draw it. */
export interface CoreLists {
  readonly page: readonly string[];
  readonly failed: readonly string[];
  readonly notChecked: readonly string[];
  /** capsulectl's rows, `<name>:<status>`. */
  readonly capsulectl: readonly string[];
}

export interface PageCase {
  /** `<entry point> / <fixture>`. */
  readonly name: string;
  /** The entry point. */
  readonly entry: string;
  readonly shape: Shape;
  /** The bundle the page is drawn from (bundle pages). */
  readonly bundle?: Obj;
  /** capsulectl's report given beside the bundle, if any. */
  readonly report?: Obj;
  /** The shaped input (History pages). */
  readonly input?: Obj;
  /** The exact lists the page must draw, stated by hand (point 1). */
  readonly core?: CoreLists;
  /** For a negative fixture: the one check it targets, and what must hold first. */
  readonly target?: string;
  /** Run the page with no SubtleCrypto (a browser-capability negative case). */
  readonly noWebCrypto?: boolean;
  html(): Promise<string>;
}

function modulePage(
  entry: string,
  name: string,
  bundle: Obj,
  kind: string | null,
  options: Obj,
  extra: Partial<PageCase> = {},
): PageCase {
  const report = options["verifierReport"] as Obj | undefined;
  return {
    name: `${entry} / ${name}`,
    entry,
    shape: "bundle",
    bundle,
    ...(report === undefined ? {} : { report }),
    ...extra,
    async html() {
      const core = await coreRuntime();
      return emitEvidenceGraphHtml(bundle, core, {
        coreRuntimeSha256: hex(core),
        modules: kind === null ? [] : [receiptModule(kind)],
        bootstrap: `const OPTIONS = ${escapeJsonForHtmlScript(JSON.stringify({ depth: "L2", ...options }))}; window.__drawn = renderEvidenceGraph(window.__BUNDLE__, document.getElementById("app"), undefined, OPTIONS);`,
      });
    },
  };
}

const receipt = (name: string): Obj =>
  json("tests", "testdata", "receipt", name);
const dealV1 = (...p: string[]): Obj =>
  json("tests", "testdata", "deal-v1", ...p);

/** The checks AAC's strict verifier runs on a fully signed bundle in a browser. */
const ALL_PAGE = [
  "record-digests",
  "record-rules",
  "closure",
  "range",
  "membership",
  "checkpoint-signature",
  "disclosures",
  "producer-signatures",
];
const none = { failed: [], notChecked: [], capsulectl: [] };

function v0Pages(): PageCase[] {
  const pages: [string, string][] = [
    ["unilateral", "keep"],
    ["unilateral", "counterparty"],
    ["unilateral", "adjudicator"],
    ["seller", "seller-keep"],
    ["seller", "seller-counterparty"],
    ["bilateral", "bilateral-keep"],
    ["bilateral", "bilateral-counterparty"],
  ];
  return [
    ...pages.map(([kind, f]) =>
      modulePage(
        `receipt ${kind}/v0`,
        f,
        receipt(`${f}.bundle.json`),
        kind,
        { verifierReport: receipt(`${f}.verify.json`) },
        {
          core: {
            ...none,
            page:
              kind === "bilateral"
                ? [...ALL_PAGE.slice(0, 7), "composed", ALL_PAGE[7]!]
                : ALL_PAGE,
          },
        },
      ),
    ),
    // Negative: capsulectl's report for another bundle, which the page must refuse;
    // the page's own checks still run.
    modulePage(
      "receipt unilateral/v0",
      "keep + another bundle's report",
      receipt("keep.bundle.json"),
      "unilateral",
      { verifierReport: receipt("counterparty.verify.json") },
      { core: { ...none, page: ALL_PAGE }, target: "report-refused" },
    ),
  ];
}

function providerPages(): PageCase[] {
  return [
    modulePage(
      "receipt provider/v0",
      "mesh-provider-selected",
      receipt("mesh-provider-selected.bundle.json"),
      "provider",
      { verifierReport: receipt("mesh-provider-selected.verify.json") },
    ),
    // Negative: no report beside the bundle.
    modulePage(
      "receipt provider/v0",
      "mesh-provider-selected, no report",
      receipt("mesh-provider-selected.bundle.json"),
      "provider",
      {},
      { target: "no-report" },
    ),
  ];
}

const V1_REPORTED = [
  "producer_signatures:pass",
  "interval_coverage:pass",
  "graph_closure:pass",
  "per_record_membership:pass",
  "checkpoint:pass",
];

function dealV1Pages(): PageCase[] {
  const page = (
    path: string[],
    capsulectl: string[],
    options: Obj = {},
    extra: Partial<PageCase> = {},
  ): PageCase => {
    const name = path[path.length - 1]!;
    const dir = path.slice(0, -1);
    return modulePage(
      "receipt deal/v1",
      (extra.name as string | undefined) ?? path.join("/"),
      dealV1(...dir, `${name}.bundle.json`),
      "deal",
      { verifierReport: dealV1(...dir, `${name}.verify.json`), ...options },
      { core: { ...none, page: ALL_PAGE, capsulectl }, ...extra },
    );
  };
  return [
    page(
      ["ruled-dispute"],
      [...V1_REPORTED, "counterparty_half:pass", "witnesses:pass"],
    ),
    // Case: a check only capsulectl reported (the witness), and a withheld input.
    page(["keep-copy"], [...V1_REPORTED, "witnesses:withheld"]),
    page(["counterparty-copy"], [...V1_REPORTED, "witnesses:withheld"]),
    page(
      ["view-model", "adjudicator-copy"],
      [...V1_REPORTED, "witnesses:withheld"],
    ),
    // Negative: no report beside the copy: capsulectl's rows are gone, the
    // page's own checks stay, and the receipt says it cannot check the report.
    modulePage(
      "receipt deal/v1",
      "keep-copy, no report",
      dealV1("keep-copy.bundle.json"),
      "deal",
      {},
      { core: { ...none, page: ALL_PAGE }, target: "no-report" },
    ),
    // Case: a verifier report for another bundle, which the page refuses.
    modulePage(
      "receipt deal/v1",
      "keep-copy + another bundle's report",
      dealV1("keep-copy.bundle.json"),
      "deal",
      { verifierReport: dealV1("ruled-dispute.verify.json") },
      { core: { ...none, page: ALL_PAGE }, target: "report-refused" },
    ),
  ];
}

/** A small signed bundle with no module: the core's own checks. */
const signedSource = (): Obj => ({
  root: "deal",
  records: [
    { capsule_id: "act", key_id: TEST_KEYS.a },
    {
      capsule_id: "deal",
      key_id: TEST_KEYS.a,
      chain: { parent_capsule_id: "act", relation: "derived_from" },
    },
  ],
  disclosures: {
    act: { agent_output: { step: "act", amount: 1 } },
    deal: { agent_input: { spec_version: "x-example-deal/v0", step: "open" } },
  },
});

async function corePages(): Promise<PageCase[]> {
  const signed = (
    await sealEvidenceBundle(signedSource(), { signCheckpoint: true })
  ).bundle as Obj;
  const unsigned = (await sealEvidenceBundle(signedSource())).bundle as Obj;
  const forged = structuredClone(signed);
  (forged["checkpoint"] as Obj)["timestamp"] = "2026-09-15T00:00:00Z";
  const all = [
    "record-digests",
    "record-rules",
    "closure",
    "range",
    "membership",
    "checkpoint-signature",
    "disclosures",
    "producer-signatures",
  ];
  return [
    // Case: checks the page ran.
    modulePage(
      "core (no module)",
      "signed",
      signed,
      null,
      {},
      {
        core: { ...none, page: all },
      },
    ),
    // Case: a check absent from both (no checkpoint signature, no report).
    modulePage(
      "core (no module)",
      "unsigned checkpoint",
      unsigned,
      null,
      {},
      {
        target: "checkpoint-signature claimed by no one",
      },
    ),
    // Case: a failed check.
    modulePage(
      "core (no module)",
      "forged checkpoint",
      forged,
      null,
      {},
      {
        target: "checkpoint-signature failed",
      },
    ),
    // A browser with no SubtleCrypto cannot check producer signatures.
    modulePage(
      "core (no module)",
      "signed, no SubtleCrypto",
      signed,
      null,
      {},
      {
        noWebCrypto: true,
        target: "producer-signatures not run",
      },
    ),
  ];
}

const historyCases = (): Record<string, Obj> =>
  (
    json("vectors", "history-view", "cases.json") as {
      cases: Record<string, Obj>;
    }
  ).cases;

const historyDocument = (
  entry: string,
  name: string,
  input: Obj,
  extra: Partial<PageCase> = {},
): PageCase => ({
  name: `${entry} / ${name}`,
  entry,
  shape: "machine" in input ? "card" : "rows",
  input,
  ...extra,
  async html() {
    return historyViewDocument(input);
  },
});

/**
 * A real capsulectl History card with capsulectl verify's real answer for it
 * (tests/testdata/standard-history), as history-view-card.test.ts builds one.
 * The vectors' card cases carry made-up card text that no verifier passes, so
 * they are shapes, not pages a reader re-checks, and are left out here.
 */
function realCard(name: string): Obj {
  // A holder's own card is drawn as the holder's (the vectors' card-yours-empty frame).
  const own = name.endsWith("-own")
    ? (({ machine: _m, ...frame }) => frame)(
        historyCases()["card-yours-empty"]!,
      )
    : undefined;
  const dir = ["tests", "testdata", "standard-history"];
  const text = new TextDecoder().decode(
    jcs(json(...dir, `${name}.bundle.json`)),
  );
  const out = json(...dir, "verify", `${name}.json`) as Record<string, Obj>;
  return {
    ...(own ?? {}),
    ...(own !== undefined
      ? {}
      : {
          view: "history-view/v0",
          kind: "deal",
          surface: "neutral",
          reader: "recipient",
          holder: { name: "Rowan" },
          audience: { kind: "shared" },
          built_at: "2026-11-27T03:15:00Z",
          checked: { where: "builder", by: "capsulectl verify" },
          rows: [],
          checks: [],
        }),
    machine: {
      file: `${name}.json`,
      text,
      verify: {
        verdict: out["verdict"],
        bundle_digest: out["bundle_digest"],
        checks: Object.fromEntries(
          [
            "producer_signatures",
            "interval_coverage",
            "graph_closure",
            "per_record_membership",
            "checkpoint",
            "witnesses",
          ].map((k) => [k, out[k]!["status"]]),
        ),
      },
    },
  };
}

function historyPages(): PageCase[] {
  const cases = historyCases();
  const out: PageCase[] = [];
  for (const [name, input] of Object.entries(cases)) {
    if (name.startsWith("card-")) continue;
    // Negative: a case whose checks did not run reads not run, with no "ran" line.
    const target =
      name === "goose-no-checkpoints" ? { target: "rows not run" } : {};
    out.push(historyDocument("historyViewDocument", name, input, target));
    out.push({
      name: `historyViewHtml / ${name}`,
      entry: "historyViewHtml",
      shape: "rows",
      input,
      ...target,
      async html() {
        return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>History</title><style>${historyViewStyles}</style></head><body>${historyViewHtml(input)}</body></html>\n`;
      },
    });
  }
  const cards = readdirSync(
    resolve(
      process.cwd(),
      "..",
      "tests",
      "testdata",
      "standard-history",
      "verify",
    ),
  ).map((f) => f.replace(/\.json$/u, ""));
  for (const name of cards)
    out.push(historyDocument("History card", name, realCard(name)));
  // Negative: capsulectl's answer leaves one check out: that row reads not run.
  const card = realCard("person-shared");
  delete (((card["machine"] as Obj)["verify"] as Obj)["checks"] as Obj)[
    "graph_closure"
  ];
  out.push(
    historyDocument(
      "History card",
      "person-shared, graph_closure not answered",
      card,
      {
        target: "graph_closure not run",
      },
    ),
  );
  return out;
}

function contractReportPages(): PageCase[] {
  const cases = (
    json("vectors", "contract-report-page", "cases.json") as {
      cases: { name: string; bundle: Obj }[];
    }
  ).cases;
  return [
    ...cases.map((c) =>
      modulePage("contract report", c.name, c.bundle, null, {}),
    ),
    // Negative: the vectors' reports are not signed, so no signature check ran.
    modulePage(
      "contract report",
      "result-generic, unsigned",
      cases[0]!.bundle,
      null,
      {},
      {
        target: "unsigned: not verified",
      },
    ),
  ];
}

export async function allPages(): Promise<PageCase[]> {
  return [
    ...v0Pages(),
    ...providerPages(),
    ...dealV1Pages(),
    ...(await corePages()),
    ...historyPages(),
    ...contractReportPages(),
  ];
}
