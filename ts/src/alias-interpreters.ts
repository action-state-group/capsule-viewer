// SPDX-License-Identifier: BSD-3-Clause
// The extension interpreters of the two deprecated aliases of
// contract-report/v1, defined here so the verification page reads as it did
// with agent-action-capsule 0.7.0. AAC 0.8.0 removed `outcome-report-card`
// and `compliance-card` from its `ExtensionInterpreterId` and reports an
// `outcome-report/v1` or `eu-ai-act-compliance/v1` block as uninterpreted
// (its spec/REGISTRY.md section 14). Removed with the alias path in the
// follow-up (agent-action-capsule#379, PR C2).
import {
  EXTENSION_SHOWN,
  type ExtensionInterpreterId,
  type ExtensionRow,
} from "@action-state-group/agent-action-capsule";
import { readCompliancePresentation } from "./compliance-presentation.js";
import { readOutcomeReportPresentation } from "./outcome-report-presentation.js";

/** The interpreters of the two deprecated cards, as AAC 0.7.0 named them. */
export type AliasInterpreterId = "outcome-report-card" | "compliance-card";

/** An interpreter a page of this viewer can run. */
export type PageInterpreterId = ExtensionInterpreterId | AliasInterpreterId;

/** AAC's extension row, with the alias interpreters as possible values. */
export interface PageExtensionRow extends Omit<ExtensionRow, "interpreter"> {
  readonly interpreter?: PageInterpreterId;
}

// AAC 0.7.0 extension-interpreters.ts, the two removed entries.
const ALIAS_INTERPRETERS: Readonly<
  Record<
    string,
    { readonly id: AliasInterpreterId; accepts(bundle: unknown): boolean }
  >
> = Object.freeze({
  "outcome-report/v1": {
    id: "outcome-report-card",
    accepts: (bundle) => readOutcomeReportPresentation(bundle) !== undefined,
  },
  "eu-ai-act-compliance/v1": {
    id: "compliance-card",
    accepts: (bundle) => readCompliancePresentation(bundle) !== undefined,
  },
});

/**
 * AAC's extension rows, with a deprecated card's block shown as AAC 0.7.0
 * showed it: interpreted by its card when that card's reader accepts the
 * block and the card ran on this page (`applied`). Every other row is
 * returned unchanged.
 */
export function aliasExtensionRows(
  bundle: unknown,
  rows: readonly ExtensionRow[],
  applied: ReadonlySet<PageInterpreterId>,
): readonly PageExtensionRow[] {
  return rows.map((row): PageExtensionRow => {
    if (
      row.interpreter !== undefined ||
      !Object.hasOwn(ALIAS_INTERPRETERS, row.id)
    )
      return row;
    const interpreter = ALIAS_INTERPRETERS[row.id]!;
    if (!interpreter.accepts(bundle) || !applied.has(interpreter.id))
      return row;
    return {
      id: row.id,
      integrity: row.integrity,
      interpreter: interpreter.id,
      semantics:
        EXTENSION_SHOWN[row.integrity === "covered" ? "covered" : "notCovered"],
    };
  });
}

const isAlias = (id: PageInterpreterId): id is AliasInterpreterId =>
  id === "outcome-report-card" || id === "compliance-card";

/** The interpreters in `applied` that AAC itself names. */
export function aacInterpreters(
  applied: ReadonlySet<PageInterpreterId>,
): ReadonlySet<ExtensionInterpreterId> {
  return new Set(
    [...applied].filter((id): id is ExtensionInterpreterId => !isAlias(id)),
  );
}
