// SPDX-License-Identifier: BSD-3-Clause
import {
  buildResultRoot,
  bundleVerified,
  committedDigest,
  disclosureOf,
  isResultRoot,
  JcsFloatError,
  jsonDigest,
  type ResultRoot,
  type VerifiedBundleContext,
} from "@action-state-group/agent-action-capsule";
import {
  ChartRefusal,
  checkChart,
  type ChartDataset,
  type ChartRow,
} from "./chart-spec.js";

/**
 * The sealed dataset a report's charts are checked against, read from a
 * verified bundle (docs/design/chart-spec.md section 4).
 *
 * The Result names its dataset plan and dataset by digest, `plan_ref` and
 * `dataset_ref` (agent-action-capsule spec/evidence-result-v0.md §7.3). Both
 * are documents of their own, which a bundle discloses or withholds like any
 * other: this reader takes any disclosed member, or the `statement` of a
 * disclosed evidence-book record header, whose JCS SHA-256 is the digest. A
 * row names a record header by the digest of its JCS (evidence-plan-ir-v0
 * §6.2). The bundle carries that header either as the record's disclosed
 * `agent_input`, whose digest the record commits to and the bundle verifier
 * checked, or inline in the record's `evidence_record_header` member, which
 * `capsule_id` covers. A row whose header the bundle does not disclose is
 * kept without one, and the checker refuses the chart for it.
 *
 * This reader does not run the plan again: that needs every header of the
 * population, which a bundle that withholds any of them cannot give (§6.2
 * there). It checks what the bundle can show: both digests, the dataset's
 * own `plan_ref`, and each disclosed row's `seq` and `record_type` against
 * its header.
 */

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** evidencebook's member through which a caller-sealed capsule carries its own header. */
export const RECORD_HEADER_MEMBER = "evidence_record_header";
const DATASET_VERSION = "evidence-dataset-v0";
const HEX64 = /^[0-9a-f]{64}$/u;

const invalid = (message: string): never => {
  throw new ChartRefusal("chart-dataset-invalid", message);
};

/** `{digest_alg: "SHA-256", digest}`, or undefined when the member is absent. */
function digestRef(value: unknown, what: string): string | undefined {
  if (value === undefined) return undefined;
  if (
    !isObj(value) ||
    value.digest_alg !== "SHA-256" ||
    typeof value.digest !== "string" ||
    !HEX64.test(value.digest)
  )
    return invalid(`${what} is not {digest_alg: "SHA-256", digest: <64-hex>}`);
  return value.digest as string;
}

/** The Result document the root carries: the member itself, or a book header's statement. */
function resultDocument(
  context: VerifiedBundleContext,
  result: ResultRoot,
): Obj | undefined {
  const member = disclosureOf(context, result.capsuleId, result.member);
  if (member.state !== "disclosed" || !isObj(member.payload)) return undefined;
  const document =
    result.form === "book" ? member.payload.statement : member.payload;
  return isObj(document) ? document : undefined;
}

/**
 * The JCS SHA-256 of a value, or undefined for one with no canonical form
 * (a fraction, which this JCS refuses): no plan, dataset or row can name it.
 */
async function digestOf(value: unknown): Promise<string | undefined> {
  try {
    return await jsonDigest(value);
  } catch (err) {
    if (err instanceof JcsFloatError) return undefined;
    throw err;
  }
}

/** Every disclosed document that could be a plan or a dataset, by the digest of its JCS. */
async function documentsByDigest(
  context: VerifiedBundleContext,
): Promise<Map<string, Obj>> {
  const found = new Map<string, Obj>();
  const consider = async (value: unknown): Promise<void> => {
    // Only a document that names itself a dataset or a plan is hashed.
    if (
      !isObj(value) ||
      (value.dataset_version === undefined &&
        !(isObj(value.header) && value.header.ir_version !== undefined))
    )
      return;
    const digest = await digestOf(value);
    if (digest !== undefined) found.set(digest, value);
  };
  for (const record of context.records) {
    for (const member of ["agent_input", "agent_output"] as const) {
      const disclosed = disclosureOf(context, record.capsule_id, member);
      if (disclosed.state !== "disclosed") continue;
      await consider(disclosed.payload);
      if (isObj(disclosed.payload)) await consider(disclosed.payload.statement);
    }
    const inline = (record as Obj)[RECORD_HEADER_MEMBER];
    if (isObj(inline)) await consider(inline.statement);
  }
  return found;
}

