// SPDX-License-Identifier: Apache-2.0
/**
 * A timeline per backfill import (capsule-viewer#302, Terms Pack Studio PRD v5
 * section 8): for one `backfill-import/v0` record (evidencebook
 * capsulectl/BACKFILL.md, "The pass and its import record"), each row's
 * `at` (the source says) against the pass's `imported_at` (we imported it),
 * the declared gaps, a late pass, anomalies, refused rows and the checkpoints
 * that cover the pass.
 *
 * It draws what the record holds and never verifies it or fetches anything.
 * A gap is drawn and named, and never stops the page. Rows are labelled as
 * imported in both forms (rehearsal and on the record). The checkpoint list is
 * caller input (BACKFILL.md names no checkpoint record shape): `{digest, size,
 * at}` per checkpoint that covers the pass. Unknown members are refused and
 * caller text is only ever text.
 */
import PACK from "./wording/backfill-timeline.en.json" with { type: "json" };

export const BACKFILL_IMPORT = "backfill-import/v0";
export const BACKFILL_TIMELINE_WORDING = PACK;

export class BackfillTimelineRefused extends Error {
  readonly reasons: readonly string[];
  constructor(reasons: readonly string[]) {
    super(`backfill-timeline refused: ${reasons.join("; ")}`);
    this.name = "BackfillTimelineRefused";
    this.reasons = reasons;
  }
}

export type BackfillForm = "rehearsal" | "record";

