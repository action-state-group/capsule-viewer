// SPDX-License-Identifier: Apache-2.0
// The x-deal-v0 receipt models (unilateral, seller, bilateral) and the
// provider's receipt carry where each value was read, in the shape PR 1 of the
// receipt view-model note gave the x-deal-v1 model (docs/design/receipt-view-
// model.md section 2; capsule-viewer#496): a `sources` map beside plain
// members and a `src` on each step fact, report item, payment and party.
//
// Over every case of the frozen receipt golden that a module accepts:
//   - every source resolves against that case's bundle, capsulectl's report or
//     the page's own checks, and gives the value the model holds, directly or
//     through one of a closed list of derivations (DERIVED below);
//   - every member that must carry a source does (REQUIRED below), so a source
//     left out fails here even though the parity test compares models without
//     their sources.
import { beforeAll, describe, expect, it } from "vitest";
import { caseInputs, KINDS, loadScript, readBundle, readVerify, receiptGolden } from "./receiptScripts.js";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** RFC 6901. */
function pointer(value, path) {
  if (path === "") return value;
  if (typeof path !== "string" || !path.startsWith("/")) return undefined;
  let at = value;
  for (const raw of path.slice(1).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(at)) at = /^\d+$/.test(key) ? at[Number(key)] : undefined;
    else if (isObj(at)) at = Object.prototype.hasOwnProperty.call(at, key) ? at[key] : undefined;
    else return undefined;
  }
  return at;
}

/** A record's pair: {record, agent_input}, from the bundle's records and disclosures, or the standalone report's own. */
function pairOf(bundle, id) {
  const standalone = bundle.extensions?.["x-deal-report/v0"];
  if (isObj(standalone) && standalone.record?.capsule_id === id) return standalone;
  const record = (bundle.records || []).find((r) => isObj(r) && r.capsule_id === id);
  if (record === undefined) return undefined;
  return { record, agent_input: bundle.disclosures?.[id]?.agent_input };
}

/** capsulectl's report entry a `report` source names. */
function reportEntry(verify, name) {
  const entries = Array.isArray(verify?.extensions) ? verify.extensions : [];
  if (name === "composed/v1") return entries.find((e) => isObj(e) && isObj(e.composed))?.composed;
  return entries.find((e) => isObj(e) && e.kind === name && e.report === "standalone") ?? entries.find((e) => isObj(e) && e.kind === name);
}

const MISSING = Symbol("missing");

/** The value a source names in `ins` ({bundle, verify, context, assurance}), or MISSING. */
function resolve(src, ins) {
  let got;
  if ("record" in src) got = pointer(pairOf(ins.bundle, src.record), src.path);
  else if ("report" in src) got = pointer(reportEntry(ins.verify, src.report), src.path ?? "");
  else if ("bundle" in src) got = pointer(ins.bundle, src.bundle);
  else if ("checked" in src) {
    if (src.checked === "bundle_digest") got = ins.assurance?.bundle_digest;
    else if (src.checked === "memberships") got = pointer(ins.context?.completeness?.memberships, src.path);
    else if (src.checked === "report_check") got = ins.assurance?.report_checked;
  }
  return got === undefined ? MISSING : got;
}

/** A body member as a fact's text (receipt_core.js token). */
function tokenText(v) {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" && Number.isInteger(v)) return String(v);
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v.join(", ");
  return MISSING;
}

const truthy = (v) => !(v === null || v === undefined || v === false || v === 0 || v === "" || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length));
const strs = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The closed list of derivations: each recomputes the shown value from the
 * values its sources resolve to (`got`, in `from` order; `from` the sources
 * themselves) and is true only when the two agree.
 */
