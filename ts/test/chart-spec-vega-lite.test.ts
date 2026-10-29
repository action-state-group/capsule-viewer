// SPDX-License-Identifier: BSD-3-Clause
// Every chart spec the vectors accept is a valid Vega-Lite v5 document
// (docs/design/chart-spec.md section 2), so a producer can preview it in
// standard tools. Checked against the schema of the pinned vega-lite dev
// dependency; the viewer itself never loads Vega-Lite.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import AjvModule from "ajv";
import { expect, it } from "vitest";
import type { ChartVector } from "./helpers/chart-vectors.js";

const require = createRequire(import.meta.url);
const schema = JSON.parse(
  readFileSync(
    require.resolve("vega-lite/build/vega-lite-schema.json"),
    "utf8",
  ),
) as object;
// ajv is CommonJS: under NodeNext its class is the default export's `default`.
const Ajv = AjvModule.default;
const validate = new Ajv({ strict: false, allErrors: true }).compile(schema);
const cases = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "..", "vectors", "chart-spec", "cases.json"),
    "utf8",
  ),
) as ChartVector[];

for (const v of cases.filter((c) => "valid" in c.expect))
  it(`${v.name} is a Vega-Lite v5 spec`, () => {
    const ok = validate(v.spec);
    expect(validate.errors ?? [], v.name).toEqual([]);
    expect(ok).toBe(true);
  });

it("the schema check is not vacuous: an unknown mark fails it", () => {
  const spec = cases.find((c) => "valid" in c.expect)!.spec;
  expect(validate({ ...spec, mark: "banana" })).toBe(false);
});
