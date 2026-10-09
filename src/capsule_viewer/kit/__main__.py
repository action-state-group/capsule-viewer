# SPDX-License-Identifier: Apache-2.0
"""``python -m capsule_viewer.kit tokens [--write]`` checks (or regenerates) the
token block in ``static/kit.css``; ``python -m capsule_viewer.kit fixture``
prints the every-component fixture page the headless layout test opens."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .fixture import fixture_page
from .tokens import TokenDriftError, check_token_sync, regenerate


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m capsule_viewer.kit")
    sub = parser.add_subparsers(dest="command", required=True)
    tokens = sub.add_parser("tokens", help="check the kit.css token block against TOKENS")
    tokens.add_argument("--write", action="store_true", help="regenerate the block in place instead")
    sub.add_parser("fixture", help="print the component fixture page")
    args = parser.parse_args(argv)

    if args.command == "fixture":
        sys.stdout.write(fixture_page())
        return 0
    path = Path(__file__).resolve().parent.parent / "static" / "kit.css"
    css = path.read_text(encoding="utf-8")
    if args.write:
        path.write_text(regenerate(css), encoding="utf-8")
        return 0
    try:
        check_token_sync(css)
    except TokenDriftError as exc:
        print(exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
