// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import {
  conversationStatus,
  groupMissedReasons,
  statusWord,
} from "../src/outcome-report-view.js";
import { jsonDigest } from "@action-state-group/agent-action-capsule";
import { DEFAULT_WORDS } from "../src/contract-report-wording.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";
import { ladderWords } from "./helpers/ladder-pack.js";

type Obj = Record<string, unknown>;

function fixture(name: string): Obj {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "test", "testdata", name), "utf8"),
  ) as Obj;
}

/** Render, then open the report's proofs toggle at the foot (built on first open, like every toggle). */
async function render(bundle: unknown): Promise<HTMLElement> {
  const root = await renderClosed(bundle);
  for (const proofs of root.querySelectorAll<HTMLDetailsElement>(
    '[data-section="report-proofs"] > details',
  )) {
    proofs.open = true;
    proofs.dispatchEvent(new Event("toggle"));
  }
  return root;
}

/** Render with every toggle closed, as a reader first sees the page. */
async function renderClosed(bundle: unknown): Promise<HTMLElement> {
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root);
  return root;
}

/** See outcome-report.test.ts's copy: result-root's shape check requires
 * aggregate.buckets to partition every claim exactly once. */
function rebuildBuckets(claims: Obj[]): Obj {
  const buckets: Record<string, string[]> = {
    met: [],
    not_met: [],
    not_evaluable: [],
    ...(claims.some((c) => c.out_of_scope_allowed === true)
      ? { out_of_scope: [] }
      : {}),
  };
  for (const claim of claims)
    buckets[claim.verdict as string]!.push(claim.id as string);
  return buckets;
}

// test/testdata/outcome-report-bundle.json is the output of evidencebook-skills'
// judge pipeline (mock judge backend, 50 trial-0 tau2-bench airline tasks,
// nine rubric criteria judged) -- see outcome-report.test.ts's header comment
// and scripts/outcome-report-fixture.mjs. 50 conversations, all nine criteria
// judged, 0 resolved (expected under the mock backend's roughly uniform
// per-criterion verdicts).
async function sealedOutcomeReportBundle(
  mutate?: (source: Obj) => void,
): Promise<{ bundle: Obj; ids: Record<string, string> }> {
  const source = fixture("outcome-report-bundle.json");
  mutate?.(source);
  return sealEvidenceBundle(source);
}

// ---------------------------------------------------------------------------
// (a) the card renders in place of the generic Result page, after the same
// verify-first gate, and the generic report stays the default elsewhere
// ---------------------------------------------------------------------------

it("renders the outcome-report card, not the generic Result page, when outcome-report/v1 opts in", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  const page = root.querySelector<HTMLElement>('[data-page="outcome-report"]')!;
  expect(page).not.toBeNull();
  expect(page.classList.contains("oi")).toBe(true);
  expect(root.querySelector('[data-page="result"]')).toBeNull();
  // verification page still runs last, same chrome as every other root family
  expect(root.lastElementChild).toBe(
    root.querySelector('[data-page="verification"]')!.closest("[data-checked]"),
  );
});

it("the generic Result page stays the default for a Result-root bundle that does not carry outcome-report/v1", async () => {
  const { bundle } = await sealEvidenceBundle(
    fixture("result-root-bundle.json"),
  );
  const root = await render(bundle);
  expect(root.querySelector('[data-page="result"]')).not.toBeNull();
  expect(root.querySelector('[data-page="outcome-report"]')).toBeNull();
});

it("outcome-report/v1 present but not enabled also falls back to the generic Result page", async () => {
  const { bundle } = await sealedOutcomeReportBundle((source) => {
    ((source.extensions as Obj)["outcome-report/v1"] as Obj).enabled = false;
  });
  const root = await render(bundle);
  expect(root.querySelector('[data-page="result"]')).not.toBeNull();
  expect(root.querySelector('[data-page="outcome-report"]')).toBeNull();
});

// ---------------------------------------------------------------------------
// LOOK: the card's own scoped stylesheet, no external reference anywhere
// ---------------------------------------------------------------------------

it("carries its own scoped <style>, every selector prefixed .oi, no external reference anywhere on the page", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const page = root.querySelector<HTMLElement>('[data-page="outcome-report"]')!;
  const style = page.querySelector("style")!;
  expect(style).not.toBeNull();
  expect(style.textContent).toContain(".oi ");
  expect(style.textContent).toContain("table.lines");
  expect(style.textContent).toContain(".cal{");
  // nothing unscoped (a bare "body{" or a bare "h1,h2,h3{" with no .oi
  // prefix) reached the page: the verification page below the card takes
  // this look only through its own explicit .oi.oi-vp class (see the
  // verification-page test below), never by a stylesheet leak
  expect(style.textContent).not.toMatch(/(^|\n)body\{/u);
  expect(style.textContent).not.toMatch(/(^|\n)h1,h2,h3\{/u);
  expect(root.innerHTML).not.toMatch(/https?:\/\//u);
  expect(
    Array.from(root.querySelectorAll("img, script, link, iframe")),
  ).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// meta
// ---------------------------------------------------------------------------

it("renders the header meta: pack id/version, period, conversation count, result capsule", async () => {
  const { bundle, ids } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const meta = root.querySelector<HTMLElement>('[data-section="meta"]')!;
  // pack and version from the claims' contract_ref; the lock date is stated
  // by nothing in the bundle, so the header draws no lock line at all
  expect(meta.textContent).toContain("tau2-airline-outcomes/v1 v1");
  expect(meta.textContent).not.toContain("Terms locked");
  expect(meta.textContent).not.toContain("2026-08-31");
  expect(meta.textContent).toContain("Period2026-09-23");
  expect(meta.textContent).toContain("50");
  // what was checked, in one plain sentence
  expect(
    meta.querySelector<HTMLElement>("[data-what-checked]")!.textContent,
  ).toContain("9 rules in 3 groups");
  // the Result capsule id is a proof, not a headline
  expect(meta.textContent).not.toContain(ids["result"]);
  expect(
    root.querySelector<HTMLElement>("[data-report-ids]")!.textContent,
  ).toContain(ids["result"]);
});

// ---------------------------------------------------------------------------
// report lines
// ---------------------------------------------------------------------------

it("renders report lines with counts recomputed from the claims, and held/added from calibration (zero when none is cited)", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const table = root.querySelector<HTMLElement>('[data-rows="report-lines"]')!;
  const line = (key: string) =>
    table.querySelector<HTMLElement>(`[data-line="${key}"]`)!;
  expect(line("resolved").dataset.count).toBe("0");
  // a conversation the judge could not decide is never counted as missed
  expect(line("missed").dataset.count).toBe("48");
  expect(line("undecided").dataset.count).toBe("2");
  expect(line("held").dataset.count).toBe("0");
  expect(line("added").dataset.count).toBe("0");
  expect(line("resolved").textContent).toContain("0 of 50");
});

it("shows counts by default, never a percentage, unless the presentation flag asks for one", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const table = root.querySelector<HTMLElement>('[data-rows="report-lines"]')!;
  expect(table.textContent).not.toMatch(/%/u);

  const { bundle: pctBundle } = await sealedOutcomeReportBundle((source) => {
    ((source.extensions as Obj)["outcome-report/v1"] as Obj).percentages = true;
  });
  const pctRoot = await render(pctBundle);
  const pctTable = pctRoot.querySelector<HTMLElement>(
    '[data-rows="report-lines"]',
  )!;
  expect(pctTable.querySelector('[data-line="missed"]')!.textContent).toContain(
    "96%",
  );
});

it("renders a static verified stamp and the verify-first tamper note, never an interactive tamper control", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  expect(root.querySelector(".stamp.rec")).not.toBeNull();
  const note = root.querySelector<HTMLElement>("[data-tamper-note]")!;
  expect(note.dataset.tamperNote).toBe("verify-first");
  expect(root.querySelectorAll("button")).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// day by day
// ---------------------------------------------------------------------------

it("renders one tile per day, resolved of total", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const list = root.querySelector<HTMLElement>("[data-days]")!;
  expect(list.dataset.days).toBe("1");
  const day = list.querySelector<HTMLElement>('[data-day="2026-09-23"]')!;
  expect(day).not.toBeNull();
  expect(day.dataset.resolved).toBe("0");
  expect(day.dataset.total).toBe("50");
  // no evaluation-report/v1 record carries a day-level policy-change flag,
  // so none is drawn
  expect(day.querySelector("[data-policy-changed]")).toBeNull();
});

// ---------------------------------------------------------------------------
// human spot checks
// ---------------------------------------------------------------------------

it("renders 'no calibration-summary/v1 records cited' when the bundle cites none -- the real pipeline's own shape today", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const section = root.querySelector<HTMLElement>(
    '[data-section="human-checks"]',
  )!;
  expect(section.textContent).toContain(
    "no calibration-summary/v1 records cited",
  );
  expect(section.querySelector("[data-weeks]")).toBeNull();
});

it("renders human spot checks: k of n per week, from an injected calibration-summary/v1, with held and added split out", async () => {
  const { bundle } = await sealedOutcomeReportBundle((source) => {
    const resultDoc = ((source.disclosures as Obj).result as Obj)
      .agent_input as Obj;
    const claims = resultDoc.claims as Obj[];
    const conversationId = (claims[0]!.id as string).split("::")[0]!;
    (source.records as Obj[]).push({ capsule_id: "cal-2026-W39" });
    const calClaim = {
      id: "cal::2026-W39",
      type: "calibration",
      contract_ref: (claims[0] as Obj).contract_ref,
      requirement_ref: "human-spot-check",
      tier: "recomputed",
      grade: "self-attested",
      sufficiency: "SATISFIED",
      verdict: "not_met",
      evidence: [{ digest_alg: "SHA-256", digest: "cal-2026-W39" }],
      proofs: [],
      presentation: {
        kind: "disclosure",
        status: "SATISFIED",
        evidence: [{ digest_alg: "SHA-256", digest: "cal-2026-W39" }],
      },
    };
    const allClaims = [...claims, calClaim];
    (source.disclosures as Obj).result = {
      agent_input: {
        ...resultDoc,
        claims: allClaims,
        aggregate: {
          ...(resultDoc.aggregate as Obj),
          buckets: rebuildBuckets(allClaims),
        },
      },
    };
    (source.disclosures as Obj)["cal-2026-W39"] = {
      agent_input: {
        spec_version: "calibration-summary/v1",
        week: "2026-W39",
        sample: [
          {
            conversation_id: conversationId,
            ai_verdict: "met",
            human_verdict: "not_met",
          },
          { conversation_id: "x", ai_verdict: "not_met", human_verdict: "met" },
          { conversation_id: "y", ai_verdict: "met", human_verdict: "met" },
        ],
      },
    };
  });
  const root = await render(bundle);
  const list = root.querySelector<HTMLElement>("[data-weeks]")!;
  expect(list.dataset.weeks).toBe("1");
  const week = list.querySelector<HTMLElement>('[data-week="2026-W39"]')!;
  expect(week.dataset.k).toBe("1");
  expect(week.dataset.n).toBe("3");
  expect(week.querySelector<HTMLElement>("[data-held]")!.dataset.held).toBe(
    "1",
  );
  expect(week.querySelector<HTMLElement>("[data-added]")!.dataset.added).toBe(
    "1",
  );
});

// ---------------------------------------------------------------------------
// why conversations missed
// ---------------------------------------------------------------------------

it("summarises results rule by rule: per-check pass counts, every rule's counts add up, and a rule opens into exactly the conversations it did not meet", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const rules = root.querySelector<HTMLElement>('[data-section="rules"]')!;
  const group = (id: string) =>
    rules.querySelector<HTMLElement>(`tr.grp[data-check-id="${id}"]`)!;
  expect(group("policy_compliance").dataset.passCount).toBe("4");
  expect(group("task_resolution").dataset.passCount).toBe("2");
  expect(group("grounded_communication").dataset.passCount).toBe("2");
  const rows = rules.querySelectorAll<HTMLElement>("tr[data-rule]");
  expect(rows).toHaveLength(9);
  for (const row of rows) {
    const counts = [...row.querySelectorAll<HTMLElement>("td.n")].map((td) =>
      Number(td.textContent),
    );
    expect(counts.reduce((a, b) => a + b, 0)).toBe(50);
    const [, notMet, , undecided] = counts;
    // the conversations open in a full-width row right below the rule
    const drillRow = row.nextElementSibling as HTMLElement | null;
    const drill =
      drillRow !== null && drillRow.dataset.drillFor === row.dataset.rule
        ? drillRow.querySelector<HTMLElement>('details[data-level="1"]')
        : null;
    if (notMet! + undecided! === 0) {
      expect(drill).toBeNull();
      continue;
    }
    open(drill!);
    const convs = drill!.querySelectorAll<HTMLElement>("article.conv");
    expect(convs).toHaveLength(notMet! + undecided!);
    // each one really did not meet this rule
    const first = open(convs[0]!);
    expect(
      first.querySelector<HTMLElement>(`tr[data-crit="${row.dataset.rule}"]`)!
        .dataset.critVerdict,
    ).not.toBe("met");
  }
  // the label is the criterion's readable name, never a raw snake_case id
  expect(
    rules.querySelector(
      'tr[data-rule="policy_compliance.confirmed_before_acting"]',
    )!.textContent,
  ).toContain("Confirmed before acting");
});

