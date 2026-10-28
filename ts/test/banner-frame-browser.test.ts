// SPDX-License-Identifier: BSD-3-Clause
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

// The banner frame check in a real browser, which computes what jsdom does
// not: pseudo-elements, and the transform and margin properties. A module
// whose stylesheet changes how the banner reads is discarded for the
// refusal (presentation contract section 6.2).

const BROWSER_HOOK_TIMEOUT_MS = 60_000;

function browserPath(): string | undefined {
  return [
    process.env.AAC_CHROMIUM_PATH,
    chromium.executablePath(),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((c) => c !== undefined && c !== "" && existsSync(c));
}
const executablePath = browserPath();

describe.skipIf(executablePath === undefined)(
  "a module stylesheet that changes how the banner reads, in a browser",
  () => {
    let browser: Browser;
    let page: Page;
    let runtime: string;
    let bundle: unknown;

    beforeAll(async () => {
      browser = await chromium.launch({
        executablePath: executablePath!,
        // Headless Chrome hides scrollbars by default; CI pages meet classic
        // ones, which change the width an auto margin resolves to.
        ignoreDefaultArgs: ["--hide-scrollbars"],
      });
      const result = await build({
        stdin: {
          contents: [
            'export { renderEvidenceGraph } from "./src/evidence-graph-view.ts";',
            'export { PresentationRegistry } from "./src/presentation-registry.ts";',
          ].join("\n"),
          resolveDir: process.cwd(),
          loader: "ts",
        },
        bundle: true,
        format: "iife",
        globalName: "Frame",
        write: false,
      });
      runtime = result.outputFiles[0]!.text;
      // Nothing is signed, so the page has a details line to protect.
      bundle = (
        await sealEvidenceBundle({
          root: "deal",
          records: [{ capsule_id: "deal" }],
          disclosures: { deal: { agent_input: { step: "open" } } },
        })
      ).bundle;
      page = await browser.newPage();
    }, BROWSER_HOOK_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
    }, BROWSER_HOOK_TIMEOUT_MS);

    // Renders the bundle with a module that draws a marker and adds `css`
    // to its region; reports whether the module's content was kept.
    async function kept(css: string): Promise<boolean> {
      // The shell's rule that centres the page with auto margins.
      await page.setContent(
        "<!doctype html><html><head><style>" +
          "#app{max-width:600px;margin-inline:auto}" +
          "</style></head><body></body></html>",
      );
      await page.addScriptTag({ content: runtime });
      return page.evaluate(
        async ({ bundle, css }) => {
          const { renderEvidenceGraph, PresentationRegistry } = (
            globalThis as unknown as {
              Frame: {
                renderEvidenceGraph: (
                  bundle: unknown,
                  root: HTMLElement,
                  countersigners: undefined,
                  options: { registry: unknown },
                ) => Promise<void>;
                PresentationRegistry: new () => {
                  register(module: unknown): void;
                };
              };
            }
          ).Frame;
          const registry = new PresentationRegistry();
          registry.register({
            manifest: {
              spec_version: "aac.presentation-manifest/v0",
              id: "org.example.banner-test/v0",
              presentation_api: "aac.presentation-api/v0",
              runtime_min: "0.1.0",
              trust_class: "trusted-executable",
              requires: { bundle_kind: "evidence-bundle/v2" },
              audiences: ["*"],
              formats: ["html", "fragment", "embedded"],
              fallback: false,
              priority: 1,
              executable: {
                carrier: "module-slot",
                script_sha256: "0".repeat(64),
              },
            },
            canRender: () => true,
            buildModel: () => ({}),
            render: (_model: unknown, host: { L1: HTMLElement }) => {
              const marker = document.createElement("p");
              marker.dataset.testModule = "";
              host.L1.append(marker);
              const style = document.createElement("style");
              style.textContent = css;
              host.L1.append(style);
            },
          });
          const root = document.createElement("main");
          root.id = "app";
          document.body.append(root);
          await renderEvidenceGraph(bundle, root, undefined, { registry });
          return root.querySelector("[data-test-module]") !== null;
        },
        { bundle, css },
      );
    }

    it("one that styles only its own content renders", async () => {
      expect(await kept("[data-test-module]{color:red;margin-top:4px}")).toBe(
        true,
      );
    });

    it("one that makes the page scroll renders", async () => {
      expect(
        await kept(
          "html::-webkit-scrollbar{width:15px}[data-test-module]{height:3000px}",
        ),
      ).toBe(true);
    });

    for (const css of [
      '[data-banner-detail]::after{content:" These findings do not affect this report."}',
      '[data-verify]::before{content:"Unchanged since it was sealed. "}',
      "[data-verify]{scale:0}",
      ".cv-shell-bar{translate:0 -100vh}",
      ".cv-shell-bar{margin-top:-100vh}",
      ".cv-shell-bar{margin-left:-100vw}",
      ".cv-shell-bar{margin-left:100vw}",
      ".cv-shell-bar{margin-right:-100vw}",
      "[data-verify]{-webkit-text-fill-color:transparent}",
      "[data-verify]{zoom:0.01}",
    ])
      it(`one that adds ${css} is discarded`, async () => {
        expect(await kept(css)).toBe(false);
      });
  },
);
