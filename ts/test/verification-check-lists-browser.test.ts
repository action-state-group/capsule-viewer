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
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emitEvidenceGraphHtml } from "../src/emitter.js";
import {
  CHECKPOINT_NOT_CHECKED_NOTE,
  VERIFICATION_CHECK_WORDS,
} from "@action-state-group/agent-action-capsule";
import { TEST_KEYS, sealEvidenceBundle } from "./helpers/sealed-bundle.js";

// The browser build checks a signed checkpoint with AAC 0.9.0's strict
// verifier (the Ed25519 check runs on cll 0.3.0's browser path), so a bundle
// whose records and checkpoint are signed reads verified there. The
// not-checked list still matters for a bundle that is not fully signed. A real browser, found as
// emitter-csp-browser.test.ts finds one; skipped when none is installed.
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

type Obj = Record<string, unknown>;
const json = (...path: string[]): Obj =>
  JSON.parse(readFileSync(resolve(process.cwd(), ...path), "utf8")) as Obj;

interface Lists {
  readonly page: string[];
  readonly failed: string[];
  readonly notChecked: string[];
  readonly checkpointLine: string | null;
  readonly hint: string | null;
  readonly verify: string | null;
}

describe.skipIf(executablePath === undefined)(
  "the verification page's check lists in a browser",
  () => {
    let browser: Browser;
    let directory: string;
    let runtime: string;
    let count = 0;

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), "aac-checks-"));
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
      browser = await chromium.launch({ executablePath: executablePath! });
    }, 60_000);

    afterAll(async () => {
      await browser?.close();
      if (directory !== undefined)
        rmSync(directory, { recursive: true, force: true });
    }, 60_000);

    async function open(bundle: unknown, bootstrap?: string): Promise<Lists> {
      const file = join(directory, `page-${count++}.html`);
      writeFileSync(
        file,
        emitEvidenceGraphHtml(
          bundle,
          runtime,
          bootstrap === undefined ? {} : { bootstrap },
        ),
      );
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(pathToFileURL(file).href);
      await page.waitForSelector('[data-checks="scope"]', {
        // The section is folded, so it is drawn but not visible.
        state: "attached",
      });
      const shown = await page.evaluate(() => {
        const ids = (which: string): string[] =>
          Array.from(
            document.querySelectorAll<HTMLElement>(
              `ul[data-checks="${which}"] > li`,
            ),
            (item) => item.dataset.check!,
          );
        return {
          page: ids("page"),
          failed: ids("failed"),
          notChecked: ids("not-checked"),
          checkpointLine:
            document.querySelector(
              'ul[data-checks="not-checked"] > li[data-check="checkpoint-signature"]',
            )?.textContent ?? null,
          hint:
            document.querySelector("[data-verifier-hint]")?.textContent ?? null,
          verify:
            document
              .querySelector("[data-verify]")
              ?.getAttribute("data-verify") ?? null,
        };
      });
      await context.close();
      return shown;
    }

    const signedSource = (): Obj => ({
      root: "deal",
      records: [
        { capsule_id: "act", key_id: TEST_KEYS.a },
        {
          capsule_id: "deal",
          key_id: TEST_KEYS.a,
          chain: { parent_capsule_id: "act", relation: "derived_from" },
        },
      ],
      disclosures: {
        act: { agent_output: { step: "act", amount: 1 } },
        deal: {
          agent_input: { spec_version: "x-example-deal/v0", step: "open" },
        },
      },
    });

    it("a signed checkpoint: verifies in the browser, which used to withhold it (checkpoint_verifier_unavailable)", async () => {
      const { bundle } = await sealEvidenceBundle(signedSource(), {
        signCheckpoint: true,
      });
      const shown = await open(bundle);
      expect(shown.verify).toBe("verified");
      expect(shown.page).toContain("checkpoint-signature");
      expect(shown.failed).toEqual([]);
      expect(shown.notChecked).toEqual([]);
      expect(shown.checkpointLine).toBeNull();
    });

    it("a forged checkpoint (a signed value changed): the browser reads failed", async () => {
      const { bundle } = await sealEvidenceBundle(signedSource(), {
        signCheckpoint: true,
      });
      (bundle.checkpoint as Obj).timestamp = "2026-09-15T00:00:00Z";
      const shown = await open(bundle);
      expect(shown.verify).toBe("failed");
      expect(shown.failed).toContain("checkpoint-signature");
      expect(shown.notChecked).toEqual([]);
    });

    it("a forged checkpoint (a signature byte flipped): the browser reads failed", async () => {
      const { bundle } = await sealEvidenceBundle(signedSource(), {
        signCheckpoint: true,
      });
      const cose = Buffer.from(
        (bundle.checkpoint as Obj).cose as string,
        "base64url",
      );
      cose[cose.length - 1]! ^= 0xff;
      (bundle.checkpoint as Obj).cose = cose.toString("base64url");
      const shown = await open(bundle);
      expect(shown.verify).toBe("failed");
      expect(shown.failed).toContain("checkpoint-signature");
    });

    it("a host bootstrap passes its own verifier text, shown under the not-checked list", async () => {
      const { bundle } = await sealEvidenceBundle(
        json("test", "testdata", "result-root-close-bundle.json"),
      );
      const shown = await open(
        bundle,
        'renderEvidenceGraph(window.__BUNDLE__, document.getElementById("app"), undefined, { verifierHint: "example-verifier --bundle FILE" });',
      );
      expect(shown.page).toContain("cited-signers");
      expect(shown.notChecked).toEqual(["producer-signatures"]);
      expect(shown.hint).toBe("example-verifier --bundle FILE");
    });
  },
  60_000,
);
