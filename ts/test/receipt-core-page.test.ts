// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// The core on a receipt page (capsule-viewer#489, row 3 of section 7 of
// docs/design/receipt-view-model.md): one check list, drawn by the core,
// with capsulectl's answers in it and attributed; the one witness line the
// core's; the ladder once per page; the receipt pack's record words; the
// checked section as a card; and no record time on a copy made for someone
// else (#482, Sherlock2's u239). A page with no receipt module is unchanged.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPresentationRegistry,
  renderEvidenceGraph,
} from "../src/evidence-graph-view.js";
import { receiptModules, renderReceipt } from "../src/receipt.js";
import {
  DEFAULT_PACKS,
  readWordingPack,
} from "../src/contract-report-wording.js";
import { RECEIPT_RECORD_PACK } from "../src/receipt-core-words.generated.js";

type Obj = Record<string, unknown>;
const data = (name: string): string =>
  readFileSync(
    resolve(process.cwd(), "..", "tests", "testdata", "deal-v1", name),
    "utf8",
  );
const json = (name: string): Obj => JSON.parse(data(name)) as Obj;
const v1Entry = (report: Obj): Obj =>
  (report["extensions"] as Obj[]).find((e) => e["kind"] === "x-deal-v1")!;
const withWitness = (report: Obj, witnessed: unknown): Obj => {
  v1Entry(report)["witnessed"] = witnessed;
  return report;
};
const VERIFIED = {
  status: "verified",
  witness: "W",
  at: "2026-11-25T14:41:19Z",
};

async function page(
  copy: string,
  report: Obj | undefined,
  options: { depth?: "L0" | "L2"; carrier?: "page" | "report" } = {},
): Promise<HTMLElement> {
  const registry = createPresentationRegistry();
  for (const module of receiptModules()) registry.register(module);
  const root = document.createElement("main");
  if (options.carrier !== undefined) {
    const carrier = document.createElement("div");
    carrier.setAttribute("data-receipt-carrier", options.carrier);
    carrier.append(root);
    document.body.append(carrier);
  } else document.body.append(root);
  await renderEvidenceGraph(json(`${copy}.bundle.json`), root, undefined, {
    depth: options.depth ?? "L2",
    registry,
    ...(report === undefined ? {} : { verifierReport: report }),
  });
  return root;
}
const core = (root: HTMLElement): HTMLElement =>
  root.querySelector<HTMLElement>('[data-region="L2-core"]')!;
const headings = (node: ParentNode): (string | null)[] =>
  [...node.querySelectorAll("h4")].map((h) => h.textContent);

