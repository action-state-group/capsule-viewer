// The module-slot scripts read their words from wording packs, as data
// (Viewer PRD section 6 R7; agent-action-capsule's presentation contract,
// sections 7.3 and 7.4). Each script carries its packs' exact bytes on its
// generated lines (receipt_*.js: the receipt pack, receipt/wording-en.json, and
// the kit's, kit/wording-en.json; history_card.js: history/wording-en.json),
// parses them at load and hashes them.
//
// (3) the model a script builds records wording_sha256, the SHA-256 of the
//     pack's bytes as distributed, and renderer_version;
// (2) the same scripts written with a stub pack in place of each pack
//     (python: module_slot.script_bytes, history.filled_script) render other
//     words and NOT ONE other evidence identifier, digest or verification
//     state: for every receipt case the parity test compares (the Python
//     oracle's inputs) and every History file, the model is the same but for
//     its wording_sha256 (and a History's L0 lines, which are words), and the
//     rendered page has the same attributes (but data-label, a table column's
//     words), the same hex identifiers and digests in its text (but the packs'
//     own sha256), and different text;
// and pack parity: each script's pack is, byte for byte, the one the Python
// twin reads, and both record the same renderer_version.
// tests/test_wording_packs.py holds the rest: the literal grep (1), T8 over
// the packs (4), and no pack word sealed in any record (5).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { standInContext } from "./aacContext.js";
import { caseInputs, KINDS, loadScript, PY, PY_ENV, pythonOracle, ROOT } from "./receiptScripts.js";

