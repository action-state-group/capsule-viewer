// SPDX-License-Identifier: Apache-2.0
// capsule-viewer#391 (Sherlock2): no Amount card when no signed field carries
// an amount, so "not present" never sits beside a paid deal whose payment is
// only in the producer's prose; a copy whose acted step seals an amount keeps
// the card.
import { describe, expect, it } from "vitest";
import { caseInputs, loadScript, receiptGolden, renderInto } from "./receiptScripts.js";

async function l0(name, audience = "keep") {
  const c = receiptGolden().cases.find((x) => x.name === name && x.audience === audience);
  const lib = loadScript("unilateral");
  const { context, env } = caseInputs(c);
  const module = lib.api.createModule("unilateral", env);
  const model = await module.buildModel(context);
  return { model, host: renderInto(lib, module, model, "L0") };
}

const labels = (host) => [...host.L0.querySelectorAll(".cv-metric__label")].map((n) => n.textContent);

describe("the Amount card (#391)", () => {
  it("is left out when no signed field carries an amount (a Mesh payer's copy)", async () => {
    const { model, host } = await l0("mesh-payer-selected");
    expect(model.headline.amount).toBe("not_present");
    expect(labels(host)).toEqual(["Item", "Where it stands"]);
    expect(host.L0.textContent).not.toMatch(/not present/i);
  });

  it("stays when the acted step seals an amount", async () => {
    const { model, host } = await l0("keep");
    expect(model.headline.amount).not.toBe("not_present");
    expect(labels(host)).toEqual(["Item", "Amount", "Where it stands"]);
  });
});
