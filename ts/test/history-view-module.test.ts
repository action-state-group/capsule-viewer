// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// The History view as a presentation module (capsule-viewer#478): its
// manifest and resolution, its view model against the Python module-slot
// module's (src/capsule_viewer/static/standard_history_card.js) through the
// same checks, every value's source, the page it draws per state, and the
// view model as JSON (the parsed JSON draws the same page).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { buildVerifiedBundleContext } from "@action-state-group/agent-action-capsule";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readerCardRegistered } from "../src/card-registered.js";
import { readerCardSignature } from "../src/card-signature.js";
import * as browser from "../src/browser.js";
import {
  buildHistoryViewModel,
  HISTORY_VIEW_MANIFEST,
  historyViewModelJson,
  historyViewModule,
  type HistoryViewModel,
  renderHistoryViewModel,
} from "../src/history-view-module.js";
import {
  HISTORY_VIEW_WORDING,
  historyViewStyles,
} from "../src/history-view.js";
import {
  manifestProblems,
  PresentationAmbiguityError,
  PresentationRegistry,
  type PresentationModule,
} from "../src/presentation-registry.js";
import {
  readerAnchorWitness,
  readerWitnessPolicy,
  setReaderWitnessPolicy,
} from "../src/reader-witnesses.js";
// @ts-expect-error a plain JS stand-in shared with the root js-tests
import { standInContext } from "../../js-tests/aacContext.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(ROOT, "tests", "testdata", "standard-history");
const WITNESS = join(DATA, "witness");
const SCRIPT = readFileSync(
  join(ROOT, "src", "capsule_viewer", "static", "standard_history_card.js"),
  "utf8",
);
const readJson = (path: string): Json => JSON.parse(readFileSync(path, "utf8"));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const words = HISTORY_VIEW_WORDING.entries as Record<string, string>;
const READER_LIST = readJson(join(DATA, "aac", "anchor-witness-v1.json"))
  .policies.default;

const bundleOf = (dir: string, name: string): Json =>
  readJson(join(dir, `${name}.bundle.json`));
const standIn = (dir: string, name: string, bundle = bundleOf(dir, name)) =>
  standInContext(bundle, {
    verify: readJson(join(dir, "verify", `${name}.json`)),
  });
const names = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".bundle.json"))
    .map((f) => f.slice(0, -".bundle.json".length));

// The Python module, with the runtime's checks on its global, as a page gives them.
const g = globalThis as Record<string, any>;
let py: Json;
let saved: unknown;
beforeAll(() => {
  saved = g.EvidenceGraph;
  g.EvidenceGraph = {
    registerPresentation: () => {},
    readerAnchorWitness,
    readerWitnessPolicy,
    setReaderWitnessPolicy,
    readerCardSignature,
    readerCardRegistered,
  };
  runInThisContext(SCRIPT);
  py = g.CapsuleViewerStandardHistory;
});
afterAll(() => {
  g.EvidenceGraph = saved;
  delete g.CapsuleViewerStandardHistory;
});
beforeEach(() => setReaderWitnessPolicy(null));

function draw(model: HistoryViewModel): {
  L0: HTMLElement;
  L1: HTMLElement;
  L2: HTMLElement;
  text: string;
} {
  const host = {
    L0: document.createElement("div"),
    L1: document.createElement("div"),
    L2: document.createElement("div"),
  };
  document.body.replaceChildren(host.L0, host.L1, host.L2);
  renderHistoryViewModel(model, host);
  return {
    ...host,
    text: [host.L0, host.L1, host.L2].map((r) => r.textContent).join("\n"),
  };
}

/** Resolve an RFC 6901 pointer. */
function at(doc: Json, pointer: string): Json {
  if (pointer === "") return doc;
  return pointer
    .slice(1)
    .split("/")
    .map((p) => p.replace(/~1/gu, "/").replace(/~0/gu, "~"))
    .reduce((v, k) => (v === undefined || v === null ? undefined : v[k]), doc);
}

