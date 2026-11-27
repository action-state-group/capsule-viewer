// SPDX-License-Identifier: Apache-2.0

package historyview

// Styles is the view's stylesheet: one column under 900px, two above,
// print, and a dark palette with its own background on a dark screen. It is
// the TypeScript historyViewStyles, byte for byte.
const Styles = `.cv-history{--cvh-ink:#1f2733;--cvh-slate:#6b7482;--cvh-line:#e3ded3;--cvh-cream:#f6f2ea;--cvh-navy:#232f42;--cvh-ok:#2e7d5b;--cvh-bad:#b5462f;font:16px/1.45 system-ui,sans-serif;color:var(--cvh-ink);max-width:1120px;margin:0 auto;padding:16px;display:grid;gap:16px}
.cv-history h1{font-size:22px;margin:0}.cv-history h2{font-size:15px;margin:0 0 8px;color:var(--cvh-navy)}
.cvh-header p{margin:4px 0}.cvh-badge{display:inline-block;border:1px solid var(--cvh-line);border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700;letter-spacing:.02em}
.cvh-badge[data-audience=private]{background:#fbefd9;border-color:#e8a33d}.cvh-built,.cvh-note{color:var(--cvh-slate);font-size:13px}
.cvh-hero-line{font-size:20px;font-weight:700;margin:0}.cvh-hero-note{margin:6px 0 0;color:var(--cvh-slate)}
.cvh-chips{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}.cvh-chip{background:var(--cvh-cream);border-radius:999px;padding:3px 10px;font-size:13px}
.cvh-rows{list-style:none;padding:0;margin:0}.cvh-row{border:1px solid var(--cvh-line);border-radius:10px;padding:10px 12px;margin:0 0 10px}
.cvh-row p{margin:0 0 4px}.cvh-row-title{font-weight:700}.cvh-row-detail{color:var(--cvh-slate);font-size:14px}
.cvh-proof summary{cursor:pointer;font-size:13px;color:var(--cvh-slate)}.cvh-proof code{font-size:12px;word-break:break-all}
.cvh-stamps{list-style:none;padding:0;margin:8px 0 0;display:flex;flex-wrap:wrap;gap:8px}
.cvh-stamp,.cvh-seal-slot{border:2px solid var(--cvh-navy);border-radius:999px;padding:2px 10px;font-size:12px;color:var(--cvh-navy)}
.cvh-stamp[data-filled=no],.cvh-seal-slot[data-filled=no]{border-style:dotted;border-color:#9aa1ab;color:var(--cvh-slate)}
.cvh-stamp[data-state=failed]{border-color:var(--cvh-bad);color:var(--cvh-bad)}
.cvh-stamp-name{font-weight:800}.cvh-stamp-line{margin-left:6px}
.cvh-callout,.cvh-shares,.cvh-seal,.cvh-periods{border:1px solid var(--cvh-line);border-radius:10px;padding:12px}
.cvh-callout{background:var(--cvh-cream)}.cvh-callout p,.cvh-seal p{margin:0 0 6px}.cvh-shares ul,.cvh-periods ul{margin:0;padding-left:18px}
.cvh-seal-title{font-weight:700}.cvh-checked summary{cursor:pointer;font-weight:700;color:var(--cvh-navy)}
.cvh-check[data-status=fail]{color:var(--cvh-bad)}.cvh-check[data-status=pass]{color:var(--cvh-ok)}
.cvh-main,.cvh-side{display:grid;gap:16px;align-content:start}.cvh-refused{border:1px solid var(--cvh-bad);color:var(--cvh-bad);padding:8px 12px;border-radius:8px}
.cvh-card{--cvh-ink:#1b1f27;--cvh-slate:#4d5564;--cvh-line:#d3d7de;--cvh-cream:#f4f5f7;--cvh-navy:#2445a8;--cvh-ok:#17603a;--cvh-bad:#a31d1d}
.cvh-card .cvh-header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between}.cvh-tags{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0}
.cvh-tag{border-radius:999px;padding:2px 10px;font-size:13px;background:#eceef2;color:#3d4452}.cvh-tag[data-audience=private]{background:#fcf1dc;color:#6f4700}
.cvh-button{display:inline-block;border-radius:8px;padding:6px 12px;font-weight:600;text-decoration:none;background:#e7ecfb;color:#1f3c94}
.cvh-card .cvh-hero,.cvh-panel,.cvh-card .cvh-row{background:#fff;border:1px solid var(--cvh-line);border-radius:16px;padding:14px 16px}
.cvh-card .cvh-hero-line{font-size:24px;line-height:1.25}.cvh-card .cvh-row{border-radius:12px}.cvh-card .cvh-row[data-deal-state=not_as_agreed]{border-color:#d97a1e;border-width:2px}
.cvh-row-head{display:flex;gap:12px;align-items:flex-start}.cvh-seal-art{flex:none}.cvh-row-item{font-weight:600}.cvh-row-line{font-size:17px}
.cvh-card .cvh-stamp{border-radius:8px;border:1px dashed var(--cvh-line);padding:5px 10px;font-size:13px;color:var(--cvh-slate)}
.cvh-card .cvh-stamp[data-filled=yes]{border:1px solid var(--cvh-ok);background:#e6f3eb;color:var(--cvh-ok)}.cvh-card .cvh-stamp[data-state=failed]{border:1px solid var(--cvh-bad);background:#fbe9e9;color:var(--cvh-bad)}
.cvh-card .cvh-stamp-name{letter-spacing:.06em;display:block}.cvh-card .cvh-stamp-line{margin:0}
.cvh-panel p{margin:0 0 8px}.cvh-panel ul{margin:0;padding-left:18px}.cvh-proof-list{list-style:none;padding:0!important;display:grid;gap:8px}
.cvh-proof-row{display:grid;grid-template-columns:20px minmax(0,1fr);gap:8px}.cvh-proof-row span span{display:block}.cvh-mark{font-weight:700;text-align:center}
.cvh-mark[data-status=pass]{color:var(--cvh-ok)}.cvh-mark[data-status=fail]{color:var(--cvh-bad)}.cvh-code{display:block;font-size:12px;color:var(--cvh-slate)}
.cvh-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cvh-check{background:var(--cvh-cream);border-radius:8px;padding:10px 12px;margin-top:12px}.cvh-check-title{font-weight:700}
.cvh-command{margin:0 0 8px;white-space:pre-wrap;overflow-wrap:anywhere;font:13px ui-monospace,Menlo,monospace}
.cvh-wide{display:grid;gap:12px}.cvh-technical summary{cursor:pointer;font-weight:700;color:var(--cvh-navy)}.cvh-technical dd{margin:0 0 8px;overflow-wrap:anywhere}.cvh-id{display:block}
.cvh-footer{font-size:13px;color:var(--cvh-slate)}.cvh-footer p{margin:0 0 4px}.cvh-link{color:var(--cvh-navy);font-weight:600}
@media screen and (prefers-color-scheme:dark){.cv-history{--cvh-ink:#e8eaee;--cvh-slate:#a3a9b3;--cvh-line:#33373e;--cvh-cream:#22262d;--cvh-navy:#c3d0e8;--cvh-ok:#5fcf90;--cvh-bad:#ff8f84;background:#16181c;color-scheme:dark}.cvh-badge[data-audience=private]{background:#3a2f1a;border-color:#e6b85c}.cvh-card .cvh-hero,.cvh-panel,.cvh-card .cvh-row{background:#1d2026}.cvh-tag,.cvh-button{background:#2a2f38;color:#dfe5f2}.cvh-tag[data-audience=private]{background:#3a2f1a;color:#f2d8a7}.cvh-card .cvh-stamp[data-filled=yes]{background:#173325}.cvh-card .cvh-stamp[data-state=failed]{background:#3a1d1d}}
@media (min-width:900px){.cv-history{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}.cvh-header{grid-column:1/-1}.cvh-wide{grid-column:1/-1}}
@media print{.cv-history{max-width:none;grid-template-columns:1fr}.cvh-proof code{display:block}}
`
