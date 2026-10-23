// SPDX-License-Identifier: BSD-3-Clause

// agent-action-capsule's own presentation-resolution conformance vectors
// (vectors/presentation-resolution/registration.json, copied below with
// their source sha256 since the npm package ships no test data): the two
// cases contract-report/v1 section 4 names,
// contract-report-module-in-place-of-builtin and -beside-builtin. They are
// generic (a stand-in module id, org.example.contract-report/v0) and state
// the rule this viewer's registration follows: in place of the AAC
// built-in, never beside it (section 4.5's ambiguity test).
//
// test/helpers/presentation-resolution-vectors.ts is agent-action-capsule's
// own generator for this corpus, vendored here, but it reads schema example
// files (schemas/examples/presentation-manifest-v0/...) this package does
// not ship, so importing it throws at module load (confirmed: ENOENT on
// example-unilateral.json). These two cases need none of that -- just
// PresentationRegistry and resolveModules, both exported by the package --
// so this file runs them directly rather than fixing the unrelated helper.

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { expect, it } from "vitest";
import {
  PresentationAmbiguityError,
  PresentationRegistry,
  resolveModules,
  type PresentationDescriptor,
  type PresentationFormat,
  type PresentationManifest,
  type PresentationModule,
  type PresentationRefusal,
  type PresentationResolution,
  type PresentationRuntime,
} from "@action-state-group/agent-action-capsule";

type Obj = Record<string, unknown>;

interface WireDescriptor {
  readonly verified: boolean;
  readonly bundle_kind: string | null;
  readonly profiles: readonly string[];
  readonly extensions: readonly string[];
}

const fromWire = (d: WireDescriptor): PresentationDescriptor => ({
  verified: d.verified,
  bundle_kind: d.bundle_kind ?? undefined,
  profiles: new Set(d.profiles),
  extensions: new Set(d.extensions),
});

const stub = (manifest: PresentationManifest): PresentationModule => ({
  manifest,
  canRender: () => true,
  buildModel: () => null,
  render: () => undefined,
});

function wireResolution(r: PresentationResolution): Obj {
  if (r.kind === "refusal") return { kind: "refusal" };
  if (r.kind === "no-presentation")
    return { kind: "no-presentation", refused: r.refused.map(wireRefusal) };
  return {
    kind: "module",
    module: r.module.manifest.id,
    refused: r.refused.map(wireRefusal),
  };
}

function wireRefusal(r: PresentationRefusal): Obj {
  return {
    id: r.id,
    presentation_api: r.presentation_api,
    runtime_min: r.runtime_min,
    reason: r.reason,
    extensions: [...r.extensions],
    runtime_version: r.runtimeVersion,
  };
}

interface VectorFile {
  readonly source: { readonly sha256: string; readonly commit: string };
  readonly cases: readonly VectorCase[];
}

interface VectorCase {
  readonly id: string;
  readonly runtime: {
    presentation_apis: readonly string[];
    runtime_version: string;
  };
  readonly register: boolean;
  readonly manifests: readonly PresentationManifest[];
  readonly expect: {
    readonly registrations: readonly Obj[];
    readonly error: Obj | null;
    readonly list: readonly string[] | null;
    readonly refused: readonly Obj[] | null;
  };
  readonly probes: readonly {
    readonly descriptor: WireDescriptor;
    readonly audience: string;
    readonly format: PresentationFormat;
    readonly declines: readonly string[];
    readonly expect: Obj;
  }[];
}

const path = resolvePath(
  process.cwd(),
  "test",
  "testdata",
  "aac-vectors",
  "presentation-resolution",
  "registration.json",
);
const vectors = JSON.parse(readFileSync(path, "utf8")) as VectorFile;

it("the copied vector file's source sha256 is recorded and the copy is exactly those two cases", () => {
  expect(vectors.cases.map((c) => c.id).sort()).toEqual([
    "contract-report-module-beside-builtin",
    "contract-report-module-in-place-of-builtin",
  ]);
  expect(vectors.source.sha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(vectors.source.commit).toBe("db9de0f");
});

for (const c of vectors.cases)
  it(`agent-action-capsule vector: ${c.id}`, async () => {
    const runtime: PresentationRuntime = {
      presentationApis: c.runtime.presentation_apis,
      runtimeVersion: c.runtime.runtime_version,
    };
    const registry = new PresentationRegistry(runtime);
    const registrations: Obj[] = [];
    const modules: PresentationModule[] = [];
    const refusals = new Map<PresentationModule, PresentationRefusal>();
    let error: Obj | null = null;
    for (const manifest of c.manifests) {
      const module = stub(manifest);
      try {
        const outcome = registry.register(module);
        modules.push(module);
        if (outcome.status === "refused") {
          refusals.set(module, outcome.refusal);
          registrations.push({
            status: "refused",
            refusal: wireRefusal(outcome.refusal),
          });
        } else registrations.push({ status: "registered" });
      } catch (err) {
        error =
          err instanceof PresentationAmbiguityError
            ? { kind: "ambiguity", ids: [...err.ids], message: err.message }
            : (() => {
                throw err;
              })();
        break;
      }
    }
    expect(registrations).toEqual(c.expect.registrations);
    expect(error).toEqual(c.expect.error);
    if (error !== null) return;
    expect(registry.list().map((m) => m.manifest.id)).toEqual(c.expect.list);
    expect(registry.refused()).toHaveLength(c.expect.refused?.length ?? 0);
    for (const probe of c.probes) {
      const declines = [...probe.declines];
      const resolution = await resolveModules(
        modules,
        fromWire(probe.descriptor),
        probe.audience,
        probe.format,
        (m) => !declines.includes(m.manifest.id),
        (m) => refusals.get(m),
      );
      expect(wireResolution(resolution)).toEqual(probe.expect);
    }
  });
