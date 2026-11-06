// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

// The core strip (core-strip.ts, capsule-viewer#81): on every page whose
// bundle carries an Evidence Result, the core draws coverage and the bucket
// counts first in L0, each count beside its denominator, whichever module
// or layout draws the rest. Content a module puts above it, or a change to
// it, is discarded for the refusal; a page with no Result draws no strip,
// and a module that draws the Result's count marks there is refused too.
// Each negative case below is drawn by the rendering before #81 without a
// refusal and without a strip, so it fails there.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import {
  PresentationRegistry,
  type PresentationHost,
  type PresentationManifest,
} from "../src/presentation-registry.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

const testdata = resolve(process.cwd(), "test", "testdata");
const fixture = (name: string): Obj =>
  JSON.parse(readFileSync(resolve(testdata, name), "utf8")) as Obj;
// The Result document wherever the bundle carries it (as the root's
// disclosed member, or a book record's header).
function resultDoc(source: Obj): Obj {
  const seen: unknown[] = [source];
  while (seen.length > 0) {
    const at = seen.pop();
    if (typeof at !== "object" || at === null) continue;
    if ("aggregate" in at && "claims" in at) return at as Obj;
    seen.push(...Object.values(at));
  }
  throw new Error("no Result document");
}

async function render(
  source: Obj,
  registry?: PresentationRegistry,
): Promise<HTMLElement> {
  const { bundle } = await sealEvidenceBundle(source);
  // In the document, so the frame's computed look is checked.
  const root = document.body.appendChild(document.createElement("main"));
  await renderEvidenceGraph(
    bundle,
    root,
    undefined,
    registry === undefined ? {} : { registry },
  );
  return root;
}

const L0 = (root: HTMLElement): HTMLElement =>
  root.querySelector<HTMLElement>('[data-region="L0"]')!;
const strip = (root: HTMLElement): HTMLElement | null =>
  root.querySelector<HTMLElement>("[data-core-strip]");
const refused = (root: HTMLElement): boolean =>
  root.querySelector('[data-refusal="presentation-failed"]') !== null;

// A module that matches any verified bundle, alone in its registry, and
// draws what `draw` writes.
function registryWith(
  draw: (host: PresentationHost) => void,
): PresentationRegistry {
  const manifest = {
    spec_version: "aac.presentation-manifest/v0",
    id: "org.example.strip-probe/v0",
    presentation_api: "aac.presentation-api/v0",
    runtime_min: "0.1.0",
    trust_class: "trusted-executable",
    requires: { bundle_kind: "evidence-bundle/v2" },
    audiences: ["*"],
    formats: ["html", "fragment", "embedded"],
    fallback: true,
    executable: { carrier: "module-slot", script_sha256: "0".repeat(64) },
  } as PresentationManifest;
  const registry = new PresentationRegistry();
  registry.register({
    manifest,
    canRender: () => true,
    buildModel: () => null,
    render: (_model, host) => {
      const own = document.createElement("p");
      own.dataset.testModule = "";
      own.textContent = "module content";
      host.L0.append(own);
      draw(host);
    },
  });
  return registry;
}

// A verified bundle whose root is no Result (report/v1 rows).
const rowsBundle = (): Obj => fixture("report-rows-bundle.json");

const RESULT_PAGES = [
  ["the generic Result page", "result-root-bundle.json"],
  ["a book-carried Result", "result-root-book-bundle.json"],
  ["the outcome card", "outcome-report-bundle.json"],
  ["the EU card", "compliance-bundle.json"],
] as const;

