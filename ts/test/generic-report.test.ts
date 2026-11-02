// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

// The generic contract-report view (generic-report-view.ts): a Result that
// opts into contract-report/v1 with the empty block and carries neither
// Outcomes nor EU data. Rows come from its claims, groups from the
// requirement_ref prefix, words from the generic default pack with a host
// pack layered over it. Neither case here uses Outcomes or EU data.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import {
  DEFAULT_PACK_SHA256,
  DEFAULT_PACKS,
  wordingProblems,
} from "../src/contract-report-wording.js";
import { nestingProblems } from "../src/report-levels.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

function source(change?: (claims: Obj[], doc: Obj) => void): Obj {
  const bundle = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "test", "testdata", "result-root-bundle.json"),
      "utf8",
    ),
  ) as Obj;
  // Opted in, with nothing else: the empty block of contract-report/v1.
  bundle.extensions = {
    ...((bundle.extensions as Obj | undefined) ?? {}),
    "contract-report/v1": {},
  };
  const doc = ((bundle.disclosures as Obj).result as Obj).agent_input as Obj;
  change?.(doc.claims as Obj[], doc);
  return bundle;
}

function pack(entries: Record<string, string>): {
  pack: string;
  sha256: string;
} {
  const text = JSON.stringify({
    wording_pack_version: "aac.wording-pack/v0",
    id: "test/generic@1",
    locale: "en",
    entries,
  });
  return {
    pack: text,
    sha256: createHash("sha256").update(text).digest("hex"),
  };
}

async function draw(
  bundle: Obj,
  wording?: { pack: string; sha256: string },
  depth: "L0" | "L1" | "L2" = "L2",
  contract?: { text: string; sha256: string },
): Promise<HTMLElement> {
  const { bundle: sealed } = await sealEvidenceBundle(bundle);
  const root = document.createElement("main");
  await renderEvidenceGraph(sealed, root, undefined, {
    ...(wording === undefined ? {} : { wording }),
    depth,
    ...(contract === undefined ? {} : { contract }),
  });
  return root;
}

const rowOf = (root: HTMLElement, ref: string): HTMLElement =>
  root.querySelector<HTMLElement>(`details[data-row="${ref}"]`)!;

it("a Result carrying only the empty block draws its rows from the claims, not the generic Result page", async () => {
  const root = await draw(source());
  expect(root.querySelector('[data-page="contract-report"]')).not.toBeNull();
  expect(root.querySelector('[data-page="result"]')).toBeNull();
  expect(root.querySelector('[data-page="outcome-report"]')).toBeNull();
  expect(root.querySelector('[data-page="compliance"]')).toBeNull();
  // the core's strip is the aggregate; the module adds no second copy
  expect(root.querySelectorAll("[data-core-strip]")).toHaveLength(1);
  expect(root.querySelector("[data-counts]")!.textContent).toBe(
    "3 claims · 3 requirements",
  );
  // no pack: every name is the raw identifier, each claim is listed
  for (const ref of ["req-1", "req-2", "req-3"]) {
    const row = rowOf(root, ref);
    expect(row.querySelector("summary")!.textContent).toContain(ref);
    // each row's tally is a count with its denominator
    expect(row.querySelector("[data-tally]")!.textContent).toContain(
      "1 of 1 claims",
    );
  }
  expect(
    root.querySelector('[data-claim-ref="claim-2"] [data-verdict="not_met"]')!
      .textContent,
  ).toBe("not met");
  expect(root.querySelector('[data-section="rows"]')!.textContent).not.toMatch(
    /\d\s*%/u,
  );
  // the module's own toggles: a row is level 1, its claims level 2, nothing deeper
  expect(nestingProblems(root.querySelector('[data-section="rows"]')!)).toEqual(
    [],
  );
});

it("a host pack setting report.* and row.* words the title, the summary and the rows, and the raw ids stay on the claims", async () => {
  const root = await draw(
    source(),
    pack({
      "report.title": "Airline week",
      "report.summary": "Three requirements, one claim each.",
      "row.req-1.label": "Refunds within a day",
      "row.req-1.detail": "A refund is issued within 24 hours.",
      "row.req-3.label": "Escalations",
      "row.req-3.not_evaluable": "Nothing could be decided for this one.",
      "verdict.not_met": "missed",
    }),
  );
  expect(root.querySelector("h1")!.textContent).toBe("Airline week");
  expect(root.querySelector("[data-report-summary]")!.textContent).toBe(
    "Three requirements, one claim each.",
  );
  const first = rowOf(root, "req-1");
  expect(first.querySelector("summary")!.textContent).toContain(
    "Refunds within a day",
  );
  expect(first.textContent).toContain("A refund is issued within 24 hours.");
  expect(rowOf(root, "req-3").textContent).toContain(
    "Nothing could be decided for this one.",
  );
  // a row the pack does not name keeps its raw identifier
  expect(rowOf(root, "req-2").querySelector("summary")!.textContent).toContain(
    "req-2",
  );
  expect(
    root.querySelector('[data-claim-ref="claim-2"] [data-verdict="not_met"]')!
      .textContent,
  ).toBe("missed");
  // the sealed ids are still on the claims
  expect(first.querySelector('[data-claim-ref="claim-1"]')).not.toBeNull();
  expect(root.querySelector('[data-wording="refused"]')).toBeNull();
});

it("a host pack setting only report.title and report.summary leaves every row and verdict word to the default layer", async () => {
  const root = await draw(
    source(),
    pack({ "report.title": "Only a title", "report.summary": "And a line." }),
  );
  expect(root.querySelector("h1")!.textContent).toBe("Only a title");
  expect(root.querySelector("[data-report-summary]")!.textContent).toBe(
    "And a line.",
  );
  expect(rowOf(root, "req-1").querySelector("summary")!.textContent).toContain(
    "req-1",
  );
  expect(
    root.querySelector(
      '[data-claim-ref="claim-3"] [data-verdict="not_evaluable"]',
    )!.textContent,
  ).toBe("could not be decided");
});

