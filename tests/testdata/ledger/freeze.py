# SPDX-License-Identifier: Apache-2.0
"""Freeze the Ledger page goldens: ``.venv/bin/python tests/testdata/ledger/freeze.py``.

Each case directory holds an evidence file (``bundle.json``, the unproven
bundle agent-action-capsule's producer makes of records with no checkpoint,
built and signed in memory by ``capsule_emit.produce``),
capsule-emit's ``check_evidence_file`` result for it (``check.json``) and the
page :func:`capsule_viewer.ledger.ledger_page` drew (``page.html``). Rerun it
only for an intended change to the page, and review the diff. Each run makes
a new key, so every record's id and signature differ from the last run's.

The committed cases were frozen when the records were sealed into a flat
ledger (``seal(ledger=...)``) and read back; they are kept as they were.
"""
import dataclasses
import json
import shutil
import sys
import tempfile
from pathlib import Path

from agent_action_capsule.bundle import build_unproven_bundle
from capsule_emit.evidence_file import check_evidence_file

from capsule_viewer.ledger import ledger_page

OUT = Path(__file__).parent
sys.path.insert(0, str(OUT.parent.parent))

from evidence_report_helpers import ledger_records, node_key  # noqa: E402

SOURCE = "ledger.jsonl"
HOSTILE = '<script>alert(1)</script><a href="javascript:alert(1)">x</a>'


def ledger(tmp: Path, hostile: bool = False) -> list[dict]:
    _, identity = node_key(tmp / "k.pem")
    if hostile:
        return ledger_records(identity, operator=HOSTILE, developer=HOSTILE, reason=HOSTILE)
    return ledger_records(identity)


def unproven(records: list[dict]) -> dict:
    return build_unproven_bundle(records, root=records[-1]["capsule_id"])


def write(name: str, bundle: dict) -> None:
    case = OUT / name
    shutil.rmtree(case, ignore_errors=True)
    case.mkdir()
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
        write("incomplete", unproven(ledger(root / "incomplete")))
        # Edited after the producer made the file: it refuses to make one
        # that does not verify.
        tampered = unproven(ledger(root / "tampered"))
        tampered["records"][1]["timestamp"] = "1999-01-01T00:00:00Z"
        write("tampered", tampered)
        write("hostile", unproven(ledger(root / "hostile", hostile=True)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
