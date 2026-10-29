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
import { composedDigest } from "@action-state-group/agent-action-capsule";
import { emitEvidenceGraphHtml } from "../src/emitter.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

/** Launching Chromium on a loaded CI runner can exceed vitest's 10 s hook default. */
const BROWSER_HOOK_TIMEOUT_MS = 60_000;

// These tests need a real CSP-enforcing browser. They use AAC_CHROMIUM_PATH,
// then Playwright's own Chromium, then a system Chrome/Chromium (present on
// GitHub-hosted Ubuntu runners), and skip when none is installed.
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
const fixture = (name: string): Obj =>
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, "testdata", name), "utf8"),
  ) as Obj;

interface Loaded {
  readonly page: Page;
  readonly violations: string[];
}

describe.skipIf(executablePath === undefined)(
  "emitted page under a CSP-enforcing browser",
  () => {
    let browser: Browser;
    let directory = "";
    let pageCount = 0;

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), "aac-csp-"));
      browser = await chromium.launch({ executablePath: executablePath! });
    }, BROWSER_HOOK_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
      if (directory !== "") {
        rmSync(directory, { recursive: true, force: true });
      }
    }, BROWSER_HOOK_TIMEOUT_MS);

    async function load(html: string, width = 1280): Promise<Loaded> {
      const file = join(directory, `page-${pageCount++}.html`);
      writeFileSync(file, html);
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const seen: string[] = [];
        (globalThis as unknown as { __violations: string[] }).__violations =
          seen;
        document.addEventListener("securitypolicyviolation", (event) =>
          seen.push(event.effectiveDirective),
        );
      });
      await page.goto(`file://${file}`);
      await page.waitForFunction(() => document.readyState === "complete");
      await page.waitForTimeout(300);
      const violations = await page.evaluate(
        () =>
          (globalThis as unknown as { __violations: string[] }).__violations,
      );
      return { page, violations };
    }

    const flag = (page: Page, name: string): Promise<unknown> =>
      page.evaluate(
        (key) => (globalThis as unknown as Record<string, unknown>)[key],
        name,
      );

    const core = "window.coreRan = true;";
    const module = "window.moduleRan = true;";
    const bootstrap =
      'window.booted = window.__BUNDLE__ !== undefined; fetch("https://example.invalid/").then(() => { window.fetched = true; }, () => { window.fetchRefused = true; });';
    const page = (): string =>
      emitEvidenceGraphHtml({ note: "csp" }, core, {
        coreRuntimeSha256: hex(core),
        modules: [{ code: module, sha256: hex(module) }],
        bootstrap,
      });

    it("runs every hashed inline script and refuses the network", async () => {
      const { page: loaded, violations } = await load(page());
      expect(await flag(loaded, "coreRan")).toBe(true);
      expect(await flag(loaded, "moduleRan")).toBe(true);
      expect(await flag(loaded, "booted")).toBe(true);
      await loaded.waitForFunction(() => "fetchRefused" in globalThis);
      expect(await flag(loaded, "fetched")).toBeUndefined();
      expect(violations.filter((v) => v !== "connect-src")).toEqual([]);
    });

    it("refuses a script whose hash the page does not list", async () => {
      const html = page().replace(
        "</body>",
        "<script>window.injected = true;</script></body>",
      );
      const { page: loaded, violations } = await load(html);
      expect(await flag(loaded, "injected")).toBeUndefined();
      expect(violations).toContain("script-src-elem");
      expect(await flag(loaded, "coreRan")).toBe(true);
    });

    it("refuses the core runtime once its bytes are edited", async () => {
      const html = page().replace(core, "window.coreRan = 1;");
      const { page: loaded, violations } = await load(html);
      expect(await flag(loaded, "coreRan")).toBeUndefined();
      expect(violations).toContain("script-src-elem");
    });

    describe("a module that inserts a stylesheet at render time", () => {
      const pinned = "#probe{color:rgb(1, 2, 3)}";
      const unlisted = "#probe{color:rgb(4, 5, 6)}";
      const inserting = (css: string): string =>
        `const style = document.createElement("style"); style.textContent = ${JSON.stringify(css)}; document.head.appendChild(style); const probe = document.createElement("div"); probe.id = "probe"; document.body.appendChild(probe); window.moduleRan = true;`;
      const color = (loaded: Page): Promise<string> =>
        loaded.evaluate(
          () => getComputedStyle(document.getElementById("probe")!).color,
        );

      it("applies a stylesheet the module pinned, with no CSP violation", async () => {
        const code = inserting(pinned);
        const { page: loaded, violations } = await load(
          emitEvidenceGraphHtml({ note: "csp" }, core, {
            coreRuntimeSha256: hex(core),
            modules: [{ code, sha256: hex(code), styleSha256: [hex(pinned)] }],
            bootstrap: "window.booted = true;",
          }),
        );
        expect(await flag(loaded, "moduleRan")).toBe(true);
        expect(violations).toEqual([]);
        expect(await color(loaded)).toBe("rgb(1, 2, 3)");
      });

      it("blocks a stylesheet the module did not pin", async () => {
        const code = inserting(unlisted);
        const { page: loaded, violations } = await load(
          emitEvidenceGraphHtml({ note: "csp" }, core, {
            coreRuntimeSha256: hex(core),
            modules: [{ code, sha256: hex(code), styleSha256: [hex(pinned)] }],
            bootstrap: "window.booted = true;",
          }),
        );
        expect(await flag(loaded, "moduleRan")).toBe(true);
        expect(violations).toContain("style-src-elem");
        expect(await color(loaded)).not.toBe("rgb(4, 5, 6)");
      });
    });

    // The runtime go/pageruntime ships was built at its own commit, so its
    // stylesheets can drift from the ones go/emitter/runtime-style-hashes.txt
    // lists today. The stylesheets it inserts on these pages, each allowed
    // by the page's CSP, are exactly the listed ones.
    it("go/pageruntime's runtime inserts exactly the stylesheets runtime-style-hashes.txt lists", async () => {
      const runtime = readFileSync(
        resolve(
          process.cwd(),
          "..",
          "go",
          "pageruntime",
          "evidence-graph.iife.js",
        ),
        "utf8",
      );
      const listed = readFileSync(
        resolve(
          process.cwd(),
          "..",
          "go",
          "emitter",
          "runtime-style-hashes.txt",
        ),
        "utf8",
      )
        .split("\n")
        .filter((line) => line.trim() !== "" && !line.startsWith("#"))
        .map((line) => line.split(" ")[0]!);
      const inserted = new Set<string>();
      const pages: [string, string, string][] = [];
      for (const [name, selector] of [
        ["outcome-report-bundle.json", ".oi"],
        ["compliance-bundle.json", ".cc"],
        [
          join("aac-vectors", "bundle", "composed", "vectors.json"),
          "[data-section=composition]",
        ],
      ] as const) {
        const input = name.endsWith("vectors.json")
          ? (
              fixture(name) as { cases: { id: string; container: Obj }[] }
            ).cases.find((c) => c.id === "agree")!.container
          : fixture(name);
        const { bundle } = await sealEvidenceBundle(input);
        pages.push([name, emitEvidenceGraphHtml(bundle, runtime), selector]);
      }
      // The charts' stylesheet: the committed chart bundle, drawn with its
      // specs (capsule-viewer#82).
      const charts = join("charts", "book.bundle.json");
      pages.push([
        charts,
        emitEvidenceGraphHtml(fixture(charts), runtime, {
          bootstrap: `renderEvidenceGraph(window.__BUNDLE__, document.getElementById("app"), undefined, ${JSON.stringify({ audience: "*", charts: fixture(join("charts", "specs.json")), format: "html" })});`,
        }),
        "figure.cv-chart",
      ]);
      for (const [name, html, selector] of pages) {
        const { page: loaded, violations } = await load(html);
        await loaded.waitForSelector(selector);
        expect(violations, name).toEqual([]);
        const styles = await loaded.evaluate(() =>
          Array.from(
            document.querySelectorAll("body style"),
            (style) => style.textContent ?? "",
          ),
        );
        for (const css of styles)
          inserted.add(
            `sha256-${createHash("sha256").update(css, "utf8").digest("base64")}`,
          );
      }
      expect([...inserted].sort()).toEqual([...listed].sort());
    });

    describe("with the reference core runtime", () => {
      let runtime: string;

      beforeAll(async () => {
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
      });

      for (const [name, selector] of [
        ["outcome-report-bundle.json", ".oi"],
        ["compliance-bundle.json", ".cc"],
      ] as const) {
        it(`${name} renders with no CSP violation and no overflow at 390px`, async () => {
          const { bundle } = await sealEvidenceBundle(fixture(name));
          const html = emitEvidenceGraphHtml(bundle, runtime, {
            title: "Supplied title",
          });
          const { page: loaded, violations } = await load(html, 390);
          await loaded.waitForSelector(selector);
          expect(violations).toEqual([]);
          expect(await loaded.title()).toBe("Supplied title");
          const width = await loaded.evaluate(
            () => document.documentElement.scrollWidth,
          );
          expect(width).toBeLessThanOrEqual(390);
        });
      }

      // capsule-viewer#57: a composed/v1 section whose member and observer
      // ids are unbroken 64-hex strings, like the digests beside them, fits
      // the page at 390px, 1280px and in print, and each id is still whole
      // in the cell's text.
      it("a composed/v1 section with 64-hex ids fits at 390px, 1280px and in print", async () => {
        const vectors = fixture(
          join("aac-vectors", "bundle", "composed", "vectors.json"),
        ) as { cases: { id: string; container: Obj }[] };
        // Sorted, so each pair keeps the order the block's rules require.
        const [memberA, memberB] = [hex("member a"), hex("member b")].sort();
        const [observerA, observerB] = [
          hex("observer a"),
          hex("observer b"),
        ].sort();
        const ids: Record<string, string> = {
          "responder-a": memberA!,
          "responder-b": memberB!,
          "obs-a": observerA!,
          "obs-b": observerB!,
        };
        const rename = (value: unknown): unknown =>
          typeof value === "string"
            ? (ids[value] ?? value)
            : Array.isArray(value)
              ? value.map(rename)
              : value !== null && typeof value === "object"
                ? Object.fromEntries(
                    Object.entries(value).map(([k, v]) => [k, rename(v)]),
                  )
                : value;
        const agree = vectors.cases.find((c) => c.id === "agree")!.container;
        const extensions = agree.extensions as Obj;
        const composed = rename(extensions["composed/v1"]) as Obj;
        composed.composed_digest = await composedDigest(composed);
        const { bundle } = await sealEvidenceBundle({
          ...agree,
          extensions: { ...extensions, "composed/v1": composed },
        });
        const html = emitEvidenceGraphHtml(bundle, runtime);
        for (const [media, width] of [
          ["screen", 390],
          ["screen", 1280],
          ["print", 794],
        ] as const) {
          const { page: loaded, violations } = await load(html, width);
          await loaded.emulateMedia({ media });
          await loaded.waitForSelector(
            '[data-section="composition"] table[data-composition-members]',
          );
          expect(violations).toEqual([]);
          const fit = await loaded.evaluate(() => ({
            page: document.documentElement.scrollWidth,
            tables: Array.from(
              document.querySelectorAll('[data-section="composition"] table'),
              (t) => t.getBoundingClientRect().right,
            ),
            members: Array.from(
              document.querySelectorAll(
                "table[data-composition-members] tbody tr",
              ),
              (tr) => tr.querySelector("td")?.textContent,
            ),
          }));
          expect(fit.page, media).toBeLessThanOrEqual(width);
          for (const right of fit.tables)
            expect(right, media).toBeLessThanOrEqual(width);
          expect(fit.members).toEqual([ids["responder-a"], ids["responder-b"]]);
        }
      });
    });
  },
  60_000,
);
