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

// capsule-viewer#228: a contract report whose claims are deals opens the 9b
// receipt module from each deal line, in a real browser, offline, over the
// receipt bundle the page carries for that deal. The module is evidencebook's
// own `capsulectl.deal-view-composed/v0` script as shipped (vendored byte for
// byte in test/testdata/deal-receipt, see its README) and the receipts are
// compositions the Mesh capsules plugin built, so the page runs the real
// module on real plugin output, not a stand-in. Like the other *-browser
// tests, it is skipped where there is no Chromium.

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

// The deal view's stylesheet pin, from its manifest (style_sha256).
const DEAL_VIEW_STYLE_SHA256 = (
  JSON.parse(data("deal-receipt", "deal-view-composed.manifest.json")) as {
    executable: { style_sha256: string[] };
  }
).executable.style_sha256[0]!;

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
  "a deal line opens the receipt module on the receipt the page carries",
  () => {
    let browser: Browser;
    let runtime = "";
    let directory = "";
    let count = 0;

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), "aac-receipts-"));
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

    /** The offline page for the deals Result with `receipts` and the deal-view module. */
    async function open(
      receipts: Record<string, string> | undefined,
    ): Promise<{ page: Page; requests: string[]; violations: string[] }> {
      const { bundle } = await sealEvidenceBundle(dealsResult());
      const module = data("deal-receipt", "deal-view.js");
      const options =
        receipts === undefined
          ? "{ depth: 'L2' }"
          : "{ depth: 'L2', receipts: RECEIPTS }";
      const html = emitEvidenceGraphHtml(bundle, runtime, {
        coreRuntimeSha256: hex(runtime),
        modules: [
          {
            code: module,
            sha256: hex(module),
            styleSha256: [DEAL_VIEW_STYLE_SHA256],
          },
        ],
        bootstrap: `const RECEIPTS = ${escapeJsonForHtmlScript(JSON.stringify(receipts ?? {}))}; renderEvidenceGraph(window.__BUNDLE__, document.getElementById("app"), undefined, ${options});`,
      });
      const page = await browser.newPage();
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
      const file = join(directory, `page-${count++}.html`);
      writeFileSync(file, html);
      await page.goto(`file://${file}`);
      await page.waitForSelector('[data-claim-ref="d1::req-1"]');
      const violations = await page.evaluate(
        () =>
          (globalThis as unknown as { __violations: string[] }).__violations,
      );
      return { page, requests, violations };
    }

    const violationsOf = (page: Page): Promise<string[]> =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __violations: string[] }).__violations,
      );

    const receiptsOf = (): Record<string, string> => ({
      d1: data("deal-receipt", "composition-artifact.json"),
      d2: data("deal-receipt", "composition-absence.json"),
      // d3 is not carried
    });

    it("opens stamped by both, your receipt only, and says a deal's receipt is not carried, offline", async () => {
      const { page, requests } = await open(receiptsOf());
      try {
        const claim = (deal: string): string => `[data-claim-ref^="${deal}::"]`;
        // d3's receipt is not carried: the line says so and offers no control.
        expect(
          await page.textContent(`${claim("d3")} [data-receipt="not-carried"]`),
        ).toBe("Receipt not carried with this page.");
        expect(await page.$(`${claim("d3")} button[data-receipt]`)).toBeNull();

        // d1: the other half came back.
        await page.click(`${claim("d1")} button[data-receipt="open"]`);
        await page.waitForSelector(`${claim("d1")} .rcpt-panel .deal-banner`);
        expect(
          await page.textContent(`${claim("d1")} .rcpt-panel .deal-banner`),
        ).toContain("Stamped by both sides");

        // d2: nothing came back from the other side.
        await page.click(`${claim("d2")} button[data-receipt="open"]`);
        await page.waitForSelector(`${claim("d2")} .rcpt-panel .deal-banner`);
        expect(
          await page.textContent(`${claim("d2")} .rcpt-panel .deal-banner`),
        ).toContain("Your receipt only");

        // Each receipt is drawn under its own claim only.
        expect(await page.$$(".rcpt-panel .deal-banner")).toHaveLength(2);
        // Both verification links reach their own section: the page's, and
        // each receipt's, never the first one in the document.
        const ids = await page.$$eval("details[data-checked]", (nodes) =>
          nodes.map((node) => node.id),
        );
        expect(new Set(ids).size).toBe(ids.length);
        const links = await page.$$eval("a.cv-shell-link", (nodes) =>
          nodes.map((node) => node.getAttribute("href")),
        );
        // One banner link per render (the page, and each opened receipt), and
        // each reaches a section of its own that exists.
        expect(links).toHaveLength(3);
        expect(new Set(links).size).toBe(3);
        for (const link of links) expect(await page.$(link!)).not.toBeNull();
        // The page's own link opens the page's section, not a receipt's.
        await page.click("#app > .cv-shell-bar a.cv-shell-link");
        const opened = await page.$$eval("details[data-checked]", (nodes) =>
          nodes
            .filter((node) => (node as HTMLDetailsElement).open)
            .map((node) => node.id),
        );
        expect(opened).toContain("cv-checked");
        expect(requests).toEqual([]);
        // The receipt module's stylesheet and the nested render's own are
        // listed in the page's CSP: nothing was blocked while both drew.
        expect(await violationsOf(page)).toEqual([]);
      } finally {
        await page.close();
      }
    });

    it("draws a receipt line only on a page that carries receipts, and no request or CSP violation", async () => {
      const { page, violations, requests } = await open(undefined);
      try {
        expect(await page.$$(".rcpt")).toHaveLength(0);
        expect(violations).toEqual([]);
        expect(requests).toEqual([]);
      } finally {
        await page.close();
      }
    });

    it("says why a receipt that is not a receipt cannot open, and leaves the report alone", async () => {
      const { page } = await open({
        d1: "this is not json",
        d2: data("deal-receipt", "composition-absence.json"),
        d3: JSON.stringify({ bundle_kind: "evidence-bundle/v2" }),
      });
      try {
        await page.click(
          '[data-claim-ref^="d1::"] button[data-receipt="open"]',
        );
        await page.waitForSelector('[data-claim-ref^="d1::"] .rcpt-panel p');
        expect(
          await page.textContent('[data-claim-ref^="d1::"] .rcpt-panel'),
        ).toBe(
          "This receipt could not be read, so it is not shown. The rest of the report is unchanged.",
        );
        await page.click(
          '[data-claim-ref^="d3::"] button[data-receipt="open"]',
        );
        await page.waitForSelector('[data-claim-ref^="d3::"] .rcpt-panel p');
        expect(
          await page.textContent('[data-claim-ref^="d3::"] .rcpt-panel'),
        ).toBe(
          "This receipt did not pass its checks, so it is not shown. The rest of the report is unchanged.",
        );
        // The other deal still opens, and the report's own rows are still there.
        await page.click(
          '[data-claim-ref^="d2::"] button[data-receipt="open"]',
        );
        await page.waitForSelector(
          '[data-claim-ref^="d2::"] .rcpt-panel .deal-banner',
        );
        expect(await page.$$("[data-claim-ref]")).toHaveLength(3);
      } finally {
        await page.close();
      }
    });
    it("opens the single x-deal-v0 receipt with the real deal view, and a refusal composition, with nothing blocked", async () => {
      const { page } = await open({
        d1: data("deal-receipt", "unilateral-bundle.json"),
        d2: data("deal-receipt", "composition-refusal.json"),
      });
      try {
        await page.click(
          '[data-claim-ref^="d1::"] button[data-receipt="open"]',
        );
        await page.waitForSelector(
          '[data-claim-ref^="d1::"] .rcpt-panel .deal-banner, [data-claim-ref^="d1::"] .rcpt-panel[data-receipt-state]:not([data-receipt-state="opened"])',
        );
        expect(
          await page.getAttribute(
            '[data-claim-ref^="d1::"] .rcpt-panel',
            "data-receipt-state",
          ),
        ).toBe("opened");
        expect(
          await page.$('[data-claim-ref^="d1::"] .rcpt-panel .deal-banner'),
        ).not.toBeNull();
        await page.click(
          '[data-claim-ref^="d2::"] button[data-receipt="open"]',
        );
        await page.waitForSelector(
          '[data-claim-ref^="d2::"] .rcpt-panel .deal-banner',
        );
        expect(
          await page.textContent(
            '[data-claim-ref^="d2::"] .rcpt-panel .deal-banner',
          ),
        ).toContain("Your receipt only");
        expect(await violationsOf(page)).toEqual([]);
      } finally {
        await page.close();
      }
    });
  },
);
