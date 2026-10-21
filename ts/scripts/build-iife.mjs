// SPDX-License-Identifier: Apache-2.0
// Bundles src/browser.ts as dist/evidence-graph.iife.js, the in-browser
// renderer an emitted page runs (`npm run emitter:iife`).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { aacBrowser } from "./aac-browser.mjs";

// A report page's "Verified by" line names this package and its verifier at
// the versions in src/viewer-build.ts. Refuse to bundle a page runtime whose
// stated versions are not the ones being bundled.
const tsRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const stated = readFileSync(join(tsRoot, "src", "viewer-build.ts"), "utf8");
/** An installed package's version; its exports map hides package.json, so it is read beside dist/. */
function installed(name) {
  const dist = dirname(fileURLToPath(import.meta.resolve(name)));
  return JSON.parse(readFileSync(join(dist, "..", "package.json"), "utf8"))
    .version;
}
const own = JSON.parse(readFileSync(join(tsRoot, "package.json"), "utf8"));
for (const [field, actual] of [
  ["viewer", own.name],
  ["viewerVersion", own.version],
  ["verifierVersion", installed("@action-state-group/agent-action-capsule")],
  ["cllVersion", installed("@action-state-group/cll")],
]) {
  const found = new RegExp(`\\b${field}: "([^"]*)"`, "u").exec(stated)?.[1];
  if (found !== actual)
    throw new Error(
      `src/viewer-build.ts states ${field} ${JSON.stringify(found)}, but this build bundles ${JSON.stringify(actual)}`,
    );
}

// The "Verified by" line names the exact commit this build was made from,
// never a release flag. Only this build step can state it: tsc's ESM
// output (dist/) has no step like this one, so it reads VIEWER_BUILD.commit
// as not stated.
function git(args) {
  try {
    return execFileSync("git", args, { cwd: tsRoot, encoding: "utf8" }).trim();
  } catch (error) {
    throw new Error(
      `could not run \`git ${args.join(" ")}\` in ${tsRoot}: ${error.message}`,
    );
  }
}
const headSha = git(["rev-parse", "HEAD"]);
if (!/^[0-9a-f]{40}$/u.test(headSha))
  throw new Error(
    `git rev-parse HEAD did not return a 40-hex commit sha: ${JSON.stringify(headSha)}`,
  );
// Uncommitted changes under ts/ mean the bundle may not actually be HEAD's
// code; the less-claiming choice is to say the commit is not stated, not to
// name a commit the running bundle might not match.
const dirty = git(["status", "--porcelain", "--", "."]) !== "";
const commitSha = dirty ? "" : headSha;

await build({
  entryPoints: ["src/browser.ts"],
  bundle: true,
  format: "iife",
  globalName: "EvidenceGraph",
  define: {
    __CAPSULE_VIEWER_COMMIT__: JSON.stringify(commitSha),
  },
  footer: {
    js: "globalThis.renderEvidenceGraph = EvidenceGraph.renderEvidenceGraph;",
  },
  outfile: "dist/evidence-graph.iife.js",
  plugins: [aacBrowser],
});
