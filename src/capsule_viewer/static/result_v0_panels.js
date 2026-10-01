// SPDX-License-Identifier: Apache-2.0
//
// result_v0_panels.js -- the DATA side of two optional sections of the
// result/v0 card: "Coverage and gaps" and "Obligations". Pure functions over
// plain JSON; no DOM, no network, no canonicalization.
//
// A Result v0 document alone cannot answer either question: it names a
// requirement by `requirement_ref` and a contract by `contract_ref`, but not
// what sources the requirement needs or which clause it implements. Both
// answers come from inputs an entry may carry BESIDE the Result, the same
// way it already carries `records` for close claims (see result_v0.py):
//
//   entry.contract  -- the Evidence Contract the claims were evaluated under
//                      (capsule-engine schemas/evidence-contract-v0.json)
//   entry.register  -- the obligation register its obligation_refs cite,
//                      as JSON ({register_id, rows[]})
//   entry.coverage  -- per-requirement source coverage
//                      ({coverage_version: "v0", contract_ref, requirements[]})
//
// Posture, same as the card's: nothing is defaulted, nothing is dropped.
// A claim whose contract_ref is not this contract is listed as foreign,
// never joined. A requirement with no obligation reference lands in its own
// "unmapped" group. A missing input is named as missing; the functions say
// what they could not establish rather than guessing it. Counts only, never
// a ratio or percentage.
(function () {
  "use strict";

  if (typeof window === "undefined") {
    throw new Error("result_v0_panels.js: no window");
  }

  var VERDICTS = ["met", "not_met", "not_evaluable"];

  // Which tier a source of a given epistemic type can support once it is
  // connected. The Result spec ties tier to the assurance ladder
  // (recomputed <=> Verifiable, judged <=> Attested). A deterministic check
  // can be recomputed over an observed event, a system-of-record fact or a
  // metric derived from them; a human report, a semantic judgment or an
  // adjudication is judged. A producer's own claim lifts nothing: it stays
  // self-attested whatever is connected. An obligation reference is the
  // clause itself, not evidence that it was met.
  var RAISES_TO = {
    OBSERVED_EVENT: { tier: "recomputed", assurance: "Verifiable" },
    SYSTEM_OF_RECORD_FACT: { tier: "recomputed", assurance: "Verifiable" },
    DERIVED_METRIC: { tier: "recomputed", assurance: "Verifiable" },
    HUMAN_REPORT: { tier: "judged", assurance: "Attested" },
    SEMANTIC_JUDGMENT: { tier: "judged", assurance: "Attested" },
    ADJUDICATION: { tier: "judged", assurance: "Attested" },
    PRODUCER_CLAIM: { tier: null, assurance: "self-attested only" },
    OBLIGATION_REFERENCE: { tier: null, assurance: "not evidence of performance" },
  };
  var TIER_RANK = { recomputed: 2, judged: 1 };

  // Why a not_evaluable claim is not evaluable decides what closes it.
  // WITHHELD means the evidence exists and its holder did not disclose it:
  // connecting another source does not fix that, a disclosure does.
  var DISCLOSURE_GAP = { WITHHELD: 1 };

  function isObject(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
  }

  function contractRefOf(contract) {
    if (!isObject(contract) || !isNonEmptyString(contract.id) || !isNonEmptyString(contract.version)) return null;
    return contract.id + "@" + contract.version;
  }

  function emptyCounts() {
    return { met: 0, not_met: 0, not_evaluable: 0 };
  }

  function raisesTo(epistemicType) {
    return RAISES_TO[epistemicType] || { tier: null, assurance: "unknown epistemic type" };
  }

  // The best tier any of the accepted types could support, or null.
  function bestRaise(types) {
    var best = null;
    (types || []).forEach(function (t) {
      var r = raisesTo(t);
      if (r.tier && (!best || TIER_RANK[r.tier] > TIER_RANK[best.tier])) best = r;
    });
    return best;
  }

  // Claims that can be joined to a requirement: an object with a string
  // requirement_ref and a known verdict. Anything else is the card's to
  // refuse; here it is counted as unjoinable, never silently skipped.
  function partitionClaims(result, contractRef) {
    var claims = isObject(result) && Array.isArray(result.claims) ? result.claims : [];
    var byRequirement = {};
    var foreign = [];
    var unjoinable = [];
    claims.forEach(function (claim) {
      if (!isObject(claim) || !isNonEmptyString(claim.requirement_ref) || VERDICTS.indexOf(claim.verdict) === -1) {
        unjoinable.push(isObject(claim) && isNonEmptyString(claim.id) ? claim.id : "(claim without id)");
        return;
      }
      if (contractRef && claim.contract_ref !== contractRef) {
        foreign.push({ id: claim.id, contract_ref: claim.contract_ref });
        return;
      }
      (byRequirement[claim.requirement_ref] = byRequirement[claim.requirement_ref] || []).push(claim);
    });
    return { byRequirement: byRequirement, foreign: foreign, unjoinable: unjoinable };
  }

  function requirementsOf(contract) {
    return isObject(contract) && Array.isArray(contract.requirements)
      ? contract.requirements.filter(function (r) { return isObject(r) && isNonEmptyString(r.id); })
      : [];
  }

  function indexCoverage(coverage, contractRef) {
    var issues = [];
    var byRequirement = {};
    if (coverage === undefined || coverage === null) return { byRequirement: null, issues: issues };
    if (!isObject(coverage) || !Array.isArray(coverage.requirements)) {
      issues.push("coverage input is not {coverage_version, contract_ref, requirements[]}");
      return { byRequirement: null, issues: issues };
    }
    if (coverage.coverage_version !== "v0") issues.push("coverage_version is not \"v0\"");
    if (contractRef && coverage.contract_ref !== contractRef) {
      issues.push("coverage is for " + JSON.stringify(coverage.contract_ref) + ", not " + contractRef + " -- not used");
      return { byRequirement: null, issues: issues };
    }
    coverage.requirements.forEach(function (row, i) {
      if (!isObject(row) || !isNonEmptyString(row.requirement_ref) || !Array.isArray(row.sources)) {
        issues.push("coverage.requirements[" + i + "] has no requirement_ref or sources[]");
        return;
      }
      byRequirement[row.requirement_ref] = row;
    });
    return { byRequirement: byRequirement, issues: issues };
  }

  // Corroboration as stated by the coverage input. Spans from one producer
  // agree with each other because they share a source: correlation, never
  // corroboration. Only independent producers count toward corroboration.
  function corroborationOf(row) {
    var c = row && isObject(row.corroboration) ? row.corroboration : null;
    if (!c) return null;
    return {
      independent_producers: typeof c.independent_producers === "number" ? c.independent_producers : null,
      same_producer_spans: typeof c.same_producer_spans === "number" ? c.same_producer_spans : null,
      corroborated: typeof c.independent_producers === "number" && c.independent_producers >= 2,
    };
  }

  function gapRecommendations(requirement, claims, coverageRow) {
    var gapClaims = claims.filter(function (c) { return c.verdict === "not_evaluable"; });
    if (!gapClaims.length) return [];
    var withheld = [];
    var missing = [];
    gapClaims.forEach(function (c) {
      var status = isObject(c.presentation) ? c.presentation.status : undefined;
      if (DISCLOSURE_GAP[status]) withheld.push(c.id);
      else missing.push(c.id);
    });
    var recs = [];
    if (withheld.length) {
      recs.push({
        kind: "disclosure",
        claims: withheld,
        action: "the evidence exists but was withheld by its holder; a disclosure, not a new source, closes this gap",
        raises_to: null,
      });
    }
    if (!missing.length) return recs;
    var er = isObject(requirement.evidence_requirements) ? requirement.evidence_requirements : {};
    if (coverageRow) {
      var sourceTypes = {};
      coverageRow.sources.forEach(function (s) {
        if (isObject(s) && isNonEmptyString(s.source)) sourceTypes[s.source] = s.epistemic_type;
      });
      var missingSources = Array.isArray(coverageRow.missing_sources)
        ? coverageRow.missing_sources
        : coverageRow.sources.filter(function (s) { return isObject(s) && s.present === false; }).map(function (s) { return s.source; });
      if (!missingSources.length) {
        recs.push({
          kind: "unexplained",
          claims: missing,
          action: "every required source is reported present; the gap is not a missing source -- review the claims",
          raises_to: null,
        });
      }
      missingSources.forEach(function (source) {
        var type = sourceTypes[source];
        recs.push({
          kind: "instrument",
          source: source,
          epistemic_type: type || null,
          claims: missing,
          action: "connect " + source,
          raises_to: type ? raisesTo(type) : null,
        });
      });
    } else {
      recs.push({
        kind: "instrument-candidates",
        sources: Array.isArray(er.required_sources) ? er.required_sources.slice() : [],
        claims: missing,
        action: "the contract requires these sources; which of them is missing is not known without a coverage input",
        raises_to: bestRaise(er.accepted_epistemic_types),
      });
    }
    return recs;
  }

  // Coverage and gaps: per requirement, its claim counts, its source coverage when
  // known, and what would move its not_evaluable claims out of that bucket.
  function coverageGaps(result, contract, coverage) {
    var contractRef = contractRefOf(contract);
    var out = { contract_ref: contractRef, requirements: [], foreign_claims: [], unjoinable_claims: [], issues: [] };
    if (!contractRef) {
      out.issues.push("no contract supplied (or it has no id/version) -- requirements and their sources are unknown");
      return out;
    }
    var parts = partitionClaims(result, contractRef);
    var cov = indexCoverage(coverage, contractRef);
    out.foreign_claims = parts.foreign;
    out.unjoinable_claims = parts.unjoinable;
    out.issues = cov.issues.slice();
    if (cov.byRequirement === null && !cov.issues.length) {
      out.issues.push("no coverage input -- present and missing sources are not known");
    }
    var known = {};
    requirementsOf(contract).forEach(function (req) {
      known[req.id] = 1;
      var claims = parts.byRequirement[req.id] || [];
      var counts = emptyCounts();
      claims.forEach(function (c) { counts[c.verdict] += 1; });
      var covRow = cov.byRequirement ? cov.byRequirement[req.id] || null : null;
      var er = isObject(req.evidence_requirements) ? req.evidence_requirements : {};
      out.requirements.push({
        requirement_ref: req.id,
        statement: isNonEmptyString(req.statement) ? req.statement : null,
        counts: counts,
        required_sources: Array.isArray(er.required_sources) ? er.required_sources.slice() : [],
        sources: covRow ? covRow.sources.slice() : null,
        corroboration: corroborationOf(covRow),
        recommendations: gapRecommendations(req, claims, covRow),
      });
    });
    Object.keys(parts.byRequirement).forEach(function (ref) {
      if (!known[ref]) {
        out.issues.push("claims cite requirement " + JSON.stringify(ref) + ", which the contract does not define");
        parts.byRequirement[ref].forEach(function (c) { out.unjoinable_claims.push(c.id); });
      }
    });
    return out;
  }

  function indexRegister(register) {
    var rows = {};
    var issues = [];
    if (register === undefined || register === null) return { rows: null, issues: issues };
    if (!isObject(register) || !Array.isArray(register.rows)) {
      issues.push("register input is not {register_id, rows[]}");
      return { rows: null, issues: issues };
    }
    register.rows.forEach(function (row, i) {
      if (!isObject(row) || !isNonEmptyString(row.id)) {
        issues.push("register.rows[" + i + "] has no id");
        return;
      }
      if (rows[row.id]) issues.push("register row id " + JSON.stringify(row.id) + " appears twice -- the first is used");
      else rows[row.id] = row;
    });
    return { rows: rows, issues: issues };
  }

  // The register-row fields the obligation view shows beside a clause.
  function rowSummary(row) {
    var clause = isObject(row.clause) ? row.clause : {};
    return {
      statement: row.statement || null,
      source: row.source || null,
      owner: row.owner || null,
      version: row.version || null,
      effective_from: row.effective_from || null,
      effective_until: row.effective_until || null,
      clause: {
        instrument: clause.instrument || null,
        article: clause.article || null,
        paragraph: clause.paragraph || null,
        jurisdiction: clause.jurisdiction || null,
        effective_from: clause.effective_from || null,
      },
    };
  }

  // The obligation keys a requirement cites: its obligation_refs, plus a
  // clause_ref when the requirement is an obligation-profile requirement
  // carrying its citation inline.
  function obligationKeys(req) {
    var keys = [];
    if (Array.isArray(req.obligation_refs)) {
      req.obligation_refs.forEach(function (k) { if (isNonEmptyString(k) && keys.indexOf(k) === -1) keys.push(k); });
    }
    if (isNonEmptyString(req.clause_ref) && keys.indexOf(req.clause_ref) === -1) keys.push(req.clause_ref);
    return keys;
  }

  // Obligations: clause -> requirement -> established status. One group per
  // obligation key the contract cites, in first-cited order; a requirement
  // citing two obligations appears under both; requirements citing none go
  // under `unmapped`.
  function obligationTree(result, contract, register) {
    var contractRef = contractRefOf(contract);
    var out = { contract_ref: contractRef, obligations: [], unmapped: [], foreign_claims: [], unjoinable_claims: [], issues: [] };
    if (!contractRef) {
      out.issues.push("no contract supplied (or it has no id/version) -- obligations cannot be traced");
      return out;
    }
    var parts = partitionClaims(result, contractRef);
    var reg = indexRegister(register);
    out.foreign_claims = parts.foreign;
    out.unjoinable_claims = parts.unjoinable;
    out.issues = reg.issues.slice();
    if (reg.rows === null && !reg.issues.length) {
      out.issues.push("no register input -- clause text, source and effective dates are not shown");
    }
    var groups = {};
    var order = [];
    requirementsOf(contract).forEach(function (req) {
      var claims = parts.byRequirement[req.id] || [];
      var counts = emptyCounts();
      claims.forEach(function (c) { counts[c.verdict] += 1; });
      var node = {
        requirement_ref: req.id,
        statement: isNonEmptyString(req.statement) ? req.statement : null,
        counts: counts,
        claims: claims.map(function (c) {
          return { id: c.id, verdict: c.verdict, sufficiency: c.sufficiency, tier: c.tier, grade: c.grade };
        }),
      };
      var keys = obligationKeys(req);
      if (!keys.length) {
        out.unmapped.push(node);
        return;
      }
      keys.forEach(function (key) {
        if (!groups[key]) {
          var row = reg.rows ? reg.rows[key] : undefined;
          groups[key] = {
            obligation_ref: key,
            register_row: row ? rowSummary(row) : null,
            register_status: reg.rows === null ? "no register supplied" : row ? "found" : "not in the supplied register",
            counts: emptyCounts(),
            requirements: [],
          };
          order.push(key);
        }
        var g = groups[key];
        g.requirements.push(node);
        VERDICTS.forEach(function (v) { g.counts[v] += counts[v]; });
      });
    });
    out.obligations = order.map(function (k) { return groups[k]; });
    return out;
  }

  window.CapsuleViewerResultPanels = {
    coverageGaps: coverageGaps,
    obligationTree: obligationTree,
    raisesTo: raisesTo,
    RAISES_TO: JSON.parse(JSON.stringify(RAISES_TO)),
  };
})();