it("never shows a raw reason_code: with no sealed label, the miss is named by its failing criterion", async () => {
  const source = fixture("outcome-report-bundle.json");
  const resultDoc = ((source.disclosures as Obj).result as Obj)
    .agent_input as Obj;
  const claims = resultDoc.claims as Obj[];
  const notMet = claims.find((c) => c.verdict === "not_met")!;
  const digest = (notMet.evidence as Obj[])[0]!.digest as string;
  (source.disclosures as Obj)[digest] = {
    agent_input: {
      ...(((source.disclosures as Obj)[digest] as Obj).agent_input as Obj),
      reason_code: "acted_without_confirmation",
    },
  };
  const { bundle } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  expand(root);
  for (const conv of root.querySelectorAll<HTMLElement>("article.conv"))
    open(conv);
  const page = root.querySelector<HTMLElement>('[data-page="outcome-report"]')!;
  expect(page.textContent).not.toContain("acted_without_confirmation");
});

// ---------------------------------------------------------------------------
// the terms
// ---------------------------------------------------------------------------

it("renders the terms from the bundle: unstated terms marked, the resolution rule, 3 checks x 3 criteria, tier read from the claims", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const terms = root.querySelector<HTMLElement>('[data-section="terms"]')!;
  expect(terms.textContent).toContain("what counts as resolved");
  // nothing in the bundle states an agreement or a lock date: the terms
  // draw neither, rather than a standing "not stated"
  expect(terms.textContent).not.toContain("Agreed with the counterparty");
  expect(terms.textContent).not.toContain("Locked");
  expect(terms.textContent).not.toContain("airline policy");
  expect(terms.textContent).toContain(
    "A conversation resolves only when every criterion judged for it is met or does not apply, and at least one is met.",
  );
  expect(terms.querySelectorAll("[data-check-id]")).toHaveLength(3);
  expect(terms.querySelectorAll("[data-criterion-id]")).toHaveLength(9);
  // every one of rubric v3.2's nine clauses is tier:judged in the real
  // compiled contract this fixture's claims came from -- read from the
  // claims, not from a hard-coded "deterministic" flag in terms data
  const judged = terms.querySelector<HTMLElement>(
    '[data-criterion-id="prices_from_system"]',
  )!;
  expect(judged.dataset.tier).toBe("judged");
  expect(judged.textContent).toContain("(judged)");
  const alsoJudged = terms.querySelector<HTMLElement>(
    '[data-criterion-id="confirmed_before_acting"]',
  )!;
  expect(alsoJudged.dataset.tier).toBe("judged");
});

it("lists only the criteria the claims name: one no claim cites is not drawn as a term", async () => {
  const source = fixture("outcome-report-bundle.json");
  const resultDoc = ((source.disclosures as Obj).result as Obj)
    .agent_input as Obj;
  const kept = (resultDoc.claims as Obj[]).filter(
    (c) =>
      (c.requirement_ref as string) !==
      "grounded_communication.no_invented_policy",
  );
  (source.disclosures as Obj).result = {
    agent_input: {
      ...resultDoc,
      claims: kept,
      aggregate: {
        ...(resultDoc.aggregate as Obj),
        buckets: rebuildBuckets(kept),
      },
    },
  };
  const { bundle } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  const terms = root.querySelector<HTMLElement>('[data-section="terms"]')!;
  expect(
    terms.querySelector('[data-criterion-id="no_invented_policy"]'),
  ).toBeNull();
  expect(terms.querySelectorAll("[data-criterion-id]")).toHaveLength(8);
});

// ---------------------------------------------------------------------------
// what ran
// ---------------------------------------------------------------------------

it("renders what ran: contract and judge pin digest from the cited reports, pinned when every one agrees", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const section = root.querySelector<HTMLElement>('[data-section="what-ran"]')!;
  expect(section.textContent).toContain("tau2-airline-outcomes/v1");
  expect(section.textContent).toContain(
    "d1eb15a561a0eb31fb4bb6be88ce239aa903a77e79985291429065e83c305b96",
  );
  expect(section.textContent).toContain("not stated");
  const ran = section.querySelector<HTMLElement>(".ran")!;
  expect(ran.dataset.pinned).toBe("true");
  expect(section.querySelector("[data-pin-mismatch]")).toBeNull();
});

it("flags what-ran as not pinned, and omits the value, when the cited reports disagree on judge pin digest", async () => {
  const { bundle } = await sealedOutcomeReportBundle((source) => {
    const resultDoc = ((source.disclosures as Obj).result as Obj)
      .agent_input as Obj;
    const claims = resultDoc.claims as Obj[];
    const firstDigest = (claims[0]!.evidence as Obj[])[0]!.digest as string;
    (source.disclosures as Obj)[firstDigest] = {
      agent_input: {
        ...(((source.disclosures as Obj)[firstDigest] as Obj)
          .agent_input as Obj),
        judge_pin_digest: "a-different-pin",
      },
    };
  });
  const root = await render(bundle);
  const section = root.querySelector<HTMLElement>('[data-section="what-ran"]')!;
  expect(section.querySelector<HTMLElement>(".ran")!.dataset.pinned).toBe(
    "false",
  );
  expect(section.querySelector("[data-pin-mismatch]")).not.toBeNull();
  expect(section.textContent).not.toContain("a-different-pin");
});

