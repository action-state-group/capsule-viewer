// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// The witness that time-stamped the holder's own book, and whether its
// directory entry lists it as independent of the parties (capsule-viewer#508,
// the reading contract of ops u652): capsulectl's `witnessed` member may carry
// the witness row's `independent_of` list as the reader's witness directory
// states it; the page decides from it, as for the countersigned copy (#457,
// u650), and says "Its directory entry does not list it as independent of
// the parties." only when the list leaves out a party it knows. With no list,
// or a list the page cannot judge, it says nothing about independence.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { counterpartyKey, listsParties } from "../src/countersigned-copy.js";
import {
  createPresentationRegistry,
  renderEvidenceGraph,
} from "../src/evidence-graph-view.js";
import { receiptModules, renderReceipt } from "../src/receipt.js";

type Obj = Record<string, unknown>;
const testdata = (dir: string, name: string): Obj =>
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "..", "tests", "testdata", dir, name),
      "utf8",
    ),
  ) as Obj;
const v1Copy = (): Obj => testdata("deal-v1", "keep-copy.bundle.json");
const v1Report = (witnessed: unknown): Obj => {
  const r = testdata("deal-v1", "keep-copy.verify.json");
  (r["extensions"] as Obj[]).find((e) => e["kind"] === "x-deal-v1")![
    "witnessed"
  ] = witnessed;
  return r;
};
const v0Copy = (): Obj =>
  testdata("receipt", "main-standalone-keep.bundle.json");
const v0Report = (witnessed: unknown): Obj => {
  const r = testdata("deal-v0-report", "main-standalone-keep.verify.json");
  (r["extensions"] as Obj[]).find((e) => e["kind"] === "x-deal-v0")![
    "witnessed"
  ] = witnessed;
  return r;
};

// The short stamp and proof-row lines follow the witness's name; the longer
// lines capsulectl's answer is said in name it again (Sherlock2 on #513).
const NOT_LISTED =
  "Its directory entry does not list it as independent of the parties.";
const LINE_NOT_LISTED =
  "The directory entry for Example Witness does not list it as independent of the parties.";
const AT = "2026-11-25T14:41:19Z";
const verified = (extra: Obj = {}): Obj => ({
  status: "verified",
  witness: "Example Witness",
  at: AT,
  ...extra,
});

// The holder's key: the one its records are signed with (a fresh copy
// declares no producer key). The counterparty's: the holder's sealed agreement's.
const signingKeys = (bundle: Obj): string[] => [
  ...new Set((bundle["records"] as Obj[]).map((r) => r["key_id"] as string)),
];
const HOLDER = signingKeys(v1Copy());
const COUNTERPARTY = counterpartyKey(v1Copy())!;
const V0_HOLDER = signingKeys(v0Copy());

// The full page: the receipt module beside the page core.
async function fullPage(report: Obj): Promise<HTMLElement> {
  const registry = createPresentationRegistry();
  for (const module of receiptModules()) registry.register(module);
  const root = document.createElement("main");
  document.body.append(root);
  await renderEvidenceGraph(v1Copy(), root, undefined, {
    depth: "L2",
    registry,
    verifierReport: report,
  });
  return root;
}
// The receipt drawn on its own, with its own proof panel.
async function alone(bundle: Obj, report: Obj): Promise<HTMLElement> {
  const host = document.createElement("div");
  await renderReceipt(bundle, host, { verifierReport: report, depth: "L2" });
  return host;
}
const stampText = (root: ParentNode): string =>
  root.querySelector('[data-stamp="time_stamped"] .cv-rcpt-stamp__text')
    ?.textContent ?? "";
const checkRow = (root: ParentNode): string =>
  root.querySelector('[data-check="capsulectl-witnesses"]')?.textContent ?? "";
const banner = (root: ParentNode): string =>
  root.querySelector('[data-witness-notice="book-witnessed"]')?.textContent ??
  "";
const proofRow = (root: ParentNode): string =>
  [...root.querySelectorAll(".cv-rcpt-proof li")]
    .map((n) => n.textContent ?? "")
    .find((t) => t.includes("Witness time stamp")) ?? "";

describe("listsParties, shared with the countersigned copy", () => {
  it("is false when a known party is left out, true only when both sides are known and named, else null", () => {
    expect(listsParties(undefined, ["h"], "c")).toBe(false);
    expect(listsParties("h", ["h"], "c")).toBe(false);
    expect(listsParties([], [], null)).toBe(false);
    expect(listsParties(["h"], ["h"], "c")).toBe(false);
    expect(listsParties(["c"], ["h"], "c")).toBe(false);
    expect(listsParties(["c", "h"], ["h"], "c")).toBe(true);
    // The page knows only the holder: it cannot tell.
    expect(listsParties(["h"], ["h"], null)).toBeNull();
    expect(listsParties(["c"], [], "c")).toBeNull();
  });
});

