// SPDX-License-Identifier: Apache-2.0
// Draw one report page from a bundle, with a wording pack of your own.
//
//   npm run build
//   node scripts/render-report.mjs BUNDLE.json [--wording PACK.json] -o PAGE.html
//
// The page is the offline HTML the presentation builder writes: the bundle,
// this package's page runtime, and the pack, bound by its wording_sha256.
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
  "usage: node scripts/render-report.mjs BUNDLE.json [--wording PACK.json] -o PAGE.html";
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
const out = take("-o");
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
    format: "html",
    runtime: { code: readFileSync(iife, "utf8") },
    ...(wording === undefined ? {} : { wording }),
  });
} catch (e) {
  if (e instanceof PresentationBuildError) refuse(e.message);
  throw e;
}
writeFileSync(out, built.html);
console.log(
  `${out}: module ${built.module ?? "none"} (${built.resolution})${wording === undefined ? ", default words" : `, wording_sha256 ${wording.sha256}`}`,
);
