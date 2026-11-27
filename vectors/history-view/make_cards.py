# SPDX-License-Identifier: Apache-2.0
"""Writes the History view's card-page vectors (#384) into cases.json and refusals.json.

A card page carries its signed object, so each vector embeds a bundle. These
bundles are synthetic and small: they hold only what the view reads (the root
record's id, key and time, the card it discloses, and capsulectl's
x-standard-history/v0 block). The view draws and never verifies signatures, so
a synthetic bundle exercises it fully; the binding to capsulectl's answer is
the SHA-256 of the object's canonical JSON, which is computed here. The cards
and deal entries come from AAC's standard_history/3 vector `outcomes-from-rows`
(tests/testdata/standard-history/aac/vectors-3.json) and the real /1 fixture
person-own (tests/testdata/standard-history/). A test with a real capsulectl
bundle and its real verify output is in ts/test/history-view-card.test.ts.

    python3 vectors/history-view/make_cards.py
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SH = ROOT / "tests" / "testdata" / "standard-history"
KEY = "5b0d2c1f0a9e8d7c6b5a49382716051f4e3d2c1b0a99887766554433221100ff"


def jcs(value) -> str:
    """Canonical JSON (RFC 8785) for these documents: strings, integers, objects and lists only."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def bundle(card: dict, block: dict, signed_at: str) -> tuple[str, str]:
    cid = hashlib.sha256(jcs(card).encode()).hexdigest()
    doc = {"records": [{"capsule_id": cid, "key_id": KEY, "timestamp": signed_at}],
           "disclosures": {cid: {"agent_input": card}},
           "extensions": {"x-standard-history/v0": block}}
    text = jcs(doc)
    return text, hashlib.sha256(text.encode()).hexdigest()


def verify(digest: str, *, verdict="VALID", witness=None, **checks) -> dict:
    out = {"verdict": verdict, "bundle_digest": digest,
           "checks": {"producer_signatures": "pass", "interval_coverage": "pass", "graph_closure": "pass",
                      "per_record_membership": "pass", "checkpoint": "pass", "witnesses": "withheld"}}
    out["checks"].update(checks)
    if witness:
        out["checks"]["witnesses"] = "pass"
        out["witness"] = witness
    return out


def base(reader: str, name: str) -> dict:
    return {"view": "history-view/v0", "kind": "deal", "surface": "neutral", "reader": reader,
            "holder": {"name": name}, "audience": {"kind": "private" if reader == "owner" else "shared"},
            "built_at": "2026-11-27T03:15:00Z",
            "checked": {"where": "builder", "by": "capsulectl verify, on the card this page carries"},
            "rows": [], "checks": []}


