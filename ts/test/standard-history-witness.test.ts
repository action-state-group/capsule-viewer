// SPDX-License-Identifier: Apache-2.0
// The History card's witness line (capsule-viewer#183; agent-action-capsule's
// spec/standard-history-v0.md SH-4), run end to end: the module
// src/capsule_viewer/static/standard_history_card.js, on bundles a real
// capsulectl cut (examples/standard-history/cut_witness_fixtures.sh,
// tests/testdata/standard-history/witness/), checked by AAC's own
// checkAnchorWitnessed through the runtime's global under the reader's own
// witness list (src/reader-witnesses.ts). The Receipts are TEST-KEYED: AAC's
// anchor-witness-v1 vectors, whose keys derive from public labels.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  readerAnchorWitness,
  readerWitnessPolicy,
  setReaderWitnessPolicy,
} from "../src/reader-witnesses.js";
// @ts-expect-error a plain JS stand-in shared with the root js-tests
import { standInContext } from "../../js-tests/aacContext.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(ROOT, "tests", "testdata", "standard-history", "witness");
const SCRIPT = readFileSync(
  join(ROOT, "src", "capsule_viewer", "static", "standard_history_card.js"),
  "utf8",
);
const VECTORS = JSON.parse(
  readFileSync(
    join(
      ROOT,
      "tests",
      "testdata",
      "standard-history",
      "aac",
      "anchor-witness-v1.json",
    ),
    "utf8",
  ),
) as { policies: { default: unknown } };
// The reader's list that accepts the vectors' test witnesses.
const READER_LIST = VECTORS.policies.default;

interface Module {
  buildModel(context: unknown): Promise<Record<string, any>>;
  render(model: unknown, host: unknown): void;
}
interface Api {
  withWitness(model: unknown): Promise<Record<string, any>>;
}

const bundleOf = (name: string) =>
  JSON.parse(readFileSync(join(DATA, `${name}.bundle.json`), "utf8"));
const verifyOf = (name: string) =>
  JSON.parse(readFileSync(join(DATA, "verify", `${name}.json`), "utf8"));
const contextOf = (name: string, bundle = bundleOf(name)) =>
  standInContext(bundle, { verify: verifyOf(name) });

const g = globalThis as Record<string, any>;
let registered: Module[];
let api: Api;
let runtime: Record<string, unknown> | undefined;
let saved: unknown;

/** Load the module into this realm with `EvidenceGraph` as the runtime global. */
function load(withRuntime = true): void {
  registered = [];
  runtime = {
    registerPresentation: (m: Module) => registered.push(m),
    ...(withRuntime
      ? { readerAnchorWitness, readerWitnessPolicy, setReaderWitnessPolicy }
      : {}),
  };
  g.EvidenceGraph = runtime;
  runInThisContext(SCRIPT);
  api = g.CapsuleViewerStandardHistory;
}

beforeAll(() => {
  saved = g.EvidenceGraph;
});
afterAll(() => {
  g.EvidenceGraph = saved;
  delete g.CapsuleViewerStandardHistory;
});
beforeEach(() => {
  setReaderWitnessPolicy(null);
  load();
});

const modelOf = (name: string, bundle?: unknown) =>
  registered[0]!.buildModel(contextOf(name, bundle as never));

function draw(model: unknown): string {
  const dom = new JSDOM("<!doctype html><body></body>");
  const doc = dom.window.document;
  const host = {
    L0: doc.createElement("div"),
    L1: doc.createElement("div"),
    L2: doc.createElement("div"),
    depth: "L2",
  };
  doc.body.append(host.L0, host.L1, host.L2);
  registered[0]!.render(model, host);
  return [host.L0, host.L1, host.L2].map((r) => r.textContent).join("\n");
}

