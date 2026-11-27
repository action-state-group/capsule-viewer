// SPDX-License-Identifier: Apache-2.0
/**
 * The x-deal-v1 receipt pages the view-model note's section 5 tests read
 * (docs/design/receipt-view-model.md; capsule-viewer#488): every deal
 * fixture under tests/testdata/deal-v1, drawn at L2 through the page
 * runtime with capsulectl's report, in each carrier a page has (none, a
 * report, a page shown to others). Shared by the before/after text test and
 * the anti-hardcode test.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPresentationRegistry,
  renderEvidenceGraph,
} from "../../src/evidence-graph-view.js";
import { receiptModules } from "../../src/receipt.js";

export type Obj = Record<string, unknown>;

export const DATA = resolve(process.cwd(), "..", "tests", "testdata");
export const read = (...path: string[]): Obj =>
  JSON.parse(readFileSync(resolve(DATA, "deal-v1", ...path), "utf8")) as Obj;

/** The wording pack the receipt scripts carry, its bytes and their SHA-256. */
export const PACK_BYTES = readFileSync(
  resolve(process.cwd(), "..", "go", "receipt", "wording-en.json"),
);
export const PACK_SHA256 = createHash("sha256")
  .update(PACK_BYTES)
  .digest("hex");

/** One deal fixture: its bundle, capsulectl's report, and any checked side input. */
export type Fixture = {
  readonly name: string;
  readonly bundle: () => Obj;
  readonly report: () => Obj;
  readonly options?: () => Obj;
};

const plain = (name: string, dir = ""): Fixture => ({
  name: dir ? `${dir}/${name}` : name,
  bundle: () => read(...(dir ? [dir] : []), `${name}.bundle.json`),
  report: () => read(...(dir ? [dir] : []), `${name}.verify.json`),
});

export const FIXTURES: readonly Fixture[] = [
  plain("ruled-dispute"),
  plain("keep-copy"),
  plain("counterparty-copy"),
  plain("keep-copy", "offer"),
  plain("same-checkpoint", "countersigned"),
  plain("later-checkpoint", "countersigned"),
  // The view-model note's section 5 fixtures (view-model/README.md): a settled deal given its offer and a verify
  // command beside the copy, an adjudicator copy, a full adjudicator copy, and the differential pairs.
  {
    ...plain("settled", "view-model"),
    name: "view-model/settled+given",
    options: () => ({
      dealOffer: read("view-model", "settled.offer.json"),
      verifyCommand: "capsulectl deal verify --page receipt.html",
    }),
  },
  plain("adjudicator-copy", "view-model"),
  plain("full-adjudicator-copy", "view-model"),
  {
    ...plain("settled", "view-model"),
    options: () => ({ dealOffer: read("view-model", "settled.offer.json") }),
  },
  ...["item-b", "amount-b"].map((name) => ({
    ...plain(name, "view-model/pair"),
    options: () => ({
      dealOffer: read("view-model", "pair", `${name}.offer.json`),
    }),
  })),
  plain("ruled-a", "view-model/pair"),
  plain("ruled-b", "view-model/pair"),
  {
    ...plain("same-checkpoint", "countersigned"),
    name: "countersigned/same-checkpoint+copy",
    options: () => ({
      countersignedCopy: {
        bundle: read("countersigned", "countersigned-copy.bundle.json"),
        countersigners: read("countersigned", "countersigners.json"),
      },
    }),
  },
];

/** Where the page is carried: on its own, in a report, or shown to others as a page. */
export const CARRIERS = [null, "report", "page"] as const;
export type Carrier = (typeof CARRIERS)[number];

/** The page drawn at L2 for one fixture and carrier, and what the receipt module was given. */
export type Drawn = {
  readonly root: HTMLElement;
  /** The verified context the receipt module built its model from (the page's own checks in it). */
  readonly contexts: Obj[];
};
export async function drawPage(
  fixture: Fixture,
  carrier: Carrier,
  bundle: Obj = fixture.bundle(),
): Promise<HTMLElement> {
  return (await drawn(fixture, carrier, bundle)).root;
}
export async function drawn(
  fixture: Fixture,
  carrier: Carrier,
  bundle: Obj = fixture.bundle(),
): Promise<Drawn> {
  const contexts: Obj[] = [];
  const registry = createPresentationRegistry();
  for (const m of receiptModules()) {
    registry.register({
      ...m,
      buildModel: (context: unknown) => {
        contexts.push(context as Obj);
        return m.buildModel(context as never);
      },
    } as typeof m);
  }
  const outer = document.createElement("div");
  if (carrier !== null) outer.setAttribute("data-receipt-carrier", carrier);
  const root = document.createElement("main");
  outer.append(root);
  document.body.append(outer);
  await renderEvidenceGraph(bundle, root, undefined, {
    depth: "L2",
    registry,
    verifierReport: fixture.report(),
    ...(fixture.options ? fixture.options() : {}),
  });
  return { root, contexts };
}

/** The receipt module's three regions (L0, L1, L2) on a drawn page. */
export const DEAL_MODULE = "capsuleviewer.receipt.deal/v1";
export function moduleRegions(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      `[data-receipt-module="${DEAL_MODULE}"]`,
    ),
  );
}
