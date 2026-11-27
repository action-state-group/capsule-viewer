// SPDX-License-Identifier: BSD-3-Clause
// What presentation-builder*.test.ts share: the jsdom host and page cleanup,
// the page runtime, opening each packaging and reading what it shows, and the
// (bundle, audience) acceptance table, which is split across files
// (capsule-viewer#466). Each test file calls usePresentationHarness() once,
// at its top level, so its own hooks build the runtime and close its pages.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { linkConversations } from "../../src/report-levels.js";
import {
  availablePackagings,
  buildFragmentViewerHtml,
  buildPresentation,
  offlineHtmlFromFragment,
  PACKAGING_TARGETS,
  STATIC_BUILD_TIME_STATEMENT,
  STATIC_NOT_SELF_VERIFYING,
  type BuildPresentationOptions,
  type BuiltPresentation,
  type PackagingAvailability,
  type PackagingTarget,
} from "../../src/presentation-builder.js";
import { type DisclosureScope } from "../../src/presentation-fragment.js";
import { sealEvidenceBundle } from "./sealed-bundle.js";

// this file keeps the node environment and gives the embedded packaging a
// jsdom document of its own, as result-root-emitter.test.ts does.
export const host = new JSDOM();
// Every page a test parses is closed after it: a static page of a month-scale
// report is tens of MB of DOM, and left open they pile up until the worker
// runs out of heap.
const opened: JSDOM[] = [];
export const openDom = (html: string): JSDOM => {
  const dom = new JSDOM(html);
  opened.push(dom);
  return dom;
};
globalThis.document = host.window.document;
globalThis.HTMLElement = host.window.HTMLElement;

export type Obj = Record<string, unknown>;
export const testdata = (name: string): string =>
  resolve(process.cwd(), "test", "testdata", name);
export const fixture = (name: string): Obj =>
  JSON.parse(readFileSync(testdata(name), "utf8")) as Obj;
export const hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

export let runtime: string;

// ---------------------------------------------------------------------------
// Rendering each packaging and reading what it shows
// ---------------------------------------------------------------------------

export interface Snapshot {
  readonly verify: (string | null)[];
  readonly pages: (string | null)[];
  readonly notices: (string | null)[];
  readonly refusals: (string | null)[];
  readonly evidence_ids: string[];
  readonly text: string;
  readonly html: string;
}

// The markup as HTML parsing reads it. A page drawn by script can hold a
// table row directly in its table; the same markup, parsed, gets the implied
// tbody. Comparing the parsed form compares what the markup means, so the
// static page (parsed) and the pages drawn in the reader's browser compare.
export const parsed = (html: string): string => {
  const holder = host.window.document.createElement("div");
  holder.innerHTML = html;
  return holder.innerHTML;
};

export function snapshot(root: Element): Snapshot {
  const values = (name: string): (string | null)[] =>
    [...root.querySelectorAll(`[${name}]`)].map((e) => e.getAttribute(name));
  return {
    verify: values("data-verify"),
    pages: values("data-page"),
    notices: values("data-notice"),
    refusals: values("data-refusal"),
    evidence_ids: [
      ...new Set(root.innerHTML.match(/[0-9a-f]{64}/gu) ?? []),
    ].sort(),
    text: (root.textContent ?? "").replace(/\s+/gu, " ").trim(),
    html: parsed(root.innerHTML),
  };
}

/**
 * The scripted page as the static page is built to show it: every toggle's
 * body built by the reader's own toggle, each toggle left open or closed as
 * it was, and each conversation kept once, in the records section
 * (capsule-viewer#67). Through the page's own toggle events, so it reads a
 * page whose script is not this file's copy of the modules.
 */
export function openEveryBody(root: Element): void {
  const view = root.ownerDocument.defaultView!;
  const tried = new Set<Element>();
  for (;;) {
    linkConversations(root);
    const pending = [
      ...root.querySelectorAll<HTMLDetailsElement>(
        'details[data-body="pending"]',
      ),
    ];
    if (pending.length === 0) return;
    for (const toggle of pending) {
      if (tried.has(toggle)) throw new Error("a toggle's body did not build");
      tried.add(toggle);
      const was = toggle.open;
      toggle.open = true;
      toggle.dispatchEvent(new view.Event("toggle"));
      toggle.open = was;
    }
  }
}

const done = (root: Element): boolean =>
  root.querySelector('[data-page="verification"]') !== null ||
  root.querySelector('[data-refusal="fragment-unreadable"]') !== null;

