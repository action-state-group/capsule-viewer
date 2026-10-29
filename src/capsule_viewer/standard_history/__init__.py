# SPDX-License-Identifier: Apache-2.0
"""The History card (``capsuleviewer.standard-history/v0``): a
``standard_history/1`` card (agent-action-capsule's
``spec/standard-history-v0.md``) as the History card (9b) canvas draws it.

The module is ``static/standard_history_card.js``: a self-contained
module-slot script that registers with the page's runtime and carries the
card's check (the twin of AAC's reference ``check_card``) and the card. This
package holds what the tests and builders need beside it: the manifest
(``manifest.json``, pinning the script, its two stylesheets and its wording
pack), the ``consumer/en`` wording pack the script compiles in
(``wording-consumer-en.json``) and the generator that fills the script's
generated lines (``module_slot``)."""
import json
from importlib import resources

STANDARD_HISTORY_ID = "capsuleviewer.standard-history/v0"
EXTENSION = "x-standard-history/v0"


def standard_history_manifest() -> dict:
    """The module's manifest, as shipped."""
    return json.loads(resources.files(__package__).joinpath("manifest.json").read_text(encoding="utf-8"))


__all__ = ["EXTENSION", "STANDARD_HISTORY_ID", "standard_history_manifest"]
