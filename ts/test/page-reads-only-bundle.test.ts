// SPDX-License-Identifier: BSD-3-Clause
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { buildPresentation } from "../src/presentation-builder.js";

/**
 * capsule-viewer#291 (Terms Pack Studio PRD v5 sections 2 and 13): every
 * report page carries its bundle, and the page runtime reads nothing else.
 * A page rebuilt from the bare bundle is byte-identical, `static` is told
 * apart as the page that drops the bundle, and an "anyone" page opened as a
 * file shows its checks with no key and no network.
 */

const host = new JSDOM();
globalThis.document = host.window.document;
globalThis.HTMLElement = host.window.HTMLElement;

const bundle = (): unknown =>
  JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "test",
        "testdata",
        "result-root-bundle.sealed.json",
      ),
      "utf8",
    ),
  );

async function runtime(): Promise<string> {
  return (
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
}

async function htmlPage(rt: string, b: unknown): Promise<string> {
  const built = await buildPresentation(b, {
    presentation: "auto",
    format: "html",
    audience: "anyone",
    depth: "L1",
    runtime: { code: rt },
  });
  if (built.format !== "html") throw new Error("an html page expected");
  return built.html;
}

/** The first JSON script of a page: the bundle it carries. */
const embedded = (html: string): string =>
  /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/.exec(html)![1]!;

/** Opens a page in jsdom with every outward API a trap; returns the calls. */
async function drawn(page: string, expectClean: boolean): Promise<string[]> {
  const calls: string[] = [];
  const dom = new JSDOM(page, {
    runScripts: "dangerously",
    beforeParse(window) {
      Object.defineProperty(window, "crypto", { value: globalThis.crypto });
      Object.assign(window, { TextEncoder, TextDecoder });
      const w = window as unknown as Record<string, unknown>;
      for (const name of [
        "fetch",
        "XMLHttpRequest",
        "WebSocket",
        "EventSource",
        "Worker",
        "SharedWorker",
        "indexedDB",
        "localStorage",
        "sessionStorage",
      ])
        Object.defineProperty(w, name, {
          configurable: true,
          get() {
            calls.push(name);
            throw new Error(`the page reached for ${name}`);
          },
        });
      Object.defineProperty(window.navigator, "sendBeacon", {
        configurable: true,
        get() {
          calls.push("sendBeacon");
          throw new Error("the page reached for sendBeacon");
        },
      });
    },
  });
  try {
    const doc = dom.window.document;
    const deadline = Date.now() + 30_000;
    while (
      Date.now() < deadline &&
      doc.querySelector('[data-page="verification"]') === null
    )
      await new Promise((r) => setTimeout(r, 25));
    await new Promise((r) => setTimeout(r, 200));
    expect(doc.querySelector('[data-page="verification"]')).not.toBeNull();
    if (expectClean) expect(calls).toEqual([]);
    // No key was supplied anywhere, and the checks still ran: the banner
    // is not "failed" and not "unable to verify".
    const verdicts = [...doc.querySelectorAll("[data-verify]")].map((e) =>
      e.getAttribute("data-verify"),
    );
    expect(verdicts.length).toBeGreaterThan(0);
    if (expectClean)
      for (const v of verdicts) expect(["failed", "unable"]).not.toContain(v);
  } finally {
    dom.window.close();
  }
  return calls;
}

describe("a report page carries its bundle and reads only that", () => {
  it("embeds the bundle, and a page rebuilt from that bundle is byte-identical", async () => {
    const rt = await runtime();
    const page = await htmlPage(rt, bundle());
    const carried = JSON.parse(
      embedded(page).replace(/\\u003c/gu, "<"),
    ) as unknown;
    expect(await htmlPage(rt, carried)).toBe(page);
    expect(await htmlPage(rt, bundle())).toBe(page);
  }, 60_000);

  it("calls no network, storage or worker API while drawing, and an anyone page shows its checks with no key", async () => {
    const rt = await runtime();
    const page = await htmlPage(rt, bundle());
    await drawn(page, true);
  }, 60_000);

  it("the watcher sees a page that does reach out (control)", async () => {
    const rt = await runtime();
    const page = (await htmlPage(rt, bundle())).replace(
      "</body>",
      "<script>try{fetch('x')}catch(e){}</script></body>",
    );
    expect(await drawn(page, false)).toContain("fetch");
  }, 60_000);

  it("the static packaging drops the bundle and says it is not self-verifying, so the Studio links html pages only", async () => {
    const built = await buildPresentation(bundle(), {
      presentation: "auto",
      format: "static",
      audience: "anyone",
      depth: "L1",
    });
    if (built.format !== "static") throw new Error("a static page expected");
    expect(built.html).not.toContain('<script type="application/json"');
    expect(built.html).toContain('data-static-notice="not-self-verifying"');
    const digest = (s: string): string =>
      createHash("sha256").update(s).digest("hex");
    expect(digest(built.html)).toHaveLength(64);
  }, 60_000);
});
