// SPDX-License-Identifier: Apache-2.0
// capsule-viewer#523: when the runtime's verdict is incomplete and it draws no
// not-checked list, the receipt's line names what was not run. A producer
// selection gets Sherlock2's sentence (receipt-export.test.ts); any other such
// verdict carries the runtime's own detail sentence, and every other state
// passes the runtime's line through unchanged. The runtime's banner is
// replaced here so each state can be reached on the one fixture.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as aac from "@action-state-group/agent-action-capsule";
import { checkReceipt } from "../src/receipt.js";

type Banner = ReturnType<typeof aac.verificationBanner>;
const banner = vi.hoisted(() => ({
  override: null as null | ((real: Banner) => Banner),
  selection: true,
}));

vi.mock("@action-state-group/agent-action-capsule", async (importOriginal) => {
  const real = await importOriginal<typeof aac>();
  return {
    ...real,
    verificationBanner: (
      ...args: Parameters<typeof real.verificationBanner>
    ) => {
      const value = real.verificationBanner(...args);
      return banner.override === null ? value : banner.override(value);
    },
    isProducerSelection: (
      ...args: Parameters<typeof real.isProducerSelection>
    ) => banner.selection && real.isProducerSelection(...args),
  };
});

const fixture = (name: string): string =>
  readFileSync(
    resolve(__dirname, `../../tests/testdata/receipt/${name}.bundle.json`),
    "utf8",
  );

const lineOf = async (name: string): Promise<string> => {
  const result = await checkReceipt(fixture(name));
  if (result.kind !== "checked") throw new Error(`not checked: ${result.kind}`);
  return result.runtimeLine;
};

afterEach(() => {
  banner.override = null;
  banner.selection = true;
});

describe("the receipt's line when no not-checked list is drawn (#523)", () => {
  it("names the selection when interval coverage is the only check not run", async () => {
    expect(await lineOf("mesh-provider-selected")).toMatch(
      /^None of the bundle's checks failed, but one can't be run on this file: whether anything was left out/,
    );
  });

  it("carries the runtime's own detail sentence for any other incomplete verdict with no list", async () => {
    const detail = "This page did not check the checkpoint signature.";
    banner.override = (real) => ({
      ...real,
      state: "incomplete",
      line: aac.VERIFICATION_BANNER_LINES.incompleteNoList,
      detail,
    });
    // Not a producer selection: the selection sentence does not apply.
    banner.selection = false;
    expect(await lineOf("mesh-provider-selected")).toBe(
      `${aac.VERIFICATION_BANNER_LINES.incompleteNoList}. ${detail}`,
    );
    // No detail sentence: the runtime's line alone.
    banner.override = (real) => ({
      ...real,
      state: "incomplete",
      line: aac.VERIFICATION_BANNER_LINES.incompleteNoList,
      detail: "",
    });
    expect(await lineOf("mesh-provider-selected")).toBe(
      aac.VERIFICATION_BANNER_LINES.incompleteNoList,
    );
  });

  it("passes the runtime's line through when it draws its list, or the verdict is not incomplete", async () => {
    for (const line of [
      aac.VERIFICATION_BANNER_LINES.incomplete,
      aac.VERIFICATION_BANNER_LINES.verified,
    ]) {
      banner.override = (real) => ({ ...real, line });
      expect(await lineOf("mesh-provider-selected")).toBe(line);
    }
  });
});
