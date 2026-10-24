// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom
//
// The composition section (composed-view.ts) that shows a composed/v1
// block's result on a verified bundle. Ported from agent-action-capsule's
// test/composed.test.ts at cd68af7, whose rendering cases
// agent-action-capsule#398 deletes with its own copy of the section
// (agent-action-capsule#379). The containers are the published vectors
// (aac-vectors/bundle/composed); the mismatch bundle is AAC's
// test/testdata/composed-parity/mismatch.bundle.json, byte for byte.
import { readFileSync } from "node:fs";
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
      await sealed(read("composed-mismatch-bundle.json") as Obj),
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
