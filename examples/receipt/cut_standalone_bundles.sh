#!/usr/bin/env bash
# cut_standalone_bundles.sh -- cut real receipt bundles as capsulectl main cuts
# them today: the copy's report is a standalone record in x-deal-report/v0, on
# no log (capsule-cli#294):
#
#   examples/receipt/cut_standalone_bundles.sh CAPSULECTL CAPSULECTL_DEAL [KEEP_DIR]
#
# CAPSULECTL is a capsulectl built from capsule-cli main, CAPSULECTL_DEAL the
# deal plugin built from evidencebook-deal main (`go build ./cmd/capsulectl-deal`).
# * main-standalone-keep: one errand (with the moves of capsule-cli#340), an example desk lamp: the user's ask with
#   no merchant yet, the agent's search, a dead end, a shortlist and a
#   recommendation, the user's pick, then their switch to another shop, a
#   pause, the user's OK and the payment. The owner's copy (`deal report
#   --bundle`).
# * main-standalone-counterparty: the copy shared with the other party, whose
#   sealed report carries none.
# * <name>.verify.json: what `capsulectl verify --bundle` reports for each.
# KEEP_DIR, when given, receives capsulectl's own deal pages (deal-view.js) for both copies.
# Keys and capsule ids are fresh on every run. Needs bash, jq and perl.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
usage="usage: cut_standalone_bundles.sh CAPSULECTL CAPSULECTL_DEAL [KEEP_DIR]"
bin="$(cd "$(dirname "${1:?$usage}")" && pwd)/$(basename "$1")"
plugin="$(cd "$(dirname "${2:?$usage}")" && pwd)/$(basename "$2")"
keep_dir="${3:+$(mkdir -p "$3" && cd "$3" && pwd)}"
out="$root/tests/testdata/receipt"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
export XDG_CONFIG_HOME="$work/config" HOME="$work/home" CAPSULE_DEAL_CHECK_URL=
mkdir home
capsulectl() { "$bin" "$@"; }
deal() { capsulectl --profile deal deal "$@"; }
capsulectl plugin install "$plugin" >/dev/null
capsulectl deal init --profile deal --dir ./deal --no-witness --materiality builtin:neutral >/dev/null

lamp='"item":"Example desk lamp"'
two='{"name":"Example Shop Two","domain":"example-shop-two.example"}'
three='{"name":"Example Shop Three","domain":"example-shop-three.example"}'
cat >open.json <<JSON
{"type":"purchase","demo":true,"channel":"web",
 "intent":{"verbatim":"find me an example desk lamp under \$40","max_total_minor":4000,"allowed":[],"asked":{"item":"desk lamp"}},
 "who":{},"recourse":{},"terms":{"currency":"USD"}}
JSON
id=$(deal open --input open.json | jq -r .deal_id)
note() { echo "$2" >"$1.json"; deal note --deal "$id" --kind "$1" --input "$1.json" >/dev/null; }
note searched '{"where":"example-shop-one, example-shop-two","results":12}'
note couldnt '{"reason":"out_of_stock","who":{"name":"Example Shop One","domain":"example-shop-one.example"}}'
note options "{\"options\":[{$lamp,\"who\":$two,\"price_minor\":3500}],\"found\":12}"
note recommended '{"option":1,"reason":"cheapest delivered"}'
echo "{\"verbatim\":\"the Example Shop Two one\",\"asked\":{$lamp},\"who\":$two}" >pick.json
deal note --deal "$id" --kind intent --input pick.json >/dev/null
echo "{\"verbatim\":\"actually, get it from Example Shop Three\",\"asked\":{$lamp},\"who\":$three}" >switch.json
deal note --deal "$id" --kind intent --input switch.json >/dev/null
cat >check.json <<JSON
{"action":"pay","description":"Example desk lamp","terms":{$lamp,"price_minor":3500,"currency":"USD"},"amount_minor":3500,"authorized_max_minor":3500,
 "who":{"name":"Example Shop Three","domain":"example-shop-three.example","payee":"Example Shop Three"},"recourse":{"rail":"card","refundable":true}}
JSON
deal check --deal "$id" --input check.json >check.out
jq -r .card check.out >check.card
deal note --deal "$id" --kind approval --check "$(jq -r .check_id check.out)" --choice proceed \
  --said "yes, buy it" --shown-card check.card >/dev/null
echo '{"action":"pay","amount_minor":3500,"currency":"USD","payee":"Example Shop Three","rail":"card","reference":"ORDER-2001"}' >act.json
deal note --deal "$id" --kind act --input act.json >/dev/null

deal report --deal "$id" --html keep.html --bundle keep.json >/dev/null
deal report --deal "$id" --share counterparty --to "the other party" --html counterparty.html >/dev/null
perl -ne 'print "$1$2\n" if /^\s*(?:<script>window\.__BUNDLE__ = (.*);|<script type="application\/json">(.*))<\/script>$/' counterparty.html >counterparty.json
if [ -n "$keep_dir" ]; then mkdir -p "$keep_dir" && cp keep.html counterparty.html "$keep_dir/"; fi
for name in keep counterparty; do
  jq -S . "$name.json" >"$out/main-standalone-$name.bundle.json"
  capsulectl verify --bundle "$out/main-standalone-$name.bundle.json" | jq -S . >"$out/main-standalone-$name.verify.json"
  echo "main-standalone-$name: $(jq -r .verdict "$out/main-standalone-$name.verify.json")"
done
