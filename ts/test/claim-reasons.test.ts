// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

// The reason a claim gives for being undecided or for a grade below
// countersigned (contract-report-module-v1 section 2, Reasons), read from
// `claim.reason` and worded by `row.<ref>.reason.<code>`.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import { claimReasons } from "../src/claim-reasons.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

function source(change?: (claims: Obj[]) => void): Obj {
  const bundle = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "test", "testdata", "result-root-bundle.json"),
      "utf8",
    ),
  ) as Obj;
  bundle.extensions = {
    ...((bundle.extensions as Obj | undefined) ?? {}),
    "contract-report/v1": {},
  };
  const doc = ((bundle.disclosures as Obj).result as Obj).agent_input as Obj;
  change?.(doc.claims as Obj[]);
  return bundle;
}

function pack(entries: Record<string, string>): {
  pack: string;
  sha256: string;
} {
  const text = JSON.stringify({
    wording_pack_version: "aac.wording-pack/v0",
    id: "test/reasons@1",
    locale: "en",
    entries,
  });
  return {
    pack: text,
    sha256: createHash("sha256").update(text).digest("hex"),
  };
}

async function draw(
  bundle: Obj,
  wording?: { pack: string; sha256: string },
): Promise<HTMLElement> {
  const { bundle: sealed } = await sealEvidenceBundle(bundle);
  const root = document.createElement("main");
  await renderEvidenceGraph(sealed, root, undefined, {
    ...(wording === undefined ? {} : { wording }),
    depth: "L2",
  });
  return root;
}

const lines = (root: HTMLElement): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>("[data-reason-code]"),
];

// claim-2 is not_met and self-attested; claim-3 is not_evaluable and countersigned.
const WORDS = {
  "row.req-3.reason.capsule_signature_did_not_verify":
    "A record's signature did not verify: it was altered, or it is not what it claims.",
  "row.req-2.reason.counterparty_leg_signer_not_trusted":
    "The other side signed with a key you have not chosen to trust.",
};

it("a not_evaluable claim's reason and a self-attested claim's reason show beside the claim, in the pack's words, labelled as the producer's", async () => {
  const root = await draw(
    source((claims) => {
      claims[2]!.reason = "capsule_signature_did_not_verify";
      claims[1]!.reason = "counterparty_leg_signer_not_trusted";
    }),
    pack(WORDS),
  );
  const undecided = root.querySelector<HTMLElement>(
    '[data-claim-ref="claim-3"] [data-reason-code]',
  )!;
  expect(undecided.textContent).toBe(
    `The report's producer says: ${WORDS["row.req-3.reason.capsule_signature_did_not_verify"]}`,
  );
  // a signature that failed to verify is a finding, drawn as a warning
  expect(undecided.dataset.tone).toBe("warn");
  const leg = root.querySelector<HTMLElement>(
    '[data-claim-ref="claim-2"] [data-reason-code]',
  )!;
  expect(leg.textContent).toBe(
    `Grade: self-attested. The report's producer says: ${WORDS["row.req-2.reason.counterparty_leg_signer_not_trusted"]}`,
  );
  // "not trusted" is a reader setting, not a finding
  expect(leg.dataset.tone).toBe("note");
  // the row's summary says that one of its claims gives a reason
  const flag = root
    .querySelector('details[data-row="req-3"] summary')!
    .querySelector<HTMLElement>(".rflag")!;
  expect(flag.textContent).toBe("1 claim with a reason from the producer");
  expect(flag.dataset.tone).toBe("warn");
});

it("a code the pack has no sentence for shows a core line naming the raw code", async () => {
  const root = await draw(
    source((claims) => {
      claims[2]!.reason = "inference_deals_digest_mismatch";
    }),
  );
  expect(lines(root).map((l) => l.textContent)).toEqual([
    "The report's producer gives a reason this page has no words for: inference_deals_digest_mismatch",
  ]);
});

it("a reason changes no verdict, grade, tally or count", async () => {
  const plain = await draw(source(), pack(WORDS));
  const reasoned = await draw(
    source((claims) => {
      claims[2]!.reason = "capsule_signature_did_not_verify";
      claims[1]!.reason = "counterparty_leg_signer_not_trusted";
    }),
    pack(WORDS),
  );
  const facts = (root: HTMLElement) => [
    root.querySelector("[data-counts]")!.textContent,
    ...[...root.querySelectorAll("[data-tally]")].map((n) => n.textContent),
    ...[...root.querySelectorAll("[data-verdict]")].map((n) => n.textContent),
    ...[...root.querySelectorAll(".agg-bucket")].map((n) => n.textContent),
  ];
  expect(facts(reasoned)).toEqual(facts(plain));
});

it("a reserved code is shown as the raw code, never worded", async () => {
  const root = await draw(
    source((claims) => {
      claims[2]!.reason = "not_evaluable";
    }),
    pack({ ...WORDS, "row.req-3.reason.not_evaluable": "must not be used" }),
  );
  expect(lines(root).map((l) => l.textContent)).toEqual([
    "The report's producer gives a reason this page has no words for: not_evaluable",
  ]);
});

it("claimReasons reads claim.reason and its kind; a failed claim or one without a reason gets none", () => {
  const claim = (extra: object) =>
    ({ id: "c", failed: false, ...extra }) as never;
  const got = (extra: object) => claimReasons([claim(extra)]).get("c");
  expect(
    got({ reason: "capsule_signer_not_trusted", reasonKind: "setting" }),
  ).toEqual({
    code: "capsule_signer_not_trusted",
    kind: "setting",
    keyable: true,
  });
  expect(got({ reason: "later_token", reasonKind: "unregistered" })).toEqual({
    code: "later_token",
    kind: "unregistered",
    keyable: true,
  });
  expect(got({})).toBeUndefined();
  expect(
    got({ failed: true, reason: "capsule_signer_not_trusted" }),
  ).toBeUndefined();
});

it("an unregistered token is shown raw and neutrally, never as a finding", async () => {
  const root = await draw(
    source((claims) => {
      claims[2]!.reason = "inference_deals_digest_mismatch";
    }),
  );
  expect(lines(root)[0]!.dataset.tone).toBe("note");
  expect(lines(root)[0]!.dataset.reasonKind).toBe("unregistered");
});

it("a Result citing two contracts shows no reason at all", async () => {
  const root = await draw(
    source((claims) => {
      claims[2]!.contract_ref = "ec:other@1";
      claims[2]!.reason = "capsule_signature_did_not_verify";
    }),
    pack(WORDS),
  );
  expect(lines(root)).toEqual([]);
});
