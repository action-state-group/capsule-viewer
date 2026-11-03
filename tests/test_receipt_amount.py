# SPDX-License-Identifier: Apache-2.0
"""format_amount: fiat by its minor-unit exponent; BTC as millisatoshi counted
(1e-11 BTC), never sats or a BTC decimal. Twin of js-tests/receipt_amount.test.js."""
from __future__ import annotations

import pytest

from capsule_viewer.receipt.model import format_amount


@pytest.mark.parametrize(
    ("minor", "currency", "shown"),
    [
        (500, "BTC", "500 msat"),
        (0, "BTC", "0 msat"),
        (1990, "BTC", "1990 msat"),
        (-5, "BTC", "-5 msat"),
        (627, "USD", "6.27 USD"),
        (500, "JPY", "500 JPY"),
        (1234, "KWD", "1.234 KWD"),
    ],
)
def test_format_amount(minor: int, currency: str, shown: str) -> None:
    assert format_amount(minor, currency) == shown
