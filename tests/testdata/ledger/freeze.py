# SPDX-License-Identifier: Apache-2.0
"""Freeze the Ledger page goldens: ``.venv/bin/python tests/testdata/ledger/freeze.py``.

Each case directory holds a ledger's evidence file (``bundle.json``),
capsule-emit's ``check_evidence_file`` result for it (``check.json``) and the
page :func:`capsule_viewer.ledger.ledger_page` drew (``page.html``). Rerun it
only for an intended change to the page, and review the diff.
"""
import dataclasses
import json
import shutil
import sys
import tempfile
from pathlib import Path

from capsule_emit import LocalKeypairSigner, seal
from capsule_emit.evidence_file import check_evidence_file
from capsule_emit.ledger import read_ledger

from capsule_viewer.ledger import ledger_bundle, ledger_page

OUT = Path(__file__).parent
SOURCE = "ledger.jsonl"
HOSTILE = '<script>alert(1)</script><a href="javascript:alert(1)">x</a>'


def ledger(tmp: Path, hostile: bool = False) -> list[dict]:
    path = tmp / "ledger.jsonl"
    signer = LocalKeypairSigner(tmp / "k.pem")
    common = {"anchor": False, "witness": False, "signer": signer, "ledger": path}
    grant = seal({"step": 0}, action="grant", operator=HOSTILE if hostile else "acme-co",
                 effect={"type": "memory_write", "status": "dispatched"}, **common).capsule
    seal({"step": 1}, action="write_po", developer=HOSTILE if hostile else "po-agent@v1",
         effect={"type": "spend", "status": "dispatched"}, confirms=grant["capsule_id"],
         extra_compute={"gate_checks": [{"name": "AmountUnderCap", "passed": True, "reason": None}]}, **common)
    seal({"step": 2}, action="write_po", developer="po-agent@v1", verdict="blocked", decision="denied",
         effect={"type": "spend", "status": "planned"},
         extra_compute={"gate_checks": [{"name": "AmountUnderCap", "passed": False, "reason": HOSTILE if hostile else "over cap"}]},
         **common)
    return read_ledger(path)


def write(name: str, records: list[dict]) -> None:
    case = OUT / name
    shutil.rmtree(case, ignore_errors=True)
    case.mkdir()
    bundle = ledger_bundle(records)
    (case / "bundle.json").write_text(json.dumps(bundle, indent=1, sort_keys=True) + "\n")
    bundle = json.loads((case / "bundle.json").read_text())
    check = check_evidence_file(bundle)
    (case / "check.json").write_text(json.dumps(dataclasses.asdict(check), indent=1) + "\n")
    (case / "page.html").write_text(ledger_page(bundle, check, source=SOURCE), encoding="utf-8")


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for name in ("incomplete", "tampered", "hostile"):
            (root / name).mkdir()
        write("incomplete", ledger(root / "incomplete"))
        tampered = ledger(root / "tampered")
        tampered[1]["timestamp"] = "1999-01-01T00:00:00Z"
        write("tampered", tampered)
        write("hostile", ledger(root / "hostile", hostile=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
