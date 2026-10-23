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
  levelCss,
  linkConversations,
  openToggle,
  recordAddress,
} from "../src/report-levels.js";
import { withCarriedCapsule } from "./helpers/carried-capsule.js";
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
  // a content module draws content only: no statement of what was checked
  // (that is the core's, beside the block), never which case a judge read
  expect(chat.querySelector(".chat-k")).toBeNull();
  expect(chat.textContent).not.toMatch(/digest|checked|judge/u);
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
  expect(
    entries.map((e) => e.querySelector(":scope > .cv-record-anchor")!.id),
  ).toEqual(records.map((r) => recordAddress(r as string)));
  expect(new Set(root.querySelectorAll(".cv-record-anchor[id]")).size).toBe(
    entries.length,
  );
  for (const entry of entries) {
    expect(entry.open).toBe(false);
    expect(entry.dataset.body).toBe("pending");
    expect(entry.querySelector(".cv-record-body")).toBeNull();
  }
  const entry = root
    .querySelector(`#${recordAddress(id)}`)!
    .closest("details")!;
  openToggle(entry);
  expect(entry.dataset.body).toBe("built");
  const body = entry.querySelector(".cv-record-body")!;
  expect(
    body.querySelector('[data-content-module="conversation"]'),
  ).not.toBeNull();
  expect(body.querySelectorAll("li.turn")).toHaveLength(4);
});

it("a bundle that did not verify: the records list names each record, its kind and standing, says once that content is not shown, and draws none", async () => {
  const { bundle, id } = await withConversation();
  const disclosures = bundle.disclosures as Obj;
  const tampered = structuredClone(disclosures[id]) as Obj;
  (
    ((tampered.agent_input as Obj).agent_interaction as Obj).messages as Obj[]
  )[0]!.content = "SECRET-TAMPERED";
  disclosures[id] = tampered;
  // a repeated record: its id gets an entry each time, never two addresses
  (bundle.records as Obj[]).push(
    structuredClone((bundle.records as Obj[])[0]!),
  );
  const root = await render(bundle);
  expect(root.querySelector('[data-verify="failed"]')).not.toBeNull();
  expect(root.textContent).not.toContain("SECRET-TAMPERED");
  expect(root.querySelectorAll("details.cv-record")).toHaveLength(0);
  expect(root.querySelectorAll(".cv-content, li.turn")).toHaveLength(0);
  expect(root.querySelectorAll('[data-records="not-shown"]')).toHaveLength(1);
  const items = [
    ...root.querySelectorAll<HTMLElement>('[data-records="coverage"] > li'),
  ];
  expect(items).toHaveLength((bundle.records as Obj[]).length);
  for (const item of items) {
    expect(item.textContent).toContain(item.dataset.capsuleId!);
    expect(item.querySelector("[data-record-status]")).not.toBeNull();
  }
  const ids = [...root.querySelectorAll("[id]")].map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
});

it("a carried input that does not match its commitment is never drawn, and the book header keeps its own heading", async () => {
  const source = fixture();
  const { alias, carriedId } = await withCarriedCapsule(source, CONVERSATION, {
    withOriginal: false,
  });
  const { bundle, ids } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
  const entry = root
    .querySelector(`#${recordAddress(carriedId)}`)!
    .closest<HTMLDetailsElement>("details.cv-record")!;
  expect(entry.dataset.record).toBe(ids[alias]);
  openToggle(entry);
  const headings = [...entry.querySelectorAll("h5")].map((h) => h.textContent);
  // the book's own header is disclosed; the capsule it carries is withheld
  expect(headings).toEqual([
    "agent_input",
    "agent_input of the capsule it carries",
  ]);
  // the header's content block follows its heading and the core's line
  const header = entry.querySelector("h5 ~ .cv-content")!;
  expect(header.textContent).toContain("published_capsule");
  expect(entry.querySelector("li.turn")).toBeNull();
  expect(entry.querySelector('[data-disclosure="withheld"]')).not.toBeNull();
});

it("a claim citing the capsule an evidence-book record carries: the record has an address under both ids, and its entry draws the carried conversation", async () => {
  const source = fixture();
  const { alias, carriedId } = await withCarriedCapsule(source, CONVERSATION);
  const { bundle, ids } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  const byOwn = root.querySelector(`#${recordAddress(ids[alias]!)}`)!;
  const byCarried = root.querySelector(`#${recordAddress(carriedId)}`)!;
  expect(byOwn.closest("details.cv-record")).toBe(
    byCarried.closest("details.cv-record"),
  );
  const entry = byCarried.closest<HTMLDetailsElement>("details.cv-record")!;
  // the entry's kind is what the book header names
  expect(entry.querySelector("summary")!.textContent).toContain(
    "published_capsule",
  );
  openToggle(entry);
  expect(entry.querySelectorAll("li.turn")).toHaveLength(4);
  // a card's conversation naming the carried capsule links to this entry
  const page = document.createElement("div");
  page.append(root);
  page.append(
    conversationFold(
      {
        state: "verified",
        turns: [{ role: "user", content: "hi", toolCalls: [] }],
        transcriptRecordId: carriedId,
      },
      undefined,
      w,
    ),
  );
  expect(linkConversations(page)).toBe(1);
});

