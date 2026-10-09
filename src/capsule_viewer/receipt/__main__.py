# SPDX-License-Identifier: Apache-2.0
"""``python -m capsule_viewer.receipt BUNDLE VERIFY_JSON AUDIENCE [DEPTH]``
prints the receipt page for a bundle (one copy, or a composed/v1 bundle of
two) and what ``capsulectl verify --bundle`` reported for it, worded by the
example English pack. A report that is not for
this exact bundle writes no page and exits 1. The receipt layout test opens
these pages in headless Chromium."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from ..composed import composition_from_capsulectl
from ..verifier_report import VerifierReportError, context_from_capsulectl
from . import example_wording_pack, receipt_page


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) not in (3, 4):
        print(__doc__, file=sys.stderr)
        return 2
    bundle = json.loads(Path(args[0]).read_text(encoding="utf-8"))
    output = json.loads(Path(args[1]).read_text(encoding="utf-8"))
    try:
        context, assurance = context_from_capsulectl(bundle, output)
        composition = composition_from_capsulectl(bundle, output)
    except VerifierReportError as exc:
        print(f"no page written: {exc}", file=sys.stderr)
        return 1
    pack = example_wording_pack()
    depth = args[3] if len(args) == 4 else "L0"
    sys.stdout.write(receipt_page(context, assurance, pack, hashlib.sha256(pack).hexdigest(), audience=args[2], depth=depth, composition=composition))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
