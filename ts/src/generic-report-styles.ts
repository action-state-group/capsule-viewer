// SPDX-License-Identifier: BSD-3-Clause
/**
 * The generic contract-report view's own stylesheet, scoped under `.gr`. It is
 * its own module, as the other cards' are, so the emitter can list its hash in
 * the page's CSP (CORE_RUNTIME_STYLES): the view inserts it as a `<style>`
 * element at render time.
 */
import { COMPLIANCE_FRAME_VARS } from "./frame-tokens.generated.js";
import { levelCss } from "./report-levels.js";
import { frontCss } from "./report-front-styles.js";

export const GENERIC_REPORT_CSS =
  `
.gr{${COMPLIANCE_FRAME_VARS}
  font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff;display:block;max-width:1080px;margin:26px auto;padding:0 28px}
.gr *{box-sizing:border-box}
.gr h1,.gr h2,.gr h3{font-family:Georgia,"Iowan Old Style",Cambria,serif;color:var(--navy);margin:0}
.gr h1{font-size:28px;margin:6px 0 4px}
.gr h2{font-size:21px;margin:0 0 6px}
.gr h3{font-size:17px;margin:18px 0 6px}
.gr .rsum,.gr .counts{color:var(--slate);margin:0 0 8px}
.gr .rnote{font-size:12.5px;color:var(--slate);margin:2px 0 8px}
.gr .tally{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:13px;margin:4px 0}
.gr .rname{font-weight:600;color:var(--navy)}
.gr .rname code,.gr .cid{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;word-break:break-all}
.gr ul.claims{list-style:none;margin:6px 0 0;padding:0}
.gr .rreason,.gr .rflag{font-size:12.5px;border-radius:6px;padding:2px 8px;background:#EEF0F3;color:var(--slate)}
.gr .rreason{margin:4px 0 6px 22px}
.gr .rreason[data-tone="warn"],.gr .rflag[data-tone="warn"]{background:var(--bad-l);color:var(--bad);font-weight:700}
.gr .tier-note{font-size:12.5px;color:var(--slate)}
.gr .rcpt{margin:6px 0 6px 22px;font-size:13px}
.gr .rcpt button{font:inherit;color:var(--navy);background:#fff;border:1px solid var(--navy);border-radius:6px;padding:2px 10px;cursor:pointer}
.gr .rcpt-note{color:var(--slate);margin:0}
.gr .rcpt-panel{margin-top:8px;border-top:1px solid #D9DDE3;padding-top:8px}
` +
  levelCss("gr") +
  frontCss(".gr");
