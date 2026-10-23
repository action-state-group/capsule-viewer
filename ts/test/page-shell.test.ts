// SPDX-License-Identifier: BSD-3-Clause
// The page shell every presentation module sits in (capsule-viewer#60): its
// width and padding, the verification pill at the top, and the verification
// page folded into one "How this page was checked" section.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import {
  BANNER_LINES,
  CHECKED_SECTION_TITLE,
  checkedSummaryLine,
  SUMMARY_NOT_VERIFIED,
} from "../src/evidence-graph-view.js";

const dom = new JSDOM();
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

type Obj = Record<string, unknown>;

const bundle = (): Obj =>
  JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "test",
        "testdata",
        "result-root-bundle.sealed.json",
      ),
      "utf8",
    ),
  ) as Obj;

const shell = readFileSync(
  resolve(process.cwd(), "src", "emitter-shell.html"),
  "utf8",
);

async function render(input: Obj): Promise<HTMLElement> {
  const root = document.createElement("main");
  await renderEvidenceGraph(input, root);
  return root;
}

describe("the page shell", () => {
  it("puts a Checked pill above everything else, named with the full verdict", async () => {
    const root = await render(bundle());
    const bar = root.firstElementChild as HTMLElement;
    expect(bar.className).toBe("cv-shell-bar");
    const pill = bar.querySelector<HTMLElement>("[data-verify]")!;
    expect(pill.dataset.verify).toBe("verified");
    expect(pill.className).toBe("cv-pill");
    expect(pill.textContent).toBe(BANNER_LINES.verified);
    expect(pill.getAttribute("role")).toBe("img");
    expect(pill.getAttribute("aria-label")).toBe(BANNER_LINES.verifiedTitle);
    expect(root.querySelector("[data-uncheckpointed-note]")).toBeNull();
  });

  it("says the verification section's counts beside the pill and links down to that section", async () => {
    const root = await render(bundle());
    const bar = root.firstElementChild as HTMLElement;
    const folded =
      root.querySelector<HTMLDetailsElement>("details.cv-checked")!;
    expect(
      bar.querySelector<HTMLElement>("[data-verify-summary]")!.textContent,
    ).toBe("10 of 10 checks passed · 5 records");
    expect(folded.querySelector(":scope > summary")!.textContent).toContain(
      "10 of 10 checks passed · 5 records",
    );
    const link = bar.querySelector<HTMLAnchorElement>("a.cv-shell-link")!;
    expect(link.textContent).toBe(CHECKED_SECTION_TITLE);
    expect(link.getAttribute("href")).toBe(`#${folded.id}`);
    document.body.append(root);
    expect(folded.open).toBe(false);
    link.click();
    expect(folded.open).toBe(true);
    root.remove();
  });

  it("folds the verification page into one closed section whose line keeps the counts in view", async () => {
    const root = await render(bundle());
    const folded = root.querySelector('[data-region="L2-core"]')!
      .firstElementChild as HTMLDetailsElement;
    expect(folded.tagName).toBe("DETAILS");
    expect(folded.open).toBe(false);
    expect(
      folded.querySelector(':scope > [data-page="verification"]'),
    ).not.toBeNull();
    expect(folded.querySelector(":scope > summary")!.textContent).toBe(
      `${CHECKED_SECTION_TITLE} · 10 of 10 checks passed · 5 records`,
    );
  });

  it("opens the section, says Check failed and keeps the refusal for a bundle that did not verify", async () => {
    const edited = JSON.parse(
      JSON.stringify(bundle()).replace(
        '"verdict":"not_met"',
        '"verdict":"met"',
      ),
    ) as Obj;
    const root = await render(edited);
    const pill = root.querySelector<HTMLElement>("[data-verify]")!;
    expect(pill.dataset.verify).toBe("failed");
    expect(pill.textContent).toBe(BANNER_LINES.failed);
    expect(pill.getAttribute("aria-label")).toBe(BANNER_LINES.failedTitle);
    expect(
      root.querySelector('[data-refusal="unverified-bundle"]'),
    ).not.toBeNull();
    // presentation contract section 9.1, I1: no L0 or L1 on a failed bundle
    expect(root.querySelector('[data-region="L0"]')).toBeNull();
    expect(root.querySelector('[data-region="L1"]')).toBeNull();
    const folded = root.querySelector('[data-region="L2-core"]')!
      .firstElementChild as HTMLDetailsElement;
    expect(folded.open).toBe(true);
    // The ten numbered checks pass; the edited disclosure fails on its own.
    expect(folded.querySelector("summary")!.textContent).toBe(
      `${CHECKED_SECTION_TITLE} · 1 check on this page failed · 5 records`,
    );
  });
});

