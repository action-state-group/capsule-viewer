// The shipped decoder (capsule_viewer.js decodeFragment) reads tokens from
// Agent Action Capsule's Fragment Codec, which writes UTF-8, and tokens from
// this package's earlier encoder, which wrote \uXXXX escapes. Vectors:
// tests/testdata/aac-presentation-fragment-vectors.json and
// tests/testdata/fragment-codec-utf8-vectors.json (see that README).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadViewer } from "./loadViewer.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTDATA = resolve(HERE, "..", "tests", "testdata");
const read = (name) => JSON.parse(readFileSync(resolve(TESTDATA, name), "utf8"));
const AAC = read("aac-presentation-fragment-vectors.json");
const UTF8 = read("fragment-codec-utf8-vectors.json");

describe("fragment decode", () => {
  const { decodeFragment } = loadViewer();
  for (const c of AAC.cases) {
    it(`reads the earlier encoder's token: ${c.name}`, () => {
      expect(decodeFragment(c.fragment_py)).toEqual(c.payload);
    });
    if (!c.ascii_json) {
      it(`reads the UTF-8 token: ${c.name}`, () => {
        expect(decodeFragment(`#${UTF8.aac_tokens[c.name]}`)).toEqual(c.payload);
      });
    }
  }
  for (const c of UTF8.cases) {
    it(`reads the UTF-8 token: ${c.name}`, () => {
      expect(decodeFragment(c.token)).toEqual(c.payload);
    });
  }
});
