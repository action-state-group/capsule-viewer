# SPDX-License-Identifier: Apache-2.0
"""The seller receipt module over real capsulectl seller copies: selected for
every seller copy and only for them, never ambiguous with the other receipt
modules, the built-ins or the fallback; declining whenever the packaging and
the sealed party role disagree, in both directions; the counterparty copy
showing the floor and the address as WITHHELD and the agent's statements to
that buyer in its own words; offers, the acceptance and the handover read from
the sealed records; words from the pack only; the joins of a composition with
the buyer's half as the verifier derived them."""
from __future__ import annotations

import copy
import hashlib
import json
import re
from collections.abc import Callable
from pathlib import Path

import jsonschema
import pytest
from receipt_helpers import (
    FIXTURES,
    PACK,
    PACK_SHA,
    SELLER,
    Doc,
    audience_of,
    load,
    render,
    report_for,
    snapshot,
    visible_text,
)

from capsule_viewer.composed import carried_parts, composition_from_capsulectl
from capsule_viewer.context import VerifiedBundleContext
from capsule_viewer.digest import record_digest
from capsule_viewer.kit.contract import check_module_renders
from capsule_viewer.receipt import (
    BILATERAL_MANIFEST,
    PLACEHOLDERS,
    SELLER_KIND,
    SELLER_MANIFEST,
    UNILATERAL_MANIFEST,
    BilateralReceiptModule,
    SellerReceiptModule,
    UnilateralReceiptModule,
    bilateral_manifest,
    build_bilateral,
    build_seller,
    receipt_page,
    sealed_party_role,
    sealed_side,
    seller_kind_engaged,
    seller_manifest,
    unilateral_manifest,
)
from capsule_viewer.receipt.model import ReceiptUnavailable
from capsule_viewer.registry import AmbiguityError, Registry, co_matchable
from capsule_viewer.verifier_report import context_from_capsulectl
from capsule_viewer.wording import load_wording_pack

ROOT = Path(__file__).parent.parent
AAC = Path(__file__).parent / "testdata" / "aac-presentation"
SCHEMA = json.loads((AAC / "presentation-manifest-v0.json").read_text(encoding="utf-8"))
BUILTINS = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted((AAC / "builtin").glob("*.json"))}
GENERIC = json.loads((AAC / "examples" / "example-generic-fallback.json").read_text(encoding="utf-8"))
RULES_PROFILE = "spec_version:org.example.rules_compare/v0"
RULES = {
    "spec_version": "aac.presentation-manifest/v0",
    "id": "org.example.rules/v0",
    "presentation_api": "aac.presentation-api/v0",
    "runtime_min": "0.1.0",
    "trust_class": "trusted-executable",
    "requires": {"bundle_kind": "evidence-bundle/v2", "profiles": [RULES_PROFILE]},
    "forbids": {"profiles": ["result_version:evidence-result-v0"]},
    "audiences": ["*"],
    "formats": ["html"],
    "fallback": False,
    "priority": 1,
    "executable": {"carrier": "core-runtime"},
}
SELLER_ID = "capsuleviewer.receipt.seller/v0"
UNILATERAL_ID = "capsuleviewer.receipt.unilateral/v0"
WORDS = load_wording_pack(PACK, PACK_SHA, PLACEHOLDERS)
# capsulectl's own seller copies (the producer engages the kind) and the copies
# build_seller_fixtures.sh engaged by its fixture step.
PRODUCER_ENGAGED = ("seller-producer-keep", "seller-producer-counterparty", "seller-producer-adjudicator")
FIXTURE_ENGAGED = ("seller-keep", "seller-counterparty", "seller-adjudicator", "seller-declined")
BUYER_COPIES = (*FIXTURES, "buyer-producer-counterparty")
SHARED = ("seller-counterparty", "seller-adjudicator", "seller-declined", "seller-producer-counterparty", "seller-producer-adjudicator")


def _context(name: str, edit: Callable[[Doc], None] | None = None) -> VerifiedBundleContext:
    """The context of fixture *name*, after *edit* changes its bundle; the
    verifier's report is restated for the edited bytes."""
    bundle, output = load(name)
    if edit is not None:
        bundle = copy.deepcopy(bundle)
        edit(bundle)
        output = report_for(bundle, output)
    context, _ = context_from_capsulectl(bundle, output)
    return context