describe("the manifest", () => {
  it("is well formed and reads exactly the Python module's bundles", () => {
    expect(manifestProblems(HISTORY_VIEW_MANIFEST)).toEqual([]);
    expect(HISTORY_VIEW_MANIFEST.requires).toEqual(py.MANIFEST.requires);
    expect(HISTORY_VIEW_MANIFEST.forbids).toEqual(py.MANIFEST.forbids);
    expect(HISTORY_VIEW_MANIFEST.id).not.toBe(py.MANIFEST.id);
  });

  it("resolves for a History card bundle and is the one module there", async () => {
    const registry = new PresentationRegistry();
    expect(
      registry.register(historyViewModule as PresentationModule).status,
    ).toBe("registered");
    const context = await buildVerifiedBundleContext(
      bundleOf(DATA, "person-shared"),
    );
    const res = await registry.resolve(context, "*", "html");
    expect(res.kind).toBe("module");
    if (res.kind === "module") expect(res.module).toBe(historyViewModule);
  });

  it("pins the stylesheet it inserts, for the page's style-src", () => {
    expect(HISTORY_VIEW_MANIFEST.executable?.style_sha256).toEqual([
      createHash("sha256").update(historyViewStyles, "utf8").digest("hex"),
    ]);
  });

  it("cannot sit in one registry beside the Python module", () => {
    const registry = new PresentationRegistry();
    registry.register(historyViewModule as PresentationModule);
    expect(() =>
      registry.register({ ...historyViewModule, manifest: py.MANIFEST }),
    ).toThrow(PresentationAmbiguityError);
  });

  it("is on the browser runtime's global, not registered by default, and registers there", async () => {
    expect(browser.historyViewModule).toBe(historyViewModule);
    const context = await buildVerifiedBundleContext(
      bundleOf(DATA, "person-shared"),
    );
    const before = await browser.resolvePresentation(context);
    expect(
      before.kind === "module" ? before.module.manifest.id : null,
    ).not.toBe(HISTORY_VIEW_MANIFEST.id);
    expect(browser.registerPresentation(browser.historyViewModule).status).toBe(
      "registered",
    );
    const after = await browser.resolvePresentation(context);
    expect(after.kind === "module" ? after.module : null).toBe(
      historyViewModule,
    );
  });

  it("can render only where the bundle carries the block", async () => {
    const context = await buildVerifiedBundleContext(
      bundleOf(DATA, "person-shared"),
    );
    expect(historyViewModule.canRender(context)).toBe(true);
    const bundle = bundleOf(DATA, "person-shared");
    delete bundle.extensions["x-standard-history/v0"];
    expect(historyViewModule.canRender({ ...context, bundle })).toBe(false);
  });
});

/** The TS model against the Python module's, member by member. */
const compare = async (context: Json) => {
  const ours: Json = await buildHistoryViewModel(context);
  const theirs: Json = await py.module.buildModel(context);
  expect(ours.state).toBe(theirs.state);
  expect(ours.copy.value).toBe(theirs.own ? "own" : "shared");
  expect(ours.properties.value).toEqual(clone(theirs.properties));
  if (theirs.signature)
    expect({
      status: ours.signature.value.status,
      key: ours.signature.value.key,
    }).toEqual(theirs.signature);
  if (ours.state === "card" || ours.state === "refused") {
    expect(ours.witness.value.status).toBe(theirs.witness.status);
    expect(ours.witness.value.shown).toBe(theirs.witness.shown);
    if (theirs.witness.shown)
      expect(ours.witness.value.witness).toBe(theirs.witness.witness);
    expect(ours.registration.value.status).toBe(theirs.registration.status);
    expect(ours.registration.value.shown).toBe(theirs.registration.shown);
    expect(ours.skipped).toEqual(theirs.skipped);
    expect(ours.held.value).toEqual(theirs.held);
  }
  if (ours.state === "refused" || ours.state === "signature_failed") {
    expect(ours.fails).toEqual(theirs.fails);
    if (theirs.skipped) expect(ours.skipped).toEqual(theirs.skipped);
    if (theirs.held) expect(ours.held.value).toEqual(theirs.held);
  }
  if (ours.state === "card") {
    expect(ours.covered.value).toBe(theirs.covered);
    expect(ours.entries_match.value).toBe(theirs.entriesMatch);
  }
  return ours as HistoryViewModel;
};

