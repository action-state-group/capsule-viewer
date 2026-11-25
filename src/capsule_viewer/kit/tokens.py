# SPDX-License-Identifier: Apache-2.0
"""The kit's design tokens: ONE source, generated CSS, and a drift guard.

``TOKENS`` below is generated from ``tokens/tokens.json`` (the one token source
for the kit, the emitter shell and the report frames; ``scripts/gen-tokens.py``
rewrites it). The
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

# Name (without the prefix) -> CSS value. Order is the emitted order. The
# entries are generated from tokens/tokens.json (scripts/gen-tokens.py).
TOKENS: dict[str, str] = {
# BEGIN GENERATED TOKENS (tokens/tokens.json) -- do not edit by hand
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
# END GENERATED TOKENS
}

# Colour token name (without the prefix) -> its value on a host that declares
# a dark colour scheme. Generated from tokens/tokens.json's "kit-dark"
# (scripts/gen-tokens.py), which writes it into static/kit-dark.css
# (dark_stylesheet()). kit.css itself stays light: only the go/receipt modules
# insert kit-dark.css, scoped to a receipt (capsule-viewer#391).
KIT_DARK: dict[str, str] = {
# BEGIN GENERATED KIT-DARK (tokens/tokens.json) -- do not edit by hand
    "color-text": "#e6e9ef",
    "color-text-muted": "#aab1bd",
    "color-surface": "#16191f",
    "color-surface-sunken": "#1e222a",
    "color-border": "#3a414d",
    "color-accent": "#9db4ff",
    "color-positive-fg": "#7fd8a2",
    "color-positive-bg": "#12301f",
    "color-negative-fg": "#ff9a92",
    "color-negative-bg": "#3b1a18",
    "color-caution-fg": "#f0c674",
    "color-caution-bg": "#33270d",
    "color-neutral-fg": "#c7ccd6",
    "color-neutral-bg": "#262b34",
    "color-info-fg": "#a9bdff",
    "color-info-bg": "#1b2546",
# END GENERATED KIT-DARK
}

# (foreground token, background token): every pair the kit sets text in,
# held to AA in both the light and the dark values. Text in a receipt's
# halves sits on the info, caution and neutral backgrounds, and its prompts
# are info-fg on the surface.
CONTRAST_PAIRS: tuple[tuple[str, str], ...] = (
    ("color-text", "color-surface"),
    ("color-text", "color-surface-sunken"),
    ("color-text-muted", "color-surface"),
    ("color-text-muted", "color-surface-sunken"),
    ("color-accent", "color-surface"),
    ("color-accent", "color-surface-sunken"),
    ("color-positive-fg", "color-positive-bg"),
    ("color-negative-fg", "color-negative-bg"),
    ("color-caution-fg", "color-caution-bg"),
    ("color-neutral-fg", "color-neutral-bg"),
    ("color-info-fg", "color-info-bg"),
    ("color-info-fg", "color-surface"),
    ("color-text", "color-info-bg"),
    ("color-text", "color-caution-bg"),
    ("color-text", "color-neutral-bg"),
    ("color-text-muted", "color-info-bg"),
    ("color-text-muted", "color-caution-bg"),
    ("color-text-muted", "color-neutral-bg"),
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


DARK_HEADER = """/* SPDX-License-Identifier: Apache-2.0 */
/*
 * kit-dark.css -- GENERATED from tokens/tokens.json ("kit-dark") by
 * scripts/gen-tokens.py. Do not edit by hand.
 *
 * Inserted after kit.css by the go/receipt modules only, as a stylesheet of
 * their own, and scoped to a receipt ([data-receipt-module]), so no other
 * kit module's card changes. Each colour token becomes
 * light-dark(<light>, <dark>), which follows the colour scheme the host page
 * declares (color-scheme), not the reader's OS: a host that declares
 * "light dark" gets the dark values in dark mode, and a host that declares
 * none stays light. A browser without light-dark() skips the @supports block
 * and keeps kit.css's light values.
 */
"""


def dark_stylesheet(light: dict[str, str] | None = None, dark: dict[str, str] | None = None) -> str:
    """static/kit-dark.css: a light-dark() override for every colour token."""
    light = TOKENS if light is None else light
    dark = KIT_DARK if dark is None else dark
    colours = [name for name in light if name.startswith("color-")]
    missing = sorted(set(colours) ^ set(dark))
    if missing:
        raise TokenDriftError("kit-dark must name exactly the kit's colour tokens: " + ", ".join(missing))
    lines = [f"    {PREFIX}{name}: light-dark({light[name]}, {dark[name]});" for name in colours]
    return DARK_HEADER + "@supports (color: light-dark(#000, #fff)) {\n  [data-receipt-module] {\n" + "\n".join(lines) + "\n  }\n}\n"


def kit_dark_css() -> str:
    """The shipped dark stylesheet, as packaged."""
    return resources.files("capsule_viewer").joinpath("static", "kit-dark.css").read_text(encoding="utf-8")


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
