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


def build_result_entry(
    result: dict[str, Any],
    *,
    records: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """One fragment entry carrying a Result v0 document.

    ``capsule_id`` is deliberately ``None`` -- a Result is not a capsule and
    the base viewer's chip renders "id not recomputable" for it, which is
    honest: the card's own recomputed-vs-stated aggregate check is the
    meaningful integrity signal for this kind, not a capsule digest.

    ``records`` (optional) are the record headers the Result's ``close``
    claims cite -- each Close by ``close_ref`` and the peer records that
    ``acknowledges`` / ``rebuts`` it (the evidence-book header shape:
    ``links[{type, target}]``; the same objects ``agent-action-capsule``
    ships beside each close fixture as ``<name>.records.json``). They
    travel byte-for-byte under ``entry.records`` so the card can recompute
    every close claim's ``close_state`` from the links those records make
    to the cited Close (spec section 4.1: the state is derivable, never
    asserted). Without them the card shows the asserted state under a
    ``producer-asserted`` chip -- it has nothing to check it against, and
    says so rather than showing the state bare.
    """
    entry: dict[str, Any] = {
        "capsule_id": None,
        "record": result,
        "conversation": {"disclosed": False, "messages": []},
    }
    if records is not None:
        entry["records"] = list(records)
    return entry
