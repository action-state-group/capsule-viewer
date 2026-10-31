// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

// Outcomes frame 5 of Steven's Terms Pack canvas, "Same customer in this
// report" (capsule-viewer#122). The producer's fixtures
// (evidencebook-skills tests/fixtures/subject-history, commit ab15019) are
// copied in unchanged; the bundle they ride on is the outcome fixture cut to
// four conversations, their keys renamed to the bundle's conversation ids.
//
// UPDATE_GOLDENS=1 npx vitest run test/subject-history.test.ts

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import { contractReportWords } from "../src/contract-report-wording.js";
import {
  readSubjectHistory,
  renderSubjectHistory,
  usdRange,
  type SubjectConversation,
} from "../src/subject-history.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;
const DATA = resolve(process.cwd(), "test", "testdata");
const GOLDENS = resolve(process.cwd(), "test", "goldens", "contract-report");
const load = (...parts: string[]): Obj =>
  JSON.parse(readFileSync(resolve(DATA, ...parts), "utf8")) as Obj;

const operator = load("subject-history", "result-v0-operator.json");
const shared = load("subject-history", "result-v0-shared.json");
const MEMBER = "x-airline-support-outcomes";
const blockOf = (doc: Obj): Obj => (doc[MEMBER] as Obj).subject_history as Obj;

/** The outcome bundle cut to its first four conversations, with `doc`'s slice on its Result. */
function bundleWith(doc: Obj, edit?: (block: Obj) => void): Obj {
  const source = load("outcome-report-bundle.json");
  const result = (source.disclosures as Obj).result as Obj;
  const resultDoc = result.agent_input as Obj;
  const all = resultDoc.claims as Obj[];
  const id = (c: Obj): string => (c.id as string).split("::")[0]!;
  const keep = [...new Set(all.map(id))].slice(0, 4);
  const kept = all.filter((c) => keep.includes(id(c)));
  const buckets: Record<string, string[]> = {
    met: [],
    not_met: [],
    not_evaluable: [],
  };
  for (const c of kept) buckets[c.verdict as string]!.push(c.id as string);
  const rename = new Map(
    Object.keys(blockOf(doc).conversations as Obj).map((k, i) => [k, keep[i]!]),
  );
  const block = JSON.parse(JSON.stringify(blockOf(doc))) as Obj;
  const renamed: Obj = {};
  for (const [k, v] of Object.entries(block.conversations as Obj)) {
    const entry = v as Obj;
    if (typeof entry.follow_up_of === "string")
      entry.follow_up_of = rename.get(entry.follow_up_of);
    renamed[rename.get(k)!] = entry;
  }
  block.conversations = renamed;
  edit?.(block);
  result.agent_input = {
    ...resultDoc,
    claims: kept,
    aggregate: {
      ...(resultDoc.aggregate as Obj),
      coverage: {
        ...((resultDoc.aggregate as Obj).coverage as Obj),
        evaluated_population: kept.length,
      },
      buckets,
    },
    [MEMBER]: { subject_history: block },
  };
  return source;
}

async function page(bundle: Obj): Promise<HTMLElement> {
  const root = document.createElement("main");
  await renderEvidenceGraph((await sealEvidenceBundle(bundle)).bundle, root);
  return root;
}

const section = (root: HTMLElement): HTMLElement | null =>
  root.querySelector('[data-section="subject-history"]');

function check(name: string, html: string): void {
  const path = resolve(GOLDENS, `${name}.html`);
  if (process.env.UPDATE_GOLDENS === "1") {
    mkdirSync(GOLDENS, { recursive: true });
    writeFileSync(path, `${html}\n`);
    return;
  }
  expect(`${html}\n` === readFileSync(path, "utf8"), `${name}.html`).toBe(true);
}

