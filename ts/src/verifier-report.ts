// SPDX-License-Identifier: Apache-2.0

/**
 * capsulectl's own verify report for an x-deal-v1 copy, carried into a page
 * (capsule-viewer#405 route 1). A page cannot run the x-deal-v1 report rule
 * (`xdealv1.VerifyReportBundle`) itself, so it shows what the one Go
 * verifier, `capsulectl deal verify --bundle`, reported for this very bundle,
 * and says so: the receipt's line is `summary.standalone` ("capsulectl verify
 * reported its signature check as: pass. This page did not check the
 * signature itself."). The page decides nothing itself, and claims no check
 * it did not run.
 *
 * The report is read only for the bundle it was made for, by the rules the
 * Python twin applies (`capsule_viewer.verifier_report.context_from_capsulectl`):
 * its `spec_version` is capsulectl's result format, its `bundle_digest` is
 * this bundle's, and its record identities name exactly this bundle's
 * records. A report for another bundle, or none, gives no answer, so the
 * receipt draws the can't-check line (#407).
 */

import type { VerifiedBundleContext } from "@action-state-group/agent-action-capsule";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});

/** capsulectl's result format (`capsule-cli-result/v1`), as the Python twin reads it. */
export const VERIFIER_REPORT_VERSION = "capsule-cli-result/v1";
const DEAL_V1 = "x-deal-v1";

/**
 * What capsulectl reported of this bundle's x-deal-v1 standalone report:
 * "pass" when the bundle's verdict is VALID and the x-deal-v1 entry passed
 * with the report standalone; "fail" when the report is this bundle's and
 * says anything else; null when it is not this bundle's report or names no
 * standalone x-deal-v1 report.
 */
export function verifierReportReading(
  context: VerifiedBundleContext,
  report: unknown,
): "pass" | "fail" | null {
  const r = obj(report);
  if (r["spec_version"] !== VERIFIER_REPORT_VERSION) return null;
  const digest = context.verification.bundleDigest;
  if (typeof digest !== "string" || r["bundle_digest"] !== digest) return null;
  const identity = r["record_identity"];
  const records = Array.isArray(obj(context.bundle)["records"])
    ? (obj(context.bundle)["records"] as unknown[])
    : [];
  const ids = new Set(
    records
      .map((x) => obj(x)["capsule_id"])
      .filter((id): id is string => typeof id === "string"),
  );
  if (
    !isObj(identity) ||
    Object.keys(identity).length !== ids.size ||
    !Object.keys(identity).every((id) => ids.has(id))
  )
    return null;
  const extensions = Array.isArray(r["extensions"]) ? r["extensions"] : [];
  const entry = extensions
    .map(obj)
    .find((e) => e["kind"] === DEAL_V1 && e["report"] === "standalone");
  if (entry === undefined) return null;
  return entry["status"] === "pass" && r["verdict"] === "VALID"
    ? "pass"
    : "fail";
}

/**
 * The context the receipt module reads, with capsulectl's passing check of
 * the x-deal-v1 standalone report: an x-deal-v1 entry naming the report
 * standalone and its status, as capsulectl's own report entry does, beside
 * the page verifier's own entries. The bundle and the page's checks are
 * unchanged. Only a "pass" reading is ever added.
 */
export function withVerifierReport(
  context: VerifiedBundleContext,
): VerifiedBundleContext {
  const extensions = [
    ...context.verification.extensions,
    {
      kind: DEAL_V1,
      status: "pass",
      report: "standalone",
      integrityCovered: true,
    },
  ] as unknown as VerifiedBundleContext["verification"]["extensions"];
  return {
    ...context,
    verification: { ...context.verification, extensions },
  };
}
