// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEALING_WORDING, dealingSay } from "../src/dealing-wording.js";

/**
 * capsule-viewer#448: the one layer order and status words, as Steven asked
 * for them (2026-11-26) and Sherlock2 worded them (2026-11-28). The surfaces
 * read them from this pack; these tests hold the pack to the ruling.
 */
describe("the dealing wording pack", () => {
  const pack = DEALING_WORDING;

  it("orders the four layers as #448 says", () => {
    expect(pack.layers).toEqual(["verdict", "facts", "trust", "technical"]);
  });

  it("asks the four trust questions in one order", () => {
    expect(pack.trust).toEqual([
      "rewritten",
      "same_story",
      "as_offered",
      "stands_behind",
    ]);
  });

  it("orders Technical details: content, payment steps, checks", () => {
    expect(pack.technical).toEqual(["content", "payment_steps", "checks"]);
  });

  it("holds the six ruled words", () => {
    expect(dealingSay("word.sealed")).toBe("Sealed");
    expect(dealingSay("word.in_checkpoint")).toBe("In a checkpoint");
    expect(dealingSay("trust.same_story.met")).toBe("Confirmed by them");
    expect(dealingSay("word.time_stamped")).toBe("Time-stamped");
    expect(dealingSay("word.countersigned")).toBe("Countersigned");
    expect(dealingSay("trust.stands_behind.met", { name: "N" })).toBe(
      "Countersigned by N",
    );
    expect(dealingSay("noun.deal")).toBe("Deal");
    expect(dealingSay("layer.caveats")).toBe("What this does not show");
    expect(dealingSay("layer.technical")).toBe("Technical details");
  });

  it("words every trust answer exactly as Sherlock2 ruled", () => {
    const ruled: [string, Record<string, string>, string][] = [
      ["trust.rewritten.met", {}, "Sealed and checkpointed"],
      ["trust.rewritten.not_checkpointed", {}, "Sealed, not yet checkpointed"],
      ["trust.rewritten.not_met", {}, "Changed after sealing"],
      ["trust.same_story.met", {}, "Confirmed by them"],
      ["trust.same_story.not_met", {}, "They recorded something different"],
      ["trust.same_story.not_checked", {}, "Their copy not checked"],
      ["trust.as_offered.met", {}, "As offered"],
      ["trust.as_offered.not_met", {}, "Not as offered"],
      ["trust.as_offered.absent", {}, "No offer in this copy"],
      ["trust.stands_behind.met", { name: "N" }, "Countersigned by N"],
      [
        "trust.stands_behind.met.not_independent",
        { name: "N" },
        "Countersigned by N · not listed as independent",
      ],
      [
        "trust.stands_behind.name_fallback",
        { role: "Seller", short_key: "ab12cd34" },
        "Seller · ab12cd34",
      ],
      ["trust.stands_behind.not_met.owner", {}, "Only your own signature"],
      ["trust.stands_behind.not_met", {}, "Only the holder's signature"],
    ];
    for (const [key, values, text] of ruled)
      expect(dealingSay(key, values), key).toBe(text);
    const trustKeys = Object.keys(pack.entries).filter((k) =>
      k.startsWith("trust."),
    );
    expect(trustKeys.sort()).toEqual(
      [
        ...ruled.map((r) => r[0]),
        "trust.rewritten.met.time_stamped",
        "trust.rewritten.not_checkpointed.time_stamped",
      ].sort(),
    );
  });

  it("rides the time stamp on the first answer, not a fifth slot", () => {
    expect(dealingSay("trust.rewritten.met.time_stamped", { at: "T" })).toBe(
      "Sealed and checkpointed · Time-stamped T",
    );
    expect(
      dealingSay("trust.rewritten.not_checkpointed.time_stamped", { at: "T" }),
    ).toBe("Sealed, not yet checkpointed · Time-stamped T");
    const questions = new Set(
      Object.keys(pack.entries)
        .filter((k) => k.startsWith("trust."))
        .map((k) => k.split(".")[1]),
    );
    expect([...questions].sort()).toEqual([...pack.trust].sort());
  });

  it("refuses a missing key or an unfilled placeholder", () => {
    expect(() => dealingSay("trust.nope")).toThrow(/no entry/);
    expect(() => dealingSay("trust.stands_behind.met")).toThrow(/\{name\}/);
    expect(() => dealingSay("constructor")).toThrow(/no entry/);
    expect(() =>
      dealingSay("trust.stands_behind.name_fallback", { role: "Seller" }),
    ).toThrow(/\{short_key\}/);
    expect(() =>
      dealingSay("trust.stands_behind.name_fallback", { short_key: "ab12" }),
    ).toThrow(/\{role\}/);
  });

  it("takes only the caller's own values, and puts them in literally", () => {
    const inherited = Object.create({ name: "Inherited" }) as Record<
      string,
      string
    >;
    expect(() => dealingSay("trust.stands_behind.met", inherited)).toThrow(
      /\{name\}/,
    );
    expect(dealingSay("trust.stands_behind.met", { name: "$& {role}" })).toBe(
      "Countersigned by $& {role}",
    );
  });

  it("carries words and layer ids only: no verdict, tier or grade words", () => {
    const text = Object.values(pack.entries).join("\n");
    for (const word of [/\bverdict\b/i, /\btier\b/i, /\bgrade\b/i])
      expect(text).not.toMatch(word);
  });

  it("names itself capsuleviewer.dealing.wording/v0", () => {
    expect(pack.id).toBe("capsuleviewer.dealing.wording/v0");
    expect(pack.locale).toBe("en");
  });
});
