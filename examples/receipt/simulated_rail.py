# SPDX-License-Identifier: Apache-2.0
"""Make the "simulated rail" receipt fixture from a copy that paid by card:

  simulated_rail.py BUNDLE VERIFY OUT_BUNDLE OUT_VERIFY

Every disclosed action record's ``rail`` is set to ``simulated``, the rail a demo
names when no money moved, and the verifier's report is rebound to the edited
bytes (its ``bundle_digest``). The disclosures are not sealed into the log, so
every record still verifies. Synthetic: nothing here was cut by capsulectl.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from capsule_viewer.digest import bundle_digest  # noqa: E402 -- the repo's own digest, after the path


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print(__doc__, file=sys.stderr)
        return 2
    bundle = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    output = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    changed = 0
    for members in bundle["disclosures"].values():
        body = members.get("agent_input", {}).get("body", {})
        if body.get("action") == "pay" and "rail" in body:
            body["rail"] = "simulated"
            changed += 1
    if not changed:
        print("no pay record names a rail", file=sys.stderr)
        return 1
    output["bundle_digest"] = bundle_digest(bundle)
    Path(argv[2]).write_text(json.dumps(bundle, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    Path(argv[3]).write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
