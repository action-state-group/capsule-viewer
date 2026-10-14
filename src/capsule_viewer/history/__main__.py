# SPDX-License-Identifier: Apache-2.0
"""``python -m capsule_viewer.history check BUNDLE`` prints the Python check's
reading of a History (state, findings, property statuses, values) as JSON and
exits 1 unless the state is ``card``.
``python -m capsule_viewer.history pin`` fills the script's generated lines
(its wording pack's bytes, capsule-viewer's version) and rewrites
``manifest.json``'s ``executable.script_sha256`` to the script's digest;
``pin --check`` writes nothing and exits 1 when either file is not what
``pin`` would write."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from importlib import resources
from pathlib import Path

from . import SCRIPT, filled_script
from .recompute import check as check_history


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m capsule_viewer.history")
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("check", help="run the Python recompute check")
    check.add_argument("bundle")
    pin = sub.add_parser("pin", help="fill the script's pack and pin its digest in manifest.json")
    pin.add_argument("--check", action="store_true", help="write nothing; exit 1 when a file is stale")
    args = parser.parse_args(argv)
    if args.command == "pin":
        script = Path(str(resources.files("capsule_viewer").joinpath("static", SCRIPT)))
        path = Path(str(resources.files(__package__).joinpath("manifest.json")))
        text = filled_script(script.read_text(encoding="utf-8"))
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["executable"]["script_sha256"] = hashlib.sha256(text.encode("utf-8")).hexdigest()
        pinned = json.dumps(manifest, indent=2) + "\n"
        outputs = {script: text, path: pinned}
        stale = [p for p, data in outputs.items() if p.read_text(encoding="utf-8") != data]
        if args.check:
            for p in stale:
                print(f"stale: {p}", file=sys.stderr)
            return 1 if stale else 0
        for p in stale:
            p.write_bytes(outputs[p].encode("utf-8"))
        return 0
    result = check_history(json.loads(Path(args.bundle).read_text(encoding="utf-8")))
    sys.stdout.write(json.dumps(result, indent=1, sort_keys=True) + "\n")
    return 0 if result["state"] == "card" else 1


if __name__ == "__main__":
    raise SystemExit(main())
