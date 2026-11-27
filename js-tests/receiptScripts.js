// Shared by the receipt module-slot tests: the scripts as the Go receipt
// package ships them (go/receipt, the one receipt renderer, capsule-viewer#383),
// run in a fresh jsdom window each, and the frozen golden (receiptGolden) the
// scripts are held to.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { standInContext } from "./aacContext.js";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const KINDS = ["unilateral", "seller", "bilateral"];
export const RECEIPTS = join(ROOT, "tests", "testdata", "receipt");
export const PY = process.env.PYTHON || "python3";
export const PY_ENV = { ...process.env, PYTHONPATH: join(ROOT, "src") };
// RECEIPT_SCRIPT_DIR runs the tests against other bytes (a mutant, to show
// the parity test red); unset, the shipped scripts.
export const RECEIPT_DIR = join(ROOT, "go", "receipt");
const SCRIPTS = process.env.RECEIPT_SCRIPT_DIR || RECEIPT_DIR;

export const scriptBytes = (kind) => readFileSync(join(SCRIPTS, `receipt_${kind}.js`));
export const manifestOf = (kind) => JSON.parse(readFileSync(join(RECEIPT_DIR, `manifest-${kind}.json`), "utf8"));
// The Python twin is frozen at 0.25.0, except that its wording pack carries the
// same id as go/receipt's, capsuleviewer.receipt.wording.en/v1 (evidencebook#956,
// #439: a person's page does not run on a pack named "example"). The scripts
// carry go/receipt's pack, which only adds keys (packAddsOnly holds that), so
// the two packs differ in digest. A page names its pack's sha256, so the
// oracle's pages are read with the current pack's sha256 in place of the
// frozen one, and a value the twin drew unworded (a `data-unworded` span) is
// read with the word the current pack added for it (withAddedWords); every
// other byte is still compared.
const packBytes = (dir) => readFileSync(join(dir, "wording-en.json"));
const FROZEN_PACK = packBytes(join(ROOT, "src", "capsule_viewer", "receipt_slot"));
const CURRENT_PACK = packBytes(RECEIPT_DIR);
const sha = (b) => createHash("sha256").update(b).digest("hex");
export const FROZEN_PACK_SHA256 = sha(FROZEN_PACK);
export const CURRENT_PACK_SHA256 = sha(CURRENT_PACK);
export const withCurrentPack = (html) => html.split(FROZEN_PACK_SHA256).join(CURRENT_PACK_SHA256);
/** The keys of the frozen pack the current one changed or dropped (none, while the twin is the oracle), and both packs' ids. */
export function packAddsOnly() {
  const frozen = JSON.parse(FROZEN_PACK.toString("utf8"));
  const current = JSON.parse(CURRENT_PACK.toString("utf8"));
  const changed = Object.keys(frozen.entries).filter((k) => current.entries[k] !== frozen.entries[k]);
  return { changed, frozenId: frozen.id, currentId: current.id };
}

export const readBundle = (name) => JSON.parse(readFileSync(join(RECEIPTS, `${name}.bundle.json`), "utf8"));
export const readVerify = (name) => JSON.parse(readFileSync(join(RECEIPTS, `${name}.verify.json`), "utf8"));

/** One script loaded in its own window, as a page's module slot loads it. */
export function loadScript(kind) {
  const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", { runScripts: "outside-only" });
  const registered = [];
  dom.window.EvidenceGraph = { registerPresentation: (m) => registered.push(m) };
  dom.window.eval(scriptBytes(kind).toString("utf8"));
  return { window: dom.window, document: dom.window.document, registered, api: dom.window.CapsuleViewerReceipt };
}

let oracle;
/**
 * The frozen receipt output for every case: what the Python modules made of
 * each receipt fixture (canRender, model, and the page at L0, L1 and L2), kept
 * as tests/testdata/receipt/oracle-golden.json.gz. The scripts are held to it.
 * tests/test_receipt_oracle_golden.py holds the file to the Python modules
 * for as long as they exist, and it is frozen before they go (u526): it then
 * holds the scripts on its own. Regenerate with
 * `python tests/receipt_oracle.py | gzip -n -9 > tests/testdata/receipt/oracle-golden.json.gz`.
 */
