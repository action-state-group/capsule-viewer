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
  "buildResultRoot",
  "buildVerifiedBundleContext",
  "disclosureOf",
  "ed25519Available",
  "verifiedPayload",
  "verifyDisclosureEnvelope",
  "verifyProducerEnvelope",
] as const;

// The History card's witness standing (capsule-viewer#183): the check under the
// reader's list, and the list the page holds.
const WITNESS_CONTRACT = [
  "readerAnchorWitness",
  "readerWitnessPolicy",
  "setReaderWitnessPolicy",
] as const;

// The deal receipt's preimage and witness checks (capsule-viewer#214).
const RECEIPT_CONTRACT = [
  "paymentPreimageCheck",
  "readerCadenceWitness",
] as const;

// Names src/browser.ts lists that the committed go/pageruntime predates
// (capsule-viewer#167).
const NOT_YET_SHIPPED: readonly string[] = [];

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
      for (const member of [
        ...MODULE_CONTRACT,
        ...WITNESS_CONTRACT,
        ...RECEIPT_CONTRACT,
      ]) {
        // Not yet in the shipped runtime. Asserting its absence makes the
        // refresh that ships it fail here until that refresh also drops it
        // from NOT_YET_SHIPPED (RELEASING.md step 5; an edit under ts/, which
        // scripts/go-release-check.sh does not compare).
        if (name === "go/pageruntime" && NOT_YET_SHIPPED.includes(member)) {
          expect(
            typeof global[member],
            `${member} now ships in go/pageruntime: drop it from NOT_YET_SHIPPED`,
          ).toBe("undefined");
          continue;
        }
        expect(typeof global[member], member).toBe("function");
      }
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
    for (const member of MODULE_CONTRACT.slice(1))
      expect(browser[member], member).toBe(aac[member]);
  });

  // Added to the build in capsule-viewer#83; go/pageruntime carries it
  // since viewer 0.3.0 (go/v0.3.0).
  for (const [name, file] of [
    ["the build", "../dist/evidence-graph.iife.js"],
    ["go/pageruntime", "../../go/pageruntime/evidence-graph.iife.js"],
  ] as const)
    it(`buildResultRoot reads a Result (${name})`, async () => {
      // With WebCrypto, as a page has it: the reader hashes every record.
      const context: Record<string, unknown> = {
        TextEncoder,
        TextDecoder,
        crypto: globalThis.crypto,
      };
      runInNewContext(
        await readFile(new URL(file, import.meta.url), "utf8"),
        context,
      );
      const global = context.EvidenceGraph as Record<string, unknown>;
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

  // A module that draws a composed/v1 bundle verifies each carried member
  // with the page's own verifier (capsule-viewer#167): on the built runtime,
  // both members of AAC's two-responder vector verify, and a member whose
  // record was edited does not.
  it("buildVerifiedBundleContext verifies each member of a two-sided bundle (the build)", async () => {
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
    context.source = await readFile(
      new URL(
        "testdata/aac-vectors/bundle/composed/vectors.json",
        import.meta.url,
      ),
      "utf8",
    );
    const members = runInNewContext(
      `JSON.parse(source).cases.find((c) => c.id === "agree").container.extensions["composed/v1"].members.filter((m) => m.bundle !== undefined).map((m) => m.bundle)`,
      context,
    ) as Array<{ records: Array<Record<string, unknown>> }>;
    expect(members).toHaveLength(2);
    type Verification = {
      graphClosure: { status: string };
      capsuleResults: Record<string, { ok: boolean }>;
    };
    const verify = global.buildVerifiedBundleContext as (
      input: unknown,
    ) => Promise<{ verification: Verification }>;
    for (const member of members) {
      const { verification } = await verify(member);
      expect(verification.graphClosure.status).toBe("pass");
      const results = Object.values(verification.capsuleResults);
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.ok)).toBe(true);
    }
    const edited = members[0]!;
    edited.records[0]!.operator = "someone-else.example";
    const { verification } = await verify(edited);
    expect(Object.values(verification.capsuleResults).every((r) => r.ok)).toBe(
      false,
    );
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