def _seller(audience: str) -> SellerReceiptModule:
    return SellerReceiptModule(WORDS, "L2", audience, forbid_profiles=[RULES_PROFILE])


def full_registry(audience: str) -> Registry:
    """All three receipt modules beside the built-ins, the rules module and the
    generic fallback, configured as a deployment registering the rules module.
    The others' canRender always says yes: this exercises selection."""
    registry = Registry()
    for manifest in (*BUILTINS.values(), RULES, GENERIC):
        if manifest["id"] == "aac.builtin.no-aggregate/v0":
            continue  # a second fallback: the generic example stands for the fallback tier
        registry.register(manifest, lambda _c: True)
    unilateral = UnilateralReceiptModule(WORDS, "L2", audience, forbid_profiles=[RULES_PROFILE])
    registry.register(unilateral.manifest_json, unilateral.canRender, unilateral)
    seller = _seller(audience)
    registry.register(seller.manifest_json, seller.canRender, seller)
    registry.register(bilateral_manifest([RULES_PROFILE]), lambda _c: True)
    return registry


def _with_kind(bundle: Doc) -> None:
    bundle["extensions"][SELLER_KIND] = {}


def _without_kind(bundle: Doc) -> None:
    del bundle["extensions"][SELLER_KIND]


def _opening(bundle: Doc) -> Doc:
    """The disclosed payload of the copy's opening record."""
    for record in bundle["records"]:
        payload = bundle["disclosures"].get(record["capsule_id"], {}).get("agent_input")
        if isinstance(payload, dict) and payload.get("x-deal-v0", {}).get("record_type") == "baseline":
            return payload
    raise AssertionError("no disclosed opening record")


# ---- the manifest and the one constant -----------------------------------------


def test_the_manifest_is_schema_valid():
    validator = jsonschema.Draft202012Validator({**SCHEMA, "$ref": "#/$defs/PresentationManifest"})
    assert sorted(validator.iter_errors(SELLER_MANIFEST), key=str) == []
    assert SELLER_MANIFEST["id"] == SELLER_ID


def test_the_seller_manifest_requires_the_kind_and_the_unilateral_forbids_it():
    assert SELLER_MANIFEST["requires"]["extensions"]["required"] == ["x-deal-v0", SELLER_KIND]
    assert SELLER_KIND in UNILATERAL_MANIFEST["forbids"]["extensions"]
    assert SELLER_KIND in unilateral_manifest([RULES_PROFILE])["forbids"]["extensions"]
    assert "composed/v1" in SELLER_MANIFEST["forbids"]["extensions"]


def test_the_kind_is_named_in_one_place():
    """The final name (x-deal-seller/v0) lives in role.py's constant; no
    manifest file or other module spells it."""
    assert SELLER_KIND == "x-deal-seller/v0"
    src = ROOT / "src" / "capsule_viewer"
    sources = [p for p in src.rglob("*") if p.suffix in (".py", ".json", ".js", ".css")]
    naming = sorted(str(p.relative_to(src)) for p in sources if SELLER_KIND in p.read_text(encoding="utf-8"))
    assert naming == ["receipt/role.py"]


SPECIFIC = [
    m for m in (*BUILTINS.values(), RULES, unilateral_manifest([RULES_PROFILE]), bilateral_manifest([RULES_PROFILE])) if not m["fallback"]
]


def test_every_specific_manifest_is_compared():
    assert len(SPECIFIC) == 8  # five built-ins, the rules module, the unilateral and bilateral receipts


@pytest.mark.parametrize("other", SPECIFIC, ids=lambda m: m["id"])
def test_never_ambiguous_with_a_specific_module(other):
    assert not co_matchable(seller_manifest([RULES_PROFILE]), other)


def test_the_full_registry_registers():
    assert [e.id for e in full_registry("keep").entries][-3:] == [UNILATERAL_ID, SELLER_ID, BILATERAL_MANIFEST["id"]]


def test_the_registration_test_bites():
    """Mutant: the unilateral manifest without the seller kind in its forbids.
    A seller copy then matches both, and registration refuses the pair."""
    loose = copy.deepcopy(UNILATERAL_MANIFEST)
    loose["forbids"]["extensions"] = [k for k in loose["forbids"]["extensions"] if k != SELLER_KIND]
    registry = Registry()
    registry.register(loose, lambda _c: True)
    with pytest.raises(AmbiguityError) as err:
        registry.register(SELLER_MANIFEST, lambda _c: True)
    assert set(err.value.ids) == {UNILATERAL_ID, SELLER_ID}


