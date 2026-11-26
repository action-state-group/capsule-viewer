// A command in the can't-check lines (capsule-viewer#454): the words mark it
// with backticks, and the shipped modules draw it as inline code in the same
// line, words unchanged, never the backticks themselves (Sherlock2's choice).
// "<file>" stays literal text, never markup.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadScript, RECEIPT_DIR } from "./receiptScripts.js";

const COMMAND = "capsulectl deal verify --bundle <file>";
const CASES = [
  ["unilateral", "downgraded", "capsulectl deal verify --bundle <file> reports this copy as INVALID (sealed_report_not_named)."],
  ["seller", "downgraded", "capsulectl deal verify --bundle <file> reports this copy as INVALID (sealed_report_not_named)."],
  ["bilateral", "downgraded", "capsulectl deal verify --bundle <file> reports this copy as INVALID (sealed_report_not_named)."],
  ["deal", "report_rule", "This page can't check this receipt, so it shows nothing from it and no verdict. To check it, run capsulectl deal verify --bundle <file> on the receipt file. It needs the capsulectl-deal plugin."],
];

function drawCannotCheck(kind, reason) {
  const lib = loadScript(kind);
  const root = lib.document.createElement("div");
  lib.document.body.appendChild(root);
  lib.api.createModule(kind).render({ cannot_check: true, reason }, { L0: root, L1: root, L2: root, depth: "L2" });
  return root.querySelector(`[data-cannot-check-reason="${reason}"]`);
}

describe("a command in the can't-check lines is drawn as code (#454)", () => {
  for (const [kind, reason, line] of CASES) {
    it(`${kind}, ${reason}: one code element holds the command, and no backtick is drawn`, () => {
      const block = drawCannotCheck(kind, reason);
      const p = [...block.querySelectorAll("p"), ...(block.tagName === "P" ? [block] : [])].find((n) => n.querySelector("code"));
      expect(p.textContent).toBe(line);
      const codes = [...block.querySelectorAll("code")];
      expect(codes.map((c) => c.textContent)).toEqual([COMMAND]);
      expect(codes[0].getAttribute("class")).toBe("cv-mono");
      expect(block.textContent).not.toContain("`");
      // "<file>" is text, not an element (Sherlock2's how-note).
      expect(block.textContent).toContain("--bundle <file>");
      expect(block.querySelector("file")).toBeNull();
      expect(codes[0].innerHTML).toBe("capsulectl deal verify --bundle &lt;file&gt;");
    });
  }

  it("only the two lines that draw a command as code carry backticks, each in pairs", () => {
    const words = JSON.parse(readFileSync(join(RECEIPT_DIR, "wording-en.json"), "utf8"));
    const strings = [];
    (function walk(v, key) {
      if (typeof v === "string") strings.push([key, v]);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    })(words, "");
    const backticked = strings.filter(([, s]) => s.includes("`"));
    expect(backticked.map(([k]) => k).sort()).toEqual(["row.cannot_check.downgraded_verdict", "row.cannot_check.report_rule_pointer"]);
    for (const [k, s] of backticked) expect((s.match(/`/g) || []).length % 2, k).toBe(0);
  });
});
