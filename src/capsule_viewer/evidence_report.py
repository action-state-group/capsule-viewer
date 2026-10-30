# SPDX-License-Identifier: Apache-2.0
"""One readable page from an evidence file (``evidence-bundle/v2``).

The page half of capsule-emit's ``evidence_report``, moved here; the checking
stays in capsule-emit. The page is rendered from the file and from the result
of capsule-emit's own verifier,
:func:`capsule_emit.evidence_file.check_evidence_file`. Nothing here checks a
record, a signature, a checkpoint, a proof or a witness receipt: every status
on the page is one the verifier reported, read unchanged.

One reading is the page's own: a file whose every check passes is shown as
checking in full only when the verifier also checked a witness receipt for its
checkpoint (its ``witnesses`` result is ``pass``). Without one the chain checks
only against its holder's own signatures, and the page says no witness has
vouched for it (evidencebook#209). The verdict and the exit code stay the
verifier's.

The one thing this module computes is the pairing of a result handed in from
outside with the bundle it is drawn over. :func:`render_report_html` refuses
(:class:`BundleMismatch`) when the result's ``bundle_digest`` is not the
digest of the bundle supplied, so a verdict for one file is not drawn over
another file's records. The digest is agent-action-capsule's own
``bundle_digest``, the one the verifier reports; it is not reimplemented.
:func:`check_and_render` runs the verifier on the very object it renders, so
it needs no such pairing.

Offline and self-contained: no script, no font or stylesheet fetch, no
network call.

Public API
----------
render_report_html(bundle, check, *, source="") -> str
check_and_render(bundle, *, require_signature=False, witness_directory=None, source="")
    -> tuple[EvidenceFileCheck, str]
main(argv=None) -> int   (``python -m capsule_viewer.evidence_report``)
"""
from __future__ import annotations

import argparse
import html as _html
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .shell import NOT_WITNESSED, WITNESS_UNREPORTED

if TYPE_CHECKING:
    from capsule_emit.evidence_file import EvidenceFileCheck

__all__ = ["BundleMismatch", "bind_result", "check_and_render", "main", "render_report_html"]

#: Where a reader re-runs the check without this package: the donated verifier.
RERUN_COMMAND = "capsule-emit verify --bundle"

_MARK = {"pass": "✓", "withheld": "–", "fail": "✗"}
_WORD = {"pass": "Checks", "withheld": "Not shown", "fail": "Fails"}

_CSS = """
:root{color-scheme:light dark;--bg:#fff;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;
--pass:#1a7f37;--withheld:#9a6700;--fail:#cf222e;--card:#f6f8fa}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;
--line:#3d444d;--pass:#3fb950;--withheld:#d29922;--fail:#f85149;--card:#151b23}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);
font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}
.muted{color:var(--muted)}.verdict{border:1px solid var(--line);border-left-width:6px;
border-radius:6px;padding:12px 16px;margin:16px 0;background:var(--card)}
.verdict.pass{border-left-color:var(--pass)}.verdict.withheld{border-left-color:var(--withheld)}
.verdict.fail{border-left-color:var(--fail)}
ul.checks{list-style:none;padding:0;margin:0}ul.checks li{display:flex;gap:10px;padding:6px 0;
border-bottom:1px solid var(--line)}.mark{width:1.2em;font-weight:700;flex:none}
.pass .mark,.mark.pass{color:var(--pass)}.withheld .mark,.mark.withheld{color:var(--withheld)}
.fail .mark,.mark.fail{color:var(--fail)}
.find{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);word-break:break-all}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0}dt{color:var(--muted)}
dd{margin:0;word-break:break-all}code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600}
"""

# The verifier's verdicts and this CLI's exit codes, as capsule-emit's.
_VERDICT_EXIT = {"VALID": 0, "INVALID": 1, "INCOMPLETE": 2}


class BundleMismatch(ValueError):
    """The verifier's result is not for the bundle supplied."""