const DERIVED = (api) => ({
  amount: (value, got) => value === api.formatAmount(got[0], got[1]),
  count: (value, got) => Array.isArray(got[0]) && value === String(got[0].length),
  join: (value, got) => Array.isArray(got[0]) && value === got[0].map(String).join(", "),
  // The whole told line and deadline, rebuilt from the entry (the core's own reader).
  told: (value, got) => isObj(got[0]) && sameValue(value, api.entryReaders.told(got[0])),
  deadline: (value, got) => isObj(got[0]) && sameValue(value, api.entryReaders.deadline(got[0])),
  producer: (value, got) => Array.isArray(value) && value.every((p) => p === null || got.some((g) => isObj(g) && typeof g.version === "string" && p === `${g.name || "an unnamed producer"} ${g.version} (${g.commit || "unknown"})`)),
  producer_name: (value, got) => Array.isArray(value) && value.every((n) => n === null || got.some((g) => isObj(g) && g.name === n)),
  payload_digest: (value, got) => value === api.recordDigest(got[0]),
  // A reference (got[0], a digest) to a record (got[1], its payload): the digests agree, and the value
  // names the record referred to (ref) or the record referring (ref_by).
  ref: (value, got, from) => got[0] === api.recordDigest(got[1]) && value === from[1].record,
  ref_by: (value, got, from) => got[0] === api.recordDigest(got[1]) && value === from[0].record,
  commitments: (value, got) => Array.isArray(value) && value.length === got.length && value.every((c, i) => c[2] === got[i]),
  distinct: (value, got) => Array.isArray(value) && [...new Set(got)].sort().join() === [...value].sort().join(),
  provider_amount: (value, got) => value === (api.providerAmount(got[0])?.text ?? null),
  provider_utc: (value, got) => value === api.providerUtc(typeof got[0] === "string" ? got[0] : ""),
  provider_total: (value, got) => {
    let sum = 0n;
    for (const g of got) {
      const a = api.providerAmount(g);
      if (!a || a.msat === null) return value === null;
      sum += BigInt(a.msat);
    }
    return value === sum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " msat";
  },
  // A step the copy does not carry: the report entry citing it names it.
  cited: (value, got) => isObj(got[0]) && [got[0].steps, got[0].capsule_id].flat().includes(value),
  // The deal every carried copy's disclosed records name (namedDeals).
  one_deal: (value, got) =>
    got.every((b) => Object.values(b?.disclosures ?? {}).some((d) => {
      const p = d?.agent_input;
      return isObj(p) && [p["x-deal-v0"]?.deal_id, p.deal_id, p.chain_id].includes(value);
    })),
  rail: (value, got) => value.state === "missing" && value.rail === got[0],
  // The legs' summed amounts (legBand), rebuilt from the settlements named.
  legs: (value, got) => got.length > 0 && got.every((g) => isObj(g) && g.status === "settled") && sameValue(value.band, api.entryReaders.legBand(got)),
  // The act the page's own check names is the record named and its action that record's. The line's
  // state, why and approvers are that check's result over the copy's whole deal log (afterYesOf), held
  // case by case in js-tests/receipt_deal_view_lines.test.js, not a value read from one member.
  after_yes: (value, got, from) => (value.act ? from[0].record === value.act.step && got[0] === value.act.action : value.act === undefined && "bundle" in from[0]),
  // Each accepted text is an acceptance opening the report holds for that step. The name is the label
  // counterpartyOf builds from the openings' last value of each kind, when every one recomputed
  // (unchecked false); when one did not, the page dropped it after its own fingerprint check.
  counterparty_openings: (value, got) =>
    value.accepted.every((a) => a.text === null || (Array.isArray(got[1]) && got[1].some((o) => o?.step === a.step && o?.text === a.text))) &&
    (value.who === null || value.unchecked || value.who === counterpartyLabel(got[0])),
});

