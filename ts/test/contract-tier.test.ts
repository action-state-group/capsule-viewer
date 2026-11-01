// SPDX-License-Identifier: Apache-2.0

// The contract-report module reads each row's requirement tier from the
// page's contract (capsule-viewer#199; contract-report-module-v1 section 2):
// rows drawn in tier sections, an informational row left out of the
// derived lines, a row whose tier is not stated kept in them, and the page
// unchanged without a contract.
//
// The bundles are evidencebook's committed VALID fixtures
// (testdata/show-evidence/monthly-*.bundle.json); the contracts are
// testdata/contracts/, whose id@version and requirement ids agree with them
// (see its README).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";
import {
  conversationStatus,
  gating,
  statusWord,
  type Conversation,
} from "../src/outcome-report-view.js";
import { DEFAULT_PACKS, wordsOf } from "../src/contract-report-wording.js";

const host = new JSDOM();
globalThis.document = host.window.document;
globalThis.HTMLElement = host.window.HTMLElement;

const testdata = (...parts: string[]): string =>
  resolve(process.cwd(), "test", "testdata", ...parts);
const bundleOf = (name: string): unknown =>
  JSON.parse(readFileSync(testdata("show-evidence", name), "utf8"));
const contractOf = (text: string) => ({
  text,
  sha256: createHash("sha256").update(text).digest("hex"),
});
const fixtureContract = (name: string) =>
  contractOf(readFileSync(testdata("contracts", name), "utf8"));

async function render(
  bundle: unknown,
  contract?: { text: string; sha256: string },
): Promise<HTMLElement> {
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root, undefined, {
    depth: "L2",
    ...(contract === undefined ? {} : { contract }),
  });
  return root;
}

const tiersOf = (root: HTMLElement, selector: string) =>
  Object.fromEntries(
    [...root.querySelectorAll<HTMLElement>(selector)].map((row) => [
      row.dataset.rule ?? row.dataset.criterion,
      row.dataset.requirementTier,
    ]),
  );
const sectionOrder = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>("tr.tier")].map(
    (row) => `${row.dataset.requirementTier}: ${row.textContent}`,
  );
const statuses = (root: HTMLElement) =>
  Object.fromEntries(
    [...root.querySelectorAll<HTMLElement>("article.conv")].map((a) => [
      a.dataset.conversation,
      a.dataset.status,
    ]),
  );
const verification = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-page="verification"] dt')].map(
    (dt) => `${dt.textContent}: ${dt.nextElementSibling?.textContent}`,
  );

