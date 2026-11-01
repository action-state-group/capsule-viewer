#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Cut the witnessed History card fixtures (capsule-viewer#183) with a real
# capsulectl, as cut_fixtures.sh cuts the others, from witness_cases.py.
#
#   examples/standard-history/cut_witness_fixtures.sh CAPSULECTL CAPSULE_CLI_CHECKOUT AAC_CHECKOUT
#
# Files written (tests/testdata/standard-history/witness/): one
# <name>.bundle.json and verify/<name>.json per case, witness_cases.json, and
# cut.json (the holder's keys and the commits capsulectl and AAC's Python
# reference are at). The Receipts in the blocks are TEST-KEYED: AAC's
# anchor-witness-v1 vectors, whose witness keys derive from public labels and
# whose anchor is a label digest (see witness_cases.py). No public witness is
# contacted. Keys and capsule ids are fresh on every run. Needs bash, jq and
# python3.
set -euo pipefail

usage="usage: cut_witness_fixtures.sh CAPSULECTL CAPSULE_CLI_CHECKOUT AAC_CHECKOUT"
bin="$(cd "$(dirname "${1:?$usage}")" && pwd)/$(basename "$1")"
cli="$(cd "${2:?$usage}" && pwd)"
aac="$(cd "${3:?$usage}" && pwd)"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out="$root/tests/testdata/standard-history/witness"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
export XDG_CONFIG_HOME="$work/config" HOME="$work/home"
mkdir -p "$HOME" "$out/verify"
capsulectl() { "$bin" "$@"; }

python3 -I "$root/examples/standard-history/witness_cases.py" "$aac/python" >"$out/witness_cases.json"

cd "$work"
producer="$(capsulectl key generate --output producer.seed | jq -r .public_key)"
checkpoint="$(capsulectl key generate --output checkpoint.seed | jq -r .public_key)"
capsulectl profile create --name holder --type sqlite --sqlite-path "$work/holder.db" \
  --namespace holder --log-id holder-book \
  --signing-key-file "$work/producer.seed" --trusted-key "$producer" \
  --checkpoint-signing-key-file "$work/checkpoint.seed" --checkpoint-trusted-key "$checkpoint" >/dev/null
capsulectl store init --profile holder >/dev/null

names=()
while IFS= read -r name; do names+=("$name"); done < <(jq -r '.[].name' "$out/witness_cases.json")
ids=()
for name in "${names[@]}"; do
  jq --arg n "$name" '{spec_version: "capsule-seal-request/v1",
      capsule: {ActionID: ("standard-history-" + $n), ActionType: "fyi", Operator: "example-holder",
                Developer: "example-holder", Timestamp: "2026-10-28T12:00:00Z"},
      payload: (.[] | select(.name == $n) | .card)}' "$out/witness_cases.json" >"$name.request.json"
  capsulectl seal --profile holder --request "$name.request.json" --output "$name.capsule.json" >/dev/null
  capsulectl cll append --profile holder --capsule "$name.capsule.json" >/dev/null
  ids+=("$(jq -r .capsule_id "$name.capsule.json")")
done
capsulectl cll checkpoint create --profile holder >/dev/null

for i in "${!names[@]}"; do
  name="${names[$i]}"
  capsulectl disclose --profile holder --root "${ids[$i]}" --out "$name.disclosed.json" >/dev/null
  jq --arg n "$name" --slurpfile cases "$out/witness_cases.json" \
    '.extensions["x-standard-history/v0"] = ($cases[0][] | select(.name == $n) | .block)' \
    "$name.disclosed.json" >"$out/$name.bundle.json"
  capsulectl verify --bundle "$out/$name.bundle.json" | jq -S . >"$out/verify/$name.json"
  echo "$name: $(jq -r .verdict "$out/verify/$name.json")"
done

jq -n --arg producer "$producer" --arg checkpoint "$checkpoint" \
  --arg commit "$(git -C "$cli" rev-parse HEAD)" --arg aac "$(git -C "$aac" rev-parse HEAD)" \
  '{holder_key: $producer, checkpoint_key: $checkpoint, producer_commit: $commit, aac_commit: $aac}' >"$out/cut.json"