it("a requirement_ref's prefix groups its rows; a ref with no dot is in a final group with no title", async () => {
  const root = await draw(
    source((claims) => {
      claims[0]!.requirement_ref = "pay.refund";
      claims[1]!.requirement_ref = "pay.fee";
      claims[2]!.requirement_ref = "solo";
    }),
    pack({ "group.pay.title": "Payments" }),
  );
  const groups = [...root.querySelectorAll<HTMLElement>("[data-group]")];
  expect(groups.map((g) => g.dataset.group)).toEqual(["pay"]);
  expect(groups[0]!.querySelector("h3")!.textContent).toBe("Payments");
  expect(groups[0]!.querySelectorAll("details[data-row]")).toHaveLength(2);
  // the ungrouped row is drawn last, under no heading
  const rows = [...root.querySelectorAll<HTMLElement>("details[data-row]")];
  expect(rows.at(-1)!.dataset.row).toBe("solo");
  expect(rows.at(-1)!.closest("[data-group]")).toBeNull();
});

it("row.* and group.* words apply only when every claim cites one contract: a Result with two contracts shows raw identifiers, grouped by contract", async () => {
  const root = await draw(
    source((claims) => {
      claims[2]!.contract_ref = "ec:other@1";
    }),
    pack({ "row.req-1.label": "Refunds within a day" }),
  );
  expect(
    rowOf(root, "req-1").querySelector("summary")!.textContent,
  ).not.toContain("Refunds within a day");
  expect(
    [...root.querySelectorAll<HTMLElement>("[data-contract].contract")].map(
      (c) => c.dataset.contract,
    ),
  ).toEqual(["ec:airline-week:2026-09-14@1", "ec:other@1"]);
});

it("a pack that folds two verdicts into one word is refused and the page says so", async () => {
  const root = await draw(source(), pack({ "verdict.not_met": "met" }));
  expect(root.querySelector('[data-wording="refused"]')).not.toBeNull();
  expect(
    root.querySelector('[data-claim-ref="claim-2"] [data-verdict="not_met"]')!
      .textContent,
  ).toBe("not met");
});

it("a claim not yet in force is in a section of its own, readiness only, and in no count above", async () => {
  const root = await draw(
    source((claims, doc) => {
      claims[2]!.applies_from = "2099-01-01";
      // a claim not yet in force is in no bucket and outside the population
      const aggregate = doc.aggregate as Obj;
      (aggregate.buckets as Obj).not_evaluable = [];
      (aggregate.coverage as Obj).evaluated_population = 2;
      (aggregate.coverage as Obj).not_yet_in_force = 1;
    }),
  );
  const later = root.querySelector('[data-section="not-yet-in-force"]')!;
  expect(later.querySelector('details[data-row="req-3"]')).not.toBeNull();
  // its tally says readiness, so a later not_met never reads as a violation
  expect(later.querySelector("[data-tally]")!.textContent).toContain(
    "readiness",
  );
  expect(
    root.querySelector('[data-section="rows"] [data-tally]')!.textContent,
  ).not.toContain("readiness");
  expect(root.querySelector("[data-counts]")!.textContent).toBe(
    "2 claims · 2 requirements",
  );
});

it("the generic default pack checks against itself and hashes to the digest the proofs name", () => {
  expect(wordingProblems(DEFAULT_PACKS.generic, DEFAULT_PACKS.generic)).toEqual(
    [],
  );
  const bytes = readFileSync(
    resolve(process.cwd(), "src", "wording", "contract-report-generic.en.json"),
  );
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    DEFAULT_PACK_SHA256.generic,
  );
});

it("with a contract, rows are drawn in tier sections with their tier, informational rows leave the counts, and the page says so", async () => {
  const text = JSON.stringify({
    id: "ec:airline-week:2026-09-14",
    version: "1",
    requirements: [
      {
        id: "req-1",
        profile: "obligation",
        statement: "One",
        tier: "must_have",
        mode: "judged",
      },
      {
        id: "req-2",
        profile: "obligation",
        statement: "Two",
        tier: "informational",
        mode: "judged",
      },
    ],
  });
  const root = await draw(source(), undefined, "L2", {
    text,
    sha256: createHash("sha256").update(text).digest("hex"),
  });
  expect(
    [...root.querySelectorAll<HTMLElement>("[data-tier-section]")].map(
      (s) => s.dataset.tierSection,
    ),
  ).toEqual(["must_have", "informational", "unstated"]);
  expect(rowOf(root, "req-2").textContent).toContain("Informational");
  expect(rowOf(root, "req-3").dataset.row).toBe("req-3");
  expect(
    rowOf(root, "req-1").querySelector<HTMLElement>("[data-requirement-tier]")!
      .dataset.requirementTier,
  ).toBe("must_have");
  // the informational requirement is out of the derived counts
  expect(root.querySelector("[data-counts]")!.textContent).toBe(
    "2 claims · 2 requirements",
  );
  expect(
    root.querySelector('[data-sealed-counts="informational"]'),
  ).not.toBeNull();
});

it("a pack cannot swap the tier-section titles or retitle the not-yet-in-force section as in force", () => {
  const problems = (entries: Record<string, string>) =>
    wordingProblems(
      { id: "test/pack@1", locale: "en", entries },
      DEFAULT_PACKS.generic,
    );
  expect(
    problems({
      "generic.rtier.informational.title": "Must-have requirements · {n}",
    }),
  ).not.toEqual([]);
  expect(problems({ "generic.later.title": "met" })).not.toEqual([]);
});