export function receiptGolden() {
  if (!oracle) {
    const all = JSON.parse(gunzipSync(readFileSync(join(RECEIPTS, "oracle-golden.json.gz"))).toString("utf8"));
    // The cases a page refuses before any module runs (a report that does not name the copy) are apart: refusedCases.
    oracle = { ...all, cases: all.cases.filter((c) => c.refused === undefined), refused: all.cases.filter((c) => c.refused !== undefined) };
  }
  return oracle;
}
/** The golden's cases the page refuses before any module runs, each with the Python twin's reason. */
export const refusedCases = () => receiptGolden().refused;

/**
 * A case's context and the environment the Python twin was given: capsulectl's
 * verification and assurance for the bundle and for each carried copy, and the
 * page audience (or null: the copy's own).
 */
export function caseInputs(c, audience = c.audience) {
  const bundle = c.bundle ?? readBundle(c.name);
  const verify = c.verify ?? readVerify(c.name);
  const info = new WeakMap();
  const context = standInContext(bundle, { verify });
  info.set(context, c.env);
  const composed = (verify.extensions || []).find((e) => e.kind === "composed/v1")?.composed;
  const env = {
    audience,
    verification: (ctx) => info.get(ctx).verification,
    assurance: (ctx) => info.get(ctx).assurance,
    memberContext: (memberBundle, id) => {
      const report = (composed?.members || []).find((m) => m.id === id)?.bundle;
      const member = standInContext(memberBundle, { verify: report });
      info.set(member, c.env.members[id]);
      return member;
    },
  };
  return { context, env };
}

/** Render a model into a host whose three regions are separate elements. */
export function renderInto(loaded, module, model, depth) {
  const doc = loaded.document;
  const host = { L0: doc.createElement("div"), L1: doc.createElement("div"), L2: doc.createElement("div"), depth };
  module.render(model, host, {});
  return host;
}

/** The level elements a render drew, in L0, L1, L2 order. */
export function levelNodes(host) {
  return [host.L0, host.L1, host.L2].flatMap((region) => [...region.children].map((wrap) => wrap.firstElementChild));
}

const esc = (s, attr) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, attr ? "&quot;" : '"');

