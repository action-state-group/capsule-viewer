// SPDX-License-Identifier: BSD-3-Clause
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { buildPresentation } from "../src/presentation-builder.js";

/**
 * The embedded result's snippet (which go/emitter's BuildEmbeddedHTML
 * writes byte for byte, go-embedded-vectors.test.ts), run in a host page
 * with the real core runtime, draws what mount() draws for the same bundle
 * and settings, and no verification check fails.
 */

const host = new JSDOM();
globalThis.document = host.window.document;
globalThis.HTMLElement = host.window.HTMLElement;

const hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

async function settled(root: Element): Promise<Element> {
  const deadline = Date.now() + 60_000;
  let last = "";
  let stable = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 15));
    const now = root.innerHTML;
    const done = root.querySelector('[data-page="verification"]') !== null;
    stable = done && now === last ? stable + 1 : 0;
    last = now;
    if (stable >= 3) return root;
  }
  throw new Error("presentation did not settle");
}

const verdicts = (root: Element): (string | null)[] =>
  [...root.querySelectorAll("[data-verify]")].map((e) =>
    e.getAttribute("data-verify"),
  );

it("the embedded snippet renders as mount() does", async () => {
  const runtime = (
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
  const pack = `{"entries":{"page.title":"Résumé </script> & co"},"id":"org.example.w/v0","locale":"fr-CA","wording_pack_version":"aac.wording-pack/v0"}`;
  const bundle = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "test",
        "testdata",
        "result-root-bundle.sealed.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const built = await buildPresentation(bundle, {
    presentation: "auto",
    format: "embedded",
    audience: "counterparty",
    depth: "L1",
    wording: { pack, sha256: hex(pack) },
    runtime: { code: runtime },
  });
  if (built.format !== "embedded" || built.html === undefined)
    throw new Error("an embedded snippet expected");
  const page = new JSDOM(
    `<!doctype html><html><body><p>host</p>${built.html}</body></html>`,
    {
      runScripts: "dangerously",
      beforeParse(window) {
        Object.defineProperty(window, "crypto", { value: globalThis.crypto });
        Object.assign(window, { TextEncoder, TextDecoder });
      },
    },
  );
  try {
    const element = page.window.document.querySelector("[data-aac-embedded]")!;
    const fromSnippet = await settled(element);

    const root = document.createElement("div");
    document.body.append(root);
    await built.mount(root);
    const fromMount = await settled(root);

    // The fixture's banner is "incomplete" (no check failed, some were not
    // run), never "failed" or "unable".
    expect(verdicts(fromSnippet)).toEqual(["incomplete"]);
    expect(verdicts(fromSnippet)).toEqual(verdicts(fromMount));
    expect(fromSnippet.innerHTML).toBe(fromMount.innerHTML);
    expect(fromSnippet.textContent).toBe(fromMount.textContent);
  } finally {
    page.window.close();
  }
}, 60_000);
