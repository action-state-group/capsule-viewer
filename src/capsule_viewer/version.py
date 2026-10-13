# SPDX-License-Identifier: Apache-2.0
"""capsule-viewer's version (``pyproject.toml``'s ``project.version``; a test
holds the two equal) and the ``renderer_version`` a page records beside its
``wording_sha256``: which module, of which capsule-viewer, drew it.

Both are presentation provenance (agent-action-capsule's presentation
contract, section 7.3): carried in a page's view-model, never sealed, never
part of a digest of the evidence. A new wording pack or a new renderer never
changes an evidence identifier."""
from __future__ import annotations

VERSION = "0.0.1"


def renderer_version(module_id: str) -> str:
    """``<module id>@<capsule-viewer version>``, as the module-slot scripts write it."""
    return f"{module_id}@{VERSION}"
