// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
/**
 * The x-deal-v1 receipt kind's buildModel, fixed in place (capsule-viewer#476;
 * docs/design/receipt-view-model.md section 7, PR 1): values carry their
 * source, the steps are every record the copy carries once each in causal
 * order (a ruling held only in the book's relied_on included), a statement's
 * named ruling and a dispute's and a ruling's bodies are drawn, the report's
 * start is the agreement's state, each amount is said once in its recorded
 * asset, the book may carry the holder's own offer and a full adjudicator
 * copy's records and received, and a shared copy's model holds no time.
 *
 * Fixtures (tests/testdata/deal-v1, see its README): ruled-dispute.* is the
 * holder's keep copy of the ARD run's ruled deal and capsulectl's report on
 * it; counterparty-copy.* a counterparty's copy; offer/ the #461 offer copy.
 */
import { bundleDigest } from "@action-state-group/agent-action-capsule";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPresentationRegistry,
  renderEvidenceGraph,
} from "../src/evidence-graph-view.js";
import { receiptModules } from "../src/receipt.js";
import { RECEIPT_CORE } from "../src/receipt-core.generated.js";

type Obj = Record<string, unknown>;
type Src = {
  record?: string;
  path?: string;
  report?: string;
  checked?: string;
  bundle?: string;
};
type Sourced<T> = { value: T; src: Src } | null;
type Step = {
  record: string;
  src: Src;
  book: Sourced<string>;
  kind: Sourced<string>;
  time: Sourced<string>;
  seq: Sourced<number>;
  leg: Sourced<{ observed_at: string | null }>;
  names: Sourced<{ kind: string; record: string | null }>;
  ruling: Sourced<{ row: string; against: string; value: string }>;
  dispute: Sourced<{ kind: string; row: string; forum: string }>;
};
type Model = {
  agreement: Sourced<{ state: string }>;
  sealed_steps: Step[];
  records: Sourced<Obj>[];
  item: Sourced<string>;
  quantity: Sourced<number>;
  book_witnessed: unknown;
  rows: { relied_on: { time: string | null }[] }[];
};

const read = (...path: string[]): Obj =>
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "..", "tests", "testdata", "deal-v1", ...path),
      "utf8",
    ),
  ) as Obj;
const core = RECEIPT_CORE as {
  recordDigest(value: unknown): string | null;
  createModule(
    kind: string,
    env: object,
  ): {
    buildModel(context: unknown): unknown;
    render(model: unknown, host: object): void;
  };
};

const RULING =
  "e6abc639939660cdda9781118a8d4d9ef41f4130da2ea4bded0df45b4c066a99";
const DISPUTE =
  "8b0dc2e82b5142f3eacccfe4731ba91cd01af49d3197a9cc338049753a35bae0";
const STATEMENT =
  "b81915f3fc469cd122cd55908fdaceca98f9f2fac5185bd769949dc03d5db0fc";
const AGREEMENT =
  "88cb1b8d0d97fbe031980ee454ab8644cd58c2653f3ea39767297495a7e54f88";

// The deal module given capsulectl's passing check of the copy's report, as
// a page gives it, over *bundle* (its report and book as they are, or edited).
function module(assurance: Obj = {}) {
  return core.createModule("deal", {
    localTime: true,
    verification: () => ({ verifier: "test", outcome: "verified", checks: [] }),
    assurance: () => ({
      bundle_digest: "ab".repeat(32),
      witnesses: "withheld",
      countersignatures: [],
      report_checked: "pass",
      ...assurance,
    }),
  });
}
const context = (bundle: Obj): Obj => ({
  bundle,
  records: (bundle["records"] as Obj[]).map((r) => r["capsule_id"]),
  resolvedDisclosures: new Map(),
  root: null,
  completeness: { memberships: {} },
});
async function model(bundle: Obj, assurance: Obj = {}): Promise<Model> {
  return (await module(assurance).buildModel(context(bundle))) as Model;
}
const ext = (bundle: Obj): Obj =>
  (bundle["extensions"] as Obj)["x-deal-v1"] as Obj;
