// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

import { expect, it } from "vitest";
import { DEFAULT_WORDS } from "../src/contract-report-wording.js";
import {
  WORD_SOURCES,
  legendCss,
  renderLegend,
  tagSource,
} from "../src/report-legend.js";
import { applyDepth } from "../src/report-front.js";
import { levelCss, levelToggle, renderTurns } from "../src/report-levels.js";

for (const grouping of ["lines", "groups"] as const) {
  it(`the ${grouping} page's legend names the three toggle glyphs and the five word sources`, () => {
    const legend = renderLegend(DEFAULT_WORDS[grouping]);
    const glyphs = [...legend.querySelectorAll(".cv-lg")].map((g) => [
      g.textContent,
      g.className,
    ]);
    expect(glyphs).toEqual([
      ["▾", "cv-lg view"],
      ["▸", "cv-lg reader"],
      ["■", "cv-lg core"],
    ]);
    const chips = [...legend.querySelectorAll<HTMLElement>(".cv-src")];
    expect(chips.map((c) => c.dataset.src)).toEqual([...WORD_SOURCES]);
    expect(chips.map((c) => c.textContent)).toEqual([
      "core",
      "wording pack",
      "capsule field",
      "payload",
      "producer",
    ]);
    expect(legend.textContent).toContain("closed, the reader opens it");
    expect(legend.textContent).toContain("Where every word comes from");
  });
}

it("every source has its own style in the stylesheet", () => {
  const css = legendCss("x");
  for (const source of WORD_SOURCES)
    expect(css).toContain(`.x .cv-src[data-src="${source}"]`);
  expect(css).toContain('[data-src="producer"]:not(.cv-src){font-style:italic');
  expect(css).toContain("border-style:dashed");
});

it("a toggle draws its glyph from the stylesheet, and the view's depth marks who opened it", () => {
  const toggle = levelToggle(1, "Show", () => document.createElement("p"));
  expect(toggle.querySelector("summary > .tg")).not.toBeNull();
  expect(toggle.querySelector("summary")?.textContent).toBe("Show");
  const css = levelCss("x");
  expect(css).toContain('.x details.lv > summary .tg:before{content:"\\25B8"}');
  expect(css).toContain(
    '.x details.lv[open] > summary .tg:before{content:"\\25BE"}',
  );

  const L0 = document.createElement("div");
  const L1 = document.createElement("div");
  const L2 = document.createElement("div");
  L1.append(toggle);
  applyDepth({ L0, L1, L2, depth: "L1" });
  expect(toggle.open).toBe(true);
  expect(toggle.dataset.openedBy).toBe("view");
});

it("a toggle at L0 stays closed and unmarked: the reader opens it", () => {
  const toggle = levelToggle(1, "Show", () => document.createElement("p"));
  const L1 = document.createElement("div");
  L1.append(toggle);
  applyDepth({
    L0: document.createElement("div"),
    L1,
    L2: document.createElement("div"),
    depth: "L0",
  });
  expect(toggle.open).toBe(false);
  expect(toggle.dataset.openedBy).toBeUndefined();
});

it("the recorded content of a conversation is tagged payload, a tool call's arguments as a call", () => {
  const turns = renderTurns(
    [
      { role: "user", content: "Can I change my flight?", toolCalls: [] },
      {
        role: "assistant",
        content: undefined,
        toolCalls: [{ name: "apply_fee", arguments: '{"amount":75}' }],
      },
    ] as never,
    DEFAULT_WORDS.lines,
  );
  expect(turns.querySelector<HTMLElement>(".say")?.dataset.src).toBe("payload");
  const call = turns.querySelector<HTMLElement>(".call-a");
  expect(call?.dataset.src).toBe("payload");
  expect(call?.dataset.kind).toBe("tool-call");
});

it("tagSource marks a node and returns it", () => {
  const node = document.createElement("i");
  expect(tagSource(node, "producer")).toBe(node);
  expect(node.dataset.src).toBe("producer");
});

it("a toggle the view opened is the reader's once the reader closes it; a built body's toggles under L2 are the view's", () => {
  const outer = levelToggle(1, "Outer", () => {
    const inner = levelToggle(2, "Inner", () => document.createElement("p"));
    const body = document.createElement("div");
    body.append(inner);
    return body;
  });
  const L1 = document.createElement("div");
  L1.dataset.openAll = "";
  L1.append(outer);
  applyDepth({
    L0: document.createElement("div"),
    L1,
    L2: document.createElement("div"),
    depth: "L2",
  });
  const inner = outer.querySelector<HTMLDetailsElement>("details.lv2")!;
  expect(inner.open).toBe(true);
  expect(inner.dataset.openedBy).toBe("view");
  inner.open = false;
  inner.dispatchEvent(new Event("toggle"));
  expect(inner.dataset.openedBy).toBeUndefined();
});

it("a tool result is payload too", () => {
  const turns = renderTurns(
    [{ role: "tool", content: '{"ok":true}', toolCalls: [] }] as never,
    DEFAULT_WORDS.lines,
  );
  expect(turns.querySelector<HTMLElement>("pre.say")?.dataset.src).toBe(
    "payload",
  );
});
