# SPDX-License-Identifier: Apache-2.0
"""The History Card's mutants, each one edit of the real history History that
``cut_fixtures.sh`` wrote (``--audience history``: every record's payload
withheld).

    PYTHONPATH=src python3 examples/history/make_mutants.py HISTORY OTHER SECOND KEEP SHARED OUT_DIR

HISTORY is the history History of the closed, private and floor deals; OTHER
is a History of one more deal of the same holder (same key, not picked);
SECOND is a History of one deal of a second profile (another key); KEEP is the
keep History of the same three deals; SHARED is the counterparty copy of the
private deal that ``capsulectl disclose --share counterparty`` wrote. Writes
into OUT_DIR:

* ``mutant-flipped-status.bundle.json``: the closed deal's pay act says its
  effect failed where the real copy says dispatched (the one value a history
  copy shows about an act); its record no longer recomputes to its id and the
  selection still names the real copy's digest;
* ``mutant-mixed-signer.bundle.json``: the second profile's deal spliced in
  beside the picked deals (records signed by another key);
* ``mutant-not-in-selection.bundle.json``: the holder's own unpicked deal
  spliced in beside the picked deals (same key, not in the sealed selection);
* ``mutant-selection-not-root.bundle.json``: the outer bundle's ``root``
  names another capsule id, so the selection record is not its root;
* ``mutant-not-history-log.bundle.json``: the outer bundle's completeness
  certificate names a deal's log (``deal-...``), not ``deal-history``;
* ``mutant-payload-disclosed.bundle.json``: the closed deal's history copy
  with one record's payload disclosed, taken from the keep copy of the same
  record (capsulectl verify: ``deal_payload_disclosed``);
* ``mutant-counterparty-member.bundle.json``: the private deal's history copy
  replaced by its counterparty copy (a member for another audience, which
  discloses payloads);
* ``mutant-audience-not-history.bundle.json``: the sealed selection's
  audience set to ``counterparty`` and the selection record re-sealed over it
  (capsulectl verify: ``selection_audience_not_history``). Its record id
  changes, so its signature and its log membership no longer hold either.

Only the last re-seals anything (``capsule_viewer.history.fixture``); no
mutant is re-signed.
"""
from __future__ import annotations

import copy
import json
import re
import sys
from pathlib import Path

from capsule_viewer.history.fixture import reseal_selection

EXT = "x-history-selection/v0"


def _load(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _only_deal(history: dict) -> tuple[str, dict]:
    (deal_id, member), = history["extensions"][EXT]["deals"].items()
    return deal_id, member


def _deal_with_status(history: dict, status: str) -> tuple[str, dict]:
    """The first selected deal (selection order) with a record whose effect says *status*."""
    deals = history["extensions"][EXT]["deals"]
    for entry in history["extensions"][EXT]["selection"]:
        for record in deals[entry["deal_id"]]["records"]:
            if (record.get("effect") or {}).get("status") == status:
                return entry["deal_id"], record
    raise SystemExit(f"no record says effect.status {status!r}")


def flipped_status(history: dict) -> dict:
    out = copy.deepcopy(history)
    _, record = _deal_with_status(out, "dispatched")
    record["effect"]["status"] = "failed"
    return out


def spliced(history: dict, donor: dict) -> dict:
    out = copy.deepcopy(history)
    deal_id, member = _only_deal(donor)
    deals = out["extensions"][EXT]["deals"]
    if deal_id in deals:
        raise SystemExit(f"{deal_id} is already carried")
    deals[deal_id] = copy.deepcopy(member)
    return out


def selection_not_root(history: dict) -> dict:
    out = copy.deepcopy(history)
    if out["root"] != out["extensions"][EXT]["selection_record"]:
        raise SystemExit("the selection record is not the root of the History as cut")
    out["root"] = "0" * 64
    return out


def not_history_log(history: dict) -> dict:
    out = copy.deepcopy(history)
    cert = out["completeness_certificate"]
    if cert["log_id"] != "deal-history":
        raise SystemExit(f"the History as cut is on log {cert['log_id']!r}, not deal-history")
    cert["log_id"] = next(iter(out["extensions"][EXT]["deals"]))
    return out


def payload_disclosed(history: dict, keep: dict) -> dict:
    out = copy.deepcopy(history)
    deal_id, record = _deal_with_status(out, "dispatched")
    member = out["extensions"][EXT]["deals"][deal_id]
    kept = keep["extensions"][EXT]["deals"][deal_id]
    disclosed = (kept.get("disclosures") or {}).get(record["capsule_id"])
    if not disclosed or "agent_input" not in disclosed:
        raise SystemExit(f"the keep copy of {deal_id} discloses no payload of {record['capsule_id']}")
    if any(member.get("disclosures", {}).values()):
        raise SystemExit(f"the history copy of {deal_id} already discloses a payload")
    member.setdefault("disclosures", {})[record["capsule_id"]] = copy.deepcopy(disclosed)
    return out


def counterparty_member(history: dict, shared: dict) -> dict:
    out = copy.deepcopy(history)
    # A shared copy is of the deal's log ("deal/<deal id>" as disclose names it).
    found = re.search(r"deal-[0-9a-f]{16}", shared["completeness_certificate"]["log_id"])
    deal_id = found.group(0) if found else ""
    deals = out["extensions"][EXT]["deals"]
    if deal_id not in deals:
        raise SystemExit(f"the shared copy is of {deal_id}, which the History does not carry")
    deals[deal_id] = copy.deepcopy(shared)
    return out


def audience_not_history(history: dict) -> dict:
    return reseal_selection(history, lambda sealed: sealed.update(audience="counterparty"))


def main(argv: list[str]) -> int:
    history, other, second, keep, shared, out_dir = argv
    base = _load(history)
    files = {
        "mutant-flipped-status": flipped_status(base),
        "mutant-mixed-signer": spliced(base, _load(second)),
        "mutant-not-in-selection": spliced(base, _load(other)),
        "mutant-selection-not-root": selection_not_root(base),
        "mutant-not-history-log": not_history_log(base),
        "mutant-payload-disclosed": payload_disclosed(base, _load(keep)),
        "mutant-counterparty-member": counterparty_member(base, _load(shared)),
        "mutant-audience-not-history": audience_not_history(base),
    }
    for name, value in files.items():
        Path(out_dir, f"{name}.bundle.json").write_text(json.dumps(value, separators=(",", ":")), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
