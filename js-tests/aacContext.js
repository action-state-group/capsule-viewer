// A stand-in for agent-action-capsule's VerifiedBundleContext (ts/src/bundle.ts,
// `buildVerifiedBundleContext`), for the History module's tests.
//
// AAC's own buildVerifiedBundleContext cannot be imported here: js-tests use no
// AAC package or checkout, and AAC's bundle.ts needs @action-state-group/cll.
// So this builds an object of the same shape (checked field by field against
// tests/testdata/aac-context/verified-bundle-context-shape.json, which is
// checked against the interface source when an AAC checkout is present), with
// verdicts from one of two sources:
//
// - `verify`: what `capsulectl verify --bundle` printed for these exact bytes
//   (tests/testdata/history/verify/<name>.json). Its graph_closure,
//   interval_coverage, per_record_membership, record_identity and disclosures
//   become the context's graphClosure, intervalCoverage, perRecordMembership,
//   capsuleResults and disclosures. A real verifier's verdicts, not this file's.
// - none (an in-memory edit): record identity, disclosure digests and graph
//   closure at the bundle's closure depth are recomputed here as verifyBundle
//   computes them; intervalCoverage and perRecordMembership cannot be (no MMR
//   here) and are ASSUMED to pass unless `claims` says otherwise. An in-memory
//   re-seal does not in fact verify against its checkpoint; tests that use an
//   assumed pass say so.
//
// Like verifyBundle, it checks no record signature: verifyClass1 leaves
// `signature` and `key_id` out of the capsule id and checks neither.
//
// One file for the History module's tests (#26) and the receipt modules' tests
// (#27). The receipt modules' tests add one thing: a composed/v1 block's
// verification (`extensions[].composed`, AAC's ComposedResult), read from
// capsulectl verify's report on the block (`aacComposed`). Both are checked
// against AAC's interface source: the context in js-tests/history_card.test.js,
// the composed/v1 verification in js-tests/aac_context.test.js.
import { createHash } from "node:crypto";

