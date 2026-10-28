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
import { chromium, type Browser } from "playwright-core";
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
