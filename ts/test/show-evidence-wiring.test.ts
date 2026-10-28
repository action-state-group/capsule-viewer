// SPDX-License-Identifier: Apache-2.0

// Show evidence, wired into the contract report (capsule-viewer#83, second
// PR): every L1 count of both groupings has a Show-evidence action or the
// label that stands in for one, every record it links to is in the page,
// every record it cites links back ("Cited by"), and a page that runs no
// script carries the lists in its static HTML.
//
// The goldens are drawn from committed VALID bundles, evidencebook's
// report/testdata/presentation/4-monthly-outcome and 5-monthly-compliance
// bundle.json at cea1e73 (testdata/show-evidence/monthly-*.bundle.json,
// unchanged), built as the static package. The negative cases seal this
// repository's fixtures with an edit (helpers/sealed-bundle.ts), so the
// Result reader, not the test, decides what each claim resolves to.
//
// UPDATE_GOLDENS=1 npx vitest run test/show-evidence-wiring.test.ts
// rewrites the goldens for an intended change; review the diff before
// committing it.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildResultRoot,
  type ResultClaim,
} from "@action-state-group/agent-action-capsule";
import { renderEvidenceGraph } from "../src/browser.js";
import { buildPresentation } from "../src/presentation-builder.js";
import { DEFAULT_WORDS } from "../src/contract-report-wording.js";
import { evidenceAction } from "../src/report-levels.js";
import { withCarriedCapsule } from "./helpers/carried-capsule.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

// The static builder runs in node (the emitter reads its shell with
// node:fs), so this file keeps the node environment and gives the page a
// jsdom document of its own, as presentation-builder.test.ts does.
const host = new JSDOM();
globalThis.document = host.window.document;
globalThis.HTMLElement = host.window.HTMLElement;

type Obj = Record<string, any>;

const testdata = (...parts: string[]): string =>
  resolve(process.cwd(), "test", "testdata", ...parts);
const read = (...parts: string[]): Obj =>
  JSON.parse(readFileSync(testdata(...parts), "utf8")) as Obj;
const GOLDENS = resolve(process.cwd(), "test", "goldens", "show-evidence");

const VALID = [
  { name: "monthly-outcome", page: "outcome-report" },
  { name: "monthly-compliance", page: "compliance" },
] as const;

/** The page built as the static package: rendered at build time, no script. */
async function staticPage(bundle: unknown): Promise<string> {
  const built = await buildPresentation(bundle, {
    presentation: "auto",
    audience: "*",
    format: "static",
  });
  if (built.format !== "static") throw new Error("not a static page");
  return built.html;
}

/** Every L1 count cell: its number, and its actions and labels. */
function countCells(doc: Document): HTMLElement[] {
  return [
    ...doc.querySelectorAll<HTMLElement>(
      '[data-region="L1"] td[data-column], [data-region="L1"] tr.test > td:last-child',
    ),
  ];
}

/**
 * The numbers a cell states, each by the key its action or label must carry
 * (`data-evidence-for`), with its value read from the page: every one above
 * zero needs exactly one action or label, and a zero none.
 */
function numbers(cell: HTMLElement): Map<string, number> {
  const row = cell.closest("tr")!;
  const nv = cell.querySelector(":scope > .nv");
  if (nv !== null) {
    const n = Number(/\d+/u.exec(nv.textContent ?? "")?.[0]);
    const key =
      row.dataset.rule !== undefined
        ? `rule:${row.dataset.rule}:${cell.dataset.column}`
        : `test:${row.dataset.criterion}:${cell.dataset.column}`;
    return new Map([[key, n]]);
  }
  // A compliance result cell: one number per verdict its row states.
  return new Map(
    (
      [
        ["exceptions", "not_met"],
        ["notEvaluable", "not_evaluable"],
        ["unverified", "unverified"],
        ["outOfScope", "out_of_scope"],
        ["notYetInForce", "not_yet_in_force"],
      ] as const
    ).map(([attr, bucket]) => [
      `test:${row.dataset.criterion}:${bucket}`,
      Number(row.dataset[attr] ?? 0),
    ]),
  );
}

