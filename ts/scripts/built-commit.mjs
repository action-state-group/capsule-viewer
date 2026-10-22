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
