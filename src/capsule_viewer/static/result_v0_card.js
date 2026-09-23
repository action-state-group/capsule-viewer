// SPDX-License-Identifier: Apache-2.0
//
// result_v0_card.js -- the Evidence Result v0 DOMAIN MODULE
// (agent-action-capsule spec/evidence-result-v0.md +
// schemas/evidence-result-v0.json). Plugs into the base viewer
// (capsule_viewer.js) on the registry seam under kind "result/v0".
//
// A Result v0 document is not a sealed capsule: it has no capsule_id, so the
// base's per-entry recompute chip reads "id not recomputable" for it (by
// design -- see capsule_viewer.js's renderEntry). The meaningful integrity
// check for THIS kind is different and belongs here: every number in
// aggregate.coverage and every id in aggregate.buckets is supposed to trace
// back to the claims array (spec section 1's traceability rule, and section
// 4's normative "a conforming verifier MUST check" cross-element
// constraints plain JSON Schema cannot express). This module RECOMPUTES
// coverage/buckets from claims[] and visibly flags any disagreement --
// exactly the same "recomputed value disagrees with the stated row" pattern
// the base uses for capsule_id, applied to this kind's own data shape.
//
// This module owns NO canonicalization and reads NO digest bytes -- a
// claim's evidence/proofs are refs only (nothing here to hash against; the
// bytes live elsewhere, resolved by digest against the evidence's own
// disclosure record). All of this module's checks are structural/
// traceability checks over the document's own claims array, never a
// capsule_id-style cryptographic recompute.
(function () {
  "use strict";

  if (typeof window === "undefined" || !window.CapsuleViewer) {
    throw new Error("result_v0_card.js: base CapsuleViewer not loaded");
  }

  var VALID_TIERS = ["recomputed", "judged"];
  var VALID_GRADES = ["self-attested", "witnessed", "countersigned"];
  var VALID_SUFFICIENCY = ["SATISFIED", "GAP", "INSUFFICIENT", "UNKNOWN"];
  var VALID_VERDICTS = ["met", "not_met", "not_evaluable"];
  var BUCKET_KEYS = ["met", "not_met", "not_evaluable"];
  var WITHHELD_LIKE = { WITHHELD: 1, NOT_COMMITTED: 1 };

  function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
  }

  function isDigestRefArray(v) {
    return (
      Array.isArray(v) &&
      v.every(function (r) {
        return r && r.digest_alg === "SHA-256" && isNonEmptyString(r.digest);
      })
    );
  }

  // <contract_id>@<version> -- exactly one '@', both sides non-empty. Never
  // re-implements the schema's regex intent beyond what rendering needs.
  function parseContractRef(ref) {
    if (!isNonEmptyString(ref)) return null;
    var parts = ref.split("@");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return { id: parts[0], version: parts[1] };
  }

  // Every reason a claim fails to render as a normal row. Never silently
  // fixed up, defaulted, or dropped -- a claim that fails ANY of these
  // becomes a visible refusal row instead (see renderClaimRefusal).
  function claimIssues(claim) {
    var issues = [];
    if (!claim || typeof claim !== "object") return ["claim is not an object"];
    if (!isNonEmptyString(claim.id)) issues.push("missing or empty id");
    if (!parseContractRef(claim.contract_ref)) issues.push("missing or malformed contract_ref (expected <id>@<version>)");
    if (!isNonEmptyString(claim.requirement_ref)) issues.push("missing or empty requirement_ref");
    if (VALID_TIERS.indexOf(claim.tier) === -1) {
      issues.push("missing or invalid tier (must be \"recomputed\" or \"judged\")");
    }
    if (VALID_GRADES.indexOf(claim.grade) === -1) {
      issues.push("missing or invalid grade (must be self-attested / witnessed / countersigned)");
    }
    if (VALID_SUFFICIENCY.indexOf(claim.sufficiency) === -1) issues.push("missing or invalid sufficiency");
    if (VALID_VERDICTS.indexOf(claim.verdict) === -1) issues.push("missing or invalid verdict");
    if (!isDigestRefArray(claim.evidence)) issues.push("evidence[] missing or not all digest-refs");
    if (!Array.isArray(claim.proofs)) issues.push("proofs[] missing");
    // The binding rule (spec section 1): verdict met/not_met only when
    // sufficiency is SATISFIED; otherwise verdict must be not_evaluable.
    if (VALID_SUFFICIENCY.indexOf(claim.sufficiency) !== -1 && VALID_VERDICTS.indexOf(claim.verdict) !== -1) {
      if (claim.sufficiency === "SATISFIED") {
        if (claim.verdict === "not_evaluable") {
          issues.push("verdict is not_evaluable but sufficiency is SATISFIED (must be met or not_met)");
        }
      } else if (claim.verdict !== "not_evaluable") {
        issues.push("verdict is " + claim.verdict + " but sufficiency is not SATISFIED (must be not_evaluable)");
      }
    }
    var presentation = claim.presentation;
    if (!presentation || typeof presentation !== "object") {
      issues.push("presentation missing");
    } else if (presentation.kind === "disclosure") {
      // section 2's gate: disclosure is not legal when status is
      // WITHHELD/NOT_COMMITTED -- one-directional, disclosure-only.
      if (WITHHELD_LIKE[presentation.status]) {
        issues.push("presentation is \"disclosure\" but status is " + presentation.status + " (disclosure policy forbids this; must be analysis or story)");
      }
      if (!isDigestRefArray(presentation.evidence)) issues.push("disclosure presentation.evidence[] missing or not all digest-refs");
    } else if (presentation.kind === "analysis") {
      if (!isNonEmptyString(presentation.summary)) issues.push("analysis presentation.summary missing");
    } else if (presentation.kind === "story") {
      if (!isNonEmptyString(presentation.narrative)) issues.push("story presentation.narrative missing");
    } else {
      issues.push("presentation.kind must be disclosure, analysis, or story");
    }
    return issues;
  }

  // Recompute coverage/buckets from the WELL-FORMED claims only -- a
  // malformed claim's own verdict/sufficiency cannot be trusted to bucket
  // correctly, so it is excluded here and reported only as its own refusal
  // row. This also means a tampered claim (e.g. its tier stripped) makes the
  // recomputed coverage disagree with the stated aggregate, doubly flagging
  // the tamper: the claim's own refusal row, AND the aggregate mismatch.
  function recompute(claims) {
    var buckets = { met: [], not_met: [], not_evaluable: [] };
    var unknownCount = 0;
    var byId = {};
    var wellFormedCount = 0;
    claims.forEach(function (claim) {
      var issues = claimIssues(claim);
      if (issues.length > 0) return;
      wellFormedCount += 1;
      byId[claim.id] = claim;
      buckets[claim.verdict].push(claim.id);
      if (claim.sufficiency === "UNKNOWN") unknownCount += 1;
    });
    return {
      buckets: buckets,
      coverage: { evaluated_population: wellFormedCount, unknown_count: unknownCount },
      byId: byId,
    };
  }

  function sameIdSet(a, b) {
    if (a.length !== b.length) return false;
    var sorted = a.slice().sort();
    var other = b.slice().sort();
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i] !== other[i]) return false;
    }
    return true;
  }

  // Cross-check every stated bucket entry against the full (not just
  // well-formed) claims list -- spec section 4's normative "a conforming
  // verifier MUST check" that a bucket id names a claim that exists with
  // the matching verdict.
  function bucketDiagnostics(allClaimsById, statedBuckets) {
    var lines = [];
    BUCKET_KEYS.forEach(function (key) {
      var ids = (statedBuckets && statedBuckets[key]) || [];
      ids.forEach(function (id) {
        var claim = allClaimsById[id];
        if (!claim) {
          lines.push("bucket \"" + key + "\" names claim id \"" + id + "\" which does not exist in claims[]");
        } else if (claim.verdict !== key) {
          lines.push(
            "bucket \"" + key + "\" names claim \"" + id + "\" but its own verdict is \"" + (claim.verdict || "(missing)") + "\""
          );
        }
      });
    });
    return lines;
  }

  function indexAllClaims(claims) {
    var byId = {};
    claims.forEach(function (claim) {
      if (claim && isNonEmptyString(claim.id)) byId[claim.id] = claim;
    });
    return byId;
  }

  function badge(helpers, ok, text) {
    var el = helpers.el("span", "rv0-badge " + (ok ? "ok" : "fail"), text);
    return el;
  }

  function neutralBadge(helpers, text) {
    return helpers.el("span", "rv0-badge neutral", text);
  }

  function statLine(helpers, label, stated, recomputed, ok) {
    var row = helpers.el("div", "rv0-stat");
    row.appendChild(helpers.el("span", "rv0-stat-label", label + ": " + stated + " (recomputed " + recomputed + ")"));
    row.appendChild(badge(helpers, ok, ok ? "✓ matches claims[]" : "✗ disagrees with claims[]"));
    return row;
  }

  function renderCoverage(helpers, statedCoverage, recomputedCoverage) {
    var wrap = helpers.el("div", "rv0-coverage");
    wrap.appendChild(helpers.el("h3", "rv0-section-title", "Coverage"));
    var evaluatedOk = statedCoverage.evaluated_population === recomputedCoverage.evaluated_population;
    var unknownOk = statedCoverage.unknown_count === recomputedCoverage.unknown_count;
    wrap.appendChild(
      statLine(helpers, "Evaluated population", statedCoverage.evaluated_population, recomputedCoverage.evaluated_population, evaluatedOk)
    );
    var excludedRow = helpers.el("div", "rv0-stat");
    excludedRow.appendChild(
      helpers.el("span", "rv0-stat-label", "Excluded (not applicable): " + statedCoverage.excluded_not_applicable)
    );
    excludedRow.appendChild(
      neutralBadge(helpers, "stated -- requirements excluded as N/A are never represented as claims, so this document cannot check this number against itself")
    );
    wrap.appendChild(excludedRow);
    wrap.appendChild(
      statLine(helpers, "Unresolved (unknown)", statedCoverage.unknown_count, recomputedCoverage.unknown_count, unknownOk)
    );
    return wrap;
  }

  function renderBuckets(helpers, statedBuckets, recomputedBuckets, diagnostics) {
    var wrap = helpers.el("div", "rv0-buckets");
    wrap.appendChild(helpers.el("h3", "rv0-section-title", "Buckets"));
    BUCKET_KEYS.forEach(function (key) {
      var stated = (statedBuckets && statedBuckets[key]) || [];
      var recomputed = recomputedBuckets[key];
      var ok = sameIdSet(stated, recomputed);
      var row = helpers.el("div", "rv0-bucket");
      row.appendChild(helpers.el("span", "rv0-bucket-key", key));
      row.appendChild(helpers.el("span", "rv0-bucket-count", String(stated.length)));
      row.appendChild(badge(helpers, ok, ok ? "✓ matches claims[]" : "✗ disagrees with claims[]"));
      var idsLine = helpers.el("div", "rv0-mono", stated.length ? stated.join(", ") : "(empty)");
      row.appendChild(idsLine);
      wrap.appendChild(row);
    });
    if (diagnostics.length) {
      var diagWrap = helpers.el("div", "rv0-diagnostics");
      diagnostics.forEach(function (line) {
        diagWrap.appendChild(helpers.el("div", "rv0-diagnostic", "✗ " + line));
      });
      wrap.appendChild(diagWrap);
    }
    return wrap;
  }

  function renderDigestRefs(helpers, label, refs) {
    var wrap = helpers.el("div", "rv0-refs");
    wrap.appendChild(helpers.el("span", "rv0-refs-label", label + ":"));
    if (!refs || !refs.length) {
      wrap.appendChild(helpers.el("span", "rv0-mono", "(none)"));
      return wrap;
    }
    refs.forEach(function (ref) {
      wrap.appendChild(helpers.el("div", "rv0-mono", (ref.kind ? ref.kind + " " : "") + ref.digest_alg + ": " + ref.digest));
    });
    return wrap;
  }

  function renderPresentation(helpers, presentation) {
    var wrap = helpers.el("div", "rv0-presentation");
    if (!presentation) {
      wrap.appendChild(helpers.el("div", "rv0-mono", "(no presentation)"));
      return wrap;
    }
    wrap.appendChild(helpers.el("span", "rv0-presentation-kind", presentation.kind + " -- status " + presentation.status));
    if (presentation.kind === "disclosure") {
      wrap.appendChild(renderDigestRefs(helpers, "disclosed evidence", presentation.evidence));
    } else if (presentation.kind === "analysis") {
      wrap.appendChild(helpers.el("div", "rv0-narrative", presentation.summary));
    } else if (presentation.kind === "story") {
      wrap.appendChild(helpers.el("div", "rv0-narrative", presentation.narrative));
    }
    return wrap;
  }

  function renderClaimRefusal(helpers, claim, issues) {
    var row = helpers.el("div", "rv0-claim rv0-claim-refused");
    var id = claim && isNonEmptyString(claim.id) ? claim.id : "(no id)";
    row.appendChild(helpers.el("div", "rv0-claim-refused-title", "⚠ Claim \"" + id + "\" refused -- not rendered"));
    var list = helpers.el("div", "rv0-claim-refused-reasons");
    issues.forEach(function (issue) {
      list.appendChild(helpers.el("div", "rv0-claim-refused-reason", "• " + issue));
    });
    row.appendChild(list);
    return row;
  }

  function renderClaim(helpers, claim) {
    var row = helpers.el("div", "rv0-claim");
    var head = helpers.el("div", "rv0-claim-head");
    head.appendChild(helpers.el("span", "rv0-claim-id", claim.id));
    head.appendChild(helpers.el("span", "rv0-tier", "tier: " + claim.tier));
    head.appendChild(helpers.el("span", "rv0-grade", "grade: " + claim.grade));
    row.appendChild(head);

    var contract = parseContractRef(claim.contract_ref);
    var contractLine = helpers.el(
      "div",
      "rv0-contract",
      "contract: " + (contract ? contract.id : claim.contract_ref) + " @ " + (contract ? contract.version : "?")
    );
    row.appendChild(contractLine);
    row.appendChild(helpers.el("div", "rv0-requirement", "requirement: " + claim.requirement_ref));
    row.appendChild(
      helpers.el("div", "rv0-verdict-line", "sufficiency: " + claim.sufficiency + " -- verdict: " + claim.verdict)
    );
    row.appendChild(renderPresentation(helpers, claim.presentation));
    row.appendChild(renderDigestRefs(helpers, "evidence", claim.evidence));
    row.appendChild(renderDigestRefs(helpers, "proofs", claim.proofs));
    return row;
  }

  async function renderResultV0Card(entry, helpers) {
    var record = entry.record || {};
    var claims = Array.isArray(record.claims) ? record.claims : [];
    var aggregate = record.aggregate || {};
    var statedCoverage = aggregate.coverage || {
      evaluated_population: "(missing)",
      excluded_not_applicable: "(missing)",
      unknown_count: "(missing)",
    };
    var statedBuckets = aggregate.buckets || {};

    var allClaimsById = indexAllClaims(claims);
    var recomputed = recompute(claims);
    var diagnostics = bucketDiagnostics(allClaimsById, statedBuckets);

    var wrap = helpers.el("div", "result-card");

    if (record.view && typeof record.view.title === "string") {
      wrap.appendChild(helpers.el("h2", "rv0-title", record.view.title));
    }
    if (record.view && typeof record.view.producer_name === "string") {
      wrap.appendChild(helpers.el("div", "rv0-producer", "producer: " + record.view.producer_name));
    }

    if (!aggregate.coverage) {
      wrap.appendChild(helpers.el("div", "rv0-diagnostic", "✗ aggregate has no coverage statement -- refusing to summarize without one"));
    } else {
      wrap.appendChild(renderCoverage(helpers, statedCoverage, recomputed.coverage));
    }
    wrap.appendChild(renderBuckets(helpers, statedBuckets, recomputed.buckets, diagnostics));

    var claimsWrap = helpers.el("div", "rv0-claims");
    claimsWrap.appendChild(helpers.el("h3", "rv0-section-title", "Claims"));
    claims.forEach(function (claim) {
      var issues = claimIssues(claim);
      claimsWrap.appendChild(issues.length ? renderClaimRefusal(helpers, claim, issues) : renderClaim(helpers, claim));
    });
    wrap.appendChild(claimsWrap);

    return wrap;
  }

  window.CapsuleViewer.register("result/v0", renderResultV0Card);

  // Exposed for the JS test suite only -- never used by another domain
  // module (that would be re-implementing this module's own job).
  window.__resultV0CardInternals = {
    claimIssues: claimIssues,
    recompute: recompute,
    bucketDiagnostics: bucketDiagnostics,
    parseContractRef: parseContractRef,
  };
})();