describe("one check list, drawn by the core, on a receipt page", () => {
  it("lists capsulectl's answers beside the page's own, each attributed, and no second list", async () => {
    const root = await page("keep-copy", json("keep-copy.verify.json"));
    const section = core(root);
    expect(headings(section)).not.toContain("The ten checks");
    expect(headings(section)).toContain("Checked on this page");
    expect(headings(section)).toContain("Reported by capsulectl verify");
    const rows = [
      ...section.querySelectorAll<HTMLElement>('[data-checks="capsulectl"] li'),
    ];
    expect(rows.map((r) => r.dataset.check)).toEqual([
      "capsulectl-producer_signatures",
      "capsulectl-interval_coverage",
      "capsulectl-graph_closure",
      "capsulectl-per_record_membership",
      "capsulectl-checkpoint",
      "capsulectl-witnesses",
    ]);
    expect(rows[0]!.textContent).toBe(
      "Signed by the agent's device: passed, as capsulectl verify reported it. This page also ran this check itself, in the list above.",
    );
    // A test the page does not run says so.
    expect(rows[5]!.textContent).toBe(
      "Witness time stamp: not run on this copy, as capsulectl verify reported it. This page did not run this check.",
    );
    // The module draws no list of its own: its panel cites the core's.
    expect(root.querySelector(".cv-rcpt-proof")).toBeNull();
    expect(root.querySelector('[data-cv="verification-details"]')).toBeNull();
    const cite = root.querySelector<HTMLAnchorElement>(
      'a[data-cites-core="checks"]',
    );
    expect(cite?.getAttribute("href")).toBe("#cv-checked");
    expect(cite?.textContent).toBe(
      "Each check, and whether capsulectl verify or this page ran it, is listed under “How this page was checked”.",
    );
    // The panel's own summary stays, and so does the banner's count, which
    // is the section's.
    expect(root.querySelector("[data-proof]")?.getAttribute("data-proof")).toBe(
      "passed",
    );
    const summary = root.querySelector("[data-verify-summary]")?.textContent;
    expect(summary).toBe("10 of 10 checks passed · 1 top-level record");
    expect(
      root.querySelector("details[data-checked] > summary")?.textContent,
    ).toContain(summary!);
  });

  it("the module's link opens the core's list", async () => {
    const root = await page("keep-copy", json("keep-copy.verify.json"), {
      depth: "L0",
    });
    const checked = root.querySelector<HTMLDetailsElement>("#cv-checked")!;
    expect(checked.open).toBe(false);
    root.querySelector<HTMLElement>('a[data-cites-core="checks"]')!.click();
    expect(checked.open).toBe(true);
  });

  it("with no report, the core lists only its own checks", async () => {
    const root = await page("keep-copy", undefined);
    const section = core(root);
    expect(section.querySelector('[data-checks="capsulectl"]')).toBeNull();
    expect(section.querySelector('[data-checks="page"]')).not.toBeNull();
    // An x-deal-v1 copy with no report: the module says it can't check it (#405).
    expect(
      root.querySelector('[data-cannot-check-reason="report_rule"]'),
    ).not.toBeNull();
  });

  it("a receipt drawn on its own, with no core, keeps its own list", async () => {
    const host = document.createElement("div");
    await renderReceipt(json("keep-copy.bundle.json"), host, {
      verifierReport: json("keep-copy.verify.json"),
      depth: "L2",
    });
    expect(host.querySelectorAll(".cv-rcpt-proof li")).toHaveLength(6);
    expect(host.querySelector("[data-cites-core]")).toBeNull();
    expect(host.querySelector('[data-rung="witness"]')).not.toBeNull();
  });
});