describe("the strip opens L0 on every Result page", () => {
  for (const [name, file] of RESULT_PAGES)
    it(`${name}: coverage first, then each bucket beside its denominator, no percentage`, async () => {
      const source = fixture(file);
      const aggregate = resultDoc(source).aggregate as Obj;
      const population = (aggregate.coverage as Obj)
        .evaluated_population as number;
      const root = await render(source);
      const s = strip(root)!;
      expect(s).not.toBeNull();
      // First in L0, and L0 right after the banner.
      expect(L0(root).firstChild).toBe(s);
      expect(
        (L0(root).previousElementSibling as HTMLElement).matches(
          "[data-banner-detail], .cv-shell-bar",
        ),
      ).toBe(true);
      // The CORE identity line (as the Terms Pack canvas opens), coverage,
      // then the buckets.
      const kids = [...s.children].filter((c) => c.tagName !== "STYLE");
      expect(kids[0]!.className).toBe("core-id");
      expect(kids[1]!.className).toBe("agg-line");
      expect(kids[2]!.className).toBe("agg-buckets");
      // Every bucket the Result seals, each with its count of the
      // evaluated population.
      const tiles = [...s.querySelectorAll<HTMLElement>("[data-bucket]")];
      expect(tiles.map((t) => t.dataset.bucket)).toEqual(
        Object.keys(aggregate.buckets as Obj),
      );
      for (const tile of tiles) {
        const ids = (aggregate.buckets as Obj)[
          tile.dataset.bucket!
        ] as unknown[];
        expect(tile.dataset.count).toBe(String(ids.length));
        expect(tile.dataset.of).toBe(String(population));
        expect(tile.querySelector(".agg-of")!.textContent).toBe(
          `of ${population.toLocaleString("en-US")} evaluations`,
        );
      }
      // Every not-met claim in force is counted (ER section 3: each in-force
      // claim is in exactly one bucket, by its verdict).
      const notMet = (resultDoc(source).claims as Obj[]).filter(
        (c) => c.verdict === "not_met",
      ).length;
      expect(
        s.querySelector<HTMLElement>('[data-bucket="not_met"]')!.dataset.count,
      ).toBe(String(notMet));
      expect(s.textContent).not.toMatch(/%/u);
      // One strip on the page, and nothing a module drew beside it.
      expect(
        root.querySelectorAll("[data-core-strip], .cv-strip"),
      ).toHaveLength(1);
      expect(refused(root)).toBe(false);
    });

  it("a module that draws nothing still leaves every not-met claim counted in the strip", async () => {
    const root = await render(
      fixture("outcome-report-bundle.json"),
      registryWith(() => {}),
    );
    const notMet = strip(root)!.querySelector<HTMLElement>(
      '[data-bucket="not_met"]',
    )!;
    expect(notMet.dataset.count).toBe("155");
    expect(refused(root)).toBe(false);
  });

  it("the strip is drawn again, first in L0, when a module is discarded", async () => {
    const root = await render(
      fixture("result-root-bundle.json"),
      registryWith((host) => {
        throw new Error(`refused ${host.depth}`);
      }),
    );
    expect(refused(root)).toBe(true);
    expect(L0(root).firstChild).toBe(strip(root));
  });
});

describe("a page with no Result draws no strip", () => {
  for (const file of ["report-rows-bundle.json", "week-bundle.json"])
    it(`${file}: no strip`, async () => {
      const root = await render(fixture(file));
      expect(root.querySelector('[data-verify="incomplete"]')).not.toBeNull();
      expect(strip(root)).toBeNull();
    });
});

