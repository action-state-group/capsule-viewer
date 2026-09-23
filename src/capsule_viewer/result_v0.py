# SPDX-License-Identifier: Apache-2.0
"""The ``result/v0`` entry builder -- wraps an Evidence Result v0 document
(``spec/evidence-result-v0.md`` / ``schemas/evidence-result-v0.json`` in
``agent-action-capsule``) as a fragment entry the base viewer can carry.

A Result v0 document is not a sealed AAC capsule: it has no ``capsule_id``
and no ``asg_payload.event`` kind field, so it cannot use ``build_entry``
(which assumes both) and its top-level entry cannot go through the base's
``capsule_id`` recompute -- there is nothing to recompute (see
``static/result_v0_card.js`` for what IS independently recomputed and
compared: the aggregate coverage/bucket counts against the claims that back
them, per spec section 1's traceability rule).

This module does not validate a Result against the JSON Schema -- that is
the schema's own validator's job
(``agent-action-capsule/schemas/check_evidence_result_examples.py``). It
only wraps a (possibly malformed or tampered) document for the viewer, which
is deliberately defensive at render time: a malformed claim renders a
visible refusal row rather than failing to load the page at all.
"""
from __future__ import annotations

from typing import Any

__all__ = ["build_result_entry"]


def build_result_entry(result: dict[str, Any]) -> dict[str, Any]:
    """One fragment entry carrying a Result v0 document.

    ``capsule_id`` is deliberately ``None`` -- a Result is not a capsule and
    the base viewer's chip renders "id not recomputable" for it, which is
    honest: the card's own recomputed-vs-stated aggregate check is the
    meaningful integrity signal for this kind, not a capsule digest.
    """
    return {
        "capsule_id": None,
        "record": result,
        "conversation": {"disclosed": False, "messages": []},
    }
