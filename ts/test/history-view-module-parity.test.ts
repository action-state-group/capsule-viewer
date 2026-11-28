// SPDX-License-Identifier: Apache-2.0
// The History card's reading rules in TS (src/standard-history-card.ts,
// capsule-viewer#478) against the Python package's module-slot script they
// were ported from (src/capsule_viewer/static/standard_history_card.js), which
// stays until the u526 path retires it. Both run on:
//
// - every committed capsulectl bundle under tests/testdata/standard-history
//   (and witness/), through the stand-in context with capsulectl verify's real
//   answer;
// - every AAC vector (aac/vectors.json, vectors-3.json, vectors-4.json), as a
//   card check and as a context (the vector's card disclosed on the root, its
//   block in the bundle), as js-tests/standard_history_3_card.test.js builds it;
// - in-memory edits that reach each branch of the reading (a block member it
//   does not know, a malformed as_of, deals that are not a list, an undisclosed
//   card, a context that does not verify).
//
// The two must agree on every member of the model the reading produces.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CARD_PROPERTIES,
  checkCard,
  isStandard,
  readStandardHistory,
  StandardHistoryInputError,
} from "../src/standard-history-card.js";
// @ts-expect-error a plain JS stand-in shared with the root js-tests
import { standInContext } from "../../js-tests/aacContext.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(ROOT, "tests", "testdata", "standard-history");
const SCRIPT = readFileSync(
  join(ROOT, "src", "capsule_viewer", "static", "standard_history_card.js"),
  "utf8",
);
const EXT = "x-standard-history/v0";
const readJson = (path: string): Json => JSON.parse(readFileSync(path, "utf8"));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const g = globalThis as Record<string, any>;
let py: Json;
let saved: unknown;
beforeAll(() => {
  saved = g.EvidenceGraph;
  g.EvidenceGraph = { registerPresentation: () => {} };
  runInThisContext(SCRIPT);
  py = g.CapsuleViewerStandardHistory;
});
afterAll(() => {
  g.EvidenceGraph = saved;
  delete g.CapsuleViewerStandardHistory;
});

/** The members of the Python model the reading produces (its words-bearing members are the drawer's). */
function pyReading(context: Json): Json {
  const m = py.buildModelSync(context);
  const out: Json = { state: m.state, own: m.own, properties: m.properties };
  if (m.state === "refused" || m.state === "card") {
    out.held = m.held;
    out.witnessIn = m.witnessIn;
    out.registerIn = m.registerIn;
    out.skipped = m.skipped;
  }
  if (m.state === "refused") out.fails = m.fails;
  if (m.state === "card") {
    out.covered = m.covered;
    out.card = m.card;
    out.entriesMatch = m.entriesMatch;
  }
  return clone(out);
}

function tsReading(context: Json): Json {
  const m: Json = readStandardHistory(context);
  const out: Json = { ...m };
  // The TS model also carries the block's as_of and deals for the drawer.
  delete out.asOf;
  delete out.deals;
  return clone(out);
}

function bundles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".bundle.json"))
    .map((f) => f.slice(0, -".bundle.json".length));
}

function bundleContext(dir: string, name: string): Json {
  return standInContext(readJson(join(dir, `${name}.bundle.json`)), {
    verify: readJson(join(dir, "verify", `${name}.json`)),
  });
}

// The base bundle with a vector's card disclosed on its root and the vector's block, in memory (as
// js-tests/standard_history_3_card.test.js builds it): the page's own checks are what run.
function vectorContext(
  input: Json,
  edit: { block?: (b: Json) => void; card?: (c: Json) => void } = {},
): Json {
  const bundle = readJson(join(DATA, "person-own.bundle.json"));
  // A card-only vector holds no policy, as_of or deals: the block then leaves that member out.
  const block: Json = {};
  for (const k of ["policy", "as_of", "deals"])
    if (input[k] !== undefined && input[k] !== null) block[k] = clone(input[k]);
  edit.block?.(block);
  bundle.extensions[EXT] = block;
  const ctx = standInContext(bundle, {
    verify: readJson(join(DATA, "verify", "person-own.json")),
  });
  const card = clone(input.card);
  edit.card?.(card);
  const r = ctx.resolvedDisclosures.get(ctx.root);
  const resolved = new Map(ctx.resolvedDisclosures).set(ctx.root, {
    ...r,
    agent_input: { state: "disclosed", payload: card },
  });
  return { ...ctx, resolvedDisclosures: resolved };
}

const VECTOR_SETS = ["vectors", "vectors-3", "vectors-4"].map((n) => ({
  name: n,
  set: readJson(join(DATA, "aac", `${n}.json`)),
}));

describe("the TS reading of a committed capsulectl bundle is the Python module's", () => {
  for (const [dir, label] of [
    [DATA, ""],
    [join(DATA, "witness"), "witness/"],
  ] as const)
    for (const name of bundles(dir))
      it(`${label}${name}`, () => {
        const context = bundleContext(dir, name);
        expect(tsReading(context)).toEqual(pyReading(context));
      });
});

