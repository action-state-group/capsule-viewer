// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_READER_WITNESSES,
  parseReaderWitnesses,
  readerWitnessPolicy,
  setReaderWitnessPolicy,
} from "../src/reader-witnesses.js";

const LIST = {
  witnesses: [
    {
      name: "Test witness",
      keys: ["302a300506032b6570032100" + "00".repeat(32)],
    },
  ],
};

afterEach(() => {
  setReaderWitnessPolicy(null);
});

describe("the reader's witness list", () => {
  it("is empty by default", () => {
    expect(readerWitnessPolicy()).toBe(DEFAULT_READER_WITNESSES);
    expect(readerWitnessPolicy().witnesses).toHaveLength(0);
  });

  it("keeps a list the reader sets and returns to the default on null", () => {
    expect(setReaderWitnessPolicy(LIST)).toBe(true);
    expect(readerWitnessPolicy()).toEqual(LIST);
    expect(setReaderWitnessPolicy(null)).toBe(true);
    expect(readerWitnessPolicy()).toBe(DEFAULT_READER_WITNESSES);
  });

  it.each([
    ["not an object", []],
    ["an extra member", { witnesses: [], from: "bundle" }],
    ["a missing name", { witnesses: [{ keys: ["00"] }] }],
    ["a blank name", { witnesses: [{ name: " ", keys: ["00"] }] }],
    ["no key", { witnesses: [{ name: "w", keys: [] }] }],
    ["a non-hex key", { witnesses: [{ name: "w", keys: ["zz"] }] }],
    ["an upper-case key", { witnesses: [{ name: "w", keys: ["AB"] }] }],
    [
      "an extra row member",
      { witnesses: [{ name: "w", keys: ["00"], url: "x" }] },
    ],
  ])("refuses a list with %s and changes nothing", (_why, value) => {
    expect(parseReaderWitnesses(value)).toBeUndefined();
    expect(setReaderWitnessPolicy(LIST)).toBe(true);
    expect(setReaderWitnessPolicy(value)).toBe(false);
    expect(readerWitnessPolicy()).toEqual(LIST);
  });
});
