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

import re
from typing import Any

__all__ = ["DIGEST_HEX", "build_result_entry", "is_digest_ref", "malformed_digest_refs"]

# The digest format the vectors carry (schema ``$defs/HexDigest``): bare
# lowercase-hex SHA-256, exactly 64 characters -- what
# ``agent_action_capsule.canonical.json_digest`` produces and what the
# card's ``jsonDigest`` port recomputes. No ``sha256:`` prefix, no
# uppercase. A ref in any other form can never resolve against a record
# (2026-09-28, maintainer's second pass: "the digest check accepts any
# non-empty string ... so match the digest format").
DIGEST_HEX = re.compile(r"^[0-9a-f]{64}$")


def is_digest_ref(value: Any) -> bool:
    """True when ``value`` is a well-formed digest-ref: ``{"digest_alg":
    "SHA-256", "digest": <64 lowercase hex>}``."""
    return (
        isinstance(value, dict)
        and value.get("digest_alg") == "SHA-256"
        and isinstance(value.get("digest"), str)
        and DIGEST_HEX.match(value["digest"]) is not None
    )


def malformed_digest_refs(result: dict[str, Any]) -> list[str]:
    """Every digest-ref position in ``result["claims"]`` whose value is not
    a well-formed digest-ref, as ``claims[i].<path>`` strings. Walks the
    same positions the card checks: ``evidence[]``, ``proofs[]``,
    ``presentation.evidence[]`` (disclosure carrier), ``close.close_ref``
    and ``close.peer_close_ref``. A malformed document is reported, never
    repaired."""
    findings: list[str] = []
    claims = result.get("claims")
    if not isinstance(claims, list):
        return findings
    for index, claim in enumerate(claims):
        if not isinstance(claim, dict):
            continue
        prefix = f"claims[{index}]"
        for key in ("evidence", "proofs"):
            refs = claim.get(key)
            if isinstance(refs, list):
                for position, ref in enumerate(refs):
                    if not is_digest_ref(ref):
                        findings.append(f"{prefix}.{key}[{position}]")
        presentation = claim.get("presentation")
        if isinstance(presentation, dict) and isinstance(presentation.get("evidence"), list):
            for position, ref in enumerate(presentation["evidence"]):
                if not is_digest_ref(ref):
                    findings.append(f"{prefix}.presentation.evidence[{position}]")
        close = claim.get("close")
        if isinstance(close, dict):
            for key in ("close_ref", "peer_close_ref"):
                if key in close and not is_digest_ref(close[key]):
                    findings.append(f"{prefix}.close.{key}")
    return findings


def build_result_entry(
    result: dict[str, Any],
    *,
    records: list[dict[str, Any]] | None = None,
    contract: dict[str, Any] | None = None,
    register: dict[str, Any] | None = None,
    coverage: dict[str, Any] | None = None,
    strict: bool = False,
) -> dict[str, Any]:
    """One fragment entry carrying a Result v0 document.

    ``capsule_id`` is deliberately ``None`` -- a Result is not a capsule and
    the base viewer's chip renders "id not recomputable" for it, which is
    honest: the card's own recomputed-vs-stated aggregate check is the
    meaningful integrity signal for this kind, not a capsule digest.

    ``strict=True`` refuses (``ValueError``, naming every position) a
    document carrying a digest-ref that is not ``SHA-256`` + 64 lowercase
    hex -- the format the vectors use and the only one that can resolve
    against a record. The default stays lenient on purpose: the carrier
    never rewrites or drops a document, and the card refuses such a claim
    visibly at render time (a refusal row, never a resolved state).

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

    ``contract``, ``register`` and ``coverage`` (optional) are the inputs
    the card's coverage-and-gaps and obligation sections read
    (``static/result_v0_panels.js``): the Evidence Contract the claims were
    evaluated under, the obligation register (as JSON, ``{register_id,
    rows[]}``) its ``obligation_refs`` cite, and a per-requirement source
    coverage statement (``{coverage_version: "v0", contract_ref,
    requirements[]}``). A Result alone names requirements and a contract
    but not what sources a requirement needs or which clause it
    implements. Each travels byte-for-byte under the entry key of the same
    name; none is validated or repaired here, and each section says what it
    could not establish when its input is absent.
    """
    if strict:
        malformed = malformed_digest_refs(result)
        if malformed:
            raise ValueError(
                "malformed digest-ref (expected digest_alg SHA-256 and a 64-lowercase-hex digest) at: "
                + ", ".join(malformed)
            )
    entry: dict[str, Any] = {
        "capsule_id": None,
        "record": result,
        "conversation": {"disclosed": False, "messages": []},
    }
    if records is not None:
        entry["records"] = list(records)
    for key, value in (("contract", contract), ("register", register), ("coverage", coverage)):
        if value is not None:
            entry[key] = value
    return entry