it("renders the judge model and prompt/axes digests only when they recompute to the sealed judge pin digest", async () => {
  const components = {
    model_id: "jev-1.13.0",
    prompt_digest: "aa".repeat(32),
    axes_digest: "bb".repeat(32),
    sampling_params: { temperature: 0 },
  };
  const good = await jsonDigest({ ...components, model_version: null });
  const withPin = (digest: string) =>
    sealedOutcomeReportBundle((source) => {
      for (const [key, entry] of Object.entries(source.disclosures as Obj)) {
        if (key === "result") continue;
        const report = (entry as Obj).agent_input as Obj;
        report.judge_pin = components;
        report.judge_pin_digest = digest;
      }
    });

  const shown = await render((await withPin(good)).bundle);
  const section = shown.querySelector<HTMLElement>(
    '[data-section="what-ran"]',
  )!;
  const value = (key: string): string =>
    section.querySelector<HTMLElement>(`[data-ran="${key}"] .v`)!.textContent!;
  expect(
    section.querySelector<HTMLElement>(".ran")!.dataset.pinRecomputes,
  ).toBe("true");
  expect(value("judge-model")).toBe("jev-1.13.0");
  expect(value("judge-prompt-digest")).toBe("aa".repeat(32));
  expect(value("judge-axes-digest")).toBe("bb".repeat(32));
  expect(value("judge-pin-digest")).toContain(good);
  expect(value("judge-pin-digest")).toContain("recomputed");

  const bad = await render((await withPin("cd".repeat(32))).bundle);
  const badSection = bad.querySelector<HTMLElement>(
    '[data-section="what-ran"]',
  )!;
  expect(
    badSection.querySelector<HTMLElement>(".ran")!.dataset.pinRecomputes,
  ).toBe("false");
  expect(badSection.textContent).not.toContain("jev-1.13.0");
  expect(badSection.textContent).not.toContain("aa".repeat(32));
  expect(
    badSection.querySelector("[data-pin-components-mismatch]"),
  ).not.toBeNull();
});

// ---------------------------------------------------------------------------
// icons: inline SVG, never emoji (emoji render as tofu boxes in headless
// Chromium with no colour-emoji font)
// ---------------------------------------------------------------------------

it("draws every icon as inline SVG and puts no emoji or pictographic glyph anywhere on the page", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const page = root.querySelector<HTMLElement>('[data-page="outcome-report"]')!;
  const icons = Array.from(page.querySelectorAll<SVGElement>("svg[data-icon]"));
  // one target for the outcome, then one generic check mark per check: no
  // sealed record says which picture fits a check, so none is chosen
  expect(icons.map((svg) => svg.dataset.icon)).toEqual([
    "target",
    "check",
    "check",
    "check",
  ]);
  for (const svg of icons) expect(svg.querySelector("path")).not.toBeNull();
  expect(root.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  expect(root.textContent).not.toMatch(/[\u25C6\u25E6]/u);
  const style = page.querySelector("style")!.textContent!;
  expect(style).not.toMatch(/\p{Extended_Pictographic}/u);
  expect(style).not.toMatch(/[\u25C6\u25E6]/u);
});

// ---------------------------------------------------------------------------
// verification details
// ---------------------------------------------------------------------------

it("renders verification details: bundle digest, checkpoint root/size, and names its own checkpoint kind (not RFC 6962)", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const section = root.querySelector<HTMLElement>(
    '[data-section="verification-details"]',
  )!;
  const checkpoint = bundle.checkpoint as { root: string; mmr_size: number };
  expect(section.textContent).toContain(checkpoint.root);
  expect(section.textContent).toContain(String(checkpoint.mmr_size));
  const note = section.querySelector<HTMLElement>("[data-checkpoint-kind]")!;
  expect(note.dataset.checkpointKind).toBe("mmr");
  expect(note.textContent).toContain("Merkle Mountain Range");
  // this engine's own checkpoint, explicitly distinguished from the design's
  // RFC 6962 month-root -- never claimed as the same proof
  expect(note.textContent).toContain("not a month-level RFC 6962 tree");
});

it("draws the verification banner and the verification page in the card's look -- banner first, verification page still last", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const banner = root.querySelector<HTMLElement>('[data-verify="verified"]')!;
  // The pill keeps its look on the card (capsule-viewer#60); the page root
  // takes the card's own frame.
  expect(banner.className).toBe("cv-pill");
  expect(root.classList.contains("cv-shell-chrome")).toBe(true);
  const card = root.querySelector('[data-page="outcome-report"]')!;
  expect(
    banner.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  const verification = root.querySelector<HTMLElement>(
    '[data-page="verification"]',
  )!;
  expect(root.lastElementChild).toBe(verification.closest("[data-checked]"));
  expect(verification.classList.contains("oi")).toBe(true);
  expect(verification.classList.contains("oi-vp")).toBe(true);
  const panel = verification.querySelector<HTMLElement>(":scope > .sec")!;
  expect(panel).not.toBeNull();
  expect(panel.querySelector("h2")!.textContent).toBe("Verification");
  expect(panel.querySelectorAll("ol > li")).toHaveLength(10);
  // the card's stylesheet carries the rules the classes name
  const style = root.querySelector(
    '[data-page="outcome-report"] style',
  )!.textContent!;
  expect(style).toContain(".oi.oi-vp");
});

it("leaves the banner and verification page unstyled for every other root family", async () => {
  const { bundle } = await sealedOutcomeReportBundle((source) => {
    ((source.extensions as Obj)["outcome-report/v1"] as Obj).enabled = false;
  });
  const root = await render(bundle);
  expect(root.querySelector<HTMLElement>("[data-verify]")!.className).toBe(
    "cv-pill",
  );
  const verification = root.querySelector<HTMLElement>(
    '[data-page="verification"]',
  )!;
  expect(verification.className).toBe("");
  expect(verification.querySelector(":scope > .sec")).toBeNull();
});

// ---------------------------------------------------------------------------
// (c) verify-first gate / tamper demo: tampering hides the whole card
// ---------------------------------------------------------------------------

it("tamper demo: a tampered claim fails verification -- no outcome-report page, no report lines, nothing from the card reaches the DOM", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const disclosures = bundle.disclosures as Record<string, Obj>;
  const resultId = Object.keys(disclosures).find(
    (id) =>
      (disclosures[id]!.agent_input as Obj)?.result_version ===
      "evidence-result-v0",
  )!;
  const tampered = structuredClone(disclosures[resultId]!.agent_input) as Obj;
  const claims = tampered.claims as Obj[];
  const flipped = claims.find(
    (claim) => claim.verdict === "not_met" && claim.type === undefined,
  )!;
  flipped.verdict = "met";
  const buckets = (tampered.aggregate as Obj).buckets as Obj;
  buckets.not_met = (buckets.not_met as string[]).filter(
    (id) => id !== flipped.id,
  );
  buckets.met = [...(buckets.met as string[]), flipped.id as string];

  const root = await render({
    ...bundle,
    disclosures: { ...disclosures, [resultId]: { agent_input: tampered } },
  });
  expect(root.querySelector('[data-verify="failed"]')).not.toBeNull();
  expect(
    root.querySelector('[data-refusal="unverified-bundle"]'),
  ).not.toBeNull();
  expect(root.querySelector('[data-page="outcome-report"]')).toBeNull();
  expect(root.querySelector('[data-rows="report-lines"]')).toBeNull();
  expect(root.querySelectorAll("[data-day]")).toHaveLength(0);
  expect(root.textContent).not.toContain("Outcome statement");
  expect(root.lastElementChild).toBe(
    root.querySelector('[data-page="verification"]')!.closest("[data-checked]"),
  );
});

it("tamper demo: tampering the checkpoint itself also hides the card, same as any other bundle", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const checkpoint = bundle.checkpoint as { mmr_size: number };
  const root = await render({
    ...bundle,
    checkpoint: { ...checkpoint, mmr_size: checkpoint.mmr_size + 1 },
  });
  expect(root.querySelector('[data-verify="failed"]')).not.toBeNull();
  expect(root.querySelector('[data-page="outcome-report"]')).toBeNull();
});

// ---------------------------------------------------------------------------
// this card never changes the generic Result-page/report/v1/evaluation-summary
// goldens: the emitter's other tests already pin those; this is a belt-and-
// braces check that a non-outcome-report bundle is completely unaffected.
// ---------------------------------------------------------------------------

it("still renders report/v1 and evaluation-summary/v1 root families exactly as before", async () => {
  const week = await render(fixture("week-bundle.json"));
  expect(week.querySelectorAll("[data-report-date]").length).toBeGreaterThan(0);
  expect(week.querySelector('[data-page="outcome-report"]')).toBeNull();

  const { bundle } = await sealEvidenceBundle(
    fixture("report-rows-bundle.json"),
  );
  const rows = await render(bundle);
  expect(rows.querySelector('[data-page="report-rows"]')).not.toBeNull();
  expect(rows.querySelector('[data-page="outcome-report"]')).toBeNull();
});

// ---------------------------------------------------------------------------
// drill-down: every line and every missed-reason row opens into the
// conversations behind it; each conversation opens into its nine criteria,
// the rationale exactly as sealed, why, and the ids to recompute it
// ---------------------------------------------------------------------------

/**
 * As in a browser, a conversation's body is built only when it nears the
 * view: these tests stand in an IntersectionObserver that never fires on its
 * own, and `open` brings one conversation into view. Without it every opened
 * line would build every conversation it lists.
 */
type Seen = (entries: { isIntersecting: boolean }[]) => void;
const inView = new Map<Element, Seen>();
beforeEach(() => {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    class {
      constructor(private readonly seen: Seen) {}
      observe(target: Element): void {
        inView.set(target, this.seen);
      }
      disconnect(): void {}
    };
});
afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
  inView.clear();
});

/** Open a toggle, or bring a conversation (never a toggle) into view: either way its body is built. */
function open(conv: HTMLElement): HTMLElement {
  if (conv.tagName === "DETAILS") {
    (conv as HTMLDetailsElement).open = true;
    conv.dispatchEvent(new Event("toggle"));
    return conv;
  }
  const slot = conv.querySelector(":scope > .conv-slot");
  if (slot !== null) inView.get(slot)?.([{ isIntersecting: true }]);
  return conv;
}

