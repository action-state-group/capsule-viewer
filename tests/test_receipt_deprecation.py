# SPDX-License-Identifier: Apache-2.0
"""Importing the Python receipt package warns that it is deprecated (#71)."""
import subprocess
import sys


def test_receipt_import_warns_deprecated():
    code = (
        "import warnings\n"
        "warnings.simplefilter('error', DeprecationWarning)\n"
        "try:\n"
        "    import capsule_viewer.receipt\n"
        "except DeprecationWarning as w:\n"
        "    print(w)\n"
        "    raise SystemExit(0)\n"
        "raise SystemExit(1)\n"
    )
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert "capsule_viewer.receipt" in r.stdout and "deprecated" in r.stdout


def test_ledger_and_evidence_report_do_not_warn():
    code = (
        "import warnings\n"
        "warnings.simplefilter('error', DeprecationWarning)\n"
        "import capsule_viewer.ledger, capsule_viewer.evidence_report\n"
    )
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
