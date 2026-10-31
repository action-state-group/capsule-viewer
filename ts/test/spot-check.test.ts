// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

import { expect, it } from "vitest";
import { DEFAULT_WORDS } from "../src/contract-report-wording.js";
import {
  linkConversations,
  openToggle,
  ruleWord,
} from "../src/report-levels.js";
import {
  spotCheckCard,
  spotCheckToggle,
  type SpotCheck,
  type SpotCheckRule,
} from "../src/spot-check.js";

const PIN = "1ef1a583" + "0".repeat(56);
const RATIONALE =
  "jev choice: not_met (probabilities={'met': 0.05, 'not_met': 0.91, 'not_evaluable': 0.04}, confidence=0.91)";

function rule(over: Partial<SpotCheckRule> = {}): SpotCheckRule {
  return {
    name: "Within fare rules",
    ref: "policy_compliance.within_fare_rules",
    worded: ruleWord("not_met", "yes", DEFAULT_WORDS.lines),
    verdict: "not_met",
    drawnVerdict: "not_met",
    wording: {
      text: "A change, refund or fee the agent applied is one the fare's rules permit for that ticket.",
      source: "sealed",
    },
    rationale: RATIONALE,
    noNote: "The judge left no notes.",
    judgePinDigest: PIN,
    reportState: "disclosed",
    ...over,
  };
}

function spot(over: Partial<SpotCheck> = {}): SpotCheck {
  return {
    transcript: {
      state: "verified",
      transcriptRecordId: "tx",
      turns: [
        {
          role: "user",
          content: "Can I change this to the morning flight?",
          toolCalls: [],
        },
        {
          role: "assistant",
          content: "Yes. A $75 change fee applies.",
          toolCalls: [
            { name: "apply_fee", arguments: '{"amount":75,"reason":"change"}' },
          ],
        },
      ],
    },
    caseRecord: "case1",
    rules: [rule()],
    ...over,
  };
}

for (const grouping of ["lines", "groups"] as const)
  it(`${grouping}: the card draws three columns, the turns, the sealed rule wording, the verdict and the judge's words`, () => {
    const W = DEFAULT_WORDS[grouping];
    const card = spotCheckCard(spot(), W);
    const cols = [...card.querySelectorAll<HTMLElement>("[data-column]")].map(
      (c) => c.dataset.column,
    );
    expect(cols).toEqual(["happened", "criterion", "verdict"]);
    const happened = card.querySelector('[data-column="happened"]')!;
    expect(happened.querySelectorAll("li.turn")).toHaveLength(2);
    expect(happened.querySelector("[data-tool-call=apply_fee]")).not.toBeNull();
    expect(happened.querySelector(".sc-h")!.textContent).toBe(
      "What happened · 2 messages, 1 tool call",
    );
    const criterion = card.querySelector('[data-column="criterion"]')!;
    expect(criterion.querySelector("blockquote")!.textContent).toContain(
      "the fare's rules permit",
    );
    const verdict = card.querySelector('[data-column="verdict"]')!;
    expect(verdict.querySelector(".pill")!.textContent).toBe("not met");
    // the judge's words: 91% sure it is not met, from the sealed rationale
    expect(verdict.querySelector(".sc-q")!.textContent).toBe(
      W.t("judge.note.sure", { p: 91 }),
    );
    expect(verdict.querySelector("[data-judge]")!.textContent).toBe(
      `judge_pin_digest: ${PIN} · confidence 0.91`,
    );
  });

it("several rules share one conversation: it is drawn once, each rule is a row of criterion and verdict", () => {
  const card = spotCheckCard(
    spot({
      rules: [
        rule(),
        rule({
          ref: "x.y",
          name: "Other rule",
          worded: ruleWord("met", "yes", DEFAULT_WORDS.lines),
          verdict: "met",
          drawnVerdict: "met",
        }),
      ],
    }),
    DEFAULT_WORDS.lines,
  );
  expect(card.querySelectorAll("li.turn")).toHaveLength(2);
  expect(card.querySelectorAll("[data-column=happened]")).toHaveLength(1);
  expect(
    [...card.querySelectorAll<HTMLElement>("[data-column=criterion]")].map(
      (c) => c.dataset.spotRule,
    ),
  ).toEqual(["policy_compliance.within_fare_rules", "x.y"]);
  expect(
    card
      .querySelector<HTMLElement>("[data-column=happened]")!
      .style.getPropertyValue("--span"),
  ).toBe("2");
});

