# SPDX-License-Identifier: Apache-2.0
"""JCS for the bundle digest: RFC 8785 member order and string escaping, and
the values the capsule profile has no canonical form for."""
from __future__ import annotations

import pytest

from capsule_viewer.digest import MAX_SAFE_INTEGER, NotCanonical, bundle_digest, jcs


def test_members_sort_by_utf16_code_units():
    # By code point U+E000 sorts before U+1F600; in UTF-16 U+1F600 is the
    # surrogate pair D83D DE00, which sorts before E000.
    private, emoji = "\ue000", "\U0001f600"
    expected = '{"a":3,"' + emoji + '":1,"' + private + '":2}'
    assert jcs({private: 2, emoji: 1, "a": 3}) == expected.encode()
    assert sorted([private, emoji]) == [private, emoji]  # code-point order differs



def test_strings_escape_as_jcs_does():
    assert jcs("q\" b\\ \b\f\n\r\t \x01 \x7f /") == b'"q\\" b\\\\ \\b\\f\\n\\r\\t \\u0001 \x7f /"'


@pytest.mark.parametrize("value", [1.5, MAX_SAFE_INTEGER + 1, -(MAX_SAFE_INTEGER + 1), "\ud800", {"\ud800": 1}])
def test_values_without_a_canonical_form_are_refused(value):
    with pytest.raises(NotCanonical):
        jcs(value)


def test_countersignatures_are_outside_the_digest():
    bundle = {"bundle_kind": "evidence-bundle/v2", "records": []}
    assert bundle_digest({**bundle, "countersignatures": [{"x": 1}]}) == bundle_digest(bundle)
    assert bundle_digest({**bundle, "root": "r"}) != bundle_digest(bundle)