const book = (bundle: Obj): Obj => ext(bundle)["book"] as Obj;
const content = (bundle: Obj): Obj =>
  ((bundle["extensions"] as Obj)["x-deal-report/v0"] as Obj)[
    "agent_input"
  ] as Obj;

async function page(
  bundle: Obj,
  verifierReport: Obj,
  options: Obj = {},
): Promise<HTMLElement> {
  const registry = createPresentationRegistry();
  for (const m of receiptModules()) registry.register(m);
  const root = document.createElement("main");
  document.body.append(root);
  await renderEvidenceGraph(bundle, root, undefined, {
    depth: "L2",
    registry,
    verifierReport,
    ...options,
  });
  return root;
}
const ruledBundle = (): Obj => read("ruled-dispute.bundle.json");
const ruledReport = (): Obj => read("ruled-dispute.verify.json");

describe("the ARD run's ruled deal, the holder's keep copy on a page", () => {
  it("draws every record once, the ruling held only in relied_on a step, in causal order", async () => {
    const root = await page(ruledBundle(), ruledReport());
    const steps = Array.from(root.querySelectorAll("[data-step]")).map((li) => [
      li.getAttribute("data-step-kind"),
      li.querySelector(".cv-rcpt-step__title")?.textContent,
    ]);
    expect(steps).toEqual([
      ["agree", "Deal agreed"],
      ["settle", "Payment recorded as settled: 1,000 msat"],
      ["statement", "You said: Delivery: not met; Payment as agreed: met"],
      ["dispute", "Dispute on Delivery, taken to external:ard-demo"],
      ["ruling", "Final ruling on Delivery: not met, against the seller"],
      ["statement", "You noted the ruling on Delivery"],
    ]);
    // The ruling is not one of the bundle's records: its raw record is the module's, at L2.
    expect(
      (ruledBundle()["records"] as Obj[]).some(
        (r) => r["capsule_id"] === RULING,
      ),
    ).toBe(false);
    expect(
      root.querySelector(`[data-book-record="${RULING}"] pre`)?.textContent,
    ).toContain('"capsule_id": "' + RULING + '"');
  });

  it("opens the ruling's and the dispute's sealed fields", async () => {
    const root = await page(ruledBundle(), ruledReport());
    const fields = (record: string): string[] =>
      Array.from(
        root.querySelectorAll(`[data-step-record="${record}"] .cv-rcpt-field`),
      ).map((f) => f.textContent ?? "");
    expect(fields(RULING)).toEqual(
      expect.arrayContaining([
        "Bookthe adjudicator's",
        "TermDelivery",
        "Rulednot met",
        "Againstseller",
        "Finalyes",
        "Forumexternal:ard-demo",
      ]),
    );
    expect(fields(DISPUTE)).toEqual(
      expect.arrayContaining([
        "Bookthe holder's",
        "TermDelivery",
        "Forumexternal:ard-demo",
      ]),
    );
  });

  it("says the agreement's state as that, never 'Started' as the deal's status beside the ruling", async () => {
    const root = await page(ruledBundle(), ruledReport());
    expect(root.querySelector("[data-top-line]")?.textContent).toBe(
      "Ruled: Delivery not met",
    );
    const status = root.querySelector(
      '[data-card="status"] [data-card-status]',
    );
    expect(status?.textContent).toBe("Agreement: Started");
    expect(root.querySelector("[data-deal-state]")?.textContent).toBe(
      "Agreement: Started",
    );
  });

  it("says each amount once, in its recorded asset", async () => {
    const root = await page(ruledBundle(), ruledReport());
    expect(
      root.querySelector('[data-card="paid"] .cv-rcpt-card__value')
        ?.textContent,
    ).toBe("1,000 msat");
    expect(root.textContent).not.toMatch(/\b1 sat\b/);
  });

  it("a forged book pair under a bundle record's Capsule id is refused", async () => {
    const forged = ruledBundle();
    const pair = (book(forged)["relied_on"] as Obj)[STATEMENT] as Obj;
    (pair["record"] as Obj)["operator"] = "someone else";
    const report = ruledReport();
    report["bundle_digest"] = await bundleDigest(forged as never);
    const root = await page(forged, report);
    expect(root.querySelector("[data-receipt-surface]")).toBeNull();
    await expect(model(forged)).rejects.toThrow(
      /not the bundle's record of the same Capsule id/,
    );
  });
});

