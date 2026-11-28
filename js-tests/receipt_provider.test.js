// The provider's own receipt (capsuleviewer.receipt.provider/v0,
// capsule-viewer#390): its amount and time rules, value by value. The
// expected values are tests/test_receipt_provider.py's for the Python twin
// (amount_text, _utc); js-tests/receipt_parity.test.js holds the whole page
// to the twin on the fixture and its edited copies. The rows marked "script
// only" are where a script number or date is not Python's.
import { describe, expect, it } from "vitest";
import { caseInputs, loadScript, readBundle, receiptGolden } from "./receiptScripts.js";

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
    ["2026-10-30T19:50:00Z", "2026-10-30T19:50:00Z"],
    ["2026-10-30T19:50:00z", "2026-10-30T19:50:00Z"],
    ["2026-10-30T14:50:00-05:00", "2026-10-30T19:50:00Z"],
    ["2026-10-30T19:50:00+00:00", "2026-10-30T19:50:00Z"],
    ["2026-10-30T19:50:00", "?"],
    ["not a time", "?"],
    ["0001-01-01T00:00:00+01:00", "?"],
    ["9999-12-31T23:59:59-01:00", "?"],
    ["", "?"],
    // As Python's fromisoformat reads them (checked against it on Python 3.15).
    ["2026-10-30T19:50Z", "2026-10-30T19:50:00Z"],
    ["2026-10-30 19:50:00+00:00", "2026-10-30T19:50:00Z"],
    ["2026-10-30t19:50:00Z", "2026-10-30T19:50:00Z"],
    ["2026-10-30T19:50:00.1234567+00:00", "2026-10-30T19:50:00Z"],
    ["2026-10-30T19:50:00+05", "2026-10-30T14:50:00Z"],
    ["2026-10-30T19:50:00+0530", "2026-10-30T14:20:00Z"],
    ["2026-10-30T19:50:00-00:00", "2026-10-30T19:50:00Z"],
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
      tables: l0.querySelectorAll("table").length,
      noContent: l0.querySelector('[data-provider="no-content"]')?.textContent ?? null,
      records: l0.querySelector('[data-provider="records"]')?.textContent ?? null,
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

  // Sherlock2 on #470: a failed exchange with no payment says so and draws
  // no Received section: no total, no "(0)", no empty table.
  const UNPAID_TAIL = " It was not served. This node received no payment for it.";
  it.each([
    ["failed-no-payment", null],
    ["failed-timeout-no-payment", "page"],
  ])("a failed exchange with no payment (%s, carrier %s) says no payment was received and draws no Received section", async (label, carrier) => {
    const page = await draw(label, carrier);
    expect(page.model.payments).toEqual([]);
    expect(page.rows).toBe(0);
    expect(page.tables).toBe(0);
    expect(page.noContent).toBe("It names the model. It holds no request or response text.");
    expect(page.records).toBe(`The exchange is a record of its own: ${page.model.exchange_id.slice(0, 16)}`);
    expect(page.text).not.toContain("Received");
    expect(page.text).not.toMatch(/payment[^.]*listed below/);
    expect(page.text).not.toContain("0 msat");
  });

  it("the unpaid line names the reason when the record has one, and none when not", async () => {
    expect((await draw("failed-timeout-no-payment")).status).toBe(`This node's record says the exchange failed: timed out.${UNPAID_TAIL}`);
    expect((await draw("failed-no-payment")).status).toBe(`This node's record says the exchange failed.${UNPAID_TAIL}`);
  });

  it("a failed exchange with a payment draws its line and Received section as merged at 44e9c14", async () => {
    const page = await draw("failed-timeout");
    expect(page.status).toBe(`This node's record says the exchange failed: timed out.${FAILED_TAIL}`);
    expect(page.noContent).toBe("It names the model and what was received. It holds no request or response text.");
    expect(page.records).toBe("The exchange and each payment are records of their own, listed below.");
    expect(page.text).toContain(`Received (${page.model.payments.length})`);
    expect(page.text).toContain("Received in total");
    expect(page.rows).toBe(page.model.payments.length);
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

// capsule-viewer#520-#522, from the hand run of Mesh-LLM/capsules-plugin#398,
// in Sherlock2's words (ops 8fdfbac7 and 1af9bb82).
describe("the provider's receipt: payment hash, records note and the minute (#520-#522)", () => {
  const golden = receiptGolden();
  const fixture = golden.cases.find((c) => c.name === "mesh-provider-selected" && c.audience === "keep");

  async function draw({ carrier = null, localTime = false, edit = null } = {}) {
    const lib = loadScript("provider");
    const bundle = structuredClone(readBundle(fixture.name));
    if (edit) edit(bundle);
    const { context, env } = caseInputs({ ...fixture, bundle });
    const module = lib.api.createModule("provider", { ...env, localTime });
    const model = await module.buildModel(context);
    const doc = lib.document;
    const host = { L0: doc.createElement("div"), L1: doc.createElement("div"), L2: doc.createElement("div"), depth: "L0" };
    if (carrier) {
      const wrap = doc.createElement("div");
      wrap.setAttribute("data-receipt-carrier", carrier);
      wrap.append(host.L0, host.L1, host.L2);
    }
    module.render(model, host, {});
    return { model, l0: host.L0, text: host.L0.textContent };
  }
  const legs = () => readBundle(fixture.name).records.filter((r) => r.settlement);

  it.each([null, "page", "report"])("each payment leads with its full Lightning payment hash, its record id beside it (carrier %s)", async (carrier) => {
    const { l0 } = await draw({ carrier });
    expect([...l0.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["Payment hash", "Payment record", "Received", "Fee for receiving"]);
    const rows = [...l0.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent));
    expect(rows).toEqual(legs().map((leg) => [leg.settlement.payment_ref.value, leg.capsule_id.slice(0, 16), "995 msat", "5 msat"]));
    expect(rows[0][0]).toHaveLength(64);
  });

  it.each([
    [undefined],
    [{ type: "ln.preimage", value: "a".repeat(64) }],
    [{ type: "ln.payment_hash", value: 7 }],
    [{ type: "ln.payment_hash", value: "A".repeat(64) }],
    [{ type: "ln.payment_hash", value: "a".repeat(63) }],
    [{ type: "ln.payment_hash", value: "a".repeat(65) }],
    [{ type: "ln.payment_hash", value: "g".repeat(64) }],
    [{ type: "ln.payment_hash", value: "a".repeat(64) + "\n" }],
    [{ value: "a".repeat(64) }],
    ["a".repeat(64)],
  ])("a leg without a Lightning payment hash (%j) shows not shown", async (ref) => {
    const { model, l0 } = await draw({
      edit: (bundle) => {
        const leg = bundle.records.find((r) => r.settlement);
        if (ref === undefined) delete leg.settlement.payment_ref;
        else leg.settlement.payment_ref = ref;
      },
    });
    expect(model.payments.filter((p) => p.payment_hash === null)).toHaveLength(1);
    expect([...l0.querySelectorAll("tbody tr td:first-child")].map((td) => td.textContent)).toContain("not shown");
  });

  it("the records note comes before the records it lists (#521)", async () => {
    const { model, text } = await draw();
    const note = text.indexOf("The exchange and each payment are records of their own, listed below.");
    expect(note).toBeGreaterThan(-1);
    expect(text.indexOf(`Exchange record ${model.exchange_id.slice(0, 16)}`)).toBeGreaterThan(note);
    expect(text.indexOf("Received (2)")).toBeGreaterThan(note);
    for (const leg of legs()) expect(text.indexOf(leg.capsule_id.slice(0, 16))).toBeGreaterThan(note);
  });

  it("the time is said to the minute in UTC words, as a data-time span, with one note (#522)", async () => {
    const { l0, text } = await draw();
    const span = l0.querySelector("[data-time]");
    expect(span.getAttribute("data-time")).toBe("2026-10-30T19:50:00Z");
    expect(span.textContent).toBe("Oct 30, 2026, 19:50 UTC");
    expect(text).not.toMatch(/\d\d:\d\d:\d\d/);
    expect(text.split("Records keep the time to the minute.")).toHaveLength(2);
  });

  it("a page with a script says the time in the reader's zone, with the zone named", async () => {
    const { l0 } = await draw({ localTime: true });
    const shown = l0.querySelector("[data-time]").textContent;
    expect(shown).not.toBe("Oct 30, 2026, 19:50 UTC");
    expect(shown).toMatch(/2026/);
    expect(shown).not.toMatch(/:\d\d:\d\d/);
    // The zone is named (Intl's short zone name, "UTC" or "GMT…" in a UTC test run, "CDT" elsewhere).
    expect(shown).toMatch(/[A-Z]{2,}|GMT[+-]\d/);
  });

  it.each(["page", "report"])("a shared copy (%s) keeps the time in UTC words, which no local-time pass rewrites", async (carrier) => {
    const { l0, text } = await draw({ carrier, localTime: true });
    expect(l0.querySelector("[data-time]")).toBeNull();
    expect(text).toContain("Oct 30, 2026, 19:50 UTC");
    expect(text).toContain("Records keep the time to the minute.");
  });
});
