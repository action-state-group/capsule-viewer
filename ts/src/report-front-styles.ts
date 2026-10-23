// SPDX-License-Identifier: Apache-2.0
/**
 * Styles for the pieces report-front.ts draws (the mock-judge line, the
 * sealed aggregate, the footnotes, the folded provenance line, rows that
 * open, "Check this report yourself", and the card that holds
 * the L1 provenance), scoped under a grouping's frame class (`.oi` for
 * Outcomes, `.cc` for the EU AI Act). Each frame's stylesheet appends this,
 * so the CSP hashes of the frame stylesheets cover it.
 */
export function frontCss(scope: string): string {
  const s = scope;
  return `
${s} .mockline{max-width:1080px;margin:18px auto 0;padding:9px 14px;border:1px solid #F0D7A8;background:var(--gold-l);color:#8A5A0B;border-radius:10px;font-weight:600;font-size:14px}
${s} .front-card{background:#fff;max-width:1080px;margin:14px auto;border:1px solid var(--line);border-radius:var(--r);padding:16px 24px}
${s} .agg{margin:8px 0 28px;padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:#FAF8F4}
${s} .agg-line{font-size:14px;margin:0 0 12px;color:var(--ink)}
${s} .agg-buckets{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
${s} .agg-bucket{display:flex;flex-direction:column;gap:4px;border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:#fff}
${s} .agg-bucket b{font-family:Georgia,"Iowan Old Style",Cambria,serif;font-size:28px;line-height:1.1;font-variant-numeric:tabular-nums}
${s} .agg-bucket span{font-size:12.5px;color:var(--slate)}
${s} .agg .count.mismatch{font-size:12px;font-weight:600;color:var(--bad)}
${s} .agg-note{font-size:12.5px;color:var(--slate);margin:6px 0 0}
${s} .agg-bucket.met b{color:var(--ok)}
${s} .agg-bucket.not_met b{color:var(--bad)}
${s} .agg-bucket.not_evaluable b{color:#5F6672}
${s} .findings{border-left:4px solid var(--gold,#E8A33D);background:#FFFBF2;border-radius:var(--r);padding:16px 20px;margin:16px 0}
${s} .findings h2{font-size:19px;margin:4px 0 10px}
${s} .plabel{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8A5A0B}
${s} .footnotes{margin:22px 0 0;padding-top:10px;border-top:1px solid var(--line);font-size:12.5px;color:var(--slate);display:grid;gap:4px}
${s} details.prov-fold{border:0;margin:0;background:transparent}
${s} details.prov-fold > summary{padding:2px 0;font-weight:500;color:var(--ink)}
${s} details.prov-fold .prov-brief{font-size:13.5px}
${s} tr.x{cursor:pointer}
${s} tr.x:hover > td{background:#FAF8F4}
${s} tr.x-detail{display:none}
${s} tr.x:has(details.rx[open]) + tr.x-detail{display:table-row}
${s} tr.x-detail > td{padding:0 10px 12px;border-bottom:1px solid var(--line)}
${s} details.rx{display:inline;border:0;margin:0;padding:0;background:transparent}
${s} details.rx > summary{display:inline;padding:0;font-size:inherit;font-weight:inherit;color:inherit}
${s} table tr.x td details.rx > summary > *{display:inline}
${s} details.rx > summary:focus-visible{outline:2px solid var(--navy);outline-offset:2px;border-radius:3px}
${s} .rule-na{font-size:12.5px;color:var(--slate);margin:4px 0 8px}
${s} .check h2{font-size:19px;margin:0 0 10px}
${s} .anchors{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
${s} .anchor{background:var(--cream);border-radius:8px;padding:8px 10px;font-size:12px;min-width:0}
${s} .anchor .k{display:block;color:var(--slate);margin-bottom:2px}
${s} .anchor code{font-size:11px;word-break:break-all}
${s} .check .steps{margin:12px 0 0;padding-left:20px;font-size:14px;line-height:1.6}
@media (max-width:640px){${s} .front-card{padding:14px 16px}${s} .agg-buckets{grid-template-columns:repeat(3,minmax(0,1fr))}${s} .agg-bucket b{font-size:22px}}
`;
}
