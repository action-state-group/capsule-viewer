// SPDX-License-Identifier: BSD-3-Clause
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { buildPresentation } from "../src/presentation-builder.js";

/**
 * go/emitter's embedded snippet (testdata/expected-embedded.html, written
 * by TestBuildEmbeddedHTMLGolden) run in a host page with the real core
 * runtime in place of the marker draws what TypeScript's mount() draws for
 * the same bundle and settings, and no verification check fails.
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

it("the Go embedded snippet renders as mount() does", async () => {
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
  const snippet = readFileSync(
    resolve(
      process.cwd(),
      "..",
      "go",
      "emitter",
      "testdata",
      "expected-embedded.html",
    ),
    "utf8",
  );
  const marker = "<script>/*IIFE_MARKER*/</script>";
  expect(snippet.startsWith(marker)).toBe(true);
  const page = new JSDOM(
    `<!doctype html><html><body><p>host</p>${snippet.replace(marker, () => `<script>${runtime}</script>`)}</body></html>`,
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
    const fromGo = await settled(element);

    // The same settings as embeddedGoldenOptions in go/emitter/embedded_test.go.
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
    });
    if (built.format !== "embedded") throw new Error("embedded expected");
    const root = document.createElement("div");
    document.body.append(root);
    await built.mount(root);
    const fromTs = await settled(root);

    // The fixture's banner is "incomplete" (no check failed, some were not
    // run), never "failed" or "unable".
    expect(verdicts(fromGo)).toEqual(["incomplete"]);
    expect(verdicts(fromGo)).toEqual(verdicts(fromTs));
    expect(fromGo.innerHTML).toBe(fromTs.innerHTML);
    expect(fromGo.textContent).toBe(fromTs.textContent);
  } finally {
    page.window.close();
  }
}, 60_000);
