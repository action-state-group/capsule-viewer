// SPDX-License-Identifier: BSD-3-Clause
import { sha256Hex } from "@action-state-group/agent-action-capsule";

/**
 * The compiled Evidence Contract as a builder setting
 * (spec/presentation-builder-v0.md, `contract`): its exact text and its
 * digest, checked the way the wording pack is. The contract-report module
 * reads one thing from it, each requirement's `tier`
 * (spec/contract-report-module-v1.md section 2), by the claim's
 * (`contract_ref`, `requirement_ref`). The Go twin is
 * go/emitter/presentation.go `CheckContract`; both refuse the same inputs.
 */

/** A compiled contract as distributed: its exact text and its digest. */
export interface ContractInput {
  /** The contract's exact UTF-8 text. It is hashed as it is, never re-serialized. */
  readonly text: string;
  /** Lowercase hex SHA-256 of the contract's UTF-8 bytes (`contract_sha256`). */
  readonly sha256: string;
}

/**
 * A requirement's tier, as the contract states it (agent-action-capsule
 * spec/interop-profile-v1.md, the requirement's OPTIONAL `tier`): whether
 * it gates the overall answer or is only reported. Not a claim's `tier`
 * (`recomputed | judged`), which says how a claim was reached.
 */
export type RequirementTier = "must_have" | "informational";

/** What a row draws: the contract's tier, or `unstated` when nothing given says it. */
export type RowTier = RequirementTier | "unstated";

/**
 * A row's tier, read by the claim's `contract_ref` and the row's
 * `requirement_ref`; the contract-report module builds one per Result
 * (contract-report.ts `tierReader`).
 */
export type TierOf = (
  contractRef: string | undefined,
  requirementRef: string,
) => RowTier;

/** The tiers in the order their sections are drawn. */
export const ROW_TIERS: readonly RowTier[] = [
  "must_have",
  "informational",
  "unstated",
];

const REQUIREMENT_TIERS: readonly string[] = ["must_have", "informational"];

/** A checked contract: what the page reads and states. */
export interface CheckedContract {
  readonly id: string;
  readonly version: string;
  /** `<id>@<version>`, the `contract_ref` a Result's claims cite (Result v0). */
  readonly ref: string;
  readonly sha256: string;
  /** Each listed requirement's tier; undefined where the requirement states none. */
  readonly tiers: ReadonlyMap<string, RequirementTier | undefined>;
}

/** A contract whose bytes, digest or shape do not check. */
export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Check a contract against its digest (the exact bytes, hashed as given)
 * and its shape, and read it. The shape is what the page reads: a string
 * `id` and `version`, and `requirements`, a list of objects with unique
 * string `id`s and an optional `tier` of `must_have` or `informational`.
 * Every other member is the contract's own and is not read.
 */
export async function checkContractInput(
  contract: ContractInput,
): Promise<CheckedContract> {
  if (!/^[0-9a-f]{64}$/u.test(contract.sha256))
    throw new ContractError("contract sha256 is not a lowercase hex SHA-256");
  const digest = await sha256Hex(new TextEncoder().encode(contract.text));
  if (digest !== contract.sha256)
    throw new ContractError(
      "contract bytes do not hash to its contract_sha256",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(contract.text);
  } catch {
    throw new ContractError("contract is not JSON");
  }
  const bad = (why: string): never => {
    throw new ContractError(
      `contract is not a compiled Evidence Contract: ${why}`,
    );
  };
  if (!isObject(parsed)) return bad("not a JSON object");
  const { id, version, requirements } = parsed;
  if (typeof id !== "string" || id === "")
    return bad("id is not a non-empty string");
  if (typeof version !== "string" || version === "")
    return bad("version is not a non-empty string");
  if (!Array.isArray(requirements)) return bad("requirements is not a list");
  const tiers = new Map<string, RequirementTier | undefined>();
  requirements.forEach((requirement, i) => {
    if (!isObject(requirement))
      return bad(`requirement ${i + 1} is not an object`);
    const rid = requirement.id;
    if (typeof rid !== "string" || rid === "")
      return bad(`requirement ${i + 1} id is not a non-empty string`);
    if (tiers.has(rid))
      return bad(`requirement id ${JSON.stringify(rid)} is listed twice`);
    const tier = requirement.tier;
    if (
      tier !== undefined &&
      (typeof tier !== "string" || !REQUIREMENT_TIERS.includes(tier))
    )
      return bad(
        `requirement ${JSON.stringify(rid)} tier is not must_have or informational`,
      );
    tiers.set(rid, tier as RequirementTier | undefined);
  });
  return {
    id,
    version,
    ref: `${id}@${version}`,
    sha256: contract.sha256,
    tiers,
  };
}

/**
 * A row's tier: the given contract's, when the row's `contract_ref` is that
 * contract and the contract lists the requirement with a tier. Anything
 * else is `unstated`, never `must_have`.
 */
export function rowTier(
  contract: CheckedContract | undefined,
  contractRef: string,
  requirementRef: string,
): RowTier {
  if (contract === undefined || contractRef !== contract.ref) return "unstated";
  return contract.tiers.get(requirementRef) ?? "unstated";
}
