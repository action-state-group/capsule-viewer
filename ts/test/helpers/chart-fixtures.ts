// SPDX-License-Identifier: BSD-3-Clause
// The chart-spec vectors (vectors/chart-spec/) and the book the golden
// bundle carries, from literal objects: a pure function of this file.
import { jsonDigest } from "@action-state-group/agent-action-capsule";

type Obj = Record<string, unknown>;

export const BOOK_ID = "example-book";
export const CONTRACT_REF = "ec:example-org-outcome-eval:2026-09-22@1";
// A daily check's run record. Not "evidence_result": a report bundle carries
// exactly one Result (agent-action-capsule's Result reader, the 2026-09-28
// one-headline-document rule), so a monthly Result's bundle cannot disclose
// daily Results as Result records.
export const RUN_TYPE = "daily_run";
export const CASE_TYPE = "case_record";
export const WINDOW = { from: "2026-09-01", to: "2026-09-30" } as const;
/** The two days in WINDOW with no daily Result: "not run". */
export const NOT_RUN_DAYS = ["2026-09-10", "2026-09-20"] as const;
/** A run day with no case: it was run and counts 0. */
export const ZERO_DAY = "2026-09-15";

const day = (d: number): string => `2026-09-${String(d).padStart(2, "0")}`;

/**
 * The book's record headers (Evidence Layer Record Model, with the book's
 * `book_id` and `seq`), in seq order: a daily run record on each day of
 * September 2026 but NOT_RUN_DAYS, dated by `event_time_claim` inside the
 * day it checks, and cases on every run day but ZERO_DAY, one or two a day.
 * The first case sits on the window's first instant and the last on its
 * last second; one case is written at +05:00 across midnight UTC. With
 * `extra`, more headers follow (each takes the next seq).
 */
export function bookHeaders(extra: readonly Obj[] = []): Obj[] {
  const out: Obj[] = [];
  const push = (h: Obj): void => {
    out.push({
      v: 1,
      book_id: BOOK_ID,
      seq: out.length + 1,
      epistemic_type: "producer_claim",
      committed_at: `2026-10-01T00:00:${String(out.length % 60).padStart(2, "0")}Z`,
      ...h,
    });
  };
  for (let d = 1; d <= 30; d++) {
    const date = day(d);
    if (!(NOT_RUN_DAYS as readonly string[]).includes(date))
      push({
        record_type: RUN_TYPE,
        event_time_claim: `${date}T12:00:00Z`,
        statement: {
          generated_at: `${date}T23:30:00Z`,
          aggregate: { coverage: { evaluations: 2 + (d % 3) } },
        },
      });
    if ((NOT_RUN_DAYS as readonly string[]).includes(date) || date === ZERO_DAY)
      continue;
    const cases = d % 3 === 0 ? 2 : 1;
    for (let k = 0; k < cases; k++) {
      const time =
        d === 1 && k === 0
          ? `${date}T00:00:00Z`
          : d === 30 && k === cases - 1
            ? `${date}T23:59:59Z`
            : d === 7
              ? `${day(8)}T01:30:00+05:00`
              : `${date}T${String(9 + k).padStart(2, "0")}:15:00Z`;
      push({
        record_type: CASE_TYPE,
        event_time_claim: time,
        statement: {
          task_id: `task-${d}-${k}`,
          outcome: (d + k) % 4 === 0 ? "fail" : "pass",
          score: (d * 7 + k * 3) % 10,
          decided_at: `${date}T18:00:00Z`,
          local_time: `${date}T18:00:00`,
        },
      });
    }
  }
  for (const h of extra) push(h);
  return out;
}

export interface WindowParams {
  readonly field: string;
  readonly from: string;
  readonly to: string;
}

