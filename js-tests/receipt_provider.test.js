// The provider's own receipt (capsuleviewer.receipt.provider/v0,
// capsule-viewer#390): its amount and time rules, value by value. The
// expected values are tests/test_receipt_provider.py's for the Python twin
// (amount_text, _utc); js-tests/receipt_parity.test.js holds the whole page
// to the twin on the fixture and its edited copies. The rows marked "script
// only" are where a script number or date is not Python's.
import { describe, expect, it } from "vitest";
import { caseInputs, loadScript, receiptGolden } from "./receiptScripts.js";

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

// capsule-viewer#465: a failed or dispatched exchange is drawn with its real
// status, in Sherlock2's words (Steven's u1578 E and F, evidencebook#205). The
// cases are the oracle golden's edited copies of the provider's receipt
// (tests/receipt_oracle.py), whose pages js-tests/receipt_parity.test.js holds
// to the Python twin; this pins the words themselves.
describe("the provider's receipt: a failed or dispatched exchange (#465)", () => {
  const golden = receiptGolden();
  const byName = (label) => golden.cases.find((c) => c.name === `mesh-provider-selected+${label}`);
  const FAILED_TAIL = " It was not served. Any payment this node received for it is listed below.";
  const DISPATCHED =
    "This node's record says the request was sent on, but the host reported no response. It does not show that the exchange was served.";

  // The page as the owner sees it, or as a shared copy (a page saved for anyone) draws it.
  async function draw(label, carrier = null) {
    const lib = loadScript("provider");
    const { context, env } = caseInputs(byName(label));
    const module = lib.api.createModule("provider", env);
    if (!(await module.canRender(context))) return null;
    const model = await module.buildModel(context);
    const doc = lib.document;
    const host = { L0: doc.createElement("div"), L1: doc.createElement("div"), L2: doc.createElement("div"), depth: "L0" };
    if (carrier) {
      const wrap = doc.createElement("div");
      wrap.setAttribute("data-receipt-carrier", carrier);
      wrap.append(host.L0, host.L1, host.L2);
    }
    module.render(model, host, {});
    const l0 = host.L0;
    const status = l0.querySelector('[data-provider="status"]');
    return {
      model,
      title: l0.querySelector("h2")?.textContent ?? null,
      status: status?.textContent ?? null,
      effect: status?.getAttribute("data-effect") ?? null,
      text: l0.textContent,
      rows: l0.querySelectorAll("tbody tr").length,
    };
  }

  it.each([
    ["payment_required", "payment required"],
    ["refused", "refused"],
    ["upstream_error", "upstream error"],
    ["timeout", "timed out"],
    ["dropped", "dropped"],
  ])("a failed record naming %s says why in words, never the code", async (cls, words) => {
    const page = await draw(`failed-${cls}`);
    expect(page.status).toBe(`This node's record says the exchange failed: ${words}.${FAILED_TAIL}`);
    expect(page.effect).toBe("failed");
    expect(page.model.reason).toBe(cls);
    if (cls.includes("_")) expect(page.text).not.toContain(cls);
  });

  it.each(["effect-failed", "failed-something_new"])("a failed record with no reason it can word (%s) states none", async (label) => {
    const page = await draw(label);
    expect(page.status).toBe(`This node's record says the exchange failed.${FAILED_TAIL}`);
    expect(page.model.reason).toBeNull();
    expect(page.text).not.toContain("something_new");
  });

  it("a failed exchange with no payment is drawn, with no payment row", async () => {
    for (const label of ["failed-no-payment", "failed-timeout-no-payment"]) {
      const page = await draw(label);
      expect(page.model.payments).toEqual([]);
      expect(page.rows).toBe(0);
      expect(page.text).toContain("Received (0)");
    }
    expect((await draw("failed-timeout-no-payment")).status).toBe(`This node's record says the exchange failed: timed out.${FAILED_TAIL}`);
  });

  it("a dispatched exchange says no response was recorded, and names no reason", async () => {
    for (const label of ["effect-dispatched", "dispatched-reason-ignored"]) {
      const page = await draw(label);
      expect(page.status).toBe(DISPATCHED);
      expect(page.effect).toBe("dispatched");
      expect(page.model.reason).toBeNull();
    }
  });

  it("a failed or dispatched page says what was asked and when it was recorded, never served", async () => {
    for (const label of ["effect-failed", "effect-dispatched"]) {
      const page = await draw(label);
      expect(page.title).toBe("Your record of an exchange you were asked to serve");
      expect(page.text).toContain("Model asked for");
      expect(page.text).toContain("Recorded at");
      expect(page.text).not.toContain("Model served");
      expect(page.text).not.toContain("Served at");
    }
  });

  it("the confirmed page is as it was: no status line, the served title and labels", async () => {
    const page = await draw("time-offset");
    expect(page.status).toBeNull();
    expect(page.model.effect).toBe("confirmed");
    expect(page.title).toBe("Your receipt for an exchange you served");
    expect(page.text).toContain("Model served");
    expect(page.text).toContain("Served at");
  });

  it("a shared copy of a failed or dispatched page draws no owner's title and speaks of this node, never you", async () => {
    for (const label of ["failed-refused", "effect-dispatched"]) {
      const page = await draw(label, "page");
      expect(page.title).toBeNull();
      expect(page.text).toContain("this node");
      expect(page.text).not.toMatch(/\byou\b/i);
    }
  });

  it.each(["dispatched-no-payment", "confirmed-no-payment", "failed-unsealed-summary"])(
    "%s is not drawn: only a failed exchange may have no payment, and a summary of failures is not one exchange",
    async (label) => {
      expect(await draw(label)).toBeNull();
    },
  );
});
