#!/usr/bin/env bash
# cut_main_bundles.sh -- cut real receipt bundles with capsulectl as capsule-cli
# main builds it, for the module-slot scripts' tests:
#
#   examples/receipt/cut_main_bundles.sh CAPSULE_CLI_CHECKOUT CAPSULECTL [KEEP_DIR]
#
# CAPSULECTL is a capsulectl binary built from that checkout (`go build
# ./cmd/capsulectl`); the checkout supplies the retail-checkout demo inputs. Unlike build_seller_fixtures.sh, nothing is
# patched and no fixture step runs: capsulectl itself engages
# x-deal-seller/v0 on a seller's copies.
#
# * main-buyer-keep / main-buyer-counterparty: the retail-checkout demo deal
#   (an example shop, an example item), the owner's copy (`deal report
#   --bundle`) and the copy shared with the other party (`deal report --share
#   counterparty`, whose bundle is the one its page carries).
# * main-seller-keep / main-seller-counterparty: a sale of an example bicycle
#   (`deal sale new`, one buyer thread opened with `deal open --sale`): a
#   statement of the item's condition, an offer the user approves, the buyer's
#   acceptance of it, the commit and the close; its two copies cut the same way.
# * <name>.verify.json: what `capsulectl verify --bundle` reports for each.
#
# KEEP_DIR, when given, receives capsulectl's own deal pages (deal-view.js).
# Keys and capsule ids are fresh on every run. Needs bash, jq and perl.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
usage="usage: cut_main_bundles.sh CAPSULE_CLI_CHECKOUT CAPSULECTL [KEEP_DIR]"
cli="$(cd "${1:?$usage}" && pwd)"
bin="$(cd "$(dirname "${2:?$usage}")" && pwd)/$(basename "$2")"
keep_dir="${3:-}"
out="$root/tests/testdata/receipt"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
capsulectl() { "$bin" "$@"; }
deal() { capsulectl --profile deal deal "$@"; }
export CAPSULE_DEAL_CHECK_URL=

party() {
  mkdir -p "$work/$1"
  cd "$work/$1"
  export XDG_CONFIG_HOME="$work/$1/config" HOME="$work/$1/home"
  mkdir -p "$HOME"
  capsulectl deal init --profile deal --dir ./deal --no-witness \
    --materiality builtin:neutral >/dev/null
}

# check DEAL INPUT: a check; when it pauses, the user approves it. Prints the check id.
check() {
  local base
  base="$(basename "$2")"
  deal check --deal "$1" --input "$2" >"$base.out"
  if [ "$(jq -r .verdict "$base.out")" != pass ]; then
    jq -r .card "$base.out" >"$base.card"
    deal note --deal "$1" --kind approval --check "$(jq -r .check_id "$base.out")" --choice proceed \
      --said "yes, go ahead" --shown-card "$base.card" >/dev/null
  fi
  jq -r .check_id "$base.out"
}

# cut DEAL NAME: the owner's copy and the counterparty's copy, as bundles.
cut() {
  deal report --deal "$1" --html "$2-keep.html" --bundle "$2-keep.json" >/dev/null
  deal report --deal "$1" --share counterparty --to "the other party" --html "$2-counterparty.html" >/dev/null
  perl -ne 'print "$1$2\n" if /^\s*(?:<script>window\.__BUNDLE__ = (\{.*\});|<script type="application\/json">(.*))<\/script>$/' "$2-counterparty.html" >"$2-counterparty.json"
  if [ -n "$keep_dir" ]; then mkdir -p "$keep_dir" && cp "$2-keep.html" "$2-counterparty.html" "$keep_dir/"; fi
}

# The buyer: capsule-cli's retail-checkout demo.
party buyer
demo="$cli/skills/deal/demo/retail-checkout"
id=$(deal open --input "$demo/open.json" | jq -r .deal_id)
check "$id" "$demo/check-pay.json" >/dev/null
deal note --deal "$id" --kind act --input "$demo/act-pay.json" >/dev/null
cut "$id" buyer

# The seller: one sale, one buyer thread.
party seller
cat >sale.json <<'JSON'
{"type": "purchase", "demo": true,
 "intent": {"verbatim": "Sell my example bicycle; ask 1900, not under 1700", "min_total_minor": 170000,
            "asked": {"item": "example bicycle", "quantity": 1}, "allowed": ["offer", "commit"]},
 "terms": {"item": "example bicycle", "quantity": 1, "price_minor": 190000, "currency": "USD"},
 "recourse": {"rail": "card", "refundable": false}}
JSON
sale=$(deal sale new --input sale.json | jq -r .sale_id)
echo '{"channel": "marketplace", "who": {"name": "Example Buyer", "domain": "buyer.example"}, "terms": {"price_minor": 190000}}' >open-a.json
a=$(deal open --sale "$sale" --input open-a.json | jq -r .deal_id)
echo '{"text": "The bicycle is in good condition, ridden one season.", "source_kind": "agent", "class": "condition"}' >claim.json
deal note --deal "$a" --kind claim --input claim.json >/dev/null
echo '{"action": "offer", "amount_minor": 190000, "terms": {"item": "example bicycle", "quantity": 1, "price_minor": 190000}}' >offer.json
offer=$(check "$a" offer.json)
echo '{"action": "offer", "amount_minor": 190000}' >act-offer.json
deal note --deal "$a" --kind act --input act-offer.json >/dev/null
deal note --deal "$a" --kind acceptance --check "$offer" --words "Deal, that works for me" --channel app_chat >/dev/null
echo '{"action": "commit", "amount_minor": 190000, "terms": {"item": "example bicycle", "quantity": 1, "price_minor": 190000}}' >commit.json
check "$a" commit.json >/dev/null
echo '{"action": "commit", "amount_minor": 190000}' >act-commit.json
deal note --deal "$a" --kind act --input act-commit.json >/dev/null
echo '{"status": "received", "delivered": {"item": "example bicycle", "quantity": 1, "price_minor": 190000, "currency": "USD"}, "note": "Handed over at pickup"}' >close-a.json
deal close --deal "$a" --input close-a.json >/dev/null
cut "$a" seller

cd "$work"
for name in buyer-keep buyer-counterparty seller-keep seller-counterparty; do
  party_dir="${name%%-*}"
  jq -S . "$work/$party_dir/$name.json" >"$out/main-$name.bundle.json"
  # Verify the file as written, so the report is for exactly those bytes.
  capsulectl verify --bundle "$out/main-$name.bundle.json" | jq -S . >"$out/main-$name.verify.json"
  echo "main-$name: $(jq -r .verdict "$out/main-$name.verify.json") $(jq -c '.extensions | keys' "$out/main-$name.bundle.json")"
done
