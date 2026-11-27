// SPDX-License-Identifier: Apache-2.0
// The History view's card page (capsule-viewer#384) in a real browser, as the
// ARD demo draws it: the released IIFE inlined in a page with a strict CSP.
// The reader's own zone with the script, UTC without it, no sideways
// scrolling at 360, 390 and 1280 CSS px, and "Download card" saves the
// object's exact bytes.
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
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { historyViewDocument } from "../src/history-view.js";

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

type Json = Record<string, unknown>;
const cases = (
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "..", "vectors", "history-view", "cases.json"),
      "utf8",
    ),
  ) as {
    cases: Record<string, Json>;
  }
).cases;

/** A page as evidencebook-skills demo/ard/pages.py writes one: CSP default-src 'none', the IIFE and the input inline. */
function scriptedPage(iife: string, input: unknown): string {
  const json = JSON.stringify(input)
    .replace(/</gu, "\\u003c")
    .replace(/>/gu, "\\u003e")
    .replace(/&/gu, "\\u0026");
  return (
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'\">" +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>History</title></head><body>' +
    '<div id="history"></div>' +
    `<script>${iife}</script>` +
    `<script type="application/json" id="history-input">${json}</script>` +
    "<script>(function(){var s=document.createElement('style');s.textContent=HistoryView.historyViewStyles;" +
    "document.head.appendChild(s);HistoryView.renderHistoryView(JSON.parse(" +
    "document.getElementById('history-input').textContent),document.getElementById('history'));})();</script>" +
    "</body></html>\n"
  );
}

describe.skipIf(executablePath === undefined)(
  "the card page in a browser",
  () => {
    let browser: Browser;
    let directory = "";
    let iife = "";

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), "cv-history-card-"));
      browser = await chromium.launch({ executablePath: executablePath! });
      const result = await build({
        entryPoints: [resolve(process.cwd(), "src", "history-view.ts")],
        bundle: true,
        format: "iife",
        globalName: "HistoryView",
        write: false,
      });
      iife = result.outputFiles[0]!.text;
    }, BROWSER_HOOK_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
      if (directory) rmSync(directory, { recursive: true, force: true });
    });

    const write = (name: string, html: string): string => {
      const file = join(directory, name);
      writeFileSync(file, html);
      return pathToFileURL(file).href;
    };

    it("the script shows the reader's own zone and says so; with scripts off the page says UTC", async () => {
      const url = write("yours.html", scriptedPage(iife, cases["card-yours"]));
      const context = await browser.newContext({
        timezoneId: "America/Chicago",
        locale: "en-US",
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page.waitForSelector('[data-history="footer"]');
      expect(await page.textContent('[data-history="times"]')).toBe(
        "Times are in your time zone.",
      );
      // 2026-11-27T03:12:00Z is Nov 26, 9:12 PM in Chicago (CST).
      const hero = (await page.textContent('[data-history="hero"]')) ?? "";
      expect(hero).toContain("Nov 26, 2026");
      expect(hero).toContain("CST");
      expect(hero).not.toContain("UTC");
      expect(errors).toEqual([]);
      await context.close();

      const staticUrl = write(
        "static.html",
        historyViewDocument(cases["card-yours"], undefined, "History"),
      );
      const off = await browser.newContext({
        javaScriptEnabled: false,
        timezoneId: "America/Chicago",
      });
      const p2 = await off.newPage();
      await p2.goto(staticUrl);
      expect(await p2.textContent('[data-history="times"]')).toBe(
        "Times are in UTC.",
      );
      expect(await p2.textContent('[data-history="hero"]')).toContain(
        "Nov 27, 2026, 03:12 UTC",
      );
      await off.close();
    });

    for (const width of [360, 390, 1280])
      for (const name of ["card-yours", "card-theirs"])
        it(`${name} fits ${width} CSS px with no sideways scrolling`, async () => {
          const url = write(
            `${name}-${width}.html`,
            scriptedPage(iife, cases[name]),
          );
          const context = await browser.newContext({
            viewport: { width, height: 900 },
          });
          const page = await context.newPage();
          await page.goto(url);
          await page.waitForSelector('[data-history="footer"]');
          const wide = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          expect(wide).toBeLessThanOrEqual(0);
          await context.close();
        });

    it("Download card saves the object's exact bytes under its file name", async () => {
      const input = cases["card-theirs"] as Json;
      const url = write("theirs.html", scriptedPage(iife, input));
      const context = await browser.newContext({ acceptDownloads: true });
      const page = await context.newPage();
      await page.goto(url);
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.click('[data-history="download"]'),
      ]);
      expect(download.suggestedFilename()).toBe("alder-history-card.json");
      const saved = join(directory, "saved.json");
      await download.saveAs(saved);
      expect(readFileSync(saved, "utf8")).toBe(
        (input["machine"] as Json)["text"],
      );
      await context.close();
    });
  },
);
