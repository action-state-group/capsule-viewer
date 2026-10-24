// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom
//
// The composition section (composed-view.ts) that shows a composed/v1
// block's result on a verified bundle. Ported from agent-action-capsule's
// test/composed.test.ts at cd68af7, whose rendering cases
// agent-action-capsule#398 deletes with its own copy of the section
// (agent-action-capsule#379). The containers are the published vectors
// (aac-vectors/bundle/composed); testdata/composed-parity/ is AAC's
// test/testdata/composed-parity/ at cd68af7 byte for byte (without its
// generate.py): each case's bundle, or a vector container, and capsulectl's
// output for it.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildVerifiedBundleContext,
  EXTENSION_NOT_INTERPRETED,
  extensionRows,
} from "@action-state-group/agent-action-capsule";
import {
  BUILTIN_MANIFEST_COMPOSED,
  BUILTIN_MANIFEST_NO_AGGREGATE,
  BUILTIN_MANIFESTS,
} from "../src/builtin-manifests.js";
import {
  BUILTIN_PRESENTATIONS,
  BUILTIN_SECTIONS,
  createPresentationRegistry,
  createSectionRegistry,
  renderEvidenceGraph,
  type RenderEvidenceGraphOptions,
} from "../src/evidence-graph-view.js";
import {
  PresentationAmbiguityError,
  PresentationRegistry,
  type PresentationManifest,
  type PresentationModule,
} from "../src/presentation-registry.js";
import { stub } from "./helpers/presentation-resolution-vectors.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

const read = (...path: string[]): unknown =>
  JSON.parse(
    readFileSync(resolve(process.cwd(), "test", "testdata", ...path), "utf8"),
  );
const VECTORS = read("aac-vectors", "bundle", "composed", "vectors.json") as {
  cases: { id: string; container: Obj }[];
};
const container = (id: string): Obj =>
  VECTORS.cases.find((c) => c.id === id)!.container;

/** Every parity case: its bundle and capsulectl's output for it. */
function parityCases(): { name: string; bundle: Obj; cli: Obj }[] {
  const dir = resolve(process.cwd(), "test", "testdata", "composed-parity");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".capsulectl.json"))
    .sort()
    .map((f) => {
      const name = f.slice(0, -".capsulectl.json".length);
      return {
        name,
        bundle: name.startsWith("vector-")
          ? container(name.slice("vector-".length))
          : (read("composed-parity", `${name}.bundle.json`) as Obj),
        cli: read("composed-parity", f) as Obj,
      };
    });
}

const cliComposed = (cli: Obj): Obj => {
  const output = cli.output as { extensions: Obj[] };
  return output.extensions.find((e) => e.kind === "composed/v1")!
    .composed as Obj;
};

// Ported from agent-action-capsule's test/composed.test.ts at 60a5b11, whose
// registry cases agent-action-capsule#379 deletes with the registry moved
// here (capsule-viewer#86): the page and section registries, and what the
// page says when this runtime refuses a module that would show the block.

// The section renders only on a bundle that verified (contract I1). The
// published containers carry no checkpoint, so the viewer refuses them;
// sealing one adds a checkpoint and leaves the composed/v1 block untouched.
async function sealed(source: Obj): Promise<Obj> {
  const out = (await sealEvidenceBundle(source)).bundle;
  expect((out.extensions as Obj)["composed/v1"]).toEqual(
    (source.extensions as Obj)["composed/v1"],
  );
  return out;
}

async function render(
  bundle: unknown,
  options?: RenderEvidenceGraphOptions,
): Promise<HTMLElement> {
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root, undefined, options);
  return root;
}

const extensionCells = (root: HTMLElement): string[][] =>
  Array.from(root.querySelectorAll("table[data-extensions] tbody tr"), (tr) =>
    Array.from(tr.querySelectorAll("td"), (td) => td.textContent ?? ""),
  );

