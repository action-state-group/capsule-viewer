// SPDX-License-Identifier: BSD-3-Clause
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { emitEvidenceGraphHtml } from "../src/emitter.js";
import { recordAddress } from "../src/report-levels.js";
import {
  BUILTIN_PRESENTATIONS,
  createPresentationRegistry,
} from "../src/evidence-graph-view.js";
import {
  availablePackagings,
  buildFragmentViewerHtml,
  buildPresentation,
  offlineHtmlFromFragment,
  PACKAGING_TARGETS,
  PackagingUnavailableError,
  PresentationBuildError,
  PresentationModuleRefusedError,
  PresentationStylePinsError,
  STATIC_PAGE_DEFAULT_BUDGET,
  type BuildPresentationOptions,
  type BuiltPresentation,
  type PackagingTarget,
  type PresentationModuleScript,
} from "../src/presentation-builder.js";
import {
  decodePresentationFragment,
  FRAGMENT_TOKEN_MAX_LENGTH,
  FragmentTooLargeError,
  type WordingPackInput,
} from "../src/presentation-fragment.js";
import {
  PresentationRegistry,
  REFERENCE_PRESENTATION_RUNTIME,
  resolveModules,
  type PresentationManifest,
  type PresentationModule,
  type PresentationResolver,
} from "../src/presentation-registry.js";
import { withCarriedCapsule } from "./helpers/carried-capsule.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";
import {
  openDom,
  type Obj,
  testdata,
  fixture,
  hex,
  runtime,
  openPage,
  staticDocument,
  openStatic,
  expectStaticPage,
  FIXTURES,
  AUDIENCES,
  MATRIX_PARTS,
  matrixCases,
  acceptanceMatrix,
  rootOnly,
  usePresentationHarness,
} from "./helpers/presentation-harness.js";

usePresentationHarness();

it("a page that never settles fails with its own message and is closed", async () => {
  let closed: JSDOM | undefined;
  await expect(
    openPage(
      '<!doctype html><div id="app">never verified</div>',
      "file:///never.html",
      200,
      (dom) => (closed = dom),
    ),
  ).rejects.toThrow("page did not settle");
  // The failure path closed the window, so nothing polls it after the test.
  expect(closed).toBeDefined();
});

// Every (fixture, audience) pair of the table is in exactly one part, and each
// part runs in exactly one test file, so splitting the table across files
// drops no case (capsule-viewer#466).
it("the acceptance table's parts cover every (fixture, audience) pair once, each part in one file", () => {
  const pairs = MATRIX_PARTS.flatMap((part) =>
    matrixCases(part).map(([[label], [audience]]) => `${label} × ${audience}`),
  );
  expect(pairs).toHaveLength(FIXTURES.length * AUDIENCES.length);
  expect(new Set(pairs).size).toBe(pairs.length);
  const dir = resolve(process.cwd(), "test");
  const calls = readdirSync(dir)
    .filter((name) => name.endsWith(".test.ts"))
    .flatMap((name) =>
      [
        ...readFileSync(resolve(dir, name), "utf8").matchAll(
          /^acceptanceMatrix\("([^"]+)"\);$/gmu,
        ),
      ].map((m) => m[1]),
    )
    .sort();
  expect(calls).toEqual([...MATRIX_PARTS].sort());
});

acceptanceMatrix("rest");

// ---------------------------------------------------------------------------
// Presentation settings never change evidence (contract I3)
// ---------------------------------------------------------------------------

async function pack(entries: Obj, locale: string): Promise<WordingPackInput> {
  const text = JSON.stringify({
    entries,
    id: "org.example.view.wording/v0",
    locale,
    wording_pack_version: "aac.wording-pack/v0",
  });
  return { pack: text, sha256: hex(text) };
}

