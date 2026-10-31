// SPDX-License-Identifier: BSD-3-Clause
import type { Words } from "./contract-report-wording.js";

/**
 * The two legends a report page draws at the head of L0 (the Terms Pack
 * frames "The toggle" and "The words"):
 *
 *   - the toggle legend: which glyph means open, closed, or "no toggle,
 *     the core draws it", and who opens what (levelCss colours the glyph);
 *   - the source strip: the five places a word on the page comes from, each
 *     in the style the page gives it everywhere (`tagSource`).
 *
 * Every word is the card's wording pack's (`legend.*`); this file holds no
 * text. The styles are one stylesheet (`legendCss`) that a page adds once.
 */

/** Where a phrase on a report comes from, as the canvas names the five. */
export const WORD_SOURCES = [
  "core",
  "pack",
  "field",
  "payload",
  "producer",
] as const;
export type WordSource = (typeof WORD_SOURCES)[number];

/**
 * The sources the legend names: the ones the page marks in its text. Core,
 * wording-pack and capsule-field words are drawn but not yet tagged node by
 * node, so the legend does not list chips for styles a reader cannot see;
 * its last line says unmarked text is the viewer's or the report's own.
 */
export const MARKED_SOURCES = ["payload", "producer"] as const;

/**
 * Marks `node` as words from `source`. The style is the page stylesheet's:
 * the pack's own words are the page's plain sans, so a pack-source node is
 * marked and not restyled.
 */
export function tagSource<T extends HTMLElement>(
  node: T,
  source: WordSource,
): T {
  node.dataset.src = source;
  return node;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== "") node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The toggle legend and the source strip. */
export function renderLegend(w: Words): HTMLElement {
  const legend = el("div", "cv-legend");
  legend.dataset.legend = "words-and-toggles";

  const toggles = el("p", "cv-legend-toggles");
  toggles.dataset.legend = "toggles";
  const item = (glyph: string, cls: string, word: string): void => {
    const entry = el("span", "cv-legend-item");
    const mark = el("span", `cv-lg ${cls}`, glyph);
    mark.setAttribute("aria-hidden", "true");
    entry.append(mark, word);
    toggles.append(entry);
  };
  item("▾", "view", w.t("legend.toggle.open"));
  item("▸", "reader", w.t("legend.toggle.closed"));
  item("■", "core", w.t("legend.toggle.core"));
  legend.append(toggles, el("p", "cv-legend-note", w.t("legend.toggle.note")));

  const strip = el("p", "cv-legend-sources");
  strip.dataset.legend = "sources";
  strip.append(el("span", "cv-legend-lead", w.t("legend.src.lead")));
  for (const source of MARKED_SOURCES) {
    const entry = el("span", "cv-legend-item");
    const chip = el("span", "cv-src");
    chip.dataset.src = source;
    chip.textContent = w.t(`legend.src.${source}`);
    entry.append(chip, w.t(`legend.src.${source}.is`));
    strip.append(entry);
  }
  strip.append(el("span", "cv-legend-item", w.t("legend.src.unmarked")));
  legend.append(strip);
  return legend;
}

/** The legends' and the five source styles' stylesheet, scoped to a page's class. */
export function legendCss(scope: string): string {
  const s = `.${scope}`;
  return `
${s} .cv-legend{margin:0 auto 16px;max-width:1080px;font-size:12.5px;color:var(--slate)}
${s} .cv-legend p{margin:4px 0}
${s} .cv-legend-item{display:inline-block;margin-right:18px}
${s} .cv-lg{display:inline-block;width:1em;margin-right:6px;font-size:12px}
${s} .cv-lg.view{color:var(--navy)}
${s} .cv-lg.reader{color:#9A5311}
${s} .cv-lg.core{color:var(--slate)}
${s} .cv-legend-note{text-align:right}
${s} .cv-legend-lead{font-weight:700;margin-right:12px;color:var(--ink)}
${s} .cv-src{display:inline-block;margin-right:6px;padding:0 7px;border-radius:5px;font-size:11px;font-weight:600;line-height:1.6}
${s} .cv-src[data-src="core"]{background:#E4EEF9;color:#1F5C99}
${s} .cv-src[data-src="pack"]{background:#E1F0E6;color:#1E6B3A}
${s} .cv-src[data-src="field"]{background:#FBEFD2;color:#8A5A0B}
${s} .cv-src[data-src="payload"]{background:#F2EEE8;color:#4A4339;border:1px solid #D9D2C6}
${s} .cv-src[data-src="producer"]{background:#ECE6F8;color:#5B3FA0}
${s} [data-src="core"]:not(.cv-src){font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1F5C99}
${s} [data-src="field"]:not(.cv-src){font-family:ui-monospace,Menlo,monospace;color:#1F5C99}
${s} [data-src="payload"]:not(.cv-src){background:#F2EEE8;border:1px solid #E3DCCF;border-radius:6px;padding:2px 6px;color:var(--ink)}
${s} [data-src="payload"][data-kind="tool-call"]:not(.cv-src){border-style:dashed;font-family:ui-monospace,Menlo,monospace}
${s} [data-src="producer"]:not(.cv-src){font-style:italic}
`;
}