/** Toggle 1 on every summary line: builds the conversation lists. */
function expand(root: HTMLElement): HTMLElement {
  for (const line of root.querySelectorAll<HTMLElement>(
    'details[data-level="1"].line',
  ))
    open(line);
  return root;
}

/** Toggle 2 inside an opened conversation: builds its proofs. */
function proofs(conv: HTMLElement): HTMLElement {
  return open(
    conv.querySelector<HTMLElement>('details[data-level="2"].proofs')!,
  );
}

/** The fixture's sealed report payloads, keyed by the claim id that cites them. */
function reportsByClaim(source: Obj): Map<string, Obj> {
  const resultDoc = ((source.disclosures as Obj).result as Obj)
    .agent_input as Obj;
  const out = new Map<string, Obj>();
  for (const claim of resultDoc.claims as Obj[]) {
    const digest = (claim.evidence as Obj[])[0]!.digest as string;
    const disclosed = (source.disclosures as Obj)[digest] as Obj | undefined;
    if (disclosed !== undefined)
      out.set(claim.id as string, disclosed.agent_input as Obj);
  }
  return out;
}

it("two levels: the missed line opens (toggle 1) into every missed conversation, each with nine rules and their results, and its proofs (toggle 2) carry the judge's P", async () => {
  const source = fixture("outcome-report-bundle.json");
  const reports = reportsByClaim(source);
  const { bundle } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  const line = root.querySelector<HTMLElement>('[data-line="missed"]')!;
  const drill = line.querySelector<HTMLElement>(
    'details[data-drill="missed"]',
  )!;
  expect(drill).not.toBeNull();
  expect(drill.dataset.level).toBe("1");
  expect(drill.querySelector("summary")!.textContent).toBe(
    "Show the 48 conversations",
  );
  // closed, toggle 1 has built nothing
  expect(drill.querySelectorAll("article.conv")).toHaveLength(0);
  open(drill);
  const convs = drill.querySelectorAll<HTMLElement>("article.conv");
  expect(convs).toHaveLength(48);
  // the resolved line has nothing behind it in this fixture: no empty drill
  expect(
    root.querySelector('[data-line="resolved"] details[data-drill]'),
  ).toBeNull();

  // a conversation is not a toggle: its header and its body are in place
  const conv = open(convs[0]!);
  expect(conv.tagName).toBe("ARTICLE");
  const id = conv.dataset.conversation!;
  expect(conv.querySelector(".conv-h")!.textContent).toContain("missed");
  // the missed line says why first: the reasons, then the conversations
  // under each, all inside the one level-1 toggle
  const why = drill.querySelector<HTMLElement>('[data-section="why-missed"]')!;
  expect(why.textContent).toContain("Why conversations missed");
  expect(
    [...why.querySelectorAll<HTMLElement>("tr[data-reason-key]")]
      .map((r) => Number(r.dataset.count))
      .reduce((a, b) => a + b, 0),
  ).toBe(48);
  // no third level: the conversation holds exactly one toggle, the proofs
  const nested = conv.querySelectorAll<HTMLElement>("details");
  expect(nested).toHaveLength(1);
  expect(nested[0]!.dataset.level).toBe("2");
  const proofBox = proofs(conv);
  const rows = conv.querySelectorAll<HTMLElement>("tr[data-crit]");
  expect(rows).toHaveLength(9);
  for (const row of rows) {
    const claimId = `${id}::${row.dataset.crit}`;
    const report = reports.get(claimId)!;
    expect(report).toBeDefined();
    // the proofs carry the rationale exactly as sealed, never rewritten
    const sealedRow = proofBox.querySelector<HTMLElement>(
      `tr[data-proof-crit="${row.dataset.crit}"]`,
    )!;
    expect(
      sealedRow.querySelector<HTMLElement>('[data-rationale="sealed"]')!
        .textContent,
    ).toBe(report.rationale);
    // level 1 says how sure the judge was, in plain words
    expect(row.querySelector(".sealed")!.textContent).toMatch(
      /^The judge gave this verdict a probability of \d+%\.$/u,
    );
    // P is read back from the sealed rationale's probabilities for the verdict returned
    const probs = /'([a-z_]+)': ([0-9.]+)/gu;
    const table = new Map<string, number>();
    for (const m of (report.rationale as string).matchAll(probs))
      table.set(m[1]!, Number(m[2]));
    const proofRow = proofBox.querySelector<HTMLElement>(
      `tr[data-proof-crit="${row.dataset.crit}"]`,
    )!;
    expect(proofRow.querySelector<HTMLElement>("[data-p]")!.dataset.p).toBe(
      table.get(report.verdict as string)!.toFixed(2),
    );
    expect(row.dataset.critVerdict).toBe(report.verdict);
  }
  expect(
    conv.querySelector<HTMLElement>('[data-rationale-label="derived"]')!
      .textContent,
  ).toContain(
    "The judge's note is derived from its probabilities; the judge returns no free-text reasoning",
  );
});

it("drill-down: says plainly the transcript is absent, and gives the record ids and judge pin to recompute", async () => {
  const source = fixture("outcome-report-bundle.json");
  const reports = reportsByClaim(source);
  const { bundle, ids } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  expand(root);
  const conv = open(
    root.querySelector<HTMLElement>('[data-drill="missed"] article.conv')!,
  );
  proofs(conv);
  const id = conv.dataset.conversation!;
  const anyReport = [...reports.entries()].find(([claimId]) =>
    claimId.startsWith(`${id}::`),
  )![1];
  const absent = conv.querySelector<HTMLElement>('[data-transcript="absent"]')!;
  expect(absent.textContent).toContain("not in this bundle");
  expect(absent.textContent).toContain(anyReport.source_capsule_id as string);
  const check = conv.querySelector<HTMLElement>("[data-check-it]")!;
  expect(check.textContent).toContain(ids["result"]);
  expect(check.textContent).toContain(anyReport.source_capsule_id as string);
  expect(check.textContent).toContain(
    "d1eb15a561a0eb31fb4bb6be88ce239aa903a77e79985291429065e83c305b96",
  );
  // case, case record, result capsule, transcript, judge pin
  expect(check.querySelectorAll("dt")).toHaveLength(5);
  const why = conv.querySelector<HTMLElement>('[data-why="missed"]')!;
  expect(why.textContent).toMatch(/^Missed: \d+ of \d+ rules that applied/u);
  expect(conv.textContent).toContain("cites no turn of the conversation");
  // still a static page: no button, no script
  expect(root.querySelectorAll("button, script")).toHaveLength(0);
});

it("drill-down: a not_applicable criterion is its own state -- no claim, no P, never drawn as met or missed", async () => {
  const source = fixture("outcome-report-bundle.json");
  const resultDoc = ((source.disclosures as Obj).result as Obj)
    .agent_input as Obj;
  // drop this criterion's claim in ONE conversation: the other 49 still name
  // it, so it is a term, and in that conversation it reads not_applicable
  const all = resultDoc.claims as Obj[];
  const dropped = all.find(
    (c) =>
      (c.requirement_ref as string) ===
      "grounded_communication.refunds_match_payment_records",
  )!;
  const kept = all.filter((c) => c !== dropped);
  (source.disclosures as Obj).result = {
    agent_input: {
      ...resultDoc,
      claims: kept,
      aggregate: {
        ...(resultDoc.aggregate as Obj),
        buckets: rebuildBuckets(kept),
      },
    },
  };
  const { bundle } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  expect(
    root.querySelector<HTMLElement>('[data-line="not-applicable"]')!.dataset
      .count,
  ).toBe("1");
  const ruleRow = root.querySelector<HTMLElement>(
    'tr[data-rule="grounded_communication.refunds_match_payment_records"]',
  )!;
  // one conversation where the rule did not apply: counted in its own column
  expect(ruleRow.querySelectorAll("td.n")[2]!.textContent).toBe("1");
  expand(root);
  const conv = [...root.querySelectorAll<HTMLElement>("article.conv")]
    .map((c) => open(c))
    .find((c) =>
      c.querySelector(
        'tr[data-crit="grounded_communication.refunds_match_payment_records"][data-crit-verdict="not_applicable"]',
      ),
    )!;
  const row = conv.querySelector<HTMLElement>(
    'tr[data-crit="grounded_communication.refunds_match_payment_records"]',
  )!;
  expect(
    row.querySelector<HTMLElement>('[data-pill="not_applicable"]')!.textContent,
  ).toBe("did not apply");
  expect(row.textContent).toContain("did not come up");
  const proofRow = proofs(conv).querySelector<HTMLElement>(
    'tr[data-proof-crit="grounded_communication.refunds_match_payment_records"]',
  )!;
  expect(proofRow.querySelector("[data-p]")).toBeNull();
  expect(proofRow.textContent).toContain("no claim");
});

it("drill-down: the resolved line opens into exactly its conversations, and a resolved conversation says why in one sentence", async () => {
  const source = fixture("outcome-report-bundle.json");
  const resultDoc = ((source.disclosures as Obj).result as Obj)
    .agent_input as Obj;
  const claims = resultDoc.claims as Obj[];
  const first = (claims[0]!.id as string).split("::")[0]!;
  const flipped = claims.map((c) =>
    (c.id as string).startsWith(`${first}::`)
      ? {
          ...c,
          verdict: "met",
          sufficiency: "SATISFIED",
          presentation: { ...(c.presentation as Obj), status: "SATISFIED" },
        }
      : c,
  );
  (source.disclosures as Obj).result = {
    agent_input: {
      ...resultDoc,
      claims: flipped,
      aggregate: {
        ...(resultDoc.aggregate as Obj),
        buckets: rebuildBuckets(flipped),
      },
    },
  };
  const { bundle } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  expand(root);
  const resolved = root.querySelector<HTMLElement>('[data-drill="resolved"]')!;
  const convs = resolved.querySelectorAll<HTMLElement>("article.conv");
  expect(convs).toHaveLength(1);
  expect(convs[0]!.dataset.conversation).toBe(first);
  open(convs[0]!);
  expect(
    convs[0]!.querySelector('[data-why="resolved"]')!.textContent,
  ).toContain("Resolved: all 9 rules that applied were met.");
});

