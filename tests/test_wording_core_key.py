"""A wording pack that carries a ``core.`` key is refused at load, with the
right ``wording_sha256`` and whether or not the schema was run (presentation
contract section 7.4). The cases are the shared wording-pack-core-key-cases.json,
which the TypeScript and Go loaders run too."""
import hashlib
import json
from pathlib import Path

import pytest

from capsule_viewer.wording import WordingPackError, load_wording_pack

CASES = json.loads(
    (Path(__file__).resolve().parents[1] / "schemas" / "examples" / "presentation-manifest-v0"
     / "wording-pack-core-key-cases.json").read_text(encoding="utf-8")
)["packs"]


def _load(pack):
    data = json.dumps(pack).encode("utf-8")
    return load_wording_pack(data, hashlib.sha256(data).hexdigest(), {})


def test_cases_include_a_refused_pack():
    assert any(not c["schema_valid"] for c in CASES)


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_core_key_cases(case):
    if case["schema_valid"]:
        assert _load(case["pack"]).entries
    else:
        with pytest.raises(WordingPackError, match="reserved for the core"):
            _load(case["pack"])
