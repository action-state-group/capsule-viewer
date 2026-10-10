# SPDX-License-Identifier: Apache-2.0
"""Engage the seller copy's bundle extension kind on a capsulectl seller copy,
for the seller receipt fixtures (``build_seller_fixtures.sh``):

  engage_seller_kind.py BUNDLE > ENGAGED_BUNDLE

capsulectl at the commit the fixtures are built from does not engage the
kind (a later capsule-cli does), so the fixture step adds it: the copy's
``extensions`` gain ``SELLER_KIND`` (``capsule_viewer.receipt.role``) with an
empty block. Nothing else changes. The block is packaging, not sealed, so the
bundle still verifies, with a new bundle digest; the build verifies the file
as written.

It refuses, and the build stops, when:

* the copy's extension kinds are not exactly the ones capsulectl wrote when
  this step was written (``EXPECTED``): a producer that now engages a kind of
  its own (this one under its final name, or any other) means this step is
  out of date. Switch the fixtures to the producer's kind and delete this
  step;
* the copy's own opening record does not seal ``party_role`` ``seller``.

Writes the engaged bundle to stdout.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from capsule_viewer.context import Json  # noqa: E402 -- the repo's own types, after the path
from capsule_viewer.receipt.role import SELLER_KIND  # noqa: E402 -- the repo's own constant, after the path

# A capsulectl bundle as loaded, changed in place.
Bundle = dict[str, Json]

# What capsulectl engages on a deal copy today.
EXPECTED = ["x-cadence-witness/v0", "x-deal-v0"]


def opening_role(bundle: Bundle) -> str | None:
    """The party role the copy's disclosed opening record seals."""
    for record in bundle["records"]:
        payload = bundle.get("disclosures", {}).get(record["capsule_id"], {}).get("agent_input")
        if not isinstance(payload, dict):
            continue
        block = payload.get("x-deal-v0", {})
        if block.get("record_type") == "baseline" and block.get("seq") == 1:
            return payload["body"]["intent"].get("party_role", "buyer")
    return None


def engage(bundle: Bundle, name: str) -> str | None:
    """Add ``SELLER_KIND`` to *bundle*'s extensions, in place; the reason it
    refuses (naming *name*), or ``None``."""
    kinds = sorted(bundle.get("extensions", {}))
    if kinds != EXPECTED:
        return (
            f"{name}: the producer now engages {kinds}, not {EXPECTED}. If it engages the seller kind itself, "
            "switch the fixtures to it and delete this step; otherwise update EXPECTED."
        )
    role = opening_role(bundle)
    if role != "seller":
        return f"{name}: the opening record seals party_role {role!r}, not 'seller'; not engaging"
    bundle["extensions"][SELLER_KIND] = {}
    return None


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    bundle = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    refusal = engage(bundle, argv[0])
    if refusal is not None:
        print(refusal, file=sys.stderr)
        return 1
    json.dump(bundle, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