const SRC = join(ROOT, "src", "capsule_viewer");
const PACK_FILES = {
  receipt: join(SRC, "receipt", "wording-en.json"),
  kit: join(SRC, "kit", "wording-en.json"),
  history: join(SRC, "history", "wording-en.json"),
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const PACK_SHA = Object.fromEntries(Object.entries(PACK_FILES).map(([k, f]) => [k, sha256(readFileSync(f))]));
const HISTORY = join(ROOT, "tests", "testdata", "history");
const HISTORY_FILES = readdirSync(HISTORY).filter((f) => f.endsWith(".bundle.json")).map((f) => f.replace(/\.bundle\.json$/, "")).sort();
const VERSION = execFileSync(PY, ["-c", "from capsule_viewer.version import VERSION; print(VERSION)"], { env: PY_ENV, encoding: "utf8" }).trim();

// A stub of a pack: the same keys, each entry "⟪key⟫" and the entry's own placeholders.
function stubPack(file) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const entries = Object.fromEntries(Object.entries(raw.entries).map(([k, v]) => [k, `⟪${k}⟫${(v.match(/\{[a-z_]+\}/g) || []).map((p) => ` ${p}`).join("")}`]));
  return JSON.stringify({ ...raw, id: raw.id.replace(/\.example-en\//, ".stub-en/"), entries }, null, 2) + "\n";
}

function loadHistory(path) {
  const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", { runScripts: "outside-only" });
  dom.window.eval(readFileSync(path, "utf8"));
  return { H: dom.window.CapsuleViewerHistory, document: dom.window.document };
}

function loadReceipt(path) {
  const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", { runScripts: "outside-only" });
  dom.window.eval(readFileSync(path, "utf8"));
  return { api: dom.window.CapsuleViewerReceipt, document: dom.window.document };
}

const hostIn = (document, depth = "L2") => ({ L0: document.createElement("div"), L1: document.createElement("div"), L2: document.createElement("div"), depth });
const plain = (v) => JSON.parse(JSON.stringify(v));
const without = (model, ...keys) => {
  const out = plain(model);
  for (const k of keys) delete out[k];
  return out;
};

// What a page shows that is evidence or its verification, apart from words:
// every attribute (but data-label, a column's words), in document order, and
// every hex identifier or digest in its text (but a pack's own sha256).
function evidence(host, packShas) {
  const attrs = [];
  const walk = (node) => {
    for (const a of node.attributes || []) if (a.name !== "data-label") attrs.push(`${a.name}=${a.value}`);
    for (const c of node.children || []) walk(c);
  };
  [host.L0, host.L1, host.L2].forEach(walk);
  const text = [host.L0, host.L1, host.L2].map((r) => r.textContent).join("\n");
  const hex = (text.match(/[0-9a-f]{16,}/g) || []).filter((h) => !packShas.includes(h));
  return { attrs, hex };
}
const textOf = (host) => [host.L0, host.L1, host.L2].map((r) => r.textContent).join("\n");

let dir;
const stub = {};
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "cv-stub-packs-"));
  for (const [name, file] of Object.entries(PACK_FILES)) {
    stub[name] = join(dir, `${name}-stub.json`);
    writeFileSync(stub[name], stubPack(file));
  }
  // The shipped scripts, written again over the stub packs by the repository's own generators.
  execFileSync(PY, ["-c", [
    "import sys",
    "from pathlib import Path",
    "from capsule_viewer.receipt import module_slot",
    "from capsule_viewer.history import filled_script",
    "out, receipt, kit, history = (Path(a) for a in sys.argv[1:5])",
    "for kind in module_slot.KINDS:",
    "    (out / f'receipt_{kind}.js').write_bytes(module_slot.script_bytes(kind, receipt.read_bytes(), kit.read_bytes()))",
    "source = (module_slot.STATIC / 'history_card.js').read_text(encoding='utf-8')",
    "(out / 'history_card.js').write_text(filled_script(source, history.read_bytes()), encoding='utf-8')",
  ].join("\n"), dir, stub.receipt, stub.kit, stub.history], { env: PY_ENV });
});
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("(3) the model records wording_sha256 (the pack's bytes) and renderer_version", () => {
  it("each receipt script: its packs' sha256, and its model's", async () => {
    const bundle = JSON.parse(readFileSync(join(ROOT, "tests", "testdata", "receipt", "main-buyer-keep.bundle.json"), "utf8"));
    const verify = JSON.parse(readFileSync(join(ROOT, "tests", "testdata", "receipt", "main-buyer-keep.verify.json"), "utf8"));
    for (const kind of KINDS) {
      const { api } = loadScript(kind);
      expect(api.PACK.wording_sha256).toBe(PACK_SHA.receipt);
      expect(api.KIT_PACK.wording_sha256).toBe(PACK_SHA.kit);
      expect(api.PACK.id).toBe("capsuleviewer.receipt.wording.example-en/v0");
      expect(api.VERSION).toBe(VERSION);
      expect(api.rendererVersion(kind)).toBe(`capsuleviewer.receipt.${kind}/v0@${VERSION}`);
    }
    const { api } = loadScript("unilateral");
    const model = await api.module.buildModel(standInContext(bundle, { verify }));
    expect(model.wording_sha256).toBe(PACK_SHA.receipt);
    expect(model.renderer_version).toBe(`capsuleviewer.receipt.unilateral/v0@${VERSION}`);
  });

  it("the History script: its pack's sha256, in every model it builds, the checking one too", () => {
    const { H } = loadHistory(join(SRC, "static", "history_card.js"));
    expect(H.PACK.wording_sha256).toBe(PACK_SHA.history);
    expect(H.PACK.id).toBe("capsuleviewer.history.wording.example-en/v0");
    expect(H.RENDERER_VERSION).toBe(`capsuleviewer.history/v0@${VERSION}`);
    for (const name of HISTORY_FILES) {
      const model = H.module.buildModel(standInContext(JSON.parse(readFileSync(join(HISTORY, `${name}.bundle.json`), "utf8"))));
      expect(model.wording_sha256, name).toBe(PACK_SHA.history);
      expect(model.renderer_version, name).toBe(H.RENDERER_VERSION);
    }
    expect(H.checkingModel().wording_sha256).toBe(PACK_SHA.history);
  });

  it("bytes that are not a pack word nothing and record no wording_sha256", () => {
    const { H } = loadHistory(join(SRC, "static", "history_card.js"));
    for (const text of ["", "{", "[]", JSON.stringify({ wording_pack_version: "aac.wording-pack/v0", id: "a.b/v0", locale: "en", entries: {} })]) {
      expect(H.readPack(text)).toEqual({ id: "none.refused/v0", entries: {}, wording_sha256: "" });
    }
    const text = readFileSync(PACK_FILES.history, "utf8");
    expect(H.readPack(text).wording_sha256).toBe(PACK_SHA.history);
    // Hashed as the bytes are, never re-serialised: the same entries, other bytes, another sha256.
    expect(H.readPack(JSON.stringify(JSON.parse(text))).wording_sha256).not.toBe(PACK_SHA.history);
  });
});

describe("pack parity: the scripts read the Python twins' packs", () => {
  it("byte for byte, and the same renderer_version", () => {
    const python = JSON.parse(execFileSync(PY, ["-c", [
      "import json",
      "from capsule_viewer.receipt import module_slot",
      "from capsule_viewer.kit.words import KIT_PACK",
      "from capsule_viewer.history.words import HISTORY_PACK",
      "from capsule_viewer.version import renderer_version",
      "import hashlib",
      "print(json.dumps({'receipt': hashlib.sha256(module_slot.pack_bytes()).hexdigest(), 'kit': KIT_PACK.wording_sha256,",
      "  'history': HISTORY_PACK.wording_sha256, 'kit_entries': dict(KIT_PACK.entries), 'history_entries': dict(HISTORY_PACK.entries),",
      "  'renderer': {k: renderer_version(f'capsuleviewer.receipt.{k}/v0') for k in module_slot.KINDS} | {'history': renderer_version('capsuleviewer.history/v0')}}))",
    ].join("\n")], { env: PY_ENV, encoding: "utf8" }));
    expect({ receipt: python.receipt, kit: python.kit, history: python.history }).toEqual(PACK_SHA);
    const { H } = loadHistory(join(SRC, "static", "history_card.js"));
    expect(plain(H.WORDS)).toEqual(python.history_entries);
    expect(H.RENDERER_VERSION).toBe(python.renderer.history);
    for (const kind of KINDS) {
      const { api } = loadScript(kind);
      expect(plain(api.KIT_PACK.entries)).toEqual(python.kit_entries);
      expect(plain(api.WORDS)).toEqual(JSON.parse(readFileSync(PACK_FILES.receipt, "utf8")).entries);
      expect(api.rendererVersion(kind)).toBe(python.renderer[kind]);
    }
  });
});

