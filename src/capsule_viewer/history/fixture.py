# SPDX-License-Identifier: Apache-2.0
"""Fixture helpers for the History Card tests.

The fixtures under ``tests/testdata/history/`` are real: capsulectl ``deal
history`` wrote them (``examples/history/cut_fixtures.sh``), and
``verify/<name>.json`` is what ``capsulectl verify --bundle`` printed for
each. ``example_context`` hands a bundle to the registry under an example
verifier's result, only so resolution (which reads a verified context's
descriptor) can be tested without a binary; it says nothing about the bundle
verifying. ``capsulectl verify`` is the verifier.
"""
from __future__ import annotations

import copy
from collections.abc import Mapping

from ..context import VerifiedBundleContext, build_context
from ..kit.components import Check, VerificationResult
from .recompute import SELECTION_EXTENSION, check

EXAMPLE_VERIFIER = "an example verifier (resolution tests only)"
VERIFIED = VerificationResult(EXAMPLE_VERIFIER, "verified", (Check("graph closure", "verified"), Check("record disclosures", "verified")))


def example_context(bundle: Mapping) -> VerifiedBundleContext:
    """*bundle* under the example verifier's result, every supplied
    top-level ``agent_input`` resolved as matching."""
    disclosures = bundle.get("disclosures") or {}
    status = {cid: {"agent_input": "disclosure_match"} for cid, d in disclosures.items() if isinstance(d, Mapping) and "agent_input" in d}
    return build_context(bundle, VERIFIED, status)


def with_asserted_result(bundle: Mapping, *, flip_bucket: tuple[str, str] | None = None) -> dict:
    """*bundle* with an ``asserted_result`` beside the selection: the values
    this page computes, or those values with one outcome-evidence bucket
    renamed (``flip_bucket=(from, to)``). The selection record seals no
    values, so an asserted_result is the file's statement only; the page
    recomputes it."""
    out = copy.deepcopy(dict(bundle))
    reading = check(out)
    if reading["values"] is None:
        raise ValueError(f"the bundle renders no card: {reading['findings']}")
    values = copy.deepcopy(reading["values"])
    if flip_bucket is not None:
        old, new = flip_bucket
        evidence = values["outcome_evidence"]
        if old not in evidence:
            raise ValueError(f"no {old} bucket to flip")
        evidence[new] = evidence.pop(old) + evidence.get(new, 0)
        values["outcome_evidence"] = dict(sorted(evidence.items()))
    out["extensions"][SELECTION_EXTENSION]["asserted_result"] = values
    return out
