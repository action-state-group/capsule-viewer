# SPDX-License-Identifier: Apache-2.0
"""``python -m capsule_viewer.ledger LEDGER [-o OUTPUT.html]``: the ledger page,
offline. It exits as ``capsule-emit verify --bundle`` does on the ledger's
file: 0 VALID, 2 INCOMPLETE, 1 INVALID, empty or unreadable."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import check_and_render

_VERDICT_EXIT = {"VALID": 0, "INVALID": 1, "INCOMPLETE": 2}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m capsule_viewer.ledger",
        description="Write one offline HTML page over a capsule ledger. The ledger is checked by "
        "capsule-emit's verifier as one evidence file; this only draws the page.",
    )
    parser.add_argument("path", metavar="LEDGER", help="a JSONL ledger, as capsule-emit ledger view reads one")
    parser.add_argument("-o", "--out", metavar="OUTPUT.html", default=None, help="write the page here (default: stdout)")
    args = parser.parse_args(argv)

    from capsule_emit.ledger import read_ledger
    from capsule_emit.permalink import PermalinkError

    try:
        records = read_ledger(args.path)
        if not records:
            raise ValueError(f"{args.path} is empty or not found")
        check, page = check_and_render(records, source=args.path)
    except (ValueError, OSError, PermalinkError) as err:
        print(f"ledger: {err}", file=sys.stderr)
        return 1
    if args.out:
        Path(args.out).write_text(page, encoding="utf-8")
        print(f"ledger: {check.verdict} — wrote {len(records)} record(s) to {args.out}")
    else:
        print(page)
    return _VERDICT_EXIT[check.verdict]


if __name__ == "__main__":
    sys.exit(main())