describe("a module or layout that writes above the strip, or changes it, is discarded for the refusal", () => {
  const CASES: readonly [string, (host: PresentationHost) => void][] = [
    [
      "a headline put before the strip",
      (host) => {
        const h = document.createElement("h1");
        h.textContent = "98% resolved";
        host.L0.prepend(h);
      },
    ],
    [
      "a bare text node put before the strip",
      (host) => host.L0.prepend("All good. "),
    ],
    [
      "a KPI tile put between the banner and L0",
      (host) => {
        const tile = document.createElement("div");
        tile.textContent = "98%";
        host.L0.before(tile);
      },
    ],
    [
      "a count in the strip rewritten",
      (host) => {
        host.L0.querySelector('[data-bucket="not_met"] b')!.textContent = "0";
      },
    ],
    [
      "a bucket removed from the strip",
      (host) => host.L0.querySelector('[data-bucket="not_met"]')!.remove(),
    ],
    [
      "the strip moved below the module's content",
      (host) => host.L0.append(host.L0.querySelector("[data-core-strip]")!),
    ],
    [
      "the strip hidden",
      (host) => {
        (host.L0.querySelector("[data-core-strip]") as HTMLElement).hidden =
          true;
      },
    ],
    [
      "the strip hidden by an important style on L0",
      (host) => {
        host.L0.style.setProperty("display", "none", "important");
      },
    ],
    [
      "a module stylesheet that greys a count out",
      (host) => {
        const style = document.createElement("style");
        style.textContent = '[data-bucket="not_met"] b{color:transparent}';
        host.L1.append(style);
      },
    ],
    [
      "a second strip drawn in L1",
      (host) => {
        const fake = document.createElement("section");
        fake.className = "cv-strip";
        fake.textContent = "0 Not met";
        host.L1.append(fake);
      },
    ],
  ];
  for (const [name, draw] of CASES)
    it(name, async () => {
      const root = await render(
        fixture("result-root-bundle.json"),
        registryWith(draw),
      );
      expect(refused(root)).toBe(true);
      expect(root.querySelector("[data-test-module]")).toBeNull();
      // The core's strip is drawn again, first in L0, as sealed.
      const s = strip(root)!;
      expect(L0(root).firstChild).toBe(s);
      expect(
        s.querySelector<HTMLElement>('[data-bucket="not_met"]')!.dataset.count,
      ).toBe("1");
      expect(
        root.querySelectorAll("[data-core-strip], .cv-strip"),
      ).toHaveLength(1);
    });

  it("a module that writes after the strip renders", async () => {
    const root = await render(
      fixture("result-root-bundle.json"),
      registryWith(() => {}),
    );
    expect(refused(root)).toBe(false);
    const kids = [...L0(root).childNodes];
    expect(kids[0]).toBe(strip(root));
    expect((kids[1] as HTMLElement).dataset.testModule).toBe("");
  });
});

it("a section that writes above the strip is discarded for the refusal too", async () => {
  const { bundle } = await sealEvidenceBundle(
    fixture("result-root-bundle.json"),
  );
  const root = document.body.appendChild(document.createElement("main"));
  await renderEvidenceGraph(bundle, root, undefined, {
    sections: registryWith((host) => {
      const h = document.createElement("h1");
      h.textContent = "98% resolved";
      host.L0.prepend(h);
    }),
  });
  expect(refused(root)).toBe(true);
  expect(root.querySelector("[data-test-module]")).toBeNull();
  expect(L0(root).firstChild).toBe(strip(root));
});

describe("on a page with no Result, a module that draws the Result's counts is refused", () => {
  const CASES: readonly [string, (host: PresentationHost) => void][] = [
    [
      "a forged strip",
      (host) => {
        const fake = document.createElement("section");
        fake.setAttribute("data-core-strip", "");
        fake.textContent = "12 Met";
        host.L0.prepend(fake);
      },
    ],
    [
      "a bucket tally",
      (host) => {
        const tile = document.createElement("div");
        tile.dataset.bucket = "not_met";
        tile.textContent = "3 not met";
        host.L1.append(tile);
      },
    ],
    [
      "a bucket count",
      (host) => {
        const heading = document.createElement("h3");
        heading.dataset.bucketCount = "3";
        heading.textContent = "not met: 3";
        host.L1.append(heading);
      },
    ],
    [
      "a count-mismatch marker",
      (host) => {
        const marker = document.createElement("span");
        marker.dataset.countMismatch = "buckets.not_met";
        marker.textContent = "count mismatch: the claims give 3";
        host.L1.append(marker);
      },
    ],
  ];
  for (const [name, draw] of CASES)
    it(name, async () => {
      const root = await render(rowsBundle(), registryWith(draw));
      expect(refused(root)).toBe(true);
      expect(root.querySelector("[data-test-module]")).toBeNull();
      expect(strip(root)).toBeNull();
    });

  // A composed layout reaches the page as a section, after the page's
  // module, into the same regions (renderVerifiedContext); an agent-written
  // layout is drawn the same way once #82's renderer lands.
  it("a composed layout (a section) that draws a bucket tally there", async () => {
    const { bundle } = await sealEvidenceBundle(rowsBundle());
    const root = document.body.appendChild(document.createElement("main"));
    await renderEvidenceGraph(bundle, root, undefined, {
      sections: registryWith((host) => {
        const tile = document.createElement("div");
        tile.dataset.bucket = "not_met";
        tile.textContent = "3 not met";
        host.L0.append(tile);
      }),
    });
    expect(refused(root)).toBe(true);
    expect(root.querySelector("[data-test-module]")).toBeNull();
    expect(strip(root)).toBeNull();
  });

  it("a module that draws no counts there renders", async () => {
    const root = await render(
      rowsBundle(),
      registryWith(() => {}),
    );
    expect(refused(root)).toBe(false);
    expect(root.querySelector("[data-test-module]")).not.toBeNull();
  });
});

