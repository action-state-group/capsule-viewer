# SPDX-License-Identifier: Apache-2.0
"""The design's recompute check now ships in the module
(``capsule_viewer.history.recompute``); this name is kept for the design tests."""
from capsule_viewer.history.recompute import (  # noqa: F401
    CAPSULE_ID_EXCLUDED,
    RECOMPUTED_KEYS,
    SELECTION_EXTENSION,
    _digest,
    bucket,
    check,
    derive,
    recompute_errors,
    selected_records,
    selection_block,
)
