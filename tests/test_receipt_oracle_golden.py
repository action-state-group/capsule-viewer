# SPDX-License-Identifier: Apache-2.0
"""The frozen receipt golden is what the Python receipt modules make today.

``testdata/receipt/oracle-golden.json.gz`` is the output of
``tests/receipt_oracle.py`` (canRender, model and the page at L0, L1 and L2 for
every receipt fixture and audience). ``js-tests/receipt_parity.test.js`` holds
the module-slot scripts to it. While the Python modules exist, this test holds
the file to them; regenerate with
``python tests/receipt_oracle.py | gzip -n -9 > tests/testdata/receipt/oracle-golden.json.gz``.
"""
import gzip
import io
import json
from contextlib import redirect_stdout
from pathlib import Path

import receipt_oracle

GOLDEN = Path(__file__).parent / "testdata" / "receipt" / "oracle-golden.json.gz"


def test_golden_is_what_the_python_modules_make():
    out = io.StringIO()
    with redirect_stdout(out):
        assert receipt_oracle.main() == 0
    assert json.loads(gzip.decompress(GOLDEN.read_bytes())) == json.loads(out.getvalue())