def main() -> None:
    v3 = json.loads((SH / "aac" / "vectors-3.json").read_text())
    case = next(c for c in v3["cases"] if c["id"] == "outcomes-from-rows")["inputs"]
    card3 = copy.deepcopy(case["card"])
    deals3 = copy.deepcopy(case["deals"])
    for d in deals3:  # the view reads no member AAC's entry has beyond these
        for row in d.get("rows", []):
            row.pop("local", None)
    as_of = {"anchor": card3.get("anchor", "0" * 64), "anchor_time": "2026-11-27T03:12:00Z",
             "first_checkpoint_time": "2026-09-01T00:00:00Z"}
    own1 = json.loads((SH / "person-own.bundle.json").read_text())
    card1 = own1["disclosures"][own1["records"][0]["capsule_id"]]["agent_input"]
    block1 = own1["extensions"]["x-standard-history/v0"]
    witness = {"by": "Action State's witness", "at": "2026-11-27T03:13:00Z"}

    cases, refusals = {}, {}
    # Their History: the counts-only card someone was sent.
    text, digest = bundle(card3, {"as_of": as_of, "policy": case.get("policy", {})}, "2026-11-27T03:12:30Z")
    theirs = base("recipient", "Alder Print Co.") | {
        "sample": 10, "machine": {"file": "alder-history-card.json", "text": text, "verify": verify(digest, witness=witness)}}
    cases["card-theirs"] = theirs
    cases["card-theirs-failed"] = base("recipient", "Alder Print Co.") | {
        "machine": {"file": "alder-history-card.json", "text": text,
                    "verify": verify(digest, verdict="INVALID", checkpoint="fail")}}
    t1, d1 = bundle(card1, {k: v for k, v in block1.items() if k != "deals"}, "2026-10-01T09:00:00Z")
    cases["card-theirs-v1-unwitnessed"] = base("recipient", "Kestrel Print") | {
        "machine": {"file": "kestrel.json", "text": t1, "verify": verify(d1)}}

    # Your History: the holder's own copy, one row per deal entry.
    own_text, own_digest = bundle(card3, {"as_of": as_of, "policy": case.get("policy", {}), "deals": deals3},
                                  "2026-11-27T03:12:30Z")
    ids = [d["deal"] for d in deals3]
    extras = {
        ids[0]: {"item": "200 conference badges, delivered by Friday",
                 "amount": {"value": "1000000", "assetCode": "BTC", "assetScale": 11},
                 "recorded": {"state": "passed", "at": "2026-11-27T03:12:00Z"},
                 "time_stamped": {"state": "passed", "by": "Action State's witness", "at": "2026-11-27T03:13:00Z"},
                 "countersigned": {"state": "not_checked"},
                 "receipt": "maya-receipt-deal-301.html"},
        ids[3]: {"item": "Logo stickers",
                 "recorded": {"state": "passed", "at": "2026-11-27T03:12:00Z", "through": {"k": 3, "n": 5}},
                 "time_stamped": {"state": "none"}},
        ids[6]: {"recorded": {"state": "none"}, "time_stamped": {"state": "failed"},
                 "countersigned": {"state": "passed", "by": "Ledger Notary", "at": "2026-11-20T10:00:00Z"}},
    }
    yours = base("owner", "Maya") | {
        "machine": {"file": "maya-history-card.json", "text": own_text, "verify": verify(own_digest, witness=witness)},
        "deals": extras}
    cases["card-yours"] = yours
    empty_card = copy.deepcopy(card3)
    empty_card["outcomes"] = {"of": 0, "held": 0, "did_not_hold": 0, "undecided": 0}
    et, ed = bundle(empty_card, {"as_of": as_of, "policy": {}, "deals": []}, "2026-11-27T03:12:30Z")
    cases["card-yours-empty"] = base("owner", "Maya") | {
        "machine": {"file": "maya-history-card.json", "text": et, "verify": verify(ed)}}
    final = [dict(deals3[0], deal="deal-final", rows=[
        {"owed_by": "holder", "status": "uncontested", "value": "met"},
        {"owed_by": "counterparty", "status": "ruled", "value": "met", "remedy": "none"}])]
    ft, fd = bundle(card3, {"as_of": as_of, "policy": case.get("policy", {}), "deals": final}, "2026-11-27T03:12:30Z")
    cases["card-yours-final-terms"] = base("owner", "Maya") | {
        "machine": {"file": "maya-history-card.json", "text": ft, "verify": verify(fd)},
        "deals": {"deal-final": {"amount": {"value": "999", "assetCode": "BTC", "assetScale": 11},
                                 "recorded": {"state": "passed", "at": "2026-11-27T03:12:00Z", "through": {"k": 1, "n": 2}}}}}
    ot1, od1 = bundle(card1, block1, "2026-10-01T09:00:00Z")
    cases["card-yours-v1"] = base("owner", "Rowan") | {
        "machine": {"file": "rowan-card.json", "text": ot1, "verify": verify(od1, witnesses="fail")}}

    # Refusals.
    def refused(name, value):
        refusals[name] = value
    other_text, _ = bundle(card1, {k: v for k, v in block1.items() if k != "deals"}, "2026-10-01T09:00:00Z")
    refused("card-answer-for-another-bundle", base("recipient", "Alder Print Co.") | {
        "machine": {"file": "a.json", "text": other_text, "verify": verify(digest)}})
    refused("card-theirs-carries-deals", base("recipient", "Alder Print Co.") | {
        "machine": {"file": "a.json", "text": own_text, "verify": verify(own_digest)}})
    refused("card-yours-without-deals", base("owner", "Maya") | {
        "machine": {"file": "a.json", "text": text, "verify": verify(digest)}})
    refused("card-receipt-not-a-file-name", yours | {"deals": {ids[0]: {"receipt": "javascript:alert(1)//x.html"}}})
    refused("card-receipt-path", yours | {"deals": {ids[0]: {"receipt": "../other/x.html"}}})
    refused("card-file-not-plain", theirs | {"machine": theirs["machine"] | {"file": "card\".json"}})
    refused("card-extra-for-unknown-deal", yours | {"deals": {"deal-999": {"item": "x"}}})
    refused("card-deals-on-their-card", theirs | {"deals": {}})
    refused("card-rows-given", theirs | {"rows": [{"kind": "deal"}]})
    refused("card-witness-without-time", theirs | {"machine": theirs["machine"] | {
        "verify": verify(digest) | {"checks": verify(digest)["checks"] | {"witnesses": "pass"}}}})

    path = HERE / "cases.json"
    doc = json.loads(path.read_text())
    doc["cases"] = {k: v for k, v in doc["cases"].items() if not k.startswith("card-")} | cases
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    # A refusal's reasons are the view's own; fill_card_reasons.mjs writes them from the TypeScript view,
    # and the view is then held to them.
    path = HERE / "refusals.json"
    doc = json.loads(path.read_text())
    old = {c["name"]: c.get("reasons") for c in doc["cases"]}
    doc["cases"] = [c for c in doc["cases"] if not c["name"].startswith("card-")] + [
        {"name": k, "input": v, "reasons": old.get(k) or []} for k, v in refusals.items()]
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