# ---- selection ---------------------------------------------------------------


@pytest.mark.parametrize("name", [*PRODUCER_ENGAGED, *FIXTURE_ENGAGED])
def test_each_seller_copy_selects_only_the_seller_module(name):
    context = _context(name)
    registry = full_registry(audience_of(name))
    assert [e.id for e in registry.list(context, audience_of(name), "html")] == [GENERIC["id"], SELLER_ID]
    resolution = registry.resolve(context, audience_of(name), "html")
    assert (resolution.outcome, resolution.entry.id, resolution.refusals) == ("module", SELLER_ID, ())


@pytest.mark.parametrize("name", PRODUCER_ENGAGED)
def test_the_producer_engages_the_kind_on_its_own_copies(name):
    """The producer copies are capsulectl's bytes: the kind is the producer's, and
    the sealed role agrees with it."""
    context = _context(name)
    assert seller_kind_engaged(context) and sealed_party_role(context) == "seller"


@pytest.mark.parametrize("name", BUYER_COPIES)
def test_each_buyer_copy_still_selects_only_the_unilateral_module(name):
    context = _context(name)
    assert not seller_kind_engaged(context)
    resolution = full_registry(audience_of(name)).resolve(context, audience_of(name), "html")
    assert resolution.entry.id == UNILATERAL_ID


# ---- packaging and sealed role must agree (both directions) ---------------------


@pytest.mark.parametrize(
    ("name", "role"),
    [("buyer-producer-counterparty", None), ("keep", "buyer"), ("golden-2", "buyer")],
)
def test_a_buyer_copy_given_the_seller_kind_renders_no_receipt(name, role):
    """The kind added by hand to a buyer's copy: the seller manifest matches, the
    copy's opening record does not seal seller (or is withheld), so the seller
    module declines and the page falls to the fallback, never a seller page."""
    context = _context(name, _with_kind)
    assert sealed_party_role(context) == role
    registry = full_registry(audience_of(name))
    assert [e.id for e in registry.list(context, audience_of(name), "html")] == [GENERIC["id"], SELLER_ID]
    assert _seller(audience_of(name)).canRender(context) is False
    assert registry.resolve(context, audience_of(name), "html").entry.id == GENERIC["id"]


@pytest.mark.parametrize("name", [*PRODUCER_ENGAGED, *FIXTURE_ENGAGED])
def test_a_seller_copy_without_its_kind_renders_no_receipt(name):
    """The kind dropped from a seller's copy: the unilateral manifest matches,
    the copy's opening record seals seller, so the unilateral module declines;
    a seller's copy is never drawn as a buyer's receipt."""
    context = _context(name, _without_kind)
    assert sealed_party_role(context) == "seller"
    module = UnilateralReceiptModule(WORDS, "L2", audience_of(name), forbid_profiles=[RULES_PROFILE])
    assert module.canRender(context) is False
    # The seller module alone, asked directly (the registry never offers it a
    # copy without the kind): it declines too, so neither module draws it.
    assert _seller(audience_of(name)).canRender(context) is False
    assert full_registry(audience_of(name)).resolve(context, audience_of(name), "html").entry.id == GENERIC["id"]


def _withhold_opening(name: str, drop_kind: bool) -> VerifiedBundleContext:
    """Fixture *name* with its opening record withheld, as a shared copy may
    cut it (the verifier then reports it withheld), and its kind dropped when
    *drop_kind*."""
    bundle, output = load(name)
    bundle, output = copy.deepcopy(bundle), copy.deepcopy(output)
    opening = next(cid for cid, d in bundle["disclosures"].items() if d.get("agent_input", {}).get("x-deal-v0", {}).get("record_type") == "baseline")
    del bundle["disclosures"][opening]
    for entry in output["disclosures"]:
        if entry["capsule_id"] == opening:
            entry["status"] = "withheld"
    if drop_kind:
        _without_kind(bundle)
    context, _ = context_from_capsulectl(bundle, report_for(bundle, output))
    return context