describe("the composition section", () => {
  it("has a parity case for every capsulectl output", () => {
    expect(parityCases().length).toBeGreaterThanOrEqual(8);
  });

  it.each(parityCases().map((c) => [c.name, c] as const))(
    "%s: the page's join and agreement classifications equal capsulectl's",
    async (_name, c) => {
      const root = await render(await sealed(c.bundle));
      const section = root.querySelector<HTMLElement>(
        '[data-section="composition"]',
      )!;
      expect(section).not.toBeNull();
      const composed = cliComposed(c.cli);
      expect(
        section.querySelector<HTMLElement>("[data-composition-status]")!.dataset
          .compositionStatus,
      ).toBe(composed.status);
      expect(
        Array.from(
          section.querySelectorAll<HTMLElement>("tr[data-join-members]"),
          (tr) => [
            tr.dataset.joinMembers,
            tr.dataset.joinDeclared,
            tr.dataset.joinDerived,
            tr.dataset.joinResult,
          ],
        ),
      ).toEqual(
        (composed.joins as Obj[]).map((j) => [
          (j.members as string[]).join(","),
          j.declared,
          j.derived ?? "not_derivable",
          j.result,
        ]),
      );
      expect(
        Array.from(
          section.querySelectorAll<HTMLElement>("tr[data-agreement-members]"),
          (tr) => [tr.dataset.agreementMembers, tr.dataset.corroboration],
        ),
      ).toEqual(
        (composed.corroboration as Obj[]).map((a) => [
          (a.members as string[]).join(","),
          a.result,
        ]),
      );
      expect(
        Array.from(
          section.querySelectorAll<HTMLElement>("tr[data-member-id]"),
          (tr) => [tr.dataset.memberId, tr.dataset.body, tr.dataset.digest],
        ),
      ).toEqual(
        (composed.members as Obj[]).map((m) => [m.id, m.body, m.digest]),
      );
      const digest = section.querySelector<HTMLElement>(
        "[data-composed-digest]",
      )!;
      expect([digest.dataset.composedDigest, digest.dataset.matches]).toEqual([
        (composed.composed_digest as Obj).declared,
        String((composed.composed_digest as Obj).matches),
      ]);
      // The verification page says the block was shown, by this module.
      expect(extensionCells(root)).toEqual([
        [
          "composed/v1",
          "covered",
          "Shown by the page's module; covered by the file's fingerprint",
        ],
      ]);
      expect(
        root.querySelector<HTMLElement>('tr[data-extension-id="composed/v1"]')
          ?.dataset.interpreter,
      ).toBe(BUILTIN_MANIFEST_COMPOSED.id);
    },
  );

  it("a same-custody agreeing pair renders redundant, not corroborating, with its reason", async () => {
    const root = await render(
      await sealed(container("same-custody-redundant")),
    );
    const row = root.querySelector<HTMLElement>("tr[data-agreement-members]")!;
    expect(row.dataset.corroboration).toBe("redundant");
    expect(row.dataset.reasons).toBe("same_custody_domain");
    expect(row.textContent).toContain(
      "redundant, not corroborating (same_custody_domain)",
    );
    expect(row.textContent).not.toContain("corroborating, on declared custody");
    // Both observers are shown with the one custody domain they declare.
    expect(
      Array.from(
        root.querySelectorAll("tr[data-observer-id] td:last-child"),
        (td) => td.textContent,
      ),
    ).toEqual(["operator.example", "operator.example"]);
  });

  it("a separate-custody agreeing pair is corroborating only on declared custody", async () => {
    const root = await render(await sealed(container("agree")));
    const row = root.querySelector<HTMLElement>("tr[data-agreement-members]")!;
    expect(row.dataset.corroboration).toBe("corroborating");
    expect(row.dataset.reasons).toBeUndefined();
    expect(row.textContent).toContain("corroborating, on declared custody");
    expect(root.textContent).toContain(
      "distinct labels do not establish that two observers are independent",
    );
  });

  it("a mismatch shows each member's value at the differing pointer and names no winner", async () => {
    const root = await render(
      await sealed(read("composed-parity", "mismatch.bundle.json") as Obj),
    );
    const details = root.querySelector<HTMLElement>("[data-join-differences]")!;
    expect(details.tagName).toBe("DETAILS");
    const values = Array.from(
      details.querySelectorAll("dd"),
      (dd) => dd.textContent,
    );
    expect(values).toEqual([
      'responder-a: "0edfc9959ac786349dfd2e07e41bb73fa91d31113c64655836da2ee4e75da408"',
      'responder-b: "4d0c2ac3b851f692b652985e349e55268be73d0b8ecf815df8654d8a97df4cc7"',
    ]);
  });

  it("an unverified container shows no section, and the block reads not interpreted", async () => {
    const root = await render(container("agree"));
    expect(
      root.querySelector('[data-refusal="unverified-bundle"]'),
    ).not.toBeNull();
    expect(root.querySelector('[data-section="composition"]')).toBeNull();
    expect(extensionCells(root)).toEqual([
      ["composed/v1", "covered", EXTENSION_NOT_INTERPRETED],
    ]);
  });

  it("a bundle without composed/v1 does not select the section", async () => {
    const plain = read("week-bundle.json") as Obj;
    const context = await buildVerifiedBundleContext(plain);
    expect(await createSectionRegistry().resolve(context, "*", "html")).toEqual(
      { kind: "no-presentation", refused: [] },
    );
    const root = await render(plain);
    expect(root.querySelector('[data-section="composition"]')).toBeNull();
  });

  it("the section is drawn after the page module and before the verification page", async () => {
    const root = await render(await sealed(container("agree")));
    const order = Array.from(
      root.querySelectorAll<HTMLElement>(
        '[data-notice="no-aggregate"], [data-section="composition"], [data-page="verification"]',
      ),
      (el) => el.dataset.notice ?? el.dataset.section ?? el.dataset.page,
    );
    expect(order).toEqual(["no-aggregate", "composition", "verification"]);
  });
});

