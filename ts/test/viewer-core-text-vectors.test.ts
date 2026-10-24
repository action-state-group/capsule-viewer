// SPDX-License-Identifier: BSD-3-Clause
// The core's fixed text against AAC's vectors/viewer-core-text/ (presentation
// contract sections 6.1, 6.2 and 8; capsule-viewer#79): this viewer draws
// exactly one banner state at a time with the vector's line, the refusal and
// the unable-to-verify lines in the vector's words, and every check-list line
// as the vector writes it. `checking` is drawn before the digests are
// computed and replaced by the final state, and a module that alters the
// banner is discarded for the refusal.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve as resolvePath } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHECKED_ON_THIS_PAGE,
  CHECKS_SCOPE_LINE,
  FAILED_ON_THIS_PAGE,
  FULL_VERIFIER_LINE,
  NOT_CHECKED_ON_THIS_PAGE,
  PresentationRegistry,
  setSha256FallbackForTesting,
  VERIFICATION_CHECK_TECHNICAL_NAMES,
  type PresentationManifest,
  type PresentationModule,
} from "@action-state-group/agent-action-capsule";
import {
  renderEvidenceGraph,
  UNABLE_TO_VERIFY_LINES,
} from "../src/evidence-graph-view.js";
import { buildPresentation } from "../src/presentation-builder.js";
import { sealEvidenceBundle, TEST_KEYS } from "./helpers/sealed-bundle.js";

// A DOM constructed directly with jsdom rather than a whole-file environment
// override: under the jsdom environment the signed checkpoint's bytes come
// from another realm and the page cannot check them.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new () => { window: Window & typeof globalThis };
};
const dom = new JSDOM();
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
const { MutationObserver } = dom.window;

type Obj = Record<string, unknown>;

const DIR = resolvePath(
  process.cwd(),
  "test",
  "testdata",
  "aac-vectors",
  "viewer-core-text",
);
const sha256 = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

interface WireBannerState {
  readonly id: string;
  readonly data_verify: string;
  readonly data_verdict: string | null;
  readonly records_shown: boolean;
  readonly line: string;
}
interface CoreText {
  readonly banner: readonly WireBannerState[];
  readonly refusal: string;
  readonly unable: {
    readonly reason: string;
    readonly command: string;
    readonly no_command: string;
  };
  readonly check_lists: {
    readonly headings: {
      readonly page: string;
      readonly failed: string;
      readonly not_checked: string;
    };
    readonly lines: readonly {
      readonly id: string;
      readonly words: string;
      readonly technical_name: string;
    }[];
    readonly checkpoint_not_checked_note: string;
    readonly full_verifier: string;
    readonly scope: string;
  };
}
const corpus = JSON.parse(
  readFileSync(resolvePath(DIR, "core-text.json"), "utf8"),
) as CoreText;
const state = (id: string): WireBannerState =>
  corpus.banner.find((entry) => entry.id === id)!;

// A two-record bundle: a deal root citing one act, each disclosing a payload.
const SOURCE = (keyId?: string): Obj => ({
  root: "deal",
  records: [
    { capsule_id: "act", ...(keyId ? { key_id: keyId } : {}) },
    {
      capsule_id: "deal",
      ...(keyId ? { key_id: keyId } : {}),
      chain: { parent_capsule_id: "act", relation: "derived_from" },
    },
  ],
  disclosures: {
    act: { agent_output: { step: "act", amount: 1 } },
    deal: { agent_input: { spec_version: "x-example-deal/v0", step: "open" } },
  },
});

function tamperPayload(bundle: Obj): Obj {
  const disclosures = structuredClone(bundle.disclosures) as Record<
    string,
    Record<string, Obj>
  >;
  Object.values(disclosures).find(
    (value) => value.agent_output !== undefined,
  )!.agent_output!.amount = 2;
  return { ...bundle, disclosures };
}

async function render(
  bundle: unknown,
  registry?: PresentationRegistry,
): Promise<HTMLElement> {
  const root = document.createElement("main");
  await renderEvidenceGraph(
    bundle,
    root,
    undefined,
    registry === undefined ? {} : { registry },
  );
  return root;
}