describe("the witness line, with the reader's own witness list", () => {
  it("draws 'Snapshot recorded <time> by <witness>' for a Receipt that checks, and only then", async () => {
    setReaderWitnessPolicy(READER_LIST);
    const model = await modelOf("person-shared-witnessed");
    expect(model.state).toBe("card");
    expect(model.properties.as_of).toBe("PASS");
    expect(model.witness).toMatchObject({
      status: "PASS",
      shown: true,
      witness: "witness-a",
    });
    // AAC's vector: registration time 1793520240, 2026-11-01T08:04:00Z.
    expect(draw(model)).toContain(
      "Snapshot recorded Nov 1, 2026 08:04 UTC by witness-a",
    );
  });

  it("says the witness recorded the snapshot and did not check the counts", async () => {
    setReaderWitnessPolicy(READER_LIST);
    const text = draw(await modelOf("person-shared-witnessed"));
    expect(text).toContain("That a witness checked the counts.");
    expect(text).toContain("it did not check the counts");
    expect(text).not.toContain("That an outside witness saw the snapshot.");
  });

  it("names the witness as the reader's list names it, with an ES256 Receipt too", async () => {
    setReaderWitnessPolicy(READER_LIST);
    const model = await modelOf("person-shared-witnessed-es256");
    expect(model.witness).toMatchObject({
      status: "PASS",
      shown: true,
      witness: "witness-b",
    });
    expect(draw(model)).toContain("by witness-b");
  });

  it("draws the line without a time for a Receipt that passes with no registration time", async () => {
    setReaderWitnessPolicy(READER_LIST);
    const model = await modelOf("person-shared-witnessed-untimed");
    expect(model.witness).toMatchObject({
      status: "PASS",
      shown: true,
      at: null,
    });
    const text = draw(model);
    expect(text).toContain("Snapshot recorded by witness-a");
    expect(text).not.toMatch(/Snapshot recorded \w+ \d/);
  });

  it("with no list of the reader's (the default), checks nothing and says only that a receipt came, not checked", async () => {
    const model = await modelOf("person-shared-witnessed");
    expect(model.witness).toMatchObject({
      status: "NOT_CHECKED",
      shown: false,
    });
    const text = draw(model);
    expect(text).toContain(
      "A witness receipt came with the card. This page has not checked it against a witness you accept.",
    );
    expect(text).not.toContain("Snapshot recorded");
    expect(text).toContain("Witnesses you accept: None.");
  });

  it("with no runtime check at all, is NOT_CHECKED too, never a false claim", async () => {
    load(false);
    setReaderWitnessPolicy(READER_LIST);
    const model = await modelOf("person-shared-witnessed");
    expect(model.witness).toMatchObject({
      status: "NOT_CHECKED",
      shown: false,
    });
    expect(draw(model)).not.toContain("Snapshot recorded");
  });

  it.each([
    [
      "a Receipt signed by a key the reader's list does not name",
      "person-shared-witness-unlisted",
    ],
    ["a Receipt whose signature is tampered", "person-shared-witness-tampered"],
  ])("says nothing about a witness for %s (FAIL)", async (_why, name) => {
    setReaderWitnessPolicy(READER_LIST);
    const model = await modelOf(name);
    expect(model.witness).toMatchObject({ status: "FAIL", shown: false });
    const text = draw(model);
    expect(text).not.toContain("Snapshot recorded");
    expect(text).not.toContain("receipt came with the card");
  });

  it("a bundle with no Receipts says nothing about a witness", async () => {
    setReaderWitnessPolicy(READER_LIST);
    const model = await modelOf("person-shared-unwitnessed");
    expect(model.witness).toMatchObject({
      status: "NOT_PRESENT",
      shown: false,
    });
    const text = draw(model);
    expect(text).not.toContain("Snapshot recorded");
    expect(text).not.toContain("receipt came with the card");
    expect(text).not.toContain("Witnesses you accept");
  });

  it("draws no line when the card's as_of does not pass, even if the Receipt does", async () => {
    setReaderWitnessPolicy(READER_LIST);
    const model = await modelOf("person-shared-witnessed-asof-fails");
    expect(model.state).toBe("refused");
    expect(draw(model)).not.toContain("Snapshot recorded");
    // The guard itself, on a card model whose as_of fails: shown is false.
    const ok = await modelOf("person-shared-witnessed");
    const forced = { ...ok, properties: { ...ok.properties, as_of: "FAIL" } };
    const again = await (api as any).withWitness(forced);
    expect(again.witness).toMatchObject({ status: "PASS", shown: false });
    expect(draw(again)).not.toContain("Snapshot recorded");
  });

  it("never takes a witness from the bundle: names and keys there add nothing", async () => {
    // The block is closed: a witness list it carries is a malformed block.
    for (const place of ["block", "as_of"] as const) {
      const bundle = bundleOf("person-shared-witnessed");
      const block = bundle.extensions["x-standard-history/v0"];
      (place === "block" ? block : block.as_of).witnesses = READER_LIST;
      expect((await modelOf("person-shared-witnessed", bundle)).state).toBe(
        "unreadable",
      );
    }
  });

  it("changes with the reader's list, which the card's page can edit", async () => {
    const before = await modelOf("person-shared-witnessed");
    expect(before.witness.shown).toBe(false);
    setReaderWitnessPolicy(READER_LIST);
    expect(
      (await registered[0]!.buildModel(contextOf("person-shared-witnessed")))
        .witness.shown,
    ).toBe(true);
    setReaderWitnessPolicy({ witnesses: [] });
    expect(
      (await registered[0]!.buildModel(contextOf("person-shared-witnessed")))
        .witness.shown,
    ).toBe(false);
  });
});

