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

it("every producer-supplied field is set in italics as the producer's, and no sealed value is", async () => {
  const { bundle } = await sealedComplianceBundle((source) => {
    (
      (source.extensions as Obj)["eu-ai-act-compliance/v1"] as Obj
    ).quality_protocol = {
      protocol: "spot-check",
      cadence: "weekly",
      note: "Ten sessions a week.",
    };
  });
  const root = expand(await render(bundle));
  const proofs = root.querySelector<HTMLElement>(
    '[data-section="report-proofs"] details[data-level="2"]',
  )!;
  open(proofs);
  const basis = root.querySelector<HTMLElement>('[data-basis="terms"]')!;
  for (const field of [
    "The regulation named in the heading",
    "obligation titles",
    "finding ids",
    "severities",
    "test names",
    "method",
    "notes on undecided tests and quality checks",
    "set in italics",
  ])
    expect(basis.textContent).toContain(field);
  const producer = [
    ...root.querySelectorAll<HTMLElement>('i[data-source="producer"]'),
  ].map((i) => i.textContent);
  // the heading, finding ids and severities are the producer's too
  expect(
    root.querySelector('.hd h1 i[data-source="producer"]')!.textContent,
  ).toBe("Regulation (EU) 2024/1689 (the EU AI Act)");
  const finding = root.querySelector<HTMLElement>('[data-finding="F-01"]')!;
  expect(
    finding.querySelector('.fh b i[data-source="producer"]')!.textContent,
  ).toBe("Finding F-01");
  expect(
    finding.querySelector('.sev i[data-source="producer"]')!.textContent,
  ).toBe("Medium");
  for (const text of [
    "Art 5(1)(a) · No manipulative or deceptive techniques", // summary title
    "No manipulative or deceptive technique", // test name
    "In force since 2 Feb 2025",
    "Review flagged sessions for manufactured urgency.",
    "AirlineAgentsNow · 31 Oct 2026",
    "Not evaluable against the agent on tau2 trial-0 data.",
    "Judged per session against a frozen rubric.",
    "spot-check",
    "weekly",
    "Ten sessions a week.",
  ])
    expect(producer).toContain(text);
  const detail = root.querySelector<HTMLElement>(
    '[data-obligation-detail="art5"]',
  )!;
  expect(detail.querySelector('h5 i[data-source="producer"]')).not.toBeNull();
  expect(detail.querySelector(".na")!.textContent).toBe(
    "Title, article, summary, method, test names and the undecided-session note: the producer's mapping, in italics, not a sealed record.",
  );
  // sealed values and the page's own words are never set as the producer's
  for (const sealed of root.querySelectorAll(
    '.st, td.n, [data-rationale="sealed"], [data-wording="sealed"] .why, [data-section="methodology"]',
  ))
    expect(sealed.querySelector('[data-source="producer"]')).toBeNull();
});

it("an obligation the producer does not map shows its sealed test id, not in italics", async () => {
  const { bundle } = await sealedComplianceBundle((source) => {
    const ext = (source.extensions as Obj)["eu-ai-act-compliance/v1"] as Obj;
    ext.obligations = (ext.obligations as Obj[]).filter(
      (o) => o.key !== "art5",
    );
  });
  const root = await render(bundle);
  const group = root.querySelector<HTMLElement>(
    '[data-rows="summary"] tbody[data-obligation-group="art5"]',
  )!;
  expect(group).not.toBeNull();
  expect(group.querySelector('[data-source="producer"]')).toBeNull();
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
  // an obligation every test of which a session met still reads clean
  expect(
    root.querySelector<HTMLElement>('tr[data-obligation="art26"] .st')!
      .textContent,
  ).toBe("No exceptions");
});

