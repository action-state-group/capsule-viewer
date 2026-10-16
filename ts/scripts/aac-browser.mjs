// SPDX-License-Identifier: Apache-2.0
// An esbuild plugin for bundling src/browser.ts. Under the `browser`
// condition, @action-state-group/agent-action-capsule 0.1.1 resolves to its
// browser entry, which does not re-export four browser-safe modules the moved
// views import (evidence-graph, outcome-report, outcome-report-presentation,
// report-rows), and which also carries AAC's own copy of the views. This
// resolves the package to the modules that define what src/ imports, read
// from the exact pinned version's dist/; a new import from another module
// fails the build with "No matching export". Delete it once AAC's browser
// entry exports these modules and no longer carries the views.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const name = "@action-state-group/agent-action-capsule";
const modules = [
  "builtin-manifests.js",
  "bundle.js",
  "composed.js",
  "countersignature-stamp.js",
  "evidence-graph.js",
  "json.js",
  "outcome-report-presentation.js",
  "outcome-report.js",
  "presentation-fragment.js",
  "presentation-registry.js",
  "presentation.js",
  "report-rows.js",
  "result-root.js",
  "verification-page.js",
];

export const aacBrowser = {
  name: "aac-browser",
  setup(build) {
    // The package's Node entry is dist/index.js; its exports map hides
    // package.json, so the version is read beside dist/.
    const dist = dirname(fileURLToPath(import.meta.resolve(name)));
    const { version } = JSON.parse(
      readFileSync(join(dist, "..", "package.json"), "utf8"),
    );
    if (version !== "0.1.1")
      throw new Error(`aac-browser expects ${name} 0.1.1, found ${version}`);
    build.onResolve(
      { filter: /^@action-state-group\/agent-action-capsule$/ },
      () => ({
        path: name,
        namespace: "aac-browser",
      }),
    );
    build.onLoad({ filter: /.*/, namespace: "aac-browser" }, () => ({
      contents: modules
        .map((file) => `export * from ${JSON.stringify(join(dist, file))};`)
        .join("\n"),
      loader: "js",
      resolveDir: dist,
    }));
  },
};
