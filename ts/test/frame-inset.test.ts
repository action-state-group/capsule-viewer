// SPDX-License-Identifier: BSD-3-Clause
// One left edge (#75): no older padding rule in the two report frames may
// out-rank the shared inset, on any width.
import { describe, expect, it } from "vitest";
import { COMPLIANCE_CSS } from "../src/compliance-styles.js";
import { frontCss } from "../src/report-front-styles.js";

describe("report frames keep the shared inset", () => {
  it("EU: the proofs card takes the frame's section padding", () => {
    // `.cc section.rp` (0,2,1) out-ranked `.cc > section` (0,1,1).
    expect(COMPLIANCE_CSS).not.toMatch(/\.cc section\.rp\{[^}]*padding/);
    expect(COMPLIANCE_CSS).toContain(".cc > section{");
    expect(COMPLIANCE_CSS).toMatch(
      /\.cc > section\{[^}]*padding:32px var\(--inset\)/,
    );
  });

  it("phones: the shared front cards still pad to the inset", () => {
    for (const scope of [".oi", ".cc"]) {
      const css = frontCss(scope);
      const phone = css.slice(css.indexOf("@media (max-width:640px)"));
      expect(phone).toContain(
        `${scope} .front-card{padding:24px var(--inset)}`,
      );
      expect(phone).not.toMatch(/\.front-card\{padding:14px 16px\}/);
    }
  });
});