describe("precedence (contract sections 4.3 to 4.5)", () => {
  it("as a page module the composition manifest is ambiguous with the six specific built-ins, so registration refuses it", () => {
    const specific = BUILTIN_MANIFESTS.filter((m) => !m.fallback);
    expect(specific).toHaveLength(6);
    for (const other of specific) {
      const pair = new PresentationRegistry();
      pair.register(stub(other));
      expect(() => pair.register(stub(BUILTIN_MANIFEST_COMPOSED))).toThrow(
        PresentationAmbiguityError,
      );
    }
    // The same against this viewer's own modules, the contract-report
    // module in place of the AAC built-in among them.
    const modules = BUILTIN_PRESENTATIONS.filter((m) => !m.manifest.fallback);
    expect(modules).toHaveLength(6);
    for (const other of modules) {
      const pair = new PresentationRegistry();
      pair.register(other);
      expect(() => pair.register(BUILTIN_SECTIONS[0]!)).toThrow(
        PresentationAmbiguityError,
      );
    }
    expect(() =>
      createPresentationRegistry().register(BUILTIN_SECTIONS[0]!),
    ).toThrow(PresentationAmbiguityError);
  });

  it("as a page module it would also refuse a composition-aware page module (contract appendix B)", () => {
    const compositionAware: PresentationManifest = {
      spec_version: "aac.presentation-manifest/v0",
      id: "org.example.composition-aware/v0",
      presentation_api: "aac.presentation-api/v0",
      runtime_min: "0.1.0",
      trust_class: "trusted-executable",
      requires: {
        bundle_kind: "evidence-bundle/v2",
        profiles: ["spec_version:org.example.exchange/v0"],
        extensions: { required: ["composed/v1"] },
      },
      audiences: ["*"],
      formats: ["html", "fragment", "embedded"],
      fallback: false,
      priority: 1,
      executable: {
        carrier: "module-slot",
        script_sha256:
          "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
      },
    };
    const pages = new PresentationRegistry();
    pages.register(stub(compositionAware));
    expect(() => pages.register(stub(BUILTIN_MANIFEST_COMPOSED))).toThrow(
      PresentationAmbiguityError,
    );
    // In the section registry the two never meet: the page module renders
    // the page and the composition section is drawn beneath it.
    expect(
      createSectionRegistry()
        .list()
        .map((m) => m.manifest.id),
    ).toEqual([BUILTIN_MANIFEST_COMPOSED.id]);
  });

  it("the page manifests are unchanged: the seven built-ins, nothing else", () => {
    expect(BUILTIN_MANIFESTS).toHaveLength(7);
    expect(BUILTIN_PRESENTATIONS).toHaveLength(7);
    expect(createPresentationRegistry().list()).toEqual(BUILTIN_PRESENTATIONS);
    expect(BUILTIN_MANIFESTS.map((m) => m.id)).not.toContain(
      BUILTIN_MANIFEST_COMPOSED.id,
    );
    expect(BUILTIN_PRESENTATIONS.map((m) => m.manifest.id)).not.toContain(
      BUILTIN_MANIFEST_COMPOSED.id,
    );
  });

  it("a second section matching composed/v1 is refused at registration", () => {
    const sections = createSectionRegistry();
    expect(() =>
      sections.register(
        stub({ ...BUILTIN_MANIFEST_COMPOSED, id: "org.example.other/v0" }),
      ),
    ).toThrow(PresentationAmbiguityError);
  });

  it("the section is selected beside the page module, not in its place", async () => {
    const context = await buildVerifiedBundleContext(
      await sealed(container("agree")),
    );
    const page = await createPresentationRegistry().resolve(
      context,
      "*",
      "html",
    );
    const section = await createSectionRegistry().resolve(context, "*", "html");
    expect([
      page.kind === "module" ? page.module.manifest.id : page.kind,
      section.kind === "module" ? section.module.manifest.id : section.kind,
    ]).toEqual([
      BUILTIN_MANIFEST_NO_AGGREGATE.id,
      BUILTIN_MANIFEST_COMPOSED.id,
    ]);
  });
});

