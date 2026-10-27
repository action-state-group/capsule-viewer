// SPDX-License-Identifier: BSD-3-Clause
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { jcs } from "@action-state-group/agent-action-capsule";
import { JSDOM } from "jsdom";
import { expect, it, vi } from "vitest";
import { buildPresentation } from "../src/presentation-builder.js";
import type { PresentationDepth } from "../src/presentation-fragment.js";

/**
 * Vectors for the Go embedded packaging (go/emitter BuildEmbeddedHTML,
 * TestBuildEmbeddedHTMLMatchesTypeScript). The TypeScript embedded
 * packaging is mount(element), which writes no bytes; what it decides is
 * the call it makes, renderEvidenceGraph(bundle, element, undefined,
 * options). Each case records those options (less the registry, which is
 * the host's) as JCS text, and Go's snippet bootstrap must pass the same
 * text. To regenerate after an intentional change, run this file with
 * UPDATE_PRESENTATION_GOLDENS=1.
 */

const calls: unknown[][] = [];
vi.mock("../src/evidence-graph-view.js", async (original) => ({
  ...(await original<typeof import("../src/evidence-graph-view.js")>()),
  renderEvidenceGraph: vi.fn(async (...args: unknown[]) => {
    calls.push(args);
  }),
}));

const host = new JSDOM();
globalThis.document = host.window.document;
globalThis.HTMLElement = host.window.HTMLElement;

const hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");
const vectorsPath = resolve(
  process.cwd(),
  "..",
  "go",
  "emitter",
  "testdata",
  "embedded-vectors.json",
);

interface Case {
  name: string;
  settings: {
    audience: string;
    depth?: PresentationDepth;
    wording?: { pack: string; sha256: string };
  };
  options?: string;
}

it("the Go embedded packaging's render options", async () => {
  const pack = JSON.stringify({
    entries: { "page.title": "Résumé </script> & co " },
    id: "org.example.vectors.wording/v0",
    locale: "fr-CA",
    wording_pack_version: "aac.wording-pack/v0",
  });
  const wording = { pack, sha256: hex(pack) };
  const generated: Case[] = [];
  for (const audience of ["*", "counterparty", "é<&> "])
    for (const depth of [undefined, "L0", "L1", "L2"] as const)
      for (const words of [undefined, wording])
        generated.push({
          name: `${generated.length}`,
          settings: {
            audience,
            ...(depth === undefined ? {} : { depth }),
            ...(words === undefined ? {} : { wording: words }),
          },
        });
  const bundle = { kind: "test" };
  for (const c of generated) {
    const built = await buildPresentation(bundle, {
      presentation: "auto",
      format: "embedded",
      ...c.settings,
    });
    if (built.format !== "embedded") throw new Error("embedded expected");
    calls.length = 0;
    await built.mount(document.createElement("div"));
    expect(calls).toHaveLength(1);
    const [given, , undef, options] = calls[0]!;
    expect(given).toBe(built.bundle);
    expect(undef).toBeUndefined();
    const { registry, ...rest } = options as Record<string, unknown>;
    expect(registry).toBeDefined();
    c.options = new TextDecoder().decode(jcs(rest));
  }
  const text = `${JSON.stringify({ cases: generated }, null, 1)}\n`;
  if (process.env.UPDATE_PRESENTATION_GOLDENS === "1")
    writeFileSync(vectorsPath, text);
  expect(text).toBe(readFileSync(vectorsPath, "utf8"));
});