it("the obligation pill speaks only for the sealed counts: applicability is the producer's italic line, never the pill's", async () => {
  const { bundle } = await sealedComplianceBundle();
  const root = await render(bundle);
  for (const pill of root.querySelectorAll<HTMLElement>(
    '[data-rows="summary"] .st',
  )) {
    expect(pill.textContent).not.toMatch(/in force|applicable|readiness/iu);
    expect(pill.classList.contains("future")).toBe(false);
  }
  const art26 = root.querySelector<HTMLElement>('tr[data-obligation="art26"]')!;
  const note = art26.querySelector<HTMLElement>(
    '.applic i[data-source="producer"]',
  )!;
  expect(note.textContent).toContain("Applies 2 Dec 2027");
  // the basis line says applicability is in italics, and it is
  expect(
    root.querySelector<HTMLElement>('[data-basis="terms"]')!.textContent,
  ).toContain("applicability");
});

it("an unknown severity gets no colour of its own, never 'medium'", async () => {
  const { bundle } = await sealedComplianceBundle((source) => {
    const ext = (source.extensions as Obj)["eu-ai-act-compliance/v1"] as Obj;
    const art5 = (ext.obligations as Obj[]).find((o) => o.key === "art5")!;
    ((art5.rows as Obj[])[0]!.finding as Obj).severity = "Critical";
  });
  const root = await render(bundle);
  const sev = root.querySelector<HTMLElement>('[data-finding="F-01"] .sev')!;
  expect(sev.className).toBe("sev");
  expect(sev.textContent).toBe("Critical");
});

function row(over: Partial<ObligationRowModel>): ObligationRowModel {
  return {
    criterionId: "x.y",
    name: "X",
    producerName: false,
    wording: { text: "", source: "unstated" },
    tier: "not stated",
    metCount: 0,
    notMetCount: 0,
    notEvaluableCount: 0,
    notApplicableCount: 0,
    unverifiedCount: 0,
    sessionsByVerdict: new Map(),
    ...over,
  };
}

function obligationOf(rows: ObligationRowModel[]): ObligationModel {
  return {
    key: "x",
    mapped: true,
    article: "Art X",
    title: "X",
    plain: "",
    judgedTerms: [],
    applicability: { status: "in_force", note: "" },
    method: "",
    rows,
  } as ObligationModel;
}

it("'No exceptions' in the ok tone only when every test was met by some session: one test met and one undecided everywhere is neutral, and says how many could not be checked", () => {
  const met = row({ criterionId: "x.a", metCount: 3 });
  const undecided = row({ criterionId: "x.b", notEvaluableCount: 3 });
  expect(obligationStatus(obligationOf([met, undecided]))).toEqual({
    cls: "ne",
    text: "No exceptions found · 1 of 2 tests could not be checked",
  });
  expect(obligationStatus(obligationOf([met, met]))).toEqual({
    cls: "ok",
    text: "No exceptions",
  });
  // exceptions beside a test nobody could check say both
  const exc = row({ criterionId: "x.c", metCount: 1, notMetCount: 2 });
  expect(obligationStatus(obligationOf([exc, undecided]))).toEqual({
    cls: "exc",
    text: "2 exceptions · 1 of 2 tests could not be checked",
  });
  // a future obligation's pill says nothing about timing
  const future = {
    ...obligationOf([met]),
    applicability: { status: "future", note: "Applies 2027" },
  } as ObligationModel;
  expect(obligationStatus(future)).toEqual({
    cls: "ok",
    text: "No exceptions",
  });
});

it("a test every session failed is an exception, not 'could not be checked': metCount===0 alone never means unchecked", () => {
  const allNotMet = row({ criterionId: "x.a", notMetCount: 2 });
  const met = row({ criterionId: "x.b", metCount: 1 });
  expect(obligationStatus(obligationOf([allNotMet, met]))).toEqual({
    cls: "exc",
    text: "2 exceptions",
  });
});

