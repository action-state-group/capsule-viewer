// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";

/**
 * The commit cwd's tree was built from, or "" when cwd's tracked files
 * carry uncommitted changes the running bundle might not match. Untracked
 * files (a stray log, an editor swap file) are not HEAD's code either way,
 * so they don't count: only tracked changes can make the running bundle
 * disagree with HEAD. Exported standalone so a test can exercise it against
 * a throwaway git repo, without bundling.
 */
export function builtCommitSha(cwd) {
  function git(args) {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    } catch (error) {
      throw new Error(
        `could not run \`git ${args.join(" ")}\` in ${cwd}: ${error.message}`,
      );
    }
  }
  const headSha = git(["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/u.test(headSha))
    throw new Error(
      `git rev-parse HEAD did not return a 40-hex commit sha: ${JSON.stringify(headSha)}`,
    );
  const dirty =
    git(["status", "--porcelain", "--untracked-files=no", "--", "."]) !== "";
  return dirty ? "" : headSha;
}

/**
 * Whether the tree at `commit` is the release `version` names: true only when
 * the tag `ts/v<version>` points at that very commit. A build from any other
 * commit, or from a tree with no stated commit (`""`), is not that release,
 * so its "Verified by" line says it has changes after the version. Only the
 * tag decides, so a version bumped in package.json without its release does
 * not read as released.
 */
export function builtIsRelease(cwd, commit, version) {
  if (commit === "") return false;
  try {
    return execFileSync("git", ["tag", "--points-at", commit], {
      cwd,
      encoding: "utf8",
    })
      .split("\n")
      .includes(`ts/v${version}`);
  } catch (error) {
    throw new Error(
      `could not run \`git tag --points-at ${commit}\` in ${cwd}: ${error.message}`,
    );
  }
}