describe("calibration claims are cited on their own line, not counted as evaluations", () => {
  // result-root-bundle.json holds three requirement claims; this adds one
  // weekly calibration claim the way capsulectl seals it: counted in the
  // sealed population and in its verdict bucket.
  function withCalibration(population: number): Obj {
    const source = fixture("result-root-bundle.json");
    const doc = resultDoc(source);
    const claims = doc.claims as Obj[];
    claims.push({
      ...structuredClone(claims[2]!),
      id: "claim-4",
      type: "calibration",
      requirement_ref: "calibration-week",
    });
    const aggregate = doc.aggregate as Obj;
    (aggregate.coverage as Obj).evaluated_population = population;
    ((aggregate.buckets as Obj).not_evaluable as string[]).push("claim-4");
    return source;
  }

  it("draws the requirement figures, a calibration line, and no mismatch marker when the sealed total is the strip plus the calibration claims", async () => {
    const root = await render(withCalibration(4));
    const s = strip(root)!;
    const line = s.querySelector<HTMLElement>(".agg-line")!;
    expect(line.textContent).toContain("3 evaluations of 3 requirements");
    expect(line.dataset.evaluated).toBe("3");
    expect(
      s.querySelector<HTMLElement>('[data-bucket="not_evaluable"]')!.dataset
        .count,
    ).toBe("1");
    expect(
      s.querySelector<HTMLElement>('[data-bucket="not_evaluable"]')!.dataset.of,
    ).toBe("3");
    expect(s.querySelector(".agg-calibration")!.textContent).toBe(
      "1 calibration check of the judge, not counted as evaluations",
    );
    expect(s.querySelector("[data-count-mismatch]")).toBeNull();
    expect(refused(root)).toBe(false);
  });

  it("still marks a real gap: a sealed total that is not the strip plus the calibration claims", async () => {
    const root = await render(withCalibration(9));
    const marker = strip(root)!.querySelector<HTMLElement>(
      '[data-count-mismatch="evaluated_population"]',
    )!;
    expect(marker.dataset.stated).toBe("8");
    expect(marker.dataset.recomputed).toBe("3");
    expect(marker.textContent).toBe("count mismatch: the claims give 3");
  });

  it("marks a sealed aggregate that left the calibration claim out of the population", async () => {
    const root = await render(withCalibration(3));
    const marker = strip(root)!.querySelector<HTMLElement>(
      '[data-count-mismatch="evaluated_population"]',
    )!;
    expect(marker.dataset.stated).toBe("2");
    expect(marker.dataset.recomputed).toBe("3");
  });

  it("takes a calibration claim with an unknown sufficiency out of unknown_count", async () => {
    const source = withCalibration(4);
    const doc = resultDoc(source);
    const claim = (doc.claims as Obj[])[3]!;
    claim.sufficiency = "UNKNOWN";
    ((doc.aggregate as Obj).coverage as Obj).unknown_count = 1;
    const root = await render(source);
    const line = strip(root)!.querySelector<HTMLElement>(".agg-line")!;
    expect(line.dataset.unknown).toBe("0");
    expect(strip(root)!.querySelector("[data-count-mismatch]")).toBeNull();
  });

  it("draws no negative figure when the sealed population is below the calibration claims", async () => {
    const source = withCalibration(4);
    const doc = resultDoc(source);
    ((doc.aggregate as Obj).coverage as Obj).evaluated_population = 0;
    const root = await render(source);
    const line = strip(root)!.querySelector<HTMLElement>(".agg-line")!;
    expect(line.dataset.evaluated).toBe("0");
    expect(line.textContent).not.toMatch(/-\d/u);
    expect(
      strip(root)!.querySelector(
        '[data-count-mismatch="evaluated_population"]',
      ),
    ).not.toBeNull();
  });

  it("marks a sealed population below its calibration claims even when the fallback figure equals the claims'", async () => {
    // One requirement claim and two calibration claims in force, a sealed
    // population of 1: sealed minus calibration is -1, the claims give 1.
    const source = fixture("result-root-bundle.json");
    const doc = resultDoc(source);
    const first = (doc.claims as Obj[])[0]!;
    const calibration = (id: string): Obj => ({
      ...structuredClone(first),
      id,
      type: "calibration",
      requirement_ref: id,
    });
    doc.claims = [first, calibration("claim-4"), calibration("claim-5")];
    const aggregate = doc.aggregate as Obj;
    (aggregate.coverage as Obj).evaluated_population = 1;
    aggregate.buckets = {
      met: ["claim-1", "claim-4", "claim-5"],
      not_met: [],
      not_evaluable: [],
    };
    const root = await render(source);
    expect(
      strip(root)!.querySelector(
        '[data-count-mismatch="evaluated_population"]',
      ),
    ).not.toBeNull();
  });

  it("draws no calibration line when no claim is a calibration claim", async () => {
    const root = await render(fixture("result-root-bundle.json"));
    expect(strip(root)!.querySelector(".agg-calibration")).toBeNull();
  });
});

