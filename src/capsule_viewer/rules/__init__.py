# SPDX-License-Identifier: Apache-2.0
"""The Rules presentation module (``capsuleviewer.rules/v0``) over a
rules-comparison record, its manifest, and an example English wording pack
(``wording-en.json``) with neutral example wording. The record kind and the
wording pack are supplied by whoever deploys the module, at render time."""
from importlib import resources

from .module import PLACEHOLDERS, RulesModel, RulesModule, rules_manifest
from .page import manifest_matches, rules_page


def example_wording_pack() -> bytes:
    """The exact bytes of the example English wording pack."""
    return resources.files(__package__).joinpath("wording-en.json").read_bytes()


__all__ = [
    "PLACEHOLDERS",
    "RulesModel",
    "RulesModule",
    "example_wording_pack",
    "manifest_matches",
    "rules_manifest",
    "rules_page",
]
