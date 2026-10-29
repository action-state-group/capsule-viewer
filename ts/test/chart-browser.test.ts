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

// Charts (capsule-viewer#82) in a real browser: the committed book bundle
// and specs, drawn by the page runtime under the page's CSP, the same with
// scripts off (the static page), in print, and at a phone's width (390 CSS
// px), where every chart fits with no sideways scrolling.

const BROWSER_HOOK_TIMEOUT_MS = 60_000;
const host = new JSDOM();
globalThis.document = host.window.document;
globalThis.HTMLElement = host.window.HTMLElement;

const executablePath = [
  process.env.AAC_CHROMIUM_PATH,
  chromium.executablePath(),
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((c) => c !== undefined && c !== "" && existsSync(c));

const TESTDATA = resolve(import.meta.dirname, "testdata", "charts");
const bundle = JSON.parse(
  readFileSync(join(TESTDATA, "book.bundle.json"), "utf8"),
) as unknown;
const charts = JSON.parse(
  readFileSync(join(TESTDATA, "specs.json"), "utf8"),
) as unknown[];

describe.skipIf(executablePath === undefined)(
  "charts with scripts on and off, in print and at a phone's width",
  () => {
    let browser: Browser;
    let directory = "";
    let runtime: string;

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), "cv-charts-"));
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
    ) {
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
      await page.waitForSelector("figure.cv-chart", { state: "attached" });
      const seen = await page.evaluate(() => {
        const figures = [
          ...document.querySelectorAll<HTMLElement>("figure.cv-chart"),
        ];
        return {
          figures: figures.length,
          values: figures.map((f) =>
            [...f.querySelectorAll("[data-chart-value], td[data-not-run]")].map(
              (v) => v.textContent,
            ),
          ),
          shown: figures.every((f) => {
            const svg = f.querySelector("svg")!.getBoundingClientRect();
            const style = getComputedStyle(f);
            return style.display !== "none" && svg.height > 0 && svg.width > 0;
          }),
          // Every chart's styles applied: the CSP allowed its stylesheet.
          styled: figures.every(
            (f) => getComputedStyle(f).borderTopStyle === "solid",
          ),
          fits:
            figures.every(
              (f) => f.getBoundingClientRect().right <= window.innerWidth + 0.5,
            ) && document.documentElement.scrollWidth <= window.innerWidth,
        };
      });
      await context.close();
      return { ...seen, violations };
    }

    it("the same charts in every case, styled, with no CSP violation, fitting at 390 px", async () => {
      const settings = {
        presentation: "auto",
        audience: "*",
        runtime: { code: runtime },
        charts,
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
        expect(run.figures).toBe(charts.length);
        expect(run.shown).toBe(true);
        expect(run.styled).toBe(true);
        expect(run.values).toEqual(runs[0]!.values);
      }
      for (const phone of runs.slice(3)) expect(phone.fits).toBe(true);
    }, 120_000);
  },
  120_000,
);
