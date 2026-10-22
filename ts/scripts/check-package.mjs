// SPDX-License-Identifier: Apache-2.0
// Packs the package as npm would publish it, installs the tarball into an
// empty consumer and imports it there, so a broken `files` list or `exports`
// map fails here rather than on the registry.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { name, dependencies } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
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
  // A `file:` dependency inside a tarball-installed package resolves
  // relative to the CONSUMER's own directory, not the packed package's
  // (there is no real directory for it on disk once installed from a
  // tarball): the vendored agent-action-capsule tgz has to exist at the
  // same relative path here before npm installs the packed tarball, or
  // the install fails with ENOENT on it.
  for (const [dep, spec] of Object.entries(dependencies ?? {}))
    if (spec.startsWith("file:")) {
      const relative = spec.slice("file:".length);
      mkdirSync(dirname(join(temporary, relative)), { recursive: true });
      copyFileSync(join(root, relative), join(temporary, relative));
      console.log(
        `${dep}: copied its file: dependency (${relative}) into the consumer first`,
      );
    }
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
