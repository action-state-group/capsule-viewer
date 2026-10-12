# SPDX-License-Identifier: Apache-2.0
"""Fixture helpers: a context for the registry tests, and the
one-flipped-outcome mutant.

The nested stand-in fixture (``tests/testdata/history/nested-selection.bundle.json``)
carries no signatures, checkpoints or certificates, so no verifier report
exists for it and none is claimed. ``example_context`` hands it to the
registry under an example verifier's result, only so resolution (which reads a
verified context's descriptor) can be tested; it says nothing about the
bundle verifying.
"""
from __future__ import annotations

import copy
from collections.abc import Mapping

from ..context import VerifiedBundleContext, build_context
from ..kit.components import Check, VerificationResult
from .recompute import SELECTION_EXTENSION

EXAMPLE_VERIFIER = "an example verifier (resolution tests only)"
VERIFIED = VerificationResult(EXAMPLE_VERIFIER, "verified", (Check("graph closure", "verified"), Check("record disclosures", "verified")))


def example_context(bundle: Mapping) -> VerifiedBundleContext:
    """*bundle* under the example verifier's result, every supplied
    top-level ``agent_input`` resolved as matching (a container carries none)."""
    disclosures = bundle.get("disclosures") or {}
    status = {cid: {"agent_input": "disclosure_match"} for cid, d in disclosures.items() if isinstance(d, Mapping) and "agent_input" in d}
    return build_context(bundle, VERIFIED, status)


def flip_one_outcome(bundle: Mapping) -> dict:
    """The mutant: the card states the one outcome record's outcome flipped
    (``outcome:mismatch`` becomes ``outcome:match``) while the record itself is
    unchanged. Every record and disclosure still binds; only the recompute
    can tell."""
    out = copy.deepcopy(dict(bundle))
    evidence = out["extensions"][SELECTION_EXTENSION]["account"]["asserted_result"]["outcome_evidence"]
    flipped = {("outcome:match" if k == "outcome:mismatch" else k): v for k, v in evidence.items()}
    if flipped == evidence:
        raise ValueError("the bundle has no outcome:mismatch bucket to flip")
    out["extensions"][SELECTION_EXTENSION]["account"]["asserted_result"]["outcome_evidence"] = dict(sorted(flipped.items()))
    return out