describe("the one witness line is the core's", () => {
  it("verified: under the banner and in the list, no self-witnessed line, and the stamp links to it", async () => {
    const root = await page(
      "keep-copy",
      withWitness(json("keep-copy.verify.json"), VERIFIED),
    );
    expect(
      root.querySelector('[data-witness-notice="book-witnessed"]')?.textContent,
    ).toContain("Time-stamped by W at ");
    const section = core(root);
    expect(section.querySelector('[data-witness="self"]')).toBeNull();
    // Said once in L2, as its row in the check list (Codex, #493).
    const said = (text: string): number =>
      [...section.querySelectorAll("p, li")].filter((n) =>
        n.textContent?.includes(text),
      ).length;
    expect(said("Time-stamped by W at ")).toBe(1);
    expect(
      section
        .querySelector('[data-check="capsulectl-witnesses"]')
        ?.getAttribute("data-check-status"),
    ).toBe("pass");
    const stamp = root.querySelector('[data-stamp="time_stamped"]')!;
    expect(stamp.getAttribute("data-stamp-state")).toBe("filled");
    expect(
      stamp.querySelector('a[data-cites-core="witness"]')?.getAttribute("href"),
    ).toBe("#cv-checked");
    // One line on the page says the time-stamp, plus its row in the list.
    expect(root.querySelector('[data-rung="witness"]')).toBeNull();
  });

  it("failed and withheld are said in capsulectl's voice, and the stamp and the list agree", async () => {
    for (const [witnessed, stampState, rowStatus, line] of [
      [
        { status: "failed", reason: "x" },
        "failed",
        "fail",
        "capsulectl verify reported that your own book's witness time-stamp did not verify",
      ],
      [
        { status: "withheld" },
        "open",
        "withheld",
        "capsulectl verify found no time-stamp for your own book",
      ],
    ] as const) {
      const root = await page(
        "keep-copy",
        withWitness(json("keep-copy.verify.json"), witnessed),
      );
      const section = core(root);
      const row = section.querySelector('[data-check="capsulectl-witnesses"]');
      expect(row?.textContent).toContain(line);
      // Said once in L2 (Codex, #493).
      expect(
        [...section.querySelectorAll("p, li")].filter((n) =>
          n.textContent?.includes(line),
        ),
      ).toHaveLength(1);
      expect(section.querySelector('[data-witness="self"]')).not.toBeNull();
      expect(
        section
          .querySelector('[data-check="capsulectl-witnesses"]')
          ?.getAttribute("data-check-status"),
      ).toBe(rowStatus);
      expect(
        root
          .querySelector('[data-stamp="time_stamped"]')
          ?.getAttribute("data-stamp-state"),
      ).toBe(stampState);
      expect(
        root.querySelector('[data-witness-notice="book-witnessed"]'),
      ).toBeNull();
    }
  });

  it("malformed or absent: no book line, the file's notice under the banner", async () => {
    for (const witnessed of [
      undefined,
      { status: "verified", witness: "W" },
      { status: "verified", witness: "W", at: "t" },
      { status: "other" },
    ]) {
      const report = json("keep-copy.verify.json");
      if (witnessed !== undefined) withWitness(report, witnessed);
      const root = await page("keep-copy", report);
      expect(
        root.querySelector('[data-check="capsulectl-witnesses"] [data-time]'),
      ).toBeNull();
      expect(root.textContent).not.toContain("your own book");
      expect(
        root.querySelector('[data-witness-notice="file-no-receipt"]'),
      ).not.toBeNull();
      expect(root.textContent).not.toContain("Time-stamped by");
    }
  });

  it("a keep copy shown as a page or in a report never shows the holder's time", async () => {
    for (const carrier of ["page", "report"] as const) {
      const root = await page(
        "keep-copy",
        withWitness(json("keep-copy.verify.json"), VERIFIED),
        { carrier },
      );
      expect(
        root.querySelector('[data-check="capsulectl-witnesses"] [data-time]'),
      ).toBeNull();
      expect(root.textContent).not.toContain("your own book");
      expect(root.textContent).not.toContain("Time-stamped by");
    }
  });

  it("a counterparty's copy never shows a witness time", async () => {
    const root = await page(
      "counterparty-copy",
      withWitness(json("counterparty-copy.verify.json"), VERIFIED),
    );
    expect(
      root.querySelector('[data-check="capsulectl-witnesses"] [data-time]'),
    ).toBeNull();
    expect(root.textContent).not.toContain("your own book");
    expect(root.textContent).not.toContain("Time-stamped by");
  });
});

