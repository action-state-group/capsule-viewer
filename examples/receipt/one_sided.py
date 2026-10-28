# SPDX-License-Identifier: Apache-2.0
"""Turn a two-copy composed/v1 bundle into a one-sided one, for the "your
receipt only" receipt fixture:

  one_sided.py COMPOSED [MEMBER]

COMPOSED is a bundle ``compose_bilateral.py`` wrote (``bilateral-keep``).
MEMBER (default ``party-b``) is replaced by an ``absence`` member: the
holder asked that party for its copy and nothing came back within the
window (draft-mih-zhang-agent-disclosure-bundle-01, "Members"; evidencebook
``Book.RecordAbsence``). The absence names the request it answers by digest,
and its member digest is the JCS digest of that body. The other member is
carried unchanged, and every join is declared ``one_sided``, which is what
the verifier derives for one artifact and one non-artifact. The container
and its checkpoint are unchanged: the block is an extension, which the
container's seal does not cover.

Writes the bundle to stdout.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from compose_bilateral import KIND, composed_digest  # noqa: E402 -- the sibling script, after the path

from capsule_viewer.digest import jcs  # noqa: E402 -- the repo's own digest, after the path

# The window the holder waited, and the route the ask went by: synthetic.
WINDOW = {"from": "2026-10-09T18:00:00Z", "to": "2026-10-12T18:00:00Z"}


def main(argv: list[str]) -> int:
    if len(argv) not in (1, 2):
        print(__doc__, file=sys.stderr)
        return 2
    bundle = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    target = argv[1] if len(argv) == 2 else "party-b"
    block = bundle["extensions"][KIND]
    members = []
    for m in block["members"]:
        if m["id"] != target:
            members.append(m)
            continue
        absence = {"request_digest": m["request_digest"], "window": WINDOW, "route": "a2a"}
        members.append(
            {
                "id": m["id"],
                "observer": m["observer"],
                "request_digest": m["request_digest"],
                "outcome": "absence",
                "digest": hashlib.sha256(jcs(absence)).hexdigest(),
                "absence": absence,
            }
        )
    if members == block["members"]:
        print(f"no member {target!r}", file=sys.stderr)
        return 1
    block["members"] = members
    block["joins"] = [{**j, "state": "one_sided"} for j in block["joins"]]
    block["composed_digest"] = composed_digest(block)
    json.dump(bundle, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
