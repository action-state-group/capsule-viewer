// SPDX-License-Identifier: Apache-2.0
// The reader's own witness list: the witnesses this reader accepts, which the
// History card checks a snapshot's witness Receipt against (agent-action-
// capsule spec/standard-history-v0.md SH-4; capsule-viewer#183). It is the
// reader's, never the bundle's: nothing a bundle carries can add a witness to
// it. The default is a visible empty list, so a page that was never given a
// list checks no Receipt and says so. The reader changes it from the History
// card's checks section; the choice is kept in this browser's localStorage
// when it allows one, and in this page's memory when it does not.
import type { AnchorWitnessPolicy } from "@action-state-group/agent-action-capsule/witness";

const STORAGE_KEY = "capsule-viewer.reader-witnesses/v0";

/** The default: no witness accepted. */
export const DEFAULT_READER_WITNESSES: AnchorWitnessPolicy = Object.freeze({
  witnesses: Object.freeze([]),
});

const HEX_DER = /^(?:[0-9a-f]{2})+$/u;

/**
 * The list `value` states, or undefined when it is not one: {witnesses:
 * [{name, keys}]} with a non-empty name and hex DER SubjectPublicKeyInfo keys.
 * Nothing is dropped silently: a list with any malformed entry is no list.
 */
export function parseReaderWitnesses(
  value: unknown,
): AnchorWitnessPolicy | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const list = (value as { witnesses?: unknown }).witnesses;
  if (Object.keys(value).length !== 1 || !Array.isArray(list)) return undefined;
  const witnesses: { name: string; keys: string[] }[] = [];
  for (const row of list as unknown[]) {
    if (typeof row !== "object" || row === null || Array.isArray(row))
      return undefined;
    const { name, keys, ...rest } = row as Record<string, unknown>;
    if (Object.keys(rest).length > 0) return undefined;
    if (typeof name !== "string" || name.trim() === "") return undefined;
    if (
      !Array.isArray(keys) ||
      keys.length === 0 ||
      !keys.every((k) => typeof k === "string" && HEX_DER.test(k))
    )
      return undefined;
    witnesses.push({ name, keys: [...(keys as string[])] });
  }
  return { witnesses };
}

let held: AnchorWitnessPolicy | undefined;

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** The reader's witness list: their saved one, else the visible default. */
export function readerWitnessPolicy(): AnchorWitnessPolicy {
  if (held !== undefined) return held;
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (typeof raw === "string") {
      const parsed = parseReaderWitnesses(JSON.parse(raw));
      if (parsed !== undefined) return parsed;
    }
  } catch {
    // An unreadable store is the default list.
  }
  return DEFAULT_READER_WITNESSES;
}

/**
 * Save the reader's list, or with `null` go back to the default. Returns
 * false, and changes nothing, when `value` is not a list.
 */
export function setReaderWitnessPolicy(value: unknown): boolean {
  if (value === null) {
    held = undefined;
    try {
      storage()?.removeItem(STORAGE_KEY);
    } catch {
      // Nothing was stored that could be removed.
    }
    return true;
  }
  const parsed = parseReaderWitnesses(value);
  if (parsed === undefined) return false;
  held = parsed;
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Kept in this page only.
  }
  return true;
}