/** The fixture judged on only its first n criteria, with its first
 * conversation flipped to resolved. */
async function resolvedWithCriteria(
  n: number,
): Promise<{ root: HTMLElement; first: string }> {
  const source = fixture("outcome-report-bundle.json");
  const resultDoc = ((source.disclosures as Obj).result as Obj)
    .agent_input as Obj;
  const claims = resultDoc.claims as Obj[];
  const refs = [
    ...new Set(claims.map((c) => c.requirement_ref as string)),
  ].slice(0, n);
  const first = (claims[0]!.id as string).split("::")[0]!;
  const kept = claims
    .filter((c) => refs.includes(c.requirement_ref as string))
    .map((c) =>
      (c.id as string).startsWith(`${first}::`)
        ? {
            ...c,
            verdict: "met",
            sufficiency: "SATISFIED",
            presentation: { ...(c.presentation as Obj), status: "SATISFIED" },
          }
        : c,
    );
  (source.disclosures as Obj).result = {
    agent_input: {
      ...resultDoc,
      claims: kept,
      aggregate: {
        ...(resultDoc.aggregate as Obj),
        buckets: rebuildBuckets(kept),
      },
    },
  };
  const { bundle } = await sealEvidenceBundle(source);
  return { root: await render(bundle), first };
}

it("a resolved conversation counts the criteria its pack judged, not a fixed nine", async () => {
  const { root, first } = await resolvedWithCriteria(4);
  expand(root);
  const conv = root.querySelector<HTMLElement>(
    `[data-drill="resolved"] article.conv[data-conversation="${first}"]`,
  )!;
  expect(conv.querySelector(".cwhy")!.textContent).toBe(
    "every rule that applied was met",
  );
  open(conv);
  expect(conv.querySelector('[data-why="resolved"]')!.textContent).toBe(
    "Resolved: all 4 rules that applied were met.",
  );
  proofs(conv);
  expect(conv.textContent).toContain("take the AND of the four verdicts");
  expect(conv.textContent).not.toContain("nine");
});

it("a resolved conversation with an out_of_scope criterion splits the header count, and never says that criterion was met", async () => {
  const source = fixture("outcome-report-bundle.json");
  const resultDoc = ((source.disclosures as Obj).result as Obj)
    .agent_input as Obj;
  const claims = resultDoc.claims as Obj[];
  const refs = [
    ...new Set(claims.map((c) => c.requirement_ref as string)),
  ].slice(0, 4);
  const first = (claims[0]!.id as string).split("::")[0]!;
  // out_of_scope_allowed is a per-requirement switch: every claim of
  // refs[0] carries it, but only the first conversation's claim is
  // actually judged out of scope.
  const oosRef = refs[0]!;
  const kept = claims
    .filter((c) => refs.includes(c.requirement_ref as string))
    .map((c) => {
      const mine = (c.id as string).startsWith(`${first}::`);
      const isOosRef = c.requirement_ref === oosRef;
      if (!mine) return isOosRef ? { ...c, out_of_scope_allowed: true } : c;
      return isOosRef
        ? {
            ...c,
            verdict: "out_of_scope",
            sufficiency: "SATISFIED",
            out_of_scope_allowed: true,
            presentation: { ...(c.presentation as Obj), status: "SATISFIED" },
          }
        : {
            ...c,
            verdict: "met",
            sufficiency: "SATISFIED",
            presentation: { ...(c.presentation as Obj), status: "SATISFIED" },
          };
    });
  (source.disclosures as Obj).result = {
    agent_input: {
      ...resultDoc,
      claims: kept,
      aggregate: {
        ...(resultDoc.aggregate as Obj),
        buckets: rebuildBuckets(kept),
      },
    },
  };
  const { bundle } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  expand(root);
  const conv = root.querySelector<HTMLElement>(
    `[data-drill="resolved"] article.conv[data-conversation="${first}"]`,
  )!;
  expect(conv.querySelector(".cwhy")!.textContent).toBe(
    "3 criteria met or not applicable and 1 out of scope",
  );
  open(conv);
  expect(conv.querySelector('[data-why="resolved"]')!.textContent).toBe(
    "Resolved: all 3 rules that applied were met. 1 judged out of scope (did not arise).",
  );
});

it("a conversation judged on one criterion says so in the singular", async () => {
  const { root, first } = await resolvedWithCriteria(1);
  expand(root);
  const conv = root.querySelector<HTMLElement>(
    `[data-drill="resolved"] article.conv[data-conversation="${first}"]`,
  )!;
  open(conv);
  expect(conv.querySelector('[data-why="resolved"]')!.textContent).toBe(
    "Resolved: the 1 rule that applied was met.",
  );
  proofs(conv);
  expect(conv.textContent).toContain("take the AND of the one verdict");
  expect(conv.textContent).not.toContain("rules that applied");
});

it("drill-down: a tampered bundle draws no conversation at all (verify-first holds)", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const disclosures = bundle.disclosures as Record<string, Obj>;
  const resultId = Object.keys(disclosures).find(
    (id) =>
      (disclosures[id]!.agent_input as Obj)?.result_version ===
      "evidence-result-v0",
  )!;
  const tampered = structuredClone(disclosures[resultId]!.agent_input) as Obj;
  const claim = (tampered.claims as Obj[]).find(
    (c) => c.verdict === "not_met",
  )!;
  claim.verdict = "met";
  const buckets = (tampered.aggregate as Obj).buckets as Obj;
  buckets.not_met = (buckets.not_met as string[]).filter(
    (id) => id !== claim.id,
  );
  buckets.met = [...(buckets.met as string[]), claim.id as string];
  const root = await render({
    ...bundle,
    disclosures: { ...disclosures, [resultId]: { agent_input: tampered } },
  });
  expect(root.querySelector('[data-verify="failed"]')).not.toBeNull();
  expect(root.querySelectorAll("article.conv")).toHaveLength(0);
});

it("reads the pack version from the claims' contract_ref, so the header and terms panel show the version judged under", async () => {
  const source = fixture("outcome-report-bundle.json");
  const resultDoc = ((source.disclosures as Obj).result as Obj)
    .agent_input as Obj;
  const claims = (resultDoc.claims as Obj[]).map((c) => ({
    ...c,
    contract_ref: "airline-support-outcomes@1.4.0",
  }));
  (source.disclosures as Obj).result = {
    agent_input: { ...resultDoc, claims },
  };
  const { bundle } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  const meta = root.querySelector<HTMLElement>('[data-section="meta"]')!;
  expect(meta.textContent).toContain("airline-support-outcomes v1.4.0");
  expect(meta.textContent).not.toContain("v1.3.0");
  const terms = root.querySelector<HTMLElement>('[data-section="terms"]')!;
  expect(terms.textContent).toContain("1.4.0 (from the claims' contract_ref)");
  expect(terms.textContent).not.toContain("1.3.0");
});

// ---------------------------------------------------------------------------
// criterion wording: from the sealed reports' clause_claim (the text the judge
// was given), never from the card's own table when the evidence states it
// ---------------------------------------------------------------------------

const NEW_FARE_WORDING =
  "No change or cancellation the fare rules forbid. For a cancellation, do the date math yourself.";
const TABLE_FARE_WORDING =
  "No change the fare class forbids (e.g. basic economy flight changes, over-limit certificates).";

/** Give every sealed report a clause_claim; `wording` decides the text per report. */
function withClauseClaims(
  source: Obj,
  wording: (clauseId: string, index: number) => string | undefined,
): void {
  let index = 0;
  for (const disclosed of Object.values(source.disclosures as Obj)) {
    const report = (disclosed as Obj).agent_input as Obj | undefined;
    if (report === undefined || typeof report.clause_id !== "string") continue;
    const text = wording(report.clause_id, index++);
    if (text !== undefined) report.clause_claim = text;
  }
}

function fareRow(root: HTMLElement): HTMLElement {
  expand(root);
  const conv = open(
    root.querySelector<HTMLElement>('[data-drill="missed"] article.conv')!,
  );
  return conv.querySelector<HTMLElement>(
    'tr[data-crit="policy_compliance.within_fare_rules"]',
  )!;
}

