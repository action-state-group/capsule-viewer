# SPDX-License-Identifier: Apache-2.0
"""The BASE fragment-carried capsule viewer + its domain-module plug-in seam.

This is the neutral base half of the words-first, offline, fragment-carried
viewer. It owns exactly what is the SAME for every capsule kind and delegates
the per-record *card body* to a domain module registered on the JS seam
(``CapsuleViewer.register(kind, renderCard)`` -- see
``static/capsule_viewer.js``). The split, deliberately:

* **The base owns** fragment carry (the payload lives ONLY in the URL fragment
  after ``#`` / the self-contained ``window.__CAPSULE_FRAGMENT_B64U__`` embed;
  a browser never sends the fragment over the wire), the in-browser
  ``capsule_id`` recompute (the SAME JCS hand-port
  ``capsule_engine/report/static/verify.js`` ships -- not re-forked), the page
  skeleton, and the ONE "show the security checks" toggle wrapper around each
  card. ``render_base_viewer_html`` inlines ``capsule_viewer.js`` and then the
  registered module scripts, with NO external ``<script src>`` -- the artifact
  opens and verifies offline on either end.

* **A domain module supplies ONLY a card renderer** for its capsule kind and
  registers it on the seam. ``conversation_exchange`` (the tau2 / mesh-inference
  exchange view) and ``result/v0`` (an Evidence Result document, see
  ``static/result_v0_card.js``) are two such modules. A module never
  re-implements canonicalization or fragment logic; if it needs a digest,
  that is the base's job and it reads ``entry.recompute`` (already computed)
  instead.

Moved out of ``capsule-engine`` (``capsule_engine/bundle_viewer/base_viewer.py``
@ ``2fbd23ce``) -- this package is now the sole home of the fragment-carried
viewer; capsule-engine keeps no copy. Fragment encoding is vendored in
``capsule_viewer.fragment`` (base64url
of compact JSON, no padding) so every fragment-carried surface in this
package shares one encoder and the JS decode below stays in step with it.
"""
from __future__ import annotations

import json
from importlib import resources
from typing import Any

from .fragment import encode_fragment

__all__ = [
    "MODULE_SCRIPTS",
    "render_base_viewer_html",
    "build_entry",
    "build_payload",
    "encode_fragment",
]

# The base script, then every registered domain-module script. A new module (the
# mesh role/question view, say) is added here and registers itself on load; the
# base needs no other change. Order matters only in that the base must inline
# first (the modules call ``window.CapsuleViewer.register`` on load).
_BASE_SCRIPT = "capsule_viewer.js"
MODULE_SCRIPTS: tuple[str, ...] = (
    "conversation_exchange_card.js",
    "result_v0_card.js",
)

_FRAGMENT_PLACEHOLDER = "@@FRAGMENT@@"


def _load_static(name: str) -> str:
    return (
        resources.files("capsule_viewer")
        .joinpath("static", name)
        .read_text(encoding="utf-8")
    )


