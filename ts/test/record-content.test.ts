// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom
//
// The core's one record view (evidence-graph-view.ts, "Records in this
// bundle"), its content modules (record-content.ts) and the conversation in
// place in a card (report-levels.ts conversationFold / linkConversations).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import { DEFAULT_WORDS } from "../src/contract-report-wording.js";
import {
  canonicalJson,
  conversationModule,
  pickContentModule,
  renderContent,
} from "../src/record-content.js";
import {
  conversationFold,
  linkConversations,
  openToggle,
  recordAddress,
} from "../src/report-levels.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

const w = DEFAULT_WORDS.lines;

const CONVERSATION = {
  case: { benchmark: "tau2", domain: "airline", task_id: "0", trial: 0 },
  agent_interaction: {
    messages: [
      { role: "assistant", content: "Hi! How can I help you today?" },
      { role: "user", content: "Please cancel EHGLP3." },
      {
        role: "assistant",
        content: "Let me check it.",
        tool_calls: [
          {
            name: "get_reservation_details",
            arguments: { reservation_id: "EHGLP3", b: 1, a: 2 },
          },
        ],
      },
      { role: "tool", content: '{"reservation_id":"EHGLP3"}' },
    ],
  },
};

function fixture(): Obj {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "test", "testdata", "result-root-bundle.json"),
      "utf8",
    ),
  ) as Obj;
}

/** The Result fixture with case-1's disclosed input carrying a conversation. */
async function withConversation(): Promise<{ bundle: Obj; id: string }> {
  const source = fixture();
  const disclosures = source.disclosures as Obj;
  const caseInput = (disclosures["case-1"] as Obj).agent_input as Obj;
  Object.assign(caseInput, CONVERSATION);
  const { bundle, ids } = await sealEvidenceBundle(source);
  return { bundle, id: ids["case-1"]! };
}

async function render(bundle: Obj): Promise<HTMLElement> {
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root);
  return root;
}

