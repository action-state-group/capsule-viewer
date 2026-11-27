// SPDX-License-Identifier: Apache-2.0
/**
 * The frozen receipt golden's stale-report cases (u526 step 1; capsule-viewer#496):
 * a copy edited after signing, handed capsulectl's report on the original
 * bytes. The Python twin refuses to bind that report before any module runs
 * (verifier_report.py, the golden's `refused`). On a page, the deal copies'
 * report binding (verifier-report.ts, boundToBundle) refuses it too, while it
 * binds the same report to the copy it was made for; a composition and a
 * provider's receipt are read without capsulectl's report, so there the
 * page's own check of the edited record is what stops it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildVerifiedBundleContext } from "@action-state-group/agent-action-capsule";
import { verifierReportReading } from "../src/verifier-report.js";

type Obj = Record<string, unknown>;
const RECEIPTS = resolve(process.cwd(), "..", "tests", "testdata", "receipt");
const golden = JSON.parse(
  gunzipSync(readFileSync(resolve(RECEIPTS, "oracle-golden.json.gz"))).toString(
    "utf8",
  ),
) as { cases: Obj[] };
const refused = golden.cases.filter((c) => typeof c["refused"] === "string");
const original = (name: string): Obj =>
  JSON.parse(
    readFileSync(resolve(RECEIPTS, `${name}.bundle.json`), "utf8"),
  ) as Obj;
// The single x-deal-v0 copies: the page reads capsulectl's report only for these.
const DEAL_COPIES = ["keep", "seller-keep"];

describe("a report on the original bytes, handed with an edited copy (the golden's stale-report cases)", () => {
  it("covers the four kinds' copies", () => {
    expect(refused.map((c) => c["name"])).toEqual([
      "keep+stale-report",
      "seller-keep+stale-report",
      "bilateral-keep+stale-report",
      "mesh-provider-selected+stale-report",
    ]);
  });

  for (const c of refused) {
    const name = String(c["name"]);
    const base = name.replace(/\+stale-report$/, "");
    it(`${name}: the page binds no reading, as the Python twin refused`, async () => {
      expect(String(c["refused"])).toMatch(/^the report is for bundle /);
      const edited = await buildVerifiedBundleContext(c["bundle"] as Obj);
      const ctx = await buildVerifiedBundleContext(original(base));
      expect(await verifierReportReading(edited, c["verify"])).toBeNull();
      // The same report reads on the bytes it was made for, so the refusal is the edit's.
      if (DEAL_COPIES.includes(base))
        expect(await verifierReportReading(ctx, c["verify"])).not.toBeNull();
      // The page's own check of the edited record fails where the original's passes.
      const id = ((c["bundle"] as Obj)["records"] as Obj[])[0]![
        "capsule_id"
      ] as string;
      const own = edited.verification.capsuleResults[id] as {
        ok: boolean;
        findings: readonly { code: string }[];
      };
      expect(own.ok).toBe(false);
      expect(own.findings.map((f) => f.code)).toContain("capsule_id_mismatch");
      expect((ctx.verification.capsuleResults[id] as { ok: boolean }).ok).toBe(
        true,
      );
    });
  }
});
