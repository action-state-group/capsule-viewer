// SPDX-License-Identifier: BSD-3-Clause
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
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

// capsule-viewer#383 (CV0, CV2): a contract report that carries a deal's
// receipt opens it with capsule-viewer's own receipt module, the script
// go/receipt ships, in a real browser, offline. The receipt is a Mesh node's
// keep copy (tests/testdata/receipt/mesh-payer-selected), so the panel shows
// the receipt's top line and says the copy is shared, never PRIVATE
// (Sherlock2, ops bc71ecae). Skipped where there is no Chromium.

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
const data = (...parts: string[]): string =>
  readFileSync(resolve(process.cwd(), "test", "testdata", ...parts), "utf8");

const repo = (...parts: string[]): string =>
  readFileSync(resolve(process.cwd(), "..", ...parts), "utf8");
const MODULE = repo("go", "receipt", "receipt_unilateral.js");
const MANIFEST = JSON.parse(
  repo("go", "receipt", "manifest-unilateral.json"),
) as {
  executable: { script_sha256: string; style_sha256: string[] };
};
const MESH_KEEP = repo(
  "tests",
  "testdata",
  "receipt",
  "mesh-payer-selected.bundle.json",
);
// capsulectl-deal's own keep copy: its report rides standalone in
// x-deal-report/v0, which the page's runtime checks itself (#397).
const DEAL_MODULE = repo("go", "receipt", "receipt_deal.js");
const DEAL_MANIFEST = JSON.parse(
  repo("go", "receipt", "manifest-deal.json"),
) as {
  executable: { script_sha256: string; style_sha256: string[] };
};
// An x-deal-v1 keep copy: the page cannot check its report (#405).
const V1_KEEP = repo("tests", "testdata", "deal-v1", "keep-copy.bundle.json");
const STANDALONE_KEEP = repo(
  "tests",
  "testdata",
  "receipt",
  "main-standalone-keep.bundle.json",
);

/** A Result whose claims are three deals' terms, `d1::req-1` .. `d3::req-3`, opted into contract-report/v1. */
function dealsResult(): Obj {
  const bundle = JSON.parse(data("result-root-bundle.json")) as Obj;
  bundle.extensions = {
    ...((bundle.extensions as Obj | undefined) ?? {}),
    "contract-report/v1": {},
  };
  const doc = ((bundle.disclosures as Obj).result as Obj).agent_input as Obj;
  const rename = (id: string): string =>
    `d${id.slice("claim-".length)}::req-${id.slice("claim-".length)}`;
  for (const claim of doc.claims as Obj[])
    claim.id = rename(claim.id as string);
  const buckets = (doc.aggregate as Obj).buckets as Record<string, string[]>;
  for (const key of Object.keys(buckets))
    buckets[key] = buckets[key]!.map(rename);
  return bundle;
}

describe.skipIf(executablePath === undefined)(
  "a deal line opens capsule-viewer's receipt module on a carried keep copy",
  () => {
    let browser: Browser;
    let runtime = "";
    let directory = "";

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), "aac-viewer-receipts-"));
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

    it("opens the receipt with its top line, as a shared copy, offline and inside the page's CSP", async () => {
      expect(MANIFEST.executable.script_sha256).toBe(hex(MODULE));
      const { bundle } = await sealEvidenceBundle(dealsResult());
      const receipts = { d1: MESH_KEEP, d2: STANDALONE_KEEP, d3: V1_KEEP };
      const html = emitEvidenceGraphHtml(bundle, runtime, {
        coreRuntimeSha256: hex(runtime),
        modules: [
          {
            code: MODULE,
            sha256: hex(MODULE),
            styleSha256: MANIFEST.executable.style_sha256,
          },
          {
            code: DEAL_MODULE,
            sha256: hex(DEAL_MODULE),
            styleSha256: DEAL_MANIFEST.executable.style_sha256,
          },
        ],
        bootstrap: `const RECEIPTS = ${escapeJsonForHtmlScript(JSON.stringify(receipts))}; renderEvidenceGraph(window.__BUNDLE__, document.getElementById("app"), undefined, { depth: 'L2', receipts: RECEIPTS });`,
      });
      const page: Page = await browser.newPage();
      const requests: string[] = [];
      page.on("request", (request) => {
        if (!request.url().startsWith("file:")) requests.push(request.url());
      });
      await page.addInitScript(() => {
        const seen: string[] = [];
        (globalThis as unknown as { __violations: string[] }).__violations =
          seen;
        document.addEventListener("securitypolicyviolation", (event) =>
          seen.push(
            `${event.effectiveDirective} ${event.blockedURI} ${event.sample}`,
          ),
        );
      });
      const file = join(directory, "page.html");
      writeFileSync(file, html);
      try {
        await page.goto(`file://${file}`);
        const claim = '[data-claim-ref^="d1::"]';
        await page.waitForSelector(`${claim} button[data-receipt="open"]`);
        await page.click(`${claim} button[data-receipt="open"]`);
        const drawn = `${claim} [data-receipt-carrier="report"] [data-receipt-module="capsuleviewer.receipt.unilateral/v0"]`;
        await page.waitForSelector(drawn);
        // The receipt's own top line: the verifier's outcome and its checks (R1, #373),
        // verified for this producer-selected copy, never "did not verify".
        const top = await page.textContent(
          `${claim} [data-receipt-carrier="report"] [data-checked="true"]`,
        );
        expect(top).toContain("Checked in this browser by");
        expect(top).toContain("verified");
        expect(top).toContain("interval coverage (not checked)");
        expect(top?.toLowerCase()).not.toContain("did not verify");
        // Shared, not private, in Sherlock2's words.
        expect(await page.$(`${claim} [data-banner="private"]`)).toBeNull();
        expect(
          await page.textContent(`${claim} [data-banner="shared"]`),
        ).toContain("Shared copy The report owner's own record of this deal");
        // A copy whose report is standalone opens too: the page checked the
        // report itself (#397), so a module takes it, never "no viewer".
        const standalone = '[data-claim-ref^="d2::"]';
        await page.click(`${standalone} button[data-receipt="open"]`);
        await page.waitForSelector(
          `${standalone} [data-receipt-carrier="report"] [data-receipt-module="capsuleviewer.receipt.unilateral/v0"]`,
        );
        expect(await page.textContent(standalone)).not.toContain(
          "no viewer for this kind of receipt",
        );
        // An x-deal-v1 copy: the v1 module takes it and draws only the line
        // that this page can't check it, and how to (#405), not "no viewer".
        const v1 = '[data-claim-ref^="d3::"]';
        await page.click(`${v1} button[data-receipt="open"]`);
        const why = `${v1} [data-receipt-carrier="report"] [data-cannot-check-reason="report_rule"]`;
        await page.waitForSelector(why);
        expect(await page.textContent(why)).toContain(
          "This page can't check this receipt",
        );
        expect(await page.textContent(v1)).not.toContain(
          "no viewer for this kind of receipt",
        );
        expect(requests).toEqual([]);
        expect(
          await page.evaluate(
            () =>
              (globalThis as unknown as { __violations: string[] })
                .__violations,
          ),
        ).toEqual([]);
      } finally {
        await page.close();
      }
    });
  },
);