describe("subject-history reader (the producer's fixtures)", () => {
  it("operator tier: all five fields", () => {
    const h = readSubjectHistory({ ...operator })!;
    expect(h.tier).toBe("operator");
    expect(h.scope).toEqual({
      pack: "airline-support-outcomes",
      tier: "operator",
      salting: "per-pack",
      saltId: "5c830ead1ef08e31",
    });
    const t3 = h.entries.get("t-3")!;
    expect(t3.requestLabels).toEqual(["flight change", "transfer to a person"]);
    expect(t3.followUpOf).toBe("t-1");
    expect(t3.handle).toMatch(/^[0-9a-f]{64}$/u);
    expect(t3.bandExponent).toBe(2);
    expect(t3.halves).toEqual({ present: 4, of: 4 });
    // t-4 has no band: none is drawn, none is invented
    expect(h.entries.get("t-4")!.bandExponent).toBeUndefined();
  });

  it("shared tier: labels, band and halves; no handle, no follow_up_of", () => {
    const h = readSubjectHistory({ ...shared })!;
    expect(h.tier).toBe("shared");
    for (const entry of h.entries.values()) {
      expect(entry.handle).toBeUndefined();
      expect(entry.followUpOf).toBeUndefined();
      expect(entry.requestLabels.length).toBeGreaterThan(0);
    }
  });

  it("a shared-tier document that carries a handle anyway has it ignored", () => {
    const doc = JSON.parse(JSON.stringify(operator)) as Obj;
    (blockOf(doc).handle_scope as Obj).tier = "shared";
    const h = readSubjectHistory(doc)!;
    expect(h.tier).toBe("shared");
    for (const entry of h.entries.values()) {
      expect(entry.handle).toBeUndefined();
      expect(entry.followUpOf).toBeUndefined();
    }
  });

  it("a document with no handle_scope is read as shared", () => {
    const doc = JSON.parse(JSON.stringify(operator)) as Obj;
    delete blockOf(doc).handle_scope;
    expect(readSubjectHistory(doc)!.tier).toBe("shared");
  });

  it("drops an entry that does not read whole, and a slice named twice", () => {
    const doc = JSON.parse(JSON.stringify(operator)) as Obj;
    const conv = blockOf(doc).conversations as Obj;
    (conv["t-2"] as Obj).usd_band = "100";
    (conv["t-3"] as Obj).halves = { present: 5, of: 4 };
    (conv["t-4"] as Obj).customer_handle = "not-a-hash";
    const h = readSubjectHistory(doc)!;
    expect([...h.entries.keys()]).toEqual(["t-1"]);
    expect(
      readSubjectHistory({ ...operator, "x-other-pack": operator[MEMBER] }),
    ).toBeUndefined();
    expect(readSubjectHistory({ result_version: "x" })).toBeUndefined();
  });

  it("writes a band as a dollar range, never e+N", () => {
    expect(usdRange(0)).toBe("$1-9");
    expect(usdRange(1)).toBe("$10-99");
    expect(usdRange(3)).toBe("$1,000-9,999");
  });
});

