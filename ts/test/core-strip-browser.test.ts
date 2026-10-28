// SPDX-License-Identifier: BSD-3-Clause
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPresentation } from "../src/presentation-builder.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

// The core strip (core-strip.ts, capsule-viewer#81) in a real browser: the
// same counts with scripts off (the static page, opened with JavaScript
// disabled), in print, and at a phone's width (390 CSS px), where the strip
// fits the screen with no sideways scrolling.

const BROWSER_HOOK_TIMEOUT_MS = 60_000;

// The static packaging renders at build time; in node it needs a document.
const host = new JSDOM();
globalThis.document = host.window.document;
globalThis.HTMLElement = host.window.HTMLElement;

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

interface Seen {
  readonly tiles: readonly { bucket: string; count: string; of: string }[];
  readonly line: string;
  readonly firstInL0: boolean;
  readonly shown: boolean;
  readonly fits: boolean;
  readonly violations: readonly string[];
}

describe.skipIf(executablePath === undefined)(
  "the core strip with scripts off, in print and at a phone's width",
  () => {
    let browser: Browser;
    let directory = "";
    let runtime: string;

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), "cv-strip-"));
      browser = await chromium.launch({ executablePath: executablePath! });
      const result = await build({
        entryPoints: [resolve(process.cwd(), "src", "browser.ts")],
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

    async function open(
      file: string,
      html: string,
      settings: { scripts: boolean; width: number; print: boolean },
    ): Promise<Seen> {
      const path = join(directory, file);
      writeFileSync(path, html);
      const context = await browser.newContext({
        javaScriptEnabled: settings.scripts,
        viewport: { width: settings.width, height: 844 },
      });
      const page = await context.newPage();
      const violations: string[] = [];
      page.on("console", (m) => {
        if (/Content Security Policy/u.test(m.text()))
          violations.push(m.text());
      });
      if (settings.print) await page.emulateMedia({ media: "print" });
      await page.goto(pathToFileURL(path).href);
      await page.waitForSelector("[data-core-strip]", { state: "attached" });
      const seen = await page.evaluate(() => {
        const strip = document.querySelector<HTMLElement>("[data-core-strip]")!;
        const L0 = strip.parentElement!;
        const box = strip.getBoundingClientRect();
        const style = getComputedStyle(strip);
        return {
          tiles: [...strip.querySelectorAll<HTMLElement>("[data-bucket]")].map(
            (t) => ({
              bucket: t.dataset.bucket!,
              count: t.dataset.count!,
              of: t.querySelector(".agg-of")!.textContent!,
            }),
          ),
          line: strip.querySelector(".agg-line")!.textContent!,
          firstInL0:
            L0.dataset.region === "L0" && L0.firstElementChild === strip,
          shown:
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            box.height > 0,
          // Nothing in the strip runs past the screen's right edge, and the
          // page does not scroll sideways.
          fits:
            [strip, ...strip.querySelectorAll("*")].every(
              (e) => e.getBoundingClientRect().right <= window.innerWidth + 0.5,
            ) && document.documentElement.scrollWidth <= window.innerWidth,
        };
      });
      await context.close();
      return { ...seen, violations };
    }

    for (const name of [
      "result-root-bundle.json",
      "outcome-report-bundle.json",
      "compliance-bundle.json",
    ])
      it(`${name}: the same strip with scripts on and off, in print and at 390 px`, async () => {
        const { bundle } = await sealEvidenceBundle(
          JSON.parse(
            readFileSync(
              resolve(import.meta.dirname, "testdata", name),
              "utf8",
            ),
          ),
        );
        const settings = {
          presentation: "auto",
          audience: "*",
          runtime: { code: runtime },
        };
        const offline = await buildPresentation(bundle, {
          ...settings,
          format: "html",
        });
        const statik = await buildPresentation(bundle, {
          ...settings,
          format: "static",
        });
        if (offline.format !== "html" || statik.format !== "static")
          throw new Error("unexpected format");
        const runs = [
          await open("offline.html", offline.html, {
            scripts: true,
            width: 1280,
            print: false,
          }),
          await open("static.html", statik.html, {
            scripts: false,
            width: 1280,
            print: false,
          }),
          await open("static-print.html", statik.html, {
            scripts: false,
            width: 1280,
            print: true,
          }),
          await open("phone.html", offline.html, {
            scripts: true,
            width: 390,
            print: false,
          }),
          await open("static-phone.html", statik.html, {
            scripts: false,
            width: 390,
            print: false,
          }),
        ];
        for (const run of runs) {
          expect(run.violations).toEqual([]);
          expect(run.firstInL0).toBe(true);
          expect(run.shown).toBe(true);
          expect(run.tiles).toEqual(runs[0]!.tiles);
          expect(run.line).toBe(runs[0]!.line);
        }
        expect(runs[0]!.tiles.length).toBeGreaterThanOrEqual(3);
        for (const phone of runs.slice(3)) expect(phone.fits).toBe(true);
      }, 120_000);
  },
  120_000,
);