describe("the deal model: sources", () => {
  it("each value names where it came from", async () => {
    const m = await model(ruledBundle());
    expect(m.agreement).toEqual({
      value: { state: "started", local: false, by: "acceptor_named" },
      src: {
        record:
          "f934b9cc0a8bee6e46db9f68ecaaa3fe17c47a2fd591fe23a99c54c04e756716",
        path: "/agent_input/start",
      },
    });
    const ruling = m.sealed_steps.find((s) => s.record === RULING)!;
    expect(ruling.src).toEqual({
      bundle: "/extensions/x-deal-v1/book/relied_on/" + RULING,
    });
    expect(ruling.kind).toEqual({
      value: "ruling",
      src: { record: RULING, path: "/payload/x-deal-v1/record_type" },
    });
    expect(ruling.book?.value).toBe("adjudicator");
    expect(ruling.ruling?.value).toMatchObject({
      row: "delivered",
      against: "seller",
      value: "not_met",
    });
    const named = m.sealed_steps[m.sealed_steps.length - 1]!;
    expect(named.names?.value).toEqual({
      kind: "ruling",
      digest: expect.any(String),
      record: RULING,
    });
    // records[] is the steps' own collection, each record once.
    expect(m.records.map((r) => r!.value["capsule_id"])).toEqual(
      m.sealed_steps.map((s) => s.record),
    );
    expect(new Set(m.records.map((r) => r!.value["capsule_id"])).size).toBe(
      m.records.length,
    );
  });

  it("the keep copy keeps each step's sealed time", async () => {
    const m = await model(ruledBundle());
    expect(m.sealed_steps.find((s) => s.record === RULING)!.time).toEqual({
      value: "2026-11-27T14:50:36Z",
      src: { record: RULING, path: "/payload/x-deal-v1/at" },
    });
  });
});

describe("the deal model: a shared copy holds no time (u219, u238, u239)", () => {
  it("the counterparty's copy: no step time, leg time, record time or witness time, steps in causal order", async () => {
    const m = await model(read("counterparty-copy.bundle.json"), {
      book_witnessed: {
        status: "verified",
        witness: "W",
        at: "2026-11-25T14:41:19Z",
      },
    });
    expect(m.book_witnessed).toBeNull();
    for (const s of m.sealed_steps) {
      expect(s.time).toBeNull();
      if (s.leg !== null) expect(s.leg.value.observed_at).toBeNull();
    }
    for (const row of m.rows)
      for (const e of row.relied_on) expect(e.time).toBeNull();
    // The raw records leave out the record's and the leg's time too.
    for (const r of m.records) {
      expect(r!.value).not.toHaveProperty("timestamp");
      expect(
        (r!.value["settlement"] as Obj | undefined) ?? {},
      ).not.toHaveProperty("observed_at");
    }
    // The agreement first; the rest after what each cites (the other side's
    // statement after the holder's statement it says it had seen).
    expect(m.sealed_steps[0]!.kind?.value).toBe("agree");
    const last = m.sealed_steps[m.sealed_steps.length - 1]!;
    expect([last.book?.value, last.kind?.value]).toEqual([
      "other",
      "statement",
    ]);
    const seqs = m.sealed_steps
      .filter((s) => s.book?.value === "holder")
      .map((s) => s.seq?.value);
    expect(seqs).toEqual([...seqs].sort((a, b) => a! - b!));
  });
});

