// SPDX-License-Identifier: Apache-2.0
// Bundles src/browser.ts as dist/evidence-graph.iife.js, the in-browser
// renderer an emitted page runs (`npm run emitter:iife`).
import { build } from "esbuild";
import { aacBrowser } from "./aac-browser.mjs";

await build({
  entryPoints: ["src/browser.ts"],
  bundle: true,
  format: "iife",
  globalName: "EvidenceGraph",
  footer: {
    js: "globalThis.renderEvidenceGraph = EvidenceGraph.renderEvidenceGraph;",
  },
  outfile: "dist/evidence-graph.iife.js",
  plugins: [aacBrowser],
});
