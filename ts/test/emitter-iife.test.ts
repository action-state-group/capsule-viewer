// SPDX-License-Identifier: BSD-3-Clause
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { builtCommitSha } from "../scripts/build-iife.mjs";
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
