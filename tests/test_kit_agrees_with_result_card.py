# SPDX-License-Identifier: Apache-2.0
"""The kit's VerdictPill and the result/v0 card read verdicts by the same rules:
the same three verdicts, the same retired spelling and what it reads as, and
the same refusal of ``not_applicable``. This test reads the card's own source,
so either side changing alone fails here."""
from __future__ import annotations

import re
from importlib import resources

from capsule_viewer.kit.components import RETIRED_VERDICT_SPELLINGS, VERDICTS, verdict_pill


def _static(name: str) -> str:
    return resources.files("capsule_viewer").joinpath("static", name).read_text(encoding="utf-8")


def test_same_three_verdicts_as_the_card():
    card_verdicts = re.search(r"var VALID_VERDICTS = \[([^\]]*)\]", _static("result_v0_card.js")).group(1)
    assert re.findall(r'"([a-z_]+)"', card_verdicts) == list(VERDICTS)


def test_same_retired_spelling_as_the_card():
    table = re.search(r"var RETIRED_VERDICT_SPELLINGS = \{([^}]*)\}", _static("result_v0_panels.js")).group(1)
    assert dict(re.findall(r'([a-z_]+):\s*"([a-z_]+)"', table)) == RETIRED_VERDICT_SPELLINGS


def test_not_applicable_refused_with_the_cards_reason():
    card = _static("result_v0_card.js")
    assert 'claim.verdict === "not_applicable"' in card
    reason = re.search(r'verdict "not_applicable" is (a population exclusion, not a verdict)', card).group(1)
    assert reason in verdict_pill("not_applicable")
