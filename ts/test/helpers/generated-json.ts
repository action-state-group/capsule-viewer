// SPDX-License-Identifier: BSD-3-Clause
// Seeded JSON generation for the Go parity vectors
// (go-fragment-vectors.test.ts, go-embedded-vectors.test.ts).

type Obj = Record<string, unknown>;

// mulberry32: a small seeded PRNG, so the cases are the same on every run.
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Text that stresses JCS and the codec: escapes JCS must write, characters
// it must not escape, HTML-significant text, non-ASCII and astral code
// points. No lone surrogates: JSON text cannot carry them across languages.
const ALPHABET = [
  "a",
  "Z",
  "0",
  " ",
  '"',
  "\\",
  "/",
  "<",
  ">",
  "&",
  "'",
  "\u0000",
  "\u0001",
  "\b",
  "\t",
  "\n",
  "\f",
  "\r",
  "\u001f",
  "\u007f",
  "é",
  "ß",
  " ",
  " ",
  " ",
  "€",
  "中",
  "﻿",
  "😀",
  "𝄞",
  "</script>",
  "<!--",
];
const NUMBERS = [
  0,
  -0,
  1,
  -1,
  7,
  42,
  1.5,
  -2.25,
  0.1,
  1e-7,
  123456789,
  2 ** 53 - 1,
  -(2 ** 53) + 1,
  1e21,
  1.7976931348623157e308,
  5e-324,
  333333333.3333333,
];

export function gen(rand: () => number) {
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(rand() * items.length)]!;
  const text = (max: number): string => {
    let out = "";
    const n = Math.floor(rand() * (max + 1));
    for (let i = 0; i < n; i++) out += pick(ALPHABET);
    return out;
  };
  const value = (depth: number): unknown => {
    const kind = Math.floor(rand() * (depth > 2 ? 4 : 6));
    if (kind === 0) return text(6);
    if (kind === 1) return pick(NUMBERS);
    if (kind === 2) return pick([true, false, null]);
    if (kind === 3) return text(3);
    if (kind === 4)
      return Array.from({ length: Math.floor(rand() * 4) }, () =>
        value(depth + 1),
      );
    const object: Obj = {};
    for (let i = Math.floor(rand() * 5); i > 0; i--)
      // Sometimes "__proto__", as an own member: plain assignment would
      // set the prototype instead.
      Object.defineProperty(object, rand() < 0.15 ? "__proto__" : text(4), {
        value: value(depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    return object;
  };
  return { pick, text, value };
}
