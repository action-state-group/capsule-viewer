// Shared by the receipt module-slot tests: the three scripts as shipped, run
// in a fresh jsdom window each, and the inputs the Python oracle
// (tests/receipt_oracle.py) hands both sides.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
const SCRIPTS = process.env.RECEIPT_SCRIPT_DIR || join(ROOT, "src", "capsule_viewer", "static");

export const scriptBytes = (kind) => readFileSync(join(SCRIPTS, `receipt_${kind}.js`));
export const manifestOf = (kind) => JSON.parse(readFileSync(join(ROOT, "src", "capsule_viewer", "receipt", "module-slot", `manifest-${kind}.json`), "utf8"));
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
/** The Python modules' output for every case (run once). */
export function pythonOracle() {
  if (!oracle) {
    const out = execFileSync(PY, [join(ROOT, "tests", "receipt_oracle.py")], { cwd: ROOT, env: PY_ENV, encoding: "utf8", maxBuffer: 1 << 28 });
    oracle = JSON.parse(out);
  }
  return oracle;
}

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
