// SPDX-License-Identifier: BSD-3-Clause
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { builtCommitSha } from "../scripts/built-commit.mjs";
import { commitPrefix } from "../src/viewer-build.js";

const tsRoot = new URL("../", import.meta.url);

// Captured in beforeAll, alongside the build it describes: computing it
// later, at assertion time, could race a tree edit between the two and
// compare the bundle against the wrong tree state.
let commitShaAtBuild: string;
let headPrefixAtBuild: string;

describe("browser IIFE emitter", () => {
  beforeAll(() => {
    const root = fileURLToPath(tsRoot);
    commitShaAtBuild = builtCommitSha(root);
    headPrefixAtBuild = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    })
      .trim()
      .slice(0, 12);
    execFileSync("npm", ["run", "emitter:iife"], {
      cwd: tsRoot,
      stdio: "inherit",
    });
  });

  it("builds a non-trivial global renderEvidenceGraph artifact", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts["emitter:iife"]).toBeDefined();

    const iife = await readFile(
      new URL("../dist/evidence-graph.iife.js", import.meta.url),
      "utf8",
    );
    expect(iife).toContain("renderEvidenceGraph");
    expect(iife.length).toBeGreaterThan(1000);
  });

  it("names the build's commit in the bundle, or not at all when ts/ is dirty", async () => {
    const iife = await readFile(
      new URL("../dist/evidence-graph.iife.js", import.meta.url),
      "utf8",
    );

    // commitShaAtBuild is the same check build-iife.mjs itself made for this
    // bundle. "not stated" has no distinct literal in the bundle (the UI
    // uses that phrase for many unrelated unstated fields), so the only way
    // to assert it without lying is to check that the real commit is
    // absent, not that some string is present.
    if (commitShaAtBuild === "") {
      expect(iife).not.toContain(headPrefixAtBuild);
    } else {
      expect(iife).toContain(headPrefixAtBuild);
    }
  });
});

// The runtime's global, as a presentation module sees it: the viewer's
// registerPresentation beside the verifier functions src/browser.ts lists.
const MODULE_CONTRACT = [
  "registerPresentation",
  "disclosureOf",
  "ed25519Available",
  "verifiedPayload",
  "verifyDisclosureEnvelope",
  "verifyProducerEnvelope",
] as const;

// In the build's global, not yet in go/pageruntime's (see the test below).
const NOT_YET_SHIPPED = ["buildResultRoot"] as const;

function globalOf(iife: string): Record<string, unknown> {
  const context: Record<string, unknown> = { TextEncoder, TextDecoder };
  runInNewContext(iife, context);
  return context.EvidenceGraph as Record<string, unknown>;
}

describe("the runtime's global", () => {
  beforeAll(() => {
    execFileSync("npm", ["run", "emitter:iife"], {
      cwd: tsRoot,
      stdio: "inherit",
    });
  });

  for (const [name, file] of [
    ["the build", "../dist/evidence-graph.iife.js"],
    ["go/pageruntime", "../../go/pageruntime/evidence-graph.iife.js"],
  ] as const) {
    it(`carries the functions a presentation module may call (${name})`, async () => {
      const global = globalOf(
        await readFile(new URL(file, import.meta.url), "utf8"),
      );
      for (const member of MODULE_CONTRACT)
        expect(typeof global[member], member).toBe("function");
    });
  }

  it("re-exports agent-action-capsule's own verifier functions", async () => {
    const aac = (await import(
      "@action-state-group/agent-action-capsule"
    )) as Record<string, unknown>;
    const browser = (await import("../src/browser.js")) as Record<
      string,
      unknown
    >;
    for (const member of [...MODULE_CONTRACT.slice(1), ...NOT_YET_SHIPPED])
      expect(browser[member], member).toBe(aac[member]);
  });

  // Added to the build in capsule-viewer#83; go/pageruntime carries it from
  // the next release refresh (RELEASING.md), when it moves into
  // MODULE_CONTRACT above.
  it("the build carries buildResultRoot, which reads a Result", async () => {
    // With WebCrypto, as a page has it: the reader hashes every record.
    const context: Record<string, unknown> = {
      TextEncoder,
      TextDecoder,
      crypto: globalThis.crypto,
    };
    runInNewContext(
      await readFile(
        new URL("../dist/evidence-graph.iife.js", import.meta.url),
        "utf8",
      ),
      context,
    );
    const global = context.EvidenceGraph as Record<string, unknown>;
    for (const member of NOT_YET_SHIPPED)
      expect(typeof global[member], member).toBe("function");
    // Parsed in the runtime's own realm, as a page parses its bundle.
    context.source = await readFile(
      new URL(
        "testdata/show-evidence/monthly-outcome.bundle.json",
        import.meta.url,
      ),
      "utf8",
    );
    const bundle = runInNewContext("JSON.parse(source)", context) as unknown;
    const result = await (
      global.buildResultRoot as (
        input: unknown,
      ) => Promise<{ claims: readonly unknown[] }>
    )(bundle);
    expect(result.claims).toHaveLength(32);
  });
});

describe("builtCommit's validation", () => {
  it("rejects an empty string and anything that isn't a 40-hex sha", () => {
    expect(commitPrefix("")).toBeUndefined();
    expect(commitPrefix("not-a-sha")).toBeUndefined();
    expect(commitPrefix("a".repeat(39))).toBeUndefined();
    expect(commitPrefix("a".repeat(41))).toBeUndefined();
    expect(commitPrefix("g".repeat(40))).toBeUndefined();
  });

  it("accepts a full 40-hex sha, keeping only its 12-hex prefix", () => {
    const sha = "457a13e35b7f4f2bfbd201057d15deea0aad9896";
    expect(commitPrefix(sha)).toBe("457a13e35b7f");
  });
});
