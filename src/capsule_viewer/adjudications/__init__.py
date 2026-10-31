# SPDX-License-Identifier: Apache-2.0
"""The Adjudications page (``capsuleviewer.adjudications/v0``): the Adjudications
frame of the Terms Pack report pages canvas (Outcomes frame 4), drawn from the
``calibration-summary/v1``, ``human-rating/v1`` and ``evaluation-report/v1``
records of agent-action-capsule's ``schemas/judge/``.

The module is ``static/adjudications_card.js``: a self-contained module-slot
script that registers with the page's runtime. This package holds what the tests
and builders need beside it: the manifest (``manifest.json``, pinning the
script, its two stylesheets and its wording pack), the ``adjudications-en``
wording pack the script compiles in (``wording-en.json``) and the generator that
fills the script's generated lines (``module_slot``)."""
import json
from importlib import resources

ADJUDICATIONS_ID = "capsuleviewer.adjudications/v0"
EXTENSION = "x-adjudications/v0"


def adjudications_manifest() -> dict:
    """The module's manifest, as shipped."""
    return json.loads(resources.files(__package__).joinpath("manifest.json").read_text(encoding="utf-8"))


__all__ = ["ADJUDICATIONS_ID", "EXTENSION", "adjudications_manifest"]
