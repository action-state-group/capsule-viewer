# SPDX-License-Identifier: Apache-2.0
"""Engage the seller kind on the seller copy inside an existing bilateral
fixture, and recompose it:

  recompose_engaged.py COMPOSED > RECOMPOSED

The bilateral fixtures were built (``build_bilateral_fixtures.sh``) by a
capsulectl that does not engage the seller kind. This applies the same fixture step
(``engage_seller_kind.engage``) to each carried copy whose opening record seals
``party_role`` ``seller``, then recomputes that member's digest and the
composed digest exactly as ``compose_bilateral.py`` computes them. Nothing else
changes: the container, the buyer's copy, the observers and the joins are the
fixture's own bytes. The build verifies the file as written. Writes the
recomposed bundle to stdout.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compose_bilateral import KIND, composed_digest  # noqa: E402 -- this directory's composer, after the path
from engage_seller_kind import engage, opening_role  # noqa: E402 -- this directory's fixture step, after the path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from capsule_viewer.digest import bundle_digest  # noqa: E402 -- the repo's own digest, after the path


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    composed = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    block = composed["extensions"][KIND]
    engaged = 0
    for member in block["members"]:
        if opening_role(member["bundle"]) != "seller":
            continue
        refusal = engage(member["bundle"], f"{argv[0]} {member['id']}")
        if refusal is not None:
            print(refusal, file=sys.stderr)
            return 1
        member["digest"] = bundle_digest(member["bundle"])
        engaged += 1
    if engaged != 1:
        print(f"{argv[0]}: expected one seller copy, engaged {engaged}", file=sys.stderr)
        return 1
    block["composed_digest"] = composed_digest(block)
    json.dump(composed, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
