// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import { obligationStatus, rowStatus } from "../src/compliance-view.js";
import type { ObligationModel, ObligationRowModel } from "../src/compliance.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

function fixture(name: string): Obj {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "test", "testdata", name), "utf8"),
  ) as Obj;
}

async function render(bundle: unknown): Promise<HTMLElement> {
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root);
  return root;
}

async function sealedComplianceBundle(
  mutate?: (source: Obj) => void,
): Promise<{ bundle: Obj; ids: Record<string, string> }> {
  const source = fixture("compliance-bundle.json");
  mutate?.(source);
  return sealEvidenceBundle(source);
}

// ---------------------------------------------------------------------------
// (a) card selection, after outcome-report/v1
// ---------------------------------------------------------------------------

it("renders the compliance card, not the generic Result page, when eu-ai-act-compliance/v1 opts in", async () => {
  const { bundle } = await sealedComplianceBundle();
  const root = await render(bundle);
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  const page = root.querySelector<HTMLElement>('[data-page="compliance"]')!;
  expect(page).not.toBeNull();
  expect(page.classList.contains("cc")).toBe(true);
  expect(root.querySelector('[data-page="result"]')).toBeNull();
  expect(root.lastElementChild).toBe(
    root.querySelector('[data-page="verification"]'),
  );
});

it("eu-ai-act-compliance/v1 present but not enabled falls back to the generic Result page", async () => {
  const { bundle } = await sealedComplianceBundle((source) => {
    ((source.extensions as Obj)["eu-ai-act-compliance/v1"] as Obj).enabled =
      false;
  });
  const root = await render(bundle);
  expect(root.querySelector('[data-page="result"]')).not.toBeNull();
  expect(root.querySelector('[data-page="compliance"]')).toBeNull();
});

it("outcome-report/v1 takes precedence over eu-ai-act-compliance/v1 when a bundle carries both", async () => {
  const { bundle } = await sealedComplianceBundle((source) => {
    (source.extensions as Obj)["outcome-report/v1"] = {
      enabled: true,
      percentages: false,
    };
  });
  const root = await render(bundle);
  expect(root.querySelector('[data-page="outcome-report"]')).not.toBeNull();
  expect(root.querySelector('[data-page="compliance"]')).toBeNull();
});

// ---------------------------------------------------------------------------
// (b) scoped stylesheet, no external reference anywhere
// ---------------------------------------------------------------------------