// capsule-viewer#303: a Result whose own coverage_report says every source is
// backfill-only opens its strip with "imported", in the rehearsal form and on
// the record alike (the strip does not tell them apart); one contemporaneous
// source, a missing report, or counts that do not add up draw nothing.
describe("the strip says imported for a backfill-only Result", () => {
  const source = (backfilled: number, live: number, total: number): Obj => ({
    backfilled_count: backfilled,
    contemporaneous_count: live,
    duplicates_collapsed: 0,
    record_count: total,
  });
  const withReport = async (
    sources: Obj[][] | undefined,
  ): Promise<HTMLElement> => {
    const doc = fixture("result-root-bundle.json");
    if (sources !== undefined)
      resultDoc(doc).coverage_report = {
        contract_ref: "ec:example:2026-09-21@1",
        requirements: sources.map((list, i) => ({
          requirement_ref: `req-${i}`,
          claim_ids: [],
          gaps: [],
          sources: list,
        })),
      };
    return render(doc);
  };
  const imported = (root: HTMLElement): HTMLElement | null =>
    strip(root)!.querySelector<HTMLElement>("[data-imported]");

  it("says it when every source is backfilled", async () => {
    const root = await withReport([[source(3, 0, 3)], [source(2, 0, 2)]]);
    const note = imported(root)!;
    expect(note).not.toBeNull();
    expect(note.textContent).toMatch(/^Imported:/u);
    // Before the identity line, the first thing in the strip.
    const kids = [...strip(root)!.children].filter(
      (c) => c.tagName !== "STYLE",
    );
    expect(kids[0]).toBe(note);
  });

  for (const [name, sources] of [
    ["one source has a contemporaneous record", [[source(2, 1, 3)]]],
    [
      "one of two sources is contemporaneous",
      [[source(3, 0, 3)], [source(0, 3, 3)]],
    ],
    ["the counts do not add up", [[source(2, 0, 3)]]],
    ["a source holds no records", [[source(0, 0, 0)]]],
    ["no source is listed", [[]]],
    ["the report is missing", undefined],
  ] as const)
    it(`says nothing when ${name}`, async () => {
      const root = await withReport(
        sources === undefined ? undefined : (sources as unknown as Obj[][]),
      );
      expect(imported(root)).toBeNull();
    });
});