@pytest.mark.parametrize("name", [*PRODUCER_ENGAGED, *FIXTURE_ENGAGED])
def test_a_seller_copy_withholding_its_opening_is_still_read_as_a_sellers(name):
    """No disclosed opening: the side is read from records only a seller's
    deal carries. Without the kind, no module draws it; with it, the seller
    module does."""
    relabelled = _withhold_opening(name, drop_kind=True)
    assert (sealed_party_role(relabelled), sealed_side(relabelled)) == (None, "seller")
    assert UnilateralReceiptModule(WORDS, "L2", audience_of(name)).canRender(relabelled) is False
    assert full_registry(audience_of(name)).resolve(relabelled, audience_of(name), "html").entry.id == GENERIC["id"]
    kept = _withhold_opening(name, drop_kind=False)
    assert full_registry(audience_of(name)).resolve(kept, audience_of(name), "html").entry.id == SELLER_ID


@pytest.mark.parametrize("name", BUYER_COPIES)
def test_no_buyer_copy_carries_a_seller_only_record(name):
    assert sealed_side(_context(name)) in (None, "buyer")


def test_a_seller_copy_whose_sealed_role_reads_buyer_is_declined():
    """The packaging says seller, the opening record seals buyer: declined."""

    def to_buyer(bundle: Doc) -> None:
        _opening(bundle)["body"]["intent"]["party_role"] = "buyer"

    context = _context("seller-keep", to_buyer)
    assert sealed_party_role(context) == "buyer"
    assert _seller("keep").canRender(context) is False
    with pytest.raises(ReceiptUnavailable, match="side 'buyer'"):
        build_seller(context, lambda *_: "committed", _assurance("seller-keep"), "keep")


def test_a_sealed_role_outside_buyer_and_seller_is_unknown():
    def odd(bundle: Doc) -> None:
        _opening(bundle)["body"]["intent"]["party_role"] = "broker"

    assert sealed_party_role(_context("seller-keep", odd)) is None


def _assurance(name: str):
    return context_from_capsulectl(*load(name))[1]


# ---- the counterparty copy: what is WITHHELD and what is shown -------------------


def _row(html: str, attr: str) -> str:
    found = re.search(rf'data-seller="{attr}" data-state="([a-z_]+)"', html)
    assert found, attr
    return found.group(1)


@pytest.mark.parametrize("name", ["seller-counterparty", "seller-declined"])
def test_the_counterparty_page_shows_the_floor_withheld(name):
    assert _row(render(name), "floor") == "withheld"


def test_the_counterparty_page_shows_the_address_withheld():
    assert _row(render("seller-counterparty"), "address") == "withheld"


def test_the_keep_page_shows_the_floor_committed_never_its_value():
    """The seller's own copy carries the floor's opening (a document, which this
    page does not open): the row says committed and no amount is shown. The
    address row is committed too: its record seals a commitment, not a value."""
    html = render("seller-keep")
    assert (_row(html, "floor"), _row(html, "address")) == ("committed", "committed")
    text = visible_text(html)
    assert "1700.00" not in text and "170000" not in text


def test_a_shared_page_never_shows_the_floor_even_when_its_report_carries_an_opening():
    """Module, not fixture: the counterparty copy's sealed report given the
    keep copy's floor openings. The row reads committed (the opening is in the
    copy) and the amount is still never drawn."""
    keep, _ = load("seller-keep")
    openings = keep["disclosures"][keep["extensions"]["x-deal-v0"]["sealed_report"]]["agent_input"]["report"]["bounds_openings"]

    def inject(bundle: Doc) -> None:
        report_id = bundle["extensions"]["x-deal-v0"]["sealed_report"]
        bundle["disclosures"][report_id]["agent_input"]["report"]["bounds_openings"] = openings

    html = render("seller-counterparty", bundle=_edited("seller-counterparty", inject))
    assert _row(html, "floor") == "committed"
    assert "1700.00" not in visible_text(html) and "170000" not in html


def _keep_only_values() -> list[str]:
    """What the seller's own copy holds and a shared copy must not: the
    seller's own words, the floor, the address given."""
    bundle, _ = load("seller-keep")
    report = bundle["disclosures"][bundle["extensions"]["x-deal-v0"]["sealed_report"]]["agent_input"]["report"]
    floor = report["bounds_openings"][0]["document"]["min_total_minor"]
    values = [report["asked_opening"]["text"], str(floor), f"{floor / 100:.2f}", "12 Quarry Lane", "Northfield"]
    assert "12 Quarry Lane" in render("seller-keep")  # the own copy's sealed line carries it: the check below can see it
    return values


