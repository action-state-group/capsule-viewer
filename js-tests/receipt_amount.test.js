// formatAmount in each receipt script: fiat by its minor-unit exponent, BTC as
// millisatoshi counted ("500 msat", never sats or a BTC decimal). Twin of
// tests/test_receipt_amount.py.
import { describe, expect, it } from "vitest";
import { KINDS, loadScript } from "./receiptScripts.js";

describe.each(KINDS)("formatAmount in the %s script", (kind) => {
  const { api } = loadScript(kind);
  it("shows BTC as msat", () => {
    expect(api.formatAmount(500, "BTC")).toBe("500 msat");
    expect(api.formatAmount(0, "BTC")).toBe("0 msat");
    expect(api.formatAmount(1990, "BTC")).toBe("1990 msat");
    expect(api.formatAmount(-5, "BTC")).toBe("-5 msat");
  });
  it("leaves fiat unchanged", () => {
    expect(api.formatAmount(627, "USD")).toBe("6.27 USD");
    expect(api.formatAmount(500, "JPY")).toBe("500 JPY");
    expect(api.formatAmount(1234, "KWD")).toBe("1.234 KWD");
  });
});
