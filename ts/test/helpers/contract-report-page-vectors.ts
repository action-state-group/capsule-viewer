// SPDX-License-Identifier: BSD-3-Clause
// The contract-report page vectors (vectors/contract-report-page/): each case
// is a Result-rooted Bundle v2 and a view, and the page sections a
// conforming implementation draws from them, as structured data (not HTML
// bytes): the core strip and the module's rows, asserted separately.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderEvidenceGraph } from "../../src/browser.js";
import { sealEvidenceBundle } from "./sealed-bundle.js";

type Obj = Record<string, unknown>;

const TESTDATA = resolve(process.cwd(), "test", "testdata");
const fixture = (name: string): Obj =>
  JSON.parse(readFileSync(resolve(TESTDATA, name), "utf8")) as Obj;

/** A pair of data-* attributes, name without the `data-` prefix, sorted by name. */
function dataAttrs(node: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of [...node.attributes].sort((a, b) =>
    a.name < b.name ? -1 : 1,
  ))
    if (attr.name.startsWith("data-") && attr.name !== "data-wording")
      out[attr.name.slice(5)] = attr.value;
  return out;
}

const text = (node: Element | null | undefined): string | null =>
  node == null ? null : (node.textContent ?? "").replace(/\s+/g, " ").trim();

export interface CoreStrip {
  /** The verification banner's markers (data-verify, -verdict, -checkpoint, -uncheckpointed) and its line. */
  banner: Record<string, string> | null;
  banner_text: string | null;
  kicker: string | null;
  facts: string | null;
  mock_mark: string | null;
  coverage: Record<string, string> | null;
  coverage_text: string | null;
  tiles: { bucket: string; count: string; of: string; label: string }[];
}

/**
 * The core strip (banner is the kicker line, period and pack the facts line,
 * coverage the aggregate line, the three tiles the buckets), read from the
 * core's own markers: `[data-core-strip]` and what it carries.
 */
export function coreStrip(root: Element): CoreStrip {
  const strip = root.querySelector("[data-core-strip]")!;
  const line = strip.querySelector("[data-evaluated]");
  const banner = root.querySelector("[data-verify]");
  return {
    banner: banner === null ? null : dataAttrs(banner),
    banner_text: text(banner),
    kicker: text(strip.querySelector("[data-core-kicker]")),
    facts: text(strip.querySelector("[data-core-facts]")),
    mock_mark: text(strip.querySelector(".mockmark")),
    coverage: line === null ? null : dataAttrs(line),
    coverage_text: text(line),
    tiles: [...strip.querySelectorAll("[data-bucket]")].map((tile) => ({
      bucket: tile.getAttribute("data-bucket")!,
      count: tile.getAttribute("data-count")!,
      of: tile.getAttribute("data-of")!,
      label: text(tile.querySelector("span[data-src]"))!,
    })),
  };
}

export interface ModuleRows {
  grouping: string;
  page: string[];
  headline: string | null;
  rows: Record<string, string>[];
}

/**
 * The module's rows, by grouping, each row as its data-* markers (the
 * bundle's own tokens, never wording): `generic` each claim under its row,
 * `groups` the obligation and test rows, `lines` the result lines.
 */
export function moduleRows(root: Element, grouping: string): ModuleRows {
  // The module's own pages: the core's verification section is not the module's.
  const pages = [
    ...root.querySelectorAll('[data-page]:not([data-page="verification"])'),
  ];
  const rows = pages.flatMap((region) => {
    if (grouping === "generic")
      // One entry per claim, under the row (requirement) and contract it is
      // grouped by: the module's own `data-row`, `data-contract`,
      // `data-claim-ref` and `data-verdict` markers.
      return [...region.querySelectorAll("[data-row]")].flatMap((row) =>
        [...row.querySelectorAll("li[data-claim-ref]")].map((claim) => ({
          row: row.getAttribute("data-row")!,
          contract: row.getAttribute("data-contract")!,
          claim: claim.getAttribute("data-claim-ref")!,
          verdict: claim
            .querySelector("[data-verdict]")!
            .getAttribute("data-verdict")!,
        })),
      );
    const selector =
      grouping === "groups"
        ? "tr[data-obligation], tr[data-criterion]"
        : "tr[data-line]";
    return [...region.querySelectorAll(selector)].map(dataAttrs);
  });
  return {
    grouping,
    // The module's own page marker: the module that drew the rows.
    page: [...new Set(pages.map((p) => p.getAttribute("data-page")!))],
    headline: text(pages[0]?.querySelector("[data-headline]")),
    rows,
  };
}

export interface PageCase {
  name: string;
  /** What the case pins, one sentence. */
  about: string;
  grouping: "generic" | "groups";
  bundle: Obj;
  /** The view: the audience wording pack name (null: the default pack). */
  view: { wording: string | null };
  /** Strings that must not appear anywhere in the page's text. */
  absent: string[];
  expected: { core_strip: CoreStrip; module_rows: ModuleRows };
}