describe("theme, wording, locale and depth", () => {
  it("leave every evidence identifier and the verified content unchanged", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("compliance-bundle.json"),
    );
    const base = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "adjudicator",
      format: "html",
      runtime: { code: runtime },
    });
    if (base.format !== "html") throw new Error("html expected");
    const baseline = await openPage(base.html, "file:///a.html");
    const variants: [string, Partial<BuildPresentationOptions>][] = [
      ["theme", { themeCss: ":root{--aac-accent:#7a1f5c}" }],
      ["wording", { wording: await pack({ "page.title": "Findings" }, "en") }],
      ["locale", { wording: await pack({ "page.title": "Constats" }, "fr") }],
      ["depth L0", { depth: "L0" }],
      ["depth L1", { depth: "L1" }],
      ["title", { title: "Another title" }],
    ];
    for (const [name, change] of variants) {
      const built = await buildPresentation(bundle, {
        presentation: "auto",
        audience: "adjudicator",
        format: "html",
        runtime: { code: runtime },
        ...change,
      });
      if (built.format !== "html") throw new Error("html expected");
      expect(built.html, name).not.toBe(base.html);
      const shown = await openPage(built.html, "file:///b.html");
      if (name.startsWith("depth")) {
        // Depth only opens levels (presentation contract section 9.1): the
        // verdicts, pages and refusals are the same, and an opened level
        // only adds what its toggle builds, never drops an identifier.
        const { html: _h, text: _t, evidence_ids: ids, ...rest } = shown;
        const {
          html: _bh,
          text: _bt,
          evidence_ids: baseIds,
          ...baseRest
        } = baseline;
        expect(rest, name).toEqual(baseRest);
        expect(ids, name).toEqual(expect.arrayContaining(baseIds));
      } else if (change.wording !== undefined) {
        // The proofs' "Words" entry names the pack the page was given, by
        // its digest, now that every body is built (capsule-viewer#67):
        // that line, and only that line, changes.
        const sha = change.wording.sha256;
        const words = (text: string): string =>
          text.replace(
            new RegExp(
              `wording pack org\\.example\\.view\\.wording/v0 \\(wording_sha256 ${sha}\\), supplied with the page over the built-in (\\S+) \\(`,
              "u",
            ),
            "wording pack $1, built into this viewer (",
          );
        expect(shown.text, name).toContain(sha);
        const { html: _h, text, evidence_ids: ids, ...rest } = shown;
        const {
          html: _bh,
          text: baseText,
          evidence_ids: baseIds,
          ...baseRest
        } = baseline;
        expect(rest, name).toEqual(baseRest);
        expect(ids, name).toEqual([...baseIds, sha].sort());
        expect(words(text), name).toEqual(baseText);
      } else {
        expect(shown.evidence_ids, name).toEqual(baseline.evidence_ids);
        expect(shown, name).toEqual(baseline);
      }
    }
  });

  it("a wording pack titles the page, and its digest is checked", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("report-rows-bundle.json"),
    );
    const words = await pack({ "page.title": "What was checked" }, "en");
    const built = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "html",
      runtime: { code: "/*IIFE_MARKER*/" },
      wording: words,
    });
    if (built.format !== "html") throw new Error("html expected");
    expect(built.html).toContain("<title>What was checked</title>");
    await expect(
      buildPresentation(bundle, {
        presentation: "auto",
        audience: "*",
        format: "html",
        runtime: { code: "/*IIFE_MARKER*/" },
        wording: { pack: words.pack, sha256: "0".repeat(64) },
      }),
    ).rejects.toThrow(/do not hash to its wording_sha256/u);
    await expect(
      buildPresentation(bundle, {
        presentation: "auto",
        audience: "*",
        format: "html",
        runtime: { code: "/*IIFE_MARKER*/" },
        wording: await pack({ "Bad Key": "x" }, "en"),
      }),
    ).rejects.toThrow(/aac.wording-pack\/v0/u);
  });

  for (const [file, module] of [
    ["outcome-report-bundle.json", "outcome-report"],
    ["compliance-bundle.json", "compliance"],
  ] as const)
    it(`a wording pack that does not fit the selected report (${module}) is refused with its reasons, not drawn as presentation-failed`, async () => {
      const { bundle } = await sealEvidenceBundle(fixture(file));
      const options = {
        presentation: "auto",
        audience: "*",
        runtime: { code: "/*IIFE_MARKER*/" },
      } as const;
      const grouping = module === "compliance" ? "groups" : "lines";
      const misfit = await pack(
        {
          [`${grouping}.verdict.not_met`]: "met",
          "prov.witness.stated": "{witnesses}: checked.",
        },
        "en",
      );
      for (const format of ["html", "embedded", "fragment"] as const) {
        const built = buildPresentation(bundle, {
          ...options,
          format,
          wording: misfit,
        });
        await expect(built, format).rejects.toThrow(PresentationBuildError);
        await expect(built, format).rejects.toThrow(
          new RegExp(
            `wording pack does not fit .*${grouping}\\.verdict\\.not_met and ${grouping}\\.verdict\\.met read alike`,
            "u",
          ),
        );
        await expect(built, format).rejects.toThrow(
          /prov\.witness\.stated: this line states what the page checked and can't be reworded/u,
        );
      }
      await expect(
        availablePackagings(bundle, { ...options, wording: misfit }),
      ).rejects.toThrow(/wording pack does not fit/u);
      // a pack that fits is built
      const fits = await buildPresentation(bundle, {
        ...options,
        format: "html",
        wording: await pack(
          { [`${grouping}.verdict.met`]: "established" },
          "en",
        ),
      });
      expect(fits.format).toBe("html");
    });

  // The same check, on the contract-report/v1 resolution path (the module
  // registered in place of the built-in, not the deprecated built-in the
  // loop above exercises): checkWordingFits's CONTRACT_REPORT_MANIFEST
  // branch reads the grouping from the bundle's data, not from a static
  // module-id table.
  for (const [file, module, grouping] of [
    ["outcome-report-bundle.json", "outcome-report", "lines"],
    ["compliance-bundle.json", "compliance", "groups"],
  ] as const)
    it(`a wording pack that does not fit is refused on the contract-report/v1 path too (${module})`, async () => {
      const source = fixture(file);
      (source.extensions as Obj)["contract-report/v1"] = {};
      const { bundle } = await sealEvidenceBundle(source);
      const options = {
        presentation: "auto",
        audience: "*",
        runtime: { code: "/*IIFE_MARKER*/" },
      } as const;
      const misfit = await pack(
        { [`${grouping}.verdict.not_met`]: "met" },
        "en",
      );
      const built = buildPresentation(bundle, {
        ...options,
        format: "html",
        wording: misfit,
      });
      await expect(built).rejects.toThrow(PresentationBuildError);
      await expect(built).rejects.toThrow(
        new RegExp(
          `wording pack does not fit .*${grouping}\\.verdict\\.not_met and ${grouping}\\.verdict\\.met read alike`,
          "u",
        ),
      );
      const fits = await buildPresentation(bundle, {
        ...options,
        format: "html",
        wording: await pack(
          { [`${grouping}.verdict.met`]: "established" },
          "en",
        ),
      });
      expect(fits.format).toBe("html");
    });
});

// ---------------------------------------------------------------------------
// The default path, the hand-back, scoping and refusals
// ---------------------------------------------------------------------------

