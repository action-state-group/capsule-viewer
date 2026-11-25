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
const STANDALONE = "x-deal-report/v0";

/**
 * What capsulectl reported of this bundle's x-deal-v1 standalone report:
 *  - `pass`: the x-deal-v1 entry passed, with the report standalone, and the
 *    bundle's verdict is VALID, or INCOMPLETE only as a producer selection;
 *  - `fail` with `report`: the entry did not pass (Sherlock2's first line);
 *  - `fail` with `verdict`: the entry passed but capsulectl's verdict for the
 *    bundle is not VALID, for a reason that is not the report; the page says
 *    the verdict, never that the report failed (Sherlock2's second line);
 *  - null: the bundle is not an x-deal-v1 copy with a standalone report, or
 *    the report is not this bundle's, or names no standalone x-deal-v1 entry.
 * A report is never read for any other bundle (Codex, #417).
 */
export type VerifierReading =
  | {
      readonly kind: "pass";
      /** capsulectl's status for the copy's counterparty half, when it reported one. */
      readonly counterpartyHalf?: string;
    }
  | { readonly kind: "fail"; readonly why: "report" }
  | {
      readonly kind: "fail";
      readonly why: "verdict";
      readonly verdict: string;
    };

export function verifierReportReading(
  context: VerifiedBundleContext,
  given: unknown,
): VerifierReading | null {
  // The report as capsulectl prints it (JSON text) or already parsed.
  let report = given;
  if (typeof given === "string")
    try {
      report = JSON.parse(given);
    } catch {
      return null;
    }
  const extensionsOf = obj(obj(context.bundle)["extensions"]);
  if (!(DEAL_V1 in extensionsOf) || !(STANDALONE in extensionsOf)) return null;
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
  if (entry["status"] !== "pass") return { kind: "fail", why: "report" };
  const halfStatus = obj(entry["counterparty_half"])["status"];
  const pass: VerifierReading =
    typeof halfStatus === "string"
      ? { kind: "pass", counterpartyHalf: halfStatus }
      : { kind: "pass" };
  const verdict = r["verdict"];
  if (verdict === "VALID") return pass;
  // A producer selection: capsulectl calls it INCOMPLETE only because the
  // interval coverage is withheld as selection_not_checkable, as the Python
  // twin reads it (verifier_report.py) and the page's own verdict allows it.
  // Its report passed, so the receipt draws, with the page's incomplete
  // outcome; it is never refused for that.
  const coverage = obj(r["interval_coverage"]);
  const findings = coverage["findings"];
  if (
    verdict === "INCOMPLETE" &&
    coverage["status"] === "withheld" &&
    Array.isArray(findings) &&
    findings.length === 1 &&
    findings[0] === "selection_not_checkable" &&
    [
      "graph_closure",
      "per_record_membership",
      "checkpoint",
      "producer_signatures",
    ].every((claim) => obj(r[claim])["status"] === "pass")
  )
    return pass;
  return {
    kind: "fail",
    why: "verdict",
    verdict:
      typeof verdict === "string" && verdict !== "" ? verdict : "not valid",
  };
}

/**
 * The context the receipt module reads, with capsulectl's passing check of
 * the x-deal-v1 standalone report: an x-deal-v1 entry naming the report
 * standalone and its status, as capsulectl's own report entry does, beside
 * the page verifier's own entries, for the receipt module only: the page's
 * own verification (its banner, its extension rows) reads the context
 * without it (Codex, #417). Only a "pass" reading is ever added.
 */
export function withVerifierReport(
  context: VerifiedBundleContext,
  reading: VerifierReading & { kind: "pass" } = { kind: "pass" },
): VerifiedBundleContext {
  const extensions = [
    ...context.verification.extensions,
    {
      kind: DEAL_V1,
      status: "pass",
      report: "standalone",
      integrityCovered: true,
      // The other party's half, as capsulectl reported it (x-deal-v1-counterparty-half).
      ...(reading.counterpartyHalf === undefined
        ? {}
        : { counterparty_half: { status: reading.counterpartyHalf } }),
    },
  ] as unknown as VerifiedBundleContext["verification"]["extensions"];
  return {
    ...context,
    verification: { ...context.verification, extensions },
  };
}