function claims(source: Obj): Obj[] {
  return (((source.disclosures as Obj).result as Obj).agent_input as Obj)
    .claims as Obj[];
}

/** Drop a claim from the Result, its sealed buckets and its coverage figure. */
function dropClaim(source: Obj, id: string): void {
  const doc = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
  const agg = doc.aggregate as Obj;
  const buckets = Object.fromEntries(
    Object.entries(agg.buckets as Record<string, string[]>).map(([k, ids]) => [
      k,
      ids.filter((x) => x !== id),
    ]),
  );
  const cov = agg.coverage as Obj;
  doc.claims = claims(source).filter((c) => c.id !== id);
  doc.aggregate = {
    ...agg,
    buckets,
    coverage: {
      ...cov,
      evaluated_population: (cov.evaluated_population as number) - 1,
    },
  };
}

const WORDING = resolve(process.cwd(), "src", "wording");
export function audiencePack(file: string): { pack: string; sha256: string } {
  const lock = JSON.parse(
    readFileSync(resolve(WORDING, "audience-packs.lock.json"), "utf8"),
  ) as Record<string, { sha256: string }>;
  return {
    pack: readFileSync(resolve(WORDING, file), "utf8"),
    sha256: lock[file]!.sha256,
  };
}

interface Spec {
  name: string;
  about: string;
  file: string;
  grouping: "generic" | "groups";
  mutate?: (source: Obj) => void;
  wording?: string;
  absent?: string[];
}

const SPECS: readonly Spec[] = [
  {
    name: "result-generic",
    about:
      "A Result with one met, one not met and one not evaluable claim: the strip's three tiles each beside their denominator, and one row per claim with its verdict token; the not-evaluable claim is counted only in its own tile and its row says not_evaluable (never omitted, never upgraded to met).",
    file: "result-root-bundle.json",
    grouping: "generic",
  },
  {
    name: "result-generic-claim-not-carried",
    about:
      "The same Result with claim-3 not in the bundle: no row, tile count or identifier for it appears (a claim the bundle does not carry never appears).",
    file: "result-root-bundle.json",
    grouping: "generic",
    mutate: (s) => dropClaim(s, "claim-3"),
    absent: ["claim-3", "req-3"],
  },
  {
    name: "eu-groups",
    about:
      "The EU AI Act Result (grouping groups): obligation rows and test rows with their population, exception and not-evaluable counts, under the strip.",
    file: "compliance-bundle.json",
    grouping: "groups",
  },
];

/** Generate every case from the committed fixtures and the renderer. */
export async function generatePageVectors(): Promise<PageCase[]> {
  const out: PageCase[] = [];
  for (const spec of SPECS) {
    const source = fixture(spec.file);
    // The producer's opt-in: the block is empty (contract-report/v1 section 1).
    source.extensions = {
      ...((source.extensions as Obj | undefined) ?? {}),
      "contract-report/v1": {},
    };
    spec.mutate?.(source);
    const { bundle } = await sealEvidenceBundle(source);
    const drawn = await drawCase(
      bundle,
      spec.wording === undefined ? undefined : audiencePack(spec.wording),
      spec.grouping,
    );
    out.push({
      name: spec.name,
      about: spec.about,
      grouping: spec.grouping,
      bundle,
      view: { wording: spec.wording ?? null },
      absent: spec.absent ?? [],
      expected: {
        core_strip: drawn.core_strip,
        module_rows: drawn.module_rows,
      },
    });
  }
  return out;
}

/** The page text of a rendering, for the `absent` check. */
export function pageText(root: Element): string {
  return root.textContent ?? "";
}

/** Open every toggle, again and again, until none is left closed (a body can hold toggles of its own). */
export function openAll(root: Element): void {
  for (;;) {
    const closed = [...root.querySelectorAll("details")].filter(
      (d) => !(d as HTMLDetailsElement).open,
    );
    if (closed.length === 0) return;
    for (const details of closed) {
      (details as HTMLDetailsElement).open = true;
      details.dispatchEvent(new Event("toggle"));
    }
  }
}

/** Draw a case's page as a reader gets it with every toggle open, and read its sections. */
export async function drawCase(
  bundle: Obj,
  wording: { pack: string; sha256: string } | undefined,
  grouping: string,
): Promise<{
  root: HTMLElement;
  core_strip: CoreStrip;
  module_rows: ModuleRows;
}> {
  const root = document.createElement("main");
  await renderEvidenceGraph(
    bundle,
    root,
    undefined,
    wording === undefined ? {} : { wording },
  );
  openAll(root);
  return {
    root,
    core_strip: coreStrip(root),
    module_rows: moduleRows(root, grouping),
  };
}
