# SPDX-License-Identifier: Apache-2.0
"""The module-slot scripts' words live in wording packs (Viewer PRD section 6
R7; agent-action-capsule's presentation contract, sections 7.3 and 7.4).

The receipt scripts (``static/receipt_*.js``) read the receipt modules' pack
(``receipt/wording-en.json``, the one the Python modules read) and the kit's
(``kit/wording-en.json``, the kit's vocabularies and the composition section,
the one ``kit.words`` reads); the History script (``static/history_card.js``)
reads the History's (``history/wording-en.json``, the one ``recompute`` reads
its L0 words from). Each script carries its packs' exact bytes as data on its
generated lines and hashes them for the ``wording_sha256`` its model records.

Here, the Python side of the acceptance (the scripts' side, and the stub-pack
swap, are js-tests/wording_packs.test.js):

1. no person-facing string literal is left in the module JS: every literal
   with a letter in it is a token (lowercase, no space: keys, ids, kinds, class
   names), a CAPS enum token, or on ``ALLOWED`` with the reason it is not
   words a pack should hold;
3. a model a Python module builds records the ``wording_sha256`` of its pack's
   bytes and the ``renderer_version``;
4. the T8 banned-word grep runs over every pack;
5. no pack's words are sealed in any record of any fixture, and a mutant that
   seals one (re-sealed, so it still recomputes) is caught.
And pack parity: the Python twins' words are the packs' entries.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pytest
from js_literals import blank_generated, literals
from receipt_helpers import load

from capsule_viewer.binding import check_opening
from capsule_viewer.composed import CUSTODY, NOT_APPLICABLE, SCOPE, composition_from_capsulectl
from capsule_viewer.history import recompute
from capsule_viewer.history.fixture import _reseal_records, reseal_selection
from capsule_viewer.history.words import HISTORY_PACK
from capsule_viewer.kit.components import DISCLOSURE_STATES, VERIFICATION_OUTCOMES
from capsule_viewer.kit.words import KIT_PACK
from capsule_viewer.receipt import (
    PLACEHOLDERS,
    BilateralReceiptModule,
    SellerReceiptModule,
    UnilateralReceiptModule,
)
from capsule_viewer.verifier_report import context_from_capsulectl
from capsule_viewer.version import VERSION, renderer_version
from capsule_viewer.wording import load_wording_pack

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "capsule_viewer"
STATIC = SRC / "static"
TESTDATA = ROOT / "tests" / "testdata"
PACKS = {
    "receipt": SRC / "receipt" / "wording-en.json",
    "kit": SRC / "kit" / "wording-en.json",
    "history": SRC / "history" / "wording-en.json",
    "rules": SRC / "rules" / "wording-en.json",
}
SCRIPTS = ("receipt_core.js", "receipt_unilateral.js", "receipt_seller.js", "receipt_bilateral.js", "history_card.js")
PLACEHOLDER = re.compile(r"\{[a-z_]+\}")


def _pack(name: str) -> dict:
    return json.loads(PACKS[name].read_text(encoding="utf-8"))


# ---- acceptance 1: no person-facing string literal in the module JS -------------------

STRUCTURAL = "structural: a directive, a type, field or component name, a value token or an escape; never shown as words"
THROWN = "thrown, never shown: the module declines (canRender is false) or a programming error stops the render"
VERIFIER = (
    "verification state: what the verifier reported (its name, its checks), as the Python twin's verifier_report "
    "names it; a pack must not change it (acceptance 2)"
)
FINDING = (
    "verification state: a finding of the History check, the Python twin's (recompute.check) word for word, shown "
    "with its code; a pack must not change it (acceptance 2)"
)
KIT_REFUSAL = "diagnostic: the kit's refusal of a value outside its closed vocabulary, as the Python kit's _refusal"

# Every literal with a letter in it that is not a token, and why it stays in the code.
ALLOWED: dict[str, str] = {
    "use strict": STRUCTURAL,
    "None": STRUCTURAL,  # Python's str() of a JSON null, a value in the model
    "True": STRUCTURAL,
    "False": STRUCTURAL,
    "ReceiptUnavailable": STRUCTURAL,
    "NotCanonical": STRUCTURAL,
    "DisclosureBadge": STRUCTURAL,
    "VerificationDetails": STRUCTURAL,
    "composedDigest": STRUCTURAL,
    "compositionClosure": STRUCTURAL,
    "refusalSignature": STRUCTURAL,
    "\\n": STRUCTURAL,
    "\\r": STRUCTURAL,
    "\\t": STRUCTURAL,
    "\x00intent.verbatim_commitment": STRUCTURAL,
    "\x00text_commitment": STRUCTURAL,
    # The page's verifier and its checks.
    "the page's verifier (agent-action-capsule)": VERIFIER,
    "graph closure": VERIFIER,
    "interval coverage": VERIFIER,
    "per record membership": VERIFIER,
    # The kit's refusal.
    " refused ": KIT_REFUSAL,
    "state must be one of ": KIT_REFUSAL,
    "outcome must be one of ": KIT_REFUSAL,
    # The History check's findings.
    "no ": FINDING,
    " block in an evidence-bundle/v2": FINDING,
    "asserted_result carries values nothing recomputes: ": FINDING,
    ": recomputed ": FINDING,
    " != asserted ": FINDING,
    "the check could not read this file: ": FINDING,
    # JCS, UTF-8, the word filler, the kit's tables and sections, the module factory.
    "a string holds a lone surrogate": THROWN,
    "a JSON float has no canonical form in this profile": THROWN,
    "integer ": THROWN,
    " is outside +/-": THROWN,
    " is not a JSON value": THROWN,
    "no value for {": THROWN,
    "} in ": THROWN,
    "section level must be 2, 3 or 4, got ": THROWN,
    "data_table row ": THROWN,
    " has ": THROWN,
    " cells for ": THROWN,
    " columns": THROWN,
    "no receipt module ": THROWN,
    # Why a receipt module declines a copy (ReceiptUnavailable: canRender is false, nothing is shown).
    "the page's runtime offers no verifier for a carried copy": THROWN,
    "the x-deal-v0 extension names no sealed report": THROWN,
    "disclosed deal reports are not exactly the named one, ": THROWN,
    "the sealed report carries no report object": THROWN,
    "the sealed report names no audience": THROWN,
    "the bundle did not verify": THROWN,
    "this copy was cut for ": THROWN,
    ", not ": THROWN,
    "the copy does not engage ": THROWN,
    "the copy engages ": THROWN,
    " and its sealed records show side ": THROWN,
    ", not seller": THROWN,
    "the page's verifier names a composed/v1 block and carries no result for it": THROWN,
    "the composition did not pass": THROWN,
    "a bilateral receipt is exactly two carried copies": THROWN,
    "a carried copy's digest was not reproduced": THROWN,
    "the two copies are not from two observers": THROWN,
    "the report does not give one corroboration result per join": THROWN,
    "no composed/v1 result was reported for this bundle": THROWN,
    "the verifier assesses no carried bundle for a member": THROWN,
    "a carried copy could not be verified: ": THROWN,
    "the bundle does not carry the two copies its report assessed": THROWN,
    " is sealed as a seller's copy and does not engage the seller kind": THROWN,
    "a page does not show copies cut for ": THROWN,
    "a seller's copy is the seller receipt's": THROWN,
}

TOKEN = re.compile(r"[a-z0-9_.:/@+#-]*")  # a key, an id, a kind, a class name, a lowercase value token
CAPS = re.compile(r"[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]{3}|L[0-2]|PASS|FAIL")  # NOT_CHECKED, a currency, a depth
CLASSES = re.compile(r"cv-[a-z0-9_-]+")


def person_facing(text: str) -> bool:
    """A literal that may be words for a person: it has a letter in it and is
    not a token, a CAPS enum token or a list of kit class names. (A single
    lowercase word passes as a token: the scripts' tokens are such words.)"""
    if not re.search(r"[^\W\d_]", text):
        return False
    if TOKEN.fullmatch(text) or CAPS.fullmatch(text):
        return False
    return not all(CLASSES.fullmatch(part) for part in text.split())


def flagged(source: str) -> list[tuple[int, str]]:
    return [(line, text) for line, text in literals(blank_generated(source)) if person_facing(text)]


@pytest.mark.parametrize("name", SCRIPTS)
def test_acceptance_1_no_person_facing_literal_in_the_module_js(name):
    hits = [(line, text) for line, text in flagged((STATIC / name).read_text(encoding="utf-8")) if text not in ALLOWED]
    assert hits == []


def test_acceptance_1_the_allowlist_holds_only_literals_the_scripts_still_have():
    found = {text for name in SCRIPTS for _, text in flagged((STATIC / name).read_text(encoding="utf-8"))}
    assert sorted(set(ALLOWED) - found) == []


def test_acceptance_1_the_grep_finds_words_put_back_in_the_code():
    script = (STATIC / "history_card.js").read_text(encoding="utf-8")
    for planted in ('el(doc, "h2", {}, ["Integrity checked"])', "var LABEL = 'Not a shareable History';", 'x + " to " + y'):
        mutant = script.replace('  "use strict";\n', f'  "use strict";\n  {planted}\n', 1)
        assert [t for _, t in flagged(mutant) if t not in ALLOWED], planted
    # A pack entry, any pack, put back as a literal is flagged unless it is a bare token.
    for name in PACKS:
        for text in _pack(name)["entries"].values():
            if not TOKEN.fullmatch(text) and re.search(r"[^\W\d_]", text):
                assert person_facing(text) or CAPS.fullmatch(text), (name, text)


def test_acceptance_1_the_generated_lines_carry_only_the_packs_and_data():
    for name in SCRIPTS:
        source = (STATIC / name).read_text(encoding="utf-8")
        names = re.findall(r"^  var (\w+) = .*; // @generated \1$", source, re.MULTILINE)
        expected = ["PACK_TEXT", "VERSION"] if name == "history_card.js" else ["KIND", "MANIFEST", "PACK_TEXT", "KIT_PACK_TEXT", "VERSION", "KIT_CSS", "SELLER_KIND"]
        assert names == expected, name


# ---- acceptance 3: wording_sha256 and renderer_version in the model ------------------------


def _modules(pack, audience, assurance):
    return {
        "unilateral": UnilateralReceiptModule(pack, "L0", audience, assurance, check_opening),
        "seller": SellerReceiptModule(pack, "L0", audience, assurance, check_opening),
    }


@pytest.mark.parametrize("name,kind", [("keep", "unilateral"), ("seller-keep", "seller")])
def test_acceptance_3_a_python_model_records_the_packs_sha256_and_the_renderer(name, kind):
    data = PACKS["receipt"].read_bytes()
    pack = load_wording_pack(data, hashlib.sha256(data).hexdigest(), PLACEHOLDERS)
    context, assurance = context_from_capsulectl(*load(name))
    module = _modules(pack, "keep", assurance)[kind]
    model = module.buildModel(context)
    assert model.wording_sha256 == hashlib.sha256(data).hexdigest() == pack.wording_sha256
    assert model.renderer_version == f"capsuleviewer.receipt.{kind}/v0@{VERSION}" == renderer_version(module.manifest_json["id"])
    # A model nested in another is not a page: it records neither.
    if kind == "seller":
        assert model.receipt.wording_sha256 is None and model.receipt.renderer_version is None


def test_acceptance_3_the_bilateral_model_records_them_too():
    data = PACKS["receipt"].read_bytes()
    pack = load_wording_pack(data, hashlib.sha256(data).hexdigest(), PLACEHOLDERS)
    bundle, output = load("bilateral-keep")
    context, assurance = context_from_capsulectl(bundle, output)
    module = BilateralReceiptModule(pack, "L0", "keep", assurance, composition_from_capsulectl(bundle, output), check_opening)
    model = module.buildModel(context)
    assert model.wording_sha256 == hashlib.sha256(data).hexdigest()
    assert model.renderer_version == f"capsuleviewer.receipt.bilateral/v0@{VERSION}"
    assert all(p.receipt.wording_sha256 is None for p in model.parties)


def test_the_version_is_pyprojects():
    pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    assert re.search(r'^version = "([^"]+)"$', pyproject, re.MULTILINE).group(1) == VERSION


# ---- acceptance 4: the T8 banned-word grep runs over the packs -----------------------------

T8 = json.loads((TESTDATA / "history" / "t8-banned.json").read_text(encoding="utf-8"))
T8_PATTERNS = {p: re.compile(r"\b" + re.escape(p) + r"\b", re.IGNORECASE) for p in T8["banned_deal_status"]["phrases"]}
T8_PATTERNS.update({p: re.compile(p, re.IGNORECASE) for p in T8["similarity_claim"]["patterns"]})
# T8 is the History Basic wording rule (FR-7a, FR-7b). The receipt pack's own
# words are not History words: these two say "done" and "delivered" of what a
# deal receipt shows and does not prove, never as a History deal's status.
T8_OUTSIDE_HISTORY = {("receipt", "depth.l1", "done"), ("receipt", "claims.merchant", "delivered")}


def t8_pack_hits() -> set[tuple[str, str, str]]:
    return {
        (name, key, label)
        for name in PACKS
        for key, text in _pack(name)["entries"].items()
        for label, rx in T8_PATTERNS.items()
        if rx.search(text)
    }


def test_acceptance_4_t8_runs_over_every_pack_and_the_history_pack_is_clean():
    assert T8["banned_deal_status"]["phrases"] == ["done", "completed sale", "delivered"]
    hits = t8_pack_hits()
    assert {h for h in hits if h[0] in ("history", "kit")} == set()
    assert hits == T8_OUTSIDE_HISTORY
    # And over the pack bytes as a file, line by line, as the module grep reads files.
    lines = PACKS["history"].read_text(encoding="utf-8").splitlines()
    assert len(lines) > 100
    assert [line for line in lines for rx in T8_PATTERNS.values() if rx.search(line)] == []


def test_acceptance_4_the_grep_would_find_a_banned_word_put_in_a_pack():
    entries = dict(_pack("history")["entries"])
    entries["l0.completed"] = "deals done"
    entries["lead"] = "Copies of deals similar to this one."
    found = {label for text in entries.values() for label, rx in T8_PATTERNS.items() if rx.search(text)}
    assert "done" in found and r"\bsimilar" in found


# ---- acceptance 5: no pack's words are sealed in any record --------------------------------


def pack_phrases() -> dict[str, tuple[str, str]]:
    """Each pack entry, and each run of it between placeholders, that is words
    (it has a space, a capital or a non-ASCII character: not a bare token) ->
    (pack, key)."""
    out: dict[str, tuple[str, str]] = {}
    for name in PACKS:
        for key, text in _pack(name)["entries"].items():
            for part in [text, *PLACEHOLDER.split(text)]:
                part = part.strip(" ,.:;()")
                if part and (re.search(r"[A-Z ]", part) or not part.isascii()):
                    out.setdefault(part, (name, key))
    return out


def _strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for k, v in value.items():
            yield k
            yield from _strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from _strings(v)


def sealed_pack_words(bundle: dict) -> list[tuple[str, str, str]]:
    """Every pack phrase a bundle holds: a string (a member name or a value, in
    a record, a disclosed payload or a carried copy) that is a pack phrase, or
    that has a pack phrase of six words or more inside it. A record carries
    data; presentation words are never sealed (contract 7.3)."""
    phrases = pack_phrases()
    long_phrases = {p: v for p, v in phrases.items() if len(p.split()) >= 6}
    hits = []
    for text in _strings(bundle):
        stripped = text.strip()
        if stripped in phrases:
            hits.append((*phrases[stripped], stripped))
        hits.extend((*where, phrase) for phrase, where in long_phrases.items() if phrase in text)
    return hits


BUNDLES = sorted(TESTDATA.rglob("*.bundle.json"))


def test_acceptance_5_every_fixture_bundle_is_scanned():
    assert len(BUNDLES) >= 37
    assert {p.parent.name for p in BUNDLES} == {"receipt", "history"}
    assert len(pack_phrases()) > 300


@pytest.mark.parametrize("path", BUNDLES, ids=lambda p: p.name)
def test_acceptance_5_no_pack_words_are_sealed_in_any_fixture(path):
    assert sealed_pack_words(json.loads(path.read_text(encoding="utf-8"))) == []


def test_acceptance_5_a_mutant_sealing_a_history_label_is_caught():
    bundle = json.loads((TESTDATA / "history" / "history-history.bundle.json").read_text(encoding="utf-8"))
    label = HISTORY_PACK.get("page_state.integrity_checked")

    def seal(agent_input: dict) -> None:
        agent_input["status_label"] = label

    mutant = reseal_selection(bundle, seal)
    # It is re-sealed: the selection record recomputes over the label, so only this guard sees it.
    assert recompute.check(mutant)["properties"]["selection_record"] == "PASS"
    assert sealed_pack_words(bundle) == []
    assert ("history", "page_state.integrity_checked", label) in sealed_pack_words(mutant)


def test_acceptance_5_a_mutant_sealing_receipt_and_kit_words_in_a_deal_report_is_caught():
    bundle, _ = load("keep")
    pointer = bundle["extensions"]["x-deal-v0"]["sealed_report"]
    mutant = json.loads(json.dumps(bundle))
    report = mutant["disclosures"][pointer]["agent_input"]["report"]
    report["state_label"] = _pack("receipt")["entries"]["l0.state"]
    report["note"] = "Verified. " + KIT_PACK.get("composed.scope")
    _reseal_records(mutant, {pointer})
    hits = {(name, key) for name, key, _ in sealed_pack_words(mutant)}
    assert ("receipt", "l0.state") in hits and ("kit", "composed.scope") in hits


# ---- pack parity: the Python twins read the same packs ----------------------------------


def test_the_kit_and_the_composition_section_are_worded_by_the_kit_pack():
    entries = _pack("kit")["entries"]
    assert {s: label for s, (label, _) in DISCLOSURE_STATES.items()} == {s: entries[f"kit.disclosure.{s}"] for s in DISCLOSURE_STATES}
    assert {o: label for o, (label, _) in VERIFICATION_OUTCOMES.items()} == {o: entries[f"kit.outcome.{o}"] for o in VERIFICATION_OUTCOMES}
    assert (SCOPE, CUSTODY, NOT_APPLICABLE) == (entries["composed.scope"], entries["composed.custody"], entries["composed.not_applicable"])
    assert KIT_PACK.wording_sha256 == hashlib.sha256(PACKS["kit"].read_bytes()).hexdigest()


def test_the_history_twin_reads_its_l0_words_from_the_history_pack():
    entries = _pack("history")["entries"]
    assert recompute.L0_TITLE == entries["l0.title"]
    assert recompute.L0_DEALS == (entries["l0.deals.one"], entries["l0.deals.other"])
    assert (recompute.L0_COMPLETED, recompute.L0_FAILED) == (entries["l0.completed"], entries["l0.failed"])
    assert recompute.MONTHS == tuple(entries[f"period.month.{m}"] for m in range(1, 13))
    assert HISTORY_PACK.wording_sha256 == hashlib.sha256(PACKS["history"].read_bytes()).hexdigest()


@pytest.mark.parametrize("name", ["kit", "history"])
def test_each_new_pack_is_a_wording_pack_in_english(name):
    raw = _pack(name)
    assert raw["wording_pack_version"] == "aac.wording-pack/v0" and raw["locale"] == "en"
    assert raw["id"] == f"capsuleviewer.{name}.wording.example-en/v0"
    # As the receipt pack is distributed: two-space JSON, UTF-8, a closing newline.
    assert PACKS[name].read_bytes() == (json.dumps(raw, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
