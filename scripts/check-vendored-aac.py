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

Each copy is compared with the same file in agent-action-capsule:

- with --rev REV, at that revision of the checkout (CI passes VENDORED_REV,
  the revision the copies were last taken at, printed by --print-rev): a
  difference fails, since the copy is not what it says it is;
- without it, in the checkout's working tree (CI uses a fresh clone of main,
  in a step that only warns): a difference means AAC has moved on, so the
  copy is due to be re-vendored with the change that adapts to it. That waits
  for the AAC release capsule-viewer pins, since the pinned package's words
  and these copies must agree.

VENDORED_REV is this script's own pin, not scripts/check-moved-spec.py's
AAC_REV: the moved spec text is compared with the revision it moved from,
which never changes, while the copies are re-vendored with each AAC release
capsule-viewer pins, so their revision moves with that pin.

Usage:
    python3 scripts/check-vendored-aac.py --aac PATH [--rev REV]
    python3 scripts/check-vendored-aac.py --print-rev    # print VENDORED_REV
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
# agent-action-capsule main at the ts 0.8.0 release (#400's merge, b646f94).
VENDORED_REV = "b646f94aaad7c9fdabc553c458fabd7e28619c65"
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
    parser.add_argument("--aac", type=Path, help="an agent-action-capsule checkout")
    parser.add_argument("--rev", help="compare with this revision instead of the working tree")
    parser.add_argument("--print-rev", action="store_true", help="print VENDORED_REV and exit (CI fetches it)")
    args = parser.parse_args()
    if args.print_rev:
        print(VENDORED_REV)
        return 0
    if args.aac is None:
        parser.error("--aac is required")

    def theirs(aac_path: str) -> bytes | None:
        if args.rev is None:
            path = args.aac / aac_path
            return path.read_bytes() if path.is_file() else None
        shown = subprocess.run(
            ["git", "-C", str(args.aac), "show", f"{args.rev}:{aac_path}"],
            capture_output=True,
            check=False,
        )
        return shown.stdout if shown.returncode == 0 else None

    stale = []
    pairs = inventory()
    for local, aac_path in pairs:
        upstream = theirs(aac_path)
        if upstream is None:
            stale.append(f"{aac_path}: not in agent-action-capsule")
        elif not local.is_file():
            stale.append(f"{local.relative_to(REPO)}: listed but missing here")
        elif local.read_bytes() != upstream:
            stale.append(f"{local.relative_to(REPO)}: differs from agent-action-capsule {aac_path}")
    if stale:
        print("Vendored agent-action-capsule files are stale; re-vendor them:", file=sys.stderr)
        for line in stale:
            print(f"  {line}", file=sys.stderr)
        return 1
    where = f"{args.aac} at {args.rev}" if args.rev else str(args.aac)
    print(f"OK: {len(pairs)} vendored agent-action-capsule files match {where}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
