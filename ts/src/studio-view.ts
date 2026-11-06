// SPDX-License-Identifier: Apache-2.0
/**
 * The Studio home (docs/design/studio-page.md, capsule-viewer#291): the loop
 * diagram, the readiness table (the desk), a term map of one pack on request,
 * and the switch between packs' report pages, drawn from a `studio-view/v0`
 * input the caller builds from the workspace files `terms` writes.
 *
 * The page is static HTML: no script, no network. It carries its input in a
 * `<script type="application/json">` with that JSON's SHA-256 beside it and
 * says the snapshot is workspace data, not sealed evidence. A page rebuilt
 * from its own embedded JSON is byte-identical. Like the History view it
 * draws and never fetches or verifies; unknown members are refused, and
 * caller text is only ever text.
 */
import { sha256Hex } from "@action-state-group/agent-action-capsule";
import PACK from "./wording/studio-view.en.json" with { type: "json" };

export const STUDIO_VIEW = "studio-view/v0";
export const STUDIO_VIEW_WORDING = PACK;

/** The five readiness statuses (evidencebook-skills scripts/studio/readiness.py STATUSES). */
export const READINESS_STATUSES = [
  "checkable now",
  "needs examples",
  "needs a field",
  "needs the other side",
  "not this pack's concern",
] as const;
export type ReadinessStatus = (typeof READINESS_STATUSES)[number];

const SHARED_KINDS = ["bundle_digest", "dataset_ref"] as const;
/** The packagings that carry the bundle; `static` drops it and is not for sending. */
const PAGE_FORMATS = ["html", "embedded"] as const;

export class StudioViewRefused extends Error {
  readonly reasons: readonly string[];
  constructor(reasons: readonly string[]) {
    super(`studio-view refused: ${reasons.join("; ")}`);
    this.name = "StudioViewRefused";
    this.reasons = reasons;
  }
}

interface PackEntry {
  pack_id: string;
  title?: string;
  pack_digest: string;
  judge?: string;
  page: string;
  format: (typeof PAGE_FORMATS)[number];
  shared: { kind: (typeof SHARED_KINDS)[number]; digest: string };
}
interface Term {
  term: string;
  statement: string;
  in_pack: boolean;
  status: ReadinessStatus;
  detail: string;
  reads: string[];
  missing_fields: string[];
}
interface HistoryLine {
  digest: string;
  version: string;
  first_at: string;
  last_at: string;
  run: string | null;
  rehearsal: boolean | null;
  published: string | null;
}
interface Input {
  schema: typeof STUDIO_VIEW;
  active: string;
  packs: PackEntry[];
  readiness: {
    pack_id: string;
    pack_version: string;
    records: number;
    terms: Term[];
    counts: Record<string, number>;
  };
  history: HistoryLine[];
  dataset?: { kind: string; digest: string };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

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
        this.refuse(`${path}.${k}`, "is not a member of studio-view/v0");
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
  hex(v: unknown, path: string): string {
    if (typeof v !== "string" || !/^[0-9a-f]{64}$/u.test(v)) {
      this.refuse(path, "is not 64 lowercase hex characters");
      return "";
    }
    return v;
  }
  nat(v: unknown, path: string): number {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) {
      this.refuse(path, "is not a count");
      return 0;
    }
    return v;
  }
  strs(v: unknown, path: string): string[] {
    if (!Array.isArray(v)) {
      this.refuse(path, "is not a list");
      return [];
    }
    return v.map((x, i) => this.str(x, `${path}[${i}]`));
  }
}

/** A relative path to a sibling page: no scheme, no leading slash, no `..`. */
const PAGE_PATH = /^[A-Za-z0-9_-][A-Za-z0-9._/-]*\.html$/u;