describe("the TS card check is AAC's and the Python module's on every AAC vector", () => {
  for (const { name, set } of VECTOR_SETS)
    for (const c of set.cases as Json[])
      it(`${name} ${c.id}`, () => {
        const i = c.inputs;
        const derivation = i.derivation ?? set.derivation ?? undefined;
        const run = (f: Json) => {
          try {
            return {
              properties: f(i.card, i.policy, i.as_of, i.deals, derivation),
            };
          } catch (err) {
            return { error: (err as Error).name };
          }
        };
        const ours = run(checkCard);
        const theirs = run(py.checkCard);
        // The two name their input error differently; both refuse the same inputs.
        expect("error" in ours).toBe("error" in theirs);
        if ("properties" in ours) {
          expect(ours.properties).toEqual(clone(theirs.properties));
          if (c.expected?.properties)
            expect(ours.properties).toEqual(c.expected.properties);
          if (typeof c.expected?.standard === "boolean")
            expect(isStandard(ours.properties)).toBe(c.expected.standard);
        } else expect(ours.error).toBe("StandardHistoryInputError");
      });
});

describe("the TS reading of each AAC vector as a bundle is the Python module's", () => {
  for (const { name, set } of VECTOR_SETS)
    for (const c of set.cases as Json[])
      it(`${name} ${c.id}`, () => {
        const context = vectorContext(c.inputs);
        expect(tsReading(context)).toEqual(pyReading(context));
      });
});

describe("each branch of the reading, as the Python module reads it", () => {
  const base = (VECTOR_SETS[1]!.set.cases as Json[])[0].inputs;
  const branches: [string, Json, string][] = [
    [
      "a block member it does not know",
      vectorContext(base, { block: (b) => (b.extra = 1) }),
      "unreadable",
    ],
    [
      "a block that is not an object",
      vectorContext(base, {
        block: (b) => {
          for (const k of Object.keys(b)) delete b[k];
          b.policy = "x";
        },
      }),
      "unreadable",
    ],
    [
      "an as_of missing its anchor",
      vectorContext(base, { block: (b) => delete b.as_of.anchor }),
      "unreadable",
    ],
    [
      "an as_of time that is not one",
      vectorContext(base, {
        block: (b) => (b.as_of.anchor_time = "2026-02-30T00:00:00Z"),
      }),
      "unreadable",
    ],
    [
      "an as_of checkpoint not in hex",
      vectorContext(base, { block: (b) => (b.as_of.checkpoint = "XY") }),
      "unreadable",
    ],
    [
      "as_of receipts that are not hex",
      vectorContext(base, { block: (b) => (b.as_of.receipts = ["zz"]) }),
      "unreadable",
    ],
    [
      "deals that are not a list",
      vectorContext(base, { block: (b) => (b.deals = {}) }),
      "unreadable",
    ],
    [
      "a malformed deal entry",
      vectorContext(base, { block: (b) => (b.deals[0].role = "sold") }),
      "unreadable",
    ],
    [
      "a card that fails its form",
      vectorContext(base, { card: (c) => (c.extra = 1) }),
      "refused",
    ],
    [
      "a card whose counts do not add up",
      vectorContext(base, { card: (c) => (c.outcomes.held += 1) }),
      "refused",
    ],
    [
      "card statements that are not strings",
      vectorContext(base, { block: (b) => (b.card_statements = [1, "aa"]) }),
      "card",
    ],
    [
      "a card_statements member that is not a list",
      vectorContext(base, { block: (b) => (b.card_statements = "aa") }),
      "card",
    ],
    [
      "a witness checkpoint and receipts",
      vectorContext(base, {
        block: (b) => {
          b.as_of.checkpoint = "00ff";
          b.as_of.receipts = ["ab"];
        },
      }),
      "card",
    ],
  ];
  for (const [what, context, state] of branches)
    it(what, () => {
      const ours = tsReading(context);
      expect(ours.state).toBe(state);
      expect(ours).toEqual(pyReading(context));
    });

  it("an undisclosed card", () => {
    const context = vectorContext(base);
    const r = context.resolvedDisclosures.get(context.root);
    context.resolvedDisclosures = new Map(context.resolvedDisclosures).set(
      context.root,
      { ...r, agent_input: { state: "withheld" } },
    );
    expect(tsReading(context).state).toBe("unreadable");
    expect(tsReading(context)).toEqual(pyReading(context));
  });

  it("a context that does not verify, and none at all", () => {
    const context = vectorContext(base);
    const bad = {
      ...context,
      verification: {
        ...context.verification,
        graphClosure: { status: "fail", findings: [] },
      },
    };
    expect(tsReading(bad).state).toBe("unverified");
    expect(tsReading(bad)).toEqual(pyReading(bad));
    expect(tsReading({ bundle: context.bundle })).toEqual(
      pyReading({ bundle: context.bundle }),
    );
  });

  it("a record whose log position is unbound is drawn, and not as covered", () => {
    const context = vectorContext(base);
    const unbound = {
      ...context,
      verification: {
        ...context.verification,
        perRecordMembership: {
          status: "fail",
          findings: [`membership_record_unbound:${context.root}`],
        },
      },
    };
    const ours = tsReading(unbound);
    expect(ours.state).toBe("card");
    expect(ours.covered).toBe(false);
    expect(ours).toEqual(pyReading(unbound));
  });

  it("names every property in the SH 6 order", () => {
    expect([...CARD_PROPERTIES]).toEqual(py.PROPERTIES);
  });

  it("refuses a token that is not a standard_history token, as an input error", () => {
    expect(() => checkCard({}, null, null, null, "standard_history/9")).toThrow(
      StandardHistoryInputError,
    );
  });
});
