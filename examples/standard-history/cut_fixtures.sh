#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Cut the History card (standard_history/1) fixtures with a real capsulectl,
# on a scratch profile, and record what `capsulectl verify --bundle` says
# about each file.
#
#   examples/standard-history/cut_fixtures.sh CAPSULECTL CAPSULE_CLI_CHECKOUT AAC_CHECKOUT
#
# CAPSULECTL is a capsulectl binary built from CAPSULE_CLI_CHECKOUT (`go build
# ./cmd/capsulectl`), at the commit tests/testdata/standard-history/README.md
# names; AAC_CHECKOUT is
# agent-action-capsule at the commit named there (cases.py runs its Python
# reference). Nothing outside a fresh temporary directory and
# tests/testdata/standard-history/ is written.
#
# Each case of cases.py is one Capsule whose payload (its agent_input) is the
# card, sealed with `capsulectl seal` into one holder's log and appended; one
# checkpoint covers them all; `capsulectl disclose --root` writes each card's
# bundle. The case's x-standard-history/v0 block is then added to the bundle's
# extensions, which the container's seal does not cover, and
# `capsulectl verify --bundle` checks the result.
#
# Files written (tests/testdata/standard-history/):
#   <name>.bundle.json   the card's evidence-bundle/v2, with its block
#   verify/<name>.json   `capsulectl verify --bundle` on it, as printed
#   cases.json           every case: the card, the block, and what the AAC
#                        reference check_card reports for them (expected)
#   cut.json             the holder's keys and the capsule-cli commit the
#                        capsulectl was built from (producer_commit)
# Keys and capsule ids are fresh on every run. Needs bash, jq and python3.
set -euo pipefail

usage="usage: cut_fixtures.sh CAPSULECTL CAPSULE_CLI_CHECKOUT AAC_CHECKOUT"
bin="$(cd "$(dirname "${1:?$usage}")" && pwd)/$(basename "$1")"
cli="$(cd "${2:?$usage}" && pwd)"
aac="$(cd "${3:?$usage}" && pwd)"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out="$root/tests/testdata/standard-history"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
export XDG_CONFIG_HOME="$work/config" HOME="$work/home"
mkdir -p "$HOME" "$out/verify"
capsulectl() { "$bin" "$@"; }

python3 -I "$root/examples/standard-history/cases.py" "$aac/python" >"$out/cases.json"

cd "$work"
producer="$(capsulectl key generate --output producer.seed | jq -r .public_key)"
checkpoint="$(capsulectl key generate --output checkpoint.seed | jq -r .public_key)"
capsulectl profile create --name holder --type sqlite --sqlite-path "$work/holder.db" \
  --namespace holder --log-id holder-book \
  --signing-key-file "$work/producer.seed" --trusted-key "$producer" \
  --checkpoint-signing-key-file "$work/checkpoint.seed" --checkpoint-trusted-key "$checkpoint" >/dev/null
capsulectl store init --profile holder >/dev/null

names=()
while IFS= read -r name; do names+=("$name"); done < <(jq -r '.[].name' "$out/cases.json")
ids=()
for name in "${names[@]}"; do
  jq --arg n "$name" '{spec_version: "capsule-seal-request/v1",
      capsule: {ActionID: ("standard-history-" + $n), ActionType: "fyi", Operator: "example-holder",
                Developer: "example-holder", Timestamp: "2026-10-28T12:00:00Z"},
      payload: (.[] | select(.name == $n) | .card)}' "$out/cases.json" >"$name.request.json"
  capsulectl seal --profile holder --request "$name.request.json" --output "$name.capsule.json" >/dev/null
  capsulectl cll append --profile holder --capsule "$name.capsule.json" >/dev/null
  ids+=("$(jq -r .capsule_id "$name.capsule.json")")
done
capsulectl cll checkpoint create --profile holder >/dev/null

for i in "${!names[@]}"; do
  name="${names[$i]}"
  capsulectl disclose --profile holder --root "${ids[$i]}" --out "$name.disclosed.json" >/dev/null
  jq --arg n "$name" --slurpfile cases "$out/cases.json" \
    '.extensions["x-standard-history/v0"] = ($cases[0][] | select(.name == $n) | .block)' \
    "$name.disclosed.json" >"$out/$name.bundle.json"
  capsulectl verify --bundle "$out/$name.bundle.json" | jq -S . >"$out/verify/$name.json"
  echo "$name: $(jq -r .verdict "$out/verify/$name.json")"
done

jq -n --arg producer "$producer" --arg checkpoint "$checkpoint" \
  --arg commit "$(git -C "$cli" rev-parse HEAD)" --arg aac "$(git -C "$aac" rev-parse HEAD)" \
  '{holder_key: $producer, checkpoint_key: $checkpoint, producer_commit: $commit, aac_commit: $aac}' >"$out/cut.json"
