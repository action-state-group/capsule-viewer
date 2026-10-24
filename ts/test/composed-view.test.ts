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
} from "@action-state-group/agent-action-capsule";
import {
  createSectionRegistry,
  renderEvidenceGraph,
} from "../src/evidence-graph-view.js";
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

async function render(bundle: unknown): Promise<HTMLElement> {
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root);
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
      // capsule-viewer marks the row interpreted (data-semantics) rather
      // than naming the interpreter as AAC's renderer did (data-interpreter);
      // the semantics cell above names the module that showed it.
      expect(
        root.querySelector<HTMLElement>('tr[data-extension-id="composed/v1"]')
          ?.dataset.semantics,
      ).toBe("interpreted");
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
