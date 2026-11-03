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

// capsule-viewer#245: on a page that runs no script, a case card inside an
// expandable row's detail row is shown when the page is opened at its
// `#case-<case id>` address (docs/design/report-views.md "Case address").

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

describe.skipIf(executablePath === undefined)(
  "static page opened at a case address",
  () => {
    let browser: Browser;
    let directory = "";
    let runtime: string;

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), "cv-case-target-"));
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

    for (const name of ["compliance-bundle.json"])
      it(`${name}: a card in a detail row is shown at its address, and hidden at no address`, async () => {
        const { bundle } = await sealEvidenceBundle(
          JSON.parse(
            readFileSync(
              resolve(import.meta.dirname, "testdata", name),
              "utf8",
            ),
          ),
        );
        const built = await buildPresentation(bundle, {
          presentation: "auto",
          audience: "*",
          runtime: { code: runtime },
          format: "static",
        });
        if (built.format !== "static") throw new Error("static expected");
        const card = new JSDOM(built.html).window.document.querySelector(
          "tr.x-detail [data-case][id]",
        );
        if (card === null) throw new Error("no card in a detail row");
        const path = join(directory, `${name}.html`);
        writeFileSync(path, built.html);

        const shown = async (hash: string): Promise<boolean> => {
          const context = await browser.newContext({
            javaScriptEnabled: false,
          });
          try {
            const page = await context.newPage();
            await page.goto(`${pathToFileURL(path).href}${hash}`);
            return await page
              .locator(`[id="${card.id}"]`)
              .evaluate((el) => el.getBoundingClientRect().height > 0);
          } finally {
            await context.close();
          }
        };
        expect(await shown("")).toBe(false);
        expect(await shown(`#${card.id}`)).toBe(true);

        // The scripted page is unchanged: its row follows its toggle, so a
        // reader can close the row while the address still names the card.
        const scripted = await buildPresentation(bundle, {
          presentation: "auto",
          audience: "*",
          runtime: { code: runtime },
          format: "html",
        });
        if (scripted.format !== "html") throw new Error("html expected");
        const scriptedPath = join(directory, `scripted-${name}.html`);
        writeFileSync(scriptedPath, scripted.html);
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await page.goto(`${pathToFileURL(scriptedPath).href}#${card.id}`);
          const target = page.locator(`[id="${card.id}"]`);
          await target.waitFor({ state: "attached" });
          const visible = (): Promise<boolean> =>
            target.evaluate((el) => el.getBoundingClientRect().height > 0);
          await page.waitForFunction(
            (id) =>
              (document.getElementById(id)?.getBoundingClientRect().height ??
                0) > 0,
            card.id,
          );
          expect(await visible()).toBe(true);
          // The card is built after the browser looked for the fragment, so
          // navigate again to make it the :target, as a reader following a
          // link to it would.
          await page.evaluate((id) => {
            location.hash = "";
            location.hash = id;
          }, card.id);
          expect(
            await page.evaluate(() => document.querySelector(":target")?.id),
          ).toBe(card.id);
          await target.evaluate((el) => {
            const row = el.closest("tr.x-detail")!.previousElementSibling!;
            row.querySelector<HTMLDetailsElement>("details.rx")!.open = false;
          });
          expect(await visible()).toBe(false);
        } finally {
          await context.close();
        }
      }, 120_000);
  },
  120_000,
);
