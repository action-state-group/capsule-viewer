// SPDX-License-Identifier: BSD-3-Clause
import {
  DEFAULT_PACKS,
  wordsOf,
  type WordingPack,
  type Words,
} from "../../src/contract-report-wording.js";

/**
 * The grade-ladder word set as a wording pack over the defaults: the words
 * the cards used to keep behind a code flag (LADDER_WORDS), now only words.
 */
export const LADDER_ENTRIES: Readonly<Record<string, string>> = {
  "verdict.met": "established",
  "verdict.not_met": "failed",
  "verdict.not_applicable": "not present",
  "verdict.not_evaluable.judged": "inconclusive",
  "verdict.not_evaluable.unjudged": "not checked",
  "verdict.not_evaluable.withheld": "could not decide (report withheld)",
  "verdict.not_evaluable.unavailable":
    "could not decide (report not available)",
  "lines.status.resolved": "established",
  "lines.status.missed": "failed",
  "lines.status.nothing-applied": "not present",
  "lines.status.undecided.judged": "inconclusive",
  "lines.status.undecided.unjudged": "not checked",
  "lines.status.undecided.withheld": "could not decide (report withheld)",
  "lines.status.undecided.unavailable":
    "could not decide (report not available)",
  "lines.line.resolved": "Established (resolved)",
  "lines.line.missed": "Failed (missed)",
  "lines.line.undecided": "Inconclusive or not present",
  "lines.rules.col.undecided": "inconclusive / not checked",
  "groups.row.none-decided": "Not checked or inconclusive",
  "groups.row.exceptions.one": "{n} failed",
  "groups.row.exceptions.other": "{n} failed",
  "groups.row.ok.all-decided": "Established in every session",
};

export function ladderPack(
  grouping: "lines" | "groups",
  extra: Readonly<Record<string, string>> = {},
): WordingPack {
  const known = DEFAULT_PACKS[grouping].entries;
  return {
    id: `test/ladder-${grouping}@1`,
    locale: "en",
    entries: Object.fromEntries(
      Object.entries({ ...LADDER_ENTRIES, ...extra }).filter(([k]) =>
        Object.hasOwn(known, k),
      ),
    ),
  };
}

export function ladderWords(grouping: "lines" | "groups" = "lines"): Words {
  return wordsOf(DEFAULT_PACKS[grouping], { pack: ladderPack(grouping) });
}
