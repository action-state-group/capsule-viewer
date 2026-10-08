# SPDX-License-Identifier: Apache-2.0
"""The kit's tokens: the shipped stylesheet's generated block equals what
``TOKENS`` generates (the drift guard), no component rule hard-codes a colour,
and every text/background pair the kit uses meets WCAG AA."""
from __future__ import annotations

import re

import pytest

from capsule_viewer.kit.tokens import (
    BEGIN_MARKER,
    CONTRAST_PAIRS,
    END_MARKER,
    PREFIX,
    TOKENS,
    TokenDriftError,
    check_token_sync,
    kit_css,
    regenerate,
    token_block,
)


def test_shipped_stylesheet_matches_token_source():
    check_token_sync(kit_css())


def test_shipped_stylesheet_is_exactly_what_the_source_regenerates():
    css = kit_css()
    assert regenerate(css) == css


@pytest.mark.parametrize(
    ("edit", "expected"),
    [
        # A token hex in the stylesheet disagrees with the source.
        (lambda css: css.replace("--cv-color-text: #1b1f27;", "--cv-color-text: #1b1f28;"), "--cv-color-text: stylesheet '#1b1f28'"),
        # A token is missing from the stylesheet.
        (lambda css: css.replace("  --cv-color-accent: #2445a8;\n", ""), "--cv-color-accent: missing from stylesheet"),
        # The stylesheet declares a token the source does not.
        (lambda css: css.replace(":root {\n", ":root {\n  --cv-color-extra: #000000;\n", 1), "--cv-color-extra: not in TOKENS"),
        # The generated block is gone altogether.
        (lambda css: css.replace(BEGIN_MARKER, ""), "markers missing"),
    ],
    ids=["hex-differs", "token-missing", "token-extra", "block-missing"],
)
def test_drift_guard_fails_on_a_drifted_stylesheet(edit, expected):
    drifted = edit(kit_css())
    assert drifted != kit_css()
    with pytest.raises(TokenDriftError, match=re.escape(expected)):
        check_token_sync(drifted)


def test_drift_guard_fails_when_the_source_changes_and_the_css_is_not_regenerated(monkeypatch):
    css = kit_css()
    monkeypatch.setitem(TOKENS, "color-negative-fg", "#a31d1e")
    with pytest.raises(TokenDriftError, match="--cv-color-negative-fg"):
        check_token_sync(css)


def test_every_token_uses_the_kit_prefix_and_no_other_custom_property_is_declared():
    css = kit_css()
    declared = set(re.findall(r"(--[a-z0-9-]+)\s*:", css))
    assert declared == {PREFIX + name for name in TOKENS}
    assert token_block() in css


def test_no_literal_colour_outside_the_generated_block():
    css = kit_css()
    rules = css[css.index(END_MARKER) + len(END_MARKER):]
    rules = re.sub(r"/\*.*?\*/", "", rules, flags=re.S)
    assert re.findall(r"#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(", rules) == []


def _luminance(hex_colour: str) -> float:
    channels = [int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast(fg: str, bg: str) -> float:
    hi, lo = sorted((_luminance(fg), _luminance(bg)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def test_contrast_formula_matches_known_values():
    assert contrast("#000000", "#ffffff") == pytest.approx(21.0)
    assert contrast("#777777", "#ffffff") == pytest.approx(4.48, abs=0.01)  # the classic AA near-miss


@pytest.mark.parametrize(("fg", "bg"), CONTRAST_PAIRS, ids=[f"{f}-on-{b}" for f, b in CONTRAST_PAIRS])
def test_text_pairs_meet_wcag_aa(fg, bg):
    ratio = contrast(TOKENS[fg], TOKENS[bg])
    assert ratio >= 4.5, f"{fg} on {bg}: {ratio:.2f}:1 < 4.5:1"


def test_every_tone_the_css_uses_has_a_checked_pair():
    css = kit_css()
    tones = set(re.findall(r"\.cv-tone--([a-z]+)", css))
    checked = {fg.removeprefix("color-").removesuffix("-fg") for fg, _ in CONTRAST_PAIRS}
    assert tones and tones <= checked