it("a conversation goes to the conversation module; anything else is shown as recorded, canonical and indented", () => {
  expect(pickContentModule(CONVERSATION)).toBe(conversationModule);
  expect(pickContentModule({ agent_interaction: {} })).toBeUndefined();
  expect(pickContentModule("text")).toBeUndefined();

  const chat = renderContent(CONVERSATION, w);
  expect(chat.dataset.contentModule).toBe("conversation");
  expect(chat.querySelectorAll("li.turn")).toHaveLength(4);
  expect(chat.textContent).toContain("Hi! How can I help you today?");
  // the core checked only the record's digest: it never says the judge read it
  expect(chat.textContent).toContain(
    "checked on this page against the record's digest",
  );
  expect(chat.textContent).not.toContain("the judge read");
  // tool arguments in canonical member order, so every packaging agrees
  expect(chat.querySelector(".call-a")!.textContent).toBe(
    '{"a":2,"b":1,"reservation_id":"EHGLP3"}',
  );

  const other = renderContent({ z: 1, a: { y: [2, { c: 3, b: 4 }] } }, w);
  expect(other.dataset.contentModule).toBe("as-recorded");
  expect(other.querySelector("pre")!.textContent).toBe(
    canonicalJson({ a: { y: [2, { b: 4, c: 3 }] }, z: 1 }, 2),
  );
  expect(other.querySelector("pre")!.textContent).toMatch(/^\{\n {2}"a"/u);
});

it("every record has one entry with its own address, closed and built only when opened", async () => {
  const { bundle, id } = await withConversation();
  const root = await render(bundle);
  const entries = [
    ...root.querySelectorAll<HTMLDetailsElement>("details.cv-record"),
  ];
  const records = (bundle.records as Obj[]).map((r) => r.capsule_id);
  expect(entries.map((e) => e.id)).toEqual(
    records.map((r) => recordAddress(r as string)),
  );
  expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  for (const entry of entries) {
    expect(entry.open).toBe(false);
    expect(entry.dataset.body).toBe("pending");
    expect(entry.querySelector(".cv-record-body")).toBeNull();
  }
  const entry = root.querySelector<HTMLDetailsElement>(
    `#${recordAddress(id)}`,
  )!;
  openToggle(entry);
  expect(entry.dataset.body).toBe("built");
  const body = entry.querySelector(".cv-record-body")!;
  expect(
    body.querySelector('[data-content-module="conversation"]'),
  ).not.toBeNull();
  expect(body.querySelectorAll("li.turn")).toHaveLength(4);
});

it("a disclosed value that does not match its record's digest is never drawn, in the records section or anywhere else", async () => {
  const { bundle, id } = await withConversation();
  const disclosures = bundle.disclosures as Obj;
  const tampered = structuredClone(disclosures[id]) as Obj;
  const input = tampered.agent_input as Obj;
  ((input.agent_interaction as Obj).messages as Obj[])[0]!.content =
    "SECRET-TAMPERED";
  disclosures[id] = tampered;
  const root = await render(bundle);
  const entry = root.querySelector<HTMLDetailsElement>(
    `#${recordAddress(id)}`,
  )!;
  openToggle(entry);
  expect(root.textContent).not.toContain("SECRET-TAMPERED");
  expect(entry.querySelector("li.turn")).toBeNull();
  expect(
    entry.querySelector('[data-disclosure="disclosure_mismatch"]'),
  ).not.toBeNull();
});

it("a card's conversation opens in place, carries no address, and links to the one record entry", () => {
  const record = "f".repeat(64);
  const fold = conversationFold(
    {
      state: "verified",
      turns: [{ role: "user", content: "hello", toolCalls: [] }],
      transcriptRecordId: record,
    },
    undefined,
    w,
  );
  const toggle = fold.querySelector<HTMLDetailsElement>(
    'details[data-section="conversation"]',
  )!;
  expect(toggle.dataset.level).toBe("2");
  expect(toggle.querySelector(".chat")).toBeNull();
  openToggle(toggle);
  const bars = toggle.querySelectorAll(".chat-bar");
  expect(bars).toHaveLength(2);
  for (const bar of bars) {
    expect(bar.querySelector(".chat-close")!.textContent).toBe(
      "Close the conversation",
    );
    expect(bar.querySelector("a.chat-records")!.getAttribute("href")).toBe(
      `#${recordAddress(record)}`,
    );
  }
  // the bottom control closes the conversation
  (bars[1]!.querySelector(".chat-close") as HTMLElement).click();
  expect(toggle.open).toBe(false);
  // the in-place copy has no address of its own
  expect(fold.querySelectorAll("[id]")).toHaveLength(0);
  // the static link is there, hidden, for a page that runs no script
  const link = fold.querySelector<HTMLAnchorElement>("a.chat-static")!;
  expect(link.hidden).toBe(true);
  expect(link.textContent).toBe("Read the conversation");
});

it("with no script, a conversation whose record entry is on the page becomes a link to it; one whose record is not stays in place", () => {
  const page = document.createElement("div");
  const here = "a".repeat(64);
  const elsewhere = "b".repeat(64);
  const entry = document.createElement("details");
  entry.className = "cv-record";
  entry.id = recordAddress(here);
  page.append(entry);
  for (const record of [here, here, elsewhere])
    page.append(
      conversationFold(
        {
          state: "verified",
          turns: [{ role: "user", content: "hi", toolCalls: [] }],
          transcriptRecordId: record,
        },
        undefined,
        w,
      ),
    );
  expect(linkConversations(page)).toBe(2);
  const folds = [...page.querySelectorAll(".chat-fold")];
  for (const fold of folds.slice(0, 2)) {
    expect(fold.querySelector("details")).toBeNull();
    expect(fold.querySelector<HTMLElement>("a.chat-static")!.hidden).toBe(
      false,
    );
  }
  expect(
    folds[2]!.querySelector('details[data-section="conversation"]'),
  ).not.toBeNull();
  // no close control survives on a page that runs no script
  expect(page.querySelectorAll(".chat-close")).toHaveLength(0);
});
