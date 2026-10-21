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
// replaces, no two verdicts sharing a word, the same grouping); every
// problem is printed and nothing is written. The bundle is never changed,
// so no judge pin, digest or verdict moves.
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

const args = process.argv.slice(2);
const take = (flag) => {
  const at = args.indexOf(flag);
  if (at === -1) return undefined;
  const [, value] = args.splice(at, 2);
  return value;
};
const wordingPath = take("--wording");
const out = take("-o");
const [bundlePath] = args;
if (bundlePath === undefined || out === undefined) {
  console.error(
    "usage: node scripts/render-report.mjs BUNDLE.json [--wording PACK.json] -o PAGE.html",
  );
  process.exit(2);
}

const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
const extensions = Object.keys(bundle?.extensions ?? {});
const grouping = extensions.includes("eu-ai-act-compliance/v1")
  ? "groups"
  : extensions.includes("outcome-report/v1")
    ? "lines"
    : undefined;

let wording;
if (wordingPath !== undefined) {
  const text = readFileSync(wordingPath, "utf8");
  const pack = readWordingPack(JSON.parse(text));
  if (grouping !== undefined) {
    const problems = wordingProblems(pack, DEFAULT_PACKS[grouping]);
    if (problems.length > 0) {
      for (const p of problems) console.error(p);
      process.exit(1);
    }
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
