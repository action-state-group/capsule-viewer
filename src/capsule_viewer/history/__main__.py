# SPDX-License-Identifier: Apache-2.0
"""``python -m capsule_viewer.history check BUNDLE`` prints the Python check's
reasons for a history container bundle as JSON and exits 1 when there is any.
``python -m capsule_viewer.history pin`` rewrites ``manifest.json``'s
``executable.script_sha256`` to the script's current digest."""
from __future__ import annotations

import argparse
import json
import sys
from importlib import resources
from pathlib import Path

from . import script_sha256
from .recompute import recompute_errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m capsule_viewer.history")
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("check", help="run the Python recompute check")
    check.add_argument("bundle")
    sub.add_parser("pin", help="pin the script's digest in manifest.json")
    args = parser.parse_args(argv)
    if args.command == "pin":
        path = Path(str(resources.files(__package__).joinpath("manifest.json")))
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["executable"]["script_sha256"] = script_sha256()
        path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        return 0
    errors = recompute_errors(json.loads(Path(args.bundle).read_text(encoding="utf-8")))
    sys.stdout.write(json.dumps(errors, indent=1) + "\n")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
