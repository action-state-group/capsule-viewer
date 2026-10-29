// SPDX-License-Identifier: Apache-2.0
// Draw one report page from a bundle, with a wording pack of your own.
//
//   npm run build
//   node scripts/render-report.mjs BUNDLE.json [--wording PACK.json]
//     [--charts CHARTS.json] [--format html|static] -o PAGE.html
//
// The page is the offline HTML the presentation builder writes: the bundle,
// this package's page runtime, and the pack, bound by its wording_sha256.
// --charts is a JSON list of chart specs (docs/design/chart-spec.md), drawn
// in that order and each checked against the dataset the bundle's Result
// names; a spec that does not match refuses the build. --format static
// writes the page rendered now, with no script: the copy a reader with
// scripts off can open (it needs jsdom, a dev dependency of this package).
// Which report (if any) a pack is checked against is whatever the registry
// resolves the bundle to, not which report-opting-in extension keys this
// script can see on the bundle: buildPresentation resolves the module
// first, then checks the pack against that module's defaults
// (presentation-builder.ts's checkWordingFits), the same check on every
// path a page can be built on. Every problem buildPresentation finds --an
// ambiguous registry, a module the pack does not fit, a bundle that does
// not verify-- is in its PresentationBuildError.message; this script prints
// it and writes nothing. The bundle is never changed, so no judge pin,
// digest or verdict moves.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildPresentation, PresentationBuildError } from "../dist/index.js";

const USAGE =
  "usage: node scripts/render-report.mjs BUNDLE.json [--wording PACK.json] [--charts CHARTS.json] [--format html|static] -o PAGE.html";
const usage = () => {
  console.error(USAGE);
  process.exit(2);
};
const refuse = (message) => {
  console.error(message);
  process.exit(1);
};
const args = process.argv.slice(2);
const take = (flag) => {
  const at = args.indexOf(flag);
  if (at === -1) return undefined;
  const [, value] = args.splice(at, 2);
  if (value === undefined || value.startsWith("-")) usage();
  return value;
};
const wordingPath = take("--wording");
const chartsPath = take("--charts");
const format = take("--format") ?? "html";
const out = take("-o");
if (format !== "html" && format !== "static") usage();
const [bundlePath, ...rest] = args;
if (bundlePath === undefined || out === undefined || rest.length > 0) usage();

const readJson = (path, what) => {
  const text = readFileSync(path, "utf8");
  try {
    return { text, value: JSON.parse(text) };
  } catch (e) {
    return refuse(`${path}: the ${what} is not JSON (${e.message})`);
  }
};

const { value: bundle } = readJson(bundlePath, "bundle");

let wording;
if (wordingPath !== undefined) {
  const { text } = readJson(wordingPath, "wording pack");
  wording = {
    pack: text,
    sha256: createHash("sha256").update(text, "utf8").digest("hex"),
  };
}

let charts;
if (chartsPath !== undefined) {
  charts = readJson(chartsPath, "charts file").value;
  if (!Array.isArray(charts))
    refuse(`${chartsPath}: the charts file is not a JSON list of chart specs`);
}

if (format === "static") {
  // The static page is rendered here, in a DOM of its own.
  const { JSDOM } = await import("jsdom");
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
  });
  for (const name of Object.getOwnPropertyNames(window))
    if (!(name in globalThis) && /^[A-Z]/u.test(name))
      globalThis[name] = window[name];
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
}

const iife = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "evidence-graph.iife.js",
);
let built;
try {
  built = await buildPresentation(bundle, {
    presentation: "auto",
    audience: "*",
    format,
    runtime: { code: readFileSync(iife, "utf8") },
    ...(wording === undefined ? {} : { wording }),
    ...(charts === undefined ? {} : { charts }),
  });
} catch (e) {
  if (e instanceof PresentationBuildError) refuse(e.message);
  throw e;
}
writeFileSync(out, built.html);
console.log(
  `${out}: ${format}, module ${built.module ?? "none"} (${built.resolution})${wording === undefined ? ", default words" : `, wording_sha256 ${wording.sha256}`}${charts === undefined ? "" : `, ${charts.length} chart${charts.length === 1 ? "" : "s"}`}`,
);
