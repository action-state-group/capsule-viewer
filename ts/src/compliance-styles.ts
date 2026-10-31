// SPDX-License-Identifier: BSD-3-Clause
/**
 * The compliance card's own stylesheet, trimmed to the sections this card
 * renders (summary, test results, findings, sessions drill-down via native
 * `<details>`, quality protocol, run info) and scoped under `.cc` on every
 * selector, so it can never leak onto, or be affected by, the verification
 * page or any other card on the same document.
 */
import { levelCss } from "./report-levels.js";
import { legendCss } from "./report-legend.js";
import { COMPLIANCE_FRAME_VARS } from "./frame-tokens.generated.js";
import { frontCss } from "./report-front-styles.js";

export const COMPLIANCE_CSS =
  `
.cc{${COMPLIANCE_FRAME_VARS}
  font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff;display:block;max-width:1080px;margin:26px auto;padding:0 28px}
.cc *{box-sizing:border-box}
.cc h1,.cc h2,.cc h3{font-family:Georgia,"Iowan Old Style",Cambria,serif;color:var(--navy);margin:0}
.cc a{color:var(--navy);cursor:pointer}
.cc .hd{background:var(--navy);color:#fff;padding:28px 32px;border-radius:var(--r) var(--r) 0 0;margin-top:20px}
.cc .hd .kicker{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#C9CED6}
.cc p.kicker[data-regulation]{font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--slate);margin:0 0 6px}
.cc .hd h1{color:#fff;font-size:28px;margin:6px 0 4px}
.cc .hd .sub{color:#DDE1E7;font-size:15px}
.cc section{padding:28px 32px;border:1px solid var(--line);border-top:0}
.cc section h2{font-size:21px;margin-bottom:10px}
.cc .lede{color:var(--slate);margin:0 0 16px;max-width:760px}
.cc table.grid{width:100%;border-collapse:collapse;font-size:14.5px}
.cc table.grid th{text-align:left;font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--slate);border-bottom:2px solid var(--navy);padding:8px 10px}
.cc table.grid td{border-bottom:1px solid var(--line);padding:10px;vertical-align:top}
.cc table.grid td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.cc .kind{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;text-transform:uppercase;letter-spacing:.03em}
.cc .kind.judged{background:var(--person-l);color:var(--person)}
.cc .kind.recomputed{background:#E6EEF6;color:#2B5A85}
.cc .kind.unstated{background:var(--cream);color:var(--slate)}
.cc .tx{margin:8px 0 4px;font-size:13px}
.cc .tx .turn{padding:3px 0;border-top:1px solid var(--line);white-space:pre-wrap}
.cc .tx code{font-size:12px;color:var(--slate)}
.cc .hd .na{color:var(--ink)}
.cc .st{font-weight:700;font-size:13px}
.cc .st.ok{color:var(--ok)}.cc .st.exc{color:var(--bad)}.cc .st.ne{color:#8A93A6}
.cc .fnd{border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-bottom:12px}
.cc .fnd .fh{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.cc .fnd .fh b{color:var(--navy)}
.cc .sev{font-size:11px;font-weight:700;padding:2px 9px;border-radius:99px;text-transform:uppercase}
.cc .sev.high{background:var(--bad-l);color:var(--bad)}
.cc .sev.medium{background:var(--gold-l);color:#8A6A2F}
.cc .sev.low{background:var(--ok-l);color:var(--ok)}
.cc .fnd table.fk{width:100%;font-size:14px}
.cc .fnd table.fk th{text-align:left;color:var(--slate);font-weight:600;width:140px;vertical-align:top;padding:4px 0}
.cc .fnd table.fk td{padding:4px 0}
.cc details{margin-top:8px;border:1px solid var(--line);border-radius:10px;padding:8px 14px}
.cc details > summary{cursor:pointer;color:var(--navy);font-weight:600;font-size:14px}
.cc .sessrow{display:flex;gap:10px;align-items:center;padding:6px 0;font-size:14px}
.cc .sessrow code{font-size:12px;color:var(--slate)}
.cc .tk{display:inline-block;width:20px;height:20px;border-radius:6px;text-align:center;line-height:20px;font-size:12px;margin-left:3px}
.cc .tk.y{background:var(--ok-l);color:var(--ok)}.cc .tk.n{background:var(--bad-l);color:var(--bad)}.cc .tk.ne{background:#EDEFF2;color:#8A93A6}
.cc .ck{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0;font-size:14px}
.cc .ck .h{display:flex;gap:8px;align-items:center;font-weight:700;color:var(--navy)}
.cc .ck .why{margin-top:4px;color:var(--ink)}
.cc .ck .ev{margin-top:4px;font-size:12px;color:var(--slate)}
.cc .ck .ev code{background:var(--cream);padding:1px 6px;border-radius:5px;margin-right:4px}
.cc .na{margin-top:16px;font-size:13px;color:var(--slate);background:var(--cream);border-radius:10px;padding:10px 14px}
.cc .ran{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.cc .ran .it{background:var(--cream);border-radius:10px;padding:10px 12px}
.cc .ran .k{font-size:12.5px;color:var(--slate)}
.cc .ran .v{font-weight:600;color:var(--navy);word-break:break-word;font-size:13.5px}
.cc .applic{font-size:13px;color:var(--slate)}
.cc table.sum tbody tr.ob td{background:var(--cream);border-top:2px solid var(--navy);padding:12px 10px}
.cc table.sum .obn{font-size:16px;color:var(--navy)}
.cc table.sum .obn .art{font-family:Georgia,Cambria,serif}
.cc table.sum .plain{font-size:13.5px;color:var(--ink);margin-top:4px;max-width:720px}
.cc table.sum tr.test td.tn{padding-left:22px}
.cc table.sum .tnh{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cc table.sum .tnh b{color:var(--navy)}
.cc table.sum td .applic{margin-top:4px}
.cc .fnd{margin:8px 0 0;padding:8px 12px;border-color:var(--bad-l);background:#FDF8F6}
.cc .fnd .fh{margin-bottom:4px}
.cc .fnd .rec{font-size:13.5px}
.cc .fnd .own{font-size:12.5px;color:var(--slate);margin-top:2px}
.cc .ck .h .tname{color:var(--navy)}
.cc .ck .h .applic{font-weight:400}
.cc .rp-s{margin-top:18px;padding-top:12px;border-top:1px solid var(--line)}
.cc .rp-s h3{font-size:17px;margin:0 0 8px}
.cc .pf-b .ev{font-size:12px;color:var(--slate);margin:4px 0;word-break:break-all}
.cc .pf-b .ev code{background:var(--cream);padding:1px 6px;border-radius:5px;margin-right:4px;font-size:11.5px}
.cc .obd{margin:10px 0 16px}
@media (max-width:760px){.cc .ran{grid-template-columns:1fr}}
` +
  levelCss("cc") +
  legendCss("cc") +
  frontCss(".cc") +
  // The page layout (one left edge, bordered cards 16px apart, the header
  // on white like the Outcomes report's): last, so it wins over the rules
  // above. The page colour is the shell's (emitter-shell.html).
  `
.cc{background:transparent;padding:0;margin:0 auto;display:flow-root}
.cc .l0-card{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:40px var(--inset);margin:16px 0}
.cc .l0-card .hd{background:transparent;color:var(--ink);padding:0;margin:0 0 24px;border-radius:0}
.cc .l0-card .hd h1{color:var(--navy);font-size:30px;margin:0}
.cc .l0-card .hd .sub{color:var(--slate);margin-top:8px}
.cc > section{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:32px var(--inset);margin:0 0 16px}
.cc > section.findings{padding:32px calc(var(--inset) - 3px)}
@media (min-width:821px){.cc table.grid th{white-space:nowrap}}
.cc table.sum tbody tr.tier td{padding:28px 10px 8px;border-bottom:2px solid var(--navy)}
.cc table.sum tr.tier b{display:block;font-family:Georgia,Cambria,serif;font-size:19px;color:var(--navy)}
.cc table.sum tr.tier small{display:block;color:var(--slate);font-size:12.5px;margin-top:3px}
.cc .rtier{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;margin-left:6px;background:var(--cream);color:var(--slate)}
.cc .rtier[data-requirement-tier="must_have"]{background:#E6EEF6;color:#2B5A85}
.cc .rtier[data-requirement-tier="informational"]{background:#FBEFD9;color:#8A5A00}
.cc .tier-note{margin:0 0 12px;font-size:13px;color:var(--slate)}
`;
