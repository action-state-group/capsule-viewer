#!/usr/bin/env bash
# build_seller_fixtures.sh -- (re)build the seller receipt fixtures in
# tests/testdata/receipt/ from a capsule-cli checkout, through the real CLI:
#
#   examples/receipt/build_seller_fixtures.sh CAPSULE_CLI_CHECKOUT [REV]
#
# REV (default HEAD) is the capsule-cli commit to build, read from the
# checkout's object store, so a stale working tree is never what runs.
#
# ONE synthetic sale of an example bicycle (ask 1900, not under 1700) with two
# buyer threads, sealed by the seller's agent:
#
# * thread A: the agent states the item's condition, offers 2000 (it pauses
#   and the user approves), then offers 1900 (superseding it); the buyer
#   accepts the 1900 offer; the agent commits at 1900, gives the buyer a
#   pickup address once the user approves, records the card processor's
#   payment evidence and closes the deal with what was handed over.
# * thread B: the same statement, an offer at 1500 under the floor (it pauses,
#   never answered), then the thread is closed not_selected.
# * a buyer's agent buys the same bicycle at 1900 (its own deal, the same deal
#   id as thread A).
#
# Fixtures:
# * seller-keep / seller-counterparty / seller-adjudicator: thread A's three
#   copies; seller-declined: thread B's counterparty copy.
# * seller-bilateral: a composed/v1 bundle of the buyer's counterparty copy
#   and thread A's counterparty copy, one agreeing join.
# * <name>.verify.json: what `capsulectl verify --bundle` reports for each.
#
# FIXTURE STEP: capsulectl at the commit these are built from does not engage
# the seller copy's bundle extension kind, so engage_seller_kind.py adds it to every seller copy after capsulectl
# cut it; it refuses (and this script stops) once capsulectl engages any
# extension kind it did not engage when the step was written, or if a copy's
# opening record does not seal party_role seller. The deal id is taken from
# CAPSULE_FIXTURE_DEAL_ID by a one-line change to a copy of the checkout, as
# in build_bilateral_fixtures.sh, so the two parties' copies name one deal.
#
# Keys and capsule ids are fresh on every run, so a rebuild rewrites every
# fixture. Needs bash, go, git, jq, perl and python3. Writes only the
# fixtures' directory and its own temp directory.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
here="$root/examples/receipt"
cli="$(cd "${1:?usage: build_seller_fixtures.sh CAPSULE_CLI_CHECKOUT}" && pwd)"
out="$root/tests/testdata/receipt"
work="$(mktemp -d)"
# KEEP_WORK=1 keeps the temp directory (its path goes to stderr) for inspection.
[ -n "${KEEP_WORK:-}" ] && echo "work: $work" >&2 || trap 'rm -rf "$work"' EXIT

mkdir -p "$work/src"
rev="${2:-HEAD}"
git -C "$cli" archive "$rev" | tar -x -C "$work/src"
commit=$(git -C "$cli" rev-parse "$rev")
perl -0pi -e 's/(\t+)(dealID := "deal-" \+ hex\.EncodeToString\(id\)\n)/$1$2$1if fixed := os.Getenv("CAPSULE_FIXTURE_DEAL_ID"); fixed != "" {\n$1\tdealID = fixed\n$1}\n/' \
  "$work/src/internal/cli/deal.go"
grep -q CAPSULE_FIXTURE_DEAL_ID "$work/src/internal/cli/deal.go" || { echo "the deal id line moved; update the patch" >&2; exit 1; }
(cd "$work/src" && go build -o "$work/capsulectl" ./cmd/capsulectl)
capsulectl() { "$work/capsulectl" "$@"; }
mkdir -p "$out"
export CAPSULE_DEAL_CHECK_URL=
materiality="$work/src/skills/deal/profile/materiality-predicate/neutral.json"
deal_id=deal-5e11e7b1c7c1e0a1

# party DIR: a fresh directory with its own config and deal profile.
party() {
  mkdir -p "$work/$1"
  cd "$work/$1"
  export XDG_CONFIG_HOME="$work/$1/config" HOME="$work/$1/home"
  mkdir -p "$HOME"
  capsulectl deal init --profile deal --dir ./deal --no-witness --materiality "$materiality" >/dev/null
}
deal() { capsulectl --profile deal deal "$@"; }

