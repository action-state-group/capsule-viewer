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
      // Coverage, then the buckets.
      const kids = [...s.children].filter((c) => c.tagName !== "STYLE");
      expect(kids[0]!.className).toBe("agg-line");
      expect(kids[1]!.className).toBe("agg-buckets");
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
          `of ${population.toLocaleString("en-US")}`,
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
      "a print-only rule that hides the counts (as the static builder renders, in jsdom)",
      (host) => {
        const style = document.createElement("style");
        style.textContent = "@media print{[data-bucket]{display:none}}";
        host.L1.append(style);
      },
    ],
    [
      "a print stylesheet that hides the counts",
      (host) => {
        const style = document.createElement("style");
        style.media = "print";
        style.textContent = "[data-bucket]{display:none}";
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

  it("a module's print rule that sets nothing the frame shows renders", async () => {
    const root = await render(
      fixture("result-root-bundle.json"),
      registryWith((host) => {
        const style = document.createElement("style");
        style.textContent =
          "@media print{*{print-color-adjust:exact;box-shadow:none}}";
        host.L1.append(style);
      }),
    );
    expect(refused(root)).toBe(false);
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
