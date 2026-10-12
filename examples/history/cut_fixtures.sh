#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Cut the History Card fixtures with a real capsulectl (capsule-cli PR #209's
# `deal history`), on scratch profiles, and record what `capsulectl verify`
# says about each file.
#
#   examples/history/cut_fixtures.sh CAPSULECTL CAPSULE_CLI_CHECKOUT
#
# CAPSULECTL is a capsulectl binary built from the capsule-cli commit named in
# tests/testdata/history/README.md; CAPSULE_CLI_CHECKOUT is that commit's
# source tree (the retail demo inputs and the neutral materiality predicate
# are read from it). Nothing outside a fresh temporary directory and
# tests/testdata/history/ is written.
#
# The deals are the ones capsule-cli's own deal_history_test.go makes:
#   closed  - a retail deal paid and closed (the demo's open, check, pay, close);
#   private - a purchase whose baseline holds a home address, a card number, a
#             code and the shop's contact details, with a counterparty copy and
#             an adjudicator copy shared (each seals its report) and the
#             holder's own copy written last;
#   floor   - a seller's deal with a price floor;
#   other   - one more retail deal, never picked into the shareable History;
# and, on a second profile (a second key), one retail deal.
#
# Files written (tests/testdata/history/):
#   history-counterparty.bundle.json   closed + private + floor, --audience counterparty (the default)
#   history-adjudicator.bundle.json    the same deals, --audience adjudicator
#   history-keep.bundle.json           the same deals, --audience keep (the holder's own copy)
#   mutant-*.bundle.json               the counterparty History edited (make_mutants.py)
#   verify/<name>.json                 `capsulectl verify --bundle` on each file, as printed
#   cut.json                           the deal ids, the holder keys and the private values used
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: $0 CAPSULECTL CAPSULE_CLI_CHECKOUT" >&2
  exit 2
fi
C="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
CLI="$(cd "$2" && pwd)"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/tests/testdata/history"
DEMO="$CLI/skills/deal/demo/retail-checkout"
MATERIALITY="$CLI/skills/deal/profile/materiality-predicate/neutral.json"
PY="${PYTHON:-python3}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export XDG_CONFIG_HOME="$WORK/config"
export CAPSULE_DEAL_CHECK_URL=""
cd "$WORK"

field() { "$PY" -c 'import json,sys; print(json.load(sys.stdin)[sys.argv[1]])' "$1"; }
deal() { "$C" --profile "$PROFILE" deal "$@"; }
json() { printf '%s' "$2" > "$WORK/$1.json"; echo "$WORK/$1.json"; }

retail_deal() {
  local id
  id=$(deal open --input "$DEMO/open.json" | field deal_id)
  deal check --deal "$id" --input "$DEMO/check-pay.json" >/dev/null
  deal note --deal "$id" --kind act --input "$DEMO/act-pay.json" >/dev/null
  echo "$id"
}

# The private values: capsule-cli's deal_share_test.go openPrivateDeal.
ADDRESS="41 Larkspur Lane, Apt 3, Springfield"
CARD="4111 1111 1111 1111"
CODE="739142"
EMAIL="orders@stickers.example"
PHONE="+1 555 010 7788"
SHOP="Sticker Shop Ltd"

private_deal() {
  local id check verdict
  id=$(deal open --input "$(json private-open '{"type":"purchase","channel":"web",
    "intent":{"verbatim":"Buy the sticker, ship it to '"$ADDRESS"', pay with card '"$CARD"', the code they texted me is '"$CODE"'","allowed":["pay","commit"]},
    "who":{"name":"'"$SHOP"'","domain":"stickers.example","email":"'"$EMAIL"'","phone":"'"$PHONE"'"},
    "terms":{"item":"sticker","price_minor":627,"currency":"USD","place":"'"$ADDRESS"'"},
    "claims":[{"text":"order held under code '"$CODE"'","source":"checkout page","source_kind":"merchant"}],
    "recourse":{"rail":"card","refundable":true}}')" | field deal_id)
  deal note --deal "$id" --kind message --input "$(json private-msg '{"from":"counterparty","channel":"web","text":"Your verification code is '"$CODE"'. Card on file 4111-1111-1111-1111, shipping to '"$ADDRESS"'."}')" >/dev/null
  check=$(deal check --deal "$id" --input "$(json private-check '{"action":"pay","amount_minor":627,"authorized_max_minor":627,"recourse":{"rail":"card","refundable":true}}')")
  verdict=$(printf '%s' "$check" | field verdict)
  if [ "$verdict" = "pause" ]; then
    deal note --deal "$id" --kind approval --check "$(printf '%s' "$check" | field check_id)" --choice proceed >/dev/null
  fi
  deal note --deal "$id" --kind act --input "$(json private-pay '{"action":"pay","amount_minor":627,"payee":"'"$SHOP"'","rail":"card","reference":"card '"$CARD"'"}')" >/dev/null
  echo "$id"
}