def _e(value: Any) -> str:
    return _html.escape("" if value is None else str(value))


def _short(hex_id: str | None, n: int = 12) -> str:
    return f"{hex_id[:n]}…" if hex_id and len(hex_id) > n else (hex_id or "")


def bind_result(bundle: Any, check: EvidenceFileCheck) -> None:
    """Refuse a result computed for any bundle but ``bundle``.

    The digest is the bundle digest the verifier reports (it leaves out
    ``countersignatures``, so a result's countersignature count is not bound).
    A result that says the file is not an evidence bundle is accepted only in
    the shape capsule-emit gives one: no digest and no records, so nothing of
    another file's can be drawn under it."""
    if not check.kind_ok:
        if check.bundle_digest is not None or check.records:
            raise BundleMismatch("a not-an-evidence-bundle result that carries a digest or records")
        return
    from agent_action_capsule.bundle import bundle_digest

    if not isinstance(bundle, dict) or not check.bundle_digest:
        raise BundleMismatch("the verifier's result names no bundle digest to bind to this file")
    try:
        actual = bundle_digest(bundle)
    except (TypeError, ValueError) as err:
        raise BundleMismatch(f"this file has no bundle digest to bind the verifier's result to ({err})") from err
    if actual != check.bundle_digest:
        raise BundleMismatch(
            f"the verifier's result is for bundle {check.bundle_digest}, not this file ({actual})"
        )


def _overall(check: EvidenceFileCheck) -> tuple[str, str]:
    if not check.kind_ok:
        return "fail", "This is not an evidence file this report can read (no evidence-bundle/v2 kind)."
    if not check.ok:
        return "fail", "This file does not check. The failing items are marked below."
    if check.proven:
        if check.witness is None:
            return "withheld", WITNESS_UNREPORTED
        if check.witness.status != "pass":
            return "withheld", NOT_WITNESSED
        return "pass", "Everything this file claims checks, offline, from the file alone."
    if not check.checkpoint_authenticated:
        return (
            "withheld",
            "Incomplete: this file carries no signed checkpoint, so nothing ties its records to a log "
            "anyone committed to. Anyone could rebuild a log over a chosen subset of records. Only "
            "what is marked as checking below is shown.",
        )
    return "withheld", "Incomplete: what this file carries checks, but some things it does not show; they are marked below."


def _record_fields(record: dict) -> tuple[str, str, str]:
    attestation = record.get("model_attestation")
    model = attestation.get("model_id") if isinstance(attestation, dict) else None
    effect = record.get("effect")
    effect_type = effect.get("type") if isinstance(effect, dict) else None
    action = record.get("record_type") or record.get("action_type") or ""
    return str(record.get("timestamp") or ""), str(action) + (f" · {effect_type}" if effect_type else ""), str(model or "")


def _witness_fact(check: EvidenceFileCheck) -> str:
    """The witness line: each receipt's witness and whether it checked."""
    if not check.witness_receipts:
        return "none checked: " + _e(check.witness.plain if check.witness else "no receipt in the file")
    words = {"pass": "verified", "withheld": "not checked (no key known)", "fail": "<strong>does not verify</strong>"}
    return " · ".join(
        f"{_e(r['ts_url'].split('://', 1)[-1])}: {words.get(r['status'], _e(r['status']))}" for r in check.witness_receipts
    )


def render_report_html(bundle: Any, check: EvidenceFileCheck, *, source: str = "") -> str:
    """The report page for ``bundle`` given capsule-emit's ``check`` of it.

    Raises :class:`BundleMismatch` when ``check`` cannot be shown to be for
    this bundle (see :func:`bind_result`)."""
    bind_result(bundle, check)
    return _page(bundle, check, source)