/** Two values the same, a model's own `src`/`sources` left out. */
function sameValue(a, b) {
  const strip = (v) => JSON.parse(JSON.stringify(v ?? null), (k, x) => (isObj(x) ? (delete x.src, delete x.sources, x) : x));
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/** counterpartyOf's label, from each kind's last value in the counterparty openings. */
function counterpartyLabel(openings) {
  const got = {};
  for (const e of (isObj(openings) && Array.isArray(openings.steps) ? openings.steps : [])) {
    for (const k of ["payee", "name", "domain", "phone", "email"]) if (typeof e?.[k] === "string") got[k] = e[k];
  }
  const label = got.payee || got.name || got.domain || got.phone || got.email || null;
  return label !== null && got.domain && label !== got.domain ? `${label} (${got.domain})` : label;
}

/**
 * An object-valued member against the report entry its source names, rebuilt
 * whole by the core's own reader for that kind of entry (api.entryReaders).
 */
export function sameEntry(value, got, api) {
  // The sealed AUTHORITY blocks, rebuilt by the core's reader (authorityOf).
  if ("blocks" in value) return Array.isArray(got) && sameValue(value.blocks, api.entryReaders.authorityBlocks(got));
  if (!isObj(got)) return false;
  // A join of the composition, with its corroboration: the verifier's join entry.
  if ("join" in value && "corroboration" in value) {
    const text = (v) => (typeof v === "string" ? v : "");
    return value.join.basis === text(got.basis) && value.join.result === text(got.result) && value.join.declared === text(got.declared) && value.join.derived === (typeof got.derived === "string" ? got.derived : null) && sameList(value.join.members, strs(got.members).concat(["", ""]).slice(0, 2));
  }
  const r = api.entryReaders;
  // A did, later or anomaly item (an anomaly is always flagged, its text "" when the entry has none).
  if ("text" in value && "flagged" in value) {
    if (value.flagged && value.at === null) return sameValue(value, { text: typeof got.text === "string" ? got.text : "", steps: strs(got.steps), at: null, flagged: true });
    return sameValue(value, r.item(got, "steps")) || sameValue(value, r.item(got, "capsule_id"));
  }
  if ("order_id" in value) return sameValue(value, r.merchant(got));
  if ("proven" in value) return sameValue(value, { proven: strs(got.proven), not_proven: strs(got.not_proven), confirmed: got.merchant === "confirmed", steps: strs(got.steps) });
  if ("by" in value && "facts" in value) return sameValue(value, r.journey(got));
  return false;
}

export const DERIVED_FOR_TEST = (api) => DERIVED(api);

/** Every problem with the sources in `model`: unresolved, disagreeing or of no known kind. */
export function sourceProblems(api, model, ins) {
  const derived = DERIVED(api);
  const problems = [];
  const check = (where, value, src, scope) => {
    if (!isObj(src)) return problems.push(`${where}: source is not an object`);
    if ("derived" in src) {
      if (!Object.prototype.hasOwnProperty.call(derived, src.derived)) return problems.push(`${where}: no derivation ${src.derived}`);
      // An absent optional input (null) reads as undefined; every other source must resolve.
      const optional = src.derived === "counterparty_openings";
      const got = (src.from || []).map((f) => (f === null && optional ? undefined : isObj(f) && "bundle" in f && Object.keys(f).length === 1 ? pointer(scope.bundle, f.bundle) : resolve(f, scope)));
      // Only a sum may have no terms (a provider's receipt with no payment: 0 msat).
      if ((!src.from?.length && src.derived !== "provider_total") || got.some((g, i) => g === MISSING || (g === undefined && !(optional && src.from[i] === null)))) return problems.push(`${where}: a source of ${src.derived} does not resolve`);
      // A fact is compared by its text.
      const shown = isObj(value) && "name" in value && "kind" in value && "value" in value ? value.value : value;
      if (!derived[src.derived](shown, got, src.from)) problems.push(`${where}: ${JSON.stringify(shown)} is not ${src.derived} of what its sources hold`);
      return;
    }
    const got = resolve(src, scope);
    if ("checked_against" in src && (src.checked_against === null || resolve(src.checked_against, scope) === MISSING)) problems.push(`${where}: what it was checked against does not resolve`);
    if (got === MISSING) {
      // A plain member the copy does not carry reads "" (or(..., "")): no value, nothing to resolve.
      if (value === "") return;
      return problems.push(`${where}: ${JSON.stringify(src)} does not resolve`);
    }
    if ("checked" in src && src.checked === "report_check") return void (["pass", "fail"].includes(value) || problems.push(`${where}: ${value}`));
    if (isObj(value) && "name" in value && "kind" in value && "value" in value) {
      if (tokenText(got) !== value.value) problems.push(`${where}: fact ${value.value} is not ${JSON.stringify(got)}`);
    } else if (isObj(value) && "log_id" in value) {
      if (!isObj(got) || got.log_id !== value.log_id || got.seq !== value.seq || got.leaf_index !== value.leaf_index) problems.push(`${where}: log place differs`);
    } else if (Array.isArray(value)) {
      if (!sameList(value, strs(got))) problems.push(`${where}: list differs`);
    } else if (isObj(value)) {
      if (!sameEntry(value, got, api)) problems.push(`${where}: ${JSON.stringify(value).slice(0, 120)} is not the entry its source names`);
    } else if (value !== got && tokenText(got) !== value) problems.push(`${where}: ${JSON.stringify(value)} is not ${JSON.stringify(got)}`);
  };
  const walk = (node, where, scope) => {
    if (Array.isArray(node)) return node.forEach((x, i) => walk(x, `${where}[${i}]`, scope));
    if (!isObj(node)) return;
    let inner = scope;
    // A party of a composition: its own record sources resolve in its carried copy.
    if (isObj(node.src) && Object.keys(node.src).length === 1 && "bundle" in node.src && "member" in node) {
      const carried = pointer(scope.bundle, node.src.bundle);
      if (!isObj(carried)) problems.push(`${where}: carried copy does not resolve`);
      inner = { ...scope, bundle: carried, verify: scope.members?.[node.member]?.verify, context: scope.members?.[node.member]?.context, assurance: node.assurance };
    } else if (node.src !== undefined) check(`${where}.src`, node, node.src, scope);
    if (isObj(node.sources)) {
      for (const [k, src] of Object.entries(node.sources)) {
        // A party's member, observer and custody come from the outer composition, the rest from its copy.
        const at = ["member", "observer", "role", "custody_domain"].includes(k) ? scope : inner;
        check(`${where}.${k}`, node[k], src, at);
      }
    }
    for (const [k, v] of Object.entries(node)) if (k !== "sources" && k !== "src" && k !== "assurance" && k !== "verification" && k !== "composition") walk(v, `${where}.${k}`, inner);
  };
  walk(model, "model", ins);
  return problems;
}

/** The members of a receipt model that must name their source when they hold a value. */
function receiptRequired(r, where, need) {
  need(r.deal_id === "" || r.sources?.deal_id, `${where}.deal_id`);
  need(r.bundle_digest === null || r.sources?.bundle_digest, `${where}.bundle_digest`);
  need(r.headline.state === null || r.headline.sources?.state, `${where}.headline.state`);
  r.steps.forEach((s, i) => {
    need(s.sources?.capsule_id, `${where}.steps[${i}].capsule_id`);
    need(s.key_id === null || s.sources?.key_id, `${where}.steps[${i}].key_id`);
    need(s.log === null || s.sources?.log, `${where}.steps[${i}].log`);
    need(s.line === null || s.sources?.line, `${where}.steps[${i}].line`);
    s.facts.forEach((f, j) => need(f.src, `${where}.steps[${i}].facts[${j}]`));
  });
  [r.asked, ...r.statements].forEach((o, i) => need(o.text === null || o.sources?.text, `${where}.opening[${i}].text`));
  for (const list of ["did", "later", "told", "deadlines", "merchant", "cancellations", "journey", "agent_anomalies", "counterparty_anomalies"]) {
    r.report[list].forEach((x, i) => need(x.src, `${where}.report.${list}[${i}]`));
  }
  for (const k of ["state", "money", "lifecycle", "as_of", "scope", "did_line", "instructions"]) need(r.report[k] === null || r.report.sources?.[k], `${where}.report.${k}`);
  for (const k of ["counterparty_named", "authority_sealed", "referee"]) need(r[k] === undefined || r.sources?.[k], `${where}.${k}`);
  // The page's own lines carry their source on the line.
  for (const k of ["settlement", "after_yes"]) need(r[k] === undefined || r[k].src, `${where}.${k}`);
}

function sellerRequired(s, where, need) {
  receiptRequired(s.receipt, `${where}.receipt`, need);
  if (isObj(s.item)) need(s.item.src, `${where}.item`);
  if (isObj(s.amount)) need(s.amount.src, `${where}.amount`);
  s.authority.forEach((f, i) => need(f.src, `${where}.authority[${i}]`));
  s.handover.facts.forEach((f, i) => need(f.src, `${where}.handover.facts[${i}]`));
  s.offers.forEach((o, i) => {
    need(o.sources?.step, `${where}.offers[${i}].step`);
    need(o.amount === null || o.amount.src, `${where}.offers[${i}].amount`);
    for (const k of ["digest", "supersedes", "superseded_by", "accepted_by"]) need(o[k] === null || o.sources?.[k], `${where}.offers[${i}].${k}`);
  });
  s.acceptances.forEach((a, i) => {
    need(a.sources?.step, `${where}.acceptances[${i}].step`);
    need(a.offer === null || a.sources?.offer, `${where}.acceptances[${i}].offer`);
  });
  s.evidence.forEach((e, i) => need(e.sources?.step, `${where}.evidence[${i}].step`));
  need(s.outcome === null || s.sources?.outcome, `${where}.outcome`);
  need(!s.commitments.length || s.sources?.commitments, `${where}.commitments`);
  need(!s.keys.length || s.sources?.keys, `${where}.keys`);
}

/** Every member of `model` (a module of `kind`) that holds a value and names no source. */
export function missingSources(kind, model) {
  const missing = [];
  const need = (ok, label) => {
    if (!ok) missing.push(label);
  };
  if (kind === "unilateral") receiptRequired(model, "model", need);
  else if (kind === "seller") sellerRequired(model, "model", need);
  else if (kind === "bilateral") {
    need(model.deal === null || model.sources?.deal, "model.deal");
    model.joins.forEach((j, i) => need(j.src, `model.joins[${i}]`));
    model.parties.forEach((p, i) => {
      need(p.src?.bundle, `model.parties[${i}].src`);
      need(p.sources?.member, `model.parties[${i}].member`);
      receiptRequired(p.receipt, `model.parties[${i}].receipt`, need);
      if (p.seller) sellerRequired(p.seller, `model.parties[${i}].seller`, need);
    });
  } else if (kind === "provider") {
    for (const k of ["effect", "exchange_id", "model", "served_at", "total"]) need(model[k] === null || model[k] === "" || model.sources?.[k], `model.${k}`);
    need(model.reason === null || model.sources?.reason, "model.reason");
    model.payments.forEach((p, i) => {
      need(p.sources?.capsule_id, `model.payments[${i}].capsule_id`);
      need(p.received === null || p.sources?.received, `model.payments[${i}].received`);
      need(p.fee === null || p.sources?.fee, `model.payments[${i}].fee`);
    });
  }
  return missing;
}

describe("the v0 and provider receipt models name each value's source (view-model note PR 4)", () => {
  const loaded = {};
  let oracle;
  beforeAll(() => {
    oracle = receiptGolden();
    for (const kind of [...KINDS, "provider"]) loaded[kind] = loadScript(kind);
  }, 120000);

  /** Each accepted (case, kind), its model and what its sources resolve in. */
  async function* models(cases = oracle.cases) {
    for (const c of cases) {
      for (const kind of [...KINDS, "provider"]) {
        if (!c.modules[kind]?.can_render) continue;
        const { context, env } = caseInputs(c);
        const members = {};
        const memberContext = env.memberContext;
        env.memberContext = (bundle, id) => {
          const ctx = memberContext(bundle, id);
          const verify = (c.verify ?? readVerify(c.name)).extensions?.find((e) => isObj(e?.composed))?.composed?.members?.find((m) => m.id === id)?.bundle;
          members[id] = { context: ctx, verify };
          return ctx;
        };
        const module = loaded[kind].api.createModule(kind, { ...env, reportCheck: () => undefined, preimageCheck: () => undefined });
        const model = await module.buildModel(context);
        const ins = { bundle: c.bundle ?? context.bundle, verify: c.verify ?? readVerify(c.name), context, assurance: c.env.assurance, members };
        yield { name: `${c.name} @${c.audience} ${kind}`, kind, model, ins, api: loaded[kind].api };
      }
    }
  }

  it("every source resolves and gives the value shown, and every value has one", async () => {
    const problems = [];
    let count = 0;
    const kinds = new Set();
    for await (const { name, kind, model, ins, api } of models()) {
      count += 1;
      kinds.add(kind);
      for (const p of sourceProblems(api, model, ins)) problems.push(`${name}: ${p}`);
      for (const m of missingSources(kind, model)) problems.push(`${name}: ${m} has no source`);
    }
    expect(problems.slice(0, 40)).toEqual([]);
    // Every accepted case of the golden (receipt_parity.test.js: 34 for the three deal scripts, plus the provider's).
    expect(count).toBeGreaterThan(34);
    expect([...kinds].sort()).toEqual(["bilateral", "provider", "seller", "unilateral"]);
  });

  it("fails when a source is left out, points elsewhere or a derived value is wrong", async () => {
    let unilateral = null;
    let provider = null;
    for await (const m of models()) {
      if (!unilateral && m.kind === "unilateral" && m.model.steps.some((s) => s.facts.length)) unilateral = m;
      if (!provider && m.kind === "provider" && m.model.total !== null) provider = m;
    }
    expect(unilateral && provider).toBeTruthy();
    // A step whose source is dropped.
    const dropped = structuredClone(unilateral.model);
    delete dropped.steps[0].sources.capsule_id;
    expect(missingSources("unilateral", dropped)).toContain("model.steps[0].capsule_id");
    // A fact whose value no longer is what its source holds (a hardcoded value).
    const step = unilateral.model.steps.findIndex((s) => s.facts.length);
    const hard = structuredClone(unilateral.model);
    hard.steps[step].facts[0].value = "hardcoded";
    expect(sourceProblems(unilateral.api, hard, unilateral.ins).join("\n")).toMatch(/fact hardcoded is not/);
    // A source pointing at a member the record does not have.
    const moved = structuredClone(unilateral.model);
    moved.sources.deal_id = { ...moved.sources.deal_id, path: "/agent_input/report/no_such_member" };
    expect(sourceProblems(unilateral.api, moved, unilateral.ins).join("\n")).toMatch(/model\.deal_id: .* does not resolve/);
    // A derived total that is not the sum of the legs.
    const total = structuredClone(provider.model);
    total.total = "1 msat";
    expect(sourceProblems(provider.api, total, provider.ins).join("\n")).toMatch(/model\.total: "1 msat" is not provider_total/);
    // A derivation outside the closed list.
    const unknown = structuredClone(provider.model);
    unknown.sources.total = { derived: "guess", from: unknown.sources.total.from };
    expect(sourceProblems(provider.api, unknown, provider.ins).join("\n")).toMatch(/no derivation guess/);
  });

  /** The first model of `kind` the predicate picks. */
  async function first(kind, pick) {
    for await (const m of models()) if (m.kind === kind && pick(m.model)) return m;
    throw new Error(`no ${kind} model`);
  }
  const problemsOf = (m, model) => sourceProblems(m.api, model, m.ins).join("\n");

  it("fails when a source is redirected to another entry that exists", async () => {
    const u = await first("unilateral", (m) => m.report.did.length > 1);
    const did = structuredClone(u.model);
    did.report.did[0].src = did.report.did[1].src;
    expect(problemsOf(u, did)).toMatch(/model\.report\.did\[0\]\.src: .* is not the entry its source names/);
    const step = structuredClone(u.model);
    step.steps[0].sources.key_id = step.steps[1].sources.capsule_id;
    expect(problemsOf(u, step)).toMatch(/model\.steps\[0\]\.key_id: /);
    const s = await first("seller", (m) => m.offers.some((o) => o.supersedes !== null) && m.commitments.length > 1);
    const sup = structuredClone(s.model);
    const o = sup.offers.findIndex((x) => x.supersedes !== null);
    sup.offers[o].supersedes = sup.offers[o].step;
    expect(problemsOf(s, sup)).toMatch(new RegExp(`offers\\[${o}\\]\\.supersedes: .* is not ref`));
    const com = structuredClone(s.model);
    com.sources.commitments.from = [...com.sources.commitments.from].reverse();
    expect(problemsOf(s, com)).toMatch(/model\.commitments: .* is not commitments/);
  });

  it("fails when a derived value is not what its sources make", async () => {
    const t = await first("seller", (m) => m.receipt.report.told.length > 0);
    const told = structuredClone(t.model);
    told.receipt.report.told[0].text += " (edited)";
    expect(problemsOf(t, told)).toMatch(/model\.receipt\.report\.told\[0\]\.src: .* is not told/);
    const u = await first("unilateral", (m) => m.producers.some((p) => p !== null));
    const prod = structuredClone(u.model);
    prod.producers = prod.producers.map((p) => (p === null ? p : p.replace(/\(.*\)/, "(edited)")));
    expect(problemsOf(u, prod)).toMatch(/model\.producers: .* is not producer/);
    // No fixture's check names an act; one added to a line that names none is not what its source says.
    const a = await first("unilateral", (m) => m.after_yes !== undefined);
    const yes = structuredClone(a.model);
    yes.after_yes.act = { step: yes.steps[0].capsule_id, action: "edited" };
    expect(problemsOf(a, yes)).toMatch(/model\.after_yes\.src: .* is not after_yes/);
    const b = await first("bilateral", (m) => m.deal !== null);
    const deal = structuredClone(b.model);
    deal.deal = "deal-edited";
    expect(problemsOf(b, deal)).toMatch(/model\.deal: .* is not one_deal/);
    const p = await first("provider", (m) => m.payments.length > 0);
    const fee = structuredClone(p.model);
    fee.payments[0].received = "1 msat";
    expect(problemsOf(p, fee)).toMatch(/payments\[0\]\.received: .* is not provider_amount/);
  });

  it("names a commitment whose member name holds a dot apart from a nested one", async () => {
    const c = oracle.cases.find((x) => x.name === "seller-keep" && x.modules.seller.can_render);
    const bundle = structuredClone(readBundle("seller-keep"));
    const [id, d] = Object.entries(bundle.disclosures).find(([, v]) => isObj(v.agent_input?.body));
    d.agent_input.body["x.y_commitment"] = "dotted";
    d.agent_input.body.x = { y_commitment: "nested" };
    const [m] = await (async () => { const out = []; for await (const x of models([{ ...c, bundle }])) if (x.kind === "seller") out.push(x); return out; })();
    const named = m.model.commitments.filter((x) => x[0] === id && ["dotted", "nested"].includes(x[2]));
    expect(named.map((x) => [x[1], x[2]]).sort()).toEqual([["x.y_commitment", "dotted"], ["x.y_commitment", "nested"]]);
    expect(sourceProblems(m.api, m.model, m.ins)).toEqual([]);
    const at = m.model.sources.commitments.from.filter((f) => f.record === id).map((f) => f.path);
    expect(at).toEqual(expect.arrayContaining(["/agent_input/body/x.y_commitment", "/agent_input/body/x/y_commitment"]));
  });

  it("fails when a displayed field of a report entry is not the entry's (merchant, journey, deadline, authority)", async () => {
    const picks = [
      ["merchant", (r) => r.report.merchant.length, (r) => (r.report.merchant[0].we_say += " (edited)"), /report\.merchant\[0\]\.src: .* is not the entry/],
      ["journey", (r) => r.report.journey.some((j) => j.facts.length), (r) => (r.report.journey.find((j) => j.facts.length).facts[0][1] += " (edited)"), /report\.journey\[\d+\]\.src: .* is not the entry/],
      ["deadline", (r) => r.report.deadlines.length, (r) => (r.report.deadlines[0].flagged = !r.report.deadlines[0].flagged), /report\.deadlines\[0\]\.src: .* is not deadline/],
      ["authority", (r) => r.authority_sealed?.blocks.length, (r) => (r.authority_sealed.blocks[0].covered = !r.authority_sealed.blocks[0].covered), /authority_sealed: .* is not the entry/],
    ];
    const found = [];
    for await (const m of models()) {
      const r = m.model.receipt || (m.kind === "unilateral" ? m.model : null);
      if (!r) continue;
      for (const [name, has, edit, fails] of picks) {
        if (found.includes(name) || !has(r)) continue;
        const edited = structuredClone(m.model);
        edit(edited.receipt || edited);
        expect(problemsOf(m, edited), name).toMatch(fails);
        found.push(name);
      }
    }
    // The fixtures carry journeys and authority blocks; no fixture's report has a merchant or deadline entry.
    expect(found.sort()).toEqual(["authority", "journey"]);
    const api = loaded.unilateral.api;
    const merchantEntry = { order_id: "o-1", verified: true, merchant_says: "shipped", we_say: "received", items: ["a", "b"], steps: ["s1"] };
    const merchant = api.entryReaders.merchant(merchantEntry);
    expect(sameEntry(merchant, merchantEntry, api)).toBe(true);
    expect(sameEntry({ ...merchant, merchant_says: "edited" }, merchantEntry, api)).toBe(false);
    expect(sameEntry({ ...merchant, rows: [] }, merchantEntry, api)).toBe(false);
    const deadlineEntry = { due_by: "2026-12-01", status: "open", text: "return", holds: "the seller" };
    const due = api.entryReaders.deadline(deadlineEntry);
    expect(DERIVED_FOR_TEST(api).deadline(due, [deadlineEntry])).toBe(true);
    expect(DERIVED_FOR_TEST(api).deadline({ ...due, flagged: false }, [deadlineEntry])).toBe(false);
    // The legs' band is rebuilt by legBand: a wrong one fails.
    const derived = DERIVED_FOR_TEST(loaded.unilateral.api);
    const leg = { status: "settled", received: { value: "1000", assetCode: "BTC", assetScale: 11 } };
    const band = loaded.unilateral.api.entryReaders.legBand([leg]);
    expect(derived.legs({ band }, [leg])).toBe(true);
    expect(derived.legs({ band: { currency: "wrong", decade: 99 } }, [leg])).toBe(false);
  });
});
