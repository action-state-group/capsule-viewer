# SPDX-License-Identifier: Apache-2.0
"""A complete offline page for one bundle, with the Rules module selected by its
manifest. The fixed sentences here are the page's own (the presentation
contract's I1 refusal and its notices), never module wording. Besides them,
the kit's fixed vocabulary and raw identifiers are the only words on the page
that do not come from the wording pack.

Order of decisions, after the contract (sections 4.3 and 8):

1. not verified: the banner, the refusal and the verifier's checks; nothing else;
2. the manifest does not match the bundle, audience and format, or the module
   declines it: the "no presentation" notice;
3. the wording pack's bytes do not hash to the ``wording_sha256`` given, or the
   pack is malformed: it is refused, the page says so, and every label falls
   back to its key;
4. the module throws: everything it wrote is discarded and the page says the
   presentation failed.
"""
from __future__ import annotations

from html import escape

from ..context import VerifiedBundleContext
from ..kit.components import Markup, VerificationResult, page, verification_details
from ..kit.contract import KIT
from ..wording import EMPTY_PACK, WordingPack, WordingPackError, load_wording_pack
from .module import PLACEHOLDERS, RECORD_KIND_PATTERN, PresentationManifestJson, RulesModule

REFUSAL = (
    "This bundle did not verify. Its records, rows and payloads are not shown; "
    "the verification page below lists which checks failed."
)
NO_PRESENTATION = "No presentation is available for this bundle, audience and format."
FAILED = "The presentation failed, so nothing it produced is shown; the verification checks are below."
PACK_REFUSED = "The wording pack was refused ({reason}), so labels are shown by their keys."
FALLBACK_TITLE = "Evidence bundle"


def manifest_matches(manifest: PresentationManifestJson, context: VerifiedBundleContext, audience: str, fmt: str) -> bool:
    """Contract section 4.3, step 2, for one manifest, over profiles and bundle
    kind (this page reads no extensions)."""
    requires, forbids = manifest["requires"], manifest.get("forbids", {})
    profiles = context.profiles()
    audiences = manifest["audiences"]
    return (
        requires["bundle_kind"] == context.bundle_kind
        and set(requires.get("profiles", ())) <= profiles
        and not set(forbids.get("profiles", ())) & profiles
        and (audience in audiences or "*" in audiences)
        and fmt in manifest["formats"]
    )


def _banner(result: VerificationResult) -> Markup:
    return verification_details(VerificationResult(result.verifier, result.outcome, ()))


def _notice(text: str, kind: str) -> Markup:
    return Markup(f'<p class="cv-notice" data-notice="{kind}">') + text + Markup("</p>")


def _refused_page(context: VerifiedBundleContext, sentence: str, kind: str) -> str:
    return str(page(FALLBACK_TITLE, _notice(sentence, kind), verification_details(context.verification)))


def rules_page(
    context: VerifiedBundleContext,
    pack_bytes: bytes,
    wording_sha256: str,
    record_kind: str,
    *,
    depth: str = "L0",
    audience: str = "*",
    fmt: str = "html",
) -> str:
    """The page for *context*, worded by the pack in *pack_bytes*, which must
    hash to *wording_sha256*, for rules-comparison records of *record_kind* (the
    deployer's, like the pack). *depth* is the opening level (L0, L1 or L2)."""
    if not RECORD_KIND_PATTERN.match(record_kind):
        raise ValueError(f"record_kind {record_kind!r} is not a profile token value")
    if not context.verified:
        return _refused_page(context, REFUSAL, "refusal")
    pack: WordingPack = EMPTY_PACK
    pack_notice: list[Markup] = []
    try:
        pack = load_wording_pack(pack_bytes, wording_sha256, PLACEHOLDERS)
    except WordingPackError as exc:
        pack_notice.append(_notice(PACK_REFUSED.format(reason=str(exc)), "wording-refused"))
    module = RulesModule(pack, record_kind, depth)
    if not manifest_matches(module.manifest_json, context, audience, fmt) or not module.canRender(context):
        return str(page(FALLBACK_TITLE, _banner(context.verification), _notice(NO_PRESENTATION, "no-presentation"),
                        verification_details(context.verification)))
    try:
        body = module.render(module.buildModel(context), KIT)
    except Exception:  # contract 4.3: any module failure collapses to the refusal, never a partial page
        return _refused_page(context, FAILED, "failed")
    title = pack.get("page.title") or FALLBACK_TITLE
    html = str(page(title, _banner(context.verification), *pack_notice, Markup(body)))
    return _with_lang(html, pack.locale)


KIT_LANG = '<html lang="en">'


def _with_lang(html: str, locale: str) -> str:
    """The page with its document language set to the pack's locale. The kit's
    ``page()`` writes ``lang="en"``; this replaces that one attribute rather
    than change the shared kit."""
    if KIT_LANG not in html:
        raise ValueError("kit page() no longer writes " + KIT_LANG)
    return html.replace(KIT_LANG, f'<html lang="{escape(locale, quote=True)}">', 1)