# check DEAL INPUT [answer]: a check; when it pauses and answer is given, the
# user approves it in their own words. Prints the check id.
check() {
  deal check --deal "$1" --input "$2" >"$2.out"
  if [ "$(jq -r .verdict "$2.out")" != pass ] && [ "${3:-}" = answer ]; then
    jq -r .card "$2.out" >"$2.card"
    deal note --deal "$1" --kind approval --check "$(jq -r .check_id "$2.out")" --choice proceed \
      --said "yes, go ahead" --shown-card "$2.card" >/dev/null
  fi
  jq -r .check_id "$2.out"
}

# cut DEAL NAME: the deal's keep copy and its two shared copies, as bundles.
cut() {
  deal report --deal "$1" --html "$2-keep.html" --bundle "$2-keep.json" >/dev/null
  for audience in counterparty adjudicator; do
    deal report --deal "$1" --share "$audience" --to "the $audience" --html "$2-$audience.html" >/dev/null
    perl -ne 'print "$1\n" if /^\s*<script>window\.__BUNDLE__ = (.*);<\/script>$/' "$2-$audience.html" >"$2-$audience.json"
  done
}

# The seller: one sale, two buyer threads.
party seller
cat >sale.json <<'JSON'
{"type": "purchase", "demo": true,
 "intent": {"verbatim": "Sell my example bicycle; ask 1900, not under 1700", "min_total_minor": 170000,
            "asked": {"item": "example bicycle", "quantity": 1}, "allowed": ["offer", "commit", "share_contact"]},
 "terms": {"item": "example bicycle", "quantity": 1, "price_minor": 190000, "currency": "USD"},
 "recourse": {"rail": "card", "refundable": false}}
JSON
sale=$(deal sale new --input sale.json | jq -r .sale_id)
echo '{"channel": "marketplace", "who": {"name": "Example Buyer A", "domain": "buyer-a.example"}, "terms": {"price_minor": 190000}}' >open-a.json
echo '{"channel": "marketplace", "who": {"name": "Example Buyer B", "domain": "buyer-b.example"}, "terms": {"price_minor": 190000}}' >open-b.json
a=$(CAPSULE_FIXTURE_DEAL_ID=$deal_id deal open --sale "$sale" --input open-a.json | jq -r .deal_id)
b=$(deal open --sale "$sale" --input open-b.json | jq -r .deal_id)
echo '{"text": "The bicycle is in good condition, ridden one season.", "source_kind": "agent", "class": "condition"}' >claim.json

# Thread A.
deal note --deal "$a" --kind claim --input claim.json >/dev/null
echo '{"action": "offer", "amount_minor": 200000, "terms": {"item": "example bicycle", "quantity": 1, "price_minor": 200000}}' >offer-2000.json
check "$a" offer-2000.json answer >/dev/null
echo '{"action": "offer", "amount_minor": 200000}' >act-offer-2000.json
deal note --deal "$a" --kind act --input act-offer-2000.json >/dev/null
echo '{"action": "offer", "amount_minor": 190000, "terms": {"item": "example bicycle", "quantity": 1, "price_minor": 190000}}' >offer-1900.json
offer=$(check "$a" offer-1900.json answer)
echo '{"action": "offer", "amount_minor": 190000}' >act-offer-1900.json
deal note --deal "$a" --kind act --input act-offer-1900.json >/dev/null
accepted=$(deal note --deal "$a" --kind acceptance --check "$offer" --words "Deal, that works for me" --channel app_chat | jq -r .capsule_id)
echo '{"action": "commit", "amount_minor": 190000, "terms": {"item": "example bicycle", "quantity": 1, "price_minor": 190000}}' >commit.json
check "$a" commit.json answer >/dev/null
echo '{"action": "commit", "amount_minor": 190000}' >act-commit.json
deal note --deal "$a" --kind act --input act-commit.json >/dev/null
echo '{"action": "share_contact", "disclosing": ["address"], "disclosing_to": "counterparty"}' >share.json
share=$(check "$a" share.json answer)
jq -n --arg by "$share" --arg acc "$accepted" '{"to": "counterparty", "channel": "app_chat", "authorized_by": $by, "accepted": $acc,
  "fields": [{"class": "address", "value": "12 Quarry Lane, Northfield"}]}' >address.json
deal note --deal "$a" --kind disclosure --input address.json >/dev/null
echo '{"about": "payment received", "source": "card_processor", "detail": "pi_example_0001"}' >payment.json
deal note --deal "$a" --kind evidence --input payment.json >/dev/null
echo '{"status": "received", "delivered": {"item": "example bicycle", "quantity": 1, "price_minor": 190000, "currency": "USD"}, "note": "Handed over at pickup"}' >close-a.json
deal close --deal "$a" --input close-a.json >/dev/null
cut "$a" a

