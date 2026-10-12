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
#   sale_a  - a seller's deal with buyer A (TestDealHistoryForAnotherBuyerCarriesNothingOfTheFirst:
#             A's name, contact, address, the item and its price in the opening, a message from A);
#   sale_b  - the same seller's deal with an unrelated buyer B;
# and, on a second profile (a second key), one retail deal.
#
# Files written (tests/testdata/history/):
#   history-history.bundle.json        closed + private + floor, --audience history (the default: every
#                                      record's payload withheld; the shareable History)
#   history-keep.bundle.json           the same deals, --audience keep (the keep copy, never one to send)
#   history-two-buyers.bundle.json     sale_a + sale_b, --audience history: the History the seller sends to buyer B
#   history-two-buyers-keep.bundle.json  the same two deals, --audience keep (the byte scan's control)
#   refused/<audience>.txt             what `deal history --audience counterparty|adjudicator` printed
#                                      (the producer refuses both for a History) and its exit status
#   mutant-*.bundle.json               the history History edited (make_mutants.py)
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

# Two buyers of one seller (the holder): capsule-cli deal_history_test.go sellerToBuyerA, and a buyer B.
A_NAME="Avery Quinlan"; A_EMAIL="avery@quinlan.example"; A_PHONE="+1 555 014 2233"; A_PLACE="12 Juniper Court, Lakeview"
A_ITEM="vintage road bike"; A_MESSAGE="Avery here: please hold the vintage road bike, I will collect it at 12 Juniper Court"
B_NAME="Blair Okonkwo"; B_EMAIL="blair@okonkwo.example"; B_PHONE="+1 555 019 4477"; B_PLACE="7 Alder Row, Brookfield"
B_ITEM="folding tandem bike"; B_MESSAGE="Blair here: please ship the folding tandem bike to 7 Alder Row"
sale() { # NAME DOMAIN EMAIL PHONE PLACE ITEM PRICE_MINOR MESSAGE
  local id
  id=$(deal open --records typed --input "$(json "sale-$2" '{"type":"purchase","channel":"web",
    "intent":{"verbatim":"Sell my '"$6"' to '"${1%% *}"' for '"$(( $7 / 100 ))"'","party_role":"seller",
              "asked":{"item":"'"$6"'","quantity":1},"allowed":["commit"]},
    "who":{"name":"'"$1"'","domain":"'"$2"'","email":"'"$3"'","phone":"'"$4"'"},
    "terms":{"item":"'"$6"'","quantity":1,"price_minor":'"$7"',"currency":"USD","place":"'"$5"'"},
    "recourse":{"rail":"card","refundable":false}}')" | field deal_id)
  deal note --deal "$id" --kind message --input "$(json "sale-$2-msg" '{"from":"counterparty","channel":"web","text":"'"$8"'"}')" >/dev/null
  deal check --deal "$id" --input "$(json "sale-$2-check" '{"action":"commit","terms":{"item":"'"$6"'","price_minor":'"$7"'}}')" >/dev/null
  echo "$id"
}
SALE_A=$(sale "$A_NAME" quinlan.example "$A_EMAIL" "$A_PHONE" "$A_PLACE" "$A_ITEM" 145000 "$A_MESSAGE")
SALE_B=$(sale "$B_NAME" okonkwo.example "$B_EMAIL" "$B_PHONE" "$B_PLACE" "$B_ITEM" 98000 "$B_MESSAGE")
for id in "$SALE_A" "$SALE_B" "$FLOOR" "$CLOSED"; do
  # The holder's own copy of each, so every step is under a checkpoint and a
  # keep copy can name a current report (as the producer's own test does).
  "$C" --profile holder bundle --deal "$id" --out "$WORK/own-$id.json" >/dev/null
done