describe("the ladder once per page, in the receipt pack's words", () => {
  it("one ladder over every record, none in a record's own view", async () => {
    const root = await page(
      "counterparty-copy",
      json("counterparty-copy.verify.json"),
    );
    for (const d of root.querySelectorAll("details")) {
      (d as HTMLDetailsElement).open = true;
      d.dispatchEvent(new Event("toggle"));
    }
    const ladders = root.querySelectorAll('[data-l3="ladder"]');
    expect(ladders).toHaveLength(1);
    expect(ladders[0]!.closest("[data-page-ladder]")).not.toBeNull();
    expect(root.querySelectorAll('[data-l3="foot"]')).toHaveLength(1);
    const records = root.querySelectorAll("[data-record-page]");
    expect(records.length).toBeGreaterThan(1);
    for (const record of records)
      expect(record.querySelector('[data-l3="ladder"]')).toBeNull();
    const n = records.length;
    const rung1 = ladders[0]!.querySelector('[data-rung="1"]')!;
    expect(rung1.textContent).toContain(`PASS ${n} of ${n} records`);
  });

  it("keeps each rung's own note, with the records it is about", async () => {
    const root = await page(
      "counterparty-copy",
      json("counterparty-copy.verify.json"),
    );
    const ladder = root.querySelector("[data-page-ladder]")!;
    // Rung 2 notes how many committed members each record disclosed; rung 6
    // why this page does not run it.
    expect(
      ladder.querySelectorAll('[data-rung="2"] [data-rung-note]').length,
    ).toBeGreaterThan(0);
    expect(
      ladder.querySelector('[data-rung="6"] [data-rung-note]')?.textContent,
    ).toBe(
      "this page does not run it: a bundle carries no earlier head to compare against",
    );
  });

  it("says no contract report's Result words on a receipt", async () => {
    const root = await page("keep-copy", json("keep-copy.verify.json"));
    const text = root.textContent ?? "";
    expect(text).not.toContain("record of the month");
    expect(text).not.toContain("the other party's signature over the Result");
    // One name for the witness check on the page: the module's proof rows
    // are not drawn beside the core, and since #494 they use its noun too.
    expect(text).not.toContain("Outside time stamp");
    expect(text).toContain("Witness time stamp");
    const rung11 = root.querySelector('[data-l3="ladder"] [data-rung="11"]')!;
    expect(rung11.textContent).toContain(
      "a countersigner's signature over this file",
    );
    expect(rung11.textContent).toContain(
      "A countersigner also signed this file's records; the COUNTERSIGNED stamp names it, and says so when the directory does not list it as independent of the parties. Not: that it checked any term.",
    );
  });

  it("the receipt pack's record words are generic record keys, with the same placeholders", () => {
    const pack = readWordingPack(JSON.parse(RECEIPT_RECORD_PACK.pack));
    const generic = DEFAULT_PACKS.generic.entries;
    const slots = (text: string): string[] =>
      [...text.matchAll(/\{(\w+)\}/gu)].map((m) => m[1]!).sort();
    expect(Object.keys(pack.entries).length).toBeGreaterThan(0);
    for (const [key, text] of Object.entries(pack.entries)) {
      expect(Object.hasOwn(generic, key), key).toBe(true);
      expect(slots(text), key).toEqual(slots(generic[key]!));
    }
  });

  it("the checked section is a card", async () => {
    const root = await page("keep-copy", json("keep-copy.verify.json"));
    expect(root.querySelector("#cv-checked")?.classList).toContain(
      "cv-checked--card",
    );
  });
});

