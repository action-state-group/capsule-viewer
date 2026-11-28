// SPDX-License-Identifier: Apache-2.0
/**
 * The one layer order and status words every surface that shows a deal
 * reads (capsule-viewer#448, docs/design/dealing-order.md): the receipt, the
 * History view and the Mesh Evidence rows. Each surface keeps its own
 * styling and its own evidence checks; this pack gives only the order and
 * the words, so a reader who knows one surface recognises the others.
 *
 * Published as `@action-state-group/capsule-viewer/dealing-wording`; the raw
 * pack is `@action-state-group/capsule-viewer/wording/dealing.en.json`.
 */
import PACK from "./wording/dealing.en.json" with { type: "json" };

/** The four layers, top to bottom, on every surface. */
export type DealingLayer = "verdict" | "facts" | "trust" | "technical";
/** The four trust questions, in the one order every trust line keeps. */
export type TrustQuestion =
  | "rewritten"
  | "same_story"
  | "as_offered"
  | "stands_behind";
/** The parts inside "Technical details", in order. */
export type TechnicalPart = "content" | "payment_steps" | "checks";

export interface DealingWording {
  readonly id: string;
  readonly locale: string;
  readonly layers: readonly DealingLayer[];
  readonly trust: readonly TrustQuestion[];
  readonly technical: readonly TechnicalPart[];
  readonly entries: Readonly<Record<string, string>>;
  /** Keys whose words are not ruled yet: never drawn, never in `entries`. */
  readonly pending: Readonly<Record<string, string>>;
}

export const DEALING_WORDING: DealingWording = PACK as DealingWording;

const PLACEHOLDER = /\{([a-z_]+)\}/g;

/**
 * One entry's words with its `{placeholders}` filled. Throws on a key the
 * pack does not hold (a pending key included) or a placeholder left unfilled,
 * so a surface never draws a key name or a raw `{name}`.
 */
export function dealingSay(
  key: string,
  values: Readonly<Record<string, string>> = {},
): string {
  const text = Object.hasOwn(DEALING_WORDING.entries, key)
    ? DEALING_WORDING.entries[key]
    : undefined;
  if (text === undefined)
    throw new Error(`dealing wording: no entry ${JSON.stringify(key)}`);
  return text.replace(PLACEHOLDER, (_, name: string) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (value === undefined)
      throw new Error(
        `dealing wording: ${JSON.stringify(key)} needs a value for {${name}}`,
      );
    return value;
  });
}
