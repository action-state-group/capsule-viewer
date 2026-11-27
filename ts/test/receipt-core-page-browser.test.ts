// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  emitEvidenceGraphHtml,
  escapeJsonForHtmlScript,
} from "../src/emitter.js";

// The core on a receipt page (capsule-viewer#489) in a real browser: the
// holder's x-deal-v1 keep copy with capsulectl's report, drawn by the page
// runtime and the deal receipt module under the page's CSP. The page settles
// with the module kept (the frame checks a browser runs after render pass),
// nothing is blocked, and the receipt's links to the core's check list open
// it, at L0 where it starts closed and at L2. Skipped where there is no
// Chromium.

const BROWSER_HOOK_TIMEOUT_MS = 60_000;

function browserPath(): string | undefined {
  const candidates = [
    process.env.AAC_CHROMIUM_PATH,
    chromium.executablePath(),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return candidates.find(
    (candidate) =>
      candidate !== undefined && candidate !== "" && existsSync(candidate),
  );
}

const executablePath = browserPath();
const hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");
type Obj = Record<string, unknown>;
const repo = (...parts: string[]): string =>
  readFileSync(resolve(process.cwd(), "..", ...parts), "utf8");
const DEAL_MODULE = repo("go", "receipt", "receipt_deal.js");
const DEAL_MANIFEST = JSON.parse(
  repo("go", "receipt", "manifest-deal.json"),
) as {
  executable: { style_sha256: string[] };
};
const KEEP = JSON.parse(
  repo("tests", "testdata", "deal-v1", "keep-copy.bundle.json"),
) as Obj;
const report = (): Obj => {
  const r = JSON.parse(
    repo("tests", "testdata", "deal-v1", "keep-copy.verify.json"),
  ) as Obj;
  (r["extensions"] as Obj[]).find((e) => e["kind"] === "x-deal-v1")![
    "witnessed"
  ] = { status: "verified", witness: "W", at: "2026-11-25T14:41:19Z" };
  return r;
};

describe.skipIf(executablePath === undefined)(
  "a receipt page's core in a browser (#489)",
  () => {
    let browser: Browser;
    let runtime = "";
    let directory = "";

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), "aac-viewer-receipt-core-"));
      browser = await chromium.launch({ executablePath: executablePath! });
      const result = await build({
        entryPoints: ["src/browser.ts"],
        bundle: true,
        format: "iife",
        globalName: "EvidenceGraph",
        footer: {
          js: "globalThis.renderEvidenceGraph = EvidenceGraph.renderEvidenceGraph;",
        },
        write: false,
      });
      runtime = result.outputFiles[0]!.text;
    }, BROWSER_HOOK_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
      if (directory !== "") rmSync(directory, { recursive: true, force: true });
    }, BROWSER_HOOK_TIMEOUT_MS);

    async function open(depth: "L0" | "L2"): Promise<Page> {
      const html = emitEvidenceGraphHtml(KEEP, runtime, {
        coreRuntimeSha256: hex(runtime),
        modules: [
          {
            code: DEAL_MODULE,
            sha256: hex(DEAL_MODULE),
            styleSha256: DEAL_MANIFEST.executable.style_sha256,
          },
        ],
        bootstrap: `const REPORT = ${escapeJsonForHtmlScript(JSON.stringify(report()))}; window.__drawn = renderEvidenceGraph(window.__BUNDLE__, document.getElementById("app"), undefined, { depth: '${depth}', verifierReport: REPORT });`,
      });
      const page = await browser.newPage();
      await page.addInitScript(() => {
        const seen: string[] = [];
        (globalThis as unknown as { __violations: string[] }).__violations =
          seen;
        document.addEventListener("securitypolicyviolation", (event) =>
          seen.push(`${event.effectiveDirective} ${event.blockedURI}`),
        );
      });
      const file = join(directory, `page-${depth}.html`);
      writeFileSync(file, html);
      await page.goto(`file://${file}`);
      // The render, the settled frame checks included.
      await page.evaluate(
        () => (globalThis as unknown as { __drawn: Promise<void> }).__drawn,
      );
      return page;
    }

    for (const depth of ["L0", "L2"] as const)
      it(`keeps the module, blocks nothing, and its links open the core's list at ${depth}`, async () => {
        const page = await open(depth);
        try {
          expect(await page.$("[data-refusal]")).toBeNull();
          expect(
            await page.$(
              '[data-receipt-module="capsuleviewer.receipt.deal/v1"]',
            ),
          ).not.toBeNull();
          expect(
            await page.evaluate(
              () =>
                (globalThis as unknown as { __violations: string[] })
                  .__violations,
            ),
          ).toEqual([]);
          const isOpen = (): Promise<boolean> =>
            page.$eval(
              "#cv-checked",
              (node) => (node as HTMLDetailsElement).open,
            );
          expect(await isOpen()).toBe(depth === "L2");
          for (const which of ["checks", "witness"]) {
            if (depth === "L0")
              await page.$eval("#cv-checked", (node) => {
                (node as HTMLDetailsElement).open = false;
              });
            await page.click(`a[data-cites-core="${which}"]`);
            expect(await isOpen()).toBe(true);
            // What the link lands on can be read: the core's list and line.
            expect(
              await page.isVisible('#cv-checked [data-checks="capsulectl"]'),
            ).toBe(true);
            expect(
              await page.isVisible('#cv-checked [data-witness="book"]'),
            ).toBe(true);
          }
          expect(
            await page.textContent('[data-witness-notice="book-witnessed"]'),
          ).toContain("Time-stamped by W at ");
        } finally {
          await page.close();
        }
      });
  },
);