/** Every disclosed record header, by the digest a dataset row names it with. */
async function headersByDigest(
  context: VerifiedBundleContext,
): Promise<Map<string, { header: Obj; recordId: string }>> {
  const found = new Map<string, { header: Obj; recordId: string }>();
  for (const record of context.records) {
    const inline = (record as Obj)[RECORD_HEADER_MEMBER];
    if (isObj(inline)) {
      const digest = await digestOf(inline);
      if (digest !== undefined)
        found.set(digest, { header: inline, recordId: record.capsule_id });
      continue;
    }
    const digest = committedDigest(record, "agent_input");
    const disclosed = disclosureOf(context, record.capsule_id, "agent_input");
    if (
      digest !== undefined &&
      disclosed.state === "disclosed" &&
      isObj(disclosed.payload)
    )
      found.set(digest, {
        header: disclosed.payload,
        recordId: record.capsule_id,
      });
  }
  return found;
}

/**
 * The dataset a report's Result names, as the chart checker reads it; or
 * undefined when the Result names none or the bundle does not disclose its
 * plan or dataset (the checker refuses a chart then, `chart-no-dataset`).
 * Throws a {@link ChartRefusal} (`chart-dataset-invalid`) for a plan or
 * dataset that does not match its digests or shape.
 */
export async function chartDatasetOf(
  context: VerifiedBundleContext,
  result: ResultRoot,
): Promise<ChartDataset | undefined> {
  const document = resultDocument(context, result);
  if (document === undefined) return undefined;
  const planRef = digestRef(document.plan_ref, "the Result's plan_ref");
  const datasetRef = digestRef(
    document.dataset_ref,
    "the Result's dataset_ref",
  );
  if (planRef === undefined || datasetRef === undefined) return undefined;
  const documents = await documentsByDigest(context);
  const plan = documents.get(planRef);
  const dataset = documents.get(datasetRef);
  if (plan === undefined || dataset === undefined) return undefined;
  const keys = Object.keys(dataset).sort().join(",");
  if (
    keys !== "dataset_version,plan_ref,rows" ||
    dataset.dataset_version !== DATASET_VERSION ||
    !Array.isArray(dataset.rows)
  )
    invalid(`the dataset is not an ${DATASET_VERSION} document`);
  if (digestRef(dataset.plan_ref, "the dataset's plan_ref") !== planRef)
    invalid("the dataset's plan_ref is not the Result's plan_ref");
  if (!Array.isArray(plan.nodes)) invalid("the dataset plan has no nodes");
  const headers = await headersByDigest(context);
  const rows: ChartRow[] = [];
  let last = -1;
  for (const raw of dataset.rows as unknown[]) {
    if (
      !isObj(raw) ||
      Object.keys(raw).sort().join(",") !==
        "digest,digest_alg,record_type,seq" ||
      !Number.isSafeInteger(raw.seq) ||
      (raw.seq as number) <= last ||
      typeof raw.record_type !== "string" ||
      raw.digest_alg !== "SHA-256" ||
      typeof raw.digest !== "string" ||
      !HEX64.test(raw.digest)
    )
      return invalid(
        "a dataset row is not {seq, record_type, digest_alg, digest}, in seq order",
      );
    last = raw.seq as number;
    const found = headers.get(raw.digest as string);
    if (
      found !== undefined &&
      (found.header.seq !== raw.seq ||
        found.header.record_type !== raw.record_type)
    )
      invalid(
        `dataset row seq ${String(raw.seq)} names a header whose seq or record_type differs`,
      );
    rows.push({
      seq: raw.seq as number,
      recordType: raw.record_type as string,
      digest: raw.digest as string,
      ...(found === undefined
        ? {}
        : { header: found.header, recordId: found.recordId }),
    });
  }
  return { plan, rows };
}

/** One chart's build-time verdict: drawn, or refused with its reason. */
export interface ChartBuildCheck {
  readonly index: number;
  readonly refusal?: ChartRefusal;
}

/**
 * Check every chart spec against a verified bundle, as the builder does
 * before it writes any packaging. A bundle that did not verify, or whose
 * root is not an Evidence Result, has no dataset to check against.
 */
export async function checkChartsAgainst(
  context: VerifiedBundleContext,
  charts: readonly unknown[],
): Promise<ChartBuildCheck[]> {
  let dataset: ChartDataset | undefined;
  let invalid: ChartRefusal | undefined;
  const verified = bundleVerified(context.verification);
  const result =
    verified && (await isResultRoot(context))
      ? await buildResultRoot(context)
      : undefined;
  try {
    dataset =
      result === undefined ? undefined : await chartDatasetOf(context, result);
  } catch (err) {
    if (!(err instanceof ChartRefusal)) throw err;
    invalid = err;
  }
  return charts.map((spec, index) => {
    try {
      if (invalid !== undefined) throw invalid;
      checkChart(spec, dataset);
      return { index };
    } catch (err) {
      if (!(err instanceof ChartRefusal)) throw err;
      return { index, refusal: err };
    }
  });
}