history() { # NAME AUDIENCE DEAL...
  local name=$1 audience=$2
  shift 2
  local args=()
  for id in "$@"; do args+=(--deal "$id"); done
  deal history --audience "$audience" --out "$WORK/$name.json" "${args[@]}" >/dev/null
}
history history-history history "$CLOSED" "$PRIVATE" "$FLOOR"
history history-keep keep "$CLOSED" "$PRIVATE" "$FLOOR"
history history-two-buyers history "$SALE_A" "$SALE_B"
history history-two-buyers-keep keep "$SALE_A" "$SALE_B"
history other-history history "$OTHER"
# The producer refuses a History of counterparty or adjudicator copies: its
# refusal is the fixture evidence (the page's cases for them are in memory).
mkdir -p "$WORK/refused"
for audience in counterparty adjudicator; do
  set +e
  deal history --audience "$audience" --out "$WORK/refused-$audience.json" --deal "$CLOSED" --deal "$PRIVATE" --deal "$FLOOR" \
    >"$WORK/refused/$audience.out" 2>&1
  code=$?
  set -e
  if [ "$code" -eq 0 ] || [ -e "$WORK/refused-$audience.json" ]; then
    echo "deal history --audience $audience was not refused" >&2
    exit 1
  fi
  { echo "\$ capsulectl deal history --audience $audience --out FILE --deal CLOSED --deal PRIVATE --deal FLOOR"
    cat "$WORK/refused/$audience.out"; echo "exit status: $code"; } > "$WORK/refused/$audience.txt"
done

# ---- a second profile: a second key ---------------------------------------------
PROFILE=second
SECOND_KEY=$("$C" deal init --profile second --dir "$WORK/second" --no-witness --materiality "$MATERIALITY" | field public_key)
SECOND=$(retail_deal)
history second-history history "$SECOND"

# ---- the files ------------------------------------------------------------------
mkdir -p "$OUT/verify" "$OUT/refused"
rm -f "$OUT"/history-*.bundle.json "$OUT"/mutant-*.bundle.json "$OUT"/verify/*.json "$OUT"/refused/*.txt
for name in history-history history-keep history-two-buyers history-two-buyers-keep; do
  cp "$WORK/$name.json" "$OUT/$name.bundle.json"
  chmod 644 "$OUT/$name.bundle.json"
done
cp "$WORK"/refused/*.txt "$OUT/refused/"
PYTHONPATH="$ROOT/src" "$PY" "$ROOT/examples/history/make_mutants.py" "$OUT/history-history.bundle.json" \
  "$WORK/other-history.json" "$WORK/second-history.json" "$OUT/history-keep.bundle.json" "$WORK/shared-cp.json" "$OUT"

for f in "$OUT"/history-*.bundle.json "$OUT"/mutant-*.bundle.json; do
  name=$(basename "$f" .bundle.json)
  # INVALID exits non-zero; the report is what is recorded.
  "$C" verify --bundle "$f" > "$OUT/verify/$name.json" || true
done

"$PY" - "$OUT/cut.json" <<EOF
import json, sys
json.dump({
  "deals": {"closed": "$CLOSED", "private": "$PRIVATE", "floor": "$FLOOR", "other": "$OTHER", "second_profile": "$SECOND",
            "sale_a": "$SALE_A", "sale_b": "$SALE_B"},
  "holder_key": "$HOLDER_KEY",
  "second_key": "$SECOND_KEY",
  "private_values": {
    "address": ["$ADDRESS", "Larkspur", "Springfield"],
    "card": ["$CARD", "4111-1111-1111-1111"],
    "code": ["$CODE"],
    "contact": ["$EMAIL", "$PHONE", "$SHOP"],
    "floor": ["170000", "min_total_minor", "go down to 1700"]
  },
  # capsule-cli deal_history_test.go's buyerA list (and writtenAmounts(1450)), whole values beside it.
  "buyer_a": {
    "name": ["$A_NAME", "Avery", "Quinlan"],
    "contact": ["$A_EMAIL", "$A_PHONE", "quinlan.example", "555 014 2233"],
    "address": ["$A_PLACE", "Juniper"],
    "item": ["$A_ITEM"],
    "price": ["145000", "1450.00", "\$1450", "1,450.00", "\$1,450", "1,450", "1.450,00", "1 450", "1'450", "USD 1,450", "1450 usd", "1450usd"],
    "message": ["$A_MESSAGE", "please hold"]
  },
  "buyer_b": {
    "name": ["$B_NAME", "Blair", "Okonkwo"],
    "contact": ["$B_EMAIL", "$B_PHONE", "okonkwo.example"],
    "address": ["$B_PLACE", "Alder Row"],
    "item": ["$B_ITEM"],
    "price": ["98000"],
    "message": ["$B_MESSAGE"]
  }
}, open(sys.argv[1], "w"), indent=1, sort_keys=True)
open(sys.argv[1], "a").write("\n")
EOF
echo "cut into $OUT"