@pytest.mark.parametrize("name", ["seller-counterparty", "seller-adjudicator"])
@pytest.mark.parametrize("depth", ["L0", "L2"])
def test_a_shared_page_never_shows_what_only_the_sellers_copy_holds(name, depth):
    """End to end over capsulectl's cut: the shared copies do not carry these
    values, and nothing on the page brings them in."""
    html = render(name, depth)
    for value in _keep_only_values():
        assert value not in html, value


@pytest.mark.parametrize("name", ["seller-counterparty", "seller-adjudicator", "seller-keep"])
def test_the_agents_statement_to_this_buyer_is_shown_in_its_own_words(name):
    """The counterparty copy carries the opening of each statement made to that
    buyer, and the page shows it, opened against the sealed commitment."""
    html = render(name)
    assert re.search(r'data-committed="statement" data-state="opened">Condition: “The bicycle is in good condition, ridden one season\.”', html)


def test_a_statement_whose_opening_does_not_recompute_is_not_shown():
    bundle, _ = load("seller-counterparty")
    report_id = bundle["extensions"]["x-deal-v0"]["sealed_report"]

    def tamper(b: Doc) -> None:
        b["disclosures"][report_id]["agent_input"]["report"]["representations"][0]["text"] = "Brand new, never ridden."

    html = render("seller-counterparty", bundle=_edited("seller-counterparty", tamper))
    assert "Brand new" not in html
    assert 'data-committed="statement" data-state="mismatch"' in html


def _edited(name: str, edit: Callable[[Doc], None]) -> Doc:
    bundle, _ = load(name)
    bundle = copy.deepcopy(bundle)
    edit(bundle)
    return bundle


@pytest.mark.parametrize("name", ["seller-keep", "seller-counterparty", "seller-adjudicator"])
def test_withheld_steps_show_withheld_and_their_log_place(name):
    page = snapshot(render(name))
    withheld = {cid: s for cid, s in page.items() if s["disclosure"] == "withheld"}
    if name == "seller-keep":
        assert withheld == {}
        return
    assert withheld
    for cid, step in withheld.items():
        assert re.fullmatch(r"deal/deal-5e11e7b1c7c1e0a1:\d+:\d+", step["log"] or ""), cid
        assert step["facts"] == {}, cid


# ---- offers, the acceptance, the handover ----------------------------------------


def test_offers_read_their_supersession_and_acceptance_from_the_sealed_refs():
    model = _seller("keep").buildModel(_context("seller-keep"))
    offers = [(o.action, o.amount.value if o.amount else None) for o in model.offers]
    assert offers == [("offer", "2000.00 USD"), ("offer", "1900.00 USD"), ("commit", "1900.00 USD")]
    first, second, commit = model.offers
    assert (first.superseded_by, second.supersedes) == (second.step, first.step)
    assert first.accepted_by is None and commit.accepted_by is None
    (acceptance,) = model.acceptances
    assert (second.accepted_by, acceptance.offer, acceptance.offer_digest) == (acceptance.step, second.step, second.digest)


def _typed_refs(value: object) -> set[str]:
    """Every digest a ``{"type": "record", "digest": ...}`` reference names,
    anywhere in *value* (refs, authority bases, evaluation and offer refs)."""
    if isinstance(value, dict):
        found = {value["digest"]} if value.get("type") == "record" and isinstance(value.get("digest"), str) else set()
        return found.union(*(_typed_refs(v) for v in value.values()))
    if isinstance(value, list):
        return set().union(*(_typed_refs(v) for v in value))
    return set()


@pytest.mark.parametrize("name", ["seller-keep", "seller-producer-keep"])
def test_the_record_digest_agrees_with_capsulectls(name):
    """The refs are capsulectl's digests (Go). In a seller's own copy every
    deal record is disclosed (only earlier receipts' report records are not),
    so every typed ref anywhere in it names a record whose
    payload this package's record_digest (Python JCS) reproduces."""
    bundle, _ = load(name)
    payloads = [d["agent_input"] for d in bundle["disclosures"].values() if "agent_input" in d]
    ours = {record_digest(p) for p in payloads}
    named = _typed_refs(payloads)
    assert len(named) >= 5
    assert named <= ours