describe("the witness's directory entry on an x-deal-v1 keep page (#508)", () => {
  const cases: [string, Obj, boolean][] = [
    [
      "both parties listed",
      verified({ independent_of: [COUNTERPARTY, ...HOLDER] }),
      false,
    ],
    ["an empty list", verified({ independent_of: [] }), true],
    ["only the holder", verified({ independent_of: HOLDER }), true],
    [
      "only the counterparty",
      verified({ independent_of: [COUNTERPARTY] }),
      true,
    ],
    ["no directory entry reported", verified(), false],
    ["a list that is not of strings", verified({ independent_of: [1] }), false],
    // capsulectl's own `independent` is never the page's answer.
    [
      "capsulectl says independent, its list does not",
      verified({ independent: true, independent_of: [] }),
      true,
    ],
    [
      "capsulectl says not independent, with no list",
      verified({ independent: false }),
      false,
    ],
  ];

  it("beside the core: the stamp, the banner and the check list agree", async () => {
    expect(HOLDER).toHaveLength(1);
    for (const [why, witnessed, notListed] of cases) {
      const root = await fullPage(v1Report(witnessed));
      for (const [where, text, sentence] of [
        ["stamp", stampText(root), NOT_LISTED],
        ["banner", banner(root), LINE_NOT_LISTED],
        ["check list", checkRow(root), LINE_NOT_LISTED],
      ] as const) {
        expect(text, `${why}: ${where}`).toContain("Example Witness");
        expect(text.includes(sentence), `${why}: ${where}`).toBe(notListed);
      }
      expect(
        root
          .querySelector('[data-stamp="time_stamped"]')
          ?.getAttribute("data-stamp-state"),
        why,
      ).toBe("filled");
      root.remove();
    }
  });

  it("on its own: the stamp and the proof row agree", async () => {
    for (const [why, witnessed, notListed] of cases) {
      const host = await alone(v1Copy(), v1Report(witnessed));
      expect(stampText(host).includes(NOT_LISTED), why).toBe(notListed);
      expect(proofRow(host), why).toContain("Example Witness");
      expect(proofRow(host).includes(NOT_LISTED), why).toBe(notListed);
    }
  });

  it("a failed or withheld time stamp names the witness capsulectl names, and its directory entry the same way", async () => {
    const both: [string, Obj, boolean][] = [
      ["not listed", { witness: "Example Witness", independent_of: [] }, true],
      [
        "listed",
        {
          witness: "Example Witness",
          independent_of: [COUNTERPARTY, ...HOLDER],
        },
        false,
      ],
      ["no directory entry reported", { witness: "Example Witness" }, false],
    ];
    const states: [string, string, string, string][] = [
      [
        "failed",
        "Example Witness: didn't verify",
        "Witness time stamp from Example Witness: didn't verify",
        "capsulectl verify reported that your own book's witness time-stamp from Example Witness did not verify",
      ],
      [
        "withheld",
        "Not time-stamped yet by Example Witness",
        "Witness time stamp from Example Witness: not in this copy",
        "capsulectl verify found no time-stamp for your own book from Example Witness.",
      ],
    ];
    for (const [status, stamp, proof, line] of states)
      for (const [why, member, notListed] of both) {
        const witnessed = { status, ...member };
        const label = `${status}, ${why}`;
        const host = await alone(v1Copy(), v1Report(witnessed));
        expect(stampText(host), label).toBe(
          notListed ? `${stamp}. ${NOT_LISTED}` : stamp,
        );
        expect(proofRow(host), label).toContain(proof);
        expect(proofRow(host).includes(NOT_LISTED), label).toBe(notListed);
        const root = await fullPage(v1Report(witnessed));
        expect(checkRow(root), label).toContain(line);
        expect(checkRow(root).includes(LINE_NOT_LISTED), label).toBe(notListed);
        root.remove();
      }
  });

  it("an unnamed failed time stamp is as before", async () => {
    const witnessed = { status: "failed", independent_of: [] };
    const host = await alone(v1Copy(), v1Report(witnessed));
    expect(stampText(host)).toBe("Didn't verify");
    expect(proofRow(host)).toContain("Witness time stamp: didn't verify");
    expect(host.textContent).not.toContain(NOT_LISTED);
    const root = await fullPage(v1Report(witnessed));
    expect(checkRow(root)).toContain(
      "capsulectl verify reported that your own book's witness time-stamp did not verify",
    );
    expect(root.textContent).not.toContain(NOT_LISTED);
    expect(root.textContent).not.toContain(LINE_NOT_LISTED);
    root.remove();
  });
});

describe("the witness's directory entry on an x-deal-v0 keep copy (#508)", () => {
  const witnessRung = (host: HTMLElement): string =>
    host.querySelector('[data-rung="witness"]')?.textContent ?? "";

  it("names no counterparty key, so only a list that leaves out the holder says so", async () => {
    const cases: [string, Obj, boolean][] = [
      ["an empty list", verified({ independent_of: [] }), true],
      [
        "another key only",
        verified({ independent_of: ["f".repeat(64)] }),
        true,
      ],
      // The holder is listed, and the page cannot know the counterparty's key.
      ["the holder listed", verified({ independent_of: V0_HOLDER }), false],
      ["no directory entry reported", verified(), false],
    ];
    expect(V0_HOLDER).toHaveLength(1);
    for (const [why, witnessed, notListed] of cases) {
      const host = await alone(v0Copy(), v0Report(witnessed));
      const line = witnessRung(host);
      expect(line, why).toContain("Time-stamped by Example Witness at ");
      expect(line.includes(LINE_NOT_LISTED), why).toBe(notListed);
    }
  });

  it("names a failed or withheld witness and says the same of its entry", async () => {
    for (const status of ["failed", "withheld"])
      for (const [list, notListed] of [
        [[], true],
        [V0_HOLDER, false],
      ] as const) {
        const host = await alone(
          v0Copy(),
          v0Report({
            status,
            witness: "Example Witness",
            independent_of: list,
          }),
        );
        const line = witnessRung(host);
        expect(line, status).toContain("from Example Witness");
        expect(line.includes(LINE_NOT_LISTED), status).toBe(notListed);
      }
  });
});