describe("the view model is the Python module's, through the same checks", () => {
  for (const [dir, label] of [
    [DATA, ""],
    [WITNESS, "witness/"],
  ] as const)
    for (const name of names(dir)) {
      it(`${label}${name}, with no reader list`, async () => {
        await compare(standIn(dir, name));
      });
      it(`${label}${name}, under the AAC witness vectors' list`, async () => {
        setReaderWitnessPolicy(READER_LIST);
        await compare(standIn(dir, name));
      });
    }

  it("draws the witness line only for a Receipt that checks under the reader's list", async () => {
    setReaderWitnessPolicy(READER_LIST);
    const model = await compare(standIn(WITNESS, "person-shared-witnessed"));
    expect(model.witness?.value).toMatchObject({
      status: "PASS",
      shown: true,
      witness: "witness-a",
    });
    expect(draw(model).L2.textContent).toContain(
      "Snapshot recorded by witness-a, a witness you accept",
    );
    setReaderWitnessPolicy(null);
    const none = await compare(standIn(WITNESS, "person-shared-witnessed"));
    expect(none.witness?.value.shown).toBe(false);
    expect(draw(none).text).not.toContain("Snapshot recorded by");
  });

  it("reads a block checkpoint that is not its anchor's as unreadable, as the Python module does", async () => {
    const bundle = bundleOf(WITNESS, "person-shared-witnessed");
    bundle.extensions["x-standard-history/v0"].as_of.checkpoint = "00ff";
    const model = await compare(
      standIn(WITNESS, "person-shared-witnessed", bundle),
    );
    expect(model.state).toBe("unreadable");
  });

  it("draws a card whose signature does not check as that failure, with no counts", async () => {
    // The signature is outside the capsule id, so a changed one still verifies
    // as a record and fails only the strict signature check.
    const bundle = bundleOf(DATA, "person-shared");
    const root = bundle.records[0];
    const sig: string = root.signature;
    root.signature = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    const broken = await buildVerifiedBundleContext(bundle);
    const model = await compare(broken);
    expect(model.state).toBe("signature_failed");
    expect(model.card).toBeUndefined();
    const page = draw(model);
    expect(page.L0.textContent).toContain(
      words["card.module.signature_failed"],
    );
    expect(page.L0.textContent).not.toMatch(/\d+ deals?/u);
  });
});

describe("the view model's sources", () => {
  it("points every card member into the root record's disclosed card, and every entry into the block", async () => {
    const bundle = bundleOf(DATA, "person-own");
    const context = await buildVerifiedBundleContext(bundle);
    const model = await buildHistoryViewModel(context);
    expect(model.state).toBe("card");
    const card = context.resolvedDisclosures.get(context.root!)!.agent_input;
    expect(card.state).toBe("disclosed");
    const payload = (card as { payload: Json }).payload;
    expect(Object.keys(model.card!).sort()).toEqual(
      Object.keys(payload).sort(),
    );
    for (const [k, v] of Object.entries(model.card!)) {
      const src = v.src as { record: string; path: string };
      expect(src.record).toBe(context.root);
      expect(src.path.startsWith("/agent_input/")).toBe(true);
      expect(at(payload, src.path.slice("/agent_input".length))).toEqual(
        v.value,
      );
      expect(k).toBe(src.path.slice("/agent_input/".length));
    }
    expect(model.deals!.length).toBeGreaterThan(0);
    for (const d of model.deals!)
      expect(at(bundle, (d.src as { bundle: string }).bundle)).toEqual(d.value);
    expect(at(bundle, (model.as_of!.src as { bundle: string }).bundle)).toEqual(
      model.as_of!.value,
    );
    const root = bundle.records.find(
      (r: Json) => r.capsule_id === context.root,
    );
    expect(at(root, (model.signer!.key.src as { path: string }).path)).toBe(
      model.signer!.key.value,
    );
    expect(model.signature!.src).toEqual({ checked: "signature" });
    expect(model.properties.src).toEqual({ checked: "card_check" });
  });

  it("is plain JSON, and the parsed JSON draws the same page", async () => {
    for (const name of [
      "person-own",
      "person-shared",
      "neg-window-not-in-policy",
    ]) {
      const context = await buildVerifiedBundleContext(bundleOf(DATA, name));
      const model = await buildHistoryViewModel(context);
      const json = historyViewModelJson(model);
      expect(json.endsWith("\n")).toBe(true);
      const parsed = JSON.parse(json) as HistoryViewModel;
      expect(parsed).toEqual(model);
      const a = draw(model);
      const htmlA = [a.L0, a.L1, a.L2].map((r) => r.innerHTML);
      const b = draw(parsed);
      expect([b.L0, b.L1, b.L2].map((r) => r.innerHTML)).toEqual(htmlA);
    }
  });
});

