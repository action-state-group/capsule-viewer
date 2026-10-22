// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { builtCommitSha } from "../scripts/built-commit.mjs";

let repo: string | undefined;

afterEach(() => {
  if (repo === undefined) return;
  // A guarded rm: an empty or unset path must never resolve to "rm -rf /".
  execFileSync("bash", ["-c", 'rm -rf "${CVFIX_REPO:?}"'], {
    env: { ...process.env, CVFIX_REPO: repo },
  });
  repo = undefined;
});

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

/** A fresh repo, so the real working tree is never dirtied, with one tracked, committed file. */
function freshRepo(): string {
  // Recorded in the module-level `repo` before any git call, so afterEach
  // can still clean this up if init/config/add/commit below throws.
  const dir = mkdtempSync(join(tmpdir(), "cv-build-iife-"));
  repo = dir;
  git(dir, ["init", "--quiet"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  writeFileSync(join(dir, "tracked.txt"), "committed\n");
  git(dir, ["add", "tracked.txt"]);
  // Signing is irrelevant to this scratch repo and must not depend on the
  // ambient git config (a machine with commit.gpgsign=true would otherwise
  // fail this commit for reasons that have nothing to do with the test).
  // core.hooksPath=/dev/null keeps an ambient hooksPath from rejecting this
  // commit for reasons that have nothing to do with the test either.
  git(dir, [
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--quiet",
    "--no-gpg-sign",
    "-m",
    "initial",
  ]);
  return dir;
}

describe("builtCommitSha", () => {
  it("still supplies the commit when an untracked file is present", () => {
    repo = freshRepo();
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repo,
      encoding: "utf8",
    }).trim();

    writeFileSync(join(repo, "stray.log"), "not tracked\n");

    expect(builtCommitSha(repo)).toBe(headSha);
  });

  it("supplies no commit when a tracked file has uncommitted changes", () => {
    repo = freshRepo();

    writeFileSync(join(repo, "tracked.txt"), "modified\n");

    expect(builtCommitSha(repo)).toBe("");
  });
});