describe("(2) a stub pack changes the words and no evidence identifier, digest or verification state", () => {
  it("every receipt case the parity test compares, each accepting script", async () => {
    const oracle = pythonOracle();
    const real = Object.fromEntries(KINDS.map((k) => [k, loadScript(k)]));
    const stubbed = Object.fromEntries(KINDS.map((k) => [k, loadReceipt(join(dir, `receipt_${k}.js`))]));
    const stubSha = sha256(readFileSync(stub.receipt));
    const shas = [PACK_SHA.receipt, PACK_SHA.kit, stubSha, sha256(readFileSync(stub.kit))];
    let compared = 0;
    for (const c of oracle.cases) {
      for (const kind of KINDS) {
        if (!c.modules[kind].can_render) continue;
        const inA = caseInputs(c);
        const inB = caseInputs(c);
        const a = real[kind].api.createModule(kind, inA.env);
        const b = stubbed[kind].api.createModule(kind, inB.env);
        const ma = await a.buildModel(inA.context);
        const mb = await b.buildModel(inB.context);
        expect(ma.wording_sha256).toBe(PACK_SHA.receipt);
        expect(mb.wording_sha256).toBe(stubSha);
        expect(without(mb, "wording_sha256"), `${c.name} ${kind}`).toEqual(without(ma, "wording_sha256"));
        for (const depth of ["L0", "L2"]) {
          const ha = hostIn(real[kind].document, depth);
          const hb = hostIn(stubbed[kind].document, depth);
          a.render(ma, ha, {});
          b.render(mb, hb, {});
          expect(textOf(hb)).not.toBe(textOf(ha));
          expect(textOf(hb)).toContain("⟪");
          expect(evidence(hb, shas), `${c.name} @${c.audience} ${kind} ${depth}`).toEqual(evidence(ha, shas));
          compared += 1;
        }
      }
    }
    expect(compared).toBe(48);
  }, 600000);

  it("every History file, with capsulectl's verdicts and without, and the checking state", () => {
    const real = loadHistory(join(SRC, "static", "history_card.js"));
    const stubbed = loadHistory(join(dir, "history_card.js"));
    const stubSha = sha256(readFileSync(stub.history));
    expect(stubbed.H.PACK.wording_sha256).toBe(stubSha);
    let compared = 0;
    for (const name of HISTORY_FILES) {
      const bundle = JSON.parse(readFileSync(join(HISTORY, `${name}.bundle.json`), "utf8"));
      const verify = JSON.parse(readFileSync(join(HISTORY, "verify", `${name}.json`), "utf8"));
      for (const context of [standInContext(bundle, { verify }), { bundle }]) {
        const ma = real.H.module.buildModel(context);
        const mb = stubbed.H.module.buildModel(context);
        // The L0 lines are words; everything else in the model is evidence and its check.
        const strip = (m) => ({ ...without(m, "wording_sha256"), result: { ...plain(m.result), l0: null } });
        expect(strip(mb), name).toEqual(strip(ma));
        if (ma.result.l0) expect(mb.result.l0).not.toEqual(ma.result.l0);
        const ha = hostIn(real.document);
        const hb = hostIn(stubbed.document);
        real.H.module.render(ma, ha);
        stubbed.H.module.render(mb, hb);
        expect(textOf(hb)).not.toBe(textOf(ha));
        expect(textOf(hb)).toContain("⟪");
        expect(evidence(hb, [PACK_SHA.history, stubSha]), name).toEqual(evidence(ha, [PACK_SHA.history, stubSha]));
        compared += 1;
      }
    }
    const ha = hostIn(real.document);
    const hb = hostIn(stubbed.document);
    real.H.module.render(real.H.checkingModel(), ha);
    stubbed.H.module.render(stubbed.H.checkingModel(), hb);
    expect(textOf(hb)).not.toBe(textOf(ha));
    expect(evidence(hb, [])).toEqual(evidence(ha, []));
    expect(compared).toBe(2 * HISTORY_FILES.length);
  });
});
