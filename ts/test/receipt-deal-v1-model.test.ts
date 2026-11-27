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
      ["dispute", "You disputed delivery"],
      ["ruling", "Final ruling on delivery: not met, against the seller"],
      ["statement", "You recorded that the ruling on delivery reached you"],
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
        "Recorded inthe adjudicator's book",
        "TermDelivery",
        "Rulednot met",
        "Againstseller",
        "Finalyes",
        "Forumexternal:ard-demo",
      ]),
    );
    expect(fields(DISPUTE)).toEqual(
      expect.arrayContaining([
        "Recorded inyour book",
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
    expect(status?.textContent).toBe("Agreement: started");
    expect(root.querySelector("[data-deal-state]")?.textContent).toBe(
      "Agreement: started",
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

  // The other side's statement as the holder's copy received it: it names the
  // ruling and states a term, and its block says it had seen the dispute. A
  // pair whose header and record attest its payload (signatures are capsulectl's).
  const RECEIVED = "0e".repeat(32);
  const withReceived = (): Obj => {
    const b = full();
    const bk = book(b);
    const ruling = (bk["relied_on"] as Obj)[RULING] as Obj;
    const agreement = bk["agreement"] as Obj;
    const counterparty = ((agreement["payload"] as Obj)["body"] as Obj)[
      "counterparty_key"
    ];
    const payload = {
      body: {
        statements: [{ row: "delivered", value: "not_met" }],
        names: {
          ruling: {
            type: "deal-record",
            digest_alg: "SHA-256",
            digest: core.recordDigest(ruling["payload"]),
          },
        },
      },
      "x-deal-v1": {
        record_type: "statement",
        seq: 2,
        at: "2026-11-27T14:50:45Z",
        seen: DISPUTE,
      },
    };
    const header = {
      book_id: "deal/other",
      seq: 2,
      links: [],
      payload_commitments: [core.recordDigest(payload)],
    };
    const record = {
      capsule_id: RECEIVED,
      key_id: counterparty,
      timestamp: "2026-11-27T14:50:45.123Z",
      model_attestation: {
        compute_attestation: { agent_input_digest: core.recordDigest(header) },
      },
    };
    (bk["received"] as Obj)["records"] = {
      [RECEIVED]: { record, header, payload },
    };
    return b;
  };

  it("a received record is a step and an L2 raw record once, in causal order, with no time", async () => {
    const mod = module();
    const m = (await mod.buildModel(context(withReceived()))) as Model;
    expect(m.sealed_steps.map((s) => s.record)).toEqual([
      AGREEMENT,
      STATEMENT,
      DISPUTE,
      RULING,
      RECEIVED,
    ]);
    const step = m.sealed_steps[4]!;
    expect(step.src).toEqual({
      bundle: "/extensions/x-deal-v1/book/received/records/" + RECEIVED,
    });
    expect(step.book?.value).toBe("other");
    expect(step.time).toBeNull();
    const L0 = document.createElement("div");
    const L2 = document.createElement("div");
    mod.render(m, { L0, L1: document.createElement("div"), L2, depth: "L2" });
    // A statement that names a ruling and states a term says both.
    expect(
      L0.querySelector(`[data-step-record="${RECEIVED}"] .cv-rcpt-step__title`)
        ?.textContent,
    ).toBe(
      "The other side recorded that the ruling on delivery reached them · The other side said: Delivery: not met",
    );
    const raw = L2.querySelectorAll(`[data-book-record="${RECEIVED}"]`);
    expect(raw).toHaveLength(1);
    expect(raw[0]!.textContent).toContain(RECEIVED);
    expect(raw[0]!.textContent).not.toContain("timestamp");
    expect(raw[0]!.textContent).not.toContain("14:50");
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
  // The offer's sent pair {record, agent_input}, as the buyer's `deal offer
  // --out` wrote it (evidencebook xdealv1.Pair): the form capsulectl carries
  // as book.offer (evidencebook#1065). The page checks the record's
  // agent_input_digest and the agreement's offer digest; capsulectl checks
  // the signature and the signer.
  const sentPair = (): Obj => read("offer", "offer.pair.json");
  const OFFER_ID = (sentPair()["record"] as Obj)["capsule_id"];
  const terms = (pair: Obj): Obj =>
    ((pair["agent_input"] as Obj)["body"] as Obj)["terms"] as Obj;
  // The pair's record attesting its agent_input as it now is (not re-signed).
  const reAttested = (pair: Obj): Obj => {
    (
      ((pair["record"] as Obj)["model_attestation"] as Obj)[
        "compute_attestation"
      ] as Obj
    )["agent_input_digest"] = core.recordDigest(pair["agent_input"]);
    return pair;
  };
  const withOffer = (pair: unknown, audience = "keep"): Obj => {
    const b = read("offer", "keep-copy.bundle.json");
    book(b)["offer"] = pair;
    content(b)["audience"] = audience;
    b["records"] = [];
    return b;
  };
  // The copy's agreement re-sealed to cite *offer*: its hash chain redone
  // (payload -> header commitment -> the record's agent_input_digest), not
  // re-signed, which the model does not check (capsulectl and the page's
  // runtime do, receipt-deal-v1-item.test.ts).
  const citing = (b: Obj, offer: unknown): Obj => {
    const pair = book(b)["agreement"] as Obj;
    const payload = pair["payload"] as Obj;
    ((payload["body"] as Obj)["offer"] as Obj)["digest"] =
      core.recordDigest(offer);
    const header = pair["header"] as Obj;
    header["payload_commitments"] = [core.recordDigest(payload)];
    (
      ((pair["record"] as Obj)["model_attestation"] as Obj)[
        "compute_attestation"
      ] as Obj
    )["agent_input_digest"] = core.recordDigest(header);
    return b;
  };

  it("the fixture's offer.json is its sent pair's agent_input", () => {
    expect(core.recordDigest(offer())).toBe(
      core.recordDigest(sentPair()["agent_input"]),
    );
  });

  it("the sent pair the agreement cites gives the item, quantity and price, each with its source", async () => {
    const m = await model(withOffer(sentPair()));
    const at = (path: string) => ({
      record: OFFER_ID,
      path: "/agent_input/body/terms" + path,
    });
    expect(m.item).toEqual({ value: ITEM, src: at("/item") });
    expect(m.quantity).toEqual({ value: 200, src: at("/quantity") });
    expect(m.price).toEqual({
      value: { minor: 6000, currency: "USD" },
      src: at(""),
    });
  });

  it("an agent_input that is not the one its record attests is refused", async () => {
    const pair = sentPair();
    terms(pair)["item"] = "something else";
    await expect(model(withOffer(pair))).rejects.toThrow(
      /not the sent offer the copy's agreement cites/,
    );
  });

  it("a sent pair the agreement does not cite is refused", async () => {
    const pair = sentPair();
    terms(pair)["item"] = "something else";
    await expect(model(withOffer(reAttested(pair)))).rejects.toThrow(
      /not the sent offer the copy's agreement cites/,
    );
  });

  it("a sent record the agreement cites that is not a propose is refused", async () => {
    const pair = sentPair();
    ((pair["agent_input"] as Obj)["x-deal-v1"] as Obj)["record_type"] =
      "decline";
    reAttested(pair);
    const control = sentPair();
    terms(control)["item"] = "something else";
    reAttested(control);
    expect(
      (await model(citing(withOffer(control), control["agent_input"]))).item
        ?.value,
    ).toBe("something else");
    await expect(
      model(citing(withOffer(pair), pair["agent_input"])),
    ).rejects.toThrow(/not the sent offer the copy's agreement cites/);
  });

  it("the offer as a book pair {record, header, payload}, which no producer writes, is refused", async () => {
    const pair = sentPair();
    const payload = pair["agent_input"];
    const header = { payload_commitments: [core.recordDigest(payload)] };
    (
      ((pair["record"] as Obj)["model_attestation"] as Obj)[
        "compute_attestation"
      ] as Obj
    )["agent_input_digest"] = core.recordDigest(header);
    const bookPair = { record: pair["record"], header, payload };
    await expect(model(withOffer(bookPair))).rejects.toThrow(
      /not the sent offer the copy's agreement cites/,
    );
  });

  it("a sent pair with a member besides record and agent_input is refused", async () => {
    const pair = sentPair();
    pair["header"] = {};
    await expect(model(withOffer(pair))).rejects.toThrow(
      /not the sent offer the copy's agreement cites/,
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
    const carried = await draw(withOffer(sentPair(), "counterparty"));
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
