// SPDX-License-Identifier: BSD-3-Clause
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import {
  buildPresentation,
  type BuildPresentationOptions,
} from "../src/presentation-builder.js";
import { gen, prng } from "./helpers/generated-json.js";
import {
  FragmentTooLargeError,
  type PresentationDepth,
} from "../src/presentation-fragment.js";

/**
 * Differential vectors for the Go fragment encoder
 * (go/emitter BuildPresentationFragment, TestBuildPresentationFragmentMatchesTypeScript):
 * many generated (bundle, settings) inputs, each with the token, URL or
 * refusal this builder gives. Go replays every case and must give the same
 * bytes. The generator is seeded, so the file only changes when the inputs
 * or the TypeScript output change; to regenerate after an intentional
 * change, run this file with UPDATE_PRESENTATION_GOLDENS=1.
 */

type Obj = Record<string, unknown>;
const hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");
const vectorsPath = resolve(
  process.cwd(),
  "..",
  "go",
  "emitter",
  "testdata",
  "fragment-vectors.json",
);

interface Case {
  name: string;
  bundle: unknown;
  settings: {
    audience: string;
    depth?: PresentationDepth;
    title?: string;
    theme_css?: string;
    wording?: { pack: string; sha256: string };
    modules: { code: string; sha256: string }[];
    max_fragment_length?: number;
    viewer_url?: string;
  };
  runtime: string;
  /**
   * Set only for the long-URL case, to keep this file small: the bundle's
   * `pad` member is "x" repeated this many times, and the viewer URL ends
   * with "é" repeated `viewer_url_pad` times.
   */
  bundle_pad?: number;
  viewer_url_pad?: number;
  presentation?: string;
  fragment?: string;
  url?: string;
  refused?: { subject: string; length: number; limit: number };
  /** Any other refusal (such as a float, which AAC's JCS refuses). */
  error?: string;
}

async function cases(): Promise<Case[]> {
  const rand = prng(254);
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
  ) as unknown;
  const out: Case[] = [];
  for (let i = 0; i < 64; i++) {
    const bundle: Obj =
      i % 16 === 0 ? (sealed as Obj) : { kind: "test", n: i, data: value(0) };
    const settings: Case["settings"] = {
      audience: pick(["*", "counterparty", "auditor", text(5) || "a"]),
      modules: [],
    };
    if (rand() < 0.5) settings.depth = pick(["L0", "L1", "L2"] as const);
    // An empty title or theme is no setting in Go; TypeScript would write
    // it as a member, so the cases leave empty ones out.
    if (rand() < 0.5) settings.title = text(8) || "T";
    if (rand() < 0.4)
      settings.theme_css = `:root{--aac-accent:${pick(["#7a1f5c", "red", "é"])}}`;
    if (rand() < 0.4) {
      const pack = JSON.stringify({
        entries: { "page.title": text(6) || "W" },
        id: "org.example.vectors.wording/v0",
        locale: pick(["en", "fr-CA", "de"]),
        wording_pack_version: "aac.wording-pack/v0",
      });
      settings.wording = { pack, sha256: hex(pack) };
    }
    for (let m = Math.floor(rand() * 3); m > 0; m--) {
      const code = `window.m${i}_${m}=${JSON.stringify(text(4))};`;
      settings.modules.push({ code, sha256: hex(code) });
    }
    if (i % 8 === 3)
      settings.max_fragment_length = 16 + Math.floor(rand() * 400);
    if (i % 5 === 1)
      settings.viewer_url = `https://viewer.example/${pick(["v.html", "é/v.html", "😀"])}`;
    out.push({
      name: `case-${i}`,
      bundle,
      settings,
      runtime: `/*rt ${i}*/`,
    });
  }
  // A URL over 1 MiB with a token inside the ceiling.
  // A URL over 1 MiB in UTF-16 code units (not in UTF-8 bytes' count of
  // the token alone) with a token inside the ceiling.
  out.push({
    name: "url-over-1mib",
    bundle: { kind: "test" },
    bundle_pad: 700_000,
    settings: {
      audience: "*",
      modules: [],
      max_fragment_length: 1_046_528,
      viewer_url: "https://viewer.example/",
    },
    viewer_url_pad: 120_000,
    runtime: "/*rt*/",
  });
  for (const c of out) {
    const bundle =
      c.bundle_pad === undefined
        ? c.bundle
        : { ...(c.bundle as Obj), pad: "x".repeat(c.bundle_pad) };
    const viewerUrl =
      c.settings.viewer_url === undefined
        ? undefined
        : c.settings.viewer_url + "é".repeat(c.viewer_url_pad ?? 0);
    const options: BuildPresentationOptions = {
      presentation: "auto",
      format: "fragment",
      audience: c.settings.audience,
      runtime: { code: c.runtime },
      modules: c.settings.modules,
      ...(c.settings.depth === undefined ? {} : { depth: c.settings.depth }),
      ...(c.settings.title === undefined ? {} : { title: c.settings.title }),
      ...(c.settings.theme_css === undefined
        ? {}
        : { themeCss: c.settings.theme_css }),
      ...(c.settings.wording === undefined
        ? {}
        : { wording: c.settings.wording }),
      ...(c.settings.max_fragment_length === undefined
        ? {}
        : { maxFragmentLength: c.settings.max_fragment_length }),
      ...(viewerUrl === undefined ? {} : { viewerUrl }),
    };
    try {
      const built = await buildPresentation(bundle, options);
      if (built.format !== "fragment") throw new Error("fragment expected");
      c.presentation = built.payload.presentation;
      c.fragment = built.fragment;
      if (built.url !== undefined) c.url = built.url;
    } catch (err) {
      if (err instanceof FragmentTooLargeError)
        c.refused = {
          subject: err.subject,
          length: err.length,
          limit: err.maxLength,
        };
      else c.error = err instanceof Error ? err.message : String(err);
    }
  }
  return out;
}

it("the Go fragment encoder's differential vectors", async () => {
  const generated = await cases();
  // The generator reaches every path Go must match.
  expect(
    generated.filter((c) => c.fragment !== undefined).length,
  ).toBeGreaterThan(40);
  expect(generated.some((c) => c.url !== undefined)).toBe(true);
  expect(generated.some((c) => c.refused?.subject === "fragment token")).toBe(
    true,
  );
  expect(generated.some((c) => c.refused?.subject === "permalink URL")).toBe(
    true,
  );
  expect(generated.some((c) => c.error !== undefined)).toBe(true);
  expect(
    generated.some(
      (c) => c.presentation !== "auto" && c.fragment !== undefined,
    ),
  ).toBe(true);
  const text = `${JSON.stringify({ cases: generated }, null, 1)}\n`;
  if (process.env.UPDATE_PRESENTATION_GOLDENS === "1")
    writeFileSync(vectorsPath, text);
  expect(text).toBe(readFileSync(vectorsPath, "utf8"));
}, 60_000);
