// The provider's own receipt (capsuleviewer.receipt.provider/v0,
// capsule-viewer#390): its amount and time rules, value by value. The
// expected values are tests/test_receipt_provider.py's for the Python twin
// (amount_text, _utc); js-tests/receipt_parity.test.js holds the whole page
// to the twin on the fixture and its edited copies. The rows marked "script
// only" are where a script number or date is not Python's.
import { describe, expect, it } from "vitest";
import { loadScript } from "./receiptScripts.js";

const { api } = loadScript("provider");
const text = (amount) => api.providerAmount(amount)?.text ?? null;

describe("the provider's receipt: amounts (provider.amount_text)", () => {
  it.each([
    [{ value: "995", assetCode: "BTC", assetScale: 11 }, "995 msat"],
    [{ value: "0", assetCode: "BTC", assetScale: 11 }, "0 msat"],
    [{ value: "5", assetCode: "BTC", assetScale: 11, extra: 1 }, null],
    [{ value: "0995", assetCode: "BTC", assetScale: 11 }, null],
    [{ value: "7", assetCode: "USD", assetScale: -2 }, null],
    [{ value: "7", assetCode: "USD", assetScale: 300 }, null],
    [{ value: "7", assetCode: "USD", assetScale: 255 }, "7 × 10^-255 USD"],
    [{ value: "12", assetCode: "BTC", assetScale: 8 }, "12 × 10^-8 BTC"],
    [{ value: "7", assetCode: "USD", assetScale: 2 }, "7 × 10^-2 USD"],
    [{ value: "995", assetScale: 11 }, null],
    [{ value: "995", assetCode: "BTC" }, null],
    [{ value: "-5", assetCode: "BTC", assetScale: 11 }, null],
    [{ value: "1.5", assetCode: "BTC", assetScale: 11 }, null],
    [{ value: 995, assetCode: "BTC", assetScale: 11 }, null],
    [null, null],
    // Script only: exact past 2^53, as Python's int is.
    [{ value: "9007199254740993995", assetCode: "BTC", assetScale: 11 }, "9,007,199,254,740,993,995 msat"],
    [{ value: "123456789012345678901234567890", assetCode: "USD", assetScale: 2 }, "123456789012345678901234567890 × 10^-2 USD"],
    [{ value: "7", assetCode: "USD", assetScale: true }, null],
    [{ value: "7", assetCode: "USD", assetScale: 2.5 }, null],
  ])("%j is %j", (amount, shown) => {
    expect(text(amount)).toBe(shown);
  });

  it("an msat amount carries its exact value for the total", () => {
    expect(api.providerAmount({ value: "9007199254740993995", assetCode: "BTC", assetScale: 11 }).msat).toBe("9007199254740993995");
    expect(api.providerAmount({ value: "12", assetCode: "BTC", assetScale: 8 }).msat).toBeNull();
  });

  // JSON cannot tell 11.0 from 11 once parsed: the script reads a scale of
  // 11.0 as 11, where Python's json reads a float and shows nothing. No
  // provider bundle writes a scale with a fraction.
  it("script only: a scale written 11.0 reads as 11", () => {
    expect(text(JSON.parse('{"value": "5", "assetCode": "BTC", "assetScale": 11.0}'))).toBe("5 msat");
  });
});

describe("the provider's receipt: the served time (provider._utc)", () => {
  it.each([
    ["2026-10-30T19:50:00Z", "2026-10-30T19:50:00 UTC"],
    ["2026-10-30T19:50:00z", "2026-10-30T19:50:00 UTC"],
    ["2026-10-30T14:50:00-05:00", "2026-10-30T19:50:00 UTC"],
    ["2026-10-30T19:50:00+00:00", "2026-10-30T19:50:00 UTC"],
    ["2026-10-30T19:50:00", "?"],
    ["not a time", "?"],
    ["0001-01-01T00:00:00+01:00", "?"],
    ["9999-12-31T23:59:59-01:00", "?"],
    ["", "?"],
    // As Python's fromisoformat reads them (checked against it on Python 3.15).
    ["2026-10-30T19:50Z", "2026-10-30T19:50:00 UTC"],
    ["2026-10-30 19:50:00+00:00", "2026-10-30T19:50:00 UTC"],
    ["2026-10-30t19:50:00Z", "2026-10-30T19:50:00 UTC"],
    ["2026-10-30T19:50:00.1234567+00:00", "2026-10-30T19:50:00 UTC"],
    ["2026-10-30T19:50:00+05", "2026-10-30T14:50:00 UTC"],
    ["2026-10-30T19:50:00+0530", "2026-10-30T14:20:00 UTC"],
    ["2026-10-30T19:50:00-00:00", "2026-10-30T19:50:00 UTC"],
    ["2026-10-30T19:50:60Z", "?"],
    ["2026-06-31T10:00:00Z", "?"],
    ["0000-12-31T23:00:00-02:00", "?"],
    ["２０２６-10-30T19:50:00Z", "?"],
  ])("%s is %s", (stamp, shown) => {
    expect(api.providerUtc(stamp)).toBe(shown);
  });

  // Python's fromisoformat reads these too, on Python 3.15:
  // 2026-10-31T00:00:00, 2026-10-30T14:49:30, 2026-10-30T19:50:00,
  // 2026-10-30T19:00:00, 2026-10-30T19:50:00 and 2026-10-30T19:50:00 UTC.
  // No provider bundle writes them, and the script shows "?" rather than a
  // time it is not sure of.
  it.each([
    "2026-10-30T24:00:00+00:00",
    "2026-10-30T19:50:00+05:00:30",
    "2026-10-30x19:50:00Z",
    "2026-10-30T19Z",
    "2026-10-30T195000Z",
    "2026-10-30T19:50:00,25Z",
  ])("script only: %s is ?", (stamp) => {
    expect(api.providerUtc(stamp)).toBe("?");
  });
});
