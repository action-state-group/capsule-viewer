# SPDX-License-Identifier: Apache-2.0
"""Turn a two-copy composed/v1 bundle into a one-sided one, for the "your
receipt only" receipt fixtures:

  one_sided.py COMPOSED absence|refusal [MEMBER]

COMPOSED is a bundle ``compose_bilateral.py`` wrote (``bilateral-keep``,
``bilateral-counterparty``). MEMBER (default ``party-b``) is replaced by:

* ``absence``: the holder asked that party for its copy and nothing came
  back within the window (draft-mih-zhang-agent-disclosure-bundle-01,
  "Members"; evidencebook ``Book.RecordAbsence``);
* ``refusal``: that party answered with a signed no, in capsulectl's
  ``ed25519-jcs`` refusal form (capsule-cli ``cli/composed.go``), signed with
  a fixed synthetic key so a rebuild writes the same bytes. capsulectl
  verifies the signature and still reads the member as INCOMPLETE: a no is
  no copy.

The member names the request it answers by digest, and its member digest is
the JCS digest of its body. The other member is carried unchanged, and every
join is declared ``one_sided``, which is what the verifier derives for one
artifact and one non-artifact. The container and its checkpoint are
unchanged: the block is an extension, which the container's seal does not
cover.

Writes the bundle to stdout. Needs ``cryptography`` for the refusals.
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

KINDS = ("absence", "refusal")
# The window the holder waited, and the route the ask went by: synthetic.
WINDOW = {"from": "2026-10-09T18:00:00Z", "to": "2026-10-12T18:00:00Z"}
# The refusing party's synthetic Ed25519 seed: fixture bytes, never a real key.
REFUSAL_SEED = bytes(range(32))


def refusal(request_digest: str) -> dict[str, str]:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

    key = Ed25519PrivateKey.from_private_bytes(REFUSAL_SEED)
    body = {
        "request_digest": request_digest,
        "reason": "policy_declined",
        "issued_at": "2026-10-10T09:00:00Z",
        "key_id": key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex(),
    }
    body["signature"] = key.sign(jcs(body)).hex()
    return body


def main(argv: list[str]) -> int:
    if len(argv) not in (2, 3) or argv[1] not in KINDS:
        print(__doc__, file=sys.stderr)
        return 2
    bundle = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    kind = argv[1]
    target = argv[2] if len(argv) == 3 else "party-b"
    block = bundle["extensions"][KIND]
    members = []
    for m in block["members"]:
        if m["id"] != target:
            members.append(m)
            continue
        if kind == "absence":
            outcome, body = "absence", {"request_digest": m["request_digest"], "window": WINDOW, "route": "a2a"}
        else:
            outcome, body = "refusal", refusal(m["request_digest"])
        members.append(
            {
                "id": m["id"],
                "observer": m["observer"],
                "request_digest": m["request_digest"],
                "outcome": outcome,
                "digest": hashlib.sha256(jcs(body)).hexdigest(),
                outcome: body,
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
