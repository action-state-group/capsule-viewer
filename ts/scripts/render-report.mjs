// SPDX-License-Identifier: Apache-2.0
// Draw one report page from a bundle, with a wording pack of your own.
//
//   npm run build
//   node scripts/render-report.mjs BUNDLE.json [--wording PACK.json] -o PAGE.html
//
// The page is the offline HTML the presentation builder writes: the bundle,
// this package's page runtime, and the pack, bound by its wording_sha256.
// The pack is checked first against the contract-report module's default
// pack for the bundle's report (same placeholders in every entry it
// replaces, no two verdicts sharing a word, the same grouping, no locked
// line reworded); every
// problem is printed and nothing is written. A pack for a bundle that opts
// into neither report, or into both, is refused too: there is no one
// default to check it against. The bundle is never changed, so no judge
// pin, digest or verdict moves.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildPresentation } from "../dist/index.js";
import {
  DEFAULT_PACKS,
  readWordingPack,
  wordingProblems,
} from "../dist/contract-report-wording.js";

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
const extensions = Object.keys(bundle?.extensions ?? {});
const opted = [
  ...(extensions.includes("outcome-report/v1") ? ["lines"] : []),
  ...(extensions.includes("eu-ai-act-compliance/v1") ? ["groups"] : []),
];

let wording;
if (wordingPath !== undefined) {
  if (opted.length !== 1)
    refuse(
      `${bundlePath}: opts into ${opted.length === 0 ? "neither report" : "both reports"}; a wording pack is checked against one report's defaults`,
    );
  const { text, value } = readJson(wordingPath, "wording pack");
  let pack;
  try {
    pack = readWordingPack(value);
  } catch (e) {
    refuse(`${wordingPath}: ${e.message}`);
  }
  const problems = wordingProblems(pack, DEFAULT_PACKS[opted[0]]);
  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
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
const built = await buildPresentation(bundle, {
  presentation: "auto",
  audience: "*",
  format: "html",
  runtime: { code: readFileSync(iife, "utf8") },
  ...(wording === undefined ? {} : { wording }),
});
writeFileSync(out, built.html);
console.log(
  `${out}: module ${built.module ?? "none"} (${built.resolution})${wording === undefined ? ", default words" : `, wording_sha256 ${wording.sha256}`}`,
);