interface Cursor {
  after: number | null;
  through: number | null;
}
interface Row {
  source: string;
  cursor: number;
  id: string;
  at: string;
}
interface Gap {
  source: string;
  from_cursor?: number;
  to_cursor?: number;
  reason: string;
}
interface Entry {
  source: string;
  id: string;
  reason: string;
  cursor?: number;
  passed_cursor?: number;
}
interface Checkpoint {
  digest: string;
  size: number;
  at: string;
}
interface Pass {
  import_batch: string;
  imported_at: string;
  first_pass: boolean;
  previous_pass: { import_batch: string; imported_at: string } | null;
  late: string | null;
  window: Record<string, Cursor>;
  horizons: Record<
    string,
    { oldest_cursor: number; oldest_at: string; limited: boolean }
  >;
  span: { earliest: string; latest: string } | null;
  rows_read: number | null;
  tier_a: Row[];
  retained: { action_id: string; retrospective: boolean }[];
  cannot_see: string[];
  notes: string[];
  refused: Entry[];
  anomalies: Entry[];
  gaps: Gap[];
  limits: string;
  checkpoints: Checkpoint[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const RECORD_MEMBERS = [
  "schema",
  "import_batch",
  "imported_at",
  "first_pass",
  "previous_pass",
  "late",
  "window",
  "source_time_span",
  "horizons",
  "promote_around",
  "rows_read",
  "reread_verified",
  "already_retained",
  "tier_a",
  "retained",
  "refused",
  "anomalies",
  "gaps",
  "notes",
  "scope",
  "limits",
  "cannot_see",
];

class Reader {
  readonly reasons: string[] = [];
  refuse(path: string, why: string): void {
    this.reasons.push(`${path}: ${why}`);
  }
  obj(
    v: unknown,
    path: string,
    allowed: readonly string[],
    required: readonly string[],
  ): Obj | null {
    if (!isObj(v)) {
      this.refuse(path, "is not an object");
      return null;
    }
    for (const k of Object.keys(v))
      if (!allowed.includes(k))
        this.refuse(`${path}.${k}`, "is not a member of backfill-import/v0");
    for (const k of required)
      if (!(k in v)) this.refuse(`${path}.${k}`, "is missing");
    return v;
  }
  str(v: unknown, path: string, max = 2000): string {
    if (typeof v !== "string" || v.length === 0 || v.length > max) {
      this.refuse(path, `is not a string of 1 to ${max} characters`);
      return "";
    }
    return v;
  }
  time(v: unknown, path: string): string {
    const s = this.str(v, path, 100);
    if (
      s !== "" &&
      (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/u.test(s) ||
        Number.isNaN(Date.parse(s)))
    )
      this.refuse(path, "is not an RFC 3339 time");
    return s;
  }
  nat(v: unknown, path: string): number {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) {
      this.refuse(path, "is not a count");
      return 0;
    }
    return v;
  }
  /** A Go nil slice is JSON `null`; it is an empty list. */
  list(v: unknown, path: string): unknown[] {
    if (v === null) return [];
    if (!Array.isArray(v)) {
      this.refuse(path, "is not a list");
      return [];
    }
    return v;
  }
}

function readEntries(
  r: Reader,
  raw: unknown,
  path: string,
  allowed: readonly string[],
): Entry[] {
  const out: Entry[] = [];
  r.list(raw, path).forEach((e, i) => {
    const p = `${path}[${i}]`;
    const o = r.obj(e, p, allowed, ["source", "id", "reason"]);
    if (o === null) return;
    out.push({
      source: r.str(o["source"], `${p}.source`, 200),
      id: r.str(o["id"], `${p}.id`, 400),
      reason: r.str(o["reason"], `${p}.reason`),
      ...("cursor" in o ? { cursor: r.nat(o["cursor"], `${p}.cursor`) } : {}),
      ...("passed_cursor" in o
        ? { passed_cursor: r.nat(o["passed_cursor"], `${p}.passed_cursor`) }
        : {}),
    });
  });
  return out;
}

function read(record: unknown, checkpointsRaw: unknown): Pass {
  const r = new Reader();
  const top = r.obj(record, "record", RECORD_MEMBERS, [
    "schema",
    "import_batch",
    "imported_at",
    "window",
    "tier_a",
    "gaps",
    "limits",
  ]);
  if (top === null) throw new BackfillTimelineRefused(r.reasons);
  if (top["schema"] !== BACKFILL_IMPORT)
    r.refuse("record.schema", `is not ${BACKFILL_IMPORT}`);
  // No prototype: a source named `constructor` or `__proto__` is only a name.
  const window = Object.create(null) as Record<string, Cursor>;
  if (isObj(top["window"]))
    for (const [src, c] of Object.entries(top["window"])) {
      const o = r.obj(c, `record.window.${src}`, ["after", "through"], []);
      const cur = (v: unknown, k: string): number | null =>
        v === null || v === undefined
          ? null
          : r.nat(v, `record.window.${src}.${k}`);
      if (o !== null)
        window[src] = {
          after: cur(o["after"], "after"),
          through: cur(o["through"], "through"),
        };
    }
  else r.refuse("record.window", "is not an object");
  const horizons = Object.create(null) as Pass["horizons"];
  if (top["horizons"] !== undefined && top["horizons"] !== null) {
    if (!isObj(top["horizons"]))
      r.refuse("record.horizons", "is not an object");
    else
      for (const [src, h] of Object.entries(top["horizons"])) {
        const o = r.obj(
          h,
          `record.horizons.${src}`,
          ["oldest_cursor", "oldest_at", "limited"],
          ["oldest_cursor", "oldest_at"],
        );
        if (o !== null)
          horizons[src] = {
            oldest_cursor: r.nat(
              o["oldest_cursor"],
              `record.horizons.${src}.oldest_cursor`,
            ),
            oldest_at: r.time(
              o["oldest_at"],
              `record.horizons.${src}.oldest_at`,
            ),
            limited: o["limited"] === true,
          };
      }
  }
  const tier_a: Row[] = [];
  r.list(top["tier_a"], "record.tier_a").forEach((e, i) => {
    const p = `record.tier_a[${i}]`;
    const o = r.obj(
      e,
      p,
      ["source", "cursor", "id", "at", "digest"],
      ["source", "cursor", "id", "at"],
    );
    if (o === null) return;
    tier_a.push({
      source: r.str(o["source"], `${p}.source`, 200),
      cursor: r.nat(o["cursor"], `${p}.cursor`),
      id: r.str(o["id"], `${p}.id`, 400),
      at: r.time(o["at"], `${p}.at`),
    });
  });
  const gaps: Gap[] = [];
  r.list(top["gaps"], "record.gaps").forEach((e, i) => {
    const p = `record.gaps[${i}]`;
    const o = r.obj(
      e,
      p,
      ["source", "from_cursor", "to_cursor", "reason"],
      ["source", "reason"],
    );
    if (o === null) return;
    gaps.push({
      source: r.str(o["source"], `${p}.source`, 200),
      reason: r.str(o["reason"], `${p}.reason`),
      ...("from_cursor" in o
        ? { from_cursor: r.nat(o["from_cursor"], `${p}.from_cursor`) }
        : {}),
      ...("to_cursor" in o
        ? { to_cursor: r.nat(o["to_cursor"], `${p}.to_cursor`) }
        : {}),
    });
  });
  const retained: Pass["retained"] = [];
  if (top["retained"] !== undefined && top["retained"] !== null)
    r.list(top["retained"], "record.retained").forEach((e, i) => {
      const p = `record.retained[${i}]`;
      const o = r.obj(
        e,
        p,
        [
          "capsule_id",
          "source_digest",
          "action_id",
          "pinned_by",
          "retrospective",
        ],
        ["action_id"],
      );
      if (o !== null)
        retained.push({
          action_id: r.str(o["action_id"], `${p}.action_id`, 600),
          retrospective: o["retrospective"] === true,
        });
    });
  const optList = (k: string, allowed: readonly string[]): Entry[] =>
    top[k] === undefined || top[k] === null
      ? []
      : readEntries(r, top[k], `record.${k}`, allowed);
  const refused = optList("refused", [
    "source",
    "id",
    "reason",
    "digest",
    "tier_a_digest",
  ]);
  const anomalies = optList("anomalies", [
    "source",
    "id",
    "reason",
    "cursor",
    "passed_cursor",
  ]);
  let previous: Pass["previous_pass"] = null;
  if (top["previous_pass"] !== undefined && top["previous_pass"] !== null) {
    const o = r.obj(
      top["previous_pass"],
      "record.previous_pass",
      ["import_batch", "imported_at"],
      ["import_batch", "imported_at"],
    );
    if (o !== null)
      previous = {
        import_batch: r.str(
          o["import_batch"],
          "record.previous_pass.import_batch",
          400,
        ),
        imported_at: r.time(
          o["imported_at"],
          "record.previous_pass.imported_at",
        ),
      };
  }
  let span: Pass["span"] = null;
  if (
    top["source_time_span"] !== undefined &&
    top["source_time_span"] !== null
  ) {
    const o = r.obj(
      top["source_time_span"],
      "record.source_time_span",
      ["earliest", "latest"],
      ["earliest", "latest"],
    );
    if (o !== null)
      span = {
        earliest: r.time(o["earliest"], "record.source_time_span.earliest"),
        latest: r.time(o["latest"], "record.source_time_span.latest"),
      };
  }
  const checkpoints: Checkpoint[] = [];
  if (checkpointsRaw !== undefined)
    r.list(checkpointsRaw, "checkpoints").forEach((e, i) => {
      const p = `checkpoints[${i}]`;
      const o = r.obj(e, p, ["digest", "size", "at"], ["digest", "size", "at"]);
      if (o === null) return;
      checkpoints.push({
        digest: r.str(o["digest"], `${p}.digest`, 200),
        size: r.nat(o["size"], `${p}.size`),
        at: r.time(o["at"], `${p}.at`),
      });
    });
  if ("first_pass" in top && typeof top["first_pass"] !== "boolean")
    r.refuse("record.first_pass", "is not true or false");
  const first_pass = top["first_pass"] === true;
  const strs = (k: string): string[] =>
    top[k] === undefined || top[k] === null
      ? []
      : r
          .list(top[k], `record.${k}`)
          .map((x, i) => r.str(x, `record.${k}[${i}]`));
  const cannot_see = strs("cannot_see");
  const notes = strs("notes");
  const imported_at = r.time(top["imported_at"], "record.imported_at");
  const import_batch = r.str(top["import_batch"], "record.import_batch", 400);
  const limits = r.str(top["limits"], "record.limits");
  const late =
    top["late"] === undefined || top["late"] === null
      ? null
      : r.str(top["late"], "record.late");
  const rows_read =
    top["rows_read"] === undefined
      ? null
      : r.nat(top["rows_read"], "record.rows_read");
  if (r.reasons.length > 0) throw new BackfillTimelineRefused(r.reasons);
  return {
    import_batch,
    imported_at,
    first_pass,
    previous_pass: previous,
    late,
    window,
    horizons,
    span,
    rows_read,
    tier_a,
    retained,
    refused,
    anomalies,
    gaps,
    limits,
    cannot_see,
    notes,
    checkpoints,
  };
}

// --- writing the drawing ---------------------------------------------------

const W = PACK.entries as Readonly<Record<string, string>>;
const word = (key: string): string => {
  const w = W[key];
  if (w === undefined) throw new Error(`backfill-timeline: no word ${key}`);
  return w;
};

function esc(text: string): string {
  return text.replace(/[&<>"']/gu, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}

const cursors = (g: Gap): string =>
  g.from_cursor === undefined && g.to_cursor === undefined
    ? word("gaps.unread")
    : `${word("gaps.cursors")} ${g.from_cursor ?? word("gaps.unknown")} ${word("gaps.to")} ${g.to_cursor ?? word("gaps.unknown")}`;

function draw(p: Pass, form: BackfillForm): string {
  const sources = [
    ...new Set([
      ...Object.keys(p.window),
      ...Object.keys(p.horizons),
      ...p.tier_a.map((r) => r.source),
    ]),
  ].sort();
  const keptIds = new Set(p.retained.map((k) => k.action_id));
  const drawnIds = new Set(p.tier_a.map((r) => `${r.source}/${r.id}`));
  // A retrospective capsule is pinned by an earlier pass's row, so it need
  // not be among this pass's rows; it is still a record the pass kept.
  const keptElsewhere = p.retained.filter((k) => !drawnIds.has(k.action_id));
  const label = `<p data-imported-label><strong>${esc(word("imported_label"))}</strong> · ${esc(word(`form.${form}`))}</p>`;
  const head = `<p>${esc(word("pass.batch"))} <code>${esc(p.import_batch)}</code> · ${esc(word("pass.imported_at"))} <time data-imported-at datetime="${esc(p.imported_at)}">${esc(p.imported_at)}</time>${p.first_pass ? ` · ${esc(word("pass.first"))}` : ""}${p.previous_pass === null ? "" : ` · ${esc(word("pass.previous"))} <code>${esc(p.previous_pass.import_batch)}</code> <time datetime="${esc(p.previous_pass.imported_at)}">${esc(p.previous_pass.imported_at)}</time>`}${p.span === null ? "" : ` · ${esc(word("pass.span"))} <time>${esc(p.span.earliest)}</time> ${esc(word("gaps.to"))} <time>${esc(p.span.latest)}</time>`}${p.rows_read === null ? "" : ` · ${esc(word("pass.rows_read"))} ${p.rows_read}`}</p>`;
  const perSource = sources
    .map((src) => {
      const w = p.window[src];
      const h = p.horizons[src];
      const rows = p.tier_a
        .filter((r) => r.source === src)
        .sort((a, b) => a.cursor - b.cursor)
        .map(
          (r) =>
            `<tr data-row="${esc(r.id)}" data-imported="true"${keptIds.has(`${src}/${r.id}`) ? ' data-retained="true"' : ""}><td>${r.cursor}</td><td><code>${esc(r.id)}</code></td><td><time data-source-says datetime="${esc(r.at)}">${esc(r.at)}</time></td><td><time data-imported-at datetime="${esc(p.imported_at)}">${esc(p.imported_at)}</time></td><td>${keptIds.has(`${src}/${r.id}`) ? esc(word("rows.yes")) : ""}</td></tr>`,
        )
        .join("");
      const table =
        rows === ""
          ? `<p>${esc(word("rows.none"))}</p>`
          : `<div class="cv-scroll"><table><thead><tr><th>${esc(word("rows.cursor"))}</th><th>${esc(word("rows.id"))}</th><th>${esc(word("rows.source_says"))}</th><th>${esc(word("rows.imported_at"))}</th><th>${esc(word("rows.retained"))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      return `<section data-source="${esc(src)}"><h4>${esc(src)}</h4><p>${w === undefined ? "" : `${esc(word("window.title"))}: ${esc(word("window.after"))} ${w.after ?? word("window.none")}, ${esc(word("window.through"))} ${w.through ?? word("window.none")}`}${h === undefined ? "" : `${w === undefined ? "" : " · "}${esc(word("horizon.oldest"))}: ${h.oldest_cursor} (<time>${esc(h.oldest_at)}</time>)${h.limited ? ` · ${esc(word("horizon.limited"))}` : ""}`}</p>${table}</section>`;
    })
    .join("");
  const gaps =
    p.gaps.length === 0
      ? `<p data-gaps="none">${esc(word("gaps.none"))}</p>`
      : `<ul data-gaps="declared">${p.gaps
          .map(
            (g) =>
              `<li data-gap data-source="${esc(g.source)}"><strong>${esc(word("gaps.named"))}</strong> ${esc(g.source)}: ${esc(cursors(g))}. ${esc(g.reason)}</li>`,
          )
          .join("")}</ul><p><small>${esc(word("gaps.note"))}</small></p>`;
  const late =
    p.late === null
      ? ""
      : `<section data-late><h3>${esc(word("late.title"))}</h3><p>${esc(p.late)}</p></section>`;
  const list = (items: Entry[], key: string, token: string): string =>
    items.length === 0
      ? ""
      : `<section data-${token}><h3>${esc(word(key))}</h3><ul>${items
          .map(
            (e) =>
              `<li>${esc(e.source)}/<code>${esc(e.id)}</code>${e.cursor === undefined ? "" : ` ${esc(word("rows.cursor"))} ${e.cursor}`}${e.passed_cursor === undefined ? "" : ` (${esc(word("anomalies.passed"))} ${e.passed_cursor})`}: ${esc(e.reason)}</li>`,
          )
          .join("")}</ul></section>`;
  const kept =
    keptElsewhere.length === 0
      ? ""
      : `<section data-kept-elsewhere><h3>${esc(word("kept.title"))}</h3><ul>${keptElsewhere
          .map(
            (k) =>
              `<li><code>${esc(k.action_id)}</code>${k.retrospective ? ` · ${esc(word("kept.retrospective"))}` : ""}</li>`,
          )
          .join("")}</ul></section>`;
  const words = (items: string[], key: string, token: string): string =>
    items.length === 0
      ? ""
      : `<section data-${token}><h3>${esc(word(key))}</h3><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>`;
  const cps =
    p.checkpoints.length === 0
      ? `<p data-checkpoints="none">${esc(word("checkpoints.none"))}</p>`
      : `<ul data-checkpoints="covering">${p.checkpoints
          .map(
            (c) =>
              `<li data-checkpoint><code>${esc(c.digest)}</code> · ${esc(word("checkpoints.size"))} ${c.size} · ${esc(word("checkpoints.cut_at"))} <time datetime="${esc(c.at)}">${esc(c.at)}</time></li>`,
          )
          .join("")}</ul>`;
  return `<section data-view="backfill-timeline" data-form="${form}" data-pass="${esc(p.import_batch)}"><h2>${esc(word("title"))}</h2>${label}${head}<h3>${esc(word("rows.title"))}</h3>${perSource}<h3>${esc(word("gaps.title"))}</h3>${gaps}${late}${list(p.anomalies, "anomalies.title", "anomalies")}${list(p.refused, "refused.title", "refused")}${kept}<h3>${esc(word("checkpoints.title"))}</h3>${cps}${words(p.notes, "notes.title", "notes")}<p><small>${esc(word("pass.limits"))}: ${esc(p.limits)}</small></p>${words(p.cannot_see, "cannot_see.title", "cannot-see")}</section>`;
}

/**
 * One pass as an HTML fragment. `record` is the `backfill-import/v0` object
 * the book holds; `checkpoints` (optional) are the ones that cover the pass.
 * Throws BackfillTimelineRefused on a refused input.
 */
export function backfillTimelineHtml(
  record: unknown,
  checkpoints?: unknown,
  form: BackfillForm = "record",
): string {
  if (form !== "record" && form !== "rehearsal")
    throw new BackfillTimelineRefused(["form: is not record or rehearsal"]);
  return draw(read(record, checkpoints), form);
}

/** Throws BackfillTimelineRefused when the record or checkpoints would be refused; draws nothing. */
export function checkBackfillTimeline(
  record: unknown,
  checkpoints?: unknown,
): void {
  read(record, checkpoints);
}
