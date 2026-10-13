#!/usr/bin/env bash
# presentation_plugin.sh -- put the receipt modules' module-slot scripts in
# front of capsulectl's page builder, as a plugin would carry them, and record
# what `presentation list` and `presentation build` do with a bundle:
#
#   examples/receipt/presentation_plugin.sh CAPSULECTL OUT_DIR BUNDLE...
#
# The plugin (capsulectl-capsuleviewer, a launcher that answers only the
# cli-plugin/v1 metadata handshake) is installed under a fresh HOME in a temp
# directory: capsulectl loads presentations only from its built-in plugin
# roots, one of which is $HOME/.local/lib/capsulectl/plugins, so nothing
# outside the temp directory is read or written but OUT_DIR. It offers the
# three modules with their manifests (src/capsule_viewer/receipt/module-slot/),
# each with its script and the kit stylesheet, as the manifests pin them.
#
# For each BUNDLE, at the audience its name ends with (keep, counterparty or
# adjudicator): OUT_DIR/<name>.list.json (`presentation list`),
# OUT_DIR/<name>.build.json and OUT_DIR/<name>.html (`presentation build`).
# Exit codes are recorded beside them (<name>.list.exit, <name>.build.exit),
# not failed on: a refusal is a result. Needs bash and jq.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
usage="usage: presentation_plugin.sh CAPSULECTL OUT_DIR BUNDLE..."
bin="$(cd "$(dirname "${1:?$usage}")" && pwd)/$(basename "$1")"
mkdir -p "${2:?$usage}"
out="$(cd "$2" && pwd)"
shift 2
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
export HOME="$work/home" XDG_CONFIG_HOME="$work/config"
unset CAPSULECTL_PLUGIN_ROOTS
plugins="$HOME/.local/lib/capsulectl/plugins"
mkdir -p "$plugins"
chmod 0755 "$HOME" "$HOME/.local" "$HOME/.local/lib" "$HOME/.local/lib/capsulectl" "$plugins"

static="$root/src/capsule_viewer/static"
cp "$static/receipt_unilateral.js" "$static/receipt_seller.js" "$static/receipt_bilateral.js" "$static/kit.css" "$plugins/"
chmod 0644 "$plugins"/*.js "$plugins/kit.css"
sha() { sha256sum "$1" | cut -d' ' -f1; }
presentations="[]"
for kind in unilateral seller bilateral; do
  manifest="$root/src/capsule_viewer/receipt/module-slot/manifest-$kind.json"
  presentations=$(jq -c --slurpfile m "$manifest" --arg script "receipt_$kind.js" --arg ssha "$(sha "$plugins/receipt_$kind.js")" \
    --arg csha "$(sha "$plugins/kit.css")" \
    '. + [{"manifest": $m[0], "files": [{"role": "script", "path": $script, "sha256": $ssha}, {"role": "style", "path": "kit.css", "sha256": $csha}]}]' \
    <<<"$presentations")
done
jq -n --argjson p "$presentations" \
  '{"name": "capsuleviewer", "vendor": "example", "version": "0.0.1", "plugin_api": "cli-plugin/v1", "presentations": $p}' >"$plugins/metadata.json"
chmod 0644 "$plugins/metadata.json"
cat >"$plugins/capsulectl-capsuleviewer" <<'SH'
#!/bin/sh
[ "$1" = cli-plugin-metadata ] && exec cat "$(dirname "$0")/metadata.json"
echo "capsulectl-capsuleviewer carries presentations only" >&2
exit 2
SH
chmod 0755 "$plugins/capsulectl-capsuleviewer"

"$bin" plugin ls >"$out/plugin-ls.json" 2>&1 || true
for bundle in "$@"; do
  name="$(basename "$bundle" .bundle.json)"
  audience="${name##*-}"
  set +e
  "$bin" presentation list --bundle "$bundle" --audience "$audience" >"$out/$name.list.json" 2>"$out/$name.list.stderr"
  echo $? >"$out/$name.list.exit"
  rm -f "$out/$name.html"
  "$bin" presentation build --bundle "$bundle" --audience "$audience" --out "$out/$name.html" >"$out/$name.build.json" 2>"$out/$name.build.stderr"
  echo $? >"$out/$name.build.exit"
  set -e
  echo "$name ($audience): list exit $(cat "$out/$name.list.exit") $(jq -c '{resolution, ambiguity: (.ambiguity.modules // null)}' "$out/$name.list.json" 2>/dev/null || true); build exit $(cat "$out/$name.build.exit") $(jq -c '{page, modules: [.modules[]?.id]}' "$out/$name.build.json" 2>/dev/null || true)"
done
