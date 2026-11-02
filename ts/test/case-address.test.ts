// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom
//
// A case's card address, `#case-<case id>` (capsule-viewer#243,
// docs/design/report-views.md "Case address"): the Outcomes page's
// per-conversation card and the EU AI Act page's per-session card.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import {
  anchorCases,
  caseAddress,
  caseHref,
  fillForNoScript,
  openToggle,
  revealCase,
} from "../src/report-levels.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

function fixture(name: string): Obj {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "test", "testdata", name), "utf8"),
  ) as Obj;
}

function resultOf(source: Obj): Obj {
  return ((source.disclosures as Obj).result as Obj).agent_input as Obj;
}

/** The fixture's case ids, in claim order. */
function caseIds(source: Obj): string[] {
  const ids = (resultOf(source).claims as Obj[]).map(
    (c) => (c.id as string).split("::")[0]!,
  );
  return [...new Set(ids)];
}

/** The fixture with some cases renamed: claim ids and the aggregate's buckets. */
function renamed(source: Obj, names: ReadonlyMap<string, string>): Obj {
  const result = resultOf(source);
  const rename = (id: string): string => {
    const sep = id.indexOf("::");
    const to = names.get(id.slice(0, sep));
    return to === undefined ? id : `${to}${id.slice(sep)}`;
  };
  const aggregate = result.aggregate as Obj;
  const buckets = Object.fromEntries(
    Object.entries(aggregate.buckets as Record<string, string[]>).map(
      ([k, ids]) => [k, ids.map(rename)],
    ),
  );
  (source.disclosures as Obj).result = {
    agent_input: {
      ...result,
      claims: (result.claims as Obj[]).map((c) => ({
        ...c,
        id: rename(c.id as string),
      })),
      aggregate: { ...aggregate, buckets },
    },
  };
  return source;
}

async function renderAt(source: Obj, hash: string): Promise<HTMLElement> {
  const { bundle } = await sealEvidenceBundle(source);
  const root = document.createElement("main");
  document.body.append(root);
  window.location.hash = hash;
  await renderEvidenceGraph(bundle, root);
  return root;
}

/** Every toggle that shows `el` is open: each <details> around it, and the
 * toggle of each expandable row whose detail row holds it. */
function shown(el: Element): boolean {
  for (let at = el.parentElement; at !== null; at = at.parentElement) {
    if (at.localName === "details" && !(at as HTMLDetailsElement).open)
      return false;
    if (at.matches("tr.x-detail")) {
      const toggle =
        at.previousElementSibling?.querySelector<HTMLDetailsElement>(
          "details.rx",
        );
      if (toggle === null || toggle === undefined || !toggle.open) return false;
    }
  }
  return true;
}

afterEach(() => {
  window.location.hash = "";
  document.body.replaceChildren();
});

it("the address is `case-` plus the case id, and a link percent-encodes it as a fragment that decodes back", () => {
  const id = "tau2:airline:task-29:trial-0";
  expect(caseAddress(id)).toBe("case-tau2:airline:task-29:trial-0");
  for (const each of [id, "a7e2c4/0c4f", "with space%"]) {
    const href = caseHref(each);
    expect(href.startsWith("#case-")).toBe(true);
    expect(decodeURIComponent(href.slice("#case-".length))).toBe(each);
  }
});

it("Outcomes: a page opened at a case's address opens that conversation's card and every toggle around it", async () => {
  const source = fixture("outcome-report-bundle.json");
  const id = caseIds(source)[3]!;
  const root = await renderAt(source, caseHref(id));
  const card = document.getElementById(caseAddress(id))!;
  expect(card).not.toBeNull();
  expect(root.contains(card)).toBe(true);
  expect(card.matches("article.conv")).toBe(true);
  expect(card.dataset.conversation).toBe(id);
  expect(card.dataset.case).toBe(id);
  expect(shown(card)).toBe(true);
  // One card holds the address, however many toggles list the case.
  expect(root.querySelectorAll(`[id="${caseAddress(id)}"]`)).toHaveLength(1);
});

it("a case id that is a prefix of another names only its own card (task-2 vs task-29, and a judge's root/capsule id)", async () => {
  const source = fixture("outcome-report-bundle.json");
  const [a, b, c] = caseIds(source);
  const names = new Map([
    [a!, "tau2:airline:task-2"],
    [b!, "tau2:airline:task-29"],
    [c!, "tau2:airline:task-2/c0ffee"],
  ]);
  const prepared = renamed(source, names);
  for (const id of names.values()) {
    const root = await renderAt(
      JSON.parse(JSON.stringify(prepared)) as Obj,
      caseHref(id),
    );
    const card = document.getElementById(caseAddress(id))!;
    expect(card, id).not.toBeNull();
    expect(card.dataset.case, id).toBe(id);
    expect(shown(card), id).toBe(true);
    // Every card that holds an address holds its own case's, whole.
    for (const held of root.querySelectorAll<HTMLElement>("[data-case][id]"))
      expect(held.id, id).toBe(caseAddress(held.dataset.case!));
    expect(root.querySelectorAll(`[id="${caseAddress(id)}"]`), id).toHaveLength(
      1,
    );
    window.location.hash = "";
    document.body.replaceChildren();
  }
});

