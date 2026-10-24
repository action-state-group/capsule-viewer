#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Check that every vendored agent-action-capsule file still matches AAC.

capsule-viewer keeps byte copies of agent-action-capsule files its tests and
checkers read (AAC#379):

- ts/test/testdata/aac-vectors/: files under AAC's vectors/, at their path
  below vectors/, each a row of that directory's README table, plus the whole
  viewer-core-text/ directory;
- schemas/vendor/agent-action-capsule/: AAC files at their AAC path, each a
  row of schemas/README.md's vendor table.

Each copy is compared with the same file in an agent-action-capsule checkout
(its working tree, normally a fresh clone of main). A file that differs, or is
missing there, fails the check: re-vendor it (copy the new bytes, update its
row) in the same change that adapts to it.

Usage:
    python3 scripts/check-vendored-aac.py --aac PATH
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ROW = re.compile(r"^\| `([^`]+)` \|")


def rows(readme: Path) -> list[str]:
    return [m.group(1) for line in readme.read_text("utf8").splitlines() if (m := ROW.match(line))]


def inventory() -> list[tuple[Path, str]]:
    """(local copy, path in agent-action-capsule) for every vendored file."""
    pairs: list[tuple[Path, str]] = []
    vectors = REPO / "ts" / "test" / "testdata" / "aac-vectors"
    for path in rows(vectors / "README.md"):
        pairs.append((vectors / path, f"vectors/{path}"))
    for file in sorted((vectors / "viewer-core-text").iterdir()):
        pairs.append((file, f"vectors/viewer-core-text/{file.name}"))
    vendor = REPO / "schemas" / "vendor" / "agent-action-capsule"
    for path in rows(REPO / "schemas" / "README.md"):
        if path.startswith(("schemas/", "vectors/")):
            pairs.append((vendor / path, path))
    return pairs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--aac", required=True, type=Path, help="an agent-action-capsule checkout")
    args = parser.parse_args()
    stale = []
    pairs = inventory()
    for local, aac_path in pairs:
        theirs = args.aac / aac_path
        if not theirs.is_file():
            stale.append(f"{aac_path}: gone from agent-action-capsule")
        elif not local.is_file():
            stale.append(f"{local.relative_to(REPO)}: listed but missing here")
        elif local.read_bytes() != theirs.read_bytes():
            stale.append(f"{local.relative_to(REPO)}: differs from agent-action-capsule {aac_path}")
    if stale:
        print("Vendored agent-action-capsule files are stale; re-vendor them:", file=sys.stderr)
        for line in stale:
            print(f"  {line}", file=sys.stderr)
        return 1
    print(f"OK: {len(pairs)} vendored agent-action-capsule files match {args.aac}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