it("producer note and edited badges: rendered from outcome-report/v1 as presentation text, labelled not evidence, absent otherwise", async () => {
  const { bundle } = await sealedOutcomeReportBundle((source) => {
    const block = (source.extensions as Obj)["outcome-report/v1"] as Obj;
    block.producer_note = {
      title: "What changed in this run",
      lines: ["Line one <b>not markup</b>.", "Line two."],
    };
    block.edited_criteria = [
      {
        criterion: "policy_compliance.within_fare_rules",
        badge: "edited in v1.5.0",
      },
      { criterion: "not a ref", badge: "dropped" },
    ];
  });
  const root = await render(bundle);
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  const page = root.querySelector<HTMLElement>('[data-page="outcome-report"]')!;
  const note = page.querySelector<HTMLElement>("[data-producer-note]")!;
  // first thing after the card's own <style>: directly under the banner
  expect(page.children[1]).toBe(note);
  expect(note.textContent).toContain("not evidence");
  expect(note.querySelector("h2")!.textContent).toBe(
    "What changed in this run",
  );
  const lines = [...note.querySelectorAll("li")].map((li) => li.textContent);
  expect(lines).toEqual(["Line one <b>not markup</b>.", "Line two."]);
  expect(note.querySelector("b")).toBeNull();
  const terms = root.querySelector<HTMLElement>('[data-section="terms"]')!;
  const badges = terms.querySelectorAll<HTMLElement>("span.edited");
  expect(badges).toHaveLength(1);
  expect(badges[0]!.textContent).toBe("edited in v1.5.0");
  expect(badges[0]!.closest<HTMLElement>("li")!.dataset.criterionId).toBe(
    "within_fare_rules",
  );
  const row = fareRow(root);
  expect(row.querySelector("span.edited")!.textContent).toBe(
    "edited in v1.5.0",
  );
  const table = row.closest("table")!;
  expect(table.querySelectorAll("span.edited")).toHaveLength(1);
  const { bundle: plain } = await sealedOutcomeReportBundle();
  const plainRoot = await render(plain);
  expect(plainRoot.querySelector("[data-producer-note]")).toBeNull();
  expect(plainRoot.querySelector("span.edited")).toBeNull();
});
it("producer note: a note with any non-text line is dropped whole, never half-shown", async () => {
  const { bundle } = await sealedOutcomeReportBundle((source) => {
    const block = (source.extensions as Obj)["outcome-report/v1"] as Obj;
    block.producer_note = { title: "T", lines: ["ok", 42] };
  });
  const root = await render(bundle);
  expect(root.querySelector('[data-page="outcome-report"]')).not.toBeNull();
  expect(root.querySelector("[data-producer-note]")).toBeNull();
});
it("wording: each criterion prints the clause_claim its sealed reports carry, not the card's terms table", async () => {
  const { bundle } = await sealedOutcomeReportBundle((source) =>
    withClauseClaims(source, (clauseId) =>
      clauseId === "policy_compliance.within_fare_rules"
        ? NEW_FARE_WORDING
        : `Sealed wording for ${clauseId}.`,
    ),
  );
  const root = await render(bundle);
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  const terms = root.querySelector<HTMLElement>('[data-section="terms"]')!;
  const item = terms.querySelector<HTMLElement>(
    'li[data-criterion-id="within_fare_rules"]',
  )!;
  expect(item.dataset.wording).toBe("sealed");
  expect(item.textContent).toContain(NEW_FARE_WORDING);
  expect(item.textContent).not.toContain(TABLE_FARE_WORDING);
  expect(terms.querySelectorAll('li[data-wording="sealed"]')).toHaveLength(9);
  expect(terms.querySelector(".wsrc")).toBeNull();
  expect(
    terms.querySelector<HTMLElement>("[data-wording-note]")!.textContent,
  ).toBe(
    "Rule wording as sealed in the judge's reports (the text the judge was given).",
  );
  const row = fareRow(root);
  const cell = row.querySelector<HTMLElement>("small[data-wording]")!;
  expect(cell.dataset.wording).toBe("sealed");
  expect(cell.textContent).toBe(NEW_FARE_WORDING);
  expect(row.querySelector(".wsrc")).toBeNull();
});

it("wording: a report whose clause_id names another criterion never supplies this criterion's wording", async () => {
  const { bundle } = await sealedOutcomeReportBundle((source) => {
    withClauseClaims(source, () => undefined);
    for (const disclosed of Object.values(source.disclosures as Obj)) {
      const report = (disclosed as Obj).agent_input as Obj | undefined;
      if (report?.clause_id === "policy_compliance.within_fare_rules") {
        report.clause_claim = NEW_FARE_WORDING;
        report.clause_id = "policy_compliance.no_unrequested_actions";
      }
    }
  });
  const root = await render(bundle);
  const item = root.querySelector<HTMLElement>(
    '[data-section="terms"] li[data-criterion-id="within_fare_rules"]',
  )!;
  expect(item.dataset.wording).toBe("unstated");
  expect(item.textContent).not.toContain(NEW_FARE_WORDING);
});

it("wording: a bundle whose reports state none says so -- no wording is supplied from anywhere else", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const terms = root.querySelector<HTMLElement>('[data-section="terms"]')!;
  const item = terms.querySelector<HTMLElement>(
    'li[data-criterion-id="within_fare_rules"]',
  )!;
  expect(item.dataset.wording).toBe("unstated");
  expect(item.textContent).toContain("not stated");
  expect(item.textContent).not.toContain(TABLE_FARE_WORDING);
  expect(item.querySelector(".wsrc")!.textContent).toBe(
    "Wording not stated: no report in this bundle states it.",
  );
  expect(
    terms.querySelector<HTMLElement>("[data-wording-note]")!.textContent,
  ).toContain("Rule wording not stated");
  // stated once for the conversation, not repeated on every rule
  const row = fareRow(root);
  expect(row.querySelector("small[data-wording]")).toBeNull();
  expect(
    row.closest(".conv-b")!.querySelector<HTMLElement>("[data-gaps]")!
      .textContent,
  ).toContain("The rule wording is not in this bundle.");
});

it("wording: reports that disagree on a criterion's wording are not resolved by picking one", async () => {
  const { bundle } = await sealedOutcomeReportBundle((source) =>
    withClauseClaims(source, (clauseId, index) =>
      clauseId === "policy_compliance.within_fare_rules"
        ? index % 2 === 0
          ? NEW_FARE_WORDING
          : "Some other wording."
        : `Sealed wording for ${clauseId}.`,
    ),
  );
  const root = await render(bundle);
  const terms = root.querySelector<HTMLElement>('[data-section="terms"]')!;
  const item = terms.querySelector<HTMLElement>(
    'li[data-criterion-id="within_fare_rules"]',
  )!;
  expect(item.dataset.wording).toBe("mixed");
  expect(item.textContent).not.toContain(TABLE_FARE_WORDING);
  expect(item.textContent).not.toContain(NEW_FARE_WORDING);
  expect(item.querySelector(".wsrc")!.textContent).toContain(
    "state different wordings",
  );
  // the other eight still come from the evidence
  expect(terms.querySelectorAll('li[data-wording="sealed"]')).toHaveLength(8);
  expect(
    terms.querySelector<HTMLElement>("[data-wording-note]")!.textContent,
  ).toContain("where the reports do not state it");
});

// ---------------------------------------------------------------------------
// Dating: the calendar and period count each
// conversation under its own record date -- the source's own timestamp for a
// backfilled record ("source says", AAC -05 provenance_mode), the case
// record's own timestamp otherwise -- not the day the judgments were sealed,
// and the page says so, with the sealed day alongside.
// ---------------------------------------------------------------------------

/** Cite a case record per conversation: each report names it as its
 * `source_capsule_id`, each claim cites it, and the root references it. */