// Wait until the page has drawn its verification section and stopped changing.
// The deadline is a hang ceiling, not a work budget: the slowest page here
// settles in about 10 s at load 35, so five minutes fails only a page that
// never settles, and fails it with this message long before the suite's own
// ceiling (vitest.config.ts, capsule-viewer#433). It must stay below that
// ceiling: vitest does not cancel a timed-out test, so a loop with no end of
// its own would keep polling, and keep its page open, under the next tests.
const SETTLE_CEILING_MS = 5 * 60_000;
async function settled(
  root: Element,
  ceilingMs = SETTLE_CEILING_MS,
): Promise<Snapshot> {
  const deadline = Date.now() + ceilingMs;
  let last = "";
  let stable = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 15));
    const now = root.innerHTML;
    stable = done(root) && now === last ? stable + 1 : 0;
    last = now;
    if (stable >= 3) {
      openEveryBody(root);
      return snapshot(root);
    }
  }
  throw new Error("page did not settle");
}

/** Open a page in jsdom with its scripts running, as a browser would. */
export async function openPage(
  html: string,
  url: string,
  ceilingMs?: number,
  onClose?: (dom: JSDOM) => void,
): Promise<Snapshot> {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url,
    beforeParse(window) {
      Object.defineProperty(window, "crypto", { value: globalThis.crypto });
      Object.assign(window, { TextEncoder, TextDecoder });
    },
  });
  try {
    return await settled(dom.window.document.getElementById("app")!, ceilingMs);
  } finally {
    dom.window.close();
    onClose?.(dom);
  }
}

/** Register this file's hooks: build the page runtime, close every opened page. */
export function usePresentationHarness(): void {
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
  afterEach(() => {
    for (const dom of opened.splice(0)) dom.window.close();
  });
}

/**
 * Open a static page as a browser would, with scripting off (it has no
 * script to run; its CSP allows none). A static page of the outcome report
 * is about 14 MB and takes seconds of CPU to parse, so each test parses a
 * page once and passes the document on (capsule-viewer#433).
 */
export const staticDocument = (html: string): Document =>
  openDom(html).window.document;

/** What #app of a static page shows, and the page itself for the static checks. */
export function openStatic(html: string): {
  snapshot: Snapshot;
  page: Document;
} {
  const page = staticDocument(html);
  return { snapshot: snapshot(page.getElementById("app")!), page };
}

/** What every static page must say and carry, for one verification state. */
export function expectStaticPage(page: Document, verify: string): void {
  expect(page.querySelectorAll("script")).toHaveLength(0);
  expect(
    [...page.querySelectorAll("*")].flatMap((e) =>
      [...e.attributes].filter((a) => a.name.startsWith("on")),
    ),
  ).toEqual([]);
  const csp = page
    .querySelector('meta[http-equiv="Content-Security-Policy"]')!
    .getAttribute("content")!;
  expect(csp).toMatch(/^default-src 'none'; script-src 'none'; style-src /u);
  expect(csp).toContain("connect-src 'none'");
  const notice = page.querySelector(
    '[data-static-notice="not-self-verifying"]',
  )!;
  expect(notice.getAttribute("data-built-verification")).toBe(verify);
  const text = (notice.textContent ?? "").replace(/\s+/gu, " ");
  expect(text).toContain(STATIC_NOT_SELF_VERIFYING);
  expect(text).toContain(STATIC_BUILD_TIME_STATEMENT);
  expect(text).toContain(
    `when this page was built: ${
      verify === "verified"
        ? "verified"
        : verify === "incomplete"
          ? "incomplete (none of the bundle's checks failed, but some were not run)"
          : "did not verify"
    }.`,
  );
}

export type Outcome =
  | {
      readonly kind: "shown";
      readonly built: BuiltPresentation;
      readonly snapshot: Snapshot;
      /** The parsed page, for the static packaging. */
      readonly page?: Document;
    }
  | { readonly kind: "refused"; readonly error: string };