const EXCLUDED = new Set(["capsule_id", "signature", "key_id"]);
const HEX64 = /^[0-9a-f]{64}$/;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function jcs(v) {
  if (v === null || typeof v === "boolean" || typeof v === "number") return JSON.stringify(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(jcs).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(",")}}`;
}
const sha = (v) => createHash("sha256").update(Buffer.from(jcs(v), "utf8")).digest("hex");
const capsuleId = (r) => sha(Object.fromEntries(Object.entries(r).filter(([k]) => !EXCLUDED.has(k))));

const pass = () => ({ status: "pass", findings: [] });
const fail = (...findings) => ({ status: "fail", findings });
const fromReport = (c) => ({ status: c.status, findings: [...(c.findings || [])] });

function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v) && !(v instanceof Map)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

// bundle.ts `graph`, at the bundle's closure depth.
function graph(bundle, accepted, recordFindings) {
  const findings = [...recordFindings];
  if (bundle.bundle_version !== "2" || bundle.bundle_kind !== "evidence-bundle/v2") findings.push("bundle_version_or_kind_invalid");
  if (!HEX64.test(String(bundle.root)) || !accepted.has(bundle.root)) return fail(...findings, "root_not_supplied_with_matching_identity");
  const complete = bundle.completeness;
  if (!isObj(complete)) return fail(...findings, "completeness_malformed");
  const depth = complete.closure_depth ?? 2;
  let frontier = [bundle.root];
  for (let level = 0; level < depth; level += 1) {
    const next = [];
    for (const id of frontier) {
      const parent = accepted.get(id)?.chain?.parent_capsule_id;
      if (typeof parent === "string") {
        if (accepted.has(parent)) next.push(parent);
        else if (!(complete.missing || []).includes(parent)) findings.push(`citation_dangling:${parent}`);
      }
    }
    frontier = next;
  }
  return findings.length ? fail(...findings) : pass();
}

/**
 * capsulectl verify's report on a composed/v1 block (go/bundle/composed.go's
 * JSON), in agent-action-capsule's ComposedResult shape (ts/src/composed.ts):
 * the same results under the TypeScript member names. `block` is the block as
 * the bundle declares it (the observers are reported as declared).
 */
export function aacComposed(raw, block) {
  if (!isObj(raw.composed_digest)) return { status: "fail", malformed: true, findings: [...(raw.findings || [])] };
  const claim = (c) => ({ status: c?.status, findings: [...(c?.findings || [])] });
  return {
    status: raw.status,
    malformed: false,
    findings: [...(raw.findings || [])],
    composedDigest: { ...raw.composed_digest },
    members: (raw.members || []).map((m) => ({
      id: m.id,
      observer: m.observer,
      outcome: m.outcome,
      body: m.body,
      digest: m.digest,
      findings: [...(m.findings || [])],
      ...(isObj(m.bundle) ? { bundle: { graphClosure: claim(m.bundle.graph_closure), intervalCoverage: claim(m.bundle.interval_coverage), perRecordMembership: claim(m.bundle.per_record_membership) } } : {}),
      ...(isObj(m.refusal_signature) ? { refusalSignature: m.refusal_signature.status } : {}),
    })),
    observers: ((isObj(block) && block.observers) || []).map((o) => ({ id: o.id, role: o.role, custodyDomain: o.custody_domain })),
    compositionClosure: { ...raw.composition_closure },
    joins: (raw.joins || []).map((j) => ({ ...j })),
    corroboration: (raw.corroboration || []).map((c) => ({ ...c })),
  };
}

/** A VerifiedBundleContext-shaped object over `bundle` (see the file comment). */
export function standInContext(bundle, { verify, claims = {} } = {}) {
  const records = Array.isArray(bundle.records) ? bundle.records : [];
  const capsuleResults = {};
  const accepted = new Map();
  const recordFindings = [];
  for (const r of records) {
    if (!isObj(r) || typeof r.capsule_id !== "string") continue;
    const recomputed = capsuleId(r);
    const reported = verify ? verify.record_identity?.[r.capsule_id] === "passed" : true;
    const ok = recomputed === r.capsule_id && reported;
    capsuleResults[r.capsule_id] = { ok, findings: ok ? [] : [{ code: "capsule_id_mismatch", detail: "capsule_id does not recompute", severity: "error", check: 2 }], assurance: {}, capsuleId: recomputed };
    if (ok) accepted.set(r.capsule_id, r);
    else recordFindings.push(`record_identity_invalid:${r.capsule_id}`);
  }
  const overlay = isObj(bundle.disclosures) ? bundle.disclosures : {};
  const disclosures = verify
    ? (verify.disclosures || []).map((d) => ({ capsuleId: d.capsule_id, member: d.member, status: d.status }))
    : [...accepted.values()].map((r) => {
        const supplied = overlay[r.capsule_id];
        const committed = r.model_attestation?.compute_attestation?.agent_input_digest;
        const status = !isObj(supplied) || !("agent_input" in supplied) ? "withheld" : sha(supplied.agent_input) === committed ? "disclosure_match" : "disclosure_mismatch";
        return { capsuleId: r.capsule_id, member: "agent_input", status };
      });
  const status = new Map(disclosures.map((d) => [`${d.capsuleId}\u0000${d.member}`, d.status]));
  const resolve = (id, member) => {
    const s = status.get(`${id}\u0000${member}`);
    if (s === "disclosure_match") return { state: "disclosed", payload: overlay[id][member] };
    return s === "disclosure_mismatch" ? { state: "disclosure_mismatch" } : { state: "withheld" };
  };
  const evidence = isObj(bundle.checkpoint) && isObj(bundle.completeness_certificate);
  const absent = { status: "withheld", findings: ["completeness_evidence_absent"] };
  const graphClosure = verify ? fromReport(verify.graph_closure) : claims.graphClosure ?? graph(bundle, accepted, recordFindings);
  const intervalCoverage = verify ? fromReport(verify.interval_coverage) : claims.intervalCoverage ?? (evidence ? pass() : absent);
  const perRecordMembership = verify ? fromReport(verify.per_record_membership) : claims.perRecordMembership ?? (evidence ? pass() : absent);
  const verification = {
    graphClosure,
    intervalCoverage,
    perRecordMembership,
    disclosures,
    extensions: Object.keys(isObj(bundle.extensions) ? bundle.extensions : {}).sort().map((kind) => {
      const reported = verify ? (verify.extensions || []).find((e) => e.kind === kind) : undefined;
      const composed = kind === "composed/v1" && reported && isObj(reported.composed) ? { composed: aacComposed(reported.composed, bundle.extensions[kind]) } : {};
      // capsulectl verify's own check of a standalone report (capsule-cli#294) is the one result AAC's
      // verifier does not give for x-deal-v0; the receipt module reads it only when a runtime reports it.
      const standalone = kind === "x-deal-v0" && reported && reported.report === "standalone" ? { status: reported.status, report: "standalone" } : {};
      return { kind, status: "uninterpreted", integrityCovered: true, ...composed, ...standalone };
    }),
    countersignatures: [],
    capsuleResults,
  };
  const certificate = bundle.completeness_certificate;
  return deepFreeze({
    bundle,
    root: typeof bundle.root === "string" ? bundle.root : undefined,
    verification,
    resolvedDisclosures: new Map([...accepted.keys()].map((id) => [id, { agent_input: resolve(id, "agent_input"), agent_output: resolve(id, "agent_output") }])),
    records: [...accepted.values()],
    recordIndex: new Map(accepted),
    countersignatures: verification.countersignatures,
    countersigners: undefined,
    extensions: verification.extensions,
    completeness: {
      graphClosure,
      intervalCoverage,
      perRecordMembership,
      memberships: isObj(certificate) && isObj(certificate.memberships) ? certificate.memberships : {},
    },
  });
}

/**
 * The field names of `export interface <name>` in an AAC source file, as
 * declared (`readonly name:` or `readonly name?:`, the latter as "name?").
 * With `nested`, the fields of that member's inline object type.
 */
export function interfaceFields(source, name, nested) {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`export interface ${name} {`));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith("}"));
  let body = lines.slice(start + 1, end);
  let indent = "  ";
  if (nested) {
    const at = body.findIndex((l) => l.startsWith(`  readonly ${nested}: {`));
    const close = body.findIndex((l, i) => i > at && l.startsWith("  };"));
    body = body.slice(at + 1, close);
    indent = "    ";
  }
  const field = new RegExp(`^${indent}readonly (\\w+)(\\??):`);
  return body.map((l) => field.exec(l)).filter(Boolean).map((m) => m[1] + m[2]);
}

/**
 * The field names of `export type <name> =`, a union of inline object types,
 * in an AAC source file: every variant's fields in first-seen order, a name
 * ending in "?" where some variant declares it optional or lacks it.
 */
export function unionFields(source, name) {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`export type ${name} =`));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith("    };"));
  const variants = [];
  for (const line of lines.slice(start + 1, end + 1)) {
    if (line.startsWith("  | {")) variants.push(new Map());
    const m = /^ {6}readonly (\w+)(\??):/.exec(line);
    if (m && variants.length) variants[variants.length - 1].set(m[1], m[2] === "?");
  }
  const order = [];
  for (const v of variants) for (const k of v.keys()) if (!order.includes(k)) order.push(k);
  return order.map((k) => (variants.every((v) => v.has(k) && !v.get(k)) ? k : `${k}?`));
}

/**
 * The runtime's verification gate, ported from agent-action-capsule
 * ts/src/presentation-registry.ts `bundleVerified` (with
 * `membershipProvenOrUnbound`): resolution refuses a context where it does
 * not hold before any manifest is matched or any canRender is called
 * (`resolveModules`, step 1).
 */
export function aacBundleVerified(v) {
  const m = v.perRecordMembership;
  return (
    v.graphClosure.status === "pass" &&
    v.intervalCoverage.status === "pass" &&
    (m.status === "pass" || (m.status === "fail" && m.findings.length > 0 && m.findings.every((f) => f.startsWith("membership_record_unbound:")))) &&
    Object.values(v.capsuleResults).every((c) => c.ok) &&
    v.disclosures.every((d) => d.status === "disclosure_match" || d.status === "withheld")
  );
}

/** resolveModules (step 1) and renderEvidenceGraph, for one module: null when the gate refuses. */
export function runtimeRender(module, context, host) {
  if (!aacBundleVerified(context.verification)) return null;
  if (!module.canRender(context)) return { declined: true };
  const model = module.buildModel(context);
  module.render(model, host, {});
  return { model };
}