def _page(bundle: Any, check: EvidenceFileCheck, source: str) -> str:
    status, headline = _overall(check)
    records = [r for r in (bundle.get("records") if isinstance(bundle, dict) else None) or [] if isinstance(r, dict)]
    by_id = {str(r.get("capsule_id")): r for r in records}
    checkpoint = check.checkpoint
    seqs = [r.seq for r in check.records if r.seq is not None]

    checks_html = []
    for c in check.checks:
        plain = c.plain
        finding = f'<div class="find">{_e(", ".join(c.findings))}</div>' if c.findings else ""
        checks_html.append(
            f'<li class="{_e(c.status)}"><span class="mark">{_MARK.get(c.status, "?")}</span>'
            f"<div><strong>{_e(_WORD.get(c.status, c.status))}.</strong> {_e(plain)}{finding}</div></li>"
        )

    if check.checkpoint_authenticated:
        facts = [
            ("Records", f"{len(records)}" + (f" (log positions {min(seqs)}–{max(seqs)})" if seqs else "")),
            ("Log", _e(checkpoint.get("log_id"))),
            (
                "Checkpoint",
                f"signed {_e(checkpoint.get('timestamp'))} · root <code>{_e(_short(checkpoint.get('root'), 16))}</code>",
            ),
            (
                "Signer",
                f"<code>{_e(_short(checkpoint.get('key_id'), 16))}</code>"
                + (
                    " · signed the checkpoint and every record"
                    if check.signer_matches_checkpoint
                    else " · signed the checkpoint; some records name a different key"
                ),
            ),
            ("Witness receipts", _witness_fact(check)),
        ]
    else:
        facts = [
            ("Records", f"{len(records)}"),
            (
                "Checkpoint",
                "<strong>does not match its signature</strong>: log, positions and time are unproven"
                if any(c.name == "checkpoint" and c.status == "fail" for c in check.checks)
                else "<strong>no signed checkpoint</strong>: log, positions and time are unproven",
            ),
        ]
    facts.append(("File digest", f"<code>{_e(check.bundle_digest)}</code>"))
    if source:
        facts.insert(0, ("File", _e(source)))
    facts_html = "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in facts)

    rows = []
    for rc in sorted(check.records, key=lambda r: (r.seq is None, r.seq or 0)):
        ts, action, model = _record_fields(by_id.get(rc.capsule_id, {}))
        sig_status = {"authored": "pass", "unclaimed": "withheld"}.get(rc.signature, "fail")
        rows.append(
            "<tr>"
            f"<td>{_e(rc.seq)}</td><td>{_e(ts[:19])}</td><td>{_e(action)}</td><td>{_e(model)}</td>"
            f"<td><code>{_e(_short(rc.capsule_id))}</code>{' (root)' if rc.capsule_id == check.root else ''}</td>"
            f'<td><span class="mark {"pass" if rc.identity_ok else "fail"}">{_MARK["pass" if rc.identity_ok else "fail"]}</span></td>'
            f'<td><span class="mark {sig_status}">{_MARK[sig_status]}</span> {_e(rc.signature)}</td>'
            "</tr>"
        )

    not_shown = [
        "Whether any answer was right. The file shows what was recorded, not that it was correct.",
        "Who holds the signing key. A key shows that one holder signed; naming the holder needs a directory or a witness.",
    ]
    completeness = bundle.get("completeness") if isinstance(bundle, dict) else None
    if isinstance(completeness, dict) and completeness.get("payloads_mode") == "selected" and not bundle.get("disclosures"):
        not_shown.insert(0, "The request and response text. The records commit to it by digest only.")
    if check.missing:
        not_shown.append(
            f"{len(check.missing)} cited record(s) not in the file (listed by the file itself): "
            + ", ".join(f"<code>{_e(_short(m))}</code>" for m in check.missing)
        )
    if check.closure_depth is not None:
        not_shown.append(f"Anything cited more than {check.closure_depth} step(s) back from the newest record.")
    if seqs and check.checkpoint_authenticated:
        not_shown.append(f"Records outside log positions {min(seqs)}–{max(seqs)}: this file says nothing about them.")
    if not check.checkpoint_authenticated:
        not_shown.insert(0, "That these records are in any committed log, or that none were left out between them.")
    if check.countersignatures:
        not_shown.append(f"{check.countersignatures} countersignature(s): carried, not verified.")
    if check.extensions:
        not_shown.append("Extension blocks, carried but not interpreted: " + ", ".join(_e(x) for x in check.extensions))

    rerun = f"{RERUN_COMMAND} " + _e(source or "FILE.json")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evidence report</title><style>{_CSS}</style></head><body><main>
