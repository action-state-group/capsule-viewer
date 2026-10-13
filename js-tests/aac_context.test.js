// js-tests/aacContext.js, the one stand-in for agent-action-capsule's
// VerifiedBundleContext that the History module's tests (#26) and the receipt
// modules' tests (#27) share. history_card.test.js checks the context's own
// shape; this file checks what #27 added: a composed/v1 block's verification
// (`extensions[].composed`, built by aacComposed from capsulectl verify's
// report), against AAC's ExtensionResult and ComposedResult, on every real
// receipt copy that carries one. The field lists are vendored
// (tests/testdata/aac-context/verified-bundle-context-shape.json, "composed")
// and checked against the AAC source when a checkout is present.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { interfaceFields, standInContext, unionFields } from "./aacContext.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECEIPT = join(ROOT, "tests", "testdata", "receipt");
const SHAPE = JSON.parse(readFileSync(join(ROOT, "tests", "testdata", "aac-context", "verified-bundle-context-shape.json"), "utf8")).composed;
const AAC_SRC = process.env.AAC_TS_SRC || resolve(ROOT, "..", "agent-action-capsule--main", "ts", "src");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
// Every receipt copy whose capsulectl verify report carries a composed/v1 verification.
const COMPOSED = readdirSync(RECEIPT)
  .filter((f) => f.endsWith(".verify.json"))
  .map((f) => f.replace(/\.verify\.json$/, ""))
  .filter((name) => existsSync(join(RECEIPT, `${name}.bundle.json`)))
  .filter((name) => (read(join(RECEIPT, `${name}.verify.json`)).extensions || []).some((e) => e.kind === "composed/v1" && e.composed));

function fits(o, name) {
  const f = SHAPE[name].fields;
  for (const k of f.filter((x) => !x.endsWith("?"))) expect(Object.hasOwn(o, k), `${name}.${k}`).toBe(true);
  for (const k of Object.keys(o)) expect(f.map((x) => x.replace(/\?$/, "")), `${name}.${k}`).toContain(k);
}

describe("aacContext.js: the composed/v1 verification has AAC's shape", () => {
  it("there are real copies to check", () => {
    expect(COMPOSED.length).toBeGreaterThan(0);
  });

  for (const name of COMPOSED) {
    it(`${name}: extensions[].composed is AAC's ComposedResult`, () => {
      const ctx = standInContext(read(join(RECEIPT, `${name}.bundle.json`)), { verify: read(join(RECEIPT, `${name}.verify.json`)) });
      for (const e of ctx.verification.extensions) fits(e, "ExtensionResult");
      const composed = ctx.verification.extensions.find((e) => e.kind === "composed/v1").composed;
      fits(composed, "ComposedResult");
      expect(composed.malformed).toBe(false);
      fits(composed.composedDigest, "ComposedDigestResult");
      expect(composed.members.length).toBeGreaterThan(0);
      for (const m of composed.members) {
        fits(m, "ComposedMemberResult");
        if (m.bundle) {
          fits(m.bundle, "ComposedMemberClaims");
          for (const c of Object.values(m.bundle)) fits(c, "ComposedClaim");
        }
      }
      for (const o of composed.observers) fits(o, "ObserverDeclaration");
      expect(ctx.extensions).toBe(ctx.verification.extensions);
    });
  }

  it.skipIf(!existsSync(join(AAC_SRC, "composed.ts")))("the vendored composed shapes are AAC's source", () => {
    for (const [name, { file, union, fields }] of Object.entries(SHAPE)) {
      const source = readFileSync(join(AAC_SRC, file), "utf8");
      expect(union ? unionFields(source, name) : interfaceFields(source, name), name).toEqual(fields);
    }
  });
});