describe("buildPresentation", () => {
  it("with the default settings writes exactly the page the emitter writes", async () => {
    for (const name of ["result-root-bundle.sealed.json", "week-bundle.json"]) {
      const bundle = fixture(name);
      const built = await buildPresentation(bundle, {
        presentation: "auto",
        audience: "*",
        format: "html",
        runtime: { code: "/*IIFE_MARKER*/" },
      });
      if (built.format !== "html") throw new Error("html expected");
      expect(built.html).toBe(emitEvidenceGraphHtml(bundle, "/*IIFE_MARKER*/"));
    }
  });

  it("refuses a fragment over the limit with a clear error, never a cut-down link", async () => {
    const bundle = fixture("week-bundle.json");
    await expect(
      buildPresentation(bundle, {
        presentation: "auto",
        audience: "*",
        format: "fragment",
        runtime: { code: "/*IIFE_MARKER*/" },
      }),
    ).rejects.toThrow(FragmentTooLargeError);
    const small = (await sealEvidenceBundle(fixture("report-rows-bundle.json")))
      .bundle;
    await expect(
      buildPresentation(small, {
        presentation: "auto",
        audience: "*",
        format: "fragment",
        runtime: { code: "/*IIFE_MARKER*/" },
        maxFragmentLength: 100,
      }),
    ).rejects.toThrow(/over the 100-character maximum/u);
  });

  it("scopes before encoding: withheld payloads are not in the fragment at all", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("report-date-only-bundle.json"),
    );
    const full = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "fragment",
      runtime: { code: runtime },
    });
    const scoped = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "counterparty",
      format: "fragment",
      runtime: { code: runtime },
      disclose: rootOnly(bundle),
    });
    if (full.format !== "fragment" || scoped.format !== "fragment")
      throw new Error("fragment expected");
    const kept = decodePresentationFragment(scoped.fragment).bundle as Obj;
    expect(Object.keys(kept.disclosures as Obj)).toEqual([
      (bundle as Obj).root,
    ]);
    expect(
      Object.keys((full.payload.bundle as Obj).disclosures as Obj).length,
    ).toBeGreaterThan(1);
    expect(scoped.fragment.length).toBeLessThan(full.fragment.length);
  });

  it("the hand-back refuses a different runtime or module set", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("report-rows-bundle.json"),
    );
    const module = { code: "/*module*/", sha256: hex("/*module*/") };
    const built = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "fragment",
      runtime: { code: "/*IIFE_MARKER*/" },
      modules: [module],
    });
    if (built.format !== "fragment") throw new Error("fragment expected");
    await expect(
      offlineHtmlFromFragment(built.fragment, { code: "/*other*/" }, [module]),
    ).rejects.toThrow(/not the one the fragment was built with/u);
    await expect(
      offlineHtmlFromFragment(built.fragment, { code: "/*IIFE_MARKER*/" }),
    ).rejects.toThrow(/not the ones the fragment was built with/u);
    const direct = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "html",
      runtime: { code: "/*IIFE_MARKER*/" },
      modules: [module],
    });
    if (direct.format !== "html") throw new Error("html expected");
    expect(
      await offlineHtmlFromFragment(
        built.fragment,
        { code: "/*IIFE_MARKER*/" },
        [module],
      ),
    ).toBe(direct.html);
  });

  it("refuses a requested presentation the registry does not select, and an ambiguous registry", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("report-rows-bundle.json"),
    );
    await expect(
      buildPresentation(bundle, {
        presentation: "aac.builtin.result/v0",
        audience: "*",
        format: "html",
        runtime: { code: "/*IIFE_MARKER*/" },
      }),
    ).rejects.toThrow(/registry selected aac.builtin.report-rows\/v0/u);
    const ok = await buildPresentation(bundle, {
      presentation: "aac.builtin.report-rows/v0",
      audience: "*",
      format: "html",
      runtime: { code: "/*IIFE_MARKER*/" },
    });
    expect(ok.module).toBe("aac.builtin.report-rows/v0");

    const twin = (id: string): PresentationModule => ({
      manifest: {
        spec_version: "aac.presentation-manifest/v0",
        id,
        presentation_api: "aac.presentation-api/v0",
        runtime_min: "0.1.0",
        trust_class: "trusted-executable",
        requires: { bundle_kind: "evidence-bundle/v2" },
        audiences: ["*"],
        formats: ["html"],
        fallback: false,
        priority: 1,
        executable: { carrier: "core-runtime" },
      },
      canRender: () => true,
      buildModel: () => null,
      render: () => undefined,
    });
    const modules = [twin("org.example.a/v0"), twin("org.example.b/v0")];
    // A resolver that skipped the registration test meets the tie at resolution.
    const ambiguous: PresentationResolver = {
      resolve: (_context, audience, format) =>
        resolveModules(
          modules,
          {
            verified: true,
            bundle_kind: "evidence-bundle/v2",
            profiles: new Set(),
            extensions: new Set(),
          },
          audience,
          format,
          () => true,
        ),
    };
    await expect(
      buildPresentation(bundle, {
        presentation: "auto",
        audience: "*",
        format: "html",
        runtime: { code: "/*IIFE_MARKER*/" },
        registry: ambiguous,
      }),
    ).rejects.toThrow(PresentationBuildError);
  });

  it("refuses to inline a module the page's runtime would refuse, naming both sides (contract 3.2)", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("report-rows-bundle.json"),
    );
    const code = "/*future module*/";
    const manifest = (
      overrides: Partial<PresentationManifest>,
    ): PresentationManifest => ({
      spec_version: "aac.presentation-manifest/v0",
      id: "org.example.future/v1",
      presentation_api: "aac.presentation-api/v0",
      runtime_min: "0.1.0",
      trust_class: "trusted-executable",
      requires: { bundle_kind: "evidence-bundle/v2" },
      audiences: ["*"],
      formats: ["html"],
      fallback: false,
      priority: 1,
      executable: { carrier: "module-slot", script_sha256: hex(code) },
      ...overrides,
    });
    const build = (
      m: PresentationManifest,
      format: PackagingTarget = "html",
    ): Promise<BuiltPresentation> =>
      buildPresentation(bundle, {
        presentation: "auto",
        audience: "*",
        format,
        runtime: { code: "/*IIFE_MARKER*/" },
        modules: [{ code, sha256: hex(code), manifest: m }],
      });

    // presentation_api the runtime does not implement: every packaging fails.
    const unsupported = manifest({
      presentation_api: "aac.presentation-api/v1",
    });
    for (const format of PACKAGING_TARGETS) {
      const err = await build(unsupported, format).then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(PresentationModuleRefusedError);
      expect(err).toBeInstanceOf(PresentationBuildError);
      const refused = err as PresentationModuleRefusedError;
      expect(refused.module).toEqual({
        id: "org.example.future/v1",
        presentation_api: "aac.presentation-api/v1",
        runtime_min: "0.1.0",
      });
      expect(refused.reason).toBe("presentation_api_unsupported");
      expect(refused.runtime).toEqual(REFERENCE_PRESENTATION_RUNTIME);
      expect(refused.message).toBe(
        "presentation module org.example.future/v1 (presentation_api aac.presentation-api/v1, runtime_min 0.1.0) would be refused by the page's runtime (implements aac.presentation-api/v0; runtime version 0.1.0): presentation_api_unsupported; no page is written",
      );
    }
    // availablePackagings treats it as an error of the request, not a target.
    await expect(
      availablePackagings(bundle, {
        presentation: "auto",
        audience: "*",
        runtime: { code: "/*IIFE_MARKER*/" },
        modules: [{ code, sha256: hex(code), manifest: unsupported }],
      }),
    ).rejects.toThrow(PresentationModuleRefusedError);

    // runtime_min newer than the runtime.
    await expect(build(manifest({ runtime_min: "0.2.0" }))).rejects.toThrow(
      "presentation module org.example.future/v1 (presentation_api aac.presentation-api/v0, runtime_min 0.2.0) would be refused by the page's runtime (implements aac.presentation-api/v0; runtime version 0.1.0): runtime_too_old; no page is written",
    );

    // A manifest that does not pin this script, or is malformed, is an error too.
    await expect(
      build(
        manifest({
          executable: { carrier: "module-slot", script_sha256: hex("other") },
        }),
      ),
    ).rejects.toThrow(/does not pin this module-slot script/u);
    await expect(
      build(manifest({ runtime_min: undefined as unknown as string })),
    ).rejects.toThrow(/runtime_min is not MAJOR.MINOR.PATCH/u);

    // The same module on the runtime's API is inlined, byte for byte as without a manifest.
    const accepted = await build(manifest({}));
    const plain = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "html",
      runtime: { code: "/*IIFE_MARKER*/" },
      modules: [{ code, sha256: hex(code) }],
    });
    if (accepted.format !== "html" || plain.format !== "html")
      throw new Error("html expected");
    expect(accepted.html).toBe(plain.html);
    expect(accepted.html).toContain(code);
  });

  describe("module stylesheet pins (contract 5.1)", () => {
    const code = "/*styled module*/";
    const first = hex(".m{color:red}");
    const second = hex(".n{color:blue}");
    const b64 = (pin: string): string =>
      `'sha256-${Buffer.from(pin, "hex").toString("base64")}'`;
    const styleSrc = (html: string): string =>
      /style-src ([^;"]*)/u.exec(html)![1]!;
    const manifest = (style?: readonly string[]): PresentationManifest => ({
      spec_version: "aac.presentation-manifest/v0",
      id: "org.example.styled/v0",
      presentation_api: "aac.presentation-api/v0",
      runtime_min: "0.1.0",
      trust_class: "trusted-executable",
      requires: { bundle_kind: "evidence-bundle/v2" },
      audiences: ["*"],
      formats: ["html"],
      fallback: false,
      priority: 1,
      executable: {
        carrier: "module-slot",
        script_sha256: hex(code),
        ...(style === undefined ? {} : { style_sha256: style }),
      },
    });
    const build = async (
      module: PresentationModuleScript,
      format: PackagingTarget = "html",
    ): Promise<BuiltPresentation> =>
      buildPresentation(
        (await sealEvidenceBundle(fixture("report-rows-bundle.json"))).bundle,
        {
          presentation: "auto",
          audience: "*",
          format,
          runtime: { code: "/*IIFE_MARKER*/" },
          modules: [module],
        },
      );
    const html = async (module: PresentationModuleScript): Promise<string> => {
      const built = await build(module);
      if (built.format !== "html") throw new Error("html expected");
      return built.html;
    };

    it("passes each module's style pins to the emitter, with or without a manifest", async () => {
      const { bundle } = await sealEvidenceBundle(
        fixture("report-rows-bundle.json"),
      );
      const emitted = emitEvidenceGraphHtml(bundle, "/*IIFE_MARKER*/", {
        modules: [{ code, sha256: hex(code), styleSha256: [first, second] }],
      });
      for (const module of [
        { code, sha256: hex(code), styleSha256: [first, second] },
        {
          code,
          sha256: hex(code),
          styleSha256: [first, second],
          manifest: manifest([first, second]),
        },
      ]) {
        const page = await html(module);
        expect(page).toBe(emitted);
        expect(styleSrc(page)).toContain(b64(first));
        expect(styleSrc(page)).toContain(b64(second));
      }
      // Without pins the page is the one it always was.
      const unpinned = await html({ code, sha256: hex(code) });
      expect(unpinned).toBe(
        emitEvidenceGraphHtml(bundle, "/*IIFE_MARKER*/", {
          modules: [{ code, sha256: hex(code) }],
        }),
      );
      expect(styleSrc(unpinned)).not.toContain(b64(first));
    });

    it("compares the manifest's style_sha256 with the module's pins as a set", async () => {
      const inOrder = await html({
        code,
        sha256: hex(code),
        styleSha256: [first, second],
        manifest: manifest([first, second]),
      });
      const reordered = await html({
        code,
        sha256: hex(code),
        styleSha256: [second, first, second],
        manifest: manifest([first, second]),
      });
      expect(styleSrc(reordered)).toContain(b64(first));
      expect(styleSrc(reordered)).toContain(b64(second));
      expect(inOrder).toContain(code);
      // No stylesheet on either side is equal too.
      await expect(
        html({ code, sha256: hex(code), manifest: manifest() }),
      ).resolves.toContain(code);
    });

    it("writes no page when they differ, in any packaging, and names both lists", async () => {
      const cases: [readonly string[] | undefined, readonly string[]][] = [
        [[first, second], [first]],
        [[first], [first, second]],
        [[second], [first]],
        [undefined, [first]],
        [[first], []],
      ];
      for (const [declared, carried] of cases) {
        const module = {
          code,
          sha256: hex(code),
          ...(carried.length === 0 ? {} : { styleSha256: carried }),
          manifest: manifest(declared),
        };
        for (const format of PACKAGING_TARGETS) {
          const err = await build(module, format).then(
            () => undefined,
            (e: unknown) => e,
          );
          expect(err, format).toBeInstanceOf(PresentationStylePinsError);
          expect(err).toBeInstanceOf(PresentationBuildError);
          const mismatch = err as PresentationStylePinsError;
          expect(mismatch.module).toBe("org.example.styled/v0");
          expect(mismatch.manifestStyleSha256).toEqual(declared ?? []);
          expect(mismatch.moduleStyleSha256).toEqual(carried);
          expect(mismatch.message).toBe(
            `module manifest org.example.styled/v0 style_sha256 [${(declared ?? []).join(", ")}] does not equal the module's style pins [${carried.join(", ")}] as a set; no page is written`,
          );
        }
      }
    });

    it("applies the same check when the offline file is rebuilt from a fragment", async () => {
      const module = {
        code,
        sha256: hex(code),
        styleSha256: [first],
        manifest: manifest([first]),
      };
      const built = await build(module, "fragment");
      const offline = await html(module);
      if (built.format !== "fragment") throw new Error("fragment expected");
      await expect(
        offlineHtmlFromFragment(built.fragment, { code: "/*IIFE_MARKER*/" }, [
          module,
        ]),
      ).resolves.toBe(offline);
      await expect(
        offlineHtmlFromFragment(built.fragment, { code: "/*IIFE_MARKER*/" }, [
          { ...module, styleSha256: [second] },
        ]),
      ).rejects.toThrow(PresentationStylePinsError);
    });
  });

  it("refuses a requested presentation the registry holds as refused, naming both sides", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("report-rows-bundle.json"),
    );
    // The fallback alone, so the refused module is ambiguous with nothing.
    const registry = new PresentationRegistry();
    registry.register(BUILTIN_PRESENTATIONS.at(-1)!);
    const registration = registry.register({
      manifest: {
        spec_version: "aac.presentation-manifest/v0",
        id: "org.example.newer/v0",
        presentation_api: "aac.presentation-api/v0",
        runtime_min: "0.3.0",
        trust_class: "trusted-executable",
        requires: {
          bundle_kind: "evidence-bundle/v2",
          extensions: { required: ["org.example.unused/v0"] },
        },
        audiences: ["*"],
        formats: ["html"],
        fallback: false,
        priority: 1,
        executable: { carrier: "core-runtime" },
      },
      canRender: () => {
        throw new Error("a refused module was called");
      },
      buildModel: () => {
        throw new Error("a refused module was called");
      },
      render: () => {
        throw new Error("a refused module was called");
      },
    });
    expect(registration.status).toBe("refused");
    const err = await buildPresentation(bundle, {
      presentation: "org.example.newer/v0",
      audience: "*",
      format: "html",
      runtime: { code: "/*IIFE_MARKER*/" },
      registry,
    }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(PresentationModuleRefusedError);
    expect((err as PresentationModuleRefusedError).reason).toBe(
      "runtime_too_old",
    );
    expect((err as Error).message).toBe(
      "presentation module org.example.newer/v0 (presentation_api aac.presentation-api/v0, runtime_min 0.3.0) would be refused by the page's runtime (implements aac.presentation-api/v0; runtime version 0.1.0): runtime_too_old; no page is written",
    );
    // "auto" is not a request for that module: the page renders as before.
    const auto = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "html",
      runtime: { code: "/*IIFE_MARKER*/" },
      registry,
    });
    expect(auto.module).toBe("aac.builtin.no-aggregate/v0");
  });

  it("needs the runtime for html and fragment, and an audience", async () => {
    const bundle = fixture("result-root-bundle.sealed.json");
    for (const format of ["html", "fragment"] as const)
      await expect(
        buildPresentation(bundle, {
          presentation: "auto",
          audience: "*",
          format,
        }),
      ).rejects.toThrow(/needs the core runtime/u);
    await expect(
      buildPresentation(bundle, {
        presentation: "auto",
        audience: "",
        format: "embedded",
      }),
    ).rejects.toThrow(/audience is required/u);
    const embedded = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "embedded",
      registry: createPresentationRegistry(),
    });
    expect(embedded.format).toBe("embedded");
  });

  it("the offline output carries the per-page CSP and no outbound reference", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("report-rows-bundle.json"),
    );
    for (const [audience, extra] of [
      ["*", {}],
      [
        "counterparty",
        {
          depth: "L1" as const,
          wording: await pack({ "page.title": "x" }, "en"),
        },
      ],
    ] as const) {
      const built = await buildPresentation(bundle, {
        presentation: "auto",
        audience,
        format: "html",
        runtime: { code: runtime },
        ...extra,
      });
      if (built.format !== "html") throw new Error("html expected");
      expect(built.html).toMatch(
        /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src [^"]+; connect-src 'none'; base-uri 'none'; form-action 'none'" \/>/u,
      );
      expect(built.html).not.toMatch(
        /<(?:script|link|img|iframe)[^>]+(?:src|href)=/iu,
      );
    }
    const viewer = buildFragmentViewerHtml({ code: runtime });
    expect(viewer).toContain("connect-src 'none'");
    expect(viewer).not.toMatch(
      /<(?:script|link|img|iframe)[^>]+(?:src|href)=/iu,
    );
  });

  it("an unreadable fragment shows a fixed statement and nothing else", async () => {
    const shown = await openPage(
      buildFragmentViewerHtml({ code: runtime }),
      "file:///viewer.html#not*base64",
    );
    expect(shown.refusals).toEqual(["fragment-unreadable"]);
    expect(shown.verify).toEqual([]);
  });
});