/** The evidence parts of a page, one per line: every action, label and Cited-by list. */
function evidenceParts(doc: Document): string {
  return (
    [...doc.querySelectorAll("details.cv-ev, .cv-ev-label, p.cv-cited-by")]
      .map((e) => e.outerHTML)
      .join("\n") + "\n"
  );
}

describe("Show evidence in the contract report, from committed VALID bundles", () => {
  for (const { name, page } of VALID)
    it(`${name}: every L1 count has an action or a label, every link resolves, and the static HTML carries the lists`, async () => {
      const html = await staticPage(
        read("show-evidence", `${name}.bundle.json`),
      );
      // Scripts off: the page carries no script, and the lists are in its
      // HTML as written, not built by anything that runs in the reader's
      // browser.
      expect(html).not.toMatch(/<script/iu);
      expect(html).toContain('<details class="cv-ev"');
      expect(html).toContain('<ul class="cv-ev-list">');
      const doc = new JSDOM(html).window.document;
      expect(doc.querySelector(`[data-page="${page}"]`)).not.toBeNull();

      const cells = countCells(doc);
      expect(cells.length).toBeGreaterThan(0);
      let actions = 0;
      for (const cell of cells) {
        const shown = [
          ...cell.querySelectorAll<HTMLElement>(
            ":scope > details.cv-ev, :scope > .cv-ev-label",
          ),
        ];
        const stated = numbers(cell);
        for (const [key, n] of stated)
          expect(
            shown.filter((e) => e.dataset.evidenceFor === key),
            `${key} = ${n}`,
          ).toHaveLength(n > 0 ? 1 : 0);
        expect(shown.every((e) => stated.has(e.dataset.evidenceFor!))).toBe(
          true,
        );
        actions += shown.length;
      }
      expect(actions).toBeGreaterThan(0);

      const ids = new Set([...doc.querySelectorAll("[id]")].map((e) => e.id));
      const links = [
        ...doc.querySelectorAll<HTMLAnchorElement>(
          "details.cv-ev a[href], p.cv-cited-by a[href]",
        ),
      ];
      expect(links.length).toBeGreaterThan(0);
      for (const link of links)
        expect(
          ids.has(link.getAttribute("href")!.slice(1)),
          link.outerHTML,
        ).toBe(true);

      // Each cited record links back to every number that cites it.
      for (const action of doc.querySelectorAll<HTMLElement>("details.cv-ev"))
        for (const digest of action.dataset.cites!.split(" ")) {
          const entry = doc
            .getElementById(`record-${digest}`)!
            .closest("details.cv-record")!;
          const back = entry.querySelector(
            `:scope > p.cv-cited-by a[href="#${action.id}"]`,
          );
          expect(back, `${digest} -> ${action.id}`).not.toBeNull();
        }

      const golden = resolve(GOLDENS, `${name}.wiring.html`);
      const parts = evidenceParts(doc);
      if (process.env.UPDATE_GOLDENS) {
        mkdirSync(GOLDENS, { recursive: true });
        writeFileSync(golden, parts);
      }
      expect(parts).toBe(readFileSync(golden, "utf8"));
    });
});

