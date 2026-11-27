# SPDX-License-Identifier: Apache-2.0
"""The provider's own receipt (``capsuleviewer.receipt.provider/v0``): the page
for a bundle of one exchange a Mesh node served and the payments it received
for it (capsules-plugin ``provider-receipt-bundle``, Mesh-LLM/capsules-plugin#134).

It is not a deal receipt. The bundle's root is the node's own record of the
exchange it served (``x-mesh-poc-v1``), and every other record is a
``payee_observed`` settlement leg: what the node received. The page says it is
the node's own half, not a joint record (the other party keeps its own), names
the model and shows each amount with its unit. It reads no request or response
text (the bundle carries none) and shows nothing of who asked. It never uses
deal or offer wording, since nothing here is one.

Like the other receipt modules it never verifies: it reads a context the core
has gated, and a bundle the producer chose the records of reaches it as
``incomplete`` with the shell's notice (``shell.INCOMPLETE_SELECTION``).
"""
from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from html import escape
from importlib import resources

from ..context import Frozen, VerifiedBundleContext
from ..kit.components import Markup, Metric
from ..kit.contract import KitServices, ModuleManifest
from ..registry import Registry
from ..shell import present
from .model import group_thousands

TITLE = "Your receipt for an exchange you served"
# The page's own sentences. Public text: Sherlock2's PM (Mesh-LLM/capsules-plugin#134);
# OWN_HALF as Sherlock2 reworded it (#460): the other party is not a countersigner,
# which in these records is a third party re-checking a bundle.
OWN_HALF = (
    "This is this node's own record of its half of the exchange. It is not a joint record: "
    "the other party keeps its own."
)
NO_CONTENT = "It names the model and what was received. It holds no request or response text."
RECORDS_NOTE = "The exchange and each payment are records of their own, listed below."
MODEL = "Model served"
SERVED_AT = "Served at"
# A failed or dispatched exchange was not served (capsule-viewer#465): Sherlock2's
# words for its page, the same as the Go pack's provider.* keys.
TITLE_ASKED = "Your record of an exchange you were asked to serve"
MODEL_ASKED = "Model asked for"
RECORDED_AT = "Recorded at"
STATUS_FAILED = (
    "This node's record says the exchange failed{reason}. It was not served. "
    "Any payment this node received for it is listed below."
)
STATUS_DISPATCHED = (
    "This node's record says the request was sent on, but the host reported no response. "
    "It does not show that the exchange was served."
)
# The failure classes a failed record may name (capsules-plugin FailedExchange.class),
# in words; any other value is drawn as no reason, never as its code.
REASONS = {
    "payment_required": "payment required",
    "refused": "refused",
    "upstream_error": "upstream error",
    "timeout": "timed out",
    "dropped": "dropped",
}
RECEIVED = "Received"
FEE = "Fee for receiving"
TOTAL = "Received in total"

_CANONICAL = re.compile(r"0|[1-9][0-9]*")
_POC = "x-mesh-poc-v1"
_LEG = "payee_observed"


def _load_manifest() -> dict:
    return json.loads(resources.files(__package__).joinpath("manifest-provider.json").read_text(encoding="utf-8"))


MANIFEST = _load_manifest()


def _get(value: Frozen, key: str) -> Frozen:
    return value.get(key) if isinstance(value, Mapping) else None


def _text(value: Frozen) -> str:
    return "" if value is None or isinstance(value, (Mapping, tuple)) else str(value)