function read(input: unknown): Input {
  const r = new Reader();
  const top = r.obj(
    input,
    "input",
    ["schema", "active", "packs", "readiness", "history", "dataset"],
    ["schema", "active", "packs", "readiness", "history"],
  );
  if (top === null) throw new StudioViewRefused(r.reasons);
  if (top["schema"] !== STUDIO_VIEW)
    r.refuse("input.schema", `is not ${STUDIO_VIEW}`);
  const packs: PackEntry[] = [];
  if (!Array.isArray(top["packs"]) || top["packs"].length === 0)
    r.refuse("input.packs", "is not a non-empty list");
  else
    top["packs"].forEach((raw, i) => {
      const p = `input.packs[${i}]`;
      const o = r.obj(
        raw,
        p,
        [
          "pack_id",
          "title",
          "pack_digest",
          "judge",
          "page",
          "format",
          "shared",
        ],
        ["pack_id", "pack_digest", "page", "shared"],
      );
      if (o === null) return;
      const page = r.str(o["page"], `${p}.page`, 200);
      if (page !== "" && (!PAGE_PATH.test(page) || page.includes("..")))
        r.refuse(`${p}.page`, "is not a relative .html path");
      const format = "format" in o ? o["format"] : "html";
      if (!(PAGE_FORMATS as readonly unknown[]).includes(format))
        r.refuse(
          `${p}.format`,
          `is not one of ${PAGE_FORMATS.join(", ")} (a static page drops the bundle and is not offered for sending)`,
        );
      const shared = r.obj(
        o["shared"],
        `${p}.shared`,
        ["kind", "digest"],
        ["kind", "digest"],
      );
      const kind = shared?.["kind"];
      if (
        shared !== null &&
        !(SHARED_KINDS as readonly unknown[]).includes(kind)
      )
        r.refuse(
          `${p}.shared.kind`,
          `is not one of ${SHARED_KINDS.join(", ")}`,
        );
      packs.push({
        pack_id: r.str(o["pack_id"], `${p}.pack_id`, 200),
        ...("title" in o
          ? { title: r.str(o["title"], `${p}.title`, 200) }
          : {}),
        pack_digest: r.hex(o["pack_digest"], `${p}.pack_digest`),
        ...("judge" in o
          ? { judge: r.str(o["judge"], `${p}.judge`, 200) }
          : {}),
        page,
        format: format as PackEntry["format"],
        shared: {
          kind: kind as PackEntry["shared"]["kind"],
          digest: r.hex(shared?.["digest"], `${p}.shared.digest`),
        },
      });
    });
  const active = r.str(top["active"], "input.active", 200);
  if (packs.length > 0 && !packs.some((p) => p.pack_id === active))
    r.refuse("input.active", "is not a pack_id in packs");
  const ready = r.obj(
    top["readiness"],
    "input.readiness",
    ["pack_id", "pack_version", "records", "terms", "counts"],
    ["pack_id", "pack_version", "records", "terms", "counts"],
  );
  const terms: Term[] = [];
  let counts: Record<string, number> = {};
  if (ready !== null) {
    if (ready["pack_id"] !== active)
      r.refuse("input.readiness.pack_id", "is not the active pack");
    if (!Array.isArray(ready["terms"]))
      r.refuse("input.readiness.terms", "is not a list");
    else
      ready["terms"].forEach((raw, i) => {
        const p = `input.readiness.terms[${i}]`;
        const o = r.obj(
          raw,
          p,
          [
            "term",
            "statement",
            "in_pack",
            "status",
            "detail",
            "reads",
            "missing_fields",
            "filled_rate",
          ],
          [
            "term",
            "statement",
            "in_pack",
            "status",
            "detail",
            "reads",
            "missing_fields",
          ],
        );
        if (o === null) return;
        if (!(READINESS_STATUSES as readonly unknown[]).includes(o["status"]))
          r.refuse(`${p}.status`, "is not one of the five readiness statuses");
        if (typeof o["in_pack"] !== "boolean")
          r.refuse(`${p}.in_pack`, "is not true or false");
        terms.push({
          term: r.str(o["term"], `${p}.term`, 200),
          statement: r.str(o["statement"], `${p}.statement`),
          in_pack: o["in_pack"] === true,
          status: o["status"] as ReadinessStatus,
          detail: typeof o["detail"] === "string" ? o["detail"] : "",
          reads: r.strs(o["reads"], `${p}.reads`),
          missing_fields: r.strs(o["missing_fields"], `${p}.missing_fields`),
        });
      });
    const c = r.obj(
      ready["counts"],
      "input.readiness.counts",
      READINESS_STATUSES,
      [],
    );
    if (c !== null)
      counts = Object.fromEntries(
        Object.entries(c).map(([k, v]) => [
          k,
          r.nat(v, `input.readiness.counts.${k}`),
        ]),
      );
    r.nat(ready["records"], "input.readiness.records");
  }
  const history: HistoryLine[] = [];
  if (!Array.isArray(top["history"]))
    r.refuse("input.history", "is not a list");
  else
    top["history"].forEach((raw, i) => {
      const p = `input.history[${i}]`;
      const o = r.obj(
        raw,
        p,
        [
          "digest",
          "version",
          "first_at",
          "last_at",
          "run",
          "rehearsal",
          "published",
        ],
        ["digest", "version", "first_at", "last_at"],
      );
      if (o === null) return;
      const opt = (k: string): string | null =>
        o[k] === null || o[k] === undefined ? null : r.str(o[k], `${p}.${k}`);
      history.push({
        digest: r.str(o["digest"], `${p}.digest`, 200),
        version: r.str(o["version"], `${p}.version`, 200),
        first_at: r.str(o["first_at"], `${p}.first_at`, 200),
        last_at: r.str(o["last_at"], `${p}.last_at`, 200),
        run: opt("run"),
        rehearsal:
          typeof o["rehearsal"] === "boolean"
            ? (o["rehearsal"] as boolean)
            : null,
        published: opt("published"),
      });
    });
  if ("dataset" in top) {
    const d = r.obj(
      top["dataset"],
      "input.dataset",
      ["kind", "digest"],
      ["kind", "digest"],
    );
    if (d !== null) {
      r.str(d["kind"], "input.dataset.kind", 200);
      r.str(d["digest"], "input.dataset.digest", 200);
    }
  }
  if (r.reasons.length > 0) throw new StudioViewRefused(r.reasons);
  return {
    schema: STUDIO_VIEW,
    active,
    packs,
    readiness: {
      pack_id: ready!["pack_id"] as string,
      pack_version: r.str(
        ready!["pack_version"],
        "input.readiness.pack_version",
        200,
      ),
      records: ready!["records"] as number,
      terms,
      counts,
    },
    history,
    ...(isObj(top["dataset"])
      ? { dataset: top["dataset"] as { kind: string; digest: string } }
      : {}),
  };
}