it("an address names no card when the case is not on the page, or does not decode: nothing opens and nothing fails", async () => {
  const source = fixture("outcome-report-bundle.json");
  const id = caseIds(source)[0]!;
  for (const hash of [
    caseHref(`${id}x`),
    caseHref(id.slice(0, -1)),
    "#case-%",
    "#case-%E0",
  ]) {
    const root = await renderAt(
      JSON.parse(JSON.stringify(source)) as Obj,
      hash,
    );
    expect(root.querySelector("[data-case][id]"), hash).toBeNull();
    expect(() =>
      window.dispatchEvent(new HashChangeEvent("hashchange")),
    ).not.toThrow();
    document.body.replaceChildren();
  }
});

it("a later address change opens the card too", async () => {
  const source = fixture("outcome-report-bundle.json");
  const id = caseIds(source)[5]!;
  await renderAt(source, "");
  expect(document.getElementById(caseAddress(id))).toBeNull();
  window.location.hash = caseHref(id);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  const card = document.getElementById(caseAddress(id))!;
  expect(card.dataset.case).toBe(id);
  expect(shown(card)).toBe(true);
});

it("EU AI Act: a session's card carries its case and opens at its address", async () => {
  const source = fixture("compliance-bundle.json");
  const root = await renderAt(source, "");
  // Sessions are listed under the tests they miss: build them all to find one.
  fillForNoScript(root);
  const session = root.querySelector<HTMLElement>("article[data-session]")!;
  const id = session.dataset.session!;
  expect(session.dataset.case).toBe(id);
  document.body.replaceChildren();

  await renderAt(fixture("compliance-bundle.json"), caseHref(id));
  const card = document.getElementById(caseAddress(id))!;
  expect(card.matches("article[data-session]")).toBe(true);
  expect(card.dataset.case).toBe(id);
  // The card sits in a test row's detail row: that row's toggle opened.
  expect(card.closest("tr.x-detail")).not.toBeNull();
  expect(shown(card)).toBe(true);
});

it("Outcomes: a card built in a rule row the reader then closed opens again at its address", async () => {
  const source = fixture("outcome-report-bundle.json");
  const root = await renderAt(source, "");
  // The first rule row whose problems list a conversation.
  let rule: HTMLDetailsElement | undefined;
  let card: HTMLElement | null = null;
  for (const each of root.querySelectorAll<HTMLDetailsElement>(
    'details.rx[data-drill^="rule:"]',
  )) {
    openToggle(each);
    each.open = false;
    card = each
      .closest("tr")!
      .nextElementSibling!.querySelector<HTMLElement>("[data-case][id]");
    if (card !== null) {
      rule = each;
      break;
    }
  }
  if (rule === undefined || card === null)
    throw new Error("the fixture has no rule row with a conversation");
  expect(shown(card)).toBe(false);
  window.location.hash = caseHref(card.dataset.case!);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  expect(rule.open).toBe(true);
  expect(shown(card)).toBe(true);
});

it("a page that runs no script anchors the first card of each case once, so a plain fragment reaches it", async () => {
  const source = fixture("outcome-report-bundle.json");
  const root = await renderAt(source, "");
  fillForNoScript(root);
  const cards = [...root.querySelectorAll<HTMLElement>("[data-case]")];
  const cases = new Set(cards.map((c) => c.dataset.case!));
  const anchored = cards.filter((c) => c.id !== "");
  expect(anchored.map((c) => c.dataset.case).sort()).toEqual([...cases].sort());
  for (const card of anchored) {
    expect(card.id).toBe(caseAddress(card.dataset.case!));
    expect(card).toBe(cards.find((c) => c.dataset.case === card.dataset.case));
  }
  expect(anchorCases(root)).toBe(0);
});

it("revealCase on a case whose card is already drawn reuses it and opens its toggles", async () => {
  const source = fixture("outcome-report-bundle.json");
  const root = await renderAt(source, "");
  fillForNoScript(root);
  const card = root.querySelector<HTMLElement>("[data-case][id]")!;
  revealCase(document, card.dataset.case!);
  expect(shown(card)).toBe(true);
});