// The banner, its data attributes and the refusal after it.
function expectState(root: HTMLElement, expected: WireBannerState): void {
  const banners = root.querySelectorAll<HTMLElement>("[data-verify]");
  expect(banners).toHaveLength(1);
  const banner = banners[0]!;
  expect(banner.textContent).toBe(expected.line);
  expect(banner.dataset.verify).toBe(expected.data_verify);
  expect(banner.dataset.verdict ?? null).toBe(expected.data_verdict);
  const refusal = root.querySelector('[data-refusal="unverified-bundle"]');
  expect(refusal !== null).toBe(
    expected.data_verify === "failed" && !expected.records_shown,
  );
  if (refusal !== null) expect(refusal.textContent).toBe(corpus.refusal);
  if (expected.data_verify === "checking" || expected.data_verify === "unable")
    return;
  // Records are drawn exactly when the checks allow them.
  expect(root.querySelector('[data-region="L0"]') !== null).toBe(
    expected.records_shown,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  setSha256FallbackForTesting(true);
});

describe("the vendored vectors/viewer-core-text", () => {
  it("are byte copies: every file matches its SHA256SUMS line", () => {
    const sums = readFileSync(resolvePath(DIR, "SHA256SUMS"), "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split(/\s+/u) as [string, string]);
    expect(sums.map(([, name]) => name).sort()).toEqual([
      "README.md",
      "core-text.json",
      "manifest.json",
    ]);
    for (const [digest, name] of sums)
      expect(sha256(readFileSync(resolvePath(DIR, name))), name).toBe(digest);
  });

  it("this viewer's fixed lines are the vector's", () => {
    expect(UNABLE_TO_VERIFY_LINES).toEqual({
      banner: state("unable").line,
      reason: corpus.unable.reason,
      command: corpus.unable.command,
      noCommand: corpus.unable.no_command,
    });
    const lists = corpus.check_lists;
    expect([
      CHECKED_ON_THIS_PAGE,
      FAILED_ON_THIS_PAGE,
      NOT_CHECKED_ON_THIS_PAGE,
      FULL_VERIFIER_LINE,
      CHECKS_SCOPE_LINE,
    ]).toEqual([
      lists.headings.page,
      lists.headings.failed,
      lists.headings.not_checked,
      lists.full_verifier,
      lists.scope,
    ]);
  });
});

describe("one page per banner state", () => {
  it("verified: every signature checked here", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE(TEST_KEYS.a), {
      signCheckpoint: true,
    });
    const root = await render(bundle);
    expectState(root, state("verified"));
    expect(root.querySelector("[data-banner-detail]")).toBeNull();
    expect(root.firstElementChild!.className).toBe("cv-shell-bar");
  });

  it("incomplete, with a not-checked list: one record is not signed", async () => {
    const { bundle } = await sealEvidenceBundle(
      {
        ...SOURCE(TEST_KEYS.a),
        records: [
          { capsule_id: "act" },
          {
            capsule_id: "deal",
            key_id: TEST_KEYS.a,
            chain: { parent_capsule_id: "act", relation: "derived_from" },
          },
        ],
      },
      { signCheckpoint: true },
    );
    const root = await render(bundle);
    expectState(root, state("incomplete"));
    expect(
      root.querySelector(
        '[data-page="verification"] [data-checks="not-checked"]',
      ),
    ).not.toBeNull();
  });

  it("incomplete, with no not-checked list: nothing is signed", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE());
    const root = await render(bundle);
    expectState(root, state("incomplete-no-list"));
    expect(
      root.querySelector(
        '[data-page="verification"] [data-checks="not-checked"]',
      ),
    ).toBeNull();
    // The details line follows the bar and names the verifier's findings.
    const detail = root.querySelector<HTMLElement>("[data-banner-detail]")!;
    expect(detail.previousElementSibling!.className).toBe(
      "cv-shell-bar cv-incomplete",
    );
    expect(detail.textContent).toContain("checkpoint_signature_absent");
  });

  it("failed, records still shown: a record bound to no log position", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE(TEST_KEYS.a), {
      signCheckpoint: true,
      uncheckpointed: ["act"],
    });
    const root = await render(bundle);
    expectState(root, state("failed"));
    expect(root.querySelector("[data-banner-detail]")?.textContent).toBe(
      "1 of 2 records are uncheckpointed (bound to no log position), so per-record membership fails.",
    );
    expect(root.firstElementChild!.className).toBe("cv-shell-bar cv-failed");
  });

  it("refused: a tampered payload", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE(TEST_KEYS.a), {
      signCheckpoint: true,
    });
    const root = await render(tamperPayload(bundle));
    expectState(root, state("refused"));
    expect(root.querySelector("[data-banner-detail]")).toBeNull();
    expect(root.firstElementChild!.className).toBe("cv-shell-bar cv-failed");
  });

  it("unable to verify: no SHA-256 at all, never drawn as failed", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE());
    vi.stubGlobal("crypto", undefined);
    setSha256FallbackForTesting(false);
    const root = await render(bundle);
    expectState(root, state("unable"));
    expect(root.querySelector('[data-verify="failed"]')).toBeNull();
  });
});

