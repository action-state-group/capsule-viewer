// SPDX-License-Identifier: BSD-3-Clause

// evidencebook#116 PR 6: a claim's deal is the subject of the records it
// cites (the subject convention v0's readers), else its id's part before
// `::`. The cases mirror evidencebook's SubjectsOfRecord tests
// (subject_readers_test.go), which the report's receipt check uses.

import {
  buildVerifiedBundleContext,
  type ResultClaim,
} from "@action-state-group/agent-action-capsule";
import { describe, expect, it } from "vitest";
import { claimDeals, dealPrefixOf } from "../src/claim-subject.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

const FIELD = "field:/correlation/exchange_id";

/** An evidence-book record header. */
function header(
  book: string,
  seq: number,
  recordType: string,
  extra: Obj = {},
): Obj {
  return {
    v: 1,
    book_id: book,
    seq,
    record_type: recordType,
    epistemic_type: "producer_claim",
    committed_at: "2026-09-24T10:00:00Z",
    links: [],
    ...extra,
  };
}

const rootHeader = (
  book: string,
  seq: number,
  subjectId: string,
  membership = FIELD,
): Obj =>
  header(book, seq, "subject_root", {
    statement: {
      subject_kind: "deal",
      subject_id: subjectId,
      membership,
    },
  });

/** A field member's header: it cites the root and carries the id. */
const memberHeader = (
  book: string,
  seq: number,
  root: string,
  subjectId: string,
  recordType = "exchange",
): Obj =>
  header(book, seq, recordType, {
    correlation: { exchange_id: subjectId },
    links: [{ type: "cites", target: root }],
  });

/**
 * A bundle of records, each carrying its header as its disclosed
 * `agent_input` (by alias), or inline when named in `inline`.
 */
function source(
  headers: Record<string, Obj>,
  inline: Record<string, Obj> = {},
): Obj {
  const records: Obj[] = [];
  const disclosures: Record<string, Obj> = {};
  for (const [id, h] of Object.entries(headers)) {
    records.push({ capsule_id: id });
    disclosures[id] = { agent_input: h };
  }
  for (const [id, h] of Object.entries(inline))
    records.push({ capsule_id: id, evidence_record_header: h });
  return { root: records[0]!.capsule_id, records, disclosures };
}

async function dealsOf(
  bundle: Obj,
  claims: Record<string, readonly string[]>,
  edit?: (sealed: Obj, ids: Readonly<Record<string, string>>) => void,
): Promise<Record<string, string | undefined>> {
  const { bundle: sealed, ids } = await sealEvidenceBundle(bundle);
  edit?.(sealed, ids);
  const context = await buildVerifiedBundleContext(sealed);
  const list = Object.entries(claims).map(
    ([id, cited]) =>
      ({
        id,
        evidence: cited.map((alias) => ({
          digest: ids[alias] ?? alias,
          resolved: true,
        })),
      }) as unknown as ResultClaim,
  );
  const deals = claimDeals(context, list);
  return Object.fromEntries(list.map((c) => [c.id, deals.get(c.id)]));
}