describe("the page it draws", () => {
  const real = async (name: string) =>
    buildHistoryViewModel(
      await buildVerifiedBundleContext(bundleOf(DATA, name)),
    );

  it("the holder's own card: counts and rows in L0, signer in L1, the card's checks in L2", async () => {
    const model = await real("person-own");
    expect(model.state).toBe("card");
    const page = draw(model);
    expect(
      page.L0.querySelector('[data-history="top-line"]')?.textContent,
    ).toMatch(/^\d+ deals?/u);
    expect(page.L0.querySelectorAll('[data-history="row"]').length).toBe(
      model.deals!.length,
    );
    expect(page.L0.textContent).toContain(words["card.reported.owner"]);
    expect(page.L1.querySelector('[data-history="signed"]')).not.toBeNull();
    expect(page.L1.textContent).toContain(words["card.signed.note"]);
    expect(
      page.L2.querySelectorAll('[data-history="card-checks"] [data-check]')
        .length,
    ).toBe(6);
    // A module page has no header, download, capsulectl lines, stamps or footer: the core draws the page's frame.
    expect(page.text).not.toContain("capsulectl");
    expect(document.querySelector('[data-history="download"]')).toBeNull();
    expect(document.querySelector('[data-history="footer"]')).toBeNull();
    expect(document.querySelector(".cvh-stamps")).toBeNull();
  });

  it("a card someone was sent: counts only, and no holder name", async () => {
    const model = await real("person-shared");
    const page = draw(model);
    expect(model.copy.value).toBe("shared");
    expect(page.L0.querySelectorAll('[data-history="row"]')).toHaveLength(0);
    expect(page.L0.textContent).toContain(words["card.reported.unnamed"]);
    expect(page.L1.textContent).toContain(
      words["card.not_proven.true.unnamed"],
    );
  });

  it("a card that fails its check: no counts, and what failed", async () => {
    const model = await real("neg-window-not-in-policy");
    expect(model.state).toBe("refused");
    const page = draw(model);
    expect(page.L0.textContent).toContain(words["card.module.refused"]);
    expect(page.L0.textContent).not.toMatch(/\d+ deals?/u);
    for (const p of model.fails!)
      expect(page.L0.textContent).toContain(words[`card.module.property.${p}`]);
  });

  it("an unverified and an unreadable context: no counts", async () => {
    const context = standIn(DATA, "person-shared");
    const unverified = await buildHistoryViewModel({
      ...context,
      verification: {
        ...context.verification,
        graphClosure: { status: "fail", findings: [] },
      },
    });
    expect(unverified.state).toBe("unverified");
    expect(draw(unverified).L0.textContent).toContain(
      words["card.module.unverified"],
    );
    const bundle = bundleOf(DATA, "person-shared");
    bundle.extensions["x-standard-history/v0"].extra = 1;
    const unreadable = await buildHistoryViewModel(
      standIn(DATA, "person-shared", bundle),
    );
    expect(unreadable.state).toBe("unreadable");
    const page = draw(unreadable);
    expect(page.L0.textContent).toContain(words["card.module.unreadable"]);
    expect(page.L0.textContent).not.toMatch(/\d+ deals?/u);
  });

  it("inserts the view's stylesheet once per document", async () => {
    const model = await real("person-shared");
    draw(model);
    draw(model);
    expect(
      document.head.querySelectorAll("style[data-history-view-styles]"),
    ).toHaveLength(1);
  });

  it("draws through the module's own render into the host's regions", async () => {
    const context = await buildVerifiedBundleContext(
      bundleOf(DATA, "person-shared"),
    );
    const model = await historyViewModule.buildModel(context);
    const host = {
      L0: document.createElement("div"),
      L1: document.createElement("div"),
      L2: document.createElement("div"),
      depth: "L0" as const,
      setChromeClass: () => {},
    };
    await historyViewModule.render(model, host, {} as never);
    expect(host.L0.getAttribute("data-history-state")).toBe("card");
    expect(host.L0.getAttribute("data-history-copy")).toBe("shared");
    expect(
      host.L2.querySelector('[data-history="card-checks"]'),
    ).not.toBeNull();
  });
});