<h1>Evidence report</h1>
<div class="muted">Checked offline from the file alone. Root record <code>{_e(_short(check.root, 16))}</code>.</div>
<div class="verdict {status}"><strong>{_e(headline)}</strong></div>
<h2>What was checked</h2><ul class="checks">{"".join(checks_html)}</ul>
<h2>About this file</h2><dl>{facts_html}</dl>
<h2>Records</h2><div class="scroll"><table>
<thead><tr><th>#</th><th>Time</th><th>Kind</th><th>Model</th><th>Record</th><th>Intact</th><th>Signature</th></tr></thead>
<tbody>{"".join(rows)}</tbody></table></div>
<h2>What this file does not show</h2><ul>{"".join(f"<li>{x}</li>" for x in not_shown)}</ul>
<h2>Check it yourself</h2><p><code>{rerun}</code>, or open the file in any
evidence-bundle/v2 verifier. Anyone can check it; no account is needed.</p>
</main></body></html>
"""


def check_and_render(
    bundle: Any, *, require_signature: bool = False, witness_directory: Any = None, source: str = ""
) -> tuple[EvidenceFileCheck, str]:
    """Run capsule-emit's verifier on ``bundle`` and render its result.

    The check is capsule-emit's :func:`check_evidence_file`, called as is;
    this function only passes its arguments through and renders what it
    returns. The result is computed here from this same object, so it is
    bound to it by construction: a file the verifier gives no digest (one
    holding a float, say) still renders as capsule-emit renders it."""
    from capsule_emit.evidence_file import check_evidence_file

    check = check_evidence_file(bundle, require_signature=require_signature, witness_directory=witness_directory)
    return check, _page(bundle, check, source)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m capsule_viewer.evidence_report",
        description="Render one readable HTML page from an evidence file (evidence-bundle/v2), offline. "
        "The file is checked by capsule-emit's verifier; this only draws the page.",
    )
    parser.add_argument("bundle_path", metavar="FILE.json", help="the evidence file")
    parser.add_argument(
        "--witness-directory",
        metavar="WITNESSES.json",
        default=None,
        help="the witnesses (and keys) whose receipts capsule-emit checks (default: none, so no receipt is checked)",
    )
    parser.add_argument("-o", "--out", metavar="OUTPUT.html", default=None, help="write the page here (default: stdout)")
    parser.add_argument(
        "--require-signature", action="store_true", help="treat a record with no producer signature as a failed check"
    )
    args = parser.parse_args(argv)

    from capsule_emit.evidence_file import load_evidence_file
    from capsule_emit.witness_directory import load_directory

    try:
        bundle = load_evidence_file(args.bundle_path)
        directory = load_directory(args.witness_directory) if args.witness_directory else None
    except (ValueError, OSError) as err:
        print(f"report: {err}", file=sys.stderr)
        return 1
    check, page = check_and_render(
        bundle,
        require_signature=args.require_signature,
        witness_directory=directory,
        source=Path(args.bundle_path).name,
    )
    if args.out:
        Path(args.out).write_text(page, encoding="utf-8")
        print(f"report: {check.verdict} — wrote {args.out}")
    else:
        print(page)
    return _VERDICT_EXIT[check.verdict]


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())

