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
import { JSDOM } from "jsdom";
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPresentation } from "../src/presentation-builder.js";

/**
 * The embedded snippet under a strict host CSP built from nothing but the
 * sources the builder returns: no 'unsafe-inline', no inline handlers. It
 * renders with no violation, the returned sources are exactly the hashes
 * of what runs and what the runtime inserts, and dropping one is enforced.
 */

const BROWSER_HOOK_TIMEOUT_MS = 60_000;

// As emitter-csp-browser.test.ts: AAC_CHROMIUM_PATH, then Playwright's own
// Chromium, then a system Chrome; skipped when none is installed.
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
const hashSource = (value: string): string =>
  `'sha256-${createHash("sha256").update(value, "utf8").digest("base64")}'`;

// buildPresentation's embedded result carries mount, which needs a DOM type.
const host = new JSDOM();
globalThis.document = host.window.document;
globalThis.HTMLElement = host.window.HTMLElement;

describe.skipIf(executablePath === undefined)(
  "the embedded snippet under a strict host CSP",
  () => {
    let browser: Browser;
    let directory = "";
    let runtime = "";

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), "aac-embedded-csp-"));
      browser = await chromium.launch({ executablePath: executablePath! });
      runtime = (
        await build({
          entryPoints: [resolve(process.cwd(), "src", "browser.ts")],
          bundle: true,
          format: "iife",
          globalName: "EvidenceGraph",
          footer: {
            js: "globalThis.renderEvidenceGraph = EvidenceGraph.renderEvidenceGraph;",
          },
          write: false,
        })
      ).outputFiles[0]!.text;
    }, BROWSER_HOOK_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
      if (directory !== "") rmSync(directory, { recursive: true, force: true });
    }, BROWSER_HOOK_TIMEOUT_MS);

    async function snippet() {
      const bundle = JSON.parse(
        readFileSync(
          resolve(
            process.cwd(),
            "test",
            "testdata",
            "result-root-bundle.sealed.json",
          ),
          "utf8",
        ),
      ) as unknown;
      const built = await buildPresentation(bundle, {
        presentation: "auto",
        format: "embedded",
        audience: "*",
        runtime: { code: runtime },
      });
      if (built.format !== "embedded" || built.html === undefined)
        throw new Error("an embedded snippet expected");
      return {
        html: built.html,
        scriptSources: built.scriptSources!,
        styleSources: built.styleSources!,
      };
    }

    async function load(
      html: string,
      scriptSources: readonly string[],
      styleSources: readonly string[],
    ) {
      const csp = [
        "default-src 'none'",
        `script-src ${scriptSources.join(" ")}`,
        `style-src ${styleSources.join(" ")}`,
        "img-src data:",
        "connect-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join("; ");
      const file = join(directory, `host-${Date.now()}-${Math.random()}.html`);
      writeFileSync(
        file,
        `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body><p>host page</p>${html}</body></html>`,
      );
      const page = await (await browser.newContext()).newPage();
      await page.addInitScript(() => {
        const seen: string[] = [];
        (globalThis as unknown as { __violations: string[] }).__violations =
          seen;
        document.addEventListener("securitypolicyviolation", (event) =>
          seen.push(`${event.effectiveDirective} ${event.sample}`),
        );
      });
      await page.goto(`file://${file}`);
      return page;
    }

    it("renders with no violation, and the sources are exactly what runs and what is inserted", async () => {
      const { html, scriptSources, styleSources } = await snippet();
      const page = await load(html, scriptSources, styleSources);
      await page.waitForSelector(
        '[data-aac-embedded] [data-page="verification"]',
        { state: "attached", timeout: 30_000 },
      );
      await page.waitForTimeout(300);
      const seen = await page.evaluate(() => ({
        violations: (globalThis as unknown as { __violations: string[] })
          .__violations,
        verify: [
          ...document.querySelectorAll("[data-aac-embedded] [data-verify]"),
        ].map((e) => e.getAttribute("data-verify")),
        scripts: [...document.querySelectorAll("script")]
          .filter((s) => s.type === "")
          .map((s) => s.textContent ?? ""),
        styles: [...document.querySelectorAll("style")].map(
          (s) => s.textContent ?? "",
        ),
      }));
      expect(seen.violations).toEqual([]);
      expect(seen.verify).toEqual(["incomplete"]);
      expect(seen.scripts.map(hashSource)).toEqual(scriptSources);
      expect(seen.styles.length).toBeGreaterThan(0);
      for (const style of seen.styles)
        expect(styleSources).toContain(hashSource(style));
    }, 60_000);

    it("a host CSP without the bootstrap's hash renders nothing", async () => {
      const { html, scriptSources, styleSources } = await snippet();
      const page = await load(html, scriptSources.slice(0, -1), styleSources);
      await page.waitForTimeout(1_000);
      const seen = await page.evaluate(() => ({
        violations: (globalThis as unknown as { __violations: string[] })
          .__violations,
        drawn: document.querySelector("[data-aac-embedded]")!.childElementCount,
      }));
      expect(seen.violations.some((v) => v.startsWith("script-src"))).toBe(
        true,
      );
      expect(seen.drawn).toBe(0);
    }, 60_000);
  },
);