describe("the block's as_of.checkpoint and as_of.receipts", () => {
  const mutate = async (edit: (asOf: Record<string, unknown>) => void) => {
    const bundle = bundleOf("person-shared-witnessed");
    edit(bundle.extensions["x-standard-history/v0"].as_of);
    return (await modelOf("person-shared-witnessed", bundle)).state;
  };

  it.each([
    [
      "an empty receipts array",
      (a: Record<string, unknown>) => (a.receipts = []),
    ],
    [
      "a receipt that is not hex",
      (a: Record<string, unknown>) => (a.receipts = ["zz"]),
    ],
    [
      "an upper-case hex receipt",
      (a: Record<string, unknown>) => (a.receipts = ["AB"]),
    ],
    [
      "an odd-length hex receipt",
      (a: Record<string, unknown>) => (a.receipts = ["abc"]),
    ],
    [
      "65 receipts",
      (a: Record<string, unknown>) => (a.receipts = Array(65).fill("ab")),
    ],
    [
      "receipts that is not an array",
      (a: Record<string, unknown>) => (a.receipts = "ab"),
    ],
    [
      "a checkpoint that is not hex",
      (a: Record<string, unknown>) => (a.checkpoint = "xyz"),
    ],
    [
      "a member the block does not define",
      (a: Record<string, unknown>) => (a.witness = "witness-a"),
    ],
  ])("reads %s as an unreadable block", async (_why, edit) => {
    setReaderWitnessPolicy(READER_LIST);
    expect(await mutate(edit)).toBe("unreadable");
  });

  it("reads a checkpoint whose SHA-256 is not the anchor as an unreadable block", async () => {
    setReaderWitnessPolicy(READER_LIST);
    expect(await mutate((a) => (a.checkpoint = "00".repeat(8)))).toBe(
      "unreadable",
    );
  });

  it("holds a carried checkpoint to the anchor on a refused card too, and without Receipts", async () => {
    setReaderWitnessPolicy(READER_LIST);
    const refused = bundleOf("person-shared-witnessed-asof-fails");
    refused.extensions["x-standard-history/v0"].as_of.checkpoint = "00".repeat(
      8,
    );
    expect(
      (await modelOf("person-shared-witnessed-asof-fails", refused)).state,
    ).toBe("unreadable");
    const bare = bundleOf("person-shared-unwitnessed");
    bare.extensions["x-standard-history/v0"].as_of.checkpoint = "00".repeat(8);
    expect((await modelOf("person-shared-unwitnessed", bare)).state).toBe(
      "unreadable",
    );
  });

  it("keeps anchor_inclusion NOT_CHECKED and reports the witness as its own row", async () => {
    setReaderWitnessPolicy(READER_LIST);
    const dom = new JSDOM("<!doctype html><body></body>");
    const doc = dom.window.document;
    const host = {
      L0: doc.createElement("div"),
      L1: doc.createElement("div"),
      L2: doc.createElement("div"),
      depth: "L2",
    };
    doc.body.append(host.L0, host.L1, host.L2);
    registered[0]!.render(await modelOf("person-shared-witnessed"), host);
    const row = (p: string) =>
      doc
        .querySelector(`[data-property="${p}"]`)
        ?.getAttribute("data-property-status");
    expect(row("anchor_inclusion")).toBe("NOT_CHECKED");
    expect(row("anchor_witnessed")).toBe("PASS");
    // A Receipt the reader's list does not name is a FAIL: no row about a witness at all.
    const fail = new JSDOM("<!doctype html><body></body>").window.document;
    const h2 = {
      L0: fail.createElement("div"),
      L1: fail.createElement("div"),
      L2: fail.createElement("div"),
      depth: "L2",
    };
    fail.body.append(h2.L0, h2.L1, h2.L2);
    registered[0]!.render(await modelOf("person-shared-witness-unlisted"), h2);
    expect(fail.querySelector('[data-property="anchor_witnessed"]')).toBeNull();
  });
});

describe("readerAnchorWitness, the runtime's check for the module", () => {
  const octets = "6162636465666768";
  const anchor = createHash("sha256")
    .update(Buffer.from(octets, "hex"))
    .digest("hex");

  it("accepts a checkpoint exactly when its SHA-256 is the anchor", async () => {
    expect((await readerAnchorWitness(anchor, octets, null)).checkpoint).toBe(
      "match",
    );
    expect(
      (await readerAnchorWitness("0".repeat(64), octets, null)).checkpoint,
    ).toBe("mismatch");
    expect((await readerAnchorWitness(anchor, null, null)).checkpoint).toBe(
      "not_carried",
    );
  });

  it("checks no Receipt under a checkpoint that is not the anchor's", async () => {
    setReaderWitnessPolicy(READER_LIST);
    const report = await readerAnchorWitness("0".repeat(64), octets, ["ab"]);
    expect(report).toMatchObject({
      checkpoint: "mismatch",
      status: "NOT_CHECKED",
      witness: null,
    });
  });

  it("with no Receipt says NOT_PRESENT; under an empty list, NOT_CHECKED", async () => {
    expect((await readerAnchorWitness(anchor, octets, null)).status).toBe(
      "NOT_PRESENT",
    );
    const witnessed = bundleOf("person-shared-witnessed").extensions[
      "x-standard-history/v0"
    ].as_of;
    const report = await readerAnchorWitness(
      witnessed.anchor,
      null,
      witnessed.receipts,
    );
    expect(report.status).toBe("NOT_CHECKED");
    setReaderWitnessPolicy(READER_LIST);
    expect(
      await readerAnchorWitness(witnessed.anchor, null, witnessed.receipts),
    ).toMatchObject({
      status: "PASS",
      witness: "witness-a",
      witnessed_time: 1793520240,
    });
  });
});

