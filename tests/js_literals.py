# SPDX-License-Identifier: Apache-2.0
"""The string literals of a module-slot script, for the wording grep
(``test_wording_packs.py``): a small JavaScript lexer that knows exactly what
the module scripts use (line and block comments, single- and double-quoted
strings with escapes, regular-expression literals). Template literals are
refused rather than guessed at: the scripts use none."""
from __future__ import annotations

import json
import re

# A line the generators fill (receipt.module_slot, history pin): data, not code.
GENERATED = re.compile(r"^(  var (\w+) = ).*(; // @generated \2)$", re.MULTILINE)
# After these, a "/" starts a regular expression, not a division.
_REGEX_AFTER = set("(,=:[!&|?{};")


def blank_generated(source: str) -> str:
    """*source* with each generated line's value replaced by ``null``: the
    packs it carries are grepped as the pack files they are."""
    return GENERATED.sub(lambda m: f"{m.group(1)}null{m.group(3)}", source)


def _decode(raw: str) -> str:
    body = raw[1:-1]
    if raw[0] == "'":
        body = body.replace("\\'", "'").replace('"', '\\"')
    return json.loads(f'"{body}"')


def literals(source: str) -> list[tuple[int, str]]:
    """Every string literal in *source*, as ``(line, value)``."""
    out: list[tuple[int, str]] = []
    i, n, line, prev = 0, len(source), 1, ""
    while i < n:
        c = source[i]
        if c == "\n":
            line += 1
            i += 1
            continue
        if source.startswith("//", i):
            j = source.find("\n", i)
            i = n if j < 0 else j
            continue
        if source.startswith("/*", i):
            j = source.index("*/", i)
            line += source.count("\n", i, j)
            i = j + 2
            continue
        if c == "`":
            raise ValueError(f"line {line}: a template literal; this lexer does not read them")
        if c in "\"'":
            j = i + 1
            while source[j] != c:
                if source[j] == "\n":
                    raise ValueError(f"line {line}: an unterminated string")
                j += 2 if source[j] == "\\" else 1
            out.append((line, _decode(source[i : j + 1])))
            i, prev = j + 1, c
            continue
        if c == "/" and (prev in _REGEX_AFTER or source[max(0, i - 7) : i].endswith("return ")):
            j, in_class = i + 1, False
            while True:
                if source[j] == "\\":
                    j += 2
                    continue
                if source[j] == "[":
                    in_class = True
                elif source[j] == "]":
                    in_class = False
                elif source[j] == "/" and not in_class:
                    break
                j += 1
            i, prev = j + 1, "/"
            continue
        if not c.isspace():
            prev = c
        i += 1
    return out