/** A dataset plan: one population node, then the given window nodes, then the given filters. */
export function datasetPlan(
  throughSeq: number,
  windows: readonly WindowParams[] = [{ field: "event_time_claim", ...WINDOW }],
  filters: readonly Obj[][] = [],
  recordTypes: readonly string[] = [RUN_TYPE, CASE_TYPE],
): Obj {
  const node = (
    id: string,
    operator: string,
    params: Obj,
    after?: string,
  ): Obj => ({
    id,
    family: "traditional",
    operator,
    inputs: after === undefined ? [] : [{ by: "node", node_id: after }],
    classification: "CLOUD_SAFE",
    tier: "recomputed",
    contract_ref: CONTRACT_REF,
    params,
  });
  const nodes: Obj[] = [
    node("population", "traditional.population", {
      book_id: BOOK_ID,
      through_seq: throughSeq,
      record_types: [...recordTypes],
    }),
  ];
  windows.forEach((w, i) =>
    nodes.push(
      node(
        `window-${i + 1}`,
        "traditional.window",
        { ...w },
        nodes.at(-1)!.id as string,
      ),
    ),
  );
  filters.forEach((where, i) =>
    nodes.push(
      node(
        `filter-${i + 1}`,
        "traditional.filter",
        { where },
        nodes.at(-1)!.id as string,
      ),
    ),
  );
  return {
    header: {
      contract_ref: CONTRACT_REF,
      ir_version: "evidence-plan-ir-v0",
      planner_id: "local:example-planner",
      created_at: "2026-10-01T00:00:00Z",
      replay_seed: "0",
    },
    nodes,
  };
}

const utcDay = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
};

/** The headers a plan selects (§5.1), for fixtures whose fields every record carries. */
export function selectRows(plan: Obj, headers: readonly Obj[]): Obj[] {
  const nodes = plan.nodes as Obj[];
  const pop = nodes[0]!.params as Obj;
  let rows = headers.filter(
    (h) =>
      h.book_id === pop.book_id &&
      (h.seq as number) <= (pop.through_seq as number) &&
      (pop.record_types as string[]).includes(h.record_type as string),
  );
  for (const n of nodes.slice(1)) {
    const p = n.params as Obj;
    if (n.operator === "traditional.window")
      rows = rows.filter((h) => {
        const d = utcDay(h[p.field as string]);
        return (
          d !== undefined && d >= (p.from as string) && d <= (p.to as string)
        );
      });
  }
  return rows;
}

/** The dataset document (§6.2) and the checker's rows for a plan over headers. */
export async function datasetOf(
  plan: Obj,
  headers: readonly Obj[],
): Promise<{ dataset: Obj; rows: Obj[] }> {
  const selected = selectRows(plan, headers);
  const rows: Obj[] = [];
  for (const h of selected)
    rows.push({
      seq: h.seq,
      record_type: h.record_type,
      digest_alg: "SHA-256",
      digest: await jsonDigest(h),
    });
  return {
    dataset: {
      dataset_version: "evidence-dataset-v0",
      plan_ref: { digest_alg: "SHA-256", digest: await jsonDigest(plan) },
      rows,
    },
    rows: rows.map((row, i) => ({ ...row, header: selected[i] })),
  };
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

export const SCHEMA = "https://vega.github.io/schema/vega-lite/v5.json";

export const dateTime = (d: string): Obj => {
  const [year, month, date] = d.split("-").map(Number);
  return { year, month, date, utc: true };
};

export const windowFilter = (
  from: string = WINDOW.from,
  to: string = WINDOW.to,
  field = "event_time_claim",
): Obj => ({
  filter: {
    field,
    range: [dateTime(from), dateTime(to)],
    timeUnit: "utcyearmonthdate",
  },
});

export const isType = (type: string): Obj => ({
  filter: { field: "record_type", equal: type },
});

export const RUNS = {
  filter: { field: "record_type", equal: RUN_TYPE },
  field: "event_time_claim",
};

export interface SpecParts {
  readonly mark: unknown;
  readonly transform?: readonly Obj[];
  readonly encoding: Obj;
  readonly capsule: Obj;
}

export const spec = (parts: SpecParts): Obj => ({
  $schema: SCHEMA,
  data: { name: "dataset" },
  mark: parts.mark,
  ...(parts.transform === undefined ? {} : { transform: parts.transform }),
  encoding: parts.encoding,
  usermeta: { capsule: parts.capsule },
});
