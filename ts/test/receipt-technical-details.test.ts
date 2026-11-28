// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// A receipt page's Technical details say what its top says (#518): the
// Countersignatures list draws the countersigned copy the page checked
// itself exactly when the COUNTERSIGNED stamp fills from it, in the stamp's
// words, whatever time the copy's countersigner gave; and a receipt page
// does not repeat "no receipts disclosed", which "What this copy carries"
// already says (Sherlock2's ruling on #518), while a generic page still does.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CountersignedCopyStamp } from "../src/countersigned-copy.js";

// The page's own copy check, stubbed to give the time under test: a real
// copy's time is inside its signed statement and cannot be edited.
const checked = vi.hoisted(() => ({ stamp: null as unknown }));
vi.mock("../src/countersigned-copy.js", async (original) => ({
  ...(await original<typeof import("../src/countersigned-copy.js")>()),
  checkCountersignedCopy: () => Promise.resolve(checked.stamp),
}));

const { createPresentationRegistry, renderEvidenceGraph } = await import(
  "../src/evidence-graph-view.js"
);
const { receiptModules } = await import("../src/receipt.js");

type Obj = Record<string, unknown>;
const json = (...path: string[]): Obj =>
  JSON.parse(readFileSync(resolve(process.cwd(), ...path), "utf8")) as Obj;
const deal = (name: string): Obj =>
  json("..", "tests", "testdata", "deal-v1", "countersigned", name);

const local = (iso: string): string =>
  new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));

async function receiptPage(
  copy: CountersignedCopyStamp | null,
): Promise<HTMLElement> {
  checked.stamp = copy;
  const registry = createPresentationRegistry();
  for (const module of receiptModules()) registry.register(module);
  const root = document.createElement("main");
  await renderEvidenceGraph(
    deal("same-checkpoint.bundle.json"),
    root,
    undefined,
    {
      depth: "L2",
      registry,
      verifierReport: deal("same-checkpoint.verify.json"),
      countersignedCopy: { bundle: {}, countersigners: [] } as never,
    },
  );
  return root;
}

function heading(root: HTMLElement, text: string): Element | undefined {
  return [...root.querySelectorAll("h4")].find((h) => h.textContent === text);
}

function views(root: HTMLElement) {
  const top = root.querySelector('[data-stamp="countersigned"]')!;
  const list = heading(root, "Countersignatures")!.nextElementSibling!;
  return {
    state: top.getAttribute("data-stamp-state"),
    text: top.querySelector(".cv-rcpt-stamp__text")!.textContent,
    details: [...list.children].map((li) => ({
      kind: li.getAttribute("data-stamp-kind"),
      text: li.querySelector("span")!.textContent,
    })),
  };
}

const stampOf = (at: string, independent = false): CountersignedCopyStamp => ({
  name: "Example Countersigner",
  at,
  k: 1,
  n: 1,
  independent,
});

describe("a receipt page's Countersignatures line agrees with its stamp (#518)", () => {
  it("draws the copy's line, to the second, when the stamp fills from it", async () => {
    for (const [at, independent, second] of [
      ["2026-09-16T00:00:00Z", true, "2026-09-16T00:00:00Z"],
      ["2026-09-16T00:00:00.987654Z", false, "2026-09-16T00:00:00Z"],
    ] as const) {
      const page = views(await receiptPage(stampOf(at, independent)));
      const line =
        `Countersigned by Example Countersigner at ${local(second)}, through record 1 of 1.` +
        (independent
          ? ""
          : " Its directory entry does not list it as independent of the parties.");
      expect(page.state, at).toBe("filled");
      expect(page.text, at).toBe(line);
      expect(page.details, at).toEqual([
        { kind: "countersigned-copy", text: line },
      ]);
    }
  });

  it("draws neither from a copy whose time the stamp does not read", async () => {
    for (const at of [
      "2026-02-30T00:00:00Z",
      "2026-09-16T00:00:00+00:00",
      "2026-09-16 00:00:00Z",
      "not a time",
    ]) {
      const page = views(await receiptPage(stampOf(at)));
      expect(page.state, at).toBe("open");
      expect(page.details, at).toEqual([
        { kind: "hollow", text: "Countersigned: none" },
      ]);
    }
  });

  it("says Countersigned: none on an uncountersigned page, as the stamp does", async () => {
    const page = views(await receiptPage(null));
    expect(page.state).toBe("open");
    expect(page.text).toBe("Not countersigned");
    expect(page.details).toEqual([
      { kind: "hollow", text: "Countersigned: none" },
    ]);
  });
});

describe("the Receipts line (Sherlock2 on #518)", () => {
  it("is not drawn on a receipt page that discloses no receipts", async () => {
    const root = await receiptPage(null);
    expect(heading(root, "Receipts")).toBeUndefined();
    expect(root.textContent).not.toContain("no receipts disclosed");
  });

  it("stays on a generic AAC page", async () => {
    const root = document.createElement("main");
    await renderEvidenceGraph(
      json("test", "testdata", "week-bundle.json"),
      root,
      undefined,
      { depth: "L2" },
    );
    expect(heading(root, "Receipts")?.nextElementSibling?.textContent).toBe(
      "no receipts disclosed",
    );
  });
});
