// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// capsule-viewer#383, CV-TS: where the browser cannot verify (no SHA-256, or
// no strict result because there is no Ed25519), the export gives no verdict
// and draws nothing.
import { describe, expect, it, vi } from "vitest";

const mode = vi.hoisted(() => ({ value: "no-sha" as "no-sha" | "no-strict" }));

vi.mock("@action-state-group/agent-action-capsule", async (original) => {
  const actual =
    await original<typeof import("@action-state-group/agent-action-capsule")>();
  return {
    ...actual,
    buildVerifiedBundleContext: async (bundle: unknown) => {
      if (mode.value === "no-sha") throw new actual.Sha256UnavailableError();
      const context = await actual.buildVerifiedBundleContext(bundle);
      return { ...context, strict: undefined };
    },
  };
});

const { checkReceipt, renderReceipt } = await import("../src/receipt.js");

describe("a browser that cannot check a receipt", () => {
  it("answers cannot_check with no SHA-256, and draws nothing", async () => {
    mode.value = "no-sha";
    const host = document.createElement("div");
    host.append(document.createElement("p"));
    expect(await renderReceipt("{}", host)).toEqual({ kind: "cannot_check" });
    expect(host.childNodes.length).toBe(0);
  });

  // A deal receipt and a provider's own receipt (#390) alike.
  it.each(["mesh-payer-selected", "mesh-provider-selected"])(
    "answers cannot_check with no strict result, and draws nothing: %s",
    async (name) => {
      mode.value = "no-strict";
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const text = readFileSync(
        resolve(
          process.cwd(),
          "..",
          "tests",
          "testdata",
          "receipt",
          `${name}.bundle.json`,
        ),
        "utf8",
      );
      expect(await checkReceipt(text)).toEqual({ kind: "cannot_check" });
      const host = document.createElement("div");
      host.append(document.createElement("p"));
      expect(await renderReceipt(text, host)).toEqual({ kind: "cannot_check" });
      expect(host.childNodes.length).toBe(0);
    },
  );
});