describe("the Outcomes report (lines)", () => {
  const bundle = bundleOf("monthly-outcome.bundle.json");
  const contract = fixtureContract("example-support-outcomes.json");

  it("without a contract, draws no tier", async () => {
    const root = await render(bundle);
    expect(root.querySelector("[data-requirement-tier]")).toBeNull();
    expect(root.querySelector("[data-sealed-counts]")).toBeNull();
    expect(verification(root).join("\n")).not.toContain("contract");
  });

  it("with the contract, footnote 2 adds that an informational rule never changes the answer", async () => {
    const root = await render(bundle, contract);
    expect(root.querySelector('[data-footnote="resolved"]')?.textContent).toBe(
      "² Resolved means every rule that applied was met, and at least one applied. A rule the contract marks informational never changes the answer.",
    );
  });

  it("with the contract, draws must-have, informational and not-stated sections, each row with its tier", async () => {
    const root = await render(bundle, contract);
    expect(tiersOf(root, "tr.rule[data-rule]")).toEqual({
      "resolution.done_in_full": "must_have",
      "policy.confirmed_before_acting": "must_have",
      "resolution.right_change": "informational",
      "communication.no_invented_terms": "unstated",
    });
    expect(sectionOrder(root)).toEqual([
      "must_have: Must-have terms · 2These count in the answer.",
      "informational: Informational terms · 1Reported, never in the answer: a term not met here changes nothing above it.",
      "unstated: Terms with no stated tier · 1The contract given for this page states no tier for these, so they stay in the answer.",
    ]);
    // Every rule row sits after its own section's heading.
    const rows = [
      ...root.querySelectorAll<HTMLElement>("tr.tier, tr.rule[data-rule]"),
    ];
    let current: string | undefined;
    for (const row of rows) {
      if (row.classList.contains("tier")) current = row.dataset.requirementTier;
      else expect(row.dataset.requirementTier).toBe(current);
    }
    const chip = root.querySelector<HTMLElement>(
      'tr[data-rule="resolution.right_change"] .rtier',
    );
    expect(chip?.textContent).toBe("Informational");
    expect(
      root.querySelector<HTMLElement>("[data-sealed-counts]")?.textContent,
    ).toBe(
      "The sealed result counts informational terms too; the lines this report derives leave them out.",
    );
    expect(verification(root)).toEqual(
      expect.arrayContaining([
        'contract: "example-support-outcomes/v1@1"',
        `contract sha256: "${contract.sha256}"`,
      ]),
    );
  });

  it("leaves an informational not met out of a conversation's result, and keeps a not-stated one in", async () => {
    const without = statuses(await render(bundle));
    const withIt = statuses(await render(bundle, contract));
    expect(Object.keys(withIt).sort()).toEqual(Object.keys(without).sort());
    const changed = Object.keys(without).filter(
      (id) => without[id] !== withIt[id],
    );
    // The conversation missed only on resolution.right_change
    // (informational), and the one undecided only on it, are resolved; the
    // ones missed on the not-stated communication.no_invented_terms stay
    // missed.
    expect(
      changed.map((id) => `${without[id]} -> ${withIt[id]}`).sort(),
    ).toEqual(["missed -> resolved", "undecided -> resolved"]);
    const count = (all: Record<string, string | undefined>, status: string) =>
      Object.values(all).filter((s) => s === status).length;
    expect(count(without, "missed")).toBe(4);
    expect(count(withIt, "missed")).toBe(3);
  });

  it("marks each rule's tier in a conversation's own table, and the calendar counts resolved as the lines do", async () => {
    const without = await render(bundle);
    const root = await render(bundle, contract);
    const crit = [
      ...root.querySelectorAll<HTMLElement>(
        "tr[data-crit][data-requirement-tier]",
      ),
    ];
    expect(crit.length).toBeGreaterThan(0);
    for (const row of crit)
      expect(
        row.querySelector(".rtier")?.getAttribute("data-requirement-tier"),
      ).toBe(row.dataset.requirementTier);
    expect(
      root.querySelector<HTMLElement>('tr[data-crit="resolution.right_change"]')
        ?.dataset.requirementTier,
    ).toBe("informational");
    expect(
      without.querySelector("tr[data-crit][data-requirement-tier]"),
    ).toBeNull();
    const resolved = (r: HTMLElement) =>
      [...r.querySelectorAll<HTMLElement>("[data-day][data-resolved]")].reduce(
        (n, d) => n + Number(d.dataset.resolved),
        0,
      );
    const statusesOf = (r: HTMLElement) => statuses(r);
    const count = (all: Record<string, string | undefined>) =>
      Object.values(all).filter((st) => st === "resolved").length;
    expect(resolved(without)).toBe(count(statusesOf(without)));
    expect(resolved(root)).toBe(count(statusesOf(root)));
    expect(resolved(root)).toBe(resolved(without) + 2);
  });

  it("with a contract the Result does not cite, every row's tier is not stated and nothing is left out", async () => {
    const other = contractOf(
      '{"id":"example-support-outcomes/v1","version":"2","requirements":[{"id":"resolution.right_change","tier":"informational"}]}',
    );
    const root = await render(bundle, other);
    expect(new Set(Object.values(tiersOf(root, "tr.rule[data-rule]")))).toEqual(
      new Set(["unstated"]),
    );
    expect(root.querySelector("[data-sealed-counts]")).toBeNull();
    expect(statuses(root)).toEqual(statuses(await render(bundle)));
  });

  it("a contract that does not check is not read, and the verification page says why", async () => {
    const root = await render(bundle, {
      ...contract,
      sha256: "0".repeat(64),
    });
    expect(root.querySelector("[data-requirement-tier]")).toBeNull();
    expect(verification(root)).toContain(
      `contract sha256: "${"0".repeat(64)} (not read: contract bytes do not hash to its contract_sha256)"`,
    );
  });
});

