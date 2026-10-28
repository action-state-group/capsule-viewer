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
import { verifyBundle } from "@action-state-group/agent-action-capsule";
import { emitEvidenceGraphHtml } from "../src/emitter.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

// The offline page must hand its runtime the bundle any JSON reader sees
// (#109). Written as a JavaScript object literal, a "__proto__" member set
// the object's prototype instead: the member vanished from what the page
// verified, and its value showed through as inherited fields. These tests
// load emitted pages in a real browser, like the other *-browser tests.

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

/** `bundle` as JSON text with `"__proto__": proto` added to its first record. */
function withProtoMember(bundle: Obj, proto: Obj): string {
  const text = JSON.stringify(bundle);
  const records = text.indexOf('"records":[{');
  if (records === -1) throw new Error("bundle has no records");
  const at = records + '"records":[{'.length;
  return `${text.slice(0, at)}"__proto__":${JSON.stringify(proto)},${text.slice(at)}`;
}

describe.skipIf(executablePath === undefined)(
  'a "__proto__" member on the offline page',
  () => {
    let browser: Browser;
    let runtime = "";
    let directory = "";
    let pageCount = 0;

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), "aac-proto-"));
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
      if (directory !== "") {
        rmSync(directory, { recursive: true, force: true });
      }
    }, BROWSER_HOOK_TIMEOUT_MS);

    async function open(html: string): Promise<{
      page: Page;
      violations: string[];
    }> {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        const seen: string[] = [];
        (globalThis as unknown as { __violations: string[] }).__violations =
          seen;
        document.addEventListener("securitypolicyviolation", (event) =>
          seen.push(event.effectiveDirective),
        );
      });
      const file = join(directory, `page-${pageCount++}.html`);
      writeFileSync(file, html);
      await page.goto(`file://${file}`);
      const violations = await page.evaluate(
        () =>
          (globalThis as unknown as { __violations: string[] }).__violations,
      );
      return { page, violations };
    }

    it("reaches the bootstrap as an own member, not a prototype", async () => {
      const bundle = JSON.parse(
        '{"note":"n","inner":{"__proto__":{"forged":"inherited"}}}',
      ) as Obj;
      const core = "window.coreRan = true;";
      const { page, violations } = await open(
        emitEvidenceGraphHtml(bundle, core, {
          coreRuntimeSha256: hex(core),
          bootstrap:
            "const inner = window.__BUNDLE__.inner; window.seen = { own: Object.keys(inner), member: JSON.stringify(inner.__proto__ === Object.prototype ? null : Object.getOwnPropertyDescriptor(inner, '__proto__')?.value), forged: inner.forged === undefined, plain: Object.getPrototypeOf(inner) === Object.prototype };",
        }),
      );
      expect(violations).toEqual([]);
      expect(
        await page.evaluate(() => (window as unknown as Obj).seen),
      ).toEqual({
        own: ["__proto__"],
        member: '{"forged":"inherited"}',
        forged: true,
        plain: true,
      });
    });

    it("verifies and shows what a JSON reader sees, not the member's fields", async () => {
      const { bundle } = await sealEvidenceBundle(
        JSON.parse(
          readFileSync(
            resolve(
              process.cwd(),
              "test",
              "testdata",
              "result-root-bundle.json",
            ),
            "utf8",
          ),
        ) as Obj,
      );
      const forged = "FORGED-OCCURRED-AT";
      const crafted = JSON.parse(
        withProtoMember(bundle, { occurred_at: forged }),
      ) as Obj;
      // A JSON reader sees the extra member, so the record's capsule_id no
      // longer matches it.
      const records = crafted.records as { capsule_id: string }[];
      const reader = await verifyBundle(crafted);
      expect(reader.capsuleResults[records[0]!.capsule_id]?.ok).toBe(false);

      const { page, violations } = await open(
        emitEvidenceGraphHtml(crafted, runtime, {
          coreRuntimeSha256: hex(runtime),
        }),
      );
      await page.waitForSelector("[data-verify]:not([data-verify=checking])");
      expect(violations).toEqual([]);
      const verify = await page.evaluate(
        () =>
          document.querySelector<HTMLElement>("[data-verify]")?.dataset.verify,
      );
      expect(verify).toBe("failed");
      expect(
        await page.evaluate(() => document.getElementById("app")!.textContent),
      ).not.toContain(forged);
    });
  },
);
