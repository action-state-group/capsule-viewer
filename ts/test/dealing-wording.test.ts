// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
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
    expect(dealingSay("trust.rewritten.met")).toBe("Sealed");
    expect(dealingSay("trust.same_story.met")).toBe("Confirmed by them");
    expect(dealingSay("word.time_stamped")).toBe("Time-stamped");
    expect(dealingSay("trust.stands_behind.met", { name: "N" })).toBe(
      "Countersigned by N",
    );
    expect(dealingSay("noun.deal")).toBe("Deal");
    expect(dealingSay("layer.caveats")).toBe("What this does not show");
    expect(dealingSay("layer.technical")).toBe("Technical details");
  });

  it("gives every trust question a met and a not-met answer", () => {
    for (const q of pack.trust) {
      expect(pack.entries).toHaveProperty(`trust.${q}.met`);
      expect(pack.entries).toHaveProperty(`trust.${q}.not_met`);
    }
  });

  it("rides the time stamp on the first answer, not a fifth slot", () => {
    expect(dealingSay("trust.rewritten.met.time_stamped", { at: "T" })).toBe(
      "Sealed · Time-stamped T",
    );
    const questions = new Set(
      Object.keys(pack.entries)
        .filter((k) => k.startsWith("trust."))
        .map((k) => k.split(".")[1]),
    );
    expect([...questions].sort()).toEqual([...pack.trust].sort());
  });

  it("keeps unruled keys out of the entries a surface can draw", () => {
    expect(Object.keys(pack.pending).sort()).toEqual([
      "trust.rewritten.not_checkpointed",
      "trust.stands_behind.not_independent",
    ]);
    for (const [key, note] of Object.entries(pack.pending)) {
      expect(pack.entries).not.toHaveProperty(key);
      expect(note).toMatch(/^TODO\(#448\): /);
      expect(() => dealingSay(key)).toThrow(/no entry/);
    }
  });

  it("refuses a missing key or an unfilled placeholder", () => {
    expect(() => dealingSay("trust.nope")).toThrow(/no entry/);
    expect(() => dealingSay("trust.stands_behind.met")).toThrow(/\{name\}/);
    expect(() => dealingSay("constructor")).toThrow(/no entry/);
  });

  it("carries words and layer ids only: no verdict, tier or grade words", () => {
    const text = Object.values(pack.entries).join("\n");
    for (const word of [/\bverdict\b/i, /\btier\b/i, /\bgrade\b/i])
      expect(text).not.toMatch(word);
  });

  it("is the JSON file the package publishes, byte for byte as data", () => {
    const raw = JSON.parse(
      readFileSync(new URL("../src/wording/dealing.en.json", import.meta.url), {
        encoding: "utf8",
      }),
    ) as unknown;
    expect(raw).toEqual(pack);
    expect(pack.id).toBe("capsuleviewer.dealing.wording/v0");
  });
});
