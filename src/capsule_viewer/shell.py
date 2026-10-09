# SPDX-License-Identifier: Apache-2.0
"""One offline page for one verified context: resolve a module through a
registry, render it, and wrap it in the kit's self-contained page.

The fixed sentences here are the page's own (the presentation contract's I1
refusal, its notices and the section 3.2 refusal lines), never a module's
wording. Order of decisions (contract sections 4.3 and 8):

1. not verified: the banner, the refusal and the verifier's checks; no module
   is resolved and none of its methods is called;
2. an ambiguous match: the banner, the statement that the presentation could
   not be resolved (naming the colliding modules) and the verifier's checks;
   no module content;
3. no module selected: the banner, the "no presentation" notice and the
   verifier's checks;
4. the selected module throws: everything it wrote is discarded and the page
   says the presentation failed, with the verifier's checks; never another
   module in its place.

Every refusal met while resolving (a module this runtime cannot honour) is
named on the page in section 3.2's words, whatever was selected.
"""
from __future__ import annotations

from collections.abc import Sequence

from .context import VerifiedBundleContext
from .kit.components import Markup, VerificationResult, page, verification_details
from .kit.contract import KIT
from .registry import RUNTIME_VERSION, AmbiguityError, Refusal, Registry

REFUSAL = (
    "This bundle did not verify. Its records, rows and payloads are not shown; "
    "the verification page below lists which checks failed."
)
NO_PRESENTATION = "No presentation is available for this bundle, audience and format."
AMBIGUOUS = "The presentation could not be resolved: more than one module matches ({ids}), so none is shown."
FAILED = "The presentation failed, so nothing it produced is shown; the verification checks are below."
PACK_REFUSED = "The wording pack was refused ({reason}), so labels are shown by their keys."
FALLBACK_TITLE = "Evidence bundle"


def refusal_line(r: Refusal) -> str:
    """Contract section 3.2, for a refused module that requires no extension."""
    if r.reason == "presentation_api_unsupported":
        return f"Presentation module {r.id} was not used: it needs presentation API {r.presentation_api}, which this viewer does not implement"
    return f"Presentation module {r.id} was not used: it needs runtime {r.runtime_min} or later; this viewer is {RUNTIME_VERSION}"


def notice(text: str, kind: str) -> Markup:
    return Markup(f'<p class="cv-notice" data-notice="{kind}">') + text + Markup("</p>")


def banner(result: VerificationResult) -> Markup:
    return verification_details(VerificationResult(result.verifier, result.outcome, ()))


def _refusals(refusals: Sequence[Refusal]) -> list[Markup]:
    return [
        Markup(f'<p class="cv-notice" data-presentation-refused="{r.id}" data-refusal="{r.reason}">') + refusal_line(r) + Markup("</p>")
        for r in refusals
    ]


def present(
    context: VerifiedBundleContext,
    registry: Registry,
    *,
    audience: str,
    fmt: str = "html",
    notices: Sequence[Markup] = (),
) -> str:
    """The page for *context*, with whichever module *registry* resolves. A
    module is an entry whose ``module`` has ``buildModel`` and ``render`` and
    a ``title`` for the page."""
    checks = verification_details(context.verification)
    if not context.verified:
        return str(page(FALLBACK_TITLE, notice(REFUSAL, "refusal"), checks))
    try:
        resolution = registry.resolve(context, audience, fmt)
    except AmbiguityError as exc:
        return str(page(FALLBACK_TITLE, banner(context.verification), notice(AMBIGUOUS.format(ids=", ".join(exc.ids)), "ambiguous"), checks))
    refused = _refusals(resolution.refusals)
    if resolution.entry is None:
        return str(page(FALLBACK_TITLE, banner(context.verification), notice(NO_PRESENTATION, "no-presentation"), *refused, checks))
    module = resolution.entry.module
    try:
        body = module.render(module.buildModel(context), KIT)
    except Exception:  # contract 4.3: a module failure collapses to the refusal, never a partial page
        return str(page(FALLBACK_TITLE, notice(FAILED, "failed"), *refused, checks))
    title = getattr(module, "title", FALLBACK_TITLE)
    return str(page(title, banner(context.verification), *notices, *refused, Markup(body)))