describe("the emitter shell's page styles", () => {
  it("gives every page a width and padding through the theme's own tokens", () => {
    expect(shell).toContain("--aac-page-width: 60rem;");
    expect(shell).toContain("--aac-gutter: 1rem;");
    expect(shell).toContain("padding-block: var(--aac-page-pad-block);");
  });

  it("drops a module's own .cv-page width and padding, and lets a card with its own frame keep it", () => {
    expect(shell).toMatch(
      /#app \.cv-page \{\s*max-width: none;\s*margin: 0;\s*padding: 0;\s*\}/u,
    );
    expect(shell).toMatch(
      /#app\.cv-shell-chrome \{\s*max-width: none;\s*padding: 0;\s*\}/u,
    );
  });

  it("colours the pill and the section from the theme's tokens", () => {
    expect(shell).toMatch(
      /:where\(\.cv-pill\[data-verify="verified"\]\) \{\s*color: var\(--aac-ok\);\s*background: var\(--aac-ok-bg\);/u,
    );
    expect(shell).toMatch(
      /:where\(details\.cv-checked\) \{[^}]*border-top: 1px solid var\(--aac-line\);/u,
    );
  });

  it("is the Go emitter's shell byte for byte", () => {
    expect(
      readFileSync(
        resolve(process.cwd(), "..", "go", "emitter", "shell.html"),
        "utf8",
      ),
    ).toBe(shell);
  });
});

describe("checkedSummaryLine", () => {
  const checks = (pass: number, fail = 0) => [
    ...Array.from({ length: pass }, () => ({ status: "pass" })),
    ...Array.from({ length: fail }, () => ({ status: "fail" })),
  ];

  it("counts the checks and records and names the signatures not checked", () => {
    expect(
      checkedSummaryLine(true, {
        checks: checks(10),
        records: [1, 2, 3, 4, 5, 6, 7],
        checkLists: {
          failed: [],
          notChecked: ["checkpoint-signature", "producer-signatures"],
        },
      }),
    ).toBe("10 of 10 checks passed · 7 records · signatures not checked here");
  });

  it("says how many of the numbered checks did not run, so none reads as failed", () => {
    expect(
      checkedSummaryLine(true, {
        checks: [
          ...checks(8),
          { status: "withheld" },
          { status: "not_checked" },
        ],
        records: [1, 2],
        checkLists: { failed: [], notChecked: [] },
      }),
    ).toBe("8 of 10 checks passed, 2 not run · 2 records");
  });

  it("says one record, and counts other checks not run here", () => {
    expect(
      checkedSummaryLine(true, {
        checks: checks(10),
        records: [1],
        checkLists: { failed: [], notChecked: ["witness-receipts"] },
      }),
    ).toBe("10 of 10 checks passed · 1 record · 1 other check not run here");
  });

  it("leads with what failed, and never says passed for a bundle that did not verify", () => {
    expect(
      checkedSummaryLine(false, {
        checks: checks(8, 2),
        records: [1, 2],
        checkLists: { failed: ["closure"], notChecked: [] },
      }),
    ).toBe("2 of 10 checks failed · 2 records");
    expect(
      checkedSummaryLine(false, {
        checks: checks(10),
        records: [1, 2],
        checkLists: {
          failed: ["disclosures", "countersignatures"],
          notChecked: [],
        },
      }),
    ).toBe("2 checks on this page failed · 2 records");
    // Both kinds of failure are named.
    expect(
      checkedSummaryLine(false, {
        checks: checks(8, 2),
        records: [1, 2],
        checkLists: { failed: ["disclosures"], notChecked: [] },
      }),
    ).toBe("2 of 10 checks failed · 1 check on this page failed · 2 records");
    // A page-list failure on a numbered check's ground is counted once.
    expect(
      checkedSummaryLine(false, {
        checks: checks(8, 2),
        records: [1, 2],
        checkLists: { failed: ["closure", "disclosures"], notChecked: [] },
      }),
    ).toBe("2 of 10 checks failed · 1 check on this page failed · 2 records");
    // Checks that did not run are said with a failure too.
    expect(
      checkedSummaryLine(false, {
        checks: [
          ...checks(7, 1),
          { status: "withheld" },
          { status: "withheld" },
        ],
        records: [1, 2],
        checkLists: { failed: [], notChecked: [] },
      }),
    ).toBe("1 of 10 checks failed, 2 not run · 2 records");
    expect(
      checkedSummaryLine(false, {
        checks: [...checks(8), { status: "withheld" }, { status: "withheld" }],
        records: [1, 2],
        checkLists: { failed: [], notChecked: [] },
      }),
    ).toBe(`${SUMMARY_NOT_VERIFIED} · 2 of 10 checks not run · 2 records`);
    // A failure outside both counts (a provenance error, say).
    expect(
      checkedSummaryLine(false, {
        checks: checks(10),
        records: [1, 2],
        checkLists: { failed: [], notChecked: [] },
      }),
    ).toBe(`${SUMMARY_NOT_VERIFIED} · 2 records`);
  });
});