describe("the deal model: a full adjudicator copy (evidencebook#861)", () => {
  // The ruled deal cut as a full adjudicator copy: the holder's whole book in
  // book.records, the other side's held copy in book.received (empty here),
  // the ruling in relied_on, and no bundle records of its own.
  const full = (): Obj => {
    const b = ruledBundle();
    const bk = book(b);
    const relied = bk["relied_on"] as Obj;
    bk["records"] = {
      [AGREEMENT]: bk["agreement"],
      [STATEMENT]: relied[STATEMENT],
      [DISPUTE]: relied[DISPUTE],
    };
    bk["relied_on"] = { [RULING]: relied[RULING] };
    bk["received"] = { log_id: "deal/other", records: {}, proofs: [] };
    const c = content(b);
    c["audience"] = "adjudicator";
    c["rows_state"] = "withheld";
    c["rows"] = [];
    b["records"] = [];
    return b;
  };

  it("every record is a step and a raw record, once each, the ruling after the dispute it read", async () => {
    const m = await model(full());
    expect(m.sealed_steps.map((s) => [s.record, s.kind?.value])).toEqual([
      [AGREEMENT, "agree"],
      [STATEMENT, "statement"],
      [DISPUTE, "dispute"],
      [RULING, "ruling"],
    ]);
    expect(m.records.map((r) => r!.src.bundle)).toEqual([
      "/extensions/x-deal-v1/book/agreement/record",
      "/extensions/x-deal-v1/book/records/" + STATEMENT + "/record",
      "/extensions/x-deal-v1/book/records/" + DISPUTE + "/record",
      "/extensions/x-deal-v1/book/relied_on/" + RULING + "/record",
    ]);
    for (const s of m.sealed_steps) expect(s.time).toBeNull();
  });

  it("received without records, or a pair under another record's id, is refused", async () => {
    const lone = full();
    delete book(lone)["records"];
    await expect(model(lone)).rejects.toThrow(/received without records/);
    const swapped = full();
    const records = book(swapped)["records"] as Obj;
    records[STATEMENT] = records[DISPUTE];
    await expect(model(swapped)).rejects.toThrow(/not its key/);
  });
});

describe("the deal model: the holder's own offer carried in the copy (book.offer)", () => {
  const ITEM = "200 conference badges, delivered by Friday";
  const offer = (): Obj => read("offer", "offer.json");
  // The offer as a book pair: its payload, a header committing to it, and a
  // record attesting that header (the page checks the chain and the
  // agreement's offer digest; capsulectl checks the signature).
  const pairOf = (payload: Obj): Obj => {
    const header = { payload_commitments: [core.recordDigest(payload)] };
    return {
      record: {
        capsule_id: "0f".repeat(32),
        model_attestation: {
          compute_attestation: {
            agent_input_digest: core.recordDigest(header),
          },
        },
      },
      header,
      payload,
    };
  };
  const withOffer = (payload: Obj, audience = "keep"): Obj => {
    const b = read("offer", "keep-copy.bundle.json");
    book(b)["offer"] = pairOf(payload);
    content(b)["audience"] = audience;
    b["records"] = [];
    return b;
  };

  it("the offer the agreement cites gives the item and quantity, each with its source", async () => {
    const m = await model(withOffer(offer()));
    expect(m.item).toEqual({
      value: ITEM,
      src: { record: "0f".repeat(32), path: "/payload/body/terms/item" },
    });
    const quantity = ((offer()["body"] as Obj)["terms"] as Obj)["quantity"];
    expect(m.quantity?.value ?? null).toBe(quantity ?? null);
  });

  it("an offer the agreement does not cite is refused", async () => {
    const other = offer();
    ((other["body"] as Obj)["terms"] as Obj)["item"] = "something else";
    await expect(model(withOffer(other))).rejects.toThrow(
      /not the offer the copy's agreement cites/,
    );
  });

  it("a carried offer's item is drawn on the counterparty's copy; capsulectl's side input is not", async () => {
    const draw = async (b: Obj, assurance: Obj = {}): Promise<HTMLElement> => {
      const mod = module(assurance);
      const m = await mod.buildModel(context(b));
      const L0 = document.createElement("div");
      mod.render(m, {
        L0,
        L1: document.createElement("div"),
        L2: document.createElement("div"),
        depth: "L0",
      });
      return L0;
    };
    const carried = await draw(withOffer(offer(), "counterparty"));
    expect(carried.querySelector("[data-hero-item]")?.textContent).toContain(
      ITEM,
    );
    const given = read("offer", "keep-copy.bundle.json");
    content(given)["audience"] = "counterparty";
    given["records"] = [];
    const side = await draw(given, { deal_offer: offer() });
    expect(side.querySelector("[data-hero-item]")).toBeNull();
  });
});
