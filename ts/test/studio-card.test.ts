// SPDX-License-Identifier: BSD-3-Clause
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import {
  decodeStrictJson,
  jcs,
} from "@action-state-group/agent-action-capsule";
import { describe, expect, it } from "vitest";
import PACK from "../src/wording/studio-card.en.json" with { type: "json" };
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

const card = (): Record<string, any> =>
  structuredClone({
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
  jcs(decodeStrictJson(JSON.stringify(c)));
/** Bytes that say a thing JCS cannot (a float, spaces): only for refusals. */
const loose = (c: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(c));

/** Each `data-fact` id with its value text ("" when it has none), and the digest. */
const read = (html: string): { facts: Map<string, string>; digest: string } => {
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  return {
    facts: new Map(
      [...doc.querySelectorAll("[data-fact]")].map((e) => [
        e.getAttribute("data-fact")!,
        (e.querySelector("dd, b")?.textContent ?? "").trim(),
      ]),
    ),
    digest: doc.querySelector("[data-card-digest]")!.textContent!,
  };
};

describe("the History card in two forms", () => {
  it("shows the same counts and the same digest in the card view and the stapled form", async () => {
    const raw = bytes(card());
    const r = await cardFacts(raw);
    if (!r.ok) throw new Error(r.reasons.join(";"));
    const view = read(cardViewHtml(r.card));
    const staple = read(stapledCardHtml(r.card));
    expect(staple.facts.size).toBeGreaterThan(8);
    expect(view.facts.size).toBeGreaterThan(staple.facts.size);
    // every stapled fact is in the card view with the same value
    for (const [id, value] of staple.facts)
      expect(view.facts.get(id)).toBe(value);
    expect(staple.digest).toBe(view.digest);
    expect(view.digest).toBe(createHash("sha256").update(raw).digest("hex"));
    expect(view.facts.get("held")).toBe("2 of 3");
    expect(cardViewHtml(r.card)).toContain("went as agreed");
    expect(cardViewHtml(r.card)).toContain("holder&#39;s own statement");
    expect(stapledCardHtml(r.card)).toContain("went as agreed");
    expect(stapledCardHtml(r.card)).toContain("not recounted here");
    expect(view.facts.get("stamped_by_both")).toBe("2 of 3");
    // the full card also carries what the stapled line leaves out
    expect(cardViewHtml(r.card)).toContain("1 of 4 deals in the window");
    expect(cardViewHtml(r.card)).toContain("1 of 3 counted deals");
    expect(cardViewHtml(r.card)).toContain("last 3 months");
    expect(view.facts.get("band_0")).toBe(
      "2 went as agreed, 0 didn't, 1 we couldn't tell, of 3",
    );
    // every count of the card is in the stapled line too; only who the holder
    // is, since when and the window are left to the full card
    for (const id of [
      "not_counted",
      "class_missing",
      "held",
      "band_0",
      "disputes_raised_outcomes",
    ])
      expect(staple.facts.has(id)).toBe(true);
    for (const id of ["holder", "since", "window"])
      expect(staple.facts.has(id)).toBe(false);
  });

  it("reads a /2 card with its unpriced tally", async () => {
    const c = card();
    c["derivation"] = "standard_history/2";
    c["unpriced"] = { did_not_hold: 0, held: 0, of: 0, undecided: 0 };
    const r2 = await cardFacts(bytes(c));
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      const u = read(stapledCardHtml(r2.card)).facts.get("unpriced");
      expect(u).toContain("0 of 3");
    }
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
      const r = await cardFacts(name === "a ratio" ? loose(c) : bytes(c));
      expect(r.ok).toBe(false);
      if (!r.ok)
        expect(cardRefusalHtml(r.reasons)).toContain('data-card="refused"');
    });

  it("sorts bands numerically: sub-unit decades -6 then -1 are valid, -1 then -6 is not", async () => {
    const band = (decade: number | null, held: number) => ({
      currency: "USD",
      decade,
      did_not_hold: 0,
      held,
      of: held,
      undecided: 0,
    });
    const make = (order: (number | null)[]) => {
      const c = card();
      c["bands"] = order.map((d) => band(d, 1));
      c["outcomes"] = {
        did_not_hold: 0,
        held: order.length,
        of: order.length,
        undecided: 0,
      };
      c["in_window"] = {
        counted: order.length,
        not_counted: 0,
        of: order.length,
      };
      c["class_missing"] = { count: 0, of: order.length };
      c["roles"] = { bought: 0, of: order.length, provided: order.length };
      c["happened"] = {
        no_record: 0,
        of: order.length,
        receipt_only: 0,
        stamped_by_both: order.length,
      };
      return c;
    };
    expect((await cardFacts(bytes(make([null, -6, -1, 0, 3])))).ok).toBe(true);
    expect((await cardFacts(bytes(make([-1, -6])))).ok).toBe(false);
    expect((await cardFacts(bytes(make([0, null])))).ok).toBe(false);
    expect((await cardFacts(bytes(make([-6, -6])))).ok).toBe(false);
  });

  it("shows which dispute outcomes and forums the card holds, not only the totals", async () => {
    const c = card();
    c["disputes"].raised = {
      of: 2,
      by_outcome: { ...zero, of: 2, against: 2 },
      by_forum: { ...forum, of: 2, rail: 2 },
    };
    const r = await cardFacts(bytes(c));
    if (!r.ok) throw new Error(r.reasons.join(";"));
    const html = cardViewHtml(r.card);
    expect(html).toContain("against the holder 2");
    expect(html).toContain("the payment rail 2");
    const other = card();
    other["disputes"].raised = {
      of: 2,
      by_outcome: { ...zero, of: 2, open: 2 },
      by_forum: { ...forum, of: 2, rail: 2 },
    };
    const r2 = await cardFacts(bytes(other));
    if (!r2.ok) throw new Error("card");
    expect(cardViewHtml(r2.card)).not.toBe(html);
  });

  it("refuses a card whose bytes are not JCS", async () => {
    const pretty = new TextEncoder().encode(JSON.stringify(card(), null, 2));
    const r = await cardFacts(pretty);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(";")).toContain("JCS");
  });

  it("keeps the shared words byte-for-byte with the shipped card's wording pack, and says no score", () => {
    const shipped = JSON.parse(
      readFileSync(
        resolve(
          "..",
          "src",
          "capsule_viewer",
          "standard_history",
          "wording-consumer-en.json",
        ),
        "utf8",
      ),
    ) as { entries?: Record<string, string> } & Record<string, string>;
    const entries = shipped.entries ?? shipped;
    for (const key of PACK.from)
      expect((PACK.entries as Record<string, string>)[key]).toBe(entries[key]);
    for (const text of Object.values(PACK.entries))
      expect(text).not.toMatch(/\b(score|rating|rank|reputation|trust)\b/iu);
  });

  it("refuses bytes that are not a card", async () => {
    expect((await cardFacts(new TextEncoder().encode("nope"))).ok).toBe(false);
  });

  it("escapes text and refuses facts that did not come from cardFacts", async () => {
    const r = await cardFacts(bytes(card()));
    if (!r.ok) throw new Error("card");
    const evil = {
      ...r.card,
      facts: [
        {
          id: "x",
          label: "<img src=x onerror=alert(1)>",
          value: "<b>",
          compact: true,
        },
      ],
    };
    expect(cardViewHtml(evil)).not.toContain("<img");
    expect(stapledCardHtml(evil)).not.toContain("<img");
    expect(() =>
      cardViewHtml({
        ...r.card,
        facts: [{ id: '" onclick="x', label: "a", value: "b", compact: true }],
      }),
    ).toThrow();
    expect(() => stapledCardHtml({ ...r.card, digest: "<script>" })).toThrow();
  });
});