it("the card's styles are scoped under .cc and the page carries no external reference", async () => {
  const { bundle } = await sealedComplianceBundle();
  const root = await render(bundle);
  const style = root.querySelector('[data-page="compliance"] style')!;
  expect(style.textContent).toContain(".cc ");
  expect(style.textContent).not.toMatch(/(^|[^.\w-])body\s*\{/);
  expect(root.innerHTML).not.toMatch(/https?:\/\//);
  expect(root.querySelectorAll("img, script, link, iframe")).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// (c) section content
// ---------------------------------------------------------------------------

function open(details: Element): HTMLElement {
  (details as HTMLDetailsElement).open = true;
  details.dispatchEvent(new Event("toggle"));
  return details as HTMLElement;
}

/** Toggle 1 on every test row: builds each session list. */
function expand(root: HTMLElement): HTMLElement {
  for (const line of root.querySelectorAll('details[data-level="1"].line'))
    open(line);
  return root;
}

it("the summary shows one group per obligation with its article and status, and its tests beneath it", async () => {
  const { bundle } = await sealedComplianceBundle();
  const root = await render(bundle);
  const groups = root.querySelectorAll<HTMLElement>(
    '[data-rows="summary"] tr[data-obligation]',
  );
  expect(groups).toHaveLength(3);
  const art26row = root.querySelector<HTMLElement>(
    'tr[data-obligation="art26"]',
  )!;
  expect(art26row.textContent).toContain("Applies 2 Dec 2027");
  expect(
    root.querySelectorAll('[data-rows="summary"] tr[data-criterion]'),
  ).toHaveLength(5);
});

it("each test row carries its population, exceptions and not-evaluable counts, in plain words", async () => {
  const { bundle } = await sealedComplianceBundle();
  const root = await render(bundle);
  const art50f = root.querySelector<HTMLElement>(
    'tr[data-criterion="art50.disclosure_before_first_turn"]',
  )!;
  expect(art50f.textContent).toContain("Could not be checked");
  expect(art50f.dataset.population).toBe("2");
  expect(art50f.dataset.exceptions).toBe("0");
  expect(art50f.dataset.notEvaluable).toBe("2");
  expect(art50f.querySelectorAll("td")[1]!.textContent).toBe("2 sessions");
});

it("two levels: a test opens (toggle 1) into its sessions, each naming every test with its result and tier; toggle 2 holds the proofs; nothing deeper", async () => {
  const { bundle } = await sealedComplianceBundle();
  const root = await render(bundle);
  // closed, no session is built
  expect(root.querySelector("[data-session]")).toBeNull();
  expand(root);
  // a session is listed in place inside the test's level-1 toggle, its body
  // shown as it stands: never a toggle of its own
  const session = root.querySelector<HTMLElement>(
    'article[data-session="tau2:airline:task-0:trial-0"]',
  )!;
  expect(session.closest("details")!.dataset.level).toBe("1");
  const blocks = session.querySelectorAll<HTMLElement>("[data-crit]");
  expect(blocks).toHaveLength(5);
  const judgedBlock = session.querySelector<HTMLElement>(
    '[data-crit="art5.no_manipulation_or_deception"]',
  )!;
  expect(
    judgedBlock.querySelector("[data-tier]")!.getAttribute("data-tier"),
  ).toBe("judged");
  // the test's name is shown, not only carried in an attribute
  expect(
    judgedBlock.querySelector(".tname")!.textContent!.length,
  ).toBeGreaterThan(0);
  expect(judgedBlock.querySelector(".tname")!.textContent).not.toBe(
    "art5.no_manipulation_or_deception",
  );
  const recomputedBlock = session.querySelector<HTMLElement>(
    '[data-crit="art50.disclosure_before_first_turn"]',
  )!;
  expect(recomputedBlock.textContent).toContain("recomputed");
  const inner = session.querySelectorAll<HTMLElement>("details");
  expect(inner).toHaveLength(1);
  expect(inner[0]!.dataset.level).toBe("2");
  open(inner[0]!);
  expect(inner[0]!.querySelector("[data-check-it]")!.textContent).toContain(
    "tau2:airline:task-0:trial-0",
  );
});

it("findings render beside their test row for a not-met row with a finding template, never for disclosure_before_first_turn", async () => {
  const { bundle } = await sealedComplianceBundle();
  const root = await render(bundle);
  expect(root.querySelector('[data-finding="F-01"]')).not.toBeNull();
  expect(root.querySelector('[data-finding="F-02"]')).not.toBeNull();
  expect(root.querySelectorAll("[data-finding]")).toHaveLength(2); // F-03/F-04 rows have zero not-met sessions here
  expect(
    root.querySelector(
      'tr[data-criterion="art50.disclosure_before_first_turn"] [data-finding]',
    ),
  ).toBeNull();
});

it("the summary states where the terms come from, and the regulatory mapping is labelled the producer's", async () => {
  const { bundle } = await sealedComplianceBundle();
  const root = await render(bundle);
  const basis = root.querySelector<HTMLElement>('[data-basis="terms"]')!;
  expect(basis.textContent).toContain("sealed claims and reports");
  expect(basis.textContent).toContain("producer's mapping");
  expect(root.querySelector(".hd .sub")!.textContent).toContain(
    "Pack eu-ai-act-obligations v0.1.0",
  );
});

it("a session without a transcript in the bundle says so, and names the case record", async () => {
  const { bundle } = await sealedComplianceBundle();
  const root = expand(await render(bundle));
  expect(root.querySelector("article[data-session]")).not.toBeNull();
  const tx = root.querySelector<HTMLElement>('[data-transcript="absent"]')!;
  expect(tx.textContent).toContain("not in this bundle");
});

it("population counts only the sessions a test has a sealed result for", async () => {
  const { bundle } = await sealedComplianceBundle();
  const root = await render(bundle);
  const row = root.querySelector<HTMLElement>(
    'tr[data-criterion="art26.allowed_action_rules"]',
  )!;
  expect(row.dataset.population).toBe("1");
});

it("the report's proofs (method, what ran, verification) sit in one level-2 toggle at the foot, built on first open", async () => {
  const { bundle } = await sealedComplianceBundle();
  const root = await render(bundle);
  const proofs = root.querySelector<HTMLElement>(
    '[data-section="report-proofs"] details[data-level="2"]',
  )!;
  expect(proofs.querySelector('[data-section="methodology"]')).toBeNull();
  open(proofs);
  for (const section of [
    "obligation-detail",
    "quality",
    "methodology",
    "verification-details",
  ])
    expect(proofs.querySelector(`[data-section="${section}"]`)).not.toBeNull();
  expect(
    proofs.querySelector('[data-section="verification-details"]')!.textContent,
  ).toContain("Bundle digest");
});

// ---------------------------------------------------------------------------
// true two levels; nothing checked never reads as a pass
// ---------------------------------------------------------------------------

it("true two levels: no toggle sits inside more than one toggle, a level-1 never holds a level-1, and a level-2 holds none", async () => {
  const { bundle } = await sealedComplianceBundle();
  const root = expand(await render(bundle));
  for (const proofs of root.querySelectorAll('details[data-level="2"]'))
    open(proofs);
  const all = [
    ...root.querySelectorAll<HTMLElement>('[data-page="compliance"] details'),
  ];
  expect(all.length).toBeGreaterThan(4);
  for (const details of all) {
    let ancestors = 0;
    for (let a = details.parentElement; a !== null; a = a.parentElement)
      if (a.tagName === "DETAILS") ancestors += 1;
    expect(ancestors).toBeLessThanOrEqual(1);
    if (details.dataset.level === "1")
      expect(details.querySelector('details[data-level="1"]')).toBeNull();
    if (details.dataset.level === "2")
      expect(details.querySelector("details")).toBeNull();
  }
});

/** Every claim of these tests reads not_evaluable (buckets rebuilt to match). */
function undecide(source: Obj, refs: readonly string[]): void {
  const result = (source.disclosures as Obj).result as Obj;
  const doc = result.agent_input as Obj;
  const template = (doc.claims as Obj[]).find(
    (c) => c.verdict === "not_evaluable",
  )!;
  const claims = (doc.claims as Obj[]).map((c) =>
    refs.includes(c.requirement_ref as string)
      ? {
          ...c,
          verdict: "not_evaluable",
          sufficiency: template.sufficiency,
          presentation: {
            ...(c.presentation as Obj),
            status: (template.presentation as Obj).status,
          },
        }
      : c,
  );
  const buckets: Record<string, string[]> = {
    met: [],
    not_met: [],
    not_evaluable: [],
  };
  for (const c of claims) buckets[c.verdict as string]!.push(c.id as string);
  result.agent_input = {
    ...doc,
    claims,
    aggregate: { ...(doc.aggregate as Obj), buckets },
  };
}

it("an obligation no session met, every result undecided, reads 'Could not be checked' in a neutral tone, never 'No exceptions'", async () => {
  const { bundle } = await sealedComplianceBundle((source) =>
    undecide(source, [
      "art50.disclosure_before_first_turn",
      "art50.disclosure_clear_or_obvious",
    ]),
  );
  const root = await render(bundle);
  const row = root.querySelector<HTMLElement>('tr[data-obligation="art50"]')!;
  const pill = row.querySelector<HTMLElement>(".st")!;
  expect(pill.textContent).toBe("Could not be checked");
  expect(pill.classList.contains("ne")).toBe(true);
  expect(row.textContent).not.toContain("No exceptions");
  // an obligation with a met session still reads as before
  expect(
    root.querySelector<HTMLElement>('tr[data-obligation="art26"] .st')!
      .textContent,
  ).toBe("Not yet in force · no exceptions");
});

it("a test or obligation with no result at all never falls through to a pass wording", () => {
  const empty: ObligationRowModel = {
    criterionId: "x.y",
    name: "X",
    wording: { text: "", source: "unstated" },
    tier: "not stated",
    metCount: 0,
    notMetCount: 0,
    notEvaluableCount: 0,
    notApplicableCount: 2,
    sessionsByVerdict: new Map(),
  };
  for (const ladder of [false, true]) {
    const status = rowStatus(empty, ladder);
    expect(status.cls).toBe("ne");
    expect(status.text).not.toMatch(/No exceptions|Established/u);
  }
  const obligation = {
    key: "x",
    mapped: true,
    article: "Art X",
    title: "X",
    plain: "",
    judgedTerms: [],
    applicability: { status: "in_force", note: "" },
    method: "",
    rows: [empty],
  } as ObligationModel;
  expect(obligationStatus(obligation)).toEqual({
    cls: "ne",
    text: "Could not be checked",
  });
});