it("a claim that failed verification or whose evidence is missing is never an exception, and never lets a test read clean in the ok tone", () => {
  const unverifiedOnly = row({ unverifiedCount: 2 });
  for (const ladder of [false, true]) {
    const status = rowStatus(unverifiedOnly, ladder);
    expect(status.cls).toBe("ne");
    expect(status.text).not.toMatch(/exception|No exceptions/iu);
    expect(status.note).toContain("could not be verified");
  }
  const metAndUnverified = row({ metCount: 2, unverifiedCount: 1 });
  const status = rowStatus(metAndUnverified, false);
  expect(status.cls).toBe("ne");
  expect(status.note).toContain("1 could not be verified");
  expect(obligationStatus(obligationOf([metAndUnverified]))).toEqual({
    cls: "ne",
    text: "No exceptions found · 1 result could not be verified",
  });
  // the ladder claims no more than the plain words
  expect(rowStatus(row({ metCount: 2 }), true).text).toBe("No exceptions");
});

it("a session whose claim cites evidence the bundle does not hold is counted apart from the exceptions, with no finding", async () => {
  const { bundle } = await sealedComplianceBundle((source) => {
    const result = (source.disclosures as Obj).result as Obj;
    const doc = result.agent_input as Obj;
    for (const claim of doc.claims as Obj[])
      if (
        (claim.requirement_ref as string) ===
          "art5.no_manipulation_or_deception" &&
        claim.verdict === "not_met"
      ) {
        const missing = { digest_alg: "SHA-256", digest: "e".repeat(64) };
        claim.evidence = [...(claim.evidence as Obj[]), missing];
        (claim.presentation as Obj).evidence = claim.evidence;
      }
  });
  const root = await render(bundle);
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  const tr = root.querySelector<HTMLElement>(
    'tr[data-criterion="art5.no_manipulation_or_deception"]',
  )!;
  expect(tr.dataset.exceptions).toBe("0");
  expect(tr.querySelector("[data-finding]")).toBeNull();
  const pill = tr.querySelector<HTMLElement>(".st")!;
  expect(pill.textContent).not.toMatch(/^[0-9]+ exceptions?/u);
  expect(pill.classList.contains("ne")).toBe(true);
  expect(tr.textContent).toContain("could not be verified");
});

