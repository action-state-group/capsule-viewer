// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
/**
 * What a reader sees on each x-deal-v1 receipt page, frozen: the source tags
 * of capsule-viewer#488 (docs/design/receipt-view-model.md section 5) change
 * how the receipt module's nodes are marked, never a word a reader sees. Each
 * deal fixture is drawn in each carrier (on its own, in a report, as a page
 * shown to others), and the text is compared by place: every run of text
 * under the nearest element the page already marks (a `data-*` attribute or a
 * class the module gave it, the tags this PR adds aside), with each element's
 * `title` and `aria-*` attributes. Times are read as their UTC `data-time`,
 * so the golden holds in any zone; the wording pack's SHA-256, which the page
 * shows and which changes whenever the pack gains a key, is read as
 * <PACK_SHA256>, checked against the pack's own bytes.
 *
 * The golden was written from main before the tags (83d272b). To rewrite it
 * after a deliberate wording change:
 *   UPDATE_GOLDENS=1 npx vitest run test/receipt-deal-v1-text.test.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARRIERS,
  FIXTURES,
  PACK_SHA256,
  moduleRegions,
  drawPage,
} from "./helpers/receipt-deal-v1-pages.js";

/** The attributes the source tags add; they mark, so they never make a place. */
export const TAG_ATTRIBUTES = [
  "data-src",
  "data-key",
  "data-ptr",
  "data-fmt",
  "data-ph",
  "data-derive",
  "data-case",
  "data-where",
];

type Place = { at: string; text: string; attrs?: Record<string, string> };

function placeOf(el: Element): string | null {
  const parts: string[] = [];
  if (el.getAttribute("class")) parts.push(`.${el.getAttribute("class")}`);
  for (const a of Array.from(el.attributes)
    .map((x) => x.name)
    .sort()) {
    if (!a.startsWith("data-") || TAG_ATTRIBUTES.includes(a)) continue;
    parts.push(`${a}=${el.getAttribute(a)}`);
  }
  return parts.length ? parts.join(" ") : null;
}

/** The page's text by place, in document order. */
export function textByPlace(region: Element): Place[] {
  const out: Place[] = [];
  const anchorOf = (node: Node): Element => {
    let el = node.parentElement;
    while (el !== null && el !== region && placeOf(el) === null)
      el = el.parentElement;
    return el ?? region;
  };
  const seen = new Map<Element, Place>();
  const add = (anchor: Element, raw: string): void => {
    let place = seen.get(anchor);
    if (place === undefined) {
      place = { at: placeOf(anchor) ?? "(region)", text: "" };
      seen.set(anchor, place);
      out.push(place);
    }
    place.text += raw.split(PACK_SHA256).join("<PACK_SHA256>");
  };
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      if (node.nodeValue) add(anchorOf(node), node.nodeValue);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const attrs: Record<string, string> = {};
    for (const a of Array.from(el.attributes)) {
      if (a.name === "title" || a.name.startsWith("aria-"))
        attrs[a.name] = a.value.split(PACK_SHA256).join("<PACK_SHA256>");
    }
    if (Object.keys(attrs).length) {
      out.push({
        at: placeOf(el) ?? el.tagName.toLowerCase(),
        text: "",
        attrs,
      });
    }
    // A time is read as its UTC instant, whatever zone this run is in.
    const time = el.getAttribute("data-time");
    if (time !== null) {
      add(placeOf(el) !== null ? el : anchorOf(el), `@${time}`);
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(region);
  return out;
}

const GOLDEN = resolve(
  process.cwd(),
  "test",
  "goldens",
  "receipt",
  "deal-v1-text.json",
);

describe("the x-deal-v1 receipt pages say what they said before the source tags", () => {
  it("draws the same text, place by place, on every fixture and carrier", async () => {
    const pages: Record<string, Place[][]> = {};
    for (const fixture of FIXTURES) {
      for (const carrier of CARRIERS) {
        const root = await drawPage(fixture, carrier);
        const regions = moduleRegions(root);
        // The receipt module drew all three regions (not a refusal or a can't-check line).
        expect(regions, `${fixture.name} / ${carrier}`).toHaveLength(3);
        expect(
          root.querySelector("[data-receipt-surface='v1']"),
          `${fixture.name} / ${carrier}`,
        ).not.toBeNull();
        pages[`${fixture.name} / ${carrier ?? "own"}`] =
          regions.map(textByPlace);
      }
    }
    if (process.env.UPDATE_GOLDENS === "1") {
      writeFileSync(GOLDEN, JSON.stringify(pages, null, 1) + "\n");
    }
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as typeof pages;
    expect(Object.keys(pages).sort()).toEqual(Object.keys(golden).sort());
    for (const key of Object.keys(golden))
      expect(pages[key], key).toEqual(golden[key]);
  });
});
