# SPDX-License-Identifier: Apache-2.0
"""``python -m capsule_viewer.ledger BUNDLE.json [--depth L0|L1|L2] [-o OUTPUT.html]``: the
ledger page, offline, over an evidence file of the ledger (``capsule-emit bundle LEDGER --all``
writes one). Any ``evidence-bundle/v2`` works, for example one ``capsulectl bundle --profile NAME
--root CAPSULE_ID --out bundle.json`` writes from a CLL entry log plus artifact store. It exits
as ``capsule-emit verify --bundle`` does on that file: 0 VALID, 2 INCOMPLETE, 1 INVALID or
unreadable."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import check_and_render

_VERDICT_EXIT = {"VALID": 0, "INVALID": 1, "INCOMPLETE": 2}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m capsule_viewer.ledger",
        description="Write one offline HTML page over a capsule ledger's evidence file "
        "(evidence-bundle/v2), such as `capsule-emit bundle LEDGER --all` or `capsulectl bundle` "
        "writes. The file is "
        "checked by capsule-emit's verifier; this only draws the page.",
    )
    parser.add_argument("path", metavar="BUNDLE.json", help="the ledger's evidence file")
    parser.add_argument("--depth", choices=("L0", "L1", "L2"), default="L1", help="the opening level (default: L1, the rows open)")
    parser.add_argument("-o", "--out", metavar="OUTPUT.html", default=None, help="write the page here (default: stdout)")
    args = parser.parse_args(argv)

    from capsule_emit.evidence_file import load_evidence_file

    try:
        bundle = load_evidence_file(args.path)
        if not isinstance(bundle, dict):
            raise ValueError(f"{args.path}: not a JSON object")
        check, page = check_and_render(bundle, source=args.path, depth=args.depth)
    except (ValueError, OSError) as err:
        print(f"ledger: {err}", file=sys.stderr)
        return 1
    if args.out:
        Path(args.out).write_text(page, encoding="utf-8")
        records = bundle.get("records")
        count = len(records) if isinstance(records, list) else 0
        print(f"ledger: {check.verdict} — wrote {count} record(s) to {args.out}")
    else:
        print(page)
    return _VERDICT_EXIT[check.verdict]


if __name__ == "__main__":
    sys.exit(main())
