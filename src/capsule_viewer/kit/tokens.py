# SPDX-License-Identifier: Apache-2.0
"""The kit's design tokens: ONE source, generated CSS, and a drift guard.

``TOKENS`` below is the only place a token value is written by hand. The
``:root { --cv-* }`` block at the top of ``static/kit.css`` is GENERATED from
it (``python -m capsule_viewer.kit tokens --write``) and checked in, so the
stylesheet a page inlines is a plain file anyone can read. ``check_token_sync``
is the drift guard: it parses that block back out of the stylesheet and raises
``TokenDriftError`` naming every token whose value disagrees with ``TOKENS``,
is missing, or is not declared here at all. ``tests/test_kit_tokens.py`` runs
it over the shipped stylesheet and over a deliberately drifted copy.

Every colour pair a component sets text in is listed in ``CONTRAST_PAIRS`` and
held to WCAG 2.x AA (4.5:1) by the same test file.
"""
from __future__ import annotations

import re
from importlib import resources

PREFIX = "--cv-"
BEGIN_MARKER = "/* BEGIN GENERATED TOKENS (capsule_viewer.kit.tokens) -- do not edit by hand */"
END_MARKER = "/* END GENERATED TOKENS */"

# Name (without the prefix) -> CSS value. Order is the emitted order.
TOKENS: dict[str, str] = {
    "font-sans": "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    "font-mono": "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    "font-size-sm": "0.8125rem",
    "font-size-md": "0.9375rem",
    "font-size-lg": "1.125rem",
    "line-height": "1.5",
    "space-1": "0.25rem",
    "space-2": "0.5rem",
    "space-3": "0.75rem",
    "space-4": "1rem",
    "space-5": "1.5rem",
    "radius": "0.5rem",
    "radius-pill": "999px",
    "color-text": "#1b1f27",
    "color-text-muted": "#4d5564",
    "color-surface": "#ffffff",
    "color-surface-sunken": "#f4f5f7",
    "color-border": "#d3d7de",
    "color-accent": "#2445a8",
    "color-positive-fg": "#17603a",
    "color-positive-bg": "#e6f3eb",
    "color-negative-fg": "#a31d1d",
    "color-negative-bg": "#fbe9e9",
    "color-caution-fg": "#6f4700",
    "color-caution-bg": "#fcf1dc",
    "color-neutral-fg": "#3d4452",
    "color-neutral-bg": "#eceef2",
    "color-info-fg": "#1f3c94",
    "color-info-bg": "#e7ecfb",
}

# (foreground token, background token): every pair the kit sets text in.
CONTRAST_PAIRS: tuple[tuple[str, str], ...] = (
    ("color-text", "color-surface"),
    ("color-text", "color-surface-sunken"),
    ("color-text-muted", "color-surface"),
    ("color-text-muted", "color-surface-sunken"),
    ("color-accent", "color-surface"),
    ("color-positive-fg", "color-positive-bg"),
    ("color-negative-fg", "color-negative-bg"),
    ("color-caution-fg", "color-caution-bg"),
    ("color-neutral-fg", "color-neutral-bg"),
    ("color-info-fg", "color-info-bg"),
)

_DECL_RE = re.compile(r"(--[a-z0-9-]+)\s*:\s*([^;]+);")


class TokenDriftError(AssertionError):
    """The stylesheet's generated token block disagrees with ``TOKENS``."""


def token_block() -> str:
    """The ``:root`` block ``TOKENS`` generates, between its two markers."""
    lines = [f"  {PREFIX}{name}: {value};" for name, value in TOKENS.items()]
    return "\n".join([BEGIN_MARKER, ":root {", *lines, "}", END_MARKER])


def _declared_tokens(css: str) -> dict[str, str]:
    start = css.find(BEGIN_MARKER)
    end = css.find(END_MARKER)
    if start < 0 or end < start:
        raise TokenDriftError("stylesheet has no generated token block (markers missing)")
    return {name: value.strip() for name, value in _DECL_RE.findall(css[start:end])}


def check_token_sync(css: str) -> None:
    """Raise ``TokenDriftError`` unless *css*'s token block declares exactly ``TOKENS``."""
    declared = _declared_tokens(css)
    expected = {PREFIX + name: value for name, value in TOKENS.items()}
    problems = [f"{name}: missing from stylesheet" for name in expected if name not in declared]
    problems += [f"{name}: not in TOKENS" for name in declared if name not in expected]
    problems += [
        f"{name}: stylesheet {declared[name]!r} != TOKENS {value!r}"
        for name, value in expected.items()
        if name in declared and declared[name] != value
    ]
    if problems:
        raise TokenDriftError("token drift:\n  " + "\n  ".join(problems))


def kit_css() -> str:
    """The shipped stylesheet, as packaged."""
    return resources.files("capsule_viewer").joinpath("static", "kit.css").read_text(encoding="utf-8")


def regenerate(css: str) -> str:
    """*css* with its token block replaced by the one ``TOKENS`` generates."""
    start = css.find(BEGIN_MARKER)
    end = css.find(END_MARKER)
    if start < 0 or end < start:
        raise TokenDriftError("stylesheet has no generated token block (markers missing)")
    return css[:start] + token_block() + css[end + len(END_MARKER):]
