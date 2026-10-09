#!/usr/bin/env bash
# build_bilateral_fixtures.sh -- (re)build the bilateral receipt fixtures in
# tests/testdata/receipt/ from a capsule-cli checkout, through the real CLI:
#
#   examples/receipt/build_bilateral_fixtures.sh CAPSULE_CLI_CHECKOUT [REV]
#
# REV (default HEAD) is the capsule-cli commit to build, read from the
# checkout's object store, so a stale working tree is never what runs.
#
# ONE synthetic deal seen by both parties: a buyer's agent buys an example
# item from an example shop (capsule-cli's retail-checkout demo), and the
# shop's agent records the same sale from the seller's side (offer, the
# buyer's acceptance, commit). Each party cuts its own copies with capsulectl;
# compose_bilateral.py puts two copies in a composed/v1 container that
# capsulectl itself sealed and checkpointed. Each part is that party's copy
# byte for byte, with its own completeness proof.
#
# * bilateral-counterparty: the buyer's and the seller's counterparty copies,
#   one agreeing join.
# * bilateral-adjudicator: both adjudicator copies, one agreeing join and one
#   mismatching join.
# * bilateral-keep: the buyer's own copy beside the seller's counterparty
#   copy, as the buyer keeps it.
# * bilateral-two-deals: the buyer's counterparty copy beside a seller copy of
#   ANOTHER deal: the parts name two deals.
# * <name>.verify.json: what `capsulectl verify --bundle` reports for each.
#
# No producer agrees one deal id between two parties yet, so the capsulectl
# built here takes the deal id from CAPSULE_FIXTURE_DEAL_ID when it is set
# (one line, applied to a copy of the checkout; the checkout is never
# changed). Without it, every deal id is random as in the release.
#
# Keys and capsule ids are fresh on every run, so a rebuild rewrites every
# fixture. Needs bash, go, git, jq, perl and python3. Writes only the
# fixtures' directory and its own temp directory.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
here="$root/examples/receipt"
cli="$(cd "${1:?usage: build_bilateral_fixtures.sh CAPSULE_CLI_CHECKOUT}" && pwd)"
out="$root/tests/testdata/receipt"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

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
demo="$work/src/skills/deal/demo/retail-checkout"
materiality="$work/src/skills/deal/profile/materiality-predicate/neutral.json"

# party DIR: a fresh directory with its own config and deal profile.
party() {
  mkdir -p "$work/$1"
  cd "$work/$1"
  export XDG_CONFIG_HOME="$work/$1/config"
  capsulectl deal init --profile deal --dir ./deal --no-witness --materiality "$materiality" >/dev/null
}

# cut DEAL: the party's keep copy and its two shared copies, as bundles.
cut() {
  capsulectl --profile deal deal report --deal "$1" --html keep.html --bundle keep.json >/dev/null
  for audience in counterparty adjudicator; do
    capsulectl --profile deal deal report --deal "$1" --share "$audience" --to "the $audience" --html "$audience.html" >/dev/null
    perl -ne 'print "$1\n" if /^\s*<script>window\.__BUNDLE__ = (.*);<\/script>$/' "$audience.html" >"$audience.json"
  done
}

# The buyer's deal: the retail-checkout demo.
buyer() {
  party "$1"
  local id
  id=$(capsulectl --profile deal deal open --input "$demo/open.json" | jq -r .deal_id)
  capsulectl --profile deal deal check --deal "$id" --input "$demo/check-pay.json" >/dev/null
  capsulectl --profile deal deal note --deal "$id" --kind act --input "$demo/act-pay.json" >/dev/null
  cut "$id"
}

