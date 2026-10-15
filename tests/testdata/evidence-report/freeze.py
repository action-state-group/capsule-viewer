# SPDX-License-Identifier: Apache-2.0
"""One-off: freeze capsule-emit's render_report_html output as capsule-viewer goldens.

Run with capsule-viewer's venv:
  .venv/bin/python freeze_report_goldens.py <emit-repo> <out-dir>
Each case is a directory holding bundle.json, check.json and page.html, where
page.html is capsule_emit.evidence_report.render_report_html (or, for a bundle
with no digest, the page `capsule-emit report` wrote) for that bundle and check.
"""
import base64
import dataclasses
import json
import shutil
import sys
import tempfile
from pathlib import Path

EMIT = Path(sys.argv[1])
OUT = Path(sys.argv[2])
sys.path[:0] = [str(EMIT / "python" / "tests"), str(Path.cwd() / "tests")]

from _stub_receipt import (  # noqa: E402
    TEST_TS_PUBLIC_KEY_PEM,
    build_stub_receipt_b64,
    checkpoint_dict_from_cose,
    checkpoint_entry_hash,
)
from capsule_emit import evidence_report as donated  # noqa: E402
from capsule_emit.evidence_file import Check, check_evidence_file  # noqa: E402
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, load_pem_public_key  # noqa: E402
from evidence_report_helpers import exported_bundle, whole_log_bundle  # noqa: E402

SOURCE = "f.json"
VECTOR = EMIT / "test-vectors" / "evidence-file" / "two-node-provider.json"
WITNESS = "https://witness.example"


def tamper(bundle):
    edited = json.loads(json.dumps(bundle))
    edited["records"][0]["timestamp"] = "1999-01-01T00:00:00Z"
    return edited


def directory():
    raw = load_pem_public_key(TEST_TS_PUBLIC_KEY_PEM).public_bytes(Encoding.Raw, PublicFormat.Raw).hex()
    return {"directory_version": "1",
            "witnesses": [{"name": "test witness", "endpoint": WITNESS, "since": "2026-01-01", "key_ids": [raw]}]}


def witnessed():
    bundle = json.loads(VECTOR.read_text())
    cose = bundle["checkpoint"]["cose"]
    signed = checkpoint_dict_from_cose(base64.urlsafe_b64decode(cose + "=" * (-len(cose) % 4)))
    entry_hash = checkpoint_entry_hash(signed)
    bundle["checkpoint"]["witnesses"] = [{"ts_url": WITNESS, "entry_hash": entry_hash,
                                          "receipt_b64": build_stub_receipt_b64(entry_hash),
                                          "leaf_index": "0", "tree_size": "1"}]
    return bundle


def write(name, bundle, check, extra=None):
    case = OUT / name
    case.mkdir(parents=True)
    (case / "bundle.json").write_text(json.dumps(bundle, indent=1, sort_keys=True) + "\n")
    # Frozen as read back, so the bundle the test loads is the one rendered.
    bundle = json.loads((case / "bundle.json").read_text())
    (case / "check.json").write_text(json.dumps(dataclasses.asdict(check), indent=1) + "\n")
    # emit's renderer draws any (bundle, check) pair; it has no binding step.
    page = donated.render_report_html(bundle, check, source=SOURCE)
    (case / "page.html").write_text(page, encoding="utf-8")
    for fname, value in (extra or {}).items():
        (case / fname).write_text(json.dumps(value, indent=1) + "\n")


if OUT.exists():
    shutil.rmtree(OUT)
tmp = Path(tempfile.mkdtemp())
(tmp / "e").mkdir()
_, exported = exported_bundle(tmp / "e")
(tmp / "w").mkdir()
whole = whole_log_bundle(tmp / "w")
(tmp / "u").mkdir()
unsigned = whole_log_bundle(tmp / "u", cose=False)

cases = {
    "exported": exported,
    "whole-log": whole,
    "tampered-record": tamper(exported),
    "unsigned-checkpoint": unsigned,
    "no-digest": {**json.loads(json.dumps(exported)), "extensions": {"x-example": 1.5}},
    "not-a-bundle": {"bundle_kind": "something-else"},
    "live-provider": json.loads(VECTOR.read_text()),
}
mismatch = json.loads(json.dumps(whole))
mismatch["checkpoint"]["log_id"] = "another-log"
cases["checkpoint-field-mismatch"] = mismatch
hostile = json.loads(json.dumps(whole))
hostile["records"][0]["operator"] = "<script>alert(1)</script>"
hostile["records"][1]["record_type"] = '<img src=x onerror="alert(1)">'
cases["hostile-record"] = hostile

for name, bundle in cases.items():
    # A float has no canonical form, so the round trip through bundle.json
    # is exact for every case; check the frozen bytes, not the object.
    write(name, bundle, check_evidence_file(json.loads(json.dumps(bundle))))

w = witnessed()
write("witnessed", w, check_evidence_file(w, witness_directory=directory()), {"witnesses.json": directory()})

receipts = dataclasses.replace(
    check_evidence_file(whole),
    witness=Check("witnesses", "fail"),
    witness_receipts=[{"ts_url": "https://w.example", "binding": "cll", "status": "fail", "reason": "r"}],
    countersignatures=2, extensions=("x-a",), missing=("ab" * 32,),
)
write("altered-result", whole, receipts)
print("froze", sorted(p.name for p in OUT.iterdir()))