def test_an_acceptance_naming_an_offer_this_copy_does_not_disclose_says_so():
    model = _seller("keep").buildModel(_context("seller-keep"))
    accepted = next(o.step for o in model.offers if o.accepted_by)

    def withhold(bundle: Doc) -> None:
        del bundle["disclosures"][accepted]

    bundle = _edited("seller-keep", withhold)
    _, output = load("seller-keep")
    output = copy.deepcopy(output)
    for entry in output["disclosures"]:
        if entry["capsule_id"] == accepted:
            entry["status"] = "withheld"
    html = render("seller-keep", bundle=bundle, output=report_for(bundle, output))
    assert re.search(r'data-accepted-offer=""', html)
    assert WORDS.entries["seller.accepted.offer_not_here"] in html


@pytest.mark.parametrize("name", ["seller-keep", "seller-counterparty", "seller-adjudicator"])
def test_the_handover_is_shown_with_its_provenance_never_as_a_bare_fact(name):
    html = render(name, "L0")
    assert 'data-handover="recorded"' in html
    assert WORDS.entries["seller.handover.seller_observed"] in html
    rows = re.findall(r'data-provenance="([a-z_]+)" data-state="([a-z_]+)"', html)
    assert rows == [("seller_observed", "recorded"), ("carrier", "not_present"), ("buyer_confirmed", "not_present")]


def test_a_declined_thread_says_not_selected_and_records_no_handover():
    html = render("seller-declined", "L0")
    assert 'data-outcome="not_selected"' in html and 'data-handover="not_present"' in html
    assert WORDS.entries["seller.not_selected"] in html


def test_the_payment_tile_never_claims_a_payment():
    """No deal record kind carries a payment the seller received, so the tile
    is the pack's not-recorded words on every page (a constant: this guards
    the words, not a reader)."""
    for name in [*FIXTURE_ENGAGED, *PRODUCER_ENGAGED]:
        assert WORDS.entries["seller.payment.not_recorded"] in render(name, "L0"), name


# ---- words ---------------------------------------------------------------------


def _swapped_pack() -> bytes:
    """The example pack with every entry's words replaced and its placeholders
    kept: a different pack, the same keys."""
    raw = json.loads(PACK)
    raw["id"] = "org.example.swapped-wording/v0"
    raw["entries"] = {k: "W " + " ".join(re.findall(r"\{[a-z_]+\}", v)) + f" {k.upper()}" for k, v in raw["entries"].items()}
    return json.dumps(raw).encode("utf-8")


def _evidence(html: str) -> list[tuple[str, str]]:
    """Every data-* attribute on the page, in order, except ``data-label``: the
    kit copies a table's column heading (pack words) there for narrow screens."""
    return [(k, v) for k, v in re.findall(r'(data-[a-z-]+)="([^"]*)"', html) if k != "data-label"]


@pytest.mark.parametrize("name", [*FIXTURE_ENGAGED, *PRODUCER_ENGAGED, "seller-bilateral"])
def test_a_wording_pack_swap_changes_text_only(name):
    bundle, output = load(name)
    context, assurance = context_from_capsulectl(bundle, output)
    composition = composition_from_capsulectl(bundle, output)
    swapped = _swapped_pack()
    a = receipt_page(context, assurance, PACK, PACK_SHA, audience=audience_of(name), depth="L2", composition=composition)
    b = receipt_page(context, assurance, swapped, hashlib.sha256(swapped).hexdigest(), audience=audience_of(name), depth="L2", composition=composition)
    assert visible_text(a) != visible_text(b)
    assert "W " in visible_text(b)  # the swapped pack was accepted, not refused
    assert snapshot(a) == snapshot(b)
    assert _evidence(a) == _evidence(b)


SELLER_KEYS = {k for k in WORDS.entries if k.startswith("seller.")}


def test_every_seller_word_is_in_the_pack():
    for name in [*SELLER, "seller-bilateral"]:
        assert not re.search(r"\[[a-z0-9_]+(\.[a-z0-9_]+)+\]", render(name, "L2")), name  # a key the pack lacks


def test_the_example_pack_never_claims_enforcement():
    words = " ".join(WORDS.entries.values()).lower()
    assert not re.search(r"\b(protect|protects|protected|block|blocks|blocked|stop|stops|stopped)\b", words)


