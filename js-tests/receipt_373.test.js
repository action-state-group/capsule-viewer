// Steven's hand run of the receipt page (capsule-viewer#373), in the page's own script: the
// parity test holds it to the Python twin with the reader's time zone off; here the page as a
// reader gets it (the registered module), with the zone on.
import { describe, expect, it } from "vitest";
import { readBundle, readVerify, loadScript } from "./receiptScripts.js";
import { standInContext } from "./aacContext.js";

async function page(name, depth = "L2") {
  const lib = loadScript("unilateral");
  const module = lib.registered[0];
  const context = standInContext(readBundle(name), { verify: readVerify(name) });
  const model = await module.buildModel(context);
  const root = lib.document.createElement("div");
  lib.document.body.appendChild(root);
  module.render(model, { L0: root, L1: root, L2: root, depth });
  return { root, lib };
}

describe("the receipt page for a reader (#373)", () => {
  it("says each time in the reader's zone, and keeps the sealed instant on the span", async () => {
    const before = process.env.TZ;
    process.env.TZ = "America/Chicago";
    try {
      const { root } = await page("main-standalone-keep");
      const spans = [...root.querySelectorAll("[data-time]")];
      expect(spans.length).toBeGreaterThan(5);
      expect(spans[0].getAttribute("data-time")).toBe("2026-10-27T22:09:19Z");
      expect(spans[0].textContent).toMatch(/^Oct 27, 2026, 5:09\sPM CDT$/);
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  it("leaves the words in UTC when the script is made without the reader's zone (the parity setting)", async () => {
    const lib = loadScript("unilateral");
    const module = lib.api.createModule("unilateral", {});
    const context = standInContext(readBundle("main-standalone-keep"), { verify: readVerify("main-standalone-keep") });
    const model = await module.buildModel(context);
    const root = lib.document.createElement("div");
    module.render(model, { L0: root, L1: root, L2: root, depth: "L2" });
    expect(root.querySelector("[data-time]").textContent).toBe("Oct 27, 2026, 22:09 UTC");
  });

  it("states test money once and draws no rail row for it", async () => {
    const { root } = await page("main-standalone-simulated-keep");
    expect(root.querySelectorAll("[data-test-money]").length).toBe(1);
    expect(root.querySelectorAll('[data-fact="rail"]').length).toBe(0);
    const card = await page("main-standalone-keep");
    expect(card.root.querySelectorAll("[data-test-money]").length).toBe(0);
  });

  it("words raw codes with the code kept small, shortens ids in the records table, lists problems once", async () => {
    const { root } = await page("main-standalone-keep");
    const pay = root.querySelector('[data-fact="action"]');
    expect(pay.textContent).toBe("Pay"); // the small code is left out when it only repeats the word
    const spend = root.querySelector('[data-fact="action_class"]');
    expect(spend.firstChild.textContent.trim()).toBe("Spend money on a purchase");
    expect(spend.querySelector("[data-code]").textContent).toBe("money.purchase");
    const shown = [...root.querySelectorAll("[data-capsule-id]")];
    expect(shown.length).toBeGreaterThan(5);
    for (const node of shown) {
      const id = node.getAttribute("data-capsule-id");
      expect(node.textContent).toBe(`${id.slice(0, 8)}…${id.slice(-4)}`);
    }
    expect(root.textContent.match(/Problems spotted/g).length).toBe(1);
    expect(root.textContent).not.toContain("Anomalies");
  });

  it("opens with the verifier's outcome and what it tested, and says the page re-checked none of it", async () => {
    const { root } = await page("main-standalone-keep", "L0");
    const note = root.querySelector("[data-checked]");
    expect(note.querySelector("[data-outcome]").getAttribute("data-outcome")).toBe("verified");
    expect(note.textContent).toContain("per record membership (all verified)");
    expect(note.textContent).toContain("it did not re-check anything itself.");
    expect(note.textContent).not.toContain("witnesses");
  });

  it("says an instant in words only when it is a real UTC instant, as the Python twin does", () => {
    const { api } = loadScript("unilateral");
    expect(api.plainTime("2026-10-27T22:09:19Z")).toBe("Oct 27, 2026, 22:09 UTC");
    for (const odd of ["2026-13-27T22:09:19Z", "2026-02-31T99:99:00Z", "2026-10-27T22:09:19Z\n", "٢٠٢٦-10-27T22:09:19Z", "2026-10-27"]) expect(api.plainTime(odd)).toBe(odd);
  });
});