it("what the card does not show is said once, not drawn: who produced each message, when a rule is met, the blind adjudication", () => {
  const card = spotCheckCard(
    spot({ rules: [rule(), rule({ ref: "x.y" })] }),
    DEFAULT_WORDS.lines,
  );
  const gaps = [...card.querySelectorAll(".sc-gap")].map((g) => g.textContent);
  expect(gaps).toEqual([
    expect.stringContaining("Who produced each message"),
    expect.stringContaining("not when it counts as met"),
    expect.stringContaining("does not show whether a second, blind judge"),
  ]);
  expect(card.textContent).not.toMatch(/concur|adjudicator said/i);
});

it("a conversation not in the bundle says so in the first column and draws no turns or produced-by line", () => {
  const card = spotCheckCard(
    spot({ transcript: { state: "absent" } }),
    DEFAULT_WORDS.lines,
  );
  const happened = card.querySelector('[data-column="happened"]')!;
  expect(happened.querySelector("li.turn")).toBeNull();
  expect(happened.querySelector(".absent")!.textContent).toContain(
    "not in this bundle",
  );
  expect(happened.querySelector(".sc-gap")).toBeNull();
  expect(happened.querySelector(".sc-h")!.textContent).toBe("What happened");
});

it("a rule whose wording is not stated, or reported differently, draws no wording", () => {
  for (const source of ["unstated", "mixed"] as const) {
    const card = spotCheckCard(
      spot({ rules: [rule({ wording: { text: "NOT_STATED", source } })] }),
      DEFAULT_WORDS.lines,
    );
    const criterion = card.querySelector('[data-column="criterion"]')!;
    expect(criterion.querySelector("blockquote")).toBeNull();
    expect(criterion.textContent).not.toContain("NOT_STATED");
    expect(criterion.querySelector("[data-wording]")!.textContent).toContain(
      source === "mixed" ? "different wordings" : "not in this bundle",
    );
  }
});

it("without a rationale the verdict column says why there is none, and shows no confidence", () => {
  const card = spotCheckCard(
    spot({
      rules: [
        rule({
          rationale: undefined,
          noNote:
            "The judge's notes are not in this bundle: its reports are withheld.",
          judgePinDigest: undefined,
        }),
      ],
    }),
    DEFAULT_WORDS.lines,
  );
  const verdict = card.querySelector('[data-column="verdict"]')!;
  expect(verdict.textContent).toContain("its reports are withheld");
  expect(verdict.querySelector("[data-judge]")).toBeNull();
});

it("the toggle is a level-2 toggle that builds the card on first open, and none for no rules", () => {
  expect(
    spotCheckToggle(spot({ rules: [] }), DEFAULT_WORDS.lines),
  ).toBeUndefined();
  const toggle = spotCheckToggle(
    spot(),
    DEFAULT_WORDS.lines,
  ) as HTMLDetailsElement;
  expect(toggle.dataset.level).toBe("2");
  expect(toggle.querySelector("summary")!.textContent).toBe(
    "Spot check, side by side",
  );
  expect(toggle.querySelector(".sc-card")).toBeNull();
  openToggle(toggle);
  expect(toggle.querySelectorAll(".sc-card")).toHaveLength(1);
  expect(toggle.querySelector("details")).toBeNull();
});

it("a page that runs no script keeps the conversation once: the card's chat becomes a link to the record", () => {
  const page = document.createElement("main");
  const record = document.createElement("details");
  record.className = "cv-record";
  const anchor = document.createElement("span");
  anchor.className = "cv-record-anchor";
  anchor.id = "record-tx";
  record.append(anchor);
  const toggle = spotCheckToggle(
    spot(),
    DEFAULT_WORDS.lines,
  ) as HTMLDetailsElement;
  page.append(toggle, record);
  openToggle(toggle);
  expect(page.querySelectorAll("li.turn")).toHaveLength(2);
  expect(linkConversations(page)).toBe(1);
  expect(page.querySelectorAll("li.turn")).toHaveLength(0);
  const link = page.querySelector<HTMLAnchorElement>(
    ".sc-happened a.chat-static",
  )!;
  expect(link.hidden).toBe(false);
  expect(link.getAttribute("href")).toBe("#record-tx");
  // the rule's wording and verdict stay
  expect(page.querySelector('[data-column="verdict"] .pill')).not.toBeNull();
});
