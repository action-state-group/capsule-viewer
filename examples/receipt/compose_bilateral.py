# SPDX-License-Identifier: Apache-2.0
"""Compose two deal copies into one composed/v1 bundle, for the bilateral
receipt fixtures (``build_bilateral_fixtures.sh``):

  compose_bilateral.py CONTAINER PART_A PART_B JOIN...

CONTAINER is an ordinary evidence bundle the composer sealed itself; PART_A
and PART_B are the two parties' copies, carried byte for byte as members
``party-a`` and ``party-b``. Each JOIN is ``agree`` or ``mismatch``: the
state the composer declares for one join between the two, over the parts'
root records (draft-mih-zhang-agent-disclosure-bundle-01, "Joins"). The
verifier derives each join's state itself; the declaration is the
composer's claim.

No Evidence Request was made for these copies, so each member's
``request_digest`` is the digest of a stand-in request naming the deal and
the member. Writes the composed bundle to stdout.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import TypedDict

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from capsule_viewer.context import Json, JsonObject  # noqa: E402 -- the repo's own types, after the path
from capsule_viewer.digest import bundle_digest, jcs  # noqa: E402 -- the repo's own digest, after the path

KIND = "composed/v1"
OBSERVERS = [
    {"id": "obs-a", "role": "buyer", "custody_domain": "buyer.example"},
    {"id": "obs-b", "role": "seller", "custody_domain": "stickers.example"},
]
# One join per declared state, each on its own basis and pointer (a join is
# keyed by its members, basis and pointer, so two joins need two).
JOINS = {
    "agree": {
        "basis": "pre_agreed_identifier",
        "pointer": "/operator",
        "identifier_digest": hashlib.sha256(b"deal").hexdigest(),
        "compare": ["/developer", "/spec_version"],
    },
    "mismatch": {
        "basis": "shared_artifact_digest",
        "pointer": "/developer",
        "compare": ["/effect/type"],
    },
}


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Member(TypedDict):
    """One composed/v1 member carrying a party's copy."""

    id: str
    observer: str
    request_digest: str
    outcome: str
    digest: str
    bundle: JsonObject


class Block(TypedDict, total=False):
    """The composed/v1 block this writes."""

    members: list[Member]
    observers: list[dict[str, str]]
    joins: list[dict[str, Json]]
    composed_digest: str


def member(member_id: str, observer: str, part: JsonObject) -> Member:
    request = {"subject": {"correlation": "deal-receipt-fixture"}, "nonce": f"n-{member_id}"}
    return {
        "id": member_id,
        "observer": observer,
        "request_digest": sha256_hex(jcs(request)),
        "outcome": "artifact",
        "digest": bundle_digest(part),
        "bundle": part,
    }


def composed_digest(block: Block) -> str:
    """The digest over the block's declarations (draft "Composed Digest")."""
    preimage = {
        "kind": KIND,
        "members": sorted(({k: m[k] for k in ("id", "observer", "request_digest", "outcome", "digest")} for m in block["members"]), key=lambda m: m["id"]),
        "observers": sorted(block["observers"], key=lambda o: o["id"]),
        "joins": sorted(block["joins"], key=lambda j: (j["members"][0], j["members"][1], j["basis"], j.get("pointer", ""))),
        "not_requested": [],
    }
    return sha256_hex(jcs(preimage))


def main(argv: list[str]) -> int:
    if len(argv) < 4 or any(j not in JOINS for j in argv[3:]):
        print(__doc__, file=sys.stderr)
        return 2
    container, part_a, part_b = (json.loads(Path(p).read_text(encoding="utf-8")) for p in argv[:3])
    block: Block = {
        "members": [member("party-a", "obs-a", part_a), member("party-b", "obs-b", part_b)],
        "observers": OBSERVERS,
        "joins": [{"members": ["party-a", "party-b"], **JOINS[state], "state": state} for state in argv[3:]],
    }
    block["composed_digest"] = composed_digest(block)
    container["extensions"] = {**container.get("extensions", {}), KIND: block}
    json.dump(container, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
