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
    "README.md",
    "dist/index.js",
    "dist/index.d.ts",
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
  run("node", [
    "--input-type=module",
    "-e",
    `await import(${JSON.stringify(name)});`,
  ]);
  console.log(`${packed.filename}: ${paths.length} files, imports cleanly`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