def amount_text(amount: Frozen) -> str | None:
    """An amount with its unit. One millisatoshi is 1e-11 BTC, so a BTC amount
    at scale 11 reads in msat; any other asset or scale is shown as it is
    sealed, never converted. ``None`` when the amount is not a whole number
    of units or names no asset: the page then shows nothing rather than a
    number with no unit."""
    value, code, scale = _get(amount, "value"), _get(amount, "assetCode"), _get(amount, "assetScale")
    # AAC's exact amount: exactly these three members, a canonical integer
    # string, a code, a scale of 0 to 255.
    if not isinstance(amount, Mapping) or set(amount) != {"value", "assetCode", "assetScale"}:
        return None
    if not isinstance(value, str) or not _CANONICAL.fullmatch(value):
        return None
    if not isinstance(code, str) or not code or not isinstance(scale, int) or isinstance(scale, bool):
        return None
    if not 0 <= scale <= 255:
        return None
    if code == "BTC" and scale == 11:
        return f"{group_thousands(int(value))} msat"
    return f"{int(value)} × 10^-{scale} {code}"


@dataclass(frozen=True)
class Payment:
    capsule_id: str
    received: str | None
    fee: str | None


@dataclass(frozen=True)
class ProviderModel:
    effect: str
    reason: str | None
    exchange_id: str
    model: str
    served_at: str
    payments: tuple[Payment, ...]
    total: str | None


def _utc(stamp: str) -> str:
    """An RFC 3339 time in UTC, with the zone said; "?" when it is not one with an offset."""
    try:
        # Before Python 3.11 fromisoformat does not read a trailing Z.
        when = datetime.fromisoformat(stamp[:-1] + "+00:00" if stamp[-1:] in "Zz" and stamp else stamp)
    except ValueError:
        return "?"
    if when.tzinfo is None:
        return "?"
    try:
        return when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S UTC")
    except (OverflowError, ValueError):  # at the edge of the year range
        return "?"


def _is_leg(record: Frozen) -> bool:
    """A payment this node received: only a settled one. A pending, failed or
    reversed leg is not "received", and counting it (or a reversal beside the
    settled leg it undoes) would state an amount that was not kept."""
    leg = _get(record, "settlement")
    return _get(leg, "leg") == _LEG and _get(leg, "sealer_role") == "payee" and _get(leg, "status") == "settled"


def _parts(context: VerifiedBundleContext) -> tuple[Mapping, tuple[Mapping, ...], str, str | None] | None:
    """The node's own record of the exchange, the legs, the record's effect and
    a failed record's reason class, when the bundle is exactly those."""
    records = _get(context.bundle, "records")
    root = _get(context.bundle, "root")
    if not isinstance(records, tuple) or not all(isinstance(r, Mapping) for r in records):
        return None
    exchange = [r for r in records if _get(r, "capsule_id") == root]
    others = [r for r in records if _get(r, "capsule_id") != root]
    if len(exchange) != 1 or not all(_is_leg(r) for r in others):
        return None
    poc = _get(_get(_get(exchange[0], "model_attestation"), "compute_attestation"), _POC)
    # The node's own served record: a mesh exchange block that names its serving
    # provenance and is not marked as another role (the block states `served`,
    # or leaves it to the default).
    if not isinstance(poc, Mapping) or not isinstance(poc.get("serving_provenance"), Mapping):
        return None
    if poc.get("role", "served") != "served":
        return None
    # A summary of the failures a node did not seal one by one is not one exchange.
    if "unsealed_failures" in poc:
        return None
    # Served (confirmed), failed, or sent on with no response recorded
    # (dispatched): each side keeps its half of a failed exchange too (Steven's
    # u1578 E and F, evidencebook#205; capsule-viewer#465). A record that states
    # no such status is not shown. A failed exchange may have no payment; any
    # other needs one.
    effect = _get(_get(exchange[0], "effect"), "status")
    if effect not in ("confirmed", "failed", "dispatched"):
        return None
    if not others and effect != "failed":
        return None
    reason = poc.get("failure_class")
    return exchange[0], tuple(others), effect, reason if effect == "failed" and reason in REASONS else None


def _total(legs: tuple[Mapping, ...]) -> str | None:
    """The sum of the amounts received, only when every one is in msat."""
    values = []
    for leg in legs:
        text = amount_text(_get(_get(leg, "settlement"), "received"))
        if text is None or not text.endswith(" msat"):
            return None
        values.append(int(text.removesuffix(" msat").replace(",", "")))
    return f"{group_thousands(sum(values))} msat"