export async function showAll(
  bundle: unknown,
  options: Omit<BuildPresentationOptions, "format" | "runtime">,
): Promise<Record<PackagingTarget, Outcome>> {
  const out = {} as Record<PackagingTarget, Outcome>;
  for (const format of PACKAGING_TARGETS) {
    let built: BuiltPresentation;
    try {
      built = await buildPresentation(bundle, {
        ...options,
        format,
        runtime: { code: runtime },
      });
    } catch (err) {
      out[format] = {
        kind: "refused",
        error: `${(err as Error).name}: ${(err as Error).message}`,
      };
      continue;
    }
    let shown: Snapshot;
    let page: Document | undefined;
    if (built.format === "html")
      shown = await openPage(built.html, "file:///offline.html");
    else if (built.format === "fragment")
      shown = await openPage(
        buildFragmentViewerHtml({ code: runtime }),
        `file:///viewer.html#${built.fragment}`,
      );
    else if (built.format === "static")
      ({ snapshot: shown, page } = openStatic(built.html));
    else {
      const element = document.createElement("main");
      await built.mount(element);
      openEveryBody(element);
      shown = snapshot(element);
    }
    out[format] = {
      kind: "shown",
      built,
      snapshot: shown,
      ...(page === undefined ? {} : { page }),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// The (bundle, audience) table
// ---------------------------------------------------------------------------

// The fixtures: one per built-in page shape, plus a bundle that does not verify.
export const FIXTURES: readonly [string, string, boolean][] = [
  ["report rows", "report-rows-bundle.json", true],
  ["result + outcome report", "outcome-report-bundle.json", true],
  ["result + compliance", "compliance-bundle.json", true],
  ["result", "result-root-bundle.json", true],
  ["result (book form)", "result-root-book-bundle.json", true],
  ["evaluation summary graph", "report-date-only-bundle.json", true],
  ["does not verify", "report-rows-bundle.json", false],
];

export const rootOnly = (bundle: unknown): DisclosureScope => {
  const root = (bundle as Obj).root as string;
  return { [root]: ["agent_input", "agent_output"] };
};

// Audiences: the record holder sees the bundle as it is; a counterparty is
// shown the root's disclosures only; the public is shown no payload at all.
// Scoping is the builder's, before encoding.
export const AUDIENCES: readonly [
  string,
  (bundle: unknown) => DisclosureScope | undefined,
][] = [
  ["*", () => undefined],
  ["counterparty", rootOnly],
  ["public", () => ({})],
];

// What availablePackagings reported, in one line for the table.
const availabilityLine = (report: readonly PackagingAvailability[]): string =>
  report
    .map((a) =>
      a.available
        ? `${a.target} available`
        : `${a.target} unavailable (${a.reason.code}${a.reason.code === "fragment-too-large" ? ` ${a.reason.length} > ${a.reason.limit}` : ""})`,
    )
    .join(", ");

// The table is split across files so vitest runs its heaviest cases in
// parallel workers: each case of the 451-record outcome report takes one to
// two minutes, and in one file they ran one after another (capsule-viewer#466).
// Every (fixture, audience) pair belongs to exactly one part, and each part
// runs in exactly one file (presentation-builder.test.ts checks both).
const OUTCOME_REPORT = "result + outcome report";
export const MATRIX_PARTS = [
  "rest",
  "outcome-report *",
  "outcome-report counterparty",
  "outcome-report public",
] as const;
export type MatrixPart = (typeof MATRIX_PARTS)[number];
export const matrixPart = (label: string, audience: string): MatrixPart =>
  label === OUTCOME_REPORT
    ? (`outcome-report ${audience}` as MatrixPart)
    : "rest";

type Fixture = (typeof FIXTURES)[number];
type Audience = (typeof AUDIENCES)[number];
export const matrixCases = (
  part: MatrixPart,
): readonly (readonly [Fixture, Audience])[] =>
  FIXTURES.flatMap((f) =>
    AUDIENCES.filter(([audience]) => matrixPart(f[0], audience) === part).map(
      (a) => [f, a] as const,
    ),
  );

export function acceptanceMatrix(part: MatrixPart): void {
  const cases = matrixCases(part);
  describe("one builder, four packagings: acceptance over (bundle, audience) pairs", () => {
    const sealed = new Map<string, unknown>();
    beforeAll(async () => {
      for (const [, file, verifies] of new Map(
        cases.map(([fixture]) => [`${fixture[1]}:${fixture[2]}`, fixture]),
      ).values())
        sealed.set(
          `${file}:${verifies}`,
          verifies
            ? (await sealEvidenceBundle(fixture(file))).bundle
            : fixture(file),
        );
    });

    const table: string[] = [];

    for (const [[label, file, verifies], [audience, scope]] of cases)
      it(`${label} × ${audience}: every supported packaging shows the same verified content and identifiers`, async () => {
        const bundle = sealed.get(`${file}:${verifies}`);
        const disclose = scope(bundle);
        const settings = {
          presentation: "auto",
          audience,
          ...(disclose === undefined ? {} : { disclose }),
        };
        const outcome = await showAll(bundle, settings);
        const shown = Object.entries(outcome).filter(
          (e): e is [string, Extract<Outcome, { kind: "shown" }>] =>
            e[1].kind === "shown",
        );
        const refused = Object.entries(outcome).filter(
          (e): e is [string, Extract<Outcome, { kind: "refused" }>] =>
            e[1].kind === "refused",
        );

        if (!verifies && disclose !== undefined) {
          // Scoping a failing bundle is refused in every format alike.
          expect(shown).toEqual([]);
          for (const [, r] of refused)
            expect(r.error).toMatch(
              /refusing to scope a bundle that did not verify/u,
            );
          // Not a packaging question: availablePackagings throws the same.
          await expect(
            availablePackagings(bundle, {
              ...settings,
              runtime: { code: runtime },
            }),
          ).rejects.toThrow(/refusing to scope a bundle that did not verify/u);
          table.push(
            `${label} | ${audience} | refused in all four: cannot scope a failing bundle`,
          );
          return;
        }
        // The availability report agrees with what was built, target by target.
        const report = await availablePackagings(bundle, {
          ...settings,
          runtime: { code: runtime },
        });
        expect(report.map((a) => a.target)).toEqual([...PACKAGING_TARGETS]);
        for (const a of report) {
          expect(a.available, a.target).toBe(
            outcome[a.target].kind === "shown",
          );
          if (!a.available) {
            expect(a.reason.code).toBe("fragment-too-large");
            if (a.reason.code === "fragment-too-large")
              expect(a.reason.length).toBeGreaterThan(a.reason.limit);
          }
        }
        // Only a fragment too large for a URL may be refused, and only for size.
        for (const [format, r] of refused) {
          expect(format).toBe("fragment");
          expect(r.error).toMatch(/^FragmentTooLargeError/u);
        }
        expect(shown.length).toBeGreaterThanOrEqual(3);
        const [first, ...rest] = shown;
        for (const [name, s] of rest) {
          expect(s.built.module).toBe(first![1].built.module);
          expect(s.snapshot, `${name} against ${first![0]}`).toEqual(
            first![1].snapshot,
          );
        }
        const snap = first![1].snapshot;
        // Nothing in these fixtures is signed: a bundle whose checks pass is
        // incomplete, never verified (presentation contract 6.2).
        expect(snap.verify).toEqual([verifies ? "incomplete" : "failed"]);
        if (verifies) expect(snap.evidence_ids.length).toBeGreaterThan(0);

        // The static page: no script, the statement, the build-time state.
        const statik = outcome.static;
        expect(statik.kind).toBe("shown");
        if (statik.kind === "shown" && statik.built.format === "static") {
          expect(statik.built.verification).toBe(snap.verify[0]);
          expectStaticPage(statik.page!, snap.verify[0]!);
        }

        // The hand-back: the fragment rebuilds the exact offline file.
        const html = outcome.html;
        const fragment = outcome.fragment;
        if (html.kind === "shown" && fragment.kind === "shown") {
          expect(html.built.format).toBe("html");
          expect(fragment.built.format).toBe("fragment");
          if (
            html.built.format === "html" &&
            fragment.built.format === "fragment"
          )
            expect(
              await offlineHtmlFromFragment(fragment.built.fragment, {
                code: runtime,
              }),
            ).toBe(html.built.html);
        }
        table.push(
          `${label} | ${audience} | module ${first![1].built.module ?? first![1].built.resolution} | verify ${snap.verify.join(",")} | ids ${snap.evidence_ids.length} | identical across ${shown.map(([f]) => f).join("+")} | ${availabilityLine(report)}`,
        );
        // Every body of the 451-record outcome page is built in each packaging
        // (capsule-viewer#67), so this is the file's heaviest case: it runs
        // under the suite's hang ceiling, not a timeout of its own
        // (vitest.config.ts, capsule-viewer#433).
      });

    it("prints the table", () => {
      // Visible with --reporter=verbose; also a guard that the table ran.
      expect(table.length).toBe(cases.length);
      process.stdout.write(`\n${table.join("\n")}\n`);
    });
  });
}