# Thread B.
deal note --deal "$b" --kind claim --input claim.json >/dev/null
echo '{"action": "offer", "amount_minor": 150000, "terms": {"item": "example bicycle", "quantity": 1, "price_minor": 150000}}' >offer-1500.json
check "$b" offer-1500.json >/dev/null
echo '{"status": "not_selected"}' >close-b.json
deal close --deal "$b" --input close-b.json >/dev/null
cut "$b" b

# The buyer: the same bicycle, from the seller, at 1900.
party buyer
cat >open.json <<'JSON'
{"type": "purchase", "demo": true, "channel": "marketplace",
 "intent": {"verbatim": "Buy the example bicycle for 1900", "asked": {"item": "example bicycle", "quantity": 1}, "allowed": ["pay"]},
 "who": {"name": "Example Seller", "domain": "seller.example"},
 "terms": {"item": "example bicycle", "quantity": 1, "price_minor": 190000, "currency": "USD"},
 "recourse": {"rail": "card", "refundable": false}}
JSON
id=$(CAPSULE_FIXTURE_DEAL_ID=$deal_id deal open --input open.json | jq -r .deal_id)
cat >pay.json <<'JSON'
{"action": "pay", "description": "Pay for the example bicycle, $1,900.00, saved card", "amount_minor": 190000, "authorized_max_minor": 190000,
 "who": {"name": "Example Seller", "domain": "seller.example"},
 "terms": {"item": "example bicycle", "quantity": 1, "price_minor": 190000, "currency": "USD"},
 "recourse": {"rail": "card", "refundable": false}}
JSON
check "$id" pay.json answer >/dev/null
echo '{"action": "pay", "amount_minor": 190000, "currency": "USD", "payee": "Example Seller", "rail": "card", "reference": "ORDER-2001"}' >act-pay.json
deal note --deal "$id" --kind act --input act-pay.json >/dev/null
cut "$id" buyer

# FIXTURE STEP: engage the seller kind on every seller copy.
cd "$work"
for copy in seller/a-keep seller/a-counterparty seller/a-adjudicator seller/b-counterparty; do
  python3 "$here/engage_seller_kind.py" "$copy.json" >"$copy.engaged.json"
done

# The composer's container, as in build_bilateral_fixtures.sh.
mkdir -p "$work/composer"
cd "$work/composer"
export XDG_CONFIG_HOME="$work/composer/config" HOME="$work/composer/home"
mkdir -p "$HOME"
public=$(capsulectl key generate --output ./seed | jq -r .public_key)
capsulectl profile create --name composer --type sqlite --sqlite-path ./store.db \
  --operator "Example Composer" --signing-key-file ./seed --trusted-key "$public" \
  --log-id composer-log --checkpoint-signing-key-file ./seed --checkpoint-trusted-key "$public" >/dev/null
capsulectl store init --profile composer >/dev/null
jq -n --arg id "compose/$deal_id" '{"spec_version": "capsule-seal-request/v1",
  "capsule": {"ActionID": $id, "ActionType": "fyi", "Operator": "example-composer", "Developer": "example-composer@1", "Timestamp": "2026-10-09T18:00:00Z"},
  "payload": {"record_type": "composition"}}' >compose.json
container_root=$(capsulectl publish --profile composer --request compose.json | jq -r .capsule_id)
capsulectl cll checkpoint create --profile composer >/dev/null
capsulectl disclose --profile composer --root "$container_root" --out container.json >/dev/null

write() { # name, source bundle
  jq -S . "$2" >"$out/$1.bundle.json"
  # Verify the file as written, so the report is for exactly those bytes.
  capsulectl verify --bundle "$out/$1.bundle.json" | jq -S . >"$out/$1.verify.json" || true
  echo "$1: $(jq -r .verdict "$out/$1.verify.json")"
}
write seller-keep "$work/seller/a-keep.engaged.json"
write seller-counterparty "$work/seller/a-counterparty.engaged.json"
write seller-adjudicator "$work/seller/a-adjudicator.engaged.json"
write seller-declined "$work/seller/b-counterparty.engaged.json"
python3 "$here/compose_bilateral.py" container.json "$work/buyer/buyer-counterparty.json" "$work/seller/a-counterparty.engaged.json" agree >seller-bilateral.json
write seller-bilateral seller-bilateral.json
echo "capsule-cli $commit"
