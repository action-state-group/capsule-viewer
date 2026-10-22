// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

// Golden pages for the outcome and EU AI Act report cards. Each case is a
// sealed fixture rendered twice: as a reader first sees it (every toggle
// closed) and with every toggle opened, every lazily built body built. The
// card's markup must equal the committed golden byte for byte, so a change
// to the cards' code or to their default wording packs shows up here as a
// diff of exactly what a reader would see.
//
// UPDATE_GOLDENS=1 npx vitest run test/contract-report-golden.test.ts
// rewrites the goldens for an intended change; review the diff before
// committing it.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { jsonDigest } from "@action-state-group/agent-action-capsule";
import { renderEvidenceGraph } from "../src/browser.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

const GOLDENS = resolve(process.cwd(), "test", "goldens", "contract-report");

function fixture(name: string): Obj {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "test", "testdata", name), "utf8"),
  ) as Obj;
}

function claims(source: Obj): Obj[] {
  return (((source.disclosures as Obj).result as Obj).agent_input as Obj)
    .claims as Obj[];
}

/**
 * The outcome fixture cut to its first four conversations, the first one
 * flipped to met on every rule and the fourth's misses to undecided, so the
 * golden holds a resolved, a missed and an undecided conversation at a
 * size a diff can be read at.
 */
function fourConversations(source: Obj): void {
  const resultDoc = ((source.disclosures as Obj).result as Obj)
    .agent_input as Obj;
  const all = resultDoc.claims as Obj[];
  const conversation = (c: Obj): string => (c.id as string).split("::")[0]!;
  const keep = [...new Set(all.map(conversation))].slice(0, 4);
  const kept = all
    .filter((c) => keep.includes(conversation(c)))
    .map((c) =>
      conversation(c) === keep[0]
        ? {
            ...c,
            verdict: "met",
            sufficiency: "SATISFIED",
            presentation: { ...(c.presentation as Obj), status: "SATISFIED" },
          }
        : conversation(c) === keep[3] && c.verdict === "not_met"
          ? {
              ...c,
              verdict: "not_evaluable",
              sufficiency: "GAP",
              presentation: {
                ...(c.presentation as Obj),
                status: "INSUFFICIENT",
              },
            }
          : c,
    );
  const buckets: Record<string, string[]> = {
    met: [],
    not_met: [],
    not_evaluable: [],
  };
  for (const claim of kept)
    buckets[claim.verdict as string]!.push(claim.id as string);
  (source.disclosures as Obj).result = {
    agent_input: {
      ...resultDoc,
      claims: kept,
      aggregate: { ...(resultDoc.aggregate as Obj), buckets },
    },
  };
}

function withholdAll(source: Obj): void {
  for (const claim of claims(source))
    delete (source.disclosures as Obj)[
      (claim.evidence as Obj[])[0]!.digest as string
    ];
}

const PIN = {
  model_id: "judge-model-1.2.3",
  prompt_digest: "aa".repeat(32),
  axes_digest: "bb".repeat(32),
  sampling_params: { temperature: 0 },
};

async function pinAll(source: Obj): Promise<void> {
  const digest = await jsonDigest({
    model_id: PIN.model_id,
    model_version: null,
    sampling_params: PIN.sampling_params,
    prompt_digest: PIN.prompt_digest,
    axes_digest: PIN.axes_digest,
  });
  for (const claim of claims(source)) {
    const disclosed = (source.disclosures as Obj)[
      (claim.evidence as Obj[])[0]!.digest as string
    ] as Obj | undefined;
    const report = disclosed?.agent_input as Obj | undefined;
    if (report?.judge_pin_digest === undefined) continue;
    report.judge_pin = PIN;
    report.judge_pin_digest = digest;
  }
}

const WITNESSES = [
  {
    ts_url: "https://witness.example/log",
    entry_hash: "00",
    receipt_b64: "",
    leaf_index: 0,
    tree_size: 1234,
  },
  {
    ts_url: "https://placeholder.example/",
    entry_hash: "00",
    receipt_b64: "",
    leaf_index: 0,
    tree_size: 1,
    is_stub: true,
  },
];

interface Case {
  readonly name: string;
  readonly file: string;
  readonly page: string;
  readonly mutate?: (source: Obj) => void | Promise<void>;
  readonly witnesses?: boolean;
}

const CASES: readonly Case[] = [
  {
    name: "outcome",
    file: "outcome-report-bundle.json",
    page: "outcome-report",
    mutate: fourConversations,
  },
  {
    name: "outcome-withheld",
    file: "outcome-report-bundle.json",
    page: "outcome-report",
    mutate: (s) => {
      fourConversations(s);
      withholdAll(s);
    },
  },
  {
    name: "outcome-pinned-witnessed",
    file: "outcome-report-bundle.json",
    page: "outcome-report",
    mutate: async (s) => {
      fourConversations(s);
      await pinAll(s);
    },
    witnesses: true,
  },
  { name: "eu", file: "compliance-bundle.json", page: "compliance" },
  {
    name: "eu-withheld",
    file: "compliance-bundle.json",
    page: "compliance",
    mutate: withholdAll,
  },
  {
    name: "eu-pinned-witnessed",
    file: "compliance-bundle.json",
    page: "compliance",
    mutate: pinAll,
    witnesses: true,
  },
];

/** Open every toggle, again and again, until none is left closed (a body can hold toggles of its own). */
function openAll(root: HTMLElement): void {
  for (;;) {
    const closed = [
      ...root.querySelectorAll<HTMLDetailsElement>("details"),
    ].filter((d) => !d.open);
    if (closed.length === 0) return;
    for (const details of closed) {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    }
  }
}

async function sealed(c: Case): Promise<Obj> {
  const source = fixture(c.file);
  await c.mutate?.(source);
  const { bundle } = await sealEvidenceBundle(source);
  if (c.witnesses === true) (bundle.checkpoint as Obj).witnesses = WITNESSES;
  return bundle;
}

function check(name: string, html: string): void {
  const path = resolve(GOLDENS, `${name}.html`);
  if (process.env.UPDATE_GOLDENS === "1") {
    mkdirSync(GOLDENS, { recursive: true });
    writeFileSync(path, `${html}\n`);
    return;
  }
  expect(`${html}\n` === readFileSync(path, "utf8"), `${name}.html`).toBe(true);
}

for (const c of CASES)
  it(`golden: ${c.name}, closed and fully open`, async () => {
    const root = document.createElement("main");
    await renderEvidenceGraph(await sealed(c), root);
    expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
    // The card only: the verification page after it is the core's, and no
    // change to the cards' code or words reaches it.
    const card = (): string =>
      root.querySelector<HTMLElement>(`[data-page="${c.page}"]`)!.outerHTML;
    check(`${c.name}.closed`, card());
    openAll(root);
    check(`${c.name}.open`, card());
  });