describe("the presentation ABI on the composition section and the extension rows (contract section 3.2)", () => {
  const V1_ONLY = {
    presentationApis: ["aac.presentation-api/v1"],
    runtimeVersion: "1.0.0",
  };
  const agree = (): Promise<Obj> => sealed(container("agree"));
  /** A module whose every method fails the test if called. */
  const untouchable = (manifest: PresentationManifest): PresentationModule => ({
    manifest,
    canRender: () => {
      throw new Error("a refused module's canRender was called");
    },
    buildModel: () => {
      throw new Error("a refused module's buildModel was called");
    },
    render: () => {
      throw new Error("a refused module's render was called");
    },
  });
  /** A page registry holding only this viewer's no-aggregate module. */
  const fallbackOnly = (): PresentationRegistry => {
    const registry = new PresentationRegistry();
    registry.register(
      BUILTIN_PRESENTATIONS.find(
        (m) => m.manifest.id === BUILTIN_MANIFEST_NO_AGGREGATE.id,
      )!,
    );
    return registry;
  };
  const composedRow = (root: HTMLElement): HTMLElement =>
    root.querySelector<HTMLElement>('tr[data-extension-id="composed/v1"]')!;
  /** The refusal lines after the extension rows, as the page draws them. */
  const refusalLines = (root: HTMLElement): string[][] =>
    Array.from(
      root.querySelectorAll<HTMLElement>(
        '[data-page="verification"] p[data-presentation-refused]',
      ),
      (p) => [
        p.dataset.presentationRefused ?? "",
        p.dataset.refusal ?? "",
        p.textContent ?? "",
      ],
    );

  it("the composition section manifest declares aac.presentation-api/v0 at 0.1.0, and the reference runtime refuses no section", () => {
    expect(BUILTIN_MANIFEST_COMPOSED.presentation_api).toBe(
      "aac.presentation-api/v0",
    );
    expect(BUILTIN_MANIFEST_COMPOSED.runtime_min).toBe("0.1.0");
    expect(createSectionRegistry().refused()).toEqual([]);
    expect(createSectionRegistry().list()).toEqual(BUILTIN_SECTIONS);
  });

  it("a refused section is named on the page and in the composed/v1 row, never silently skipped", async () => {
    const sections = createSectionRegistry(V1_ONLY);
    expect(sections.refused().map((r) => r.id)).toEqual([
      BUILTIN_MANIFEST_COMPOSED.id,
    ]);
    const root = await render(await agree(), { sections });
    expect(root.querySelector('[data-section="composition"]')).toBeNull();
    expect(root.dataset.presentationRefused).toBe(BUILTIN_MANIFEST_COMPOSED.id);
    const rows = root.querySelectorAll("tr[data-extension-id]");
    expect(rows).toHaveLength(1);
    const row = composedRow(root);
    expect(row.dataset.semantics).toBe("refused");
    expect(row.dataset.interpreter).toBeUndefined();
    expect(row.dataset.refusedModule).toBe(BUILTIN_MANIFEST_COMPOSED.id);
    expect(row.dataset.refusal).toBe("presentation_api_unsupported");
    expect(extensionCells(root)).toEqual([
      [
        "composed/v1",
        "covered",
        "Integrity verified; meaning not interpreted: presentation module aac.builtin.composed/v0 needs presentation API aac.presentation-api/v0, which this viewer does not implement",
      ],
    ]);
    // A module with an extension row gets no separate line.
    expect(refusalLines(root)).toEqual([]);
  });

  it("a section refused for runtime_too_old reads the runtime wording", async () => {
    const sections = createSectionRegistry({
      presentationApis: ["aac.presentation-api/v0"],
      runtimeVersion: "0.0.9",
    });
    const root = await render(await agree(), { sections });
    expect(root.querySelector('[data-section="composition"]')).toBeNull();
    expect(root.dataset.presentationRefused).toBe(BUILTIN_MANIFEST_COMPOSED.id);
    expect(composedRow(root).dataset.refusal).toBe("runtime_too_old");
    expect(extensionCells(root)[0]![2]).toBe(
      "Integrity verified; meaning not interpreted: presentation module aac.builtin.composed/v0 needs runtime 0.1.0 or later; this viewer is 0.0.9",
    );
  });

  it("a refused page module's row outranks the section's 'interpreted by'", async () => {
    const registry = fallbackOnly();
    const refusedPage = untouchable({
      ...BUILTIN_MANIFEST_COMPOSED,
      id: "org.example.composition-page/v0",
      presentation_api: "aac.presentation-api/v9",
    });
    expect(registry.register(refusedPage).status).toBe("refused");
    const root = await render(await agree(), { registry });
    // The section still ran (its own registry accepts it) ...
    expect(root.querySelector('[data-section="composition"]')).not.toBeNull();
    // ... but the row names the refused module: the refusal takes precedence.
    const row = composedRow(root);
    expect(row.dataset.semantics).toBe("refused");
    expect(row.dataset.interpreter).toBeUndefined();
    expect(row.dataset.refusedModule).toBe("org.example.composition-page/v0");
    expect(extensionCells(root)[0]![2]).toBe(
      "Integrity verified; meaning not interpreted: presentation module org.example.composition-page/v0 needs presentation API aac.presentation-api/v9, which this viewer does not implement",
    );
    expect(root.dataset.presentationRefused).toBe(
      "org.example.composition-page/v0",
    );
  });

  it("a refused module that requires no extension gets the contract's line after the extension rows", async () => {
    const registry = fallbackOnly();
    const plain: PresentationManifest = {
      spec_version: "aac.presentation-manifest/v0",
      id: "org.example.plain/v0",
      presentation_api: "aac.presentation-api/v0",
      runtime_min: "0.2.0",
      trust_class: "trusted-executable",
      requires: { bundle_kind: "evidence-bundle/v2" },
      audiences: ["*"],
      formats: ["html", "fragment", "embedded"],
      fallback: false,
      priority: 1,
      executable: { carrier: "core-runtime" },
    };
    expect(registry.register(untouchable(plain)).status).toBe("refused");
    const root = await render(await agree(), { registry });
    expect(refusalLines(root)).toEqual([
      [
        "org.example.plain/v0",
        "runtime_too_old",
        "Presentation module org.example.plain/v0 was not used: it needs runtime 0.2.0 or later; this viewer is 0.1.0",
      ],
    ]);
    // The line follows the extension rows.
    const table = root.querySelector("table[data-extensions]")!;
    const line = root.querySelector(
      '[data-page="verification"] p[data-presentation-refused]',
    )!;
    expect(
      table.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The extension rows are untouched by this refusal.
    expect(composedRow(root).dataset.interpreter).toBe(
      BUILTIN_MANIFEST_COMPOSED.id,
    );
    expect(composedRow(root).dataset.refusedModule).toBeUndefined();
    expect(root.dataset.presentationRefused).toBe("org.example.plain/v0");
  });

  it("a page and a section refused together are both named, page first", async () => {
    const registry = fallbackOnly();
    registry.register(
      untouchable({
        ...BUILTIN_MANIFEST_COMPOSED,
        id: "org.example.composition-page/v0",
        presentation_api: "aac.presentation-api/v9",
      }),
    );
    const root = await render(await agree(), {
      registry,
      sections: createSectionRegistry(V1_ONLY),
    });
    expect(root.querySelector('[data-section="composition"]')).toBeNull();
    expect(root.dataset.presentationRefused).toBe(
      `org.example.composition-page/v0 ${BUILTIN_MANIFEST_COMPOSED.id}`,
    );
    // One row, named by the first refusal in resolution order.
    expect(
      Array.from(
        root.querySelectorAll<HTMLElement>("tr[data-extension-id]"),
        (tr) => tr.dataset.refusedModule,
      ),
    ).toEqual(["org.example.composition-page/v0"]);
  });

  // AAC's extensionRows, which builds the rows this viewer draws: a page
  // shows no such row, since an uncovered block means the bundle did not
  // verify and no module is resolved for it, so none is refused.
  it("extensionRows: an uncovered block's refusal row begins 'Integrity not verified;'", () => {
    const [row] = extensionRows(
      [
        {
          kind: "composed/v1",
          integrityCovered: false,
          status: "uninterpreted",
        },
      ],
      undefined,
      [
        {
          id: "org.example.x/v0",
          presentation_api: "aac.presentation-api/v3",
          runtime_min: "0.1.0",
          reason: "presentation_api_unsupported",
          extensions: ["composed/v1"],
          runtimeVersion: "0.1.0",
        },
      ],
    );
    expect(row).toMatchObject({
      id: "composed/v1",
      integrity: "not covered",
      refusal: { id: "org.example.x/v0" },
      semantics:
        "Integrity not verified; meaning not interpreted: presentation module org.example.x/v0 needs presentation API aac.presentation-api/v3, which this viewer does not implement",
    });
  });
});
