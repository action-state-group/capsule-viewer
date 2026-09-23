// Loads the real static modules (capsule_viewer.js + result_v0_card.js) into
// a fresh jsdom window per call, exactly as the shell inlines them (base
// FIRST, then domain modules -- see base_viewer.py's render order comment).
// No transpilation, no mocking: the same bytes that ship in the artifact.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JSDOM } from "jsdom";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = resolve(HERE, "..", "src", "capsule_viewer", "static");

function readStatic(name) {
  return readFileSync(resolve(STATIC_DIR, name), "utf8");
}

export function loadViewer() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const { window } = dom;
  // Deliberately NOT restored after this call: the module's closures
  // (helpers.el, register, renderEntry, ...) resolve the bare `window` /
  // `document` identifiers against the global scope at CALL time, not at
  // eval time -- renderEntry() runs later, asynchronously, well after this
  // function returns. Each test calls loadViewer() again before rendering,
  // which re-points these globals at that test's own fresh jsdom window, so
  // there is no cross-test leakage as long as tests do not render
  // concurrently against two different loadViewer() windows at once.
  globalThis.window = window;
  globalThis.document = window.document;
  // eslint-disable-next-line no-eval
  (0, eval)(readStatic("capsule_viewer.js"));
  // eslint-disable-next-line no-eval
  (0, eval)(readStatic("result_v0_card.js"));
  return window.CapsuleViewer;
}
