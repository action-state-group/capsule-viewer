#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause
"""
check_contract_report_examples.py

The pack half of agent-action-capsule's schemas/check_contract_report_examples.py
(at 60a5b119a1a979b1970d22caec8577eac0bb59e8, AAC#379): checks the example
contract-report wording pack against the presentation manifest schema's
$defs/WordingPack and the keys spec/contract-report-module-v1.md section 3
defines. The block half (the contract-report/v1 block fixtures and
schemas/contract-report-v1.json) stays in agent-action-capsule.

What this enforces (spec/contract-report-module-v1.md is normative; this is the
mechanical half):

  1. VENDORED FILES: every file under schemas/vendor/agent-action-capsule/
     is listed in schemas/README.md with its SHA-256, and its bytes hash to
     it. A file re-vendored without updating the table, or edited here,
     fails.
  2. WORDING KEYS (spec section 3): every key the kind defines for a Result
     v0 enum value, assembled from the lowercased value, is a valid
     WordingKey, and the same key built from an uppercase value is not (so
     the lowercasing rule is load-bearing). The example wording pack
     validates as a WordingPack, names the page and the module separately
     (presentation contract section 7.4), and every one of its entries is a
     key the kind defines or a reserved key.
  3. RENDERING CASES: every Result the vendored rendering cases name exists,
     and every malformed as-of override really is malformed.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

SCHEMAS_DIR = Path(__file__).parent
MANIFEST_SCHEMA_PATH = SCHEMAS_DIR / "presentation-manifest-v0.json"
PACK_PATH = SCHEMAS_DIR / "examples" / "presentation-manifest-v0" / "example-wording-pack-contract-report.json"
# Byte copies of agent-action-capsule files, at their AAC paths below this root.
VENDOR_DIR = SCHEMAS_DIR / "vendor" / "agent-action-capsule"
VENDOR_TABLE = SCHEMAS_DIR / "README.md"
RESULT_SCHEMA_PATH = VENDOR_DIR / "schemas" / "evidence-result-v0.json"
RENDERING_CASES_PATH = VENDOR_DIR / "schemas" / "examples" / "contract-report-v1" / "rendering-cases.json"

# spec/contract-report-module-v1.md section 3: key prefix -> Result v0 enum ($defs).
ENUM_KEYS = {
    "verdict": "Verdict",
    "sufficiency": "Sufficiency",
    "tier": "Tier",
    "grade": "Grade",
    "status": "EvidenceStatus",
}
RESERVED = ("page.title", "module.title")
FIXED_KEYS = (
    "report.title",
    "report.summary",
    # Result v0 sections 4.2 and 4.3 (spec section 2's applicability rules).
    "applicability.not_yet_in_force.title",
    "applicability.not_yet_in_force.note",
    "applicability.as_of",
    "contract_fact.note",
)
# The one slot applicability.as_of carries: exactly one, or the word is missing.
AS_OF_SLOT = "{date}"
ROW_SUFFIXES = ("label", "detail", "not_evaluable")
# One row of the vendored-files table in schemas/README.md: | `path` | ... | `sha256` |
VENDOR_ROW = re.compile(r"^\| `([^`]+)` \|.*\| `([0-9a-f]{64})` \|$")


def _validator(schema: dict, defn: str | None = None):
    try:
        import jsonschema
    except ImportError as exc:  # pragma: no cover - environment problem, not a finding
        print(f"ERROR: the 'jsonschema' package is required to run this check: {exc}")
        sys.exit(2)
    if defn is not None:
        schema = dict(schema)
        schema["$ref"] = f"#/$defs/{defn}"
    return jsonschema.Draft202012Validator(schema)


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


RESULT_DEFS = _load(RESULT_SCHEMA_PATH)["$defs"]
# Each enum key prefix and its lowercased Result v0 values.
ENUM_VALUES = {
    prefix: {v.lower() for v in RESULT_DEFS[defn]["enum"]} for prefix, defn in ENUM_KEYS.items()
}


def defined_key(key: str) -> bool:
    """A key spec/contract-report-module-v1.md section 3 defines, or a reserved key."""
    if key in RESERVED or key in FIXED_KEYS:
        return True
    head, _, rest = key.partition(".")
    if head in ENUM_VALUES:
        return rest in ENUM_VALUES[head]
    if head == "group":
        return rest.endswith(".title") and "." not in rest[: -len(".title")]
    if head == "row":
        return any(rest.endswith(f".{suffix}") for suffix in ROW_SUFFIXES)
    return False


def check_vendored(findings: list[str]) -> None:
    listed = {}
    for line in VENDOR_TABLE.read_text(encoding="utf-8").splitlines():
        match = VENDOR_ROW.match(line)
        if match:
            listed[match.group(1)] = match.group(2)
    on_disk = {p.relative_to(VENDOR_DIR).as_posix() for p in VENDOR_DIR.rglob("*") if p.is_file()}
    if set(listed) != on_disk:
        findings.append(f"VENDOR: files on disk {sorted(on_disk)} != listed {sorted(listed)}")
    for path, digest in sorted(listed.items()):
        target = VENDOR_DIR / path
        if not target.is_file():
            continue
        actual = hashlib.sha256(target.read_bytes()).hexdigest()
        if actual != digest:
            findings.append(f"VENDOR {path}: SHA-256 {actual}, the table says {digest}")
        else:
            print(f"OK  vendored {path}")


def main() -> int:
    findings: list[str] = []

    # --- 1. VENDORED FILES ---
    check_vendored(findings)

    # --- 2. WORDING KEYS ---
    manifest_schema = _load(MANIFEST_SCHEMA_PATH)
    key_pattern = re.compile(manifest_schema["$defs"]["WordingKey"]["pattern"])
    for prefix, defn in ENUM_KEYS.items():
        for value in RESULT_DEFS[defn]["enum"]:
            key = f"{prefix}.{value.lower()}"
            if not key_pattern.match(key) or not defined_key(key):
                findings.append(f"ENUM-KEY {key}: not a valid, defined WordingKey")
            if value != value.lower() and key_pattern.match(f"{prefix}.{value}"):
                findings.append(f"ENUM-KEY-CASE {prefix}.{value}: the uppercase form must be invalid")
    print("OK  every Result v0 enum value maps to a valid key once lowercased")

    pack = _load(PACK_PATH)
    errors = list(_validator(manifest_schema, "WordingPack").iter_errors(pack))
    if errors:
        findings.append(f"PACK-REJECTED {PACK_PATH.name}: {errors[0].message}")
    else:
        print(f"OK  WordingPack {PACK_PATH.name}")
    entries = pack["entries"]
    reserved = [entries.get(k) for k in RESERVED]
    if None in reserved or reserved[0] == reserved[1]:
        findings.append(f"PACK-RESERVED: page.title and module.title must both be present and differ, got {reserved}")
    for key in entries:
        if not defined_key(key):
            findings.append(f"PACK-KEY {key}: not a key spec/contract-report-module-v1.md defines")
    if not defined_key("row.intake.confirmed.label") or defined_key("row.intake.confirmed"):
        findings.append("HARNESS: defined_key misreads row keys")
    for undefined in ("verdict.mte", "tier.unknown", "status.gap", "grade.self_attested"):
        if defined_key(undefined):
            findings.append(f"HARNESS: defined_key accepts {undefined}, which no Result v0 enum defines")

    # --- 3. RENDERING CASES ---
    # The rendering cases a contract-report module runs: every Result exists,
    # and every malformed as-of override really is malformed. The cases name
    # AAC paths, which the vendored copies keep below VENDOR_DIR.
    cases = _load(RENDERING_CASES_PATH)["cases"]
    for case in cases:
        if not (VENDOR_DIR / case["result"]).is_file():
            findings.append(f"RENDER-CASE {case['name']}: {case['result']} does not exist")
        override = case.get("pack_entries", {}).get("applicability.as_of")
        if override is not None and override.count(AS_OF_SLOT) == 1:
            findings.append(f"RENDER-CASE {case['name']}: its as-of override is well formed")
    print(f"OK  {len(cases)} rendering case(s) name existing Results")
    as_of = entries.get("applicability.as_of")
    if as_of is not None and as_of.count(AS_OF_SLOT) != 1:
        findings.append(f"PACK-AS-OF: applicability.as_of must carry exactly one {AS_OF_SLOT}, got {as_of!r}")
    for malformed in ("In force as of", "In force as of {date} ({date})"):
        if malformed.count(AS_OF_SLOT) == 1:
            findings.append(f"HARNESS: the slot check accepts {malformed!r}")
    if not findings:
        print(f"OK  every entry of {PACK_PATH.name} is a key the kind defines or a reserved key, "
              f"and applicability.as_of carries one {AS_OF_SLOT}")

    if findings:
        print("\nFAILED:")
        for finding in findings:
            print(f"  {finding}")
        return 1
    print("\nOK: the vendored files, the contract-report wording keys, the example pack and the rendering cases all passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