@pytest.mark.parametrize("name", [*FIXTURE_ENGAGED, *PRODUCER_ENGAGED])
def test_the_module_meets_the_kit_contract(name):
    check_module_renders(_seller(audience_of(name)), _context(name))


@pytest.mark.parametrize(("depth", "l1", "l2"), [("L0", False, False), ("L1", True, False), ("L2", True, True)])
def test_depth_opens_levels_and_never_removes_one(depth, l1, l2):
    html = render("seller-counterparty", depth)
    for level, opened in (("L1", l1), ("L2", l2)):
        region = html.split(f'data-level="{level}"', 1)[1]
        assert (re.match(r">\s*<details[^>]*\sopen", region) is not None) is opened, level
    assert snapshot(html) == snapshot(render("seller-counterparty", "L2"))


# ---- with the buyer's half -------------------------------------------------------


def test_the_composition_draws_the_seller_copy_with_the_seller_module():
    html = render("seller-bilateral", "L0")
    assert WORDS.entries["seller.title"] not in html.split('data-level="L1"')[0].split("<h2", 2)[1]  # the page is the bilateral one
    assert 'data-handover="recorded"' in html
    assert 'data-seller="floor" data-state="withheld"' in html


def test_the_joins_shown_equal_what_capsulectl_verify_derived():
    _, output = load("seller-bilateral")
    composed = next(e for e in output["extensions"] if e["kind"] == "composed/v1")["composed"]
    expected = [
        (j["basis"], j["declared"], j.get("derived") or "not_derivable", j["result"], c["result"])
        for j, c in zip(composed["joins"], composed["corroboration"], strict=True)
    ]
    assert expected == [("pre_agreed_identifier", "agree", "agree", "derived_matches", "corroborating")]
    html = render("seller-bilateral", "L0")
    shown = re.findall(r'<li data-join-basis="([^"]+)" data-join-declared="([^"]+)" data-join-derived="([^"]+)" data-join-result="([^"]+)" data-corroboration="([^"]+)"', html)
    assert shown == expected


def _bilateral(bundle: Doc, output: Doc) -> None:
    context, assurance = context_from_capsulectl(bundle, output)
    composition = composition_from_capsulectl(bundle, output)
    build_bilateral(context, composition, lambda *_: "committed", assurance, "counterparty")


def _member_edit(member_id: str, edit: Callable[[Doc], None]) -> tuple[Doc, Doc]:
    """The seller-bilateral bundle with one carried copy edited, and the
    verifier's report restated for the edited bytes (each member's digest is
    the report's, so the member is read as the edited copy)."""
    from capsule_viewer.digest import bundle_digest

    bundle, output = load("seller-bilateral")
    bundle, output = copy.deepcopy(bundle), copy.deepcopy(output)
    member = next(m for m in bundle["extensions"]["composed/v1"]["members"] if m["id"] == member_id)
    edit(member["bundle"])
    reported = next(e for e in output["extensions"] if e["kind"] == "composed/v1")["composed"]
    for m in reported["members"]:
        if m["id"] == member_id:
            m["bundle"]["bundle_digest"] = bundle_digest(member["bundle"])
    return bundle, report_for(bundle, output)


def test_the_unedited_composition_builds():
    bundle, output = load("seller-bilateral")
    _bilateral(bundle, output)
    context, _ = context_from_capsulectl(bundle, output)
    parts = carried_parts(context, composition_from_capsulectl(bundle, output))
    assert [seller_kind_engaged(p.context) for p in parts] == [False, True]


@pytest.mark.parametrize(
    ("member", "edit", "reason"),
    [
        ("party-b", _without_kind, "party-b is sealed as a seller's copy and does not engage the seller kind"),
        ("party-a", _with_kind, "its sealed records show side None"),
    ],
    ids=["seller-copy-without-the-kind", "buyer-copy-with-the-kind"],
)
def test_a_composition_whose_copy_disagrees_with_its_packaging_is_declined(member, edit, reason):
    bundle, output = _member_edit(member, edit)
    with pytest.raises(ReceiptUnavailable, match=reason):
        _bilateral(bundle, output)
    module_audience = "counterparty"
    context, assurance = context_from_capsulectl(bundle, output)
    module = BilateralReceiptModule(WORDS, "L2", module_audience, assurance, composition_from_capsulectl(bundle, output))
    assert module.canRender(context) is False
