// SPDX-License-Identifier: BSD-3-Clause
// The page shell every presentation module sits in (capsule-viewer#60): its
// width and padding, the verification pill at the top, and the verification
// page folded into one "How this page was checked" section.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import { CORE_RUNTIME_STYLES } from "../src/emitter.js";
import {
  BANNER_LINES,
  CHECKED_SECTION_TITLE,
  checkedSummaryLine,
} from "../src/evidence-graph-view.js";
import { SHELL_CSS } from "../src/shell-styles.js";

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

async function render(input: Obj): Promise<HTMLElement> {
  const root = document.createElement("main");
  await renderEvidenceGraph(input, root);
  return root;
}

describe("the page shell", () => {
  it("pads every page and puts a Checked pill above everything else", async () => {
    const root = await render(bundle());
    expect(root.classList.contains("cv-shell")).toBe(true);
    const style = root.firstElementChild!;
    expect(style.tagName).toBe("STYLE");
    expect(style.textContent).toBe(SHELL_CSS);
    const bar = style.nextElementSibling as HTMLElement;
    expect(bar.className).toBe("cv-shell-bar");
    const pill = bar.querySelector<HTMLElement>("[data-verify]")!;
    expect(pill.dataset.verify).toBe("verified");
    expect(pill.textContent).toBe(BANNER_LINES.verified);
    expect(pill.getAttribute("aria-label")).toBe(BANNER_LINES.verifiedTitle);
    expect(root.querySelector("[data-uncheckpointed-note]")).toBeNull();
  });

  it("folds the verification page into one closed section whose line keeps the caveat in view", async () => {
    const root = await render(bundle());
    const folded = root.lastElementChild as HTMLDetailsElement;
    expect(folded.tagName).toBe("DETAILS");
    expect(folded.open).toBe(false);
    expect(
      folded.querySelector(':scope > [data-page="verification"]'),
    ).not.toBeNull();
    const summary = folded.querySelector(":scope > summary")!.textContent!;
    expect(summary.startsWith(`${CHECKED_SECTION_TITLE} · `)).toBe(true);
    expect(summary).toBe(
      `${CHECKED_SECTION_TITLE} · 10 of 10 checks passed · 5 records`,
    );
  });

  it("opens the section, says Not verified and keeps the refusal for a bundle that did not verify", async () => {
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
    const folded = root.lastElementChild as HTMLDetailsElement;
    expect(folded.open).toBe(true);
    // The ten numbered checks pass; the edited disclosure fails on its own.
    expect(folded.querySelector("summary")!.textContent).toBe(
      `${CHECKED_SECTION_TITLE} · 1 check on this page failed · 5 records`,
    );
  });

  it("drops a module's own .cv-page width and padding inside it, and lists its stylesheet in the CSP", () => {
    expect(SHELL_CSS).toContain(
      ".cv-shell .cv-page{max-width:none;margin:0;padding:0}",
    );
    expect(SHELL_CSS).toContain(
      ".cv-shell.cv-shell-chrome{max-width:none;padding:0}",
    );
    expect(CORE_RUNTIME_STYLES).toContain(SHELL_CSS);
  });
});

describe("checkedSummaryLine", () => {
  const checks = (pass: number, fail = 0) => [
    ...Array.from({ length: pass }, () => ({ status: "pass" })),
    ...Array.from({ length: fail }, () => ({ status: "fail" })),
  ];

  it("counts the checks and records and names the signatures not checked", () => {
    expect(
      checkedSummaryLine({
        checks: checks(10),
        records: [1, 2, 3, 4, 5, 6, 7],
        checkLists: {
          failed: [],
          notChecked: ["checkpoint-signature", "producer-signatures"],
        },
      }),
    ).toBe("10 of 10 checks passed · 7 records · signatures not checked here");
  });

  it("says one record, and counts other checks not run here", () => {
    expect(
      checkedSummaryLine({
        checks: checks(10),
        records: [1],
        checkLists: { failed: [], notChecked: ["witness-receipts"] },
      }),
    ).toBe("10 of 10 checks passed · 1 record · 1 other check not run here");
  });

  it("leads with the failed count when a check failed, and adds nothing when everything ran", () => {
    expect(
      checkedSummaryLine({
        checks: checks(10),
        records: [1, 2],
        checkLists: { failed: ["disclosures", "closure"], notChecked: [] },
      }),
    ).toBe("2 checks on this page failed · 2 records");
    expect(
      checkedSummaryLine({
        checks: checks(8, 2),
        records: [1, 2],
        checkLists: { failed: ["closure"], notChecked: [] },
      }),
    ).toBe("2 of 10 checks failed · 2 records");
  });
});
