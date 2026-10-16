// SPDX-License-Identifier: Apache-2.0
// Packs the package as npm would publish it, installs the tarball into an
// empty consumer and imports it there, so a broken `files` list or `exports`
// map fails here rather than on the registry.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { name } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const temporary = mkdtempSync(join(tmpdir(), "capsule-viewer-package-"));
const run = (command, args, cwd = temporary) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

try {
  const [packed] = JSON.parse(
    run(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
      root,
    ),
  );
  const paths = packed.files.map(({ path }) => path);
  for (const required of [
    "LICENSE",
    "LICENSE-BSD-3-Clause",
    "README.md",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/browser.js",
    "dist/emitter-shell.html",
    "dist/evidence-graph.iife.js",
  ])
    assert(paths.includes(required), `${required} is not in the package`);
  for (const path of paths)
    assert(
      !path.startsWith("src/") && !path.startsWith("test/"),
      `${path} should not be published`,
    );
  writeFileSync(
    join(temporary, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    join(temporary, packed.filename),
  ]);
  // The emitter reads dist/emitter-shell.html as it loads, so emitting a page
  // from the installed package also proves the shell was packed beside it.
  run("node", [
    "--input-type=module",
    "-e",
    `const { emitEvidenceGraphHtml } = await import(${JSON.stringify(name)});
     const page = emitEvidenceGraphHtml({}, "/*IIFE*/");
     if (!page.startsWith("<!doctype html>")) throw new Error("no page");`,
  ]);
  console.log(`${packed.filename}: ${paths.length} files, emits a page`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