it("a test or obligation with no result at all never falls through to a pass wording", () => {
  const empty: ObligationRowModel = {
    criterionId: "x.y",
    name: "X",
    producerName: false,
    wording: { text: "", source: "unstated" },
    tier: "not stated",
    metCount: 0,
    notMetCount: 0,
    notEvaluableCount: 0,
    notApplicableCount: 2,
    unverifiedCount: 0,
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

// ---------------------------------------------------------------------------
// dating: the obligations card dates a session the way the outcome card does
// (a backfilled case record by its source's own time, labelled "source
// says"), never by the day its reports were sealed alone
// ---------------------------------------------------------------------------

/** Cites one case record per conversation, as the outcome card's tests do. */
function withCaseRecords(
  source: Obj,
  fields: (conversationId: string, index: number) => Obj,
): void {
  const result = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
  const records = source.records as Obj[];
  const root = records.find((r) => r.capsule_id === "result")!;
  const references = root.references as Obj[] | undefined;
  const seen = new Map<string, string>();
  for (const claim of result.claims as Obj[]) {
    const id = claim.id as string;
    const sep = id.indexOf("::");
    if (sep === -1) continue;
    const conversationId = id.slice(0, sep);
    let alias = seen.get(conversationId);
    if (alias === undefined) {
      alias = `case:${conversationId}`;
      seen.set(conversationId, alias);
      records.push({
        capsule_id: alias,
        ...fields(conversationId, seen.size - 1),
      });
      references?.push({
        type: "agent-action-capsule",
        citation_purpose: "acted_on",
        digest: alias,
      });
    }
    (claim.evidence as Obj[]).push({ digest_alg: "SHA-256", digest: alias });
  }
  for (const entry of Object.values(source.disclosures as Obj)) {
    const input = (entry as Obj).agent_input as Obj | undefined;
    if (input !== undefined && typeof input.case_id === "string")
      input.source_capsule_id = `case:${input.case_id}`;
  }
}

const BACKFILLED = (sourceAssertedAt: string): Obj => ({
  timestamp: "2026-10-20T10:00:00Z",
  provenance_mode: {
    mode: "backfilled",
    source_ref: {
      type: "tau2-simulation",
      digest_alg: "SHA-256",
      digest: "0".repeat(64),
    },
    source_asserted_at: sourceAssertedAt,
    import_batch: "tau2-airline-replay-2025-09",
    imported_at: "2026-10-20T10:00:00Z",
    time_rung: "self_attested",
  },
});

/** The first session's level-2 proofs, opened, and the report's proofs, opened. */
function datingParts(root: HTMLElement): {
  header: string;
  sessionProofs: HTMLElement;
  method: HTMLElement;
} {
  expand(root);
  const session = root.querySelector<HTMLElement>("article[data-session]")!;
  const sessionProofs = open(session.querySelector('details[data-level="2"]')!);
  const reportProofs = open(
    root.querySelector(
      '[data-section="report-proofs"] details[data-level="2"]',
    )!,
  );
  return {
    header: root.querySelector(".sub")!.textContent!,
    sessionProofs,
    method: reportProofs.querySelector<HTMLElement>(
      '[data-section="methodology"]',
    )!,
  };
}

it("dating: a backfilled session is dated by its source's own time, labelled 'source says', with the import and sealed days beside it", async () => {
  const { bundle } = await sealedComplianceBundle((source) =>
    withCaseRecords(source, (_, i) =>
      BACKFILLED(`2025-09-0${i + 3}T16:06:37Z`),
    ),
  );
  const root = await render(bundle);
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  const { header, sessionProofs, method } = datingParts(root);
  // the header's period is the sessions' own dates, never "judged" on them
  expect(header).toMatch(/ · 2025-09-03( – 2025-09-0\d)?$/);
  expect(header).not.toContain("judged 2025");
  const dated = sessionProofs.querySelector<HTMLElement>("[data-dated]")!;
  expect(dated.dataset.dated).toBe("source");
  expect(dated.textContent).toMatch(
    /^2025-09-0\dT16:06:37Z: source says \(backfilled record; the source's own timestamp, self-attested\)$/,
  );
  expect(sessionProofs.querySelector("[data-imported]")!.textContent).toBe(
    "2026-10-20T10:00:00Z",
  );
  expect(sessionProofs.querySelector("[data-sealed]")!.textContent).toBe(
    "2026-09-23",
  );
  expect(method.querySelector("[data-period]")!.textContent).toMatch(
    /^2025-09-03( – 2025-09-0\d)?$/,
  );
  expect(method.querySelector("[data-sealed]")!.textContent).toBe("2026-09-23");
  const note = method.querySelector<HTMLElement>("[data-date-note]")!;
  expect(note.dataset.dateNote).toBe("source");
  expect(note.textContent).toContain(
    'Dates are the source\'s own timestamps for backfilled records ("source says")',
  );
  expect(note.textContent).toContain(
    "self-attested: carrying it does not make it witnessed",
  );
});

it("dating: with no case record cited, a session keeps the day its reports were sealed under and the page adds no date note", async () => {
  const { bundle } = await sealedComplianceBundle();
  const root = await render(bundle);
  const { header, sessionProofs, method } = datingParts(root);
  expect(header).toMatch(/ · judged 2026-09-23$/);
  expect(sessionProofs.querySelector("[data-dated]")).toBeNull();
  expect(sessionProofs.querySelector("[data-sealed]")!.textContent).toBe(
    "2026-09-23",
  );
  expect(method.querySelector("[data-period]")!.textContent).toBe("2026-09-23");
  expect(method.querySelector("[data-sealed]")).toBeNull();
  expect(method.querySelector("[data-date-note]")).toBeNull();
});