function withCaseRecords(
  source: Obj,
  fields: (conversationId: string, index: number) => Obj,
): void {
  const result = ((source.disclosures as Obj).result as Obj).agent_input as Obj;
  const claims = result.claims as Obj[];
  const records = source.records as Obj[];
  const root = records.find((r) => r.capsule_id === "result")!;
  const references = root.references as Obj[];
  const seen = new Map<string, string>();
  for (const claim of claims) {
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
      references.push({
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
  timestamp: "2026-09-22T10:00:00Z",
  provenance_mode: {
    mode: "backfilled",
    source_ref: {
      type: "tau2-simulation",
      digest_alg: "SHA-256",
      digest: "0".repeat(64),
    },
    source_asserted_at: sourceAssertedAt,
    import_batch: "tau2-airline-trial0",
    imported_at: "2026-09-22T10:00:00Z",
  },
});

it("dating: backfilled case records put the calendar and period on the source's own date, labelled 'source says', with the sealed day alongside", async () => {
  const { bundle } = await sealedOutcomeReportBundle((source) =>
    withCaseRecords(source, () => BACKFILLED("2025-06-05T16:06:37.787845")),
  );
  const root = await render(bundle);
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  const calendar = root.querySelector<HTMLElement>(
    '[data-section="calendar"]',
  )!;
  const tiles = calendar.querySelectorAll<HTMLElement>("[data-day]");
  expect([...tiles].map((t) => t.dataset.day)).toEqual(["2025-06-05"]);
  expect(tiles[0]!.dataset.total).toBe("50");
  expect(
    tiles[0]!.querySelector<HTMLElement>("[data-sealed]")!.textContent,
  ).toBe("sealed 2026-09-23");
  expect(
    tiles[0]!.querySelector<HTMLElement>("[data-source-says]")!.dataset
      .sourceSays,
  ).toBe("50");
  // the source wrote no zone: the page says so and assumes none
  expect(
    tiles[0]!.querySelector('[data-tz-marker="not-stated"]'),
  ).not.toBeNull();
  const note = calendar.querySelector<HTMLElement>("[data-date-note]")!;
  expect(note.dataset.dateNote).toBe("source");
  expect(note.textContent).toContain(
    'Dates are the source\'s own timestamps for backfilled records ("source says"), as given, not when the records were sealed. Sealed 2026-09-23.',
  );
  expect(note.textContent).toContain("Timezone not stated on 50 of 50");
  const meta = root.querySelector<HTMLElement>('[data-section="meta"]')!;
  expect(meta.textContent).toContain("Period2025-06-05");
  expect(meta.querySelector<HTMLElement>("[data-sealed]")!.textContent).toBe(
    "Sealed2026-09-23",
  );
  expect(meta.querySelector("[data-date-note]")).not.toBeNull();
  // the drill-down says which date it used, verbatim, and the sealed day
  expand(root);
  const conv = open(root.querySelector<HTMLElement>("article.conv")!);
  proofs(conv);
  const dated = conv.querySelector<HTMLElement>("[data-dated]")!;
  expect(dated.dataset.dated).toBe("source");
  expect(dated.textContent).toBe(
    "2025-06-05T16:06:37.787845 (timezone not stated): source says (backfilled record; the source's own timestamp, self-attested)",
  );
  expect(conv.textContent).toContain("Imported2026-09-22T10:00:00Z");
  expect(conv.textContent).toContain("Judged and sealed2026-09-23");
});

it("dating: case records with no backfill are dated by their own timestamp, as given, one tile per record day", async () => {
  const { bundle } = await sealedOutcomeReportBundle((source) =>
    withCaseRecords(source, (_, index) => ({
      timestamp:
        index % 2 === 0 ? "2026-09-21T23:30:00Z" : "2026-09-22T00:30:00+02:00",
    })),
  );
  const root = await render(bundle);
  const calendar = root.querySelector<HTMLElement>(
    '[data-section="calendar"]',
  )!;
  const tiles = [...calendar.querySelectorAll<HTMLElement>("[data-day]")];
  // the day is the written date: +02:00 is NOT converted to 2026-09-21 UTC
  expect(tiles.map((t) => [t.dataset.day, t.dataset.total])).toEqual([
    ["2026-09-21", "25"],
    ["2026-09-22", "25"],
  ]);
  expect(calendar.querySelector("[data-source-says]")).toBeNull();
  expect(calendar.querySelector('[data-tz-marker="not-stated"]')).toBeNull();
  const note = calendar.querySelector<HTMLElement>("[data-date-note]")!;
  expect(note.dataset.dateNote).toBe("record");
  expect(note.textContent).toBe(
    "The period is when the conversations happened (each case record's own time, as given), not when they were judged. Sealed 2026-09-23.",
  );
  const meta = root.querySelector<HTMLElement>('[data-section="meta"]')!;
  expect(meta.textContent).toContain("2026-09-21 – 2026-09-22");
});

it("dating: with no case record cited, the calendar keeps the judged day and the page adds no dating label", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = await render(bundle);
  const days = [...root.querySelectorAll<HTMLElement>("[data-day]")];
  expect(days.map((d) => d.dataset.day)).toEqual(["2026-09-23"]);
  expect(root.querySelector("[data-date-note]")).toBeNull();
  expect(root.querySelector("[data-sealed]")).toBeNull();
  expand(root);
  const conv = open(root.querySelector<HTMLElement>("article.conv")!);
  proofs(conv);
  expect(conv.querySelector("[data-check-it]")).not.toBeNull();
  expect(conv.querySelector("[data-dated]")).toBeNull();
  expect(conv.textContent).not.toContain("Judged and sealed");
});

// ---------------------------------------------------------------------------
// two levels, plain words, and the missed-label fix
// ---------------------------------------------------------------------------

it("a conversation the judge could not decide reads 'could not decide', never 'missed'", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = expand(await render(bundle));
  const undecided = root.querySelectorAll<HTMLElement>(
    '[data-drill="undecided"] article.conv',
  );
  expect(undecided).toHaveLength(2);
  for (const conv of undecided) {
    expect(conv.dataset.conversationVerdict).toBe("not_evaluable");
    const pill = conv.querySelector<HTMLElement>(".conv-h [data-pill]")!;
    expect(pill.dataset.pill).toBe("undecided");
    expect(pill.textContent).toBe("could not decide");
    expect(conv.querySelector(".conv-h")!.textContent).not.toContain("missed");
  }
  // and none of them is listed under the missed line
  const missed = new Set(
    [
      ...root.querySelectorAll<HTMLElement>(
        '[data-drill="missed"] article.conv',
      ),
    ].map((c) => c.dataset.conversation),
  );
  for (const conv of undecided)
    expect(missed.has(conv.dataset.conversation)).toBe(false);
});

it("true two levels: no toggle sits inside more than one toggle, a level-1 never holds a level-1, and a level-2 holds none", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const root = expand(await render(bundle));
  for (const conv of root.querySelectorAll<HTMLElement>("article.conv"))
    proofs(open(conv));
  const all = [
    ...root.querySelectorAll<HTMLElement>(
      '[data-page="outcome-report"] details',
    ),
  ];
  expect(all.length).toBeGreaterThan(50);
  for (const details of all) {
    expect(["1", "2"]).toContain(details.dataset.level);
    let ancestors = 0;
    for (let a = details.parentElement; a !== null; a = a.parentElement)
      if (a.tagName === "DETAILS") ancestors += 1;
    expect(ancestors).toBeLessThanOrEqual(1);
    if (details.dataset.level === "1")
      expect(details.querySelector('details[data-level="1"]')).toBeNull();
    if (details.dataset.level === "2")
      expect(details.querySelector("details")).toBeNull();
  }
  // a conversation's proofs are two clicks from the summary: its line, then
  // the proofs; the conversation itself is never a toggle
  const conv = root.querySelector<HTMLElement>(
    '[data-drill="missed"] article.conv',
  )!;
  const proofToggle = conv.querySelector<HTMLElement>(
    'details[data-level="2"]',
  )!;
  expect(proofToggle.parentElement!.closest("details")).toBe(
    root.querySelector('[data-drill="missed"]'),
  );
});

it("lazy: a closed line builds nothing, the report's proofs build on first open, and in a browser each conversation's body builds only as it nears the view", async () => {
  const { bundle } = await sealedOutcomeReportBundle();
  const observed: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
  const g = globalThis as { IntersectionObserver?: unknown };
  g.IntersectionObserver = class {
    constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
      observed.push(cb);
    }
    observe(): void {}
    disconnect(): void {}
  };
  try {
    const root = await renderClosed(bundle);
    expect(root.querySelectorAll("article.conv")).toHaveLength(0);
    const foot = root.querySelector<HTMLElement>(
      '[data-section="report-proofs"] details',
    )!;
    expect(foot.querySelector('[data-section="terms"]')).toBeNull();
    open(foot);
    expect(foot.querySelector('[data-section="terms"]')).not.toBeNull();
    const drill = open(
      root.querySelector<HTMLElement>('[data-drill="missed"]')!,
    );
    const convs = drill.querySelectorAll<HTMLElement>("article.conv");
    expect(convs).toHaveLength(48);
    // listed in place, every body still pending until it nears the view
    expect(drill.querySelectorAll('[data-body="pending"]')).toHaveLength(48);
    expect(drill.querySelector("tr[data-crit]")).toBeNull();
    observed[0]!([{ isIntersecting: true }]);
    expect(convs[0]!.querySelectorAll("tr[data-crit]")).toHaveLength(9);
    expect(drill.querySelectorAll('[data-body="pending"]')).toHaveLength(47);
  } finally {
    delete g.IntersectionObserver;
  }
});

it("a conversation with no rule result is undecided, never 'no rule applied'", () => {
  expect(
    conversationStatus({
      verdict: "not_evaluable",
      criteria: [],
    } as unknown as Parameters<typeof conversationStatus>[0]),
  ).toBe("undecided");
});

it("a conversation with no not_evaluable criterion to point to says the plain 'could not decide', on both word sets, never a report-specific claim", () => {
  const conversation = {
    criteria: [],
  } as unknown as Parameters<typeof statusWord>[1];
  expect(statusWord("undecided", conversation, DEFAULT_WORDS.lines)).toEqual({
    word: "could not decide",
    tone: "ne",
  });
  expect(statusWord("undecided", conversation, ladderWords("lines"))).toEqual({
    word: "could not decide",
    tone: "ne",
  });
});

// A regression of #42 (4343133967): the default pack once gave the
// disclosed-no-pin, withheld and unavailable paths the grade ladder's own
// four-way split ("not checked", "(report withheld)", "(report not
// available)") instead of the plain set's single "could not decide". The
// three keys are locked (contract-report-wording.ts LOCKED_ENTRIES), so no
// pack -- not even the ladder pack -- can bring that split back.
it("a judge ran on this conversation's rule but did not decide it, disclosed with no pin: 'could not decide', on both word sets", () => {
  const conversation = {
    criteria: [{ verdict: "not_evaluable", reportState: "disclosed" }],
  } as unknown as Parameters<typeof statusWord>[1];
  for (const w of [DEFAULT_WORDS.lines, ladderWords("lines")])
    expect(statusWord("undecided", conversation, w)).toEqual({
      word: "could not decide",
      tone: "ne",
    });
});

it("every report that would say is withheld: 'could not decide', on both word sets", () => {
  const conversation = {
    criteria: [{ verdict: "not_evaluable", reportState: "withheld" }],
  } as unknown as Parameters<typeof statusWord>[1];
  for (const w of [DEFAULT_WORDS.lines, ladderWords("lines")])
    expect(statusWord("undecided", conversation, w)).toEqual({
      word: "could not decide",
      tone: "ne",
    });
});

it("a cited report this bundle does not carry a readable copy of: 'could not decide', on both word sets", () => {
  const conversation = {
    criteria: [{ verdict: "not_evaluable", reportState: "mismatch" }],
  } as unknown as Parameters<typeof statusWord>[1];
  for (const w of [DEFAULT_WORDS.lines, ladderWords("lines")])
    expect(statusWord("undecided", conversation, w)).toEqual({
      word: "could not decide",
      tone: "ne",
    });
});

