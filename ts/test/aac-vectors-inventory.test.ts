// SPDX-License-Identifier: Apache-2.0
// The vendored agent-action-capsule files under test/testdata/aac-vectors/:
// every file has a row in its README, and every row's SHA-256 is the file's,
// so a file copied over without its row (or a row left stale) fails here.
// viewer-core-text/ carries its own SHA256SUMS, checked by
// viewer-core-text-vectors.test.ts.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { expect, it } from "vitest";

const DIR = resolve(process.cwd(), "test", "testdata", "aac-vectors");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? files(path) : [relative(DIR, path)];
  });
}

const rows = new Map(
  [
    ...readFileSync(resolve(DIR, "README.md"), "utf8").matchAll(
      /^\| `([^`]+)` \|.*\| `([0-9a-f]{64})` \|$/gmu,
    ),
  ].map((m) => [m[1]!, m[2]!]),
);

it("every vendored file has a README row with its SHA-256", () => {
  const vendored = files(DIR)
    .filter((f) => f !== "README.md" && !f.startsWith("viewer-core-text/"))
    .sort();
  expect([...rows.keys()].sort()).toEqual(vendored);
  for (const file of vendored)
    expect(
      createHash("sha256")
        .update(readFileSync(resolve(DIR, file)))
        .digest("hex"),
      file,
    ).toBe(rows.get(file));
});
