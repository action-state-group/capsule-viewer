// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

import { expect, it } from "vitest";
import { DEFAULT_WORDS } from "../src/contract-report-wording.js";
import { openToggle, ruleWord } from "../src/report-levels.js";
import {
  spotCheckCard,
  spotCheckToggle,
  type SpotCheckSubject,
} from "../src/spot-check.js";

const PIN = "1ef1a583" + "0".repeat(56);
const RATIONALE =
  "jev choice: not_met (probabilities={'met': 0.05, 'not_met': 0.91, 'not_evaluable': 0.04}, confidence=0.91)";

function subject(over: Partial<SpotCheckSubject> = {}): SpotCheckSubject {
  const W = DEFAULT_WORDS.lines;
  return {
    name: "Within fare rules",
    ref: "policy_compliance.within_fare_rules",
    worded: ruleWord("not_met", "yes", W),
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
            {
              name: "apply_fee",
              arguments: '{"amount":75,"reason":"change"}',
            },
          ],
        },
      ],
    },
    caseRecord: "case1",
    ...over,
  };
}

for (const grouping of ["lines", "groups"] as const)
  it(`${grouping}: the card draws three columns, the turns, the sealed rule wording, the verdict and the judge's words`, () => {
    const W = DEFAULT_WORDS[grouping];
    const card = spotCheckCard(subject(), W);
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
      `judge pin ${PIN} · confidence 0.91`,
    );
  });

it("what the bundle does not carry is said, not drawn: who produced each turn, when a rule is met, the adjudication", () => {
  const card = spotCheckCard(subject(), DEFAULT_WORDS.lines);
  const gaps = [...card.querySelectorAll(".sc-gap")].map((g) => g.textContent);
  expect(gaps).toEqual([
    expect.stringContaining("Who produced each message"),
    expect.stringContaining("When the rule is met"),
    expect.stringContaining("Blind adjudication is not read"),
  ]);
  expect(card.textContent).not.toMatch(/concur|adjudicator said/i);
});

it("a conversation not in the bundle says so in the first column and draws no turns or produced-by line", () => {
  const card = spotCheckCard(
    subject({ transcript: { state: "absent" } }),
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
      subject({ wording: { text: "NOT_STATED", source } }),
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
    subject({
      rationale: undefined,
      noNote:
        "The judge's notes are not in this bundle: its reports are withheld.",
      judgePinDigest: undefined,
    }),
    DEFAULT_WORDS.lines,
  );
  const verdict = card.querySelector('[data-column="verdict"]')!;
  expect(verdict.textContent).toContain("its reports are withheld");
  expect(verdict.querySelector("[data-judge]")).toBeNull();
});

it("the toggle is a level-2 toggle that builds one card per subject on first open, and none for no subjects", () => {
  expect(spotCheckToggle([], DEFAULT_WORDS.lines)).toBeUndefined();
  const toggle = spotCheckToggle(
    [subject(), subject({ ref: "x.y", name: "Other rule" })],
    DEFAULT_WORDS.lines,
  ) as HTMLDetailsElement;
  expect(toggle.dataset.level).toBe("2");
  expect(toggle.querySelector("summary")!.textContent).toBe(
    "Spot check, side by side",
  );
  expect(toggle.querySelector(".sc-card")).toBeNull();
  openToggle(toggle);
  expect(toggle.querySelectorAll(".sc-card")).toHaveLength(2);
  expect(toggle.querySelector("details")).toBeNull();
});