describe("a claim's deal", () => {
  it("is the subject of a cited member, over its id's prefix", async () => {
    const bundle = source({
      "rt-a": rootHeader("b", 1, "deal-A"),
      "m-a": memberHeader("b", 2, "rt-a", "deal-A"),
      plain: header("b", 3, "exchange"),
    });
    expect(
      await dealsOf(bundle, {
        "conv-1::req": ["m-a"],
        "d9::req": ["plain"],
        "no-prefix": ["m-a"],
        "none-at-all": ["plain"],
      }),
    ).toEqual({
      "conv-1::req": "deal-A",
      "d9::req": "d9",
      "no-prefix": "deal-A",
      "none-at-all": undefined,
    });
  });

  it("is each claim's own subject when claims of two subjects share a supporting record", async () => {
    const bundle = source({
      "rt-a": rootHeader("a", 1, "deal-A"),
      "m-a": memberHeader("a", 2, "rt-a", "deal-A"),
      "rt-b": rootHeader("b", 1, "deal-B"),
      "m-b": memberHeader("b", 2, "rt-b", "deal-B"),
      shared: header("c", 1, "policy-doc"),
    });
    expect(
      await dealsOf(bundle, {
        "x::r1": ["m-a", "shared"],
        "x::r2": ["shared", "m-b"],
      }),
    ).toEqual({ "x::r1": "deal-A", "x::r2": "deal-B" });
  });

  it("is none for a claim citing members of two subjects", async () => {
    const bundle = source({
      "rt-a": rootHeader("a", 1, "deal-A"),
      "m-a": memberHeader("a", 2, "rt-a", "deal-A"),
      "rt-b": rootHeader("b", 1, "deal-B"),
      "m-b": memberHeader("b", 2, "rt-b", "deal-B"),
    });
    expect(await dealsOf(bundle, { "d1::r": ["m-a", "m-b"] })).toEqual({
      "d1::r": undefined,
    });
  });

  it("reads a log member that does not cite its root", async () => {
    const bundle = source({
      "rt-l": rootHeader("deal-book", 1, "deal-L", "log"),
      offer: header("deal-book", 2, "observation"),
      elsewhere: header("other-book", 2, "observation"),
      ix: header("deal-book", 3, "index_root"),
    });
    expect(
      await dealsOf(bundle, {
        "p::1": ["offer"],
        "p::2": ["elsewhere"],
        "p::3": ["ix"],
      }),
    ).toEqual({ "p::1": "deal-L", "p::2": "p", "p::3": "p" });
  });

  it("follows the library's membership: control records, other books, earlier records and a missing id are no members", async () => {
    const controls = [
      "subject_root",
      "subject_close",
      "index_root",
      "disclosure",
      "evidence_request_answered",
      "disclosure_policy",
      "lifecycle",
      "book_close",
      "window_open",
      "window_close",
    ];
    const headers: Record<string, Obj> = {
      "rt-a": rootHeader("b", 5, "deal-A"),
      foreign: memberHeader("other", 6, "rt-a", "deal-A"),
      earlier: memberHeader("b", 4, "rt-a", "deal-A"),
      "wrong-id": memberHeader("b", 6, "rt-a", "deal-Z"),
    };
    for (const [i, type] of controls.entries())
      headers[`c-${type}`] = memberHeader("b", 10 + i, "rt-a", "deal-A", type);
    const claims: Record<string, string[]> = {};
    for (const id of Object.keys(headers))
      if (id !== "rt-a") claims[`p::${id}`] = [id];
    const deals = await dealsOf(source(headers), claims);
    for (const id of Object.keys(claims)) expect(deals[id], id).toBe("p");
  });

  it("falls back to the prefix when the root is not carried or does not read as one", async () => {
    const missing = source({ "m-a": memberHeader("b", 2, "rt-a", "deal-A") });
    expect(await dealsOf(missing, { "p::r": ["m-a"] })).toEqual({
      "p::r": "p",
    });
    for (const statement of [
      { subject_kind: "deal", subject_id: "deal-A", membership: "field:x" },
      { subject_kind: "deal", subject_id: "deal-A", membership: FIELD, x: 1 },
      { subject_kind: "", subject_id: "deal-A", membership: FIELD },
      { subject_kind: "deal", subject_id: "deal-A", membership: "field:/a~2" },
    ]) {
      const malformed = source({
        "rt-a": header("b", 1, "subject_root", { statement }),
        "m-a": memberHeader("b", 2, "rt-a", "deal-A"),
      });
      expect(
        await dealsOf(malformed, { "p::r": ["m-a"] }),
        JSON.stringify(statement),
      ).toEqual({ "p::r": "p" });
    }
  });

  it("reads only verified headers, a record's own header before its disclosed input", async () => {
    // An inline header wins: the record's disclosed agent_input is its
    // payload, even when it reads like a member's header.
    const inlineFirst = source(
      { "rt-a": rootHeader("b", 1, "deal-A") },
      { "in-a": header("b", 2, "exchange") },
    );
    (inlineFirst.disclosures as Obj)["in-a"] = {
      agent_input: memberHeader("b", 2, "rt-a", "deal-A"),
    };
    expect(await dealsOf(inlineFirst, { "p::r": ["in-a"] })).toEqual({
      "p::r": "p",
    });

    const inline = source(
      { "rt-a": rootHeader("b", 1, "deal-A") },
      { "in-a": memberHeader("b", 2, "rt-a", "deal-A") },
    );
    expect(await dealsOf(inline, { "p::r": ["in-a"] })).toEqual({
      "p::r": "deal-A",
    });
    // A tampered inline header fails the record's identity.
    expect(
      await dealsOf(inline, { "p::r": ["in-a"] }, (sealed, ids) => {
        const record = (sealed.records as Obj[]).find(
          (r) => r.capsule_id === ids["in-a"],
        )!;
        (record.evidence_record_header as Obj).seq = 3;
      }),
    ).toEqual({ "p::r": "p" });

    // A disclosed header that does not match its commitment is not read.
    const disclosed = source({
      "rt-a": rootHeader("b", 1, "deal-A"),
      "m-a": memberHeader("b", 2, "rt-a", "deal-A"),
    });
    expect(await dealsOf(disclosed, { "p::r": ["m-a"] })).toEqual({
      "p::r": "deal-A",
    });
    expect(
      await dealsOf(disclosed, { "p::r": ["m-a"] }, (sealed, ids) => {
        const input = ((sealed.disclosures as Obj)[ids["m-a"]!] as Obj)
          .agent_input as Obj;
        input.seq = 3;
      }),
    ).toEqual({ "p::r": "p" });
    expect(
      await dealsOf(disclosed, { "p::r": ["m-a"] }, (sealed, ids) => {
        const input = ((sealed.disclosures as Obj)[ids["rt-a"]!] as Obj)
          .agent_input as Obj;
        input.seq = 0;
      }),
    ).toEqual({ "p::r": "p" });
  });
});

describe("dealPrefixOf", () => {
  it("is the id's part before the first ::", () => {
    expect(dealPrefixOf("d1::req::x")).toBe("d1");
    expect(dealPrefixOf("::req")).toBeUndefined();
    expect(dealPrefixOf("plain")).toBeUndefined();
  });
});
