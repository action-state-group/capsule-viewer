// SPDX-License-Identifier: Apache-2.0
//
// result_v0_panels.js -- the DATA side of two optional sections of the
// result/v0 card: "Coverage and gaps" and "Obligations". Pure functions over
// plain JSON; no DOM, no network, no canonicalization.
//
// Coverage comes from the Result's own optional `coverage_report`
// (coverage-report/v0: per requirement, the sources found, the independence
// of their producers, and each gap with the connector that would close it).
// The obligation view groups requirements by the `obligation_refs` each
// coverage row carries. Two inputs MAY travel beside the Result in the entry
// (see result_v0.py), and only add detail:
//
//   entry.contract  -- the Evidence Contract the claims were evaluated under:
//                      requirement statements and required sources, and the
//                      obligation_refs when the Result has no coverage_report
//   entry.register  -- the obligation register those refs cite, as JSON
//                      ({register_id, rows[]}): clause, source, version,
//                      effective dates
//
// Posture, same as the card's: the coverage report is RECOMPUTED where it
// can be (summary counts, sufficiency-from-status, claim_ids against the
// claims, source counts, independence) and every disagreement is listed as
// a diagnostic, never repaired. Nothing is defaulted, nothing is dropped. A
// missing input is named as missing. Counts only, never a ratio.
(function () {
  "use strict";

  if (typeof window === "undefined") {
    throw new Error("result_v0_panels.js: no window");
  }

  var VERDICTS = ["met", "not_met", "not_evaluable"];

  // The retired spelling of not_evaluable that results sealed before the
  // vocabulary settled may carry. Read as an alias so a sealed result still
  // renders under the one canonical spelling; the record itself is never
  // modified. "not_applicable" is deliberately absent: it names a requirement
  // excluded from the evaluated population and was never a verdict, so it is
  // passed through and refused as a defect, never counted as not_evaluable.
  // Shared with the card (result_v0_card.js), which loads after this module.
  var RETIRED_VERDICT_SPELLINGS = { insufficient_evidence: "not_evaluable" };

  function canonicalVerdict(verdict) {
    return Object.prototype.hasOwnProperty.call(RETIRED_VERDICT_SPELLINGS, verdict) ? RETIRED_VERDICT_SPELLINGS[verdict] : verdict;
  }

  // Which tier a source of a given epistemic type can support once it is
  // connected. The Result spec ties tier to the assurance ladder
  // (recomputed <=> Verifiable, judged <=> Attested). A deterministic check
  // can be recomputed over an observed event, a system-of-record fact or a
  // metric derived from them; a human report, a semantic judgment or an
  // adjudication is judged. A producer's own claim lifts nothing: it stays
  // self-attested whatever is connected. An obligation reference is the
  // clause itself, not evidence that it was met. Shown only when the
  // coverage row states the source's epistemic type -- never guessed.
  //
  // Keyed by the canonical tokens: lowercase, underscore-separated, exactly
  // as the Evidence Layer's closed set spells them
  // (agent-action-capsule schemas/vendor/epistemic-types.json).
  var RAISES_TO = {
    observed_event: { tier: "recomputed", assurance: "Verifiable" },
    system_of_record_fact: { tier: "recomputed", assurance: "Verifiable" },
    derived_metric: { tier: "recomputed", assurance: "Verifiable" },
    human_report: { tier: "judged", assurance: "Attested" },
    semantic_judgment: { tier: "judged", assurance: "Attested" },
    adjudication: { tier: "judged", assurance: "Attested" },
    producer_claim: { tier: null, assurance: "self-attested only" },
    obligation_reference: { tier: null, assurance: "not evidence of performance" },
  };

  // Documents from other tools may still spell a value in uppercase
  // (OBSERVED_EVENT): the reader folds it to the canonical lowercase token
  // for lookup and treats it as recognized. A value that is not in the set
  // in any case is kept exactly as written and reported as unrecognized --
  // never dropped, never relabelled.
  function epistemicTypeOf(value) {
    if (!isNonEmptyString(value)) return null;
    var canonical = value.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(RAISES_TO, canonical)) {
      return { value: canonical, as_written: value, recognized: true, legacy_case: canonical !== value };
    }
    return { value: value, as_written: value, recognized: false, legacy_case: false };
  }

  // coverage-report/v0's fixed status -> sufficiency mapping.
  var STATUS_TO_SUFFICIENCY = { SATISFIED: "SATISFIED", NOT_FOUND: "GAP", INSUFFICIENT: "INSUFFICIENT", UNKNOWN: "UNKNOWN" };

  // WITHHELD means the evidence exists and its holder did not disclose it:
  // connecting another source does not fix that, a disclosure does.
  var DISCLOSURE_GAP = { WITHHELD: 1 };

  function isObject(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
  }

  function arr(v) {
    return Array.isArray(v) ? v : [];
  }

  function contractRefOf(contract) {
    if (!isObject(contract) || !isNonEmptyString(contract.id) || !isNonEmptyString(contract.version)) return null;
    return contract.id + "@" + contract.version;
  }

  function emptyCounts() {
    return { met: 0, not_met: 0, not_evaluable: 0 };
  }

  function raisesTo(epistemicType) {
    var t = epistemicTypeOf(epistemicType);
    return t && t.recognized ? RAISES_TO[t.value] : { tier: null, assurance: "unknown epistemic type" };
  }

  function claimsById(result) {
    var out = {};
    arr(isObject(result) ? result.claims : null).forEach(function (c) {
      if (isObject(c) && isNonEmptyString(c.id) && !out[c.id]) out[c.id] = c;
    });
    return out;
  }

  // Claims that can be joined to a requirement: an object with a string
  // requirement_ref and a known verdict, under `contractRef`. Anything else
  // is the card's to refuse; here it is listed, never silently skipped.
  function partitionClaims(result, contractRef) {
    var byRequirement = {};
    var foreign = [];
    var unjoinable = [];
    arr(isObject(result) ? result.claims : null).forEach(function (sealed) {
      var verdict = isObject(sealed) ? canonicalVerdict(sealed.verdict) : undefined;
      // A copy, never an edit: the sealed claim keeps its own spelling.
      var claim = isObject(sealed) && verdict !== sealed.verdict ? Object.assign({}, sealed, { verdict: verdict }) : sealed;
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

  function contractRequirements(contract) {
    var out = {};
    arr(isObject(contract) ? contract.requirements : null).forEach(function (r) {
      if (isObject(r) && isNonEmptyString(r.id) && !out[r.id]) out[r.id] = r;
    });
    return out;
  }

  function countVerdicts(claims) {
    var counts = emptyCounts();
    claims.forEach(function (c) { counts[c.verdict] += 1; });
    return counts;
  }

  // The coverage report's cross-element checks (the engine's
  // verify_coverage_report), collected rather than raised: every
  // disagreement is one diagnostic line, and the report is still shown.
  function coverageDiagnostics(report, byId) {
    var diags = [];
    var contractRef = report.contract_ref;
    var rows = arr(report.requirements);
    var expected = { requirements: rows.length, satisfied: 0, with_gaps: 0, gaps: 0, gaps_without_remedy: 0 };
    rows.forEach(function (row, i) {
      if (!isObject(row)) {
        diags.push("coverage_report.requirements[" + i + "] is not an object");
        return;
      }
      var ref = JSON.stringify(row.requirement_ref);
      if (!(row.status in STATUS_TO_SUFFICIENCY)) {
        diags.push("requirement " + ref + " status " + JSON.stringify(row.status) + " is not a coverage status");
      } else if (row.sufficiency !== STATUS_TO_SUFFICIENCY[row.status]) {
        diags.push("requirement " + ref + " status " + row.status + " requires sufficiency " + STATUS_TO_SUFFICIENCY[row.status] + ", got " + JSON.stringify(row.sufficiency));
      }
      arr(row.claim_ids).forEach(function (id) {
        var c = byId[id];
        if (!c) diags.push("requirement " + ref + " names claim " + JSON.stringify(id) + ", which has no claim");
        else if (c.requirement_ref !== row.requirement_ref || c.contract_ref !== contractRef) {
          diags.push("claim " + JSON.stringify(id) + " is for " + c.contract_ref + "/" + c.requirement_ref + ", not " + contractRef + "/" + row.requirement_ref);
        }
      });
      var distinct = {};
      arr(row.sources).forEach(function (src) {
        if (!isObject(src)) return;
        var name = ref + " source " + JSON.stringify(src.source);
        if ((src.contemporaneous_count || 0) + (src.backfilled_count || 0) !== src.record_count) {
          diags.push("requirement " + name + ": contemporaneous + backfilled != record_count");
        }
        if (arr(src.evidence).length !== src.record_count) diags.push("requirement " + name + ": evidence digests != record_count");
        if ((src.status === "NOT_FOUND") !== (src.record_count === 0)) {
          diags.push("requirement " + name + ": NOT_FOUND exactly when record_count is 0");
        }
        arr(src.evidence).forEach(function (e) { if (isObject(e)) distinct[e.digest] = 1; });
      });
      var ind = isObject(row.independence) ? row.independence : {};
      var nDistinct = Object.keys(distinct).length;
      if ((ind.independent_producers || 0) + (ind.correlated_records || 0) !== nDistinct) {
        diags.push("requirement " + ref + ": independent_producers + correlated_records != " + nDistinct + " distinct records");
      }
      var required = typeof ind.required_producers === "number" ? ind.required_producers : 1;
      if (ind.met !== ((ind.independent_producers || 0) >= required)) {
        diags.push("requirement " + ref + ": independence.met disagrees with its producer counts");
      }
      var gaps = arr(row.gaps);
      if (row.status === "SATISFIED" && (gaps.length || !ind.met)) {
        diags.push("requirement " + ref + " is SATISFIED but has gaps or unmet independence");
      }
      expected.gaps += gaps.length;
      expected.gaps_without_remedy += gaps.filter(function (g) { return !isObject(g) || g.remedy === null || g.remedy === undefined; }).length;
      expected.satisfied += row.status === "SATISFIED" ? 1 : 0;
      expected.with_gaps += gaps.length ? 1 : 0;
    });
    var stated = isObject(report.summary) ? report.summary : {};
    Object.keys(expected).forEach(function (k) {
      if (stated[k] !== expected[k]) {
        diags.push("summary." + k + " is " + JSON.stringify(stated[k]) + " but recomputes to " + expected[k]);
      }
    });
    return { diagnostics: diags, summary: expected };
  }

  // One recommendation per gap, in the report's order. The remedy is the
  // report's, shown as stated (connector + the assurance mode it raises
  // the source to); `tier` is added only when the source row states its
  // epistemic type. A gap with no remedy is kept and says so.
  function gapRecommendations(row, rowClaims) {
    var sourceTypes = {};
    arr(row.sources).forEach(function (s) {
      if (isObject(s) && isNonEmptyString(s.source) && isNonEmptyString(s.epistemic_type)) sourceTypes[s.source] = s.epistemic_type;
    });
    var notEvaluable = rowClaims.filter(function (c) { return c.verdict === "not_evaluable"; });
    var recs = [];
    var withheld = notEvaluable.filter(function (c) { return isObject(c.presentation) && DISCLOSURE_GAP[c.presentation.status]; });
    if (withheld.length) {
      recs.push({
        kind: "disclosure",
        source: null,
        detail: "the evidence exists but was withheld by its holder; a disclosure, not a new source, closes this gap",
        remedy: null,
        tier: null,
        claims: withheld.map(function (c) { return c.id; }),
      });
    }
    arr(row.gaps).forEach(function (g) {
      if (!isObject(g)) return;
      var type = isNonEmptyString(g.source) ? sourceTypes[g.source] : undefined;
      recs.push({
        kind: g.kind,
        source: isNonEmptyString(g.source) ? g.source : null,
        detail: isNonEmptyString(g.detail) ? g.detail : null,
        remedy: isObject(g.remedy) ? { connector: g.remedy.connector, raises_to: g.remedy.raises_to } : null,
        tier: type ? raisesTo(type) : null,
        claims: notEvaluable.map(function (c) { return c.id; }),
      });
    });
    return recs;
  }

  // Coverage and gaps: per requirement, its claim counts, the sources found
  // and their producers' independence, and what would close each gap.
  function coverageGaps(result, contract) {
    var report = isObject(result) && isObject(result.coverage_report) ? result.coverage_report : null;
    var out = {
      contract_ref: null,
      summary: null,
      requirements: [],
      foreign_claims: [],
      unjoinable_claims: [],
      diagnostics: [],
      issues: [],
    };
    var reqs = contractRequirements(contract);
    if (!report) {
      out.issues.push("the Result carries no coverage_report -- which sources were found and what closes each gap is not known");
      return out;
    }
    out.contract_ref = isNonEmptyString(report.contract_ref) ? report.contract_ref : null;
    if (report.spec_version !== "coverage-report/v0") {
      out.issues.push("coverage_report.spec_version is " + JSON.stringify(report.spec_version) + ", not \"coverage-report/v0\"");
    }
    var contractRef = contractRefOf(contract);
    if (contract !== undefined && contract !== null && contractRef !== out.contract_ref) {
      out.issues.push("the supplied contract is " + JSON.stringify(contractRef) + ", not the coverage report's " + JSON.stringify(out.contract_ref) + " -- its statements and sources are not used");
      reqs = {};
    } else if (!contractRef) {
      out.issues.push("no contract supplied -- requirement statements are not shown");
    }
    var byId = claimsById(result);
    var checked = coverageDiagnostics(report, byId);
    out.diagnostics = checked.diagnostics;
    out.summary = { stated: isObject(report.summary) ? report.summary : null, recomputed: checked.summary };
    var parts = partitionClaims(result, out.contract_ref);
    out.foreign_claims = parts.foreign;
    out.unjoinable_claims = parts.unjoinable;
    var covered = {};
    arr(report.requirements).forEach(function (row) {
      if (!isObject(row) || !isNonEmptyString(row.requirement_ref)) return;
      covered[row.requirement_ref] = 1;
      var rowClaims = parts.byRequirement[row.requirement_ref] || [];
      var req = reqs[row.requirement_ref];
      out.requirements.push({
        requirement_ref: row.requirement_ref,
        statement: req && isNonEmptyString(req.statement) ? req.statement : null,
        status: row.status,
        sufficiency: row.sufficiency,
        counts: countVerdicts(rowClaims),
        sources: arr(row.sources).filter(isObject).map(function (s) {
          return {
            source: s.source,
            status: s.status,
            record_count: s.record_count,
            contemporaneous_count: s.contemporaneous_count,
            backfilled_count: s.backfilled_count,
            producer_count: s.producer_count,
            // The canonical lowercase token when recognized (an uppercase
            // legacy spelling is folded); otherwise the value as written.
            epistemic_type: isNonEmptyString(s.epistemic_type) ? epistemicTypeOf(s.epistemic_type).value : null,
            epistemic_type_as_written: isNonEmptyString(s.epistemic_type) ? s.epistemic_type : null,
            epistemic_type_recognized: isNonEmptyString(s.epistemic_type) ? epistemicTypeOf(s.epistemic_type).recognized : null,
          };
        }),
        // Records from one producer correlate; only distinct producers corroborate.
        independence: isObject(row.independence)
          ? {
              required_producers: row.independence.required_producers,
              independent_producers: row.independence.independent_producers,
              correlated_records: row.independence.correlated_records,
              met: row.independence.met,
            }
          : null,
        recommendations: gapRecommendations(row, rowClaims),
      });
    });
    Object.keys(parts.byRequirement).forEach(function (ref) {
      if (!covered[ref]) out.issues.push("claims cite requirement " + JSON.stringify(ref) + ", which has no coverage row");
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

  function uniqueStrings(list) {
    var out = [];
    arr(list).forEach(function (k) { if (isNonEmptyString(k) && out.indexOf(k) === -1) out.push(k); });
    return out;
  }

  // Obligations: clause -> requirement -> established status. The
  // requirement list and each requirement's obligation_refs come from the
  // coverage report when the Result carries one, otherwise from the
  // contract (obligation_refs, plus an inline clause_ref). One group per
  // cited obligation, in first-cited order; a requirement citing two appears
  // under both; requirements citing none go under `unmapped`.
  function obligationTree(result, contract, register) {
    var report = isObject(result) && isObject(result.coverage_report) ? result.coverage_report : null;
    var out = {
      contract_ref: null,
      refs_from: null,
      obligations: [],
      unmapped: [],
      foreign_claims: [],
      unjoinable_claims: [],
      issues: [],
    };
    var reqs = contractRequirements(contract);
    var list = [];
    if (report) {
      out.contract_ref = isNonEmptyString(report.contract_ref) ? report.contract_ref : null;
      out.refs_from = "coverage_report";
      arr(report.requirements).forEach(function (row) {
        if (isObject(row) && isNonEmptyString(row.requirement_ref)) {
          list.push({ id: row.requirement_ref, keys: uniqueStrings(row.obligation_refs) });
        }
      });
    } else if (contractRefOf(contract)) {
      out.contract_ref = contractRefOf(contract);
      out.refs_from = "contract";
      Object.keys(reqs).forEach(function (id) {
        var r = reqs[id];
        list.push({ id: id, keys: uniqueStrings(arr(r.obligation_refs).concat(isNonEmptyString(r.clause_ref) ? [r.clause_ref] : [])) });
      });
    } else {
      out.issues.push("neither a coverage_report nor a contract -- obligations cannot be traced");
      return out;
    }
    var reg = indexRegister(register);
    out.issues = out.issues.concat(reg.issues);
    if (reg.rows === null && !reg.issues.length) {
      out.issues.push("no register input -- clause text, source and effective dates are not shown");
    }
    var contractRef = contractRefOf(contract);
    if (contractRef && contractRef !== out.contract_ref) {
      out.issues.push("the supplied contract is " + JSON.stringify(contractRef) + ", not " + JSON.stringify(out.contract_ref) + " -- its statements are not used");
      reqs = {};
    }
    var parts = partitionClaims(result, out.contract_ref);
    out.foreign_claims = parts.foreign;
    out.unjoinable_claims = parts.unjoinable;
    var groups = {};
    var order = [];
    list.forEach(function (item) {
      var claims = parts.byRequirement[item.id] || [];
      var counts = countVerdicts(claims);
      var req = reqs[item.id];
      var node = {
        requirement_ref: item.id,
        statement: req && isNonEmptyString(req.statement) ? req.statement : null,
        counts: counts,
        claims: claims.map(function (c) {
          return { id: c.id, verdict: c.verdict, sufficiency: c.sufficiency, tier: c.tier, grade: c.grade };
        }),
      };
      if (!item.keys.length) {
        out.unmapped.push(node);
        return;
      }
      item.keys.forEach(function (key) {
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
    canonicalVerdict: canonicalVerdict,
    coverageGaps: coverageGaps,
    obligationTree: obligationTree,
    raisesTo: raisesTo,
    epistemicTypeOf: epistemicTypeOf,
    RAISES_TO: JSON.parse(JSON.stringify(RAISES_TO)),
  };
})();