describe("subject-history page", () => {
  it("operator: one customer, the tiles with denominators, the follow-up link, a row per conversation", async () => {
    const root = await page(bundleWith(operator));
    const s = section(root)!;
    expect(s).not.toBeNull();
    expect(s.dataset.tier).toBe("operator");
    expect(s.querySelectorAll("article.sh-cust")).toHaveLength(1);
    const text = s.textContent!;
    expect(text).toContain("One customer, 4 conversations");
    // every slice count is "k of n", the first of the report's total
    const tiles = [...s.querySelectorAll(".sh-tile")].map((t) => t.textContent);
    expect(tiles[0]).toMatch(/^4.*of the report's 4$/u);
    for (const tile of tiles.slice(1)) expect(tile).toMatch(/\d+ of 4/u);
    expect(s.querySelectorAll(".sh-link")).toHaveLength(1);
    expect(s.querySelector<HTMLElement>(".sh-link")!.dataset.of).not.toBe(
      s.querySelector<HTMLElement>(".sh-link")!.dataset.followUp,
    );
    expect(s.querySelectorAll("details.sh-conv")).toHaveLength(4);
    expect(text).toContain("USD $100-999");
    expect(text).not.toMatch(/e\+\d/u);
    expect(text).toContain("no band");
    expect(text).toContain("cancellation, compensation");
  });

  it("shared: no handle, no follow-up link, no customer block", async () => {
    const root = await page(bundleWith(shared));
    const s = section(root)!;
    expect(s.dataset.tier).toBe("shared");
    expect(s.querySelector("article.sh-cust")).toBeNull();
    expect(s.querySelector(".sh-link")).toBeNull();
    expect(s.querySelector("[data-handle]")).toBeNull();
    expect(s.querySelector(".sh-tile")).toBeNull();
    expect(s.querySelectorAll("details.sh-conv")).toHaveLength(4);
    const handle = ((blockOf(operator).conversations as Obj)["t-1"] as Obj)
      .customer_handle as string;
    expect(root.innerHTML).not.toContain(handle.slice(0, 12));
    expect(s.textContent).toContain("carries no customer handle");
  });

  it("a handle on one conversation only draws no customer: it says so", async () => {
    const root = await page(
      bundleWith(operator, (block) => {
        const conv = Object.values(block.conversations as Obj) as Obj[];
        conv[1]!.customer_handle = "ab".repeat(32);
        conv[2]!.customer_handle = "cd".repeat(32);
        conv[3]!.customer_handle = "ef".repeat(32);
      }),
    );
    const s = section(root)!;
    expect(s.querySelector("article.sh-cust")).toBeNull();
    expect(s.textContent).toContain("has more than one conversation");
  });

  it("a Result with no slice draws no section", async () => {
    const source = load("outcome-report-bundle.json");
    const root = await page(source);
    expect(section(root)).toBeNull();
  });

  it("a follow-up that cites a conversation outside the customer draws no link", async () => {
    const root = await page(
      bundleWith(operator, (block) => {
        for (const v of Object.values(block.conversations as Obj) as Obj[])
          if (v.follow_up_of !== undefined) v.follow_up_of = "not-a-case";
      }),
    );
    expect(section(root)!.querySelector(".sh-link")).toBeNull();
  });

  it("goldens: operator and shared, as a reader first sees them", async () => {
    for (const [name, doc] of [
      ["subject-history-operator", operator],
      ["subject-history-shared", shared],
    ] as const) {
      const root = await page(bundleWith(doc));
      check(name, section(root)!.outerHTML);
    }
  });
});

// The canvas's own case: four conversations on four days, two resolved, two
// missed, the third a follow-up of the second. The bundle fixture holds one
// day, so the drawer is given the rows directly.
describe("subject-history drawer", () => {
  const term = (ref: string, tone: "ok" | "bad" | "ne") => ({
    ref,
    label: ref,
    tone,
  });
  const row = (
    id: string,
    date: string,
    time: string,
    status: "resolved" | "missed",
    bad: boolean,
  ): SubjectConversation => ({
    id,
    date,
    time,
    status,
    outcome: {
      word: status,
      tone: status === "resolved" ? "ok" : "bad",
    },
    terms: [term("a.one", "ok"), term("a.two", bad ? "bad" : "ok")],
    open: bad
      ? [
          {
            label: "a.two",
            wording: "Met when the refusal follows the fare rules.",
            verdict: "not met",
            tone: "bad",
            note: "The judge was 78% sure.",
          },
        ]
      : [],
    turns: 9,
    calls: 0,
  });
  const rows = [
    row("c1", "2026-10-03", "10:12", "resolved", false),
    row("c2", "2026-10-09", "16:40", "missed", true),
    row("c3", "2026-10-14", "09:02", "resolved", false),
    row("c4", "2026-10-29", "14:02", "missed", true),
  ];
  const history = readSubjectHistory({
    [MEMBER]: {
      subject_history: {
        conversations: Object.fromEntries(
          ["c1", "c2", "c3", "c4"].map((id) => [
            id,
            {
              request_labels: [id === "c1" ? "seat change" : "refund"],
              usd_band: id === "c1" ? "e+1" : "e+2",
              halves: { present: 4, of: 4 },
              customer_handle: "7f3a".repeat(16),
              ...(id === "c3" ? { follow_up_of: "c2" } : {}),
            },
          ]),
        ),
        handle_scope: {
          pack: "airline-support-outcomes",
          tier: "operator",
          salting: "per-pack",
          salt_id: "e-2026-10a",
        },
      },
    },
  })!;

  it("draws the tiles of 4, 2 of 4, 2 of 4, 0 of 4 and a five-day follow-up link", async () => {
    const w = await contractReportWords("lines", undefined, {
      singleContract: true,
    });
    const s = renderSubjectHistory(rows, history, 244, w)!;
    const big = [...s.querySelectorAll(".sh-tile b")].map((b) => b.textContent);
    expect(big).toEqual(["4", "2 of 4", "2 of 4", "0 of 4"]);
    expect(s.querySelector(".sh-tile")!.textContent).toContain(
      "October 3 to October 29 · of the report's 244",
    );
    const link = s.querySelector<HTMLElement>(".sh-link")!;
    expect(link.dataset.followUp).toBe("c3");
    expect(link.dataset.of).toBe("c2");
    expect(link.textContent).toBe("5 days to the follow-up");
    expect(s.textContent).toContain("October 9 · 16:40");
    expect(s.textContent).toContain("USD $10-99");
    // the card of a missed conversation names the term, the wording, the judge's words
    const card = (
      s.querySelector('details[data-conversation="c2"]') as HTMLDetailsElement
    ).querySelector("summary")!;
    expect(card).not.toBeNull();
    check("subject-history-spread", s.outerHTML);
  });

  it("the card builds on open and holds the three columns", async () => {
    const w = await contractReportWords("lines", undefined, {
      singleContract: true,
    });
    const s = renderSubjectHistory(rows, history, 244, w)!;
    document.body.append(s);
    const d = s.querySelector<HTMLDetailsElement>(
      'details[data-conversation="c2"]',
    )!;
    d.open = true;
    d.dispatchEvent(new Event("toggle"));
    const cols = [...d.querySelectorAll(".sh-col")].map((c) => c.textContent);
    expect(cols).toHaveLength(3);
    expect(cols[0]).toContain("9 messages, 0 tool calls");
    expect(cols[1]).toContain("Met when the refusal follows the fare rules.");
    expect(cols[2]).toContain("The judge was 78% sure.");
    s.remove();
  });

  it("refuses a link to a later conversation, and never draws a count without its denominator", async () => {
    const w = await contractReportWords("lines", undefined, {
      singleContract: true,
    });
    const later = readSubjectHistory(
      JSON.parse(
        JSON.stringify({
          [MEMBER]: {
            subject_history: {
              conversations: {
                c1: {
                  request_labels: ["x"],
                  customer_handle: "ab".repeat(32),
                  follow_up_of: "c4",
                },
                c4: { request_labels: ["x"], customer_handle: "ab".repeat(32) },
              },
              handle_scope: {
                pack: "p",
                tier: "operator",
                salting: "per-pack",
                salt_id: "s",
              },
            },
          },
        }),
      ),
    )!;
    const s = renderSubjectHistory([rows[0]!, rows[3]!], later, 244, w)!;
    expect(s.querySelector(".sh-link")).toBeNull();
    for (const tile of [...s.querySelectorAll(".sh-tile")].slice(1))
      expect(tile.textContent).toMatch(/^\d+ of 2/u);
  });
});