/** A canonical serialisation: attributes sorted by name, text escaped one way. */
export function canon(node) {
  if (node.nodeType === 3) return esc(node.data, false);
  if (node.nodeType === 11) return [...node.childNodes].map(canon).join("");
  if (node.nodeType !== 1) return "";
  const attrs = [...node.attributes].map((a) => [a.name, a.value]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const tag = node.tagName.toLowerCase();
  return `<${tag}${attrs.map(([k, v]) => ` ${k}="${esc(v, true)}"`).join("")}>${[...node.childNodes].map(canon).join("")}</${tag}>`;
}

/**
 * *html* with each unworded value whose key the current pack added since the
 * frozen one (`deal_type.service`, `deal_type.rental`: capsule-viewer#391)
 * drawn as that word, as the scripts draw it. Keys the frozen pack already
 * had, and keys neither pack words, are left as they are.
 */
export function withAddedWords(doc, html) {
  const frozen = JSON.parse(FROZEN_PACK.toString("utf8")).entries;
  const current = JSON.parse(CURRENT_PACK.toString("utf8")).entries;
  const t = doc.createElement("template");
  t.innerHTML = html;
  for (const span of t.content.querySelectorAll("[data-unworded]")) {
    const key = span.getAttribute("data-unworded");
    if (!(key in frozen) && key in current) span.replaceWith(doc.createTextNode(current[key]));
  }
  return t.innerHTML;
}

/**
 * The Python page without its Amount card: capsule-viewer#391 drops the card
 * when no signed field carries an amount (the model's headline amount is
 * "not_present"), where the frozen twin still draws it. Every other byte is
 * compared.
 */
export function withoutAmountCard(doc, html) {
  const t = doc.createElement("template");
  t.innerHTML = html;
  for (const card of t.content.querySelectorAll(".cv-metric")) {
    const label = card.querySelector(".cv-metric__label");
    if (label && label.textContent === "Amount") card.remove();
  }
  return t.innerHTML;
}

/**
 * The model fields of the lines the frozen twin never draws (capsule-viewer#383,
 * Sherlock2's ruling on the deal-view lines the viewer gains): the settlement
 * line (js-tests/receipt_settlement.test.js) and who the deal was with
 * (js-tests/receipt_deal_view_lines.test.js).
 */
export const VIEWER_FIELDS = ["settlement", "counterparty_named", "after_yes", "authority_sealed", "referee"];
/** Those lines' elements in a script's render. */
export const VIEWER_LINES = ['[data-rung="settlement"]', '[data-rung="counterparty"]', '[data-rung="accepted"]', '[data-rung="after-yes"]', '[data-authority]', '[data-rung="referee"]', '[data-deal-id]'].join(", ");

/**
 * A script's model with the viewer's own lines (VIEWER_FIELDS) taken out, so
 * every other field is still compared with the twin.
 */
export function withoutViewerFields(model) {
  const out = withoutSources(model);
  for (const field of VIEWER_FIELDS) {
    delete out[field];
    if (out.receipt && typeof out.receipt === "object") delete out.receipt[field];
  }
  return out;
}
/**
 * What the model says without where each value was read (`sources`, `src`;
 * the view-model note's section 2): the frozen twin's model names no sources,
 * so the two are compared on their values. ts/test/receipt-v0-model.test.ts
 * holds the sources themselves.
 */
export function withoutSources(model) {
  return JSON.parse(JSON.stringify(model), function (key, value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      delete value.sources;
      delete value.src;
    }
    return value;
  });
}
/** The script's level elements with the viewer's own lines (VIEWER_LINES) removed, so every other byte is still compared. */
export function withoutViewerLines(nodes) {
  for (const node of nodes) for (const line of node.querySelectorAll(VIEWER_LINES)) line.remove();
  return nodes;
}

/** HTML text (the Python module's render) parsed and canonicalised. */
export function canonHtml(doc, html) {
  const t = doc.createElement("template");
  t.innerHTML = html;
  return canon(t.content);
}

/** The JS levels, serialised, re-parsed and canonicalised (parse-stable, as the Python string is). */
export function canonNodes(doc, nodes) {
  return canonHtml(doc, nodes.map((n) => n.outerHTML).join(""));
}

/** A stand-in context as JSON, its maps as entry lists (`reviveContext` in the page undoes it). */
export function serializeContext(ctx) {
  return { ...ctx, resolvedDisclosures: [...ctx.resolvedDisclosures], recordIndex: [...ctx.recordIndex] };
}

/** The in-page half of serializeContext, as page script text. */
export const REVIVE_CONTEXT = "(s) => ({ ...s, resolvedDisclosures: new Map(s.resolvedDisclosures), recordIndex: new Map(s.recordIndex) })";

/** JSON safe to put inside a <script> element. */
export const scriptJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

// The x-deal-v1 extension a bundle carries for a report (evidencebook#597): the sealed report's id and the book,
// whose relied_on holds a bare Capsule pair for each record the report's rows name (no leg among them).
export function v1Extension(report, sealed = "rep-1") {
  const relied_on = {};
  const rows = report && Array.isArray(report.rows) ? report.rows : [];
  for (const row of rows) {
    for (const e of row && Array.isArray(row.relied_on) ? row.relied_on : []) {
      if (e && typeof e.record === "string") relied_on[e.record] = { record: { capsule_id: e.record } };
    }
  }
  return { sealed_report: sealed, book: { agreement: {}, relied_on } };
}