describe("the reader changes their witness list on the page", () => {
  // The module runs in a jsdom window of its own, with this realm's runtime.
  async function page(options: { slowFirstAfterLoad?: boolean } = {}) {
    const dom = new JSDOM("<!doctype html><body></body>", {
      runScripts: "outside-only",
    });
    const w = dom.window as unknown as Record<string, any>;
    const modules: Module[] = [];
    let loaded = false;
    let slowed = false;
    w.EvidenceGraph = {
      registerPresentation: (m: Module) => modules.push(m),
      readerAnchorWitness: async (
        ...args: Parameters<typeof readerAnchorWitness>
      ) => {
        // The first check after the page drew is the slow one, decided at the call.
        const slow = options.slowFirstAfterLoad && loaded && !slowed;
        if (slow) slowed = true;
        const report = await readerAnchorWitness(...args);
        if (slow) await new Promise((r) => setTimeout(r, 60));
        return report;
      },
      readerWitnessPolicy: () =>
        JSON.parse(JSON.stringify(readerWitnessPolicy())),
      setReaderWitnessPolicy,
    };
    dom.window.eval(SCRIPT);
    const doc = dom.window.document;
    const host = {
      L0: doc.createElement("div"),
      L1: doc.createElement("div"),
      L2: doc.createElement("div"),
      depth: "L2",
    };
    doc.body.append(host.L0, host.L1, host.L2);
    const model = await modules[0]!.buildModel(
      contextOf("person-shared-witnessed"),
    );
    modules[0]!.render(model, host);
    loaded = true;
    const text = () =>
      [host.L0, host.L1, host.L2].map((r) => r.textContent).join("\n");
    const q = (sel: string) =>
      doc.querySelector(sel) as HTMLElement & HTMLTextAreaElement;
    return { text, q, host, tick: () => new Promise((r) => setTimeout(r, 20)) };
  }

  it("saves a list, draws the line, and goes back to none", async () => {
    const p = await page();
    expect(p.text()).toContain("Witnesses you accept: None.");
    expect(p.text()).not.toContain("Snapshot recorded");
    p.q('[data-sh-witness-list="input"]').value = JSON.stringify(READER_LIST);
    p.q('[data-sh-witness-list="save"]').click();
    await p.tick();
    expect(p.text()).toContain(
      "Snapshot recorded Nov 1, 2026 08:04 UTC by witness-a",
    );
    expect(p.text()).toContain("witness-a, witness-b");
    // One module's content per region, not a pile of redraws.
    expect(p.host.L0.querySelectorAll("[data-sh-module]")).toHaveLength(1);
    expect(readerWitnessPolicy().witnesses.length).toBeGreaterThan(0);
    p.q('[data-sh-witness-list="reset"]').click();
    await p.tick();
    expect(p.text()).not.toContain("Snapshot recorded");
    expect(p.text()).toContain("Witnesses you accept: None.");
    expect(readerWitnessPolicy().witnesses).toHaveLength(0);
  });

  it("refuses text that is not a witness list and changes nothing", async () => {
    const p = await page();
    p.q('[data-sh-witness-list="input"]').value =
      '{"witnesses": [{"name": "w"}]}';
    p.q('[data-sh-witness-list="save"]').click();
    await p.tick();
    expect(p.text()).toContain(
      "That is not a witness list, so nothing changed.",
    );
    expect(p.text()).not.toContain("Snapshot recorded");
    expect(readerWitnessPolicy().witnesses).toHaveLength(0);
  });

  it("draws only the newest check when the list changes while an older one runs", async () => {
    const p = await page({ slowFirstAfterLoad: true });
    p.q('[data-sh-witness-list="input"]').value = JSON.stringify(READER_LIST);
    p.q('[data-sh-witness-list="save"]').click(); // slow: finishes last
    p.q('[data-sh-witness-list="reset"]').click(); // fast: the newest
    await new Promise((r) => setTimeout(r, 120));
    expect(p.text()).not.toContain("Snapshot recorded");
    expect(p.text()).toContain("Witnesses you accept: None.");
  });
});