it("every record outside a Result's claims still shows its kind, times, log position and members", async () => {
  const { bundle, id } = await withConversation();
  const root = await render(bundle);
  for (const entry of root.querySelectorAll<HTMLDetailsElement>(
    "details.cv-record",
  )) {
    openToggle(entry);
    const body = entry.querySelector(".cv-record-body")!;
    expect(body.querySelector("[data-seal]")).not.toBeNull();
    expect(body.textContent).toContain("seal time");
  }
  const own = root
    .querySelector(`#${recordAddress(id)}`)!
    .closest("details.cv-record")!;
  expect(own.textContent).toContain("log ID");
});

it("with checkpoint coverage withheld, the records list is still drawn and the withheld status kept", async () => {
  const source = fixture();
  source.completeness = {
    closure_depth: 2,
    records_mode: "complete",
    payloads_mode: "all",
    suppressed_fields: [],
    missing: [],
    selection: "producer-selected",
  };
  const { bundle } = await sealEvidenceBundle(source);
  const root = await render(bundle);
  const line = root.querySelector<HTMLElement>(
    '[data-coverage="not-established"]',
  );
  expect(line?.dataset.claim).toBe("withheld");
  expect(root.querySelector('[data-records="coverage-summary"]')).toBeNull();
  expect(root.querySelectorAll('[data-records="coverage"] > li').length).toBe(
    (bundle.records as Obj[]).length,
  );
});

it("at depth L2 the records list is open, its entries closed", async () => {
  const { bundle } = await withConversation();
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root, undefined, { depth: "L2" });
  expect(
    root.querySelector<HTMLDetailsElement>('[data-records="coverage-detail"]')!
      .open,
  ).toBe(true);
  for (const entry of root.querySelectorAll<HTMLDetailsElement>(
    "details.cv-record",
  ))
    expect(entry.open).toBe(false);
});

it("canonical JSON keeps every member, in code-unit order, integer-like keys included", () => {
  const value = JSON.parse(
    '{"b":1,"10":"ten","9":"nine","__proto__":{"x":1},"a":[{"z":0,"y":{"__proto__":2}}]}',
  ) as unknown;
  const text = canonicalJson(value);
  expect(text).toBe(
    '{"10":"ten","9":"nine","__proto__":{"x":1},"a":[{"y":{"__proto__":2},"z":0}],"b":1}',
  );
  expect(JSON.parse(canonicalJson(value, 2))).toEqual(JSON.parse(text));
  expect(canonicalJson(value, 2)).toContain('\n  "10": "ten",\n  "9": "nine"');
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
  // the static link is there, hidden, for a page that runs no script, and
  // the frame's own stylesheet does not show it
  const link = fold.querySelector<HTMLAnchorElement>("a.chat-static")!;
  expect(link.hidden).toBe(true);
  const frame = document.createElement("div");
  frame.className = "oi";
  const style = document.createElement("style");
  style.textContent = levelCss("oi");
  frame.append(style, fold);
  document.body.append(frame);
  expect(getComputedStyle(link).display).toBe("none");
  link.hidden = false;
  expect(getComputedStyle(link).display).toBe("inline-block");
  link.hidden = true;
  frame.remove();
  expect(link.textContent).toBe("Read the conversation");
});

it("with no script, a conversation whose record entry is on the page becomes a link to it; one whose record is not stays in place", () => {
  const page = document.createElement("div");
  const here = "a".repeat(64);
  const elsewhere = "b".repeat(64);
  const entry = document.createElement("details");
  entry.className = "cv-record";
  const anchor = document.createElement("span");
  anchor.className = "cv-record-anchor";
  anchor.id = recordAddress(here);
  entry.append(anchor);
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
  // a conversation with no record keeps its state note, even once built
  const absent = conversationFold({ state: "absent" }, "case-x", w);
  page.append(absent);
  openToggle(absent.querySelector("details")!);
  linkConversations(page);
  expect(absent.querySelector('[data-transcript="absent"]')).not.toBeNull();
  // no close control survives on a page that runs no script
  expect(page.querySelectorAll(".chat-close")).toHaveLength(0);
});