describe("the EU AI Act Results (groups)", () => {
  const bundle = bundleOf("monthly-compliance.bundle.json");
  const contract = fixtureContract("example-ai-act-obligations.json");
  const headline = (root: HTMLElement) =>
    root.querySelector('[data-headline="groups"]')?.textContent;

  it("without a contract, draws no tier", async () => {
    const root = await render(bundle);
    expect(root.querySelector("[data-requirement-tier]")).toBeNull();
  });

  it("with the contract, draws each test in its tier's section and its obligation's worst line from that section only", async () => {
    const root = await render(bundle, contract);
    expect(tiersOf(root, "tr.test[data-criterion]")).toEqual({
      "art5.no_manipulation_or_deception": "must_have",
      "art50.disclosure_before_first_turn": "informational",
      "art50.disclosure_clear_or_obvious": "must_have",
      "art26.allowed_action_rules": "unstated",
    });
    expect(
      [...root.querySelectorAll<HTMLElement>("tr.tier")].map(
        (r) => r.dataset.requirementTier,
      ),
    ).toEqual(["must_have", "informational", "unstated"]);
    // Art. 50 heads both the must-have and the informational section; its
    // must-have worst line no longer reads the informational test's not met.
    const art50 = [
      ...root.querySelectorAll<HTMLElement>('tr.ob[data-obligation="art50"]'),
    ];
    expect(art50).toHaveLength(2);
    expect(
      art50[0]!.querySelector("[data-worst]")?.getAttribute("data-worst"),
    ).toBe("clean");
    expect(
      art50[1]!.querySelector("[data-worst]")?.getAttribute("data-worst"),
    ).toBe("not_met");
    expect(root.querySelector("[data-sealed-counts]")?.textContent).toBe(
      "The sealed result counts informational tests too; the lines this report derives leave them out.",
    );
    expect(
      new Set([...root.querySelectorAll("[id]")].map((e) => e.id)).size,
    ).toBe(root.querySelectorAll("[id]").length);
  });

  it("reads a test's tier by its own claims' contract_ref when the Result cites two contracts", async () => {
    const source = JSON.parse(
      readFileSync(testdata("compliance-bundle.json"), "utf8"),
    ) as Record<string, any>;
    for (const claim of source.disclosures.result.agent_input.claims)
      if (claim.requirement_ref.startsWith("art26."))
        claim.contract_ref = "eu-other@1";
    const { bundle: two } = await sealEvidenceBundle(source);
    const root = await render(
      two,
      contractOf(
        '{"id":"eu-ai-act-obligations","version":"0.1.0","requirements":[{"id":"art5.no_manipulation_or_deception","tier":"informational"},{"id":"art50.disclosure_before_first_turn","tier":"must_have"},{"id":"art50.disclosure_clear_or_obvious","tier":"must_have"},{"id":"art26.allowed_action_rules","tier":"must_have"}]}',
      ),
    );
    const rows = tiersOf(root, "tr.test[data-criterion]");
    expect(rows["art5.no_manipulation_or_deception"]).toBe("informational");
    expect(rows["art50.disclosure_clear_or_obvious"]).toBe("must_have");
    // The art26 tests cite another contract: not stated, never must-have.
    for (const [id, tier] of Object.entries(rows))
      if (id.startsWith("art26.")) expect(tier).toBe("unstated");
    expect(root.querySelector("[data-sealed-counts]")).not.toBeNull();
  });

  it("leaves an informational not met out of the headline", async () => {
    const without = headline(await render(bundle));
    const withIt = headline(await render(bundle, contract));
    // Session 3 missed only on art50.disclosure_before_first_turn.
    expect(without).toMatch(/^1 of 4 sessions met every test/u);
    expect(withIt).toMatch(/^2 of 4 sessions met every test/u);
  });
});

describe("a conversation's result, read with tiers", () => {
  const criterion = (
    checkId: string,
    criterionId: string,
    verdict: string,
    contractRef = "c@1",
  ) =>
    ({
      checkId,
      criterionId,
      verdict,
      claim: { contractRef },
    }) as unknown as Conversation["criteria"][number];
  const conversation = (criteria: Conversation["criteria"]): Conversation =>
    ({ criteria, verdict: "not_met" }) as unknown as Conversation;
  const tiers: Record<string, "must_have" | "informational" | "unstated"> = {
    "a.must": "must_have",
    "a.info": "informational",
    "a.info2": "informational",
  };
  const tierOf = (_ref: string | undefined, req: string) =>
    tiers[req] ?? "unstated";

  it("is nothing applied when every rule it has is informational", () => {
    const c = conversation([
      criterion("a", "info", "not_met"),
      criterion("a", "info2", "met"),
    ]);
    const g = gating([c], tierOf);
    expect(conversationStatus(c)).toBe("missed");
    expect(conversationStatus(c, g)).toBe("nothing-applied");
  });

  it("chooses the undecided word from the rules in its answer", () => {
    // A must-have rule with no claim (unjudged) and an informational rule a
    // judge could not decide: the counted rules say unjudged.
    const c = {
      criteria: [
        { checkId: "a", criterionId: "must", verdict: "no_claim" },
        {
          checkId: "a",
          criterionId: "info",
          verdict: "not_evaluable",
          claim: { contractRef: "c@1" },
          reportState: "disclosed",
          judgePinDigest: "a".repeat(64),
        },
      ],
      verdict: "not_evaluable",
    } as unknown as Conversation;
    const g = gating([c], tierOf);
    const pack = DEFAULT_PACKS.lines;
    const w = wordsOf(pack, {
      pack: {
        ...pack,
        entries: {
          ...pack.entries,
          "lines.status.undecided.judged": "judge could not decide",
          "lines.status.undecided.unjudged": "not yet judged",
        },
      },
    });
    expect(conversationStatus(c, g)).toBe("undecided");
    expect(statusWord("undecided", c, w, g).word).toBe("not yet judged");
    expect(statusWord("undecided", c, w).word).toBe("judge could not decide");
  });
});