# ---- the holder's profile -------------------------------------------------------
PROFILE=holder
HOLDER_KEY=$("$C" deal init --profile holder --dir "$WORK/holder" --no-witness --materiality "$MATERIALITY" | field public_key)

CLOSED=$(retail_deal)
deal close --deal "$CLOSED" --input "$(json close '{"status":"received","delivered":{"item":"cat sticker"}}')" >/dev/null
PRIVATE=$(private_deal)
"$C" --profile holder disclose --deal "$PRIVATE" --share counterparty --to "the shop" --out "$WORK/shared-cp.json" >/dev/null
"$C" --profile holder disclose --deal "$PRIVATE" --share adjudicator --to "the card issuer" --out "$WORK/shared-adj.json" >/dev/null
"$C" --profile holder bundle --deal "$PRIVATE" --out "$WORK/own.json" >/dev/null
FLOOR=$(deal open --records typed --input "$(json floor '{"type":"purchase","demo":true,"channel":"web",
  "intent":{"verbatim":"Sell my example bicycle; ask 1900, go down to 1700","party_role":"seller",
            "min_total_minor":170000,"asked":{"item":"example bicycle","quantity":1},"allowed":["commit"]},
  "who":{"name":"Example Buyer","domain":"buyer.example"},
  "terms":{"item":"example bicycle","quantity":1,"price_minor":190000,"currency":"USD"},
  "recourse":{"rail":"card","refundable":false}}')" | field deal_id)
OTHER=$(retail_deal)

history() { # NAME AUDIENCE DEAL...
  local name=$1 audience=$2
  shift 2
  local args=()
  for id in "$@"; do args+=(--deal "$id"); done
  deal history --audience "$audience" --out "$WORK/$name.json" "${args[@]}" >/dev/null
}
history history-counterparty counterparty "$CLOSED" "$PRIVATE" "$FLOOR"
history history-adjudicator adjudicator "$CLOSED" "$PRIVATE" "$FLOOR"
history history-keep keep "$CLOSED" "$PRIVATE" "$FLOOR"
history other-counterparty counterparty "$OTHER"

# ---- a second profile: a second key ---------------------------------------------
PROFILE=second
SECOND_KEY=$("$C" deal init --profile second --dir "$WORK/second" --no-witness --materiality "$MATERIALITY" | field public_key)
SECOND=$(retail_deal)
history second-counterparty counterparty "$SECOND"

# ---- the files ------------------------------------------------------------------
mkdir -p "$OUT/verify"
rm -f "$OUT"/history-*.bundle.json "$OUT"/mutant-*.bundle.json "$OUT"/verify/*.json
for name in history-counterparty history-adjudicator history-keep; do
  cp "$WORK/$name.json" "$OUT/$name.bundle.json"
  chmod 644 "$OUT/$name.bundle.json"
done
"$PY" "$ROOT/examples/history/make_mutants.py" "$OUT/history-counterparty.bundle.json" \
  "$WORK/other-counterparty.json" "$WORK/second-counterparty.json" "$OUT"

for f in "$OUT"/history-*.bundle.json "$OUT"/mutant-*.bundle.json; do
  name=$(basename "$f" .bundle.json)
  # INVALID exits non-zero; the report is what is recorded.
  "$C" verify --bundle "$f" > "$OUT/verify/$name.json" || true
done

"$PY" - "$OUT/cut.json" <<EOF
import json, sys
json.dump({
  "deals": {"closed": "$CLOSED", "private": "$PRIVATE", "floor": "$FLOOR", "other": "$OTHER", "second_profile": "$SECOND"},
  "holder_key": "$HOLDER_KEY",
  "second_key": "$SECOND_KEY",
  "private_values": {
    "address": ["$ADDRESS", "Larkspur", "Springfield"],
    "card": ["$CARD", "4111-1111-1111-1111"],
    "code": ["$CODE"],
    "contact": ["$EMAIL", "$PHONE", "$SHOP"],
    "floor": ["170000", "min_total_minor", "go down to 1700"]
  }
}, open(sys.argv[1], "w"), indent=1, sort_keys=True)
open(sys.argv[1], "a").write("\n")
EOF
echo "cut into $OUT"