// --- writing the page ------------------------------------------------------

const W = PACK.entries as Readonly<Record<string, string>>;
const word = (key: string): string => {
  const w = W[key];
  if (w === undefined) throw new Error(`studio-view: no word ${key}`);
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

const STATUS_TOKEN: Readonly<Record<ReadinessStatus, string>> = {
  "checkable now": "checkable",
  "needs examples": "examples",
  "needs a field": "field",
  "needs the other side": "other-side",
  "not this pack's concern": "not-concern",
};

function loop(input: Input): string {
  const entries = input.history;
  const tried = entries.some((e) => e.run !== null && e.rehearsal === true);
  const live = entries.some((e) => e.published !== null);
  const stages: [string, boolean][] = [
    ["terms", input.readiness.terms.length > 0],
    ["tried", tried],
    ["switched_on", live],
  ];
  const items = stages
    .map(
      ([id, done]) =>
        `<li data-stage="${id}" data-state="${done ? "done" : "not-yet"}"><strong>${esc(word(`loop.${id}`))}</strong> <span>${esc(word(done ? "loop.done" : "loop.not_yet"))}</span></li>`,
    )
    .join("");
  return `<section data-view="loop"><h2>${esc(word("loop.title"))}</h2><ol class="cv-studio-loop">${items}</ol></section>`;
}

function desk(input: Input): string {
  const { terms, counts } = input.readiness;
  const rows = terms
    .map(
      (t) =>
        `<tr data-term="${esc(t.term)}" data-status="${STATUS_TOKEN[t.status]}"><td>${esc(t.statement)}</td><td><span class="cv-chip">${esc(word(`status.${STATUS_TOKEN[t.status]}`))}</span></td><td>${esc(t.detail)}</td><td>${esc(t.reads.join(", "))}</td><td>${esc(t.missing_fields.join(", "))}</td></tr>`,
    )
    .join("");
  const line = READINESS_STATUSES.map(
    (s) => `${esc(word(`status.${STATUS_TOKEN[s]}`))} ${counts[s] ?? 0}`,
  ).join(" · ");
  return `<section data-view="readiness"><h2>${esc(word("desk.title"))}</h2><p data-counts>${line}</p><table><thead><tr><th>${esc(word("desk.term"))}</th><th>${esc(word("desk.status"))}</th><th>${esc(word("desk.detail"))}</th><th>${esc(word("desk.reads"))}</th><th>${esc(word("desk.lacks"))}</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function termMap(input: Input): string {
  const groups = READINESS_STATUSES.map((s) => {
    const ts = input.readiness.terms.filter((t) => t.status === s);
    if (ts.length === 0) return "";
    const items = ts
      .map(
        (t) =>
          `<li data-term="${esc(t.term)}">${esc(t.statement)} <small>${esc(word("map.reads"))} ${esc(t.reads.join(", "))}</small></li>`,
      )
      .join("");
    return `<details data-status="${STATUS_TOKEN[s]}"><summary>${esc(word(`status.${STATUS_TOKEN[s]}`))} (${ts.length})</summary><ul>${items}</ul></details>`;
  }).join("");
  return `<section data-view="term-map" data-pack="${esc(input.active)}"><h2>${esc(word("map.title"))}</h2>${groups}</section>`;
}

function switcher(input: Input): string {
  const items = input.packs
    .map((p) => {
      const here = p.pack_id === input.active;
      const label = esc(p.title ?? p.pack_id);
      const link = here
        ? `<strong>${label}</strong>`
        : `<a href="${esc(p.page)}">${label}</a>`;
      return `<li data-pack="${esc(p.pack_id)}" data-format="${p.format}"${here ? ' aria-current="page"' : ""}>${link} <small>${esc(word("switch.pack_digest"))} <code>${p.pack_digest}</code>${p.judge === undefined ? "" : ` · ${esc(word("switch.judge"))} ${esc(p.judge)}`} · ${esc(word(`switch.${p.shared.kind}`))} <code>${p.shared.digest}</code></small> <a href="${esc(p.page)}">${esc(word("switch.report"))}</a></li>`;
    })
    .join("");
  return `<nav data-view="switch"><h2>${esc(word("switch.title"))}</h2><ul>${items}</ul></nav>`;
}

/** Sorted-key JSON, so one input always has one byte form. */
function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (isObj(value))
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export const studioViewStyles = `.cv-studio{font:16px/1.45 system-ui,sans-serif;max-width:1120px;margin:0 auto;padding:16px;display:grid;gap:16px;color:#1f2733}
.cv-studio table{border-collapse:collapse;width:100%}.cv-studio td,.cv-studio th{border-bottom:1px solid #e3ded3;padding:6px 8px;text-align:left;vertical-align:top}
.cv-chip{display:inline-block;border:1px solid #e3ded3;border-radius:6px;padding:1px 8px;font-size:13px}
[data-status=checkable] .cv-chip{background:#e3f1ea}[data-status=field] .cv-chip{background:#fbefd9}
.cv-studio-loop{display:flex;gap:16px;list-style:none;padding:0}.cv-studio-loop li{border:1px solid #e3ded3;border-radius:8px;padding:8px 12px}
.cv-studio-loop [data-state=not-yet]{color:#6b7482}.cv-snapshot{color:#6b7482;font-size:13px}
@media print{.cv-studio{max-width:none}}
`;

/** The Studio home as an HTML fragment; throws StudioViewRefused on a refused input. */
export function studioViewHtml(input: unknown): string {
  const v = read(input);
  return `<main class="cv-studio" data-studio="home">${loop(v)}${switcher(v)}${desk(v)}${termMap(v)}</main>`;
}

/**
 * A whole static page: the home, the input it was drawn from in a JSON
 * script, and that JSON's SHA-256, labelled as workspace data that is not
 * sealed evidence. Rebuilding from the embedded JSON gives the same bytes.
 */
export async function studioViewDocument(
  input: unknown,
  title = "Terms Pack Studio",
): Promise<string> {
  const v = read(input);
  const json = canon(v).replace(/</gu, "\\u003c");
  const digest = await sha256Hex(new TextEncoder().encode(json));
  const snapshot = `<footer class="cv-snapshot" data-snapshot><p>${esc(word("snapshot.label"))} <code data-snapshot-digest>${digest}</code></p><script type="application/json" data-studio-input>${json}</script></footer>`;
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${studioViewStyles}</style></head><body>${studioViewHtml(v)}${snapshot}</body></html>\n`;
}