class ProviderReceiptModule:
    manifest_json = MANIFEST
    manifest = ModuleManifest(
        id=MANIFEST["id"],
        bundle_kind=MANIFEST["requires"]["bundle_kind"],
        audiences=tuple(MANIFEST["audiences"]),
        formats=tuple(MANIFEST["formats"]),
        forbids=tuple(MANIFEST["forbids"]["extensions"]),
        fallback=MANIFEST["fallback"],
        priority=MANIFEST["priority"],
        namespace=MANIFEST["spec_version"],
    )
    title = TITLE

    def canRender(self, context: VerifiedBundleContext) -> bool:  # noqa: N802 -- the contract's member name
        return context.verified and _parts(context) is not None

    def buildModel(self, context: VerifiedBundleContext) -> ProviderModel:  # noqa: N802
        parts = _parts(context) if context.verified else None
        if parts is None:
            raise ValueError(f"{self.manifest.id}: buildModel called on a context canRender refuses")
        exchange, legs, effect, reason = parts
        return ProviderModel(
            effect=effect,
            reason=reason,
            exchange_id=_text(_get(exchange, "capsule_id")),
            model=_text(_get(_get(exchange, "model_attestation"), "model_id")),
            served_at=_utc(_text(_get(exchange, "timestamp"))),
            payments=tuple(
                Payment(
                    _text(_get(leg, "capsule_id")),
                    amount_text(_get(_get(leg, "settlement"), "received")),
                    amount_text(_get(_get(leg, "settlement"), "receive_fee")),
                )
                for leg in legs
            ),
            total=_total(legs),
        )

    def render(self, model: ProviderModel, services: KitServices) -> str:
        served = model.effect == "confirmed"
        if served:
            status = ""
        elif model.effect == "dispatched":
            status = STATUS_DISPATCHED
        else:
            status = STATUS_FAILED.format(reason=f": {REASONS[model.reason]}" if model.reason else "")
        metrics = [
            Metric(MODEL if served else MODEL_ASKED, model.model or "?"),
            Metric(SERVED_AT if served else RECORDED_AT, model.served_at or "?"),
        ]
        if model.total is not None:
            metrics.append(Metric(TOTAL, model.total))
        rows = [
            (
                Markup('<span class="cv-mono">') + p.capsule_id[:16] + Markup("</span>"),
                p.received or "not shown",
                p.fee or "not shown",
            )
            for p in model.payments
        ]
        table = services.data_table(("Payment record", RECEIVED, FEE), rows)
        return str(
            Markup(f'<div class="cv-provider-receipt" data-module="{escape(self.manifest.id)}">')
            + Markup('<p data-provider="own-half">') + OWN_HALF + Markup("</p>")
            + (
                Markup(f'<p data-provider="status" data-effect="{escape(model.effect)}">') + status + Markup("</p>")
                if status
                else Markup("")
            )
            + Markup('<p data-provider="no-content">') + NO_CONTENT + Markup("</p>")
            + services.metric_grid(metrics)
            + services.drilldown(f"{RECEIVED} ({len(model.payments)})", table, expanded=True)
            + Markup('<p class="cv-muted" data-provider="records">') + RECORDS_NOTE + Markup(" ")
            + Markup('<span class="cv-mono">') + model.exchange_id[:16] + Markup("</span></p>")
            + Markup("</div>")
        )


def provider_receipt_page(context: VerifiedBundleContext) -> str:
    """The page for *context*, a gated context over a provider's receipt bundle."""
    module = ProviderReceiptModule()
    # The owner's title says what the record is: a failed or dispatched
    # exchange was not served.
    parts = _parts(context) if context.verified else None
    if parts is not None and parts[2] != "confirmed":
        module.title = TITLE_ASKED
    registry = Registry()
    registry.register(MANIFEST, module.canRender, module)
    return present(context, registry, audience="keep", core_checks=True)