describe("Show evidence, a number with no evidence to show", () => {
  const w = DEFAULT_WORDS.lines;
  const claim = (evidence: { digest: string; resolved: boolean }[]) =>
    ({ evidence }) as unknown as ResultClaim;
  const result = {} as never;

  it("draws nothing for a number that counts nothing", () => {
    expect(evidenceAction("k", "n", [], result, w)).toBeUndefined();
  });

  it("labels a number whose claims cite nothing in this bundle unsupported, not an action", () => {
    const node = evidenceAction(
      "k",
      "n",
      [claim([{ digest: "f".repeat(64), resolved: false }])],
      result,
      w,
    )!;
    expect(node.tagName).toBe("SPAN");
    expect(node.dataset.evidenceLabel).toBe("unsupported");
    expect(node.textContent).toBe(w.t("evidence.label.unsupported"));
  });

  it("labels a number no claim stands behind an interpretation", () => {
    const node = evidenceAction("k", "n", [undefined, undefined], result, w)!;
    expect(node.dataset.evidenceLabel).toBe("interpretation");
    expect(node.textContent).toBe(w.t("evidence.label.interpretation"));
  });

  it("labels a number whose claims cite nothing at all as citing no evidence, never as undisclosed", () => {
    const node = evidenceAction("k", "n", [claim([])], result, w)!;
    expect(node.dataset.evidenceLabel).toBe("unsupported");
    expect(node.dataset.evidenceReason).toBe("no-evidence");
    expect(node.textContent).toBe(w.t("evidence.label.no-evidence"));
  });

  it("counts claims that cite nothing in the list, so its parts add up to the number", () => {
    const node = evidenceAction(
      "k",
      "n",
      [
        claim([{ digest: "a".repeat(64), resolved: true }]),
        claim([]),
        claim([]),
      ],
      result,
      w,
    )!;
    expect(node.querySelectorAll("li[data-cited]")).toHaveLength(1);
    const none = node.querySelector<HTMLElement>("li[data-no-evidence]")!;
    expect(none.dataset.noEvidence).toBe("2");
    expect(none.textContent).toBe(w.p("evidence.no-evidence", 2));
  });

  it("lists what a number cites, what is not disclosed, and what it counted with no claim", () => {
    const node = evidenceAction(
      "rule:a.b:undecided",
      "n",
      [
        claim([
          { digest: "a".repeat(64), resolved: true },
          { digest: "b".repeat(64), resolved: false },
        ]),
        undefined,
      ],
      result,
      w,
    )!;
    expect(node.tagName).toBe("DETAILS");
    expect(node.id).toBe("n-rule:a.b:undecided");
    expect(node.dataset.cites).toBe("a".repeat(64));
    expect(node.querySelector(`li[data-cited] a`)!.getAttribute("href")).toBe(
      `#record-${"a".repeat(64)}`,
    );
    expect(node.querySelector("li[data-missing]")!.textContent).toContain(
      w.t("evidence.not-in-bundle"),
    );
    expect(node.querySelector("li[data-uncited]")!.textContent).toBe(
      w.p("evidence.uncited", 1),
    );
  });
});