it("where script runs: a page opened at a record's address, a later address change and a Cites link each open that record and every fold around it", async () => {
  const { bundle, id } = await withConversation();
  window.location.hash = `#${recordAddress(id)}`;
  const root = document.createElement("main");
  document.body.append(root);
  try {
    await renderEvidenceGraph(bundle, root);
    const entryOf = (record: string): HTMLDetailsElement =>
      root
        .querySelector(`#${recordAddress(record)}`)!
        .closest<HTMLDetailsElement>("details.cv-record")!;
    const opened = (entry: HTMLDetailsElement): boolean => {
      for (
        let at: Element | null = entry;
        at !== null;
        at = at.parentElement?.closest("details") ?? null
      )
        if (!(at as HTMLDetailsElement).open) return false;
      return true;
    };
    // the initial address
    expect(opened(entryOf(id))).toBe(true);
    expect(entryOf(id).querySelectorAll("li.turn")).toHaveLength(4);
    // a later address change
    const others = (bundle.records as Obj[])
      .map((r) => r.capsule_id as string)
      .filter((r) => r !== id);
    window.location.hash = `#${recordAddress(others[0]!)}`;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(opened(entryOf(others[0]!))).toBe(true);
    // a Cites link inside an entry
    const citing = [
      ...root.querySelectorAll<HTMLDetailsElement>("details.cv-record"),
    ].find((entry) => {
      openToggle(entry);
      return (
        entry.querySelector(".cv-record-body a[href^='#record-']") !== null
      );
    })!;
    const link = citing.querySelector<HTMLAnchorElement>(
      ".cv-record-body a[href^='#record-']",
    )!;
    const target = link.getAttribute("href")!.slice("#record-".length);
    entryOf(target).open = false;
    link.click();
    expect(opened(entryOf(target))).toBe(true);
  } finally {
    root.remove();
    window.location.hash = "";
  }
});

it("the core, not the content module, states once beside each content block that the content matches the record's digest", async () => {
  const { bundle, id } = await withConversation();
  const root = await render(bundle);
  const entry = root
    .querySelector(`#${recordAddress(id)}`)!
    .closest<HTMLDetailsElement>("details.cv-record")!;
  openToggle(entry);
  const blocks = entry.querySelectorAll(".cv-content");
  const lines = entry.querySelectorAll('[data-content-check="digest"]');
  expect(blocks.length).toBeGreaterThan(0);
  expect(lines).toHaveLength(blocks.length);
  for (const line of lines) {
    expect(line.nextElementSibling!.classList.contains("cv-content")).toBe(
      true,
    );
    expect(line.textContent).not.toContain("on this page");
  }
  expect(entry.querySelector(".cv-content")!.textContent).not.toMatch(
    /matches the digest/u,
  );
});

it("a record no claim cites shows its own seal status and exact log position", async () => {
  const { bundle } = await withConversation();
  const root = await render(bundle);
  const memberships = (bundle.completeness_certificate as Obj)
    .memberships as Record<string, Obj>;
  const rootId = (bundle.records as Obj[])
    .map((r) => r.capsule_id as string)
    .find((id) => root.querySelector(`[data-capsule-id="${id}"]`) !== null)!;
  for (const id of [rootId, ...Object.keys(memberships)]) {
    const coordinates = memberships[id]!.log_coordinates as Obj;
    const entry = root
      .querySelector(`#${recordAddress(id)}`)!
      .closest<HTMLDetailsElement>("details.cv-record")!;
    openToggle(entry);
    const values = new Map(
      [...entry.querySelectorAll(".cv-record-body dt")].map((dt) => [
        dt.textContent,
        dt.nextElementSibling!.textContent,
      ]),
    );
    expect(values.get("seal status"), id).toBe("checkpointed");
    expect(values.get("log ID"), id).toBe(JSON.stringify(coordinates.log_id));
    expect(values.get("sequence"), id).toBe(String(coordinates.seq));
    expect(values.get("leaf"), id).toBe(String(coordinates.leaf_index));
  }
});

it("a fragment that does not decode names no record: neither the first render nor a later address change fails", async () => {
  const { bundle } = await withConversation();
  const root = document.createElement("main");
  document.body.append(root);
  try {
    for (const bad of ["#record-%", "#record-%E0"]) {
      window.location.hash = bad;
      await expect(renderEvidenceGraph(bundle, root)).resolves.toBeUndefined();
      window.location.hash = "#record-%E0%A4";
      expect(() =>
        window.dispatchEvent(new HashChangeEvent("hashchange")),
      ).not.toThrow();
      expect(
        [
          ...root.querySelectorAll<HTMLDetailsElement>("details.cv-record"),
        ].some((entry) => entry.open),
      ).toBe(false);
    }
  } finally {
    root.remove();
    window.location.hash = "";
  }
});

it("a record's own id outranks a carried capsule's: a book record listed before the capsule it carries never takes that capsule's address", async () => {
  const source = fixture();
  const { alias, carriedId } = await withCarriedCapsule(source, CONVERSATION, {
    capsuleAsRecord: true,
  });
  const { bundle, ids } = await sealEvidenceBundle(source);
  const order = (bundle.records as Obj[]).map((r) => r.capsule_id);
  expect(order.indexOf(ids[alias])).toBeLessThan(order.indexOf(carriedId));
  const root = await render(bundle);
  expect(
    root
      .querySelector(`#${recordAddress(carriedId)}`)!
      .closest<HTMLElement>("details.cv-record")!.dataset.record,
  ).toBe(carriedId);
  const book = root
    .querySelector(`#${recordAddress(ids[alias]!)}`)!
    .closest<HTMLElement>("details.cv-record")!;
  expect(book.querySelectorAll(".cv-record-anchor")).toHaveLength(1);
  const all = [...root.querySelectorAll("[id]")].map((e) => e.id);
  expect(new Set(all).size).toBe(all.length);
});