describe("no record time on a copy made for someone else (#482, u239)", () => {
  // Every record time the counterparty copy's records carry.
  const times = (): string[] => {
    const out = new Set<string>();
    const walk = (value: unknown): void => {
      if (typeof value === "string") {
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/u.test(value))
          out.add(value);
      } else if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object")
        Object.values(value).forEach(walk);
    };
    const bundle = json("counterparty-copy.bundle.json");
    walk(bundle["records"]);
    walk(bundle["disclosures"]);
    return [...out];
  };

  it("the core's record views show none, and say why", async () => {
    const root = await page(
      "counterparty-copy",
      json("counterparty-copy.verify.json"),
    );
    // Open every lazily built record body.
    for (const d of root.querySelectorAll("details")) {
      (d as HTMLDetailsElement).open = true;
      d.dispatchEvent(new Event("toggle"));
    }
    const text = core(root).textContent ?? "";
    const found = times();
    expect(found.length).toBeGreaterThan(0);
    for (const time of found) expect(text).not.toContain(time);
    expect(text).not.toContain('"timestamp"');
    expect(text).not.toContain("seal time");
    expect(
      core(root).querySelector('[data-times="withheld"]')?.textContent,
    ).toBe(
      "Record times are shown only on the holder's own copy. This copy was made for someone else, so the record views here leave them out.",
    );
    expect(core(root).querySelector('[data-exact="as-parsed"]')).toBeNull();
    // The digest check is said of the content as recorded, never of the
    // content shown without its times (Codex, #493).
    expect(text).not.toContain(
      "The content shown matches the digest the record commits to.",
    );
    const said = core(root).querySelectorAll(
      '[data-content-check="digest-times-withheld"]',
    );
    expect(said.length).toBeGreaterThan(0);
    for (const line of said)
      expect(line.textContent).toBe(
        "The content as recorded matches the digest the record commits to. It is shown here with its record times left out, so what is shown is not exactly what the digest covers.",
      );
    expect(
      core(root).querySelector('[data-exact="times-withheld"]'),
    ).not.toBeNull();
  });

  it("the holder's own copy keeps them", async () => {
    const root = await page("keep-copy", json("keep-copy.verify.json"));
    for (const d of root.querySelectorAll("details")) {
      (d as HTMLDetailsElement).open = true;
      d.dispatchEvent(new Event("toggle"));
    }
    expect(core(root).textContent).toContain("seal time");
    expect(core(root).querySelector('[data-times="withheld"]')).toBeNull();
  });
});

describe("a page with no receipt module is unchanged", () => {
  it("keeps the ten checks, a ladder in each record view, and no card", async () => {
    const root = document.createElement("main");
    document.body.append(root);
    // The default registry carries no receipt module.
    await renderEvidenceGraph(
      json("counterparty-copy.bundle.json"),
      root,
      undefined,
      { depth: "L2", verifierReport: json("counterparty-copy.verify.json") },
    );
    for (const d of root.querySelectorAll("details")) {
      (d as HTMLDetailsElement).open = true;
      d.dispatchEvent(new Event("toggle"));
    }
    expect(headings(root)).toContain("The ten checks");
    expect(root.querySelector("[data-page-ladder]")).toBeNull();
    const records = root.querySelectorAll("[data-record-page]");
    expect(records.length).toBeGreaterThan(0);
    for (const record of records)
      expect(record.querySelector('[data-l3="ladder"]')).not.toBeNull();
    expect(root.querySelector(".cv-checked--card")).toBeNull();
    expect(root.querySelector('[data-checks="capsulectl"]')).toBeNull();
    expect(
      root
        .querySelector('[data-region="L2-core"]')
        ?.hasAttribute("data-checked-id"),
    ).toBe(false);
  });
});

describe("every receipt kind this viewer ships takes the core's receipt page", () => {
  it("a provider receipt too (Codex, #493)", async () => {
    const receipt = (name: string): Obj =>
      JSON.parse(
        readFileSync(
          resolve(process.cwd(), "..", "tests", "testdata", "receipt", name),
          "utf8",
        ),
      ) as Obj;
    const registry = createPresentationRegistry();
    for (const module of receiptModules()) registry.register(module);
    const root = document.createElement("main");
    document.body.append(root);
    await renderEvidenceGraph(
      receipt("mesh-provider-selected.bundle.json"),
      root,
      undefined,
      {
        depth: "L2",
        // The provider receipt is drawn for its holder only.
        audience: "keep",
        registry,
        verifierReport: receipt("mesh-provider-selected.verify.json"),
      },
    );
    expect(
      root.querySelector(
        '[data-receipt-module="capsuleviewer.receipt.provider/v0"]',
      ),
    ).not.toBeNull();
    expect(headings(root)).not.toContain("The ten checks");
    expect(root.querySelector("[data-page-ladder]")).not.toBeNull();
    expect(root.querySelector("#cv-checked")?.classList).toContain(
      "cv-checked--card",
    );
    expect(root.textContent).not.toContain("record of the month");
  });
});
