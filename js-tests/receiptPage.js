// A receipt module-slot script run in a real page, as `presentation build`
// puts one in a page: the script, the case it renders (the bundle's context and
// the inputs the page's runtime does not hand a module), and a host element.
// Shared by the receipt layout, golden and module-slot Chromium tests.
import {
  caseInputs, receiptGolden, readBundle, REVIVE_CONTEXT, scriptBytes, scriptJson, serializeContext,
} from "./receiptScripts.js";

export const BOOT = `
document.addEventListener("DOMContentLoaded", () => (async () => {
  const revive = ${REVIVE_CONTEXT};
  const c = window.__RECEIPT_CASE__;
  const info = new Map();
  const context = revive(c.context);
  if (c.env) info.set(context, c.env);
  const members = {};
  for (const [id, m] of Object.entries(c.members || {})) { members[id] = revive(m); info.set(members[id], c.env.members[id]); }
  const env = c.env ? { audience: c.audience, verification: (x) => info.get(x).verification, assurance: (x) => info.get(x).assurance, memberContext: (b, id) => members[id] } : {};
  const module = window.CapsuleViewerReceipt.createModule(c.kind, env);
  const model = await module.buildModel(context);
  const host = document.getElementById("cv-host");
  module.render(model, { L0: host, L1: host, L2: host, depth: c.depth });
  document.body.setAttribute("data-rendered", "true");
})().catch((e) => document.body.setAttribute("data-rendered", "error: " + e.message)));`;

export function scriptPage(head, bodyBefore, bodyAfter, kind, data) {
  return `${head}<script>window.__RECEIPT_CASE__ = ${scriptJson(data)};</script><script>${scriptBytes(kind).toString("utf8")}</script>` +
    `<script>${BOOT}</script>${bodyBefore}<div id="cv-host"></div>${bodyAfter}`;
}


/** The page shell the receipt tests put a script in: a viewport, a title and a <main>. */
export const SHELL_HEAD = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>receipt</title></head><body><main>`;
export const SHELL_TAIL = "</main></body></html>";

/**
 * The whole page for fixture *name* at its *audience*: the one script that
 * accepts it (per the frozen golden), rendering at *depth*.
 */
export function receiptScriptPage(name, audience, depth) {
  const c = receiptGolden().cases.find((x) => x.name === name && x.audience === audience);
  const kinds = Object.entries(c.modules).filter(([, m]) => m.can_render).map(([kind]) => kind);
  if (kinds.length !== 1) throw new Error(`${name}@${audience}: ${kinds.length} modules accept it`);
  const kind = kinds[0];
  const { context, env } = caseInputs(c);
  const members = {};
  if (kind === "bilateral") {
    for (const m of readBundle(name).extensions["composed/v1"].members) {
      if (m.outcome === "artifact") members[m.id] = serializeContext(env.memberContext(m.bundle, m.id));
    }
  }
  const html = scriptPage(SHELL_HEAD, "", SHELL_TAIL, kind, { kind, audience, depth, context: serializeContext(context), env: c.env, members });
  return { html, kind };
}
