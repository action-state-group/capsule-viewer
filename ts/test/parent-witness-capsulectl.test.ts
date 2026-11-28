// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom
//
// The verification page on a deal copy carrying a parent-log-witness/v1 block
// that capsulectl built (capsule-viewer#237): the page draws AAC's
// `parentWitness` and computes nothing itself. The fixtures are today's
// capsulectl copy with the holder's production block put in, as a copy
// carried it before u225 (tests/testdata/deal-witness/README.md). An older
// copy carrying x-cadence-witness/v0 gets no parent-log line: AAC reads only
// parent-log-witness/v1, and the runtime has no check of its own for it.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildVerifiedBundleContext } from "@action-state-group/agent-action-capsule";
import * as runtime from "../src/browser.js";

const DATA = resolve(process.cwd(), "..", "tests", "testdata", "deal-witness");
const read = (name: string): unknown =>
  JSON.parse(readFileSync(join(DATA, name), "utf8")) as unknown;
const DIRECTORY = read("witnesses.json");
const ENDPOINT = (DIRECTORY as { witnesses: { endpoint: string }[] })
  .witnesses[0]!.endpoint;

async function page(
  name: string,
  witnessDirectory?: unknown,
): Promise<HTMLElement> {
  const context = await buildVerifiedBundleContext(read(name), {
    ...(witnessDirectory === undefined ? {} : { witnessDirectory }),
  });
  const root = document.createElement("main");
  await runtime.renderEvidenceGraph(context, root);
  return root.querySelector<HTMLElement>('[data-page="verification"]')!;
}

const parentLine = (verification: HTMLElement) =>
  verification.querySelector<HTMLElement>('[data-witness="parent"]');

describe("a capsulectl-built parent-log-witness/v1 block", () => {
  it("draws every entry and the witness's receipt when the chain covers the copy", async () => {
    const verification = await page("parent-all.bundle.json", DIRECTORY);
    const line = parentLine(verification)!;
    expect(line.textContent).toBe(
      "witnessed through a parent log: all 6 entries",
    );
    expect(line.dataset.whole).toBe("true");
    expect(line.nextElementSibling!.querySelector("li")!.textContent).toBe(
      `${ENDPOINT} · recorded 2026-10-04 09:00:05 UTC`,
    );
    expect(verification.querySelector('[data-witness="self"]')).toBeNull();
  });

  it("draws the extent when the chain covers an earlier checkpoint of the deal", async () => {
    const line = parentLine(await page("parent-part.bundle.json", DIRECTORY))!;
    // capsulectl's block says the same: steps_witnessed 6 of steps 7.
    expect(line.textContent).toBe(
      "witnessed through a parent log: entries 1–6 of 7; entry 7 is not covered by this witness",
    );
    expect(line.dataset.whole).toBe("false");
  });

  it("draws no line when no witness directory is given (every receipt withheld)", async () => {
    const verification = await page("parent-all.bundle.json");
    expect(parentLine(verification)).toBeNull();
  });

  it("draws no line when the directory does not list the witness", async () => {
    const other = {
      directory_version: "1",
      witnesses: [
        {
          ...(DIRECTORY as { witnesses: Record<string, unknown>[] })
            .witnesses[0]!,
          endpoint: "https://another-witness.example",
        },
      ],
    };
    expect(parentLine(await page("parent-all.bundle.json", other))).toBeNull();
  });
});

describe("an older copy carrying x-cadence-witness/v0", () => {
  it("draws no parent-log line, whatever directory is given", async () => {
    expect(
      parentLine(await page("cadence-all.bundle.json", DIRECTORY)),
    ).toBeNull();
  });
});

it("the runtime has no cadence-witness check of its own (J.8)", () => {
  expect(Object.keys(runtime)).not.toContain("readerCadenceWitness");
});
