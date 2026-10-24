// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom
//
// The embedded mount and the fragment viewer (presentation-mount.ts). Ported
// from agent-action-capsule's test/presentation-mount.test.ts at cd68af7,
// which agent-action-capsule#398 deletes with its own copy of the mount
// (agent-action-capsule#379).
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  encodePresentationFragment,
  PRESENTATION_FRAGMENT_VERSION,
} from "../src/presentation-fragment.js";
import {
  mountPresentation,
  mountPresentationFragment,
} from "../src/presentation-mount.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

async function bundle(): Promise<unknown> {
  const readable = JSON.parse(
    await readFile(
      resolve(process.cwd(), "test", "testdata", "report-rows-bundle.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
  return (await sealEvidenceBundle(readable)).bundle;
}

const verifyStates = (root: Element): (string | null)[] =>
  [...root.querySelectorAll("[data-verify]")].map((e) =>
    e.getAttribute("data-verify"),
  );

// The page a mount draws: the banner bar first, the bundle's rows, and the
// folded verification section last. Nothing in the bundle is signed, so it
// reads incomplete.
function expectPage(root: HTMLElement): void {
  expect(verifyStates(root)).toEqual(["incomplete"]);
  expect(root.querySelector("[data-refusal]")).toBeNull();
  expect(root.firstElementChild!.classList.contains("cv-shell-bar")).toBe(true);
  expect(
    root.querySelector(".cv-shell-bar .cv-pill[data-verify]"),
  ).not.toBeNull();
  expect(root.querySelector('[data-page="report-rows"]')).not.toBeNull();
  expect(
    root.querySelector('details.cv-checked [data-page="verification"]'),
  ).not.toBeNull();
}

describe("presentation mount", () => {
  it("mountPresentation renders the bundle it is given, verified", async () => {
    const root = document.createElement("main");
    await mountPresentation(root, {
      bundle: await bundle(),
      audience: "*",
      format: "embedded",
    });
    expectPage(root);
  });

  it("mountPresentationFragment renders a readable fragment", async () => {
    const { fragment } = encodePresentationFragment({
      fragment_version: PRESENTATION_FRAGMENT_VERSION,
      audience: "*",
      presentation: "auto",
      core_runtime_sha256: "a".repeat(64),
      module_sha256: [],
      bundle: await bundle(),
    });
    const root = document.createElement("main");
    await mountPresentationFragment(`#${fragment}`, root);
    expectPage(root);
  });

  it("an unreadable fragment replaces the element's content with a fixed statement", async () => {
    const root = document.createElement("main");
    root.append(document.createElement("section"));
    await mountPresentationFragment("#not*base64", root);
    expect(
      [...root.children].map((e) => (e as HTMLElement).dataset.refusal),
    ).toEqual(["fragment-unreadable"]);
    expect(root.textContent).toMatch(
      /^This link's fragment could not be read, so nothing is shown\./u,
    );
    expect(verifyStates(root)).toEqual([]);
  });
});
