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
  return {
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
  headline: string | null;
  rows: Record<string, string>[];
}

/**
 * The module's rows, by grouping, each row as its data-* markers (the
 * bundle's own tokens, never wording): `generic` the claim rows (with their
 * cells' markers), `groups` the obligation and test rows, `lines` the
 * result lines.
 */
export function moduleRows(root: Element, grouping: string): ModuleRows {
  const selector =
    grouping === "generic"
      ? "tr[data-claim-row]"
      : grouping === "groups"
        ? "tr[data-obligation], tr[data-criterion]"
        : "tr[data-line]";
  const page = [...root.querySelectorAll("[data-page]")];
  const rows = page.flatMap((region) =>
    [...region.querySelectorAll(selector)].map((row) => {
      const merged = dataAttrs(row);
      if (grouping === "generic")
        for (const cell of row.querySelectorAll(
          "td[data-sufficiency], td[data-verdict], td[data-tier], td[data-grade], td[data-claim-type]",
        ))
          Object.assign(merged, dataAttrs(cell));
      return merged;
    }),
  );
  return {
    grouping,
    headline: text(page[0]?.querySelector("[data-headline]")),
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
function audiencePack(file: string): { pack: string; sha256: string } {
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
  {
    name: "eu-groups-deployer-pack",
    about:
      "The same Result under the EU deployer audience pack: the strip's figures and every row marker are those of the default pack; only words differ.",
    file: "compliance-bundle.json",
    grouping: "groups",
    wording: "contract-report-eu-deployer.en.json",
  },
];

/** Generate every case from the committed fixtures and the renderer. */
export async function generatePageVectors(): Promise<PageCase[]> {
  const out: PageCase[] = [];
  for (const spec of SPECS) {
    const source = fixture(spec.file);
    spec.mutate?.(source);
    const { bundle } = await sealEvidenceBundle(source);
    const root = document.createElement("main");
    await renderEvidenceGraph(
      bundle,
      root,
      undefined,
      spec.wording === undefined ? {} : { wording: audiencePack(spec.wording) },
    );
    out.push({
      name: spec.name,
      about: spec.about,
      grouping: spec.grouping,
      bundle,
      view: { wording: spec.wording ?? null },
      absent: spec.absent ?? [],
      expected: {
        core_strip: coreStrip(root),
        module_rows: moduleRows(root, spec.grouping),
      },
    });
  }
  return out;
}

/** The page text of a rendering, for the `absent` check. */
export function pageText(root: Element): string {
  return root.textContent ?? "";
}
