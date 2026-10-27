// SPDX-License-Identifier: BSD-3-Clause
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { buildPresentation } from "../src/presentation-builder.js";
import type { PresentationDepth } from "../src/presentation-fragment.js";
import { gen, prng } from "./helpers/generated-json.js";

/**
 * Differential vectors for the Go embedded packaging (go/emitter
 * BuildEmbeddedHTML, TestBuildEmbeddedHTMLMatchesTypeScript): seeded,
 * generated (bundle, settings) inputs and the snippet and CSP sources
 * buildPresentation's "embedded" result gives for each, or the refusal. Go
 * replays every case and must write the same bytes. To regenerate after an
 * intentional change, run this file with UPDATE_PRESENTATION_GOLDENS=1.
 */

// buildPresentation's embedded result carries mount, which needs a DOM type.
const host = new JSDOM();
globalThis.document = host.window.document;
globalThis.HTMLElement = host.window.HTMLElement;

type Obj = Record<string, unknown>;
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
  bundle: unknown;
  settings: {
    audience: string;
    depth?: PresentationDepth;
    wording?: { pack: string; sha256: string };
    modules: { code: string; sha256: string; style_sha256?: string[] }[];
  };
  runtime: string;
  runtime_sha256?: string;
  html?: string;
  script_sources?: readonly string[] | undefined;
  style_sources?: readonly string[] | undefined;
  error?: string;
}

it("the Go embedded packaging's differential vectors", async () => {
  const rand = prng(2543);
  const { pick, text, value } = gen(rand);
  const sealed = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "test",
        "testdata",
        "result-root-bundle.sealed.json",
      ),
      "utf8",
    ),
  ) as Obj;
  const generated: Case[] = [];
  for (let i = 0; i < 40; i++) {
    const c: Case = {
      name: `case-${i}`,
      bundle: i % 10 === 0 ? sealed : { kind: "test", n: i, data: value(0) },
      settings: {
        audience: pick(["*", "counterparty", text(5) || "a"]),
        modules: [],
      },
      runtime: `/*rt ${i}*/`,
    };
    if (rand() < 0.5) c.settings.depth = pick(["L0", "L1", "L2"] as const);
    if (rand() < 0.4) {
      const pack = JSON.stringify({
        entries: { "page.title": text(6) || "W" },
        id: "org.example.vectors.wording/v0",
        locale: pick(["en", "fr-CA"]),
        wording_pack_version: "aac.wording-pack/v0",
      });
      c.settings.wording = { pack, sha256: hex(pack) };
    }
    for (let m = Math.floor(rand() * 3); m > 0; m--) {
      const code = `window.m${i}_${m}=${JSON.stringify(text(3))};`;
      c.settings.modules.push({
        code,
        sha256: hex(code),
        ...(rand() < 0.5
          ? { style_sha256: [hex(`.m${m}{}`), hex(`.n${i}{}`)] }
          : {}),
      });
    }
    if (rand() < 0.5) c.runtime_sha256 = hex(c.runtime);
    generated.push(c);
  }
  for (const c of generated) {
    try {
      const built = await buildPresentation(c.bundle, {
        presentation: "auto",
        format: "embedded",
        audience: c.settings.audience,
        ...(c.settings.depth === undefined ? {} : { depth: c.settings.depth }),
        ...(c.settings.wording === undefined
          ? {}
          : { wording: c.settings.wording }),
        modules: c.settings.modules.map((m) => ({
          code: m.code,
          sha256: m.sha256,
          ...(m.style_sha256 === undefined
            ? {}
            : { styleSha256: m.style_sha256 }),
        })),
        runtime: {
          code: c.runtime,
          ...(c.runtime_sha256 === undefined
            ? {}
            : { sha256: c.runtime_sha256 }),
        },
      });
      if (built.format !== "embedded" || built.html === undefined)
        throw new Error("an embedded snippet expected");
      c.html = built.html;
      c.script_sources = built.scriptSources;
      c.style_sources = built.styleSources;
    } catch (err) {
      c.error = err instanceof Error ? err.message : String(err);
    }
  }
  // The generator reaches every path Go must match.
  expect(generated.filter((c) => c.html !== undefined).length).toBeGreaterThan(
    25,
  );
  expect(generated.some((c) => c.error !== undefined)).toBe(true);
  expect(generated.some((c) => c.html?.includes('"__proto__"'))).toBe(true);
  const text_ = `${JSON.stringify({ cases: generated }, null, 1)}\n`;
  if (process.env.UPDATE_PRESENTATION_GOLDENS === "1")
    writeFileSync(vectorsPath, text_);
  expect(text_).toBe(readFileSync(vectorsPath, "utf8"));
});

it("an embedded result without the core runtime carries mount alone", async () => {
  const built = await buildPresentation(
    { kind: "test" },
    { presentation: "auto", format: "embedded", audience: "*" },
  );
  if (built.format !== "embedded") throw new Error("embedded expected");
  expect(built.html).toBeUndefined();
  expect(typeof built.mount).toBe("function");
});