# The seller's deal: the same item and price, from the shop's side.
seller() {
  party "$1"
  cat >open.json <<'JSON'
{"type": "purchase", "demo": true, "channel": "web",
 "intent": {"verbatim": "Sell the cat sticker in this order", "party_role": "seller",
            "asked": {"item": "cat sticker", "quantity": 1}, "allowed": ["offer", "commit"]},
 "who": {"name": "Example Buyer", "domain": "buyer.example"},
 "terms": {"item": "cat sticker", "quantity": 1, "price_minor": 627, "currency": "USD"},
 "recourse": {"rail": "card", "refundable": true}}
JSON
  local id offer
  id=$(capsulectl --profile deal deal open --records typed --input open.json | jq -r .deal_id)
  echo '{"action": "offer", "amount_minor": 627, "terms": {"item": "cat sticker", "quantity": 1, "price_minor": 627}}' >offer.json
  offer=$(capsulectl --profile deal deal check --deal "$id" --input offer.json | jq -r .check_id)
  echo '{"action": "offer", "amount_minor": 627}' >act-offer.json
  capsulectl --profile deal deal note --deal "$id" --kind act --input act-offer.json >/dev/null
  capsulectl --profile deal deal note --deal "$id" --kind acceptance --check "$offer" --words "Yes, one cat sticker at 6.27" --channel web >/dev/null
  echo '{"action": "commit", "amount_minor": 627, "terms": {"item": "cat sticker", "quantity": 1, "price_minor": 627}}' >commit.json
  capsulectl --profile deal deal check --deal "$id" --input commit.json >/dev/null
  echo '{"action": "commit", "amount_minor": 627}' >act-commit.json
  capsulectl --profile deal deal note --deal "$id" --kind act --input act-commit.json >/dev/null
  cut "$id"
}

CAPSULE_FIXTURE_DEAL_ID=deal-0b11a7e2a1c0ffee buyer buyer
CAPSULE_FIXTURE_DEAL_ID=deal-0b11a7e2a1c0ffee seller seller
seller other-seller # a random deal id: another deal

# The composer's container: one record sealed by capsulectl into its own log,
# checkpointed and disclosed, so the container verifies on its own.
mkdir -p "$work/composer"
cd "$work/composer"
export XDG_CONFIG_HOME="$work/composer/config"
public=$(capsulectl key generate --output ./seed | jq -r .public_key)
capsulectl profile create --name composer --type sqlite --sqlite-path ./store.db \
  --operator "Example Composer" --signing-key-file ./seed --trusted-key "$public" \
  --log-id composer-log --checkpoint-signing-key-file ./seed --checkpoint-trusted-key "$public" >/dev/null
capsulectl store init --profile composer >/dev/null
cat >compose.json <<'JSON'
{"spec_version": "capsule-seal-request/v1",
 "capsule": {"ActionID": "compose/deal-0b11a7e2a1c0ffee", "ActionType": "fyi", "Operator": "example-composer",
             "Developer": "example-composer@1", "Timestamp": "2026-10-09T18:00:00Z"},
 "payload": {"record_type": "composition"}}
JSON
container_root=$(capsulectl publish --profile composer --request compose.json | jq -r .capsule_id)
capsulectl cll checkpoint create --profile composer >/dev/null
capsulectl disclose --profile composer --root "$container_root" --out container.json >/dev/null

compose() { # name, part a, part b, join...
  local name="$1" a="$2" b="$3"
  shift 3
  python3 "$here/compose_bilateral.py" container.json "$work/$a.json" "$work/$b.json" "$@" | jq -S . >"$out/$name.bundle.json"
  # Verify the file as written, so the report is for exactly those bytes.
  capsulectl verify --bundle "$out/$name.bundle.json" | jq -S . >"$out/$name.verify.json" || true
  echo "$name: $(jq -r .verdict "$out/$name.verify.json")"
}
compose bilateral-counterparty buyer/counterparty seller/counterparty agree
compose bilateral-adjudicator buyer/adjudicator seller/adjudicator agree mismatch
compose bilateral-keep buyer/keep seller/counterparty agree
compose bilateral-two-deals buyer/counterparty other-seller/counterparty agree
echo "capsule-cli $commit"
