# SPDX-License-Identifier: Apache-2.0
"""``python -m capsule_viewer.rules fixture [--depth L0|L1|L2] [--unrecognized TOKEN] [--without-legacy]``
prints the synthetic rules page the headless layout test opens."""
from __future__ import annotations

import argparse
import sys

from ..wording import sha256_hex
from . import example_wording_pack, rules_page
from .fixture import RECORD_KIND, bundle, fixture_context


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m capsule_viewer.rules")
    sub = parser.add_subparsers(dest="command", required=True)
    fixture = sub.add_parser("fixture", help="print the synthetic rules page")
    fixture.add_argument("--depth", choices=("L0", "L1", "L2"), default="L0")
    fixture.add_argument("--unrecognized", default="", help="give one rule a platform status no pack knows")
    fixture.add_argument("--without-legacy", action="store_true", help="leave out the legacy report/v1 record")
    args = parser.parse_args(argv)
    pack = example_wording_pack()
    sys.stdout.write(rules_page(fixture_context(bundle(args.unrecognized, legacy=not args.without_legacy)), pack, sha256_hex(pack), RECORD_KIND, depth=args.depth))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