describe("Codex round 1 (#478): the signature claim, accepted entries, sources and registration", () => {
  const VECTORS = readJson(
    join(ROOT, "vectors", "card-registration-v0", "vectors.json"),
  );
  const statement = VECTORS.cases.find(
    (x: Json) => x.name === "pass-eddsa-time",
  ).statements[0];

  it("says its holder signed the counts only when this page checked the signature", async () => {
    const pass = await buildHistoryViewModel(
      await buildVerifiedBundleContext(bundleOf(DATA, "person-shared")),
    );
    expect(pass.signature?.value.status).toBe("PASS");
    expect(draw(pass).L1.textContent).toContain(
      words["card.not_proven.true.unnamed"],
    );
    // The stand-in context carries no strict result: the signature is not checked here.
    const unchecked = await buildHistoryViewModel(
      standIn(DATA, "person-shared"),
    );
    expect(unchecked.signature?.value.status).toBe("NOT_CHECKED");
    const failedBundle = bundleOf(DATA, "person-shared");
    const root = failedBundle.records[0];
    root.signature =
      (root.signature[0] === "A" ? "B" : "A") + root.signature.slice(1);
    const failed = await buildHistoryViewModel(
      await buildVerifiedBundleContext(failedBundle),
    );
    expect(failed.state).toBe("signature_failed");
    for (const m of [unchecked, failed]) {
      const l1 = draw(m).L1.textContent ?? "";
      expect(l1).toContain(words["card.module.not_proven.true.unsigned"]);
      expect(l1).not.toContain("signed these counts and");
    }
  });

  it("keeps the reading's diagnostics on a card whose signature fails", async () => {
    const b = bundleOf(DATA, "neg-window-not-in-policy");
    const root = b.records.find((r: Json) => r.capsule_id === b.root);
    root.signature =
      (root.signature[0] === "A" ? "B" : "A") + root.signature.slice(1);
    const model = await buildHistoryViewModel(
      await buildVerifiedBundleContext(b),
    );
    expect(model.state).toBe("signature_failed");
    expect(model.fails).toEqual(["window_from_policy"]);
    expect(model.held?.value).toEqual({
      policy: true,
      as_of: true,
      deals: false,
    });
    expect(model.card).toBeUndefined();
    expect(draw(model).L2.querySelectorAll("[data-check]")).toHaveLength(6);
  });

  it("draws every entry the card's check accepted, whatever the shaped-input page's limits", async () => {
    const b = bundleOf(DATA, "person-own");
    const deals = b.extensions["x-standard-history/v0"].deals;
    deals[0].deal = "d".repeat(250);
    deals[0].amount.note = "an amount member the card's check does not read";
    const context = standIn(DATA, "person-own", b);
    const model = await buildHistoryViewModel(context);
    expect(model.state).toBe("card");
    const page = draw(model);
    expect(
      page.L0.querySelector('[data-history="top-line"]')?.textContent,
    ).toMatch(/^\d+ deals?/u);
    expect(page.L0.querySelectorAll('[data-history="row"]')).toHaveLength(
      deals.length,
    );
    expect(page.L2.textContent).toContain("d".repeat(250));
  });

  it("lists no entry the card's entry rule did not accept, even when the recount does not run", async () => {
    const b = bundleOf(DATA, "person-own");
    const block = b.extensions["x-standard-history/v0"];
    delete block.as_of;
    block.deals = [{}];
    const model = await buildHistoryViewModel(standIn(DATA, "person-own", b));
    expect(model.state).toBe("card");
    expect(model.properties.value.counts_recompute).toBe("NOT_CHECKED");
    expect(model.deals).toBeUndefined();
    expect(model.deals_unreadable).toEqual({
      value: true,
      src: { checked: "card_check" },
    });
    const page = draw(model);
    expect(page.L0.querySelectorAll('[data-history="row"]')).toHaveLength(0);
    expect(page.L0.textContent).toContain(words["card.module.rows.unreadable"]);
    expect(page.text).not.toContain("1970");
    // Entries of the right form are listed without the recount.
    const ok = bundleOf(DATA, "person-own");
    delete ok.extensions["x-standard-history/v0"].as_of;
    const listed = await buildHistoryViewModel(standIn(DATA, "person-own", ok));
    expect(listed.deals?.length).toBe(
      ok.extensions["x-standard-history/v0"].deals.length,
    );
  });

  it("reads under /1 only the members the /1 entry rule checks", async () => {
    const b = bundleOf(DATA, "person-own");
    const deals = b.extensions["x-standard-history/v0"].deals;
    // /1 checks `outcome`, not `rows`: a /1 entry's rows are never drawn.
    deals[0].rows = [{}];
    const model = await buildHistoryViewModel(standIn(DATA, "person-own", b));
    expect(model.state).toBe("card");
    expect(model.card?.["derivation"]?.value).toBe("standard_history/1");
    const page = draw(model);
    expect(page.L0.querySelectorAll('[data-history="row"]')).toHaveLength(
      deals.length,
    );
    expect(page.text).not.toContain("undefined");
  });

  it("draws a /3 card's rows from their term results", async () => {
    const vectors = readJson(join(DATA, "aac", "vectors-3.json"));
    const input = vectors.cases.find(
      (c: Json) => c.id === "outcomes-from-rows",
    ).inputs;
    const b = bundleOf(DATA, "person-own");
    b.extensions["x-standard-history/v0"] = {
      policy: input.policy,
      as_of: input.as_of,
      deals: input.deals,
    };
    const base = standIn(DATA, "person-own", b);
    const r = base.resolvedDisclosures.get(base.root);
    const ctx = {
      ...base,
      resolvedDisclosures: new Map(base.resolvedDisclosures).set(base.root, {
        ...r,
        agent_input: { state: "disclosed", payload: input.card },
      }),
    };
    const model = await buildHistoryViewModel(ctx);
    expect(model.state).toBe("card");
    const page = draw(model);
    expect(page.L0.querySelectorAll('[data-history="row"]')).toHaveLength(
      input.deals.length,
    );
    expect(page.L0.textContent).toContain(words["card.term.yours.label"]!);
    expect(page.text).not.toContain("undefined");
  });

  it("attributes the copy and what the block carries to the card's reading", async () => {
    const model = await buildHistoryViewModel(standIn(DATA, "person-own"));
    expect(model.copy).toEqual({
      value: "own",
      src: { checked: "card_check" },
    });
    expect(model.held?.src).toEqual({ checked: "card_check" });
  });

  it("checks card statements as the Python module does, and draws each outcome", async () => {
    const withStatements = (name: string) => {
      const b = bundleOf(WITNESS, name);
      b.extensions["x-standard-history/v0"].card_statements = [statement];
      return b;
    };
    setReaderWitnessPolicy(VECTORS.policies.default);
    // A statement by another key than the card's: FAIL, drawn as a note.
    const real = await buildVerifiedBundleContext(
      withStatements("person-shared-witnessed"),
    );
    const failed = await compare(real);
    expect(failed.registration?.value).toEqual({
      status: "FAIL",
      shown: false,
    });
    expect(draw(failed).L2.textContent).toContain(
      words["card.module.registration.failed"],
    );
    // No verified signature to name a key: NOT_CHECKED, "a card statement came".
    const unchecked = await compare(
      standIn(
        WITNESS,
        "person-shared-witnessed",
        withStatements("person-shared-witnessed"),
      ),
    );
    expect(unchecked.registration?.value.status).toBe("NOT_CHECKED");
    expect(draw(unchecked).L2.textContent).toContain(
      words["card.module.registration.came"],
    );
    // A refused card: the step runs, and nothing is shown as registered.
    const refused = await compare(
      await buildVerifiedBundleContext(
        (() => {
          const b = bundleOf(DATA, "neg-window-not-in-policy");
          b.extensions["x-standard-history/v0"].card_statements = [statement];
          return b;
        })(),
      ),
    );
    expect(refused.state).toBe("refused");
    expect(refused.registration?.value.shown).toBe(false);
  });

  it("draws a passing registration with its service and time, and none on a refused card", async () => {
    const base = await buildHistoryViewModel(
      await buildVerifiedBundleContext(bundleOf(DATA, "person-shared")),
    );
    const pass: HistoryViewModel = {
      ...base,
      registration: {
        value: {
          status: "PASS",
          shown: true,
          service: "service-a",
          at: 1793520240,
        },
        src: { checked: "card_registered" },
      },
    };
    const text = draw(pass).L2.textContent ?? "";
    expect(text).toContain(
      "Registered with service-a by the key this card is signed with",
    );
    expect(text).toContain("2026");
    expect(text).toContain(words["card.module.registration.note"]);
    const untimed = draw({
      ...pass,
      registration: {
        value: { status: "PASS", shown: true, service: "service-a", at: null },
        src: { checked: "card_registered" },
      },
    }).L2.textContent;
    expect(untimed).toContain("Registered with service-a");
  });
});