def build_entry(
    capsule: dict[str, Any],
    *,
    conversation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """One fragment entry: the sealed ``capsule`` (travels byte-for-byte so the
    browser can recompute ``capsule_id``) plus an optional ``conversation``
    disclosure block for the domain card to render words-first.

    ``conversation`` is the operator's DELIBERATE disclosure of the readable
    transcript -- the sealed capsule itself holds only digests, so a readable
    card is a disclosure, never the capsule body. Shape:
    ``{"disclosed": True, "messages": [{"role", "content", "tool_call_names"}]}``.
    """
    return {
        "capsule_id": capsule.get("capsule_id"),
        "record": capsule,
        "conversation": conversation or {"disclosed": False, "messages": []},
    }


def build_payload(
    entries: list[dict[str, Any]],
    *,
    operator: str | None = None,
    source: str | None = None,
) -> dict[str, Any]:
    """The single JSON object that travels in the URL fragment."""
    return {
        "view_version": "capsule-base-1",
        "operator": operator,
        "source": source,
        "entries": entries,
    }


def render_base_viewer_html(fragment: str) -> str:
    """Return the self-contained base-viewer HTML for *fragment* (the base64url
    payload from ``encode_fragment``). Open it directly -- no server, no
    network. The base inlines ``capsule_viewer.js`` (fragment carry + recompute
    + the seam) and every registered module script, then embeds the fragment in
    the single ``window.__CAPSULE_FRAGMENT_B64U__`` slot.
    """
    scripts = "\n".join(
        f"<script>\n{_load_static(name)}\n</script>"
        # modules FIRST are wrong (they call register on the base); base first.
        for name in (_BASE_SCRIPT, *MODULE_SCRIPTS)
    )
    embed = json.dumps(fragment)  # a JSON string literal "<base64url>"
    shell = _SHELL.replace("@@SCRIPTS@@", scripts)
    if shell.count(_FRAGMENT_PLACEHOLDER) != 1:
        raise RuntimeError(
            "embed invariant broken: exactly one @@FRAGMENT@@ placeholder must "
            f"exist in the shell, found {shell.count(_FRAGMENT_PLACEHOLDER)}"
        )
    out = shell.replace(_FRAGMENT_PLACEHOLDER, embed)
    # Belt-and-suspenders: the fragment must land ONLY in the embed slot, never
    # in the boot guard (the guard tests against the assembled UNFILLED token).
    if fragment and (f'!== "{fragment}"' in out or f"!=='{fragment}'" in out):
        raise RuntimeError("embed invariant broken: fragment leaked into the boot guard")
    return out


# The shell is data-free chrome; the base + module scripts fill it from the
# fragment at load time, offline. `escape` guards the (static) title only.
_SHELL = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Capsule viewer</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background:#F4F4F0; color:#161B25; font-family:system-ui,-apple-system,sans-serif; -webkit-font-smoothing:antialiased; }
  .mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .wrap { max-width:900px; margin:0 auto; padding:40px 28px 90px; }
  .share { display:flex; justify-content:space-between; align-items:center; gap:12px; font-size:11px; color:#5C6573; margin-bottom:10px; flex-wrap:wrap; }
  .share button { font:inherit; font-size:11px; background:none; border:none; color:#3A5BD9; cursor:pointer; padding:0; font-family:ui-monospace,monospace; }
  .disclosure { font-size:12px; color:#5C6573; line-height:1.6; border-left:2px solid #3A5BD9; padding-left:12px; margin-bottom:22px; }
  h1 { font-size:28px; letter-spacing:-1px; color:#0B0E14; margin-bottom:6px; }
  h1 em { color:#3A5BD9; font-style:normal; }
  .sub { font-size:14px; color:#5C6573; margin-bottom:8px; }
  .meta { font-size:11px; color:#5C6573; margin-bottom:26px; }
  .empty { background:#FCFCFA; border:1px solid #E3E3DC; border-radius:16px; padding:60px 30px; text-align:center; color:#5C6573; }
  .entry { background:#FCFCFA; border:1px solid #E3E3DC; border-radius:16px; margin-bottom:24px; overflow:hidden; }
  .entry-head { padding:16px 22px; border-bottom:1px solid #E3E3DC; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
  .entry-kind { font-size:11px; text-transform:uppercase; letter-spacing:1.2px; color:#3A5BD9; font-weight:600; }
  .recompute-chip { display:inline-flex; align-items:center; font-size:11px; border:1px solid #E3E3DC; border-radius:100px; padding:3px 11px; color:#5C6573; }
  .recompute-chip.ok { color:#127A52; border-color:#B8DCC9; background:#E6F2EC; }
  .recompute-chip.fail { color:#B3261E; border-color:#F0C4C0; background:#FBEAE8; }
  /* conversation card (the tau2 / conversation_exchange domain module) */
  .conv-card { }
  .conv { padding:18px 22px 6px; }
  .conv-head { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#5C6573; font-weight:600; margin-bottom:12px; display:flex; align-items:center; gap:10px; }
  .conv-tag { font-size:9.5px; letter-spacing:0.6px; text-transform:uppercase; border-radius:100px; padding:2px 8px; font-weight:600; }
  .conv-tag.shown  { color:#127A52; background:#E6F2EC; border:1px solid #B8DCC9; }
  .conv-tag.sealed { color:#7A6355; background:#F1F1EC; border:1px solid #E3DDD4; }
  .turn { margin-bottom:12px; padding-left:12px; border-left:2px solid #ECECE6; }
  .turn.assistant { border-left-color:#B8C6E8; }
  .turn.user { border-left-color:#E8D6B8; }
  .turn-role { font-size:11px; font-weight:600; color:#3A5BD9; margin-bottom:3px; }
  .turn.user .turn-role { color:#9A6B12; }
  .turn-text { font-size:14px; line-height:1.55; color:#161B25; white-space:pre-wrap; }
  .turn-text.muted { color:#8A8A80; }
  .tool-trail { margin-top:6px; display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
  .tool-label { font-size:10.5px; color:#8A8A80; text-transform:uppercase; letter-spacing:0.6px; }
  .tool-chip { font-size:11px; font-family:ui-monospace,monospace; color:#9A6B12; background:#FBF3E2; border:1px solid #EFE2C4; border-radius:6px; padding:2px 8px; }
  .what-ran { padding:14px 22px 16px; border-top:1px solid #E3E3DC; margin-top:8px; background:#FBFBF9; }
  .what-ran-title { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#5C6573; font-weight:600; margin-bottom:8px; }
  .ran-model { display:flex; align-items:baseline; gap:10px; margin-bottom:6px; }
  .ran-model-name { font-size:16px; font-weight:600; color:#0B0E14; }
  .ran-provider { font-size:12px; color:#5C6573; }
  .ran-line { font-size:13px; color:#3A3F4B; line-height:1.55; }
  .ran-line.muted { color:#8A8A80; }
  .ran-line.api { color:#127A52; }
  .accountability { padding:12px 22px 16px; }
  .acct-ok { font-size:13.5px; color:#127A52; line-height:1.5; }
  .acct-fail { font-size:13.5px; color:#B3261E; line-height:1.5; }
  .acct-muted { font-size:13.5px; color:#8A8A80; line-height:1.5; }
  .no-renderer { padding:18px 22px; font-size:13px; color:#9A6B12; }
  /* result/v0 card (the Evidence Result document domain module) */
  .result-card { padding:18px 22px 6px; }
  .rv0-title { font-size:18px; margin-bottom:4px; }
  .rv0-producer { font-size:12px; color:#5C6573; margin-bottom:10px; }
  .rv0-section-title { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#5C6573; font-weight:600; margin:14px 0 8px; }
  .rv0-stat, .rv0-bucket { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:13px; color:#3A3F4B; padding:4px 0; }
  .rv0-bucket-key { font-weight:600; text-transform:capitalize; }
  .rv0-bucket-count { color:#5C6573; }
  .rv0-badge { font-size:10.5px; letter-spacing:0.4px; border-radius:100px; padding:2px 9px; font-weight:600; }
  .rv0-badge.ok { color:#127A52; background:#E6F2EC; border:1px solid #B8DCC9; }
  .rv0-badge.fail { color:#B3261E; background:#FBEAE8; border:1px solid #F0C4C0; }
  .rv0-badge.neutral { color:#7A6355; background:#F1F1EC; border:1px solid #E3DDD4; }
  .rv0-diagnostics { margin-top:6px; }
  .rv0-diagnostic { font-size:12.5px; color:#B3261E; line-height:1.6; }
  .rv0-claims { margin-top:6px; }
  .rv0-claim { border:1px solid #E3E3DC; border-radius:10px; padding:12px 14px; margin-bottom:10px; background:#FCFCFA; }
  .rv0-claim-head { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:6px; }
  .rv0-claim-id { font-weight:600; font-size:13px; color:#0B0E14; }
  .rv0-tier, .rv0-grade { font-size:11px; color:#3A5BD9; background:#EEF1FB; border-radius:100px; padding:2px 9px; }
  .rv0-contract, .rv0-requirement, .rv0-verdict-line { font-size:12.5px; color:#3A3F4B; line-height:1.6; }
  .rv0-presentation { margin-top:6px; }
  .rv0-presentation-kind { font-size:11.5px; color:#5C6573; text-transform:uppercase; letter-spacing:0.4px; }
  .rv0-narrative { font-size:13px; color:#161B25; line-height:1.55; margin-top:4px; white-space:pre-wrap; }
  .rv0-refs { margin-top:6px; }
  .rv0-refs-label { font-size:11px; color:#8A8A80; text-transform:uppercase; letter-spacing:0.4px; }
  .rv0-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11.5px; color:#5C6573; word-break:break-all; }
  .rv0-claim-refused { border-color:#F0C4C0; background:#FBEAE8; }
  .rv0-claim-refused-title { font-size:13px; font-weight:600; color:#B3261E; margin-bottom:6px; }
  .rv0-claim-refused-reason { font-size:12.5px; color:#B3261E; line-height:1.6; }
  details.checks { border-top:1px solid #E3E3DC; }
  details.checks > summary { cursor:pointer; list-style:none; padding:12px 22px; font-size:12.5px; color:#3A5BD9; font-weight:600; display:flex; align-items:center; gap:8px; user-select:none; }
  details.checks > summary::-webkit-details-marker { display:none; }
  details.checks > summary::before { content:"▸"; font-size:11px; }
  details.checks[open] > summary::before { content:"▾"; }
  details.checks > summary .hint { font-weight:400; color:#8A8A80; font-size:11px; }
  .checks-body { padding:4px 22px 18px; }
  .checks-body .id-line { font-size:11px; color:#5C6573; font-family:ui-monospace,monospace; word-break:break-all; white-space:pre-wrap; line-height:1.7; }
  [hidden] { display:none !important; }
</style>
</head>
<body>
<div class="wrap">
  <div class="share">
    <span class="mono" data-permalink>(open the full shared link to load capsules)</span>
    <span><button type="button" data-copy>copy permalink</button></span>
  </div>
  <div class="disclosure">
    This page reads its capsules from the link fragment (after <span class="mono">#</span>) — a browser
    never sends that part over the wire, so even a hosted copy of this page never receives your capsules.
    Every <span class="mono">capsule_id</span> is recomputed in your browser from the record; the crypto
    detail is hidden by default behind one toggle but stays checkable.
  </div>

  <h1>Capsule <em>viewer</em></h1>
  <p class="sub">The base owns the shell and the in-browser recompute; each capsule kind is rendered by a domain module registered on the seam.</p>
  <div class="meta mono" data-meta></div>

  <div class="empty" data-empty>
    No capsule data in this URL. Open the full shared link (the part after <span class="mono">#</span>) to
    load the view — this page never fetches from a server.
  </div>

  <div data-entries></div>
</div>

<script>window.__CAPSULE_FRAGMENT_B64U__=@@FRAGMENT@@;</script>
@@SCRIPTS@@
</body>
</html>
"""