it("a conversation missed for c2's not_met is filed under c2, never under c1's earlier failed criterion", () => {
  const terms = {
    checks: [
      { id: "c1", question: "Q1", criteria: [{ id: "a", label: "A" }] },
      { id: "c2", question: "Q2", criteria: [{ id: "b", label: "B" }] },
    ],
    reasonCodes: {},
  } as unknown as Parameters<typeof groupMissedReasons>[1];
  const conversation = {
    conversationId: "conv-1",
    verdict: "not_met",
    criteria: [
      { checkId: "c1", criterionId: "a", verdict: "failed" },
      { checkId: "c2", criterionId: "b", verdict: "not_met" },
    ],
  } as unknown as Parameters<typeof groupMissedReasons>[0][number];
  const groups = groupMissedReasons([conversation], terms);
  expect(groups).toHaveLength(1);
  expect(groups[0]!.key).toBe("c2.b");
  expect(groups[0]!.label).toBe("B (Q2)");
  expect(groups[0]!.conversations).toEqual([conversation]);
});

/** Sets every claim of the conversations `pick` selects to `verdict`, with sufficiency and presentation status taken from a claim already sealed that way, and rebuilds the buckets. */
function setVerdicts(
  source: Obj,
  verdict: "met" | "not_evaluable",
  pick: (conversationId: string) => boolean,
): void {
  const resultDoc = ((source.disclosures as Obj).result as Obj)
    .agent_input as Obj;
  const all = resultDoc.claims as Obj[];
  const template =
    verdict === "met"
      ? { sufficiency: "SATISFIED", status: "SATISFIED" }
      : (() => {
          const t = all.find((c) => c.verdict === "not_evaluable")!;
          return {
            sufficiency: t.sufficiency,
            status: (t.presentation as Obj).status,
          };
        })();
  const claims = all.map((c) =>
    pick((c.id as string).split("::")[0]!)
      ? {
          ...c,
          verdict,
          sufficiency: template.sufficiency,
          presentation: {
            ...(c.presentation as Obj),
            status: template.status,
          },
        }
      : c,
  );
  resultDoc.claims = claims;
  resultDoc.aggregate = {
    ...(resultDoc.aggregate as Obj),
    buckets: rebuildBuckets(claims),
  };
}

it("an undecided conversation never says 'no rule was broken': every result undecided, the page says no rule result was 'not met' and that the records do not show the rules met", async () => {
  const { bundle } = await sealedOutcomeReportBundle((source) =>
    setVerdicts(source, "not_evaluable", () => true),
  );
  const root = expand(await render(bundle));
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  const page = root.querySelector<HTMLElement>('[data-page="outcome-report"]')!;
  expect(page.textContent).not.toContain("no rule was broken");
  expect(page.textContent).not.toContain("No rule was broken");
  const line = page.querySelector<HTMLElement>('[data-line="undecided"]')!;
  expect(line.textContent).toContain('No rule result was "not met"');
  const sentence = open(
    page.querySelector<HTMLElement>('[data-drill="undecided"] article.conv')!,
  ).querySelector<HTMLElement>(".verdict-line")!;
  expect(sentence.textContent).toContain('no rule result was "not met"');
  expect(sentence.textContent).toContain("The records do not show whether");
  expect(
    page.querySelector<HTMLElement>('[data-line="missed"]')!.dataset.count,
  ).toBe("0");
});

it("a claim whose cited evidence is not in the bundle is its own state: 'could not verify', never counted as missed or not met", async () => {
  let first = "";
  const { bundle } = await sealedOutcomeReportBundle((source) => {
    const resultDoc = ((source.disclosures as Obj).result as Obj)
      .agent_input as Obj;
    first = ((resultDoc.claims as Obj[])[0]!.id as string).split("::")[0]!;
    setVerdicts(source, "met", (id) => id === first);
    const claim = (resultDoc.claims as Obj[]).find((c) =>
      (c.id as string).startsWith(`${first}::`),
    )!;
    const missing = { digest_alg: "SHA-256", digest: "e".repeat(64) };
    claim.evidence = [...(claim.evidence as Obj[]), missing];
    (claim.presentation as Obj).evidence = claim.evidence;
  });
  const root = expand(await render(bundle));
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  const line = root.querySelector<HTMLElement>('[data-line="unverified"]')!;
  expect(line.dataset.count).toBe("1");
  expect(line.textContent).toContain("Could not verify");
  const conv = open(
    root.querySelector<HTMLElement>(
      `[data-drill="unverified"] article.conv[data-conversation="${first}"]`,
    )!,
  );
  expect(conv.dataset.status).toBe("unverified");
  const pill = conv.querySelector<HTMLElement>(".conv-h [data-pill]")!;
  expect(pill.textContent).toBe("could not verify");
  expect(pill.classList.contains("bad")).toBe(false);
  expect(conv.querySelector(".verdict-line")!.textContent).toContain(
    "is not in this bundle",
  );
  // never under the missed line
  expect(
    root.querySelector(
      `[data-drill="missed"] article.conv[data-conversation="${first}"]`,
    ),
  ).toBeNull();
  // the rule table gives it its own column, never "not met"
  const rules = root.querySelector<HTMLElement>('[data-rows="rules"]')!;
  const heads = [...rules.querySelectorAll("thead th")].map(
    (th) => th.textContent,
  );
  expect(heads).toContain("failed verification or evidence missing");
  const cells = [...rules.querySelectorAll<HTMLElement>("tr.rule")].map((tr) =>
    [...tr.querySelectorAll("td.n")].map((td) => td.textContent),
  );
  expect(cells.some((c) => c[4] === "1")).toBe(true);
});

it("the proofs say the judge's note is derived from its probabilities only when every rationale is the judge's probability line", async () => {
  // the fixture's rationales are all the judge's own probability lines
  {
    const { bundle } = await sealedOutcomeReportBundle();
    const root = expand(await render(bundle));
    const box = proofs(open(root.querySelector<HTMLElement>("article.conv")!));
    expect(
      box.querySelector<HTMLElement>("[data-rationale-label]")!.dataset
        .rationaleLabel,
    ).toBe("derived");
  }
  // one report with a free-text rationale: the paragraph no longer says
  // every note is derived from probabilities
  const { bundle } = await sealedOutcomeReportBundle((source) => {
    for (const disclosed of Object.values(source.disclosures as Obj)) {
      const report = (disclosed as Obj).agent_input as Obj | undefined;
      if (report === undefined || typeof report.rationale !== "string")
        continue;
      report.rationale = "the checker found no confirmation turn";
      break;
    }
  });
  const root = expand(await render(bundle));
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  const labels = [...root.querySelectorAll<HTMLElement>("article.conv")].map(
    (conv) =>
      proofs(open(conv)).querySelector<HTMLElement>("[data-rationale-label]")
        ?.dataset.rationaleLabel,
  );
  expect(labels).toContain("sealed");
  for (const conv of root.querySelectorAll<HTMLElement>("article.conv")) {
    const box = conv.querySelector<HTMLElement>(".pf-b")!;
    const free = [
      ...box.querySelectorAll<HTMLElement>('[data-rationale="sealed"]'),
    ].some((r) => !(r.textContent ?? "").startsWith("jev choice:"));
    if (free)
      expect(box.textContent).not.toContain(
        "The judge's note is derived from its probabilities",
      );
  }
});

it("an undecided rule whose report is withheld reads 'could not decide', with the note that the report is withheld, never 'not checked'", async () => {
  const source = fixture("outcome-report-bundle.json");
  const resultDoc = ((source.disclosures as Obj).result as Obj)
    .agent_input as Obj;
  // withhold every report of the undecided rules
  const undecided = (resultDoc.claims as Obj[]).filter(
    (c) => c.verdict === "not_evaluable",
  );
  expect(undecided.length).toBeGreaterThan(0);
  for (const claim of undecided)
    delete (source.disclosures as Obj)[
      (claim.evidence as Obj[])[0]!.digest as string
    ];
  const { bundle } = await sealEvidenceBundle(source);
  const root = expand(await render(bundle));
  for (const conv of root.querySelectorAll<HTMLElement>(
    '[data-drill="undecided"] article.conv',
  ))
    open(conv);
  const row = root.querySelector<HTMLElement>(
    'article.conv tr[data-crit-verdict="not_evaluable"]',
  )!;
  const pill = row.querySelector<HTMLElement>("[data-pill]")!;
  expect(pill.textContent).toBe("could not decide");
  expect(row.textContent).toContain("the judge's report is withheld");
  for (const p of root.querySelectorAll("article.conv [data-pill]"))
    expect(p.textContent).not.toBe("not checked");
});

it("chrome rule (presentation contract section 6): result wording never comes from the bundle -- result_words supplied, removed or altered draws the same card", async () => {
  const page = async (mutate?: (block: Obj) => void): Promise<string> => {
    const { bundle } = await sealedOutcomeReportBundle((source) => {
      mutate?.((source.extensions as Obj)["outcome-report/v1"] as Obj);
    });
    const root = expand(await render(bundle));
    for (const conv of root.querySelectorAll<HTMLElement>("article.conv"))
      open(conv);
    // The bundle digest covers the extensions, so it changes with them; it
    // is evidence, not wording, and is masked here only.
    return root
      .querySelector<HTMLElement>('[data-page="outcome-report"]')!
      .outerHTML.replace(
        /(Bundle digest<\/div><div class="v">)[0-9a-f]{64}/u,
        "$1<digest>",
      );
  };
  const plain = await page();
  expect(plain).toContain("Missed");
  expect(plain).not.toContain("result-words");
  for (const mutate of [
    (block: Obj) => {
      block.result_words = "ladder";
    },
    (block: Obj) => {
      block.result_words = "LADDER established failed";
    },
  ])
    expect(await page(mutate)).toBe(plain);
});
