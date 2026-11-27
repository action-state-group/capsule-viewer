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
import { caseInputs, KINDS, loadScript, readVerify, receiptGolden } from "./receiptScripts.js";

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

/**
 * The closed list of derivations: each recomputes the shown value from the
 * values its sources resolve to (`got`, in `from` order). True when it agrees.
 */
const DERIVED = (api) => ({
  amount: (value, got) => value === api.formatAmount(got[0], got[1]),
  count: (value, got) => Array.isArray(got[0]) && value === String(got[0].length),
  join: (value, got) => Array.isArray(got[0]) && value === got[0].map(String).join(", "),
  // A told line or a deadline joins several members of its entry; the entry's own text is in it.
  told: (value, got) => isObj(got[0]) && (typeof got[0].text !== "string" || value.text.includes(got[0].text)),
  deadline: (value, got) => isObj(got[0]) && (typeof got[0].text !== "string" || value.text.includes(got[0].text)),
  producer: (value, got) => Array.isArray(value) && value.every((p) => p === null || got.some((g) => isObj(g) && typeof g.version === "string" && p.includes(g.version))),
  producer_name: (value, got) => Array.isArray(value) && value.every((n) => n === null || got.some((g) => isObj(g) && g.name === n)),
  payload_digest: (value, got) => (got.length === 1 ? value === api.recordDigest(got[0]) : value === api.recordDigest(got[1]) || got[0] === api.recordDigest(got[1])),
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
  // Recomputed by the page over the copy's records or carried copies: each source must resolve.
  one_deal: () => true,
  settlement: () => true,
  after_yes: () => true,
  counterparty_openings: () => true,
});

/** Every problem with the sources in `model`: unresolved, disagreeing or of no known kind. */
export function sourceProblems(api, model, ins) {
  const derived = DERIVED(api);
  const problems = [];
  const check = (where, value, src, scope) => {
    if (!isObj(src)) return problems.push(`${where}: source is not an object`);
    if ("derived" in src) {
      if (!Object.prototype.hasOwnProperty.call(derived, src.derived)) return problems.push(`${where}: no derivation ${src.derived}`);
      const got = (src.from || []).map((f) => (isObj(f) && "bundle" in f && Object.keys(f).length === 1 ? pointer(scope.bundle, f.bundle) : resolve(f, scope)));
      // Only a sum may have no terms (a provider's receipt with no payment: 0 msat).
      if ((!src.from?.length && src.derived !== "provider_total") || got.some((g) => g === MISSING || g === undefined)) return problems.push(`${where}: a source of ${src.derived} does not resolve`);
      // A fact is compared by its text.
      const shown = isObj(value) && "name" in value && "kind" in value && "value" in value ? value.value : value;
      if (!derived[src.derived](shown, got)) problems.push(`${where}: ${JSON.stringify(shown)} is not ${src.derived} of what its sources hold`);
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
    } else if (isObj(value) || Array.isArray(value)) {
      if (Array.isArray(value) && Array.isArray(got) && value.every((x) => typeof x === "string") && JSON.stringify(value) !== JSON.stringify(got.filter((x) => typeof x === "string"))) problems.push(`${where}: list differs`);
      else if (!isObj(got) && !Array.isArray(got)) problems.push(`${where}: names no entry`);
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
  for (const k of ["settlement", "counterparty_named", "authority_sealed", "referee", "after_yes"]) need(r[k] === undefined || r.sources?.[k], `${where}.${k}`);
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
  });
  s.acceptances.forEach((a, i) => need(a.sources?.step, `${where}.acceptances[${i}].step`));
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
  async function* models() {
    for (const c of oracle.cases) {
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
        const ins = { bundle: context.bundle, verify: c.verify ?? readVerify(c.name), context, assurance: c.env.assurance, members };
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
});
