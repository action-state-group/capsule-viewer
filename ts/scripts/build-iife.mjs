// SPDX-License-Identifier: Apache-2.0
// Bundles src/browser.ts as dist/evidence-graph.iife.js, the in-browser
// renderer an emitted page runs (`npm run emitter:iife`).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { builtCommitSha, builtIsRelease } from "./built-commit.mjs";

const tsRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** An installed package's version; its exports map hides package.json, so it is read beside dist/. */
function installed(name) {
  const dist = dirname(fileURLToPath(import.meta.resolve(name)));
  return JSON.parse(readFileSync(join(dist, "..", "package.json"), "utf8"))
    .version;
}

async function main() {
  // A report page's "Verified by" line names this package and its verifier
  // at the versions in src/viewer-build.ts. Refuse to bundle a page runtime
  // whose stated versions are not the ones being bundled.
  const stated = readFileSync(join(tsRoot, "src", "viewer-build.ts"), "utf8");
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
  const commitSha = builtCommitSha(tsRoot);
  // The version is package.json's; whether this build is that release, or has
  // changes after it, is stated from the release tag alone.
  const unreleased = !builtIsRelease(tsRoot, commitSha, own.version);

  await build({
    entryPoints: ["src/browser.ts"],
    bundle: true,
    format: "iife",
    globalName: "EvidenceGraph",
    define: {
      __CAPSULE_VIEWER_COMMIT__: JSON.stringify(commitSha),
      __CAPSULE_VIEWER_UNRELEASED__: JSON.stringify(unreleased),
    },
    footer: {
      js: "globalThis.renderEvidenceGraph = EvidenceGraph.renderEvidenceGraph;",
    },
    outfile: "dist/evidence-graph.iife.js",
  });
}

await main();