// A module's content in a real browser, which lays the page out: content
// laid over the strip, or laid out ahead of it, is discarded for the
// refusal like content put before it; content after it renders.
describe.skipIf(executablePath === undefined)(
  "a module that covers the strip or lays content out ahead of it, in a browser",
  () => {
    let browser: Browser;
    let page: Page;
    let runtime: string;
    let bundle: unknown;

    beforeAll(async () => {
      browser = await chromium.launch({ executablePath: executablePath! });
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
      bundle = (
        await sealEvidenceBundle(
          JSON.parse(
            readFileSync(
              resolve(
                import.meta.dirname,
                "testdata",
                "result-root-bundle.json",
              ),
              "utf8",
            ),
          ),
        )
      ).bundle;
      page = await browser.newPage({ viewport: { width: 800, height: 900 } });
    }, BROWSER_HOOK_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
    }, BROWSER_HOOK_TIMEOUT_MS);

    // Renders the Result bundle with a module that appends `html` to L0 and
    // `css` in a stylesheet, now or (`late`) on a timer; `pageCss` is the
    // host page's own. Reports whether the module's content was kept and
    // whether the strip is shown in print.
    async function render(
      html: string,
      css = "",
      { pageCss = "", late = false } = {},
    ): Promise<{ kept: boolean; printed: boolean }> {
      await page.emulateMedia({ media: "screen" });
      await page.goto("about:blank");
      await page.setContent(
        "<!doctype html><html><head><style>body{margin:0}" +
          pageCss +
          '</style></head><body><main id="app"></main></body></html>',
      );
      await page.addScriptTag({ content: runtime });
      const kept = await page.evaluate(
        async ({ bundle, html, css, late }) => {
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
              id: "org.example.strip-test/v0",
              presentation_api: "aac.presentation-api/v0",
              runtime_min: "0.1.0",
              trust_class: "trusted-executable",
              requires: { bundle_kind: "evidence-bundle/v2" },
              audiences: ["*"],
              formats: ["html", "fragment", "embedded"],
              fallback: true,
              executable: {
                carrier: "module-slot",
                script_sha256: "0".repeat(64),
              },
            },
            canRender: () => true,
            buildModel: () => ({}),
            render: (_model: unknown, host: { L0: HTMLElement }) => {
              const draw = (): void => {
                const holder = document.createElement("div");
                holder.dataset.testModule = "";
                holder.innerHTML = html;
                host.L0.append(holder);
                const style = document.createElement("style");
                style.textContent = css;
                host.L0.append(style);
              };
              if (late) {
                const marker = document.createElement("p");
                marker.dataset.testModule = "";
                host.L0.append(marker);
                setTimeout(draw, 0);
              } else draw();
            },
          });
          const root = document.getElementById("app")!;
          await renderEvidenceGraph(bundle, root, undefined, { registry });
          return root.querySelector("[data-test-module]") !== null;
        },
        { bundle, html, css, late },
      );
      await page.emulateMedia({ media: "print" });
      const printed = await page.evaluate(() => {
        const strip = document.querySelector("[data-core-strip]");
        return (
          strip !== null &&
          getComputedStyle(strip).display !== "none" &&
          strip.getBoundingClientRect().height > 0
        );
      });
      return { kept, printed };
    }

    const HEADLINE =
      '<h1 style="background:#fff;margin:0;padding:40px">98% resolved</h1>';

    it("a module that writes after the strip renders", async () => {
      expect(await render(HEADLINE)).toEqual({ kept: true, printed: true });
    }, 60_000);

    it("one that lays its content over the strip is discarded", async () => {
      expect(
        await render(
          '<h1 style="position:relative;z-index:9;background:#fff;margin:-400px 0 0;padding:200px 0">98% resolved</h1>',
        ),
      ).toEqual({ kept: false, printed: true });
    }, 60_000);

    it("one that lays its headline out ahead of the strip, on a host whose L0 is a flex column, is discarded", async () => {
      const pageCss =
        '#app [data-region="L0"]{display:flex!important;flex-direction:column}';
      // Without the order, the same host keeps the module.
      expect((await render(HEADLINE, "", { pageCss })).kept).toBe(true);
      expect(
        (
          await render(HEADLINE, "[data-test-module]{order:-1}", {
            pageCss,
          })
        ).kept,
      ).toBe(false);
    }, 60_000);

    it("one that lays content over the strip on a timer is discarded", async () => {
      expect(
        (
          await render(
            '<h1 style="position:fixed;inset:0;z-index:9;background:#fff;margin:0">98% resolved</h1>',
            "",
            { late: true },
          )
        ).kept,
      ).toBe(false);
    }, 60_000);
  },
  120_000,
);
