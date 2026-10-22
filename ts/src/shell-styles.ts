// SPDX-License-Identifier: BSD-3-Clause
/**
 * The page shell's own stylesheet: the page width and padding every
 * presentation module sits in, the verification pill at the top, and the
 * folded "How this page was checked" section (capsule-viewer#60). Inserted
 * by `renderEvidenceGraph` as a `<style>` element at render time, so its
 * hash is in the emitter's `CORE_RUNTIME_STYLES` (and the Go emitter's
 * runtime-style-hashes.txt). Every selector is scoped under `.cv-shell`, the
 * class the shell puts on its root; a module's own `.cv-page` wrapper drops
 * its width and padding inside it, so no page is padded twice, and a module
 * with its own chrome (the outcome card) keeps its own sheet.
 */
export const SHELL_CSS = `
.cv-shell{display:block;box-sizing:border-box;max-width:60rem;margin:0 auto;padding:24px 16px 40px}
.cv-shell.cv-shell-chrome{max-width:none;padding:0}
.cv-shell .cv-page{max-width:none;margin:0;padding:0}
.cv-shell .cv-shell-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px;margin:0 0 12px}
.cv-shell .cv-pill{display:inline-block;padding:1px 10px;border:1px solid;border-radius:999px;font-size:13px;font-weight:600;line-height:1.6}
.cv-shell .cv-pill[data-verify="verified"]{color:#1e6b34;background:#e6f4ea;border-color:#b7dfc2}
.cv-shell .cv-pill[data-verify="failed"]{color:#a1271b;background:#fdecea;border-color:#f3c3bd}
.cv-shell .cv-shell-note{font-size:13px;color:#5b6472}
.cv-shell details.cv-checked{margin:32px 0 0;padding:12px 0 0;border-top:1px solid #e3ded3}
.cv-shell details.cv-checked>summary{cursor:pointer;font-size:14px;color:#3b4554}
.cv-shell.cv-shell-chrome>details.cv-checked{max-width:1080px;margin:0 auto;padding:16px 16px 40px;border-top:0}
`.trim();