describe("the static page", () => {
  it("carries the html page's theme and title, and no bundle or code", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("compliance-bundle.json"),
    );
    const words = await pack({ "page.title": "Findings" }, "en");
    const settings = {
      presentation: "auto",
      audience: "*",
      themeCss: ":root{--aac-accent:#7a1f5c}",
      wording: words,
      depth: "L1" as const,
    };
    const statik = await buildPresentation(bundle, {
      ...settings,
      format: "static",
    });
    const html = await buildPresentation(bundle, {
      ...settings,
      format: "html",
      runtime: { code: runtime },
    });
    if (statik.format !== "static" || html.format !== "html")
      throw new Error("unexpected format");
    expect(statik.html).toContain("<title>Findings</title>");
    expect(statik.html).toContain("<style>:root{--aac-accent:#7a1f5c}</style>");
    expect(statik.html).not.toContain("__BUNDLE__");
    expect(statik.html).not.toMatch(/<script/iu);
    const { snapshot: shown, page } = openStatic(statik.html);
    expect(shown).toEqual(await openPage(html.html, "file:///themed.html"));
    expectStaticPage(page, "incomplete");
    // The card's own frame survives the static page too (capsule-viewer#60).
    expect(statik.html).toContain('<div id="app" class="cv-shell-chrome">');
  });

  it("every style it carries is in its CSP, by hash", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("outcome-report-bundle.json"),
    );
    const built = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "static",
    });
    if (built.format !== "static") throw new Error("static expected");
    // The page only: its snapshot would serialise and reparse all 14 MB of it.
    const page = staticDocument(built.html);
    const csp = page
      .querySelector('meta[http-equiv="Content-Security-Policy"]')!
      .getAttribute("content")!;
    const source = (text: string): string =>
      `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
    for (const style of page.querySelectorAll("style"))
      expect(csp).toContain(source(style.textContent ?? ""));
    const attributes = [...page.querySelectorAll("[style]")].map(
      (e) => e.getAttribute("style")!,
    );
    // The outcome report's bars carry their widths as style attributes.
    expect(attributes.length).toBeGreaterThan(0);
    expect(csp).toContain("'unsafe-hashes'");
    for (const value of attributes) expect(csp).toContain(source(value));
  });

  it("states a failed verification as computed at build time", async () => {
    const built = await buildPresentation(fixture("report-rows-bundle.json"), {
      presentation: "auto",
      audience: "*",
      format: "static",
    });
    if (built.format !== "static") throw new Error("static expected");
    expect(built.verification).toBe("failed");
    expect(built.resolution).toBe("refusal");
    expectStaticPage(staticDocument(built.html), "failed");
  });
});

// ---------------------------------------------------------------------------
// Go parity: go/emitter reads the same two files
// ---------------------------------------------------------------------------

/**
 * The Go twin (go/emitter/presentation.go) is pinned to these two files:
 * TestBuildOfflineHTMLMatchesTypeScript and
 * TestOfflineHTMLFromFragmentMatchesTypeScript. To regenerate after an
 * intentional change, run this file with UPDATE_PRESENTATION_GOLDENS=1.
 */
describe("the Go twin's goldens", () => {
  const goTestdata = (name: string): string =>
    resolve(process.cwd(), "..", "go", "emitter", "testdata", name);

  it("the offline file and the fragment that rebuilds it", async () => {
    const bundle = fixture("result-root-bundle.sealed.json");
    const words = await pack(
      { "page.title": "Résumé </script> & co" },
      "fr-CA",
    );
    const options = {
      presentation: "auto",
      audience: "counterparty",
      runtime: { code: "/*IIFE_MARKER*/" },
      depth: "L1" as const,
      themeCss: ":root{--aac-accent:#7a1f5c}",
      wording: words,
      disclose: rootOnly(bundle),
    };
    const html = await buildPresentation(bundle, {
      ...options,
      format: "html",
    });
    const fragment = await buildPresentation(bundle, {
      ...options,
      format: "fragment",
    });
    if (html.format !== "html" || fragment.format !== "fragment")
      throw new Error("unexpected format");
    expect(
      await offlineHtmlFromFragment(fragment.fragment, {
        code: "/*IIFE_MARKER*/",
      }),
    ).toBe(html.html);
    if (process.env.UPDATE_PRESENTATION_GOLDENS === "1") {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(goTestdata("expected-offline.html"), html.html);
      writeFileSync(
        goTestdata("offline-fragment.txt"),
        `${fragment.fragment}\n`,
      );
    }
    expect(html.html).toBe(
      readFileSync(goTestdata("expected-offline.html"), "utf8"),
    );
    expect(`${fragment.fragment}\n`).toBe(
      readFileSync(goTestdata("offline-fragment.txt"), "utf8"),
    );
  });

  it("the offline file and the fragment that rebuilds it, with a contract", async () => {
    const bundle = fixture("result-root-bundle.sealed.json");
    const text = readFileSync(
      testdata("contracts/example-support-outcomes.json"),
      "utf8",
    );
    const options = {
      presentation: "auto",
      audience: "counterparty",
      runtime: { code: "/*IIFE_MARKER*/" },
      depth: "L1" as const,
      contract: { text, sha256: hex(text) },
      disclose: rootOnly(bundle),
      maxFragmentLength: FRAGMENT_TOKEN_MAX_LENGTH,
    };
    const html = await buildPresentation(bundle, {
      ...options,
      format: "html",
    });
    const fragment = await buildPresentation(bundle, {
      ...options,
      format: "fragment",
    });
    if (html.format !== "html" || fragment.format !== "fragment")
      throw new Error("unexpected format");
    expect(fragment.payload.contract).toEqual(options.contract);
    // The page carries the contract's exact text in its render options.
    expect(html.html).toContain(`"contract":{"sha256":"${hex(text)}"`);
    expect(
      await offlineHtmlFromFragment(fragment.fragment, {
        code: "/*IIFE_MARKER*/",
      }),
    ).toBe(html.html);
    if (process.env.UPDATE_PRESENTATION_GOLDENS === "1") {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(goTestdata("expected-offline-contract.html"), html.html);
      writeFileSync(
        goTestdata("offline-fragment-contract.txt"),
        `${fragment.fragment}\n`,
      );
    }
    expect(html.html).toBe(
      readFileSync(goTestdata("expected-offline-contract.html"), "utf8"),
    );
    expect(`${fragment.fragment}\n`).toBe(
      readFileSync(goTestdata("offline-fragment-contract.txt"), "utf8"),
    );
  });
});

describe("the contract setting", () => {
  const text = '{"id":"c","version":"1","requirements":[{"id":"a"}]}';
  const base = (contract: { text: string; sha256: string }) => ({
    presentation: "auto",
    audience: "*",
    runtime: { code: "/*IIFE_MARKER*/" },
    contract,
  });

  it("is refused, in every packaging, when its bytes or its shape do not check", async () => {
    const bundle = fixture("result-root-bundle.sealed.json");
    const bad =
      '{"id":"c","version":"1","requirements":[{"id":"a","tier":"optional"}]}';
    for (const format of PACKAGING_TARGETS) {
      await expect(
        buildPresentation(bundle, {
          ...base({ text: bad, sha256: hex(bad) }),
          format,
        }),
      ).rejects.toThrow(
        new PresentationBuildError(
          'contract is not a compiled Evidence Contract: requirement "a" tier is not must_have or informational',
        ),
      );
      await expect(
        buildPresentation(bundle, {
          ...base({ text, sha256: hex(`${text} `) }),
          format,
        }),
      ).rejects.toThrow(/do not hash to its contract_sha256/u);
    }
    await expect(
      availablePackagings(bundle, base({ text: bad, sha256: hex(bad) })),
    ).rejects.toThrow(PresentationBuildError);
  });

  it("is refused by the hand-back when the fragment carries one that does not check, as in Go", async () => {
    const bundle = fixture("result-root-bundle.sealed.json");
    const built = await buildPresentation(bundle, {
      ...base({ text, sha256: hex(text) }),
      format: "fragment",
    });
    if (built.format !== "fragment") throw new Error("unexpected format");
    const { encodePresentationFragment } = await import(
      "../src/presentation-fragment.js"
    );
    const { fragment } = encodePresentationFragment({
      ...built.payload,
      contract: { text, sha256: "0".repeat(64) },
    });
    await expect(
      offlineHtmlFromFragment(fragment, { code: "/*IIFE_MARKER*/" }),
    ).rejects.toThrow(/do not hash to its contract_sha256/u);
  });

  it("leaves the page as it is without one, and reaches the page's render options with one", async () => {
    const bundle = fixture("result-root-bundle.sealed.json");
    const without = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      runtime: { code: "/*IIFE_MARKER*/" },
      format: "html",
    });
    const withIt = await buildPresentation(bundle, {
      ...base({ text, sha256: hex(text) }),
      format: "html",
    });
    if (without.format !== "html" || withIt.format !== "html")
      throw new Error("unexpected format");
    expect(without.html).not.toContain('"contract"');
    expect(withIt.html).toContain(
      `{"audience":"*","contract":{"sha256":"${hex(text)}","text":`,
    );
  });
});

// ---------------------------------------------------------------------------
// The static page keeps one copy of each conversation (capsule-viewer#67)
// ---------------------------------------------------------------------------

it("the static page: each record's entry is built, and a conversation's link target holds the chat", async () => {
  const source = fixture("result-root-bundle.json");
  const caseInput = ((source.disclosures as Obj)["case-1"] as Obj)
    .agent_input as Obj;
  caseInput.agent_interaction = {
    messages: [
      { role: "assistant", content: "Hi! How can I help you today?" },
      { role: "user", content: "Please cancel EHGLP3." },
      { role: "assistant", content: "Let me check it." },
      { role: "tool", content: '{"reservation_id":"EHGLP3"}' },
    ],
  };
  const { bundle, ids } = await sealEvidenceBundle(source);
  const id = ids["case-1"]!;
  const built = await buildPresentation(bundle, {
    presentation: "auto",
    audience: "*",
    format: "static",
    runtime: { code: runtime },
  });
  if (built.format !== "static") throw new Error("static expected");
  const page = openDom(built.html).window.document;
  // only the record entries are built ahead; nothing else changes (#67)
  expect(
    page.querySelectorAll('details.cv-record[data-body="pending"]'),
  ).toHaveLength(0);
  const anchor = page.getElementById(recordAddress(id))!;
  expect(anchor).not.toBeNull();
  const target = anchor.closest("details")!;
  expect(target.classList.contains("cv-record")).toBe(true);
  // the content, not only an open attribute: the chat is in the page
  expect(target.querySelectorAll("li.turn")).toHaveLength(4);
  expect(target.textContent).toContain("Please cancel EHGLP3.");
  // closed until a link lands on it
  expect(target.hasAttribute("open")).toBe(false);
  // one copy: the conversation's words appear once in the whole page
  expect(
    page.body.innerHTML.split("Hi! How can I help you today?").length - 1,
  ).toBe(1);
});

it("the static page holds each transcript at most once, and no transcript outside the records section, at every depth", async () => {
  const sealedConversation = async (): Promise<{ bundle: Obj; id: string }> => {
    const source = fixture("result-root-bundle.json");
    const caseInput = ((source.disclosures as Obj)["case-1"] as Obj)
      .agent_input as Obj;
    caseInput.agent_interaction = {
      messages: [{ role: "user", content: "UNIQUE-TRANSCRIPT-LINE" }],
    };
    const { bundle, ids } = await sealEvidenceBundle(source);
    return { bundle, id: ids["case-1"]! };
  };
  const { bundle: compliance } = await sealEvidenceBundle(
    fixture("compliance-bundle.json"),
  );
  const { bundle: result } = await sealedConversation();
  for (const bundle of [compliance, result])
    for (const depth of ["L0", "L1", "L2"] as const) {
      const built = await buildPresentation(bundle, {
        presentation: "auto",
        audience: "*",
        format: "static",
        depth,
        runtime: { code: runtime },
      });
      if (built.format !== "static") throw new Error("static expected");
      const page = openDom(built.html).window.document;
      // no transcript outside the records section: a card keeps only its
      // link, or, with no record to link to, its state note
      const outside = [...page.querySelectorAll(".chat li.turn")].filter(
        (turn) => turn.closest("details.cv-record") === null,
      );
      expect(outside, depth).toHaveLength(0);
      expect(
        page.body.innerHTML.split("UNIQUE-TRANSCRIPT-LINE").length - 1,
        depth,
      ).toBeLessThanOrEqual(1);
      // a card's conversation toggle keeps at most a state note
      for (const fold of page.querySelectorAll(
        'details[data-section="conversation"]',
      ))
        expect(fold.querySelector("li.turn"), depth).toBeNull();
    }
  // at L2 the compliance cards are drawn, so the check above saw their folds
  const l2 = await buildPresentation(compliance, {
    presentation: "auto",
    audience: "*",
    format: "static",
    depth: "L2",
    runtime: { code: runtime },
  });
  if (l2.format !== "static") throw new Error("static expected");
  expect(
    openDom(l2.html).window.document.querySelectorAll(
      'details[data-section="conversation"]',
    ).length,
  ).toBeGreaterThan(0);
});

it("the static page: a record carrying a capsule has an address under both ids, and its entry holds the carried conversation", async () => {
  const source = fixture("result-root-bundle.json");
  const { alias, carriedId } = await withCarriedCapsule(source, {
    agent_interaction: {
      messages: [{ role: "user", content: "CARRIED-CONVERSATION-LINE" }],
    },
  });
  const { bundle, ids } = await sealEvidenceBundle(source);
  const built = await buildPresentation(bundle, {
    presentation: "auto",
    audience: "*",
    format: "static",
    runtime: { code: runtime },
  });
  if (built.format !== "static") throw new Error("static expected");
  const page = openDom(built.html).window.document;
  const entry = page
    .getElementById(recordAddress(carriedId))!
    .closest("details.cv-record")!;
  expect(
    page.getElementById(recordAddress(ids[alias]!))!.closest("details"),
  ).toBe(entry);
  expect(entry.querySelectorAll("li.turn")).toHaveLength(1);
  expect(
    page.body.innerHTML.split("CARRIED-CONVERSATION-LINE").length - 1,
  ).toBe(1);
});

it("a static page at depth L1 shows an absent or mismatched conversation's state note in place, with no toggle opened by hand", async () => {
  const absent = await sealEvidenceBundle(fixture("compliance-bundle.json"));
  const source = fixture("compliance-bundle.json");
  // A transcript the session's claims cite that is not the case the
  // judge's reports name: the card says it is not shown.
  await withCarriedCapsule(source, {
    case: { benchmark: "tau2", domain: "airline", task_id: "9", trial: 9 },
    agent_interaction: { messages: [{ role: "user", content: "OTHER-CASE" }] },
  });
  const mismatch = await sealEvidenceBundle(source);
  for (const [name, { bundle }, state] of [
    ["absent", absent, "absent"],
    ["mismatch", mismatch, "mismatch"],
  ] as const) {
    const built = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "static",
      depth: "L1",
      runtime: { code: runtime },
    });
    if (built.format !== "static") throw new Error("static expected");
    const page = openDom(built.html).window.document;
    const folds = [
      ...page.querySelectorAll<HTMLElement>(
        'details[data-section="conversation"]',
      ),
    ];
    expect(folds.length, name).toBeGreaterThan(0);
    for (const fold of folds)
      expect(fold.getAttribute("data-body"), name).toBe("built");
    expect(
      page.querySelector(`[data-transcript="${state}"]`),
      name,
    ).not.toBeNull();
    // the carried conversation is drawn only in its record's entry
    for (const turn of page.querySelectorAll(".chat li.turn"))
      expect(turn.closest("details.cv-record"), name).not.toBeNull();
  }
});

// ---------------------------------------------------------------------------
// Every toggle's body is on the static page (capsule-viewer#67)
// ---------------------------------------------------------------------------

describe("the static page builds every toggle's body", () => {
  const staticPage = async (
    bundle: unknown,
    extra: Partial<BuildPresentationOptions> = {},
  ): Promise<Document> => {
    const built = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "static",
      depth: "L0",
      ...extra,
    });
    if (built.format !== "static") throw new Error("static expected");
    return openDom(built.html).window.document;
  };
  // The detail row a table row's toggle opens.
  const detailOf = (page: Document, toggle: Element): Element =>
    page.getElementById(
      toggle.querySelector(":scope > summary")!.getAttribute("aria-controls")!,
    )!;

  it("at depth L0, a closed test row of the compliance report opens onto its sessions", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("compliance-bundle.json"),
    );
    const page = await staticPage(bundle);
    expect(page.querySelectorAll('[data-body="pending"]')).toHaveLength(0);
    // L0 opens no toggle of the module's own
    expect(page.querySelectorAll("details.lv[open]")).toHaveLength(0);
    const rows = [...page.querySelectorAll('details[data-records="sessions"]')];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.hasAttribute("open")).toBe(false);
      // the content, not only an open attribute: each session and its
      // test-by-test body are in the row's detail
      const sessions = detailOf(page, row).querySelectorAll("article.session");
      expect(sessions.length).toBeGreaterThan(0);
      for (const session of sessions)
        expect(session.querySelector(".conv-slot .conv-b .ck")).not.toBeNull();
    }
  });

  it("at depth L0, a closed rule row and the proofs toggle of the outcome report hold their content", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("outcome-report-bundle.json"),
    );
    const page = await staticPage(bundle);
    expect(page.querySelectorAll('[data-body="pending"]')).toHaveLength(0);
    expect(page.querySelectorAll("details.lv[open]")).toHaveLength(0);
    const rules = [
      ...page.querySelectorAll<HTMLDetailsElement>(
        'details[data-drill^="rule:"]',
      ),
    ].filter((rule) => detailOf(page, rule).querySelector(".convs") !== null);
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.hasAttribute("open")).toBe(false);
      const list = detailOf(page, rule).querySelector<HTMLElement>(".convs")!;
      expect(list.children.length).toBeGreaterThan(0);
    }
    // every other closed toggle holds more than its summary
    for (const toggle of page.querySelectorAll<HTMLDetailsElement>(
      "details.lv:not(.rx)",
    ))
      expect(
        toggle.querySelector(":scope > :not(summary)"),
        toggle.querySelector(":scope > summary")?.textContent ?? "",
      ).not.toBeNull();
  });

  it("reports the page's size, and refuses a page over its budget", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("compliance-bundle.json"),
    );
    const settings = { presentation: "auto", audience: "*" } as const;
    const built = await buildPresentation(bundle, {
      ...settings,
      format: "static",
    });
    if (built.format !== "static") throw new Error("static expected");
    expect(built.bytes).toBe(Buffer.byteLength(built.html, "utf8"));
    expect(built.limit).toBe(STATIC_PAGE_DEFAULT_BUDGET);
    const limit = built.bytes - 1;
    const refused = buildPresentation(bundle, {
      ...settings,
      format: "static",
      maxStaticBytes: limit,
    });
    await expect(refused).rejects.toThrow(PackagingUnavailableError);
    await expect(refused).rejects.toMatchObject({
      reason: { code: "static-too-large", bytes: built.bytes, limit },
    });
    const report = await availablePackagings(bundle, {
      ...settings,
      maxStaticBytes: limit,
    });
    expect(report[3]).toMatchObject({
      target: "static",
      available: false,
      reason: { code: "static-too-large", bytes: built.bytes, limit },
    });
    await expect(
      buildPresentation(bundle, {
        ...settings,
        format: "static",
        maxStaticBytes: 0,
      }),
    ).rejects.toThrow(PresentationBuildError);
  });

  it("refuses, naming the toggle, a body it cannot build", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("report-rows-bundle.json"),
    );
    const unbuildable: PresentationModule = {
      manifest: {
        spec_version: "aac.presentation-manifest/v0",
        id: "org.example.unbuildable/v0",
        presentation_api: "aac.presentation-api/v0",
        runtime_min: "0.1.0",
        trust_class: "trusted-executable",
        requires: { bundle_kind: "evidence-bundle/v2" },
        audiences: ["*"],
        formats: ["html"],
        fallback: false,
        priority: 1,
        executable: { carrier: "core-runtime" },
      },
      canRender: () => true,
      buildModel: () => null,
      // A toggle whose body only its own listener builds: the static
      // builder cannot reach it.
      render: (_model, host) => {
        const toggle = document.createElement("details");
        toggle.dataset.body = "pending";
        const summary = document.createElement("summary");
        summary.textContent = "Built only on open";
        toggle.append(summary);
        host.L1.append(toggle);
      },
    };
    const registry: PresentationResolver = {
      resolve: (_context, audience, format) =>
        resolveModules(
          [unbuildable],
          {
            verified: true,
            bundle_kind: "evidence-bundle/v2",
            profiles: new Set(),
            extensions: new Set(),
          },
          audience,
          format,
          () => true,
        ),
    };
    await expect(
      buildPresentation(bundle, {
        presentation: "auto",
        audience: "*",
        format: "static",
        registry,
      }),
    ).rejects.toMatchObject({
      reason: {
        code: "static-body-unbuilt",
        unbuilt: ["Built only on open"],
      },
    });
  });
});
