// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
/**
 * The anti-hardcode test of the receipt view-model note's section 5
 * (docs/design/receipt-view-model.md; capsule-viewer#488), for the x-deal-v1
 * receipt: on every deal fixture, in every carrier, each visible text node of
 * the receipt module's region is a wording-pack string or a value read from
 * the copy, and each value resolves (helpers/receipt-anti-hardcode.ts says
 * how). The nodes PR 3 of the note replaces are left out (EXCLUDED).
 */
import { bundleDigest } from "@action-state-group/agent-action-capsule";
import { describe, expect, it } from "vitest";
import { check, type Inputs } from "./helpers/receipt-anti-hardcode.js";
import {
  CARRIERS,
  FIXTURES,
  type Obj,
  drawn,
  moduleRegions,
  type Fixture,
  type Carrier,
} from "./helpers/receipt-deal-v1-pages.js";

/** The page, its regions and what the check reads besides it. */
export async function page(
  fixture: Fixture,
  carrier: Carrier,
  bundle: Obj = fixture.bundle(),
): Promise<{ regions: HTMLElement[]; inputs: Inputs }> {
  const { root, contexts } = await drawn(fixture, carrier, bundle);
  const context = contexts[contexts.length - 1] ?? {};
  const extensions = ((context["verification"] as Obj | undefined)?.[
    "extensions"
  ] ?? []) as Obj[];
  // The x-deal-v1 entry the page added for the receipt module (withVerifierReport).
  const entry =
    extensions.find(
      (e) =>
        e["kind"] === "x-deal-v1" &&
        e["report"] === "standalone" &&
        e["integrityCovered"] === true,
    ) ?? {};
  const options = fixture.options ? fixture.options() : {};
  return {
    regions: moduleRegions(root),
    inputs: {
      bundle,
      report: fixture.report(),
      given: {
        ...(options["verifyCommand"] === undefined
          ? {}
          : { verify_command: options["verifyCommand"] }),
        ...(options["dealOffer"] === undefined
          ? {}
          : { deal_offer: options["dealOffer"] }),
      },
      entry,
      digest: await bundleDigest(bundle as never),
      memberships: ((context["completeness"] as Obj | undefined)?.[
        "memberships"
      ] ?? {}) as Obj,
    },
  };
}

describe("every word on an x-deal-v1 receipt is the pack's or the copy's (note section 5)", () => {
  for (const fixture of FIXTURES) {
    for (const carrier of CARRIERS) {
      it(`${fixture.name}, ${carrier ?? "own page"}`, async () => {
        const { regions, inputs } = await page(fixture, carrier);
        expect(regions).toHaveLength(3);
        const problems = regions.flatMap((r) => check(r, inputs));
        expect(problems).toEqual([]);
      });
    }
  }
});
