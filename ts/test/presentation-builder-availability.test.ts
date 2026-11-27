// SPDX-License-Identifier: BSD-3-Clause
import { beforeAll, describe, expect, it } from "vitest";
import {
  availablePackagings,
  buildPresentation,
  PackagingUnavailableError,
  STATIC_PAGE_DEFAULT_BUDGET,
} from "../src/presentation-builder.js";
import {
  FRAGMENT_TOKEN_DEFAULT_BUDGET,
  FRAGMENT_TOKEN_MAX_LENGTH,
  FragmentTooLargeError,
} from "../src/presentation-fragment.js";
import {
  resolveModules,
  type PresentationModule,
  type PresentationResolver,
} from "../src/presentation-registry.js";
import { monthlyComplianceFixture } from "./helpers/monthly-fixtures.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";
import {
  fixture,
  runtime,
  snapshot,
  openEveryBody,
  openPage,
  openStatic,
  expectStaticPage,
  usePresentationHarness,
} from "./helpers/presentation-harness.js";

// The packaging-availability tests, month-scale bundles included, in a file
// of their own so they run beside the rest (capsule-viewer#466).
usePresentationHarness();

// ---------------------------------------------------------------------------
// Packaging availability, monthly-scale bundles, and the static page
// ---------------------------------------------------------------------------

describe("packaging availability", () => {
  // A month of the compliance report, derived deterministically from the
  // committed two-session fixture: 40 sessions (about 490 KB of JCS) and 80
  // sessions (about 1 MB).
  const monthly = new Map<number, unknown>();
  beforeAll(async () => {
    for (const sessions of [40, 80])
      monthly.set(
        sessions,
        (await sealEvidenceBundle(monthlyComplianceFixture(sessions))).bundle,
      );
  });

  it("the monthly fixtures are deterministic and monthly-report scale", async () => {
    const again = (await sealEvidenceBundle(monthlyComplianceFixture(40)))
      .bundle;
    expect(JSON.stringify(again)).toBe(JSON.stringify(monthly.get(40)));
    const size = (n: number): number => JSON.stringify(monthly.get(n)).length;
    expect(size(40)).toBeGreaterThan(300_000);
    expect(size(40)).toBeLessThan(1_000_000);
    expect(size(80)).toBeGreaterThan(size(40));
  });

  for (const [sessions, raise] of [
    [40, false],
    [80, false],
    [80, true],
  ] as const)
    it(`a ${sessions}-session monthly report: the fragment is reported unavailable${raise ? " even at the maximum budget" : ""}, never a link`, async () => {
      const bundle = monthly.get(sessions);
      const settings = {
        presentation: "auto",
        audience: "*",
        runtime: { code: runtime },
        ...(raise ? { maxFragmentLength: FRAGMENT_TOKEN_MAX_LENGTH } : {}),
      };
      const report = await availablePackagings(bundle, settings);
      const limit = raise
        ? FRAGMENT_TOKEN_MAX_LENGTH
        : FRAGMENT_TOKEN_DEFAULT_BUDGET;
      expect(report.map((a) => [a.target, a.available])).toEqual([
        ["html", true],
        ["fragment", false],
        ["embedded", true],
        ["static", true],
      ]);
      const fragment = report[1]!;
      if (fragment.available) throw new Error("fragment reported available");
      expect(fragment.reason).toMatchObject({
        code: "fragment-too-large",
        subject: "fragment token",
        limit,
      });
      if (fragment.reason.code !== "fragment-too-large")
        throw new Error("unexpected reason");
      expect(fragment.reason.length).toBeGreaterThan(limit);
      expect(fragment.reason.message).toContain(
        `${fragment.reason.length} characters, over the ${limit}-character maximum`,
      );
      // A direct call keeps its error: no link is ever returned.
      await expect(
        buildPresentation(bundle, { ...settings, format: "fragment" }),
      ).rejects.toThrow(FragmentTooLargeError);
      // The budget is read by the fragment packaging only
      // (src/presentation-builder.ts, packageAs), so the other packagings of
      // this bundle are the 80-session case's, checked there; building and
      // opening them again here cost minutes under load (capsule-viewer#433).
      if (raise) return;

      // The supported packagings show the same thing.
      const html = await buildPresentation(bundle, {
        ...settings,
        format: "html",
      });
      const statik = await buildPresentation(bundle, {
        ...settings,
        format: "static",
      });
      const embedded = await buildPresentation(bundle, {
        ...settings,
        format: "embedded",
      });
      if (
        html.format !== "html" ||
        statik.format !== "static" ||
        embedded.format !== "embedded"
      )
        throw new Error("unexpected format");
      const element = document.createElement("main");
      await embedded.mount(element);
      openEveryBody(element);
      const fromEmbedded = snapshot(element);
      const { snapshot: fromStatic, page } = openStatic(statik.html);
      expect(fromStatic).toEqual(fromEmbedded);
      expect(await openPage(html.html, "file:///monthly.html")).toEqual(
        fromStatic,
      );
      expect(fromStatic.verify).toEqual(["incomplete"]);
      expect(fromStatic.pages).toContain("verification");
      expectStaticPage(page, "incomplete");
      // Every toggle's body is built, and the page stays in its budget.
      expect(page.querySelectorAll('[data-body="pending"]')).toHaveLength(0);
      expect(statik.bytes).toBeLessThan(STATIC_PAGE_DEFAULT_BUDGET);
    });

  it("reports a missing runtime for html and fragment, and a missing DOM for static", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("report-rows-bundle.json"),
    );
    const report = await availablePackagings(bundle, {
      presentation: "auto",
      audience: "*",
    });
    expect(
      report.map((a) => [a.target, a.available ? "ok" : a.reason.code]),
    ).toEqual([
      ["html", "runtime-missing"],
      ["fragment", "runtime-missing"],
      ["embedded", "ok"],
      ["static", "ok"],
    ]);
    const saved = globalThis.document;
    try {
      Reflect.deleteProperty(globalThis, "document");
      const noDom = await availablePackagings(bundle, {
        presentation: "auto",
        audience: "*",
        runtime: { code: "/*IIFE_MARKER*/" },
      });
      expect(noDom[3]).toMatchObject({
        target: "static",
        available: false,
        reason: { code: "no-document" },
      });
      await expect(
        buildPresentation(bundle, {
          presentation: "auto",
          audience: "*",
          format: "static",
        }),
      ).rejects.toThrow(PackagingUnavailableError);
    } finally {
      globalThis.document = saved;
    }
  });

  it("a static page is refused, and reported, when a module writes a script", async () => {
    const { bundle } = await sealEvidenceBundle(
      fixture("report-rows-bundle.json"),
    );
    const scripted: PresentationModule = {
      manifest: {
        spec_version: "aac.presentation-manifest/v0",
        id: "org.example.scripted/v0",
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
      render: (_model, host) => {
        const button = document.createElement("button");
        button.setAttribute("onclick", "alert(1)");
        host.L1.append(button);
      },
    };
    const registry: PresentationResolver = {
      resolve: (_context, audience, format) =>
        resolveModules(
          [scripted],
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
    const report = await availablePackagings(bundle, {
      presentation: "auto",
      audience: "*",
      registry,
    });
    expect(report[3]).toMatchObject({
      target: "static",
      available: false,
      reason: { code: "static-carries-script" },
    });
  });
});
