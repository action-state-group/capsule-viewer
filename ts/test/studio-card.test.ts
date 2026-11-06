// SPDX-License-Identifier: BSD-3-Clause
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  cardFacts,
  cardRefusalHtml,
  cardViewHtml,
  stapledCardHtml,
} from "../src/studio-card.js";

const zero = {
  of: 0,
  open: 0,
  for: 0,
  against: 0,
  split: 0,
  no_finding: 0,
  withdrawn: 0,
};
const forum = { of: 0, auto: 0, network: 0, rail: 0, external: 0 };
const dispute = { of: 0, by_outcome: zero, by_forum: forum };

const card = (): Record<string, any> => ({
  anchor: "a".repeat(64),
  bands: [
    {
      currency: "USD",
      decade: 1,
      did_not_hold: 0,
      held: 2,
      of: 3,
      undecided: 1,
    },
  ],
  class_missing: { count: 1, of: 3 },
  controller_class: "person_declared",
  derivation: "standard_history/1",
  disputes: { raised: dispute, received: dispute },
  happened: { no_record: 0, of: 3, receipt_only: 1, stamped_by_both: 2 },
  holder_kind: "person",
  in_window: { counted: 3, not_counted: 1, of: 4 },
  outcomes: { did_not_hold: 0, held: 2, of: 3, undecided: 1 },
  policy: "b".repeat(64),
  roles: { bought: 1, of: 3, provided: 2 },
  since: "2026-03",
  window: { months: 3 },
});
const bytes = (c: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(c));

/** The `data-fact` values and the digest, as text, from either form. */
const read = (html: string): { facts: string[]; digest: string } => ({
  facts: [
    ...html.matchAll(/data-fact="([a-z_]+)">(?:<dt>[^<]*<\/dt><dd>)?([^<]*)/g),
  ].map((m) => m[1] + "=" + m[2]!.replace(/^[A-Za-z ]+ (?=\d)/, "")),
  digest: /data-card-digest>([0-9a-f]{64})</.exec(html)![1]!,
});

describe("the History card in two forms", () => {
  it("shows the same counts and the same digest in the card view and the stapled form", async () => {
    const raw = bytes(card());
    const r = await cardFacts(raw);
    if (!r.ok) throw new Error(r.reasons.join(";"));
    const view = read(cardViewHtml(r.card));
    const staple = read(stapledCardHtml(r.card));
    expect(staple.facts).toEqual(view.facts);
    expect(staple.digest).toBe(view.digest);
    expect(view.digest).toBe(createHash("sha256").update(raw).digest("hex"));
    expect(view.facts).toContain("held=2");
    expect(view.facts).toContain("stamped_by_both=2");
  });

  it("reads a /2 card with its unpriced tally", async () => {
    const c = card();
    c["derivation"] = "standard_history/2";
    c["unpriced"] = { did_not_hold: 0, held: 0, of: 0, undecided: 0 };
    expect((await cardFacts(bytes(c))).ok).toBe(true);
    delete c["unpriced"];
    expect((await cardFacts(bytes(c))).ok).toBe(false);
  });

  const bad: [string, (c: Record<string, any>) => void][] = [
    ["an extra member", (c) => (c["score"] = 9)],
    ["a missing member", (c) => delete c["since"]],
    ["outcomes that do not sum", (c) => (c["outcomes"].held = 3)],
    [
      "a counted total that differs between tallies",
      (c) => (c["roles"] = { bought: 0, of: 2, provided: 2 }),
    ],
    ["a negative count", (c) => (c["happened"].no_record = -1)],
    ["a ratio", (c) => (c["roles"].provided = 0.5)],
    ["an unknown derivation", (c) => (c["derivation"] = "standard_history/3")],
    [
      "disputes that do not sum",
      (c) => (c["disputes"].raised.by_outcome.for = 1),
    ],
  ];
  for (const [name, mutate] of bad)
    it(`refuses ${name}`, async () => {
      const c = card();
      mutate(c);
      const r = await cardFacts(bytes(c));
      expect(r.ok).toBe(false);
      if (!r.ok)
        expect(cardRefusalHtml(r.reasons)).toContain('data-card="refused"');
    });

  it("refuses bytes that are not a card", async () => {
    expect((await cardFacts(new TextEncoder().encode("nope"))).ok).toBe(false);
  });
});