describe("check-list lines", () => {
  it("every drawn line is the vector's words, under the vector's heading", async () => {
    const seen = new Set<string>();
    const sealed = [
      await sealEvidenceBundle(SOURCE(TEST_KEYS.a), { signCheckpoint: true }),
      await sealEvidenceBundle(SOURCE()),
      await sealEvidenceBundle(
        {
          ...SOURCE(TEST_KEYS.a),
          records: [{ capsule_id: "act" }, ...(SOURCE().records as Obj[])],
        },
        { signCheckpoint: true },
      ),
    ];
    const pages = [
      ...sealed.map(({ bundle }) => bundle),
      tamperPayload(sealed[0]!.bundle),
    ];
    for (const bundle of pages) {
      const root = await render(bundle);
      for (const list of root.querySelectorAll<HTMLElement>(
        "ul[data-checks]",
      )) {
        const which = list.dataset.checks!;
        const heading = list.previousElementSibling!.textContent;
        expect(heading).toBe(
          which === "page"
            ? corpus.check_lists.headings.page
            : which === "failed"
              ? corpus.check_lists.headings.failed
              : corpus.check_lists.headings.not_checked,
        );
        for (const item of list.querySelectorAll<HTMLElement>(
          "li[data-check]",
        )) {
          const id = item.dataset.check!;
          const line = corpus.check_lists.lines.find((l) => l.id === id);
          expect(line, id).toBeDefined();
          const words =
            which === "not-checked" && id === "checkpoint-signature"
              ? `${line!.words} ${corpus.check_lists.checkpoint_not_checked_note}`
              : line!.words;
          expect(item.textContent, `${which} ${id}`).toBe(words);
          expect(
            VERIFICATION_CHECK_TECHNICAL_NAMES[
              id as keyof typeof VERIFICATION_CHECK_TECHNICAL_NAMES
            ],
          ).toBe(line!.technical_name);
          seen.add(id);
        }
      }
    }
    // The pages above draw lines from all three lists.
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe("checking", () => {
  // A slow hash: every SHA-256 waits on `release`, so the page is held in
  // the checking state until the test lets the digests through.
  function holdDigests(): () => void {
    const real = globalThis.crypto.subtle;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const subtle = new Proxy(real, {
      get(target, name) {
        if (name === "digest")
          return async (...args: Parameters<SubtleCrypto["digest"]>) => {
            await gate;
            return target.digest(...args);
          };
        const value = Reflect.get(target, name) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    vi.stubGlobal("crypto", {
      subtle,
      getRandomValues: globalThis.crypto.getRandomValues.bind(
        globalThis.crypto,
      ),
    });
    return release;
  }

  it("is drawn alone before the checks finish, then replaced by the final state", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE(TEST_KEYS.a), {
      signCheckpoint: true,
    });
    const release = holdDigests();
    const root = document.createElement("main");
    root.append("previous page");
    const done = renderEvidenceGraph(bundle, root);
    // Let every microtask before the first digest run.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expectState(root, state("checking"));
    expect(root.childNodes).toHaveLength(1);
    expect(root.querySelector('[data-verify="verified"]')).toBeNull();
    release();
    await done;
    expectState(root, state("verified"));
    expect(root.querySelector('[data-verify="checking"]')).toBeNull();
  });

  it("is drawn for a bundle that turns out to fail, which then shows failed, never verified on the way", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE(TEST_KEYS.a), {
      signCheckpoint: true,
    });
    const release = holdDigests();
    const root = document.createElement("main");
    const seen: string[] = [];
    const observer = new MutationObserver(() => {
      const verify =
        root.querySelector<HTMLElement>("[data-verify]")?.dataset.verify;
      if (verify !== undefined && seen.at(-1) !== verify) seen.push(verify);
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    const done = renderEvidenceGraph(tamperPayload(bundle), root);
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    await done;
    await new Promise((resolve) => setTimeout(resolve, 0));
    observer.disconnect();
    expect(seen).toEqual(["checking", "failed"]);
  });

  // Two renders on one root whose module models wait on `gates`, then fail.
  async function overlapping(order: readonly ("a" | "b")[]): Promise<string> {
    const { bundle } = await sealEvidenceBundle(SOURCE());
    const gates: Record<string, () => void> = {};
    const registryFor = (name: string): PresentationRegistry => {
      const registry = new PresentationRegistry();
      registry.register({
        ...testModule(() => {}),
        buildModel: () =>
          new Promise((_, reject) => {
            gates[name] = () => reject(new Error(`${name} failed`));
          }),
      });
      return registry;
    };
    const root = document.createElement("main");
    root.append("previous page");
    const a = renderEvidenceGraph(bundle, root, undefined, {
      registry: registryFor("a"),
    }).catch(() => {});
    const b = renderEvidenceGraph(bundle, root, undefined, {
      registry: registryFor("b"),
    }).catch(() => {});
    while (gates.a === undefined || gates.b === undefined)
      await new Promise((resolve) => setTimeout(resolve, 5));
    const done = { a, b };
    for (const name of order) {
      gates[name]!();
      await done[name];
    }
    return root.textContent ?? "";
  }

  it("puts back what the root held when two overlapping renders both reject, in either order", async () => {
    expect(await overlapping(["a", "b"])).toBe("previous page");
    expect(await overlapping(["b", "a"])).toBe("previous page");
  });

  it("puts back what the root held when rendering rejects", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE());
    const registry = new PresentationRegistry();
    registry.register({
      ...testModule(() => {}),
      buildModel: () => {
        throw new Error("model failed");
      },
    });
    const root = document.createElement("main");
    root.append("previous page");
    await expect(
      renderEvidenceGraph(bundle, root, undefined, { registry }),
    ).rejects.toThrow("model failed");
    expect(root.textContent).toBe("previous page");
  });
});

// A page module for this file's bundles (no profile, no extension) that
// draws one marker, then does `tamper` to the page root.
function testModule(tamper: (root: HTMLElement) => void): PresentationModule {
  const manifest = {
    spec_version: "aac.presentation-manifest/v0",
    id: "org.example.banner-test/v0",
    presentation_api: "aac.presentation-api/v0",
    runtime_min: "0.1.0",
    trust_class: "trusted-executable",
    requires: { bundle_kind: "evidence-bundle/v2" },
    audiences: ["*"],
    formats: ["html", "fragment", "embedded"],
    fallback: false,
    priority: 1,
    executable: { carrier: "module-slot", script_sha256: "0".repeat(64) },
  } as PresentationManifest;
  return {
    manifest,
    canRender: () => true,
    buildModel: () => ({}),
    render: (_model, host) => {
      const marker = document.createElement("p");
      marker.dataset.testModule = "";
      host.L1.append(marker);
      tamper(host.L1.parentElement!);
    },
  };
}

describe("a module that alters the banner is discarded for the refusal", () => {
  const cases: [string, (root: HTMLElement) => void][] = [
    [
      "rewrites the line",
      (root) => {
        root.querySelector("[data-verify]")!.textContent = "All good";
      },
    ],
    [
      "changes data-verify",
      (root) => {
        root
          .querySelector("[data-verify]")!
          .setAttribute("data-verify", "verified");
      },
    ],
    [
      "hides the bar",
      (root) => {
        (root.querySelector(".cv-shell-bar") as HTMLElement).hidden = true;
      },
    ],
    [
      "removes the details line",
      (root) => {
        root.querySelector("[data-banner-detail]")!.remove();
      },
    ],
    [
      "draws a second banner",
      (root) => {
        const fake = document.createElement("span");
        fake.dataset.verify = "verified";
        root.append(fake);
      },
    ],
    [
      "puts words before the banner",
      (root) => {
        root.prepend("Verified ✓");
      },
    ],
  ];
  for (const [name, tamper] of cases)
    it(`one that ${name}`, async () => {
      // Nothing is signed, so the page has a details line to protect.
      const { bundle } = await sealEvidenceBundle(SOURCE());
      const registry = new PresentationRegistry();
      registry.register(testModule(tamper));
      const root = await render(bundle, registry);
      expect(root.querySelectorAll("[data-test-module]")).toHaveLength(0);
      expect(
        root.querySelector('[data-refusal="presentation-failed"]'),
      ).not.toBeNull();
      expectState(root, state("incomplete-no-list"));
      expect(root.querySelectorAll("[data-banner-detail]")).toHaveLength(1);
    });

  it("one whose stylesheet hides the banner, on a page in a document", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE());
    const registry = new PresentationRegistry();
    registry.register(
      testModule((root) => {
        const style = document.createElement("style");
        style.textContent =
          "[data-verify],[data-banner-detail]{display:none!important}";
        root.querySelector('[data-region="L1"]')!.append(style);
      }),
    );
    const root = document.createElement("main");
    document.body.append(root);
    try {
      await renderEvidenceGraph(bundle, root, undefined, { registry });
      expect(root.querySelectorAll("[data-test-module]")).toHaveLength(0);
      expect(root.querySelector("style:not([data-page] style)")).toBeNull();
      expect(
        root.querySelector('[data-refusal="presentation-failed"]'),
      ).not.toBeNull();
      expectState(root, state("incomplete-no-list"));
    } finally {
      root.remove();
    }
  });

  for (const rule of [
    ".cv-pill,[data-banner-detail]{color:transparent!important}",
    "[data-verify]{font-size:0!important}",
    "[data-verify]{opacity:0.01!important}",
    "[data-banner-detail]{transform:scale(0)!important}",
    ".cv-shell-bar{position:absolute!important;left:-99999px!important}",
    ".cv-shell-bar{overflow:hidden!important;max-height:0!important}",
  ])
    it(`one whose stylesheet restyles the banner (${rule}), in a document`, async () => {
      const { bundle } = await sealEvidenceBundle(SOURCE());
      const registry = new PresentationRegistry();
      registry.register(
        testModule((root) => {
          const style = document.createElement("style");
          style.textContent = rule;
          root.querySelector('[data-region="L1"]')!.append(style);
        }),
      );
      const root = document.createElement("main");
      document.body.append(root);
      try {
        await renderEvidenceGraph(bundle, root, undefined, { registry });
        expect(root.querySelectorAll("[data-test-module]")).toHaveLength(0);
        expect(
          root.querySelector('[data-refusal="presentation-failed"]'),
        ).not.toBeNull();
      } finally {
        root.remove();
      }
    });

  it("one that asks for its chrome and styles only its own content renders, in a document", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE());
    const registry = new PresentationRegistry();
    const module = testModule((root) => {
      const style = document.createElement("style");
      style.textContent = "[data-test-module]{color:red;font-size:30px}";
      root.querySelector('[data-region="L1"]')!.append(style);
    });
    const render = module.render;
    registry.register({
      ...module,
      render: (model, host, services) => {
        host.setChromeClass("oi");
        return render(model, host, services);
      },
    });
    // The page's own chrome rule restyles the bar; that is not the module's.
    const core = document.createElement("style");
    core.textContent = "main.cv-shell-chrome .cv-shell-bar{color:blue}";
    document.head.append(core);
    const root = document.createElement("main");
    document.body.append(root);
    try {
      await renderEvidenceGraph(bundle, root, undefined, { registry });
      expect(root.querySelectorAll("[data-test-module]")).toHaveLength(1);
      expect(root.classList.contains("cv-shell-chrome")).toBe(true);
    } finally {
      root.remove();
      core.remove();
    }
  });

  it("one whose stylesheet hides the page root, on a page in a document", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE());
    const registry = new PresentationRegistry();
    registry.register(
      testModule((root) => {
        const style = document.createElement("style");
        style.textContent = "main{display:none!important}";
        root.querySelector('[data-region="L1"]')!.append(style);
      }),
    );
    const root = document.createElement("main");
    document.body.append(root);
    try {
      await renderEvidenceGraph(bundle, root, undefined, { registry });
      expect(root.querySelectorAll("[data-test-module]")).toHaveLength(0);
      expect(
        root.querySelector('[data-refusal="presentation-failed"]'),
      ).not.toBeNull();
    } finally {
      root.remove();
    }
  });

  it("one whose stylesheet hides the banner through the page's #app, on the static page", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE());
    const registry = new PresentationRegistry();
    registry.register(
      testModule((root) => {
        const style = document.createElement("style");
        style.textContent =
          "#app [data-verify],#app [data-banner-detail]{display:none!important}";
        root.querySelector('[data-region="L1"]')!.append(style);
      }),
    );
    const built = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "static",
      registry,
    });
    if (built.format !== "static") throw new Error("static expected");
    expect(built.html).not.toContain("data-test-module");
    expect(built.html).not.toContain("display:none!important");
    expect(built.html).toContain('data-refusal="presentation-failed"');
  });

  it("one that leaves the banner alone renders on a root that was already hidden", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE());
    const registry = new PresentationRegistry();
    registry.register(testModule(() => {}));
    const root = document.createElement("main");
    root.style.display = "none";
    document.body.append(root);
    try {
      await renderEvidenceGraph(bundle, root, undefined, { registry });
      expect(root.querySelectorAll("[data-test-module]")).toHaveLength(1);
      expect(
        root.querySelector('[data-refusal="presentation-failed"]'),
      ).toBeNull();
    } finally {
      root.remove();
    }
  });

  it("one whose stylesheet hides the banner, on the static page", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE());
    const registry = new PresentationRegistry();
    registry.register(
      testModule((root) => {
        const style = document.createElement("style");
        style.textContent =
          "[data-verify],[data-banner-detail]{display:none!important}";
        root.querySelector('[data-region="L1"]')!.append(style);
      }),
    );
    const built = await buildPresentation(bundle, {
      presentation: "auto",
      audience: "*",
      format: "static",
      registry,
    });
    if (built.format !== "static") throw new Error("static expected");
    expect(built.html).not.toContain("data-test-module");
    expect(built.html).not.toContain("display:none!important");
    expect(built.html).toContain('data-refusal="presentation-failed"');
    expect(built.verification).toBe("incomplete");
  });

  it("one that leaves the banner alone renders, in a document too", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE());
    const registry = new PresentationRegistry();
    registry.register(testModule(() => {}));
    const root = document.createElement("main");
    document.body.append(root);
    try {
      await renderEvidenceGraph(bundle, root, undefined, { registry });
      expect(root.querySelectorAll("[data-test-module]")).toHaveLength(1);
    } finally {
      root.remove();
    }
  });

  it("one that leaves the banner alone renders", async () => {
    const { bundle } = await sealEvidenceBundle(SOURCE());
    const registry = new PresentationRegistry();
    registry.register(testModule(() => {}));
    const root = await render(bundle, registry);
    expect(root.querySelectorAll("[data-test-module]")).toHaveLength(1);
    expect(
      root.querySelector('[data-refusal="presentation-failed"]'),
    ).toBeNull();
  });
});
