// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeStrictJson,
  jcs,
} from "@action-state-group/agent-action-capsule";
import { cardFacts } from "../src/studio-card.js";

/**
 * The Studio card reader against agent-action-capsule's
 * `vectors/standard-history-v0` (vendored byte for byte, see VENDORED.md):
 * a card the vectors fail on `card_form`, `counts_integral` or `denominator`
 * (SH sections 4 and 6) is refused, and every other card is read. The other
 * properties need the policy, the anchor or the deal entries, which the
 * reader never sees, so a case failing only those is read. A case that names
 * the derivation a request asked for and differs from the card's is about the
 * request, not the bytes, and is left out.
 */

interface Case {
  id: string;
  inputs: { card: unknown; derivation?: string };
  expected: { fails: string[] };
}

const load = (file: string): Case[] =>
  (
    JSON.parse(
      readFileSync(
        resolve("..", "vectors", "standard-history-v0", file),
        "utf8",
      ),
    ) as { cases: Case[] }
  ).cases;

const FORM = ["card_form", "counts_integral", "denominator"];

/** The card as it would travel: JCS when JCS can write it, else as written. */
function bytes(card: unknown): Uint8Array {
  const text = JSON.stringify(card);
  try {
    return jcs(decodeStrictJson(text));
  } catch {
    return new TextEncoder().encode(text);
  }
}

for (const file of ["vectors.json", "vectors-2.json"])
  describe(`standard-history-v0 ${file}`, () => {
    const cases = load(file);
    it("has cases", () => expect(cases.length).toBeGreaterThan(10));
    for (const c of cases) {
      const card = c.inputs.card as { derivation?: string };
      if (
        c.inputs.derivation !== undefined &&
        c.inputs.derivation !== card.derivation
      )
        continue;
      const refused = c.expected.fails.some((p) => FORM.includes(p));
      it(`${c.id}: ${refused ? "refused" : "read"}`, async () => {
        const r = await cardFacts(bytes(c.inputs.card));
        expect(r.ok, r.ok ? "" : r.reasons.join("; ")).toBe(!refused);
      });
    }
  });
