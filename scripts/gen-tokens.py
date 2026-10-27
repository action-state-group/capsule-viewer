#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Generate every design-token site from tokens/tokens.json, the one source.

    python3 scripts/gen-tokens.py           # rewrite the generated sites
    python3 scripts/gen-tokens.py --check   # exit 1, naming each site, if one differs
    ... --source FILE                        # read FILE instead of tokens/tokens.json

Sites: the TOKENS table in src/capsule_viewer/kit/tokens.py, the --cv-* block
in src/capsule_viewer/static/kit.css, the :root block of both emitter shells
(go/emitter/shell.html, ts/src/emitter-shell.html) and the report-frame
variables in ts/src/frame-tokens.generated.ts. Only the token blocks are
rewritten; everything around them is hand-written.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from capsule_viewer.kit import tokens as kit_tokens  # noqa: E402

SOURCE = ROOT / "tokens" / "tokens.json"
TOKENS_PY = ROOT / "src/capsule_viewer/kit/tokens.py"
KIT_CSS = ROOT / "src/capsule_viewer/static/kit.css"
SHELLS = (ROOT / "go/emitter/shell.html", ROOT / "ts/src/emitter-shell.html")
FRAME_TS = ROOT / "ts/src/frame-tokens.generated.ts"

PY_BEGIN = "# BEGIN GENERATED TOKENS (tokens/tokens.json) -- do not edit by hand\n"
PY_END = "# END GENERATED TOKENS\n"
SHELL_ROOT = re.compile(r"      :root \{\n.*?\n      \}\n", re.S)
# Emitted before this shell variable, inside :root.
SHELL_FRAME_COMMENT = (
    "        /* A report's frame: the page colour behind its cards, and the one\n"
    "           inset every card's content starts at. */\n"
)


def load(source: Path) -> dict:
    return json.loads(source.read_text(encoding="utf-8"))


def tokens_py(src: str, kit: dict[str, str]) -> str:
    start, end = src.index(PY_BEGIN), src.index(PY_END)
    lines = [f"    {json.dumps(name)}: {json.dumps(value)}," for name, value in kit.items()]
    return src[: start + len(PY_BEGIN)] + "\n".join(lines) + "\n" + src[end:]


def shell_root(data: dict) -> str:
    palette = data["palette"]
    out = ["      :root {\n"]
    for name, value in data["shell"].items():
        if name == "page-bg":
            out.append(SHELL_FRAME_COMMENT)
        if value.startswith("@"):
            value = palette[value[1:]]
        out.append(f"        --aac-{name}: {value};\n")
    out.append("      }\n")
    return "".join(out)


def shell_html(src: str, data: dict) -> str:
    if not SHELL_ROOT.search(src):
        raise SystemExit("shell has no :root block")
    return SHELL_ROOT.sub(lambda _: shell_root(data), src, count=1)


def frame_vars(data: dict, frame: str) -> str:
    spec = data["frames"][frame]
    # Frames spell hex upper-case, as they always have, so emitted pages stay byte-identical.
    decls = [f"--{name}:{data['palette'][name].upper()};" for name in spec["palette"]]
    return "".join(decls) + f"--r:{spec['radius']};"


def frame_ts(data: dict) -> str:
    lines = [
        "// GENERATED from tokens/tokens.json by scripts/gen-tokens.py. Do not edit by hand.",
        "",
        "/** Custom properties a report frame (`.cc`, `.oi`) declares on itself. */",
    ]
    for frame, const in (("cc", "COMPLIANCE_FRAME_VARS"), ("oi", "OUTCOME_FRAME_VARS")):
        lines += [f"export const {const} =", f"  {json.dumps(frame_vars(data, frame))};", ""]
    return "\n".join(lines)


def main() -> int:
    check = "--check" in sys.argv[1:]
    args = sys.argv[1:]
    source = Path(args[args.index("--source") + 1]) if "--source" in args else SOURCE
    data = load(source)
    kit_tokens.TOKENS = data["kit"]  # token_block()/regenerate() read the module global
    wanted: dict[Path, str] = {
        TOKENS_PY: tokens_py(TOKENS_PY.read_text(encoding="utf-8"), data["kit"]),
        KIT_CSS: kit_tokens.regenerate(KIT_CSS.read_text(encoding="utf-8")),
        FRAME_TS: frame_ts(data),
    }
    for shell in SHELLS:
        wanted[shell] = shell_html(shell.read_text(encoding="utf-8"), data)
    stale = [p for p, text in wanted.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
    if check:
        for path in stale:
            print(f"out of date: {path.relative_to(ROOT)} (run python3 scripts/gen-tokens.py)")
        return 1 if stale else 0
    for path in stale:
        path.write_text(wanted[path], encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