describe("Show evidence, negative fixtures the old rendering fails", () => {
  afterEach(() => {
    delete (globalThis as Obj).CapsuleViewerShowEvidence;
  });

  async function rendered(bundle: unknown): Promise<HTMLElement> {
    const root = document.createElement("main");
    document.body.replaceChildren(root);
    await renderEvidenceGraph(bundle, root);
    return root;
  }

  it("a claim whose evidence is not in the bundle: its count is labelled unsupported, and no record says it cites it", async () => {
    const source = read("outcome-report-bundle.json");
    const claims = source.disclosures.result.agent_input.claims as Obj[];
    const target = claims.find((c) => c.verdict === "not_met")!;
    const absent = "f".repeat(64);
    target.evidence = [{ digest_alg: "SHA-256", digest: absent }];
    target.presentation.evidence = [{ digest_alg: "SHA-256", digest: absent }];
    const { bundle } = await sealEvidenceBundle(source);
    const root = await rendered(bundle);
    const cell = root.querySelector<HTMLElement>(
      `tr[data-rule="${target.requirement_ref}"] > td[data-column="unverified"]`,
    )!;
    expect(cell).not.toBeNull();
    expect(
      cell.querySelector('.cv-ev-label[data-evidence-label="unsupported"]'),
    ).not.toBeNull();
    expect(cell.querySelector("details.cv-ev")).toBeNull();
    expect(root.querySelector(`[data-cites~="${absent}"]`)).toBeNull();
    for (const back of root.querySelectorAll<HTMLElement>("p.cv-cited-by"))
      expect(back.dataset.citedBy).not.toContain(
        `n-rule:${target.requirement_ref}:unverified`,
      );
  });

  it("a conversation counted with no claim: its count says so, never cites a record for it", async () => {
    const source = read("outcome-report-bundle.json");
    const resultDoc = source.disclosures.result.agent_input;
    const claims = resultDoc.claims as Obj[];
    const dropped = claims.find((c) => c.verdict === "met")!;
    resultDoc.claims = claims.filter((c) => c !== dropped);
    const buckets: Record<string, string[]> = {
      met: [],
      not_met: [],
      not_evaluable: [],
    };
    for (const c of resultDoc.claims as Obj[])
      buckets[c.verdict as string]!.push(c.id as string);
    resultDoc.aggregate = { ...resultDoc.aggregate, buckets };
    const { bundle } = await sealEvidenceBundle(source);
    const root = await rendered(bundle);
    const cell = root.querySelector<HTMLElement>(
      `tr[data-rule="${dropped.requirement_ref}"] > td[data-column="undecided"]`,
    )!;
    const said =
      cell.querySelector(
        '.cv-ev-label[data-evidence-label="interpretation"]',
      ) ?? cell.querySelector("details.cv-ev li[data-uncited]");
    expect(said, cell.outerHTML).not.toBeNull();
  });

  it("a click in a number's evidence, or on its record link, leaves the row's drill-down as it was", async () => {
    const { bundle } = await sealEvidenceBundle(
      read("outcome-report-bundle.json"),
    );
    const root = await rendered(bundle);
    const action = root.querySelector<HTMLElement>("tr.rule.x details.cv-ev")!;
    const toggle = action
      .closest("tr")!
      .querySelector<HTMLDetailsElement>("details.rx")!;
    const before = toggle.open;
    action.querySelector<HTMLElement>(".cv-ev-body")!.click();
    action.querySelector<HTMLElement>(".cv-ev-list a")!.click();
    expect(toggle.open).toBe(before);
    // A click elsewhere on the row still opens it.
    action.closest("tr")!.querySelector<HTMLElement>(".nv")!.click();
    expect(toggle.open).toBe(!before);
  });

  it("where a host loaded the component, opening a number draws each claim side by side; the static page draws none", async () => {
    const script = readFileSync(
      resolve(
        process.cwd(),
        "..",
        "src",
        "capsule_viewer",
        "static",
        "show_evidence.js",
      ),
      "utf8",
    );
    new Function(script)();
    expect((globalThis as Obj).CapsuleViewerShowEvidence).toBeDefined();
    const bundle = read("show-evidence", "monthly-outcome.bundle.json");
    const root = await rendered(bundle);
    const action = root.querySelector<HTMLDetailsElement>("details.cv-ev")!;
    expect(action.querySelector(".cv-side")).toBeNull();
    action.open = true;
    action.dispatchEvent(new host.window.Event("toggle"));
    const sides = action.querySelectorAll(".cv-ev-sides > section.cv-side");
    expect(sides.length).toBeGreaterThan(0);
    expect(sides[0]!.getAttribute("data-level")).toBe("L2");
    // The static page is built with no component and runs nothing.
    const html = await staticPage(bundle);
    const statik = new JSDOM(html).window.document;
    expect(statik.querySelector("details.cv-ev")).not.toBeNull();
    expect(statik.querySelector(".cv-ev-sides, section.cv-side")).toBeNull();
  });
});

describe("Show evidence, a capsule carried by a record whose disclosure is withheld", () => {
  it("reads unsupported, and side.unsupported says not all disclosed, never not in the bundle", async () => {
    const source = read("result-root-bundle.json");
    const { carriedId } = await withCarriedCapsule(source, {
      turns: ["Please cancel EHGLP3."],
    });
    const { bundle } = await sealEvidenceBundle(source);
    const b = bundle as Obj;
    const book = b.records[b.records.length - 1].capsule_id as string;
    delete b.disclosures[book];
    const result = await buildResultRoot(b);
    const claim = result.claims.find((c) =>
      c.evidence.some((e) => e.digest === carriedId),
    )!;
    // The reader cannot see the capsule the withheld record carries.
    expect(claim.support).toBe("unsupported");
    expect(claim.missing).toContain(carriedId);
    const script = readFileSync(
      resolve(
        process.cwd(),
        "..",
        "src",
        "capsule_viewer",
        "static",
        "show_evidence.js",
      ),
      "utf8",
    );
    const scope: Obj = {};
    new Function("globalThis", script)(scope);
    const SE = scope.CapsuleViewerShowEvidence;
    const node = SE.render(SE.resolve(result, claim), document) as HTMLElement;
    const line = node.querySelector('[data-verdict-drawn="unsupported"]')!;
    expect(line.textContent).toBe(
      "No verdict is drawn: the evidence this claim cites is not all disclosed in this bundle.",
    );
  });
});
