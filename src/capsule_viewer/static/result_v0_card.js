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
// This module owns NO canonicalization -- a claim's evidence/proofs are
// refs only (the bytes live elsewhere, resolved by digest against the
// evidence's own disclosure record). The one place it needs a digest -- to
// find a close claim's cited Close among the records an entry may carry
// beside the Result (`entry.records`) -- it uses the base's own recompute
// port, CapsuleViewer.jsonDigest, never a port of its own. Every other
// check here is a structural/traceability check over the document's own
// claims array, never a capsule_id-style cryptographic recompute.
(function () {
  "use strict";

  if (typeof window === "undefined" || !window.CapsuleViewer) {
    throw new Error("result_v0_card.js: base CapsuleViewer not loaded");
  }
  if (!window.CapsuleViewerResultPanels) {
    throw new Error("result_v0_card.js: result_v0_panels.js not loaded");
  }
  var canonicalVerdict = window.CapsuleViewerResultPanels.canonicalVerdict;

  var VALID_TIERS = ["recomputed", "judged"];
  var VALID_GRADES = ["self-attested", "witnessed", "countersigned"];
  var VALID_SUFFICIENCY = ["SATISFIED", "GAP", "INSUFFICIENT", "UNKNOWN"];
  var VALID_VERDICTS = ["met", "not_met", "not_evaluable"];
  var BUCKET_KEYS = ["met", "not_met", "not_evaluable"];
  var WITHHELD_LIKE = { WITHHELD: 1, NOT_COMMITTED: 1 };

  // Claim types (schema $defs/ClaimType, PROPOSED against the 2026-09-25
  // ruling: "close + reconcile as claim types in result v0"). An absent
  // `type` is the pre-existing requirement claim. Anything outside this
  // list is UNRECOGNIZED: rendered as its own labelled row carrying the raw
  // type and contract_ref -- never refused for its type, never dropped
  // ("anything that meets a claim type it doesn't recognize should show
  // 'unrecognized', never drop the row").
  var KNOWN_CLAIM_TYPES = ["requirement", "reconcile", "close"];
  var STATE_OF_RECORD = ["A", "B", "none"];
  // The Evidence Layer's three Close states (draft-mih-agent-evidence-
  // layer-00, "Reconcile and Close"): read from the links other records
  // make to the Close, never from a field the Close sets. AGREED = the
  // NAMED PEER's book, under a different key, `acknowledges` the Close
  // (a record whose `book_id` is the claim's `peer`, not the Close's own,
  // carries the link) -- not "an independent party", until the contract
  // pins the peer's key (2026-09-29, see ignoredLinkReason);
  // CONTESTED = such a counterparty record `rebuts` it; UNILATERAL =
  // neither. After the maintainer's adversarial review
  // (2026-09-28: "a contested close relabelled 'agreed' validates") the
  // claim's close_state is DERIVABLE, never asserted: the claim cites its
  // Close (`close_ref`) and, when the entry carries the cited records
  // (`entry.records`, see result_v0.py), this card RECOMPUTES the state
  // from the links those records make to the Close and shows a `state
  // mismatch` marker where the Result's own value disagrees. When the
  // records are not supplied the asserted state is shown under a
  // `producer-asserted` chip -- never bare -- because a Result document
  // alone holds nothing the state can be checked against.
  var CLOSE_STATES = ["UNILATERAL", "AGREED", "CONTESTED"];
  var CLOSE_LINK_TYPES = { acknowledges: 1, rebuts: 1 };

  // How each reconcile state renders. `state` is the Evidence Layer's
  // uppercase state name; `key` is how the claim's `tallies` object spells
  // it -- lowercase, exactly as schemas/judge/close-v1.json's
  // ReconcileTallies keys it. The class is the load-bearing part and is
  // pinned by negative fixtures, not styling: A_ONLY / B_ONLY are "one side
  // missing" (rv0-rs-one-sided) and CONFLICTING is "both sides disagree"
  // (rv0-rs-finding) -- the ruling's "one side missing isn't a finding;
  // both sides disagreeing is." No class is shared between the one-sided
  // states and the finding state.
  var RECONCILE_ROWS = [
    { state: "MATCHED", key: "matched", cls: "rv0-rs-matched", label: "matched -- present on both sides, equal" },
    { state: "A_ONLY", key: "a_only", cls: "rv0-rs-one-sided", label: "A only -- one side missing (this book has the row, the peer does not)" },
    { state: "B_ONLY", key: "b_only", cls: "rv0-rs-one-sided", label: "B only -- one side missing (the peer has the row, this book does not)" },
    { state: "CONFLICTING", key: "conflicting", cls: "rv0-rs-finding", label: "conflicting -- both sides disagree" },
    { state: "INSUFFICIENT", key: "insufficient", cls: "rv0-rs-gap", label: "insufficient -- the evidence to compare was missing" },
    { state: "UNRESOLVED", key: "unresolved", cls: "rv0-rs-gap", label: "unresolved -- compared, not resolvable within the period" },
  ];
  var RECONCILE_KEYS = RECONCILE_ROWS.map(function (spec) { return spec.key; });

  function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
  }

  function isNonNegativeInteger(v) {
    return typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= 0;
  }

  function isPeriod(p) {
    return !!p && typeof p === "object" && isNonEmptyString(p.start) && isNonEmptyString(p.end);
  }

  // The digest format the vectors carry (schema $defs/HexDigest): exactly
  // 64 lowercase hex characters, the bare lowercase-hex SHA-256 the base's
  // jsonDigest port produces -- no `sha256:` prefix, no uppercase, no other
  // length. A ref whose digest is not in this form can never resolve
  // against the supplied records (2026-09-28, maintainer's second pass:
  // "the digest check accepts any non-empty string"), so the claim is
  // refused rather than rendered around it.
  var HEX64 = /^[0-9a-f]{64}$/;

  function isHexDigest(v) {
    return typeof v === "string" && HEX64.test(v);
  }

  function isDigestRef(r) {
    return !!r && typeof r === "object" && r.digest_alg === "SHA-256" && isHexDigest(r.digest);
  }

  // Absent `type` means "requirement" -- the pre-existing claim shape.
  function claimType(claim) {
    return claim && claim.type === undefined ? "requirement" : claim.type;
  }

  function isKnownClaimType(claim) {
    return KNOWN_CLAIM_TYPES.indexOf(claimType(claim)) !== -1;
  }

  // The raw type, as text, for the unrecognized row -- a non-string type is
  // shown as its JSON so the reader sees exactly what the document carried.
  function rawTypeText(claim) {
    var t = claim ? claim.type : undefined;
    return typeof t === "string" ? t : JSON.stringify(t);
  }

  // Type-specific well-formedness. Same posture as the base fields: never
  // defaulted, never silently fixed -- a missing count is NOT zero, and an
  // AGREED close with no peer is NOT an agreement.
  function reconcileIssues(body) {
    var issues = [];
    if (!body || typeof body !== "object") return ["reconcile body missing (type is \"reconcile\")"];
    if (!isNonEmptyString(body.join_key)) issues.push("reconcile.join_key missing or empty");
    if (!isNonEmptyString(body.peer)) issues.push("reconcile.peer missing or empty");
    if (!isPeriod(body.period)) issues.push("reconcile.period missing or not {start, end}");
    if (!body.tallies || typeof body.tallies !== "object") {
      issues.push("reconcile.tallies missing");
    } else {
      RECONCILE_KEYS.forEach(function (key) {
        if (!isNonNegativeInteger(body.tallies[key])) {
          issues.push("reconcile.tallies." + key + " missing or not a non-negative integer (an absent state is never zero)");
        }
      });
      Object.keys(body.tallies).forEach(function (key) {
        if (RECONCILE_KEYS.indexOf(key) === -1) issues.push("reconcile.tallies carries unknown state \"" + key + "\"");
      });
    }
    if (STATE_OF_RECORD.indexOf(body.state_of_record) === -1) {
      issues.push("reconcile.state_of_record missing or invalid (must be A, B, or none)");
    }
    return issues;
  }

  function closeIssues(body) {
    var issues = [];
    if (!body || typeof body !== "object") return ["close body missing (type is \"close\")"];
    if (!isPeriod(body.period)) issues.push("close.period missing or not {start, end}");
    if (!isDigestRef(body.close_ref)) {
      issues.push("close.close_ref missing or not a digest-ref (SHA-256, 64 lowercase hex) -- the Close this claim reports on, by digest, is what close_state is recomputed from");
    }
    if (CLOSE_STATES.indexOf(body.close_state) === -1) {
      issues.push("close.close_state missing or invalid (must be UNILATERAL, AGREED, or CONTESTED)");
    } else if (body.close_state === "AGREED") {
      if (!isNonEmptyString(body.peer)) issues.push("close is AGREED but names no peer -- an agreement with nobody cannot render as agreed");
      if (!isDigestRef(body.peer_close_ref)) issues.push("close is AGREED but cites no peer_close_ref -- the peer's acknowledging Close record, by digest, is what makes it agreed");
    } else if (body.close_state === "CONTESTED") {
      if (!isNonEmptyString(body.peer)) issues.push("close is CONTESTED but names no peer -- a rebuttal from nobody cannot render as contested");
      if (!isDigestRef(body.peer_close_ref)) issues.push("close is CONTESTED but cites no peer_close_ref -- the peer's rebutting record, by digest, is what makes it contested");
    } else {
      // UNILATERAL: `peer` and `peer_close_ref` are OPTIONAL (schema, after
      // close-v1's unconditional peer_close) -- a party may name the peer it
      // closed against, and cite the peer's Close it reconciled with. If
      // present they must be well-formed; naming a peer is not agreeing
      // with it, and renderClose shows no agreed affordance either way.
      if (body.peer !== undefined && !isNonEmptyString(body.peer)) issues.push("close.peer present but not a non-empty string");
      if (body.peer_close_ref !== undefined && !isDigestRef(body.peer_close_ref)) issues.push("close.peer_close_ref present but not a digest-ref");
    }
    return issues;
  }

  function isDigestRefArray(v) {
    return Array.isArray(v) && v.every(isDigestRef);
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
    if (claim.verdict === "not_applicable") {
      issues.push('verdict "not_applicable" is a population exclusion, not a verdict');
    } else if (VALID_VERDICTS.indexOf(claim.verdict) === -1) {
      issues.push("missing or invalid verdict");
    }
    if (!isDigestRefArray(claim.evidence)) issues.push("evidence[] missing or not all digest-refs (SHA-256, 64 lowercase hex)");
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
    // Type <-> body binding (schema Claim.allOf). An UNRECOGNIZED type is
    // deliberately NOT an issue here: its row renders as "unrecognized"
    // (renderClaimUnrecognized) and, because its base axes are the same
    // axes every type carries, it still counts in the coverage/bucket
    // recompute -- the viewer's ignorance of a type never turns the
    // document's own aggregate red.
    var type = claimType(claim);
    if (type === "reconcile") {
      issues = issues.concat(reconcileIssues(claim.reconcile));
      if (claim.close !== undefined) issues.push("reconcile claim also carries a close body");
    } else if (type === "close") {
      issues = issues.concat(closeIssues(claim.close));
      if (claim.reconcile !== undefined) issues.push("close claim also carries a reconcile body");
    } else if (type === "requirement") {
      if (claim.reconcile !== undefined) issues.push("requirement claim carries a reconcile body without type \"reconcile\"");
      if (claim.close !== undefined) issues.push("requirement claim carries a close body without type \"close\"");
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

  // A sealed claim whose verdict is a retired spelling of not_evaluable is
  // read as a copy carrying the canonical spelling; the sealed record is
  // never modified. Every other claim is returned as-is, so an unknown
  // verdict still reaches claimIssues and is refused.
  function readClaim(sealed) {
    if (!sealed || typeof sealed !== "object") return sealed;
    var verdict = canonicalVerdict(sealed.verdict);
    return verdict === sealed.verdict ? sealed : Object.assign({}, sealed, { verdict: verdict });
  }

  // Stated buckets keyed by a retired spelling are read into the canonical
  // bucket, so the bucket row and its cross-check use one spelling.
  function readBuckets(stated) {
    var retiredKeys = Object.keys(stated).filter(function (key) { return canonicalVerdict(key) !== key; });
    if (!retiredKeys.length) return stated;
    var out = Object.assign({}, stated);
    retiredKeys.forEach(function (key) {
      var canonical = canonicalVerdict(key);
      out[canonical] = [].concat(out[canonical] || [], stated[key]);
      delete out[key];
    });
    return out;
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

  function renderPeriod(period) {
    return period.start + " → " + period.end;
  }

  // A reconcile claim's body: the join, the peer, the period, which side
  // is of record, then the six states AS COUNTS -- one row each, every
  // state always shown (zero is a count too), never a ratio, never a
  // percentage, never a total that could stand in for the six.
  function renderReconcile(helpers, body) {
    var wrap = helpers.el("div", "rv0-reconcile");
    wrap.appendChild(
      helpers.el(
        "div",
        "rv0-reconcile-head",
        "reconcile: join on " + body.join_key + " · peer " + body.peer + " · period " + renderPeriod(body.period) +
          " · state of record: " + body.state_of_record +
          (body.state_of_record === "A" ? " (this book)" : body.state_of_record === "B" ? " (the peer)" : " (neither)")
      )
    );
    var table = helpers.el("div", "rv0-reconcile-counts");
    RECONCILE_ROWS.forEach(function (spec) {
      var row = helpers.el("div", "rv0-reconcile-count " + spec.cls);
      row.setAttribute("data-state", spec.state);
      row.appendChild(helpers.el("span", "rv0-rs-state", spec.state));
      row.appendChild(helpers.el("span", "rv0-rs-count", String(body.tallies[spec.key])));
      row.appendChild(helpers.el("span", "rv0-rs-label", spec.label));
      table.appendChild(row);
    });
    wrap.appendChild(table);
    return wrap;
  }

  // The state a Close's inbound links read (spec section 4.1): any `rebuts`
  // link makes it CONTESTED; otherwise any `acknowledges` link makes it
  // AGREED; neither leaves it UNILATERAL. `links` is the list of
  // {type, record} pairs found at the Close; never a field of any record.
  function deriveCloseState(links) {
    var i;
    for (i = 0; i < links.length; i++) if (links[i].type === "rebuts") return "CONTESTED";
    for (i = 0; i < links.length; i++) if (links[i].type === "acknowledges") return "AGREED";
    return "UNILATERAL";
  }

  // Index the supplied records by digest. The digest is the base's own
  // recompute port (CapsuleViewer.jsonDigest -- the same hand-port of
  // canonical.py the capsule_id chip uses); this module re-ports nothing.
  // A record the port cannot digest (a float, an unsupported value) is
  // left out and can therefore never be the cited Close.
  async function indexRecordsByDigest(records) {
    var byDigest = {};
    if (!Array.isArray(records)) return byDigest;
    for (var i = 0; i < records.length; i++) {
      try {
        byDigest[await window.CapsuleViewer.jsonDigest(records[i])] = records[i];
      } catch (e) {
        // not digestable: not a record this card can cite
      }
    }
    return byDigest;
  }

  // What this card knows about one close claim's state once the supplied
  // records have been read. `derivation` is "recomputed" when the cited
  // Close is among the records (its inbound links were walked -- an empty
  // walk is a real UNILATERAL), "producer-asserted" when it is not, or no
  // records were supplied. `state` is what the card shows: recomputed when
  // it can be, the asserted value only otherwise.
  // Why an inbound acknowledges/rebuts link made no state (maintainer's
  // third pass, 2026-09-29: "neither book_id nor signer alone is enough,
  // since a producer can mint a second book or a second key equally
  // easily"). A link counts only from the COUNTERPARTY -- all of:
  //   (1) the linking record's `book_id` is present and differs from the
  //       cited Close's `book_id`;
  //   (2) that `book_id` equals the claim's named `peer` (`close.peer`);
  //   (3) the linking record is signed under a different key than the
  //       Close -- NOT checked here: the supplied records are evidence-book
  //       record headers (v, book_id, seq, links, ...) and carry no
  //       signer. (3) is the emitter's and the CLI's, where the record's
  //       Producer Envelope `key_id` is visible.
  // A Close whose header names no `book_id` takes no link at all: nothing
  // can be shown to be its counterparty. Returns null when the link counts.
  function ignoredLinkReason(closeRecord, peer, record) {
    var closeBook = closeRecord && isNonEmptyString(closeRecord.book_id) ? closeRecord.book_id : undefined;
    var book = record && isNonEmptyString(record.book_id) ? record.book_id : undefined;
    if (closeBook === undefined) return "the cited Close names no book_id, so nothing can be its counterparty";
    if (book === undefined) return "the linking record names no book_id";
    if (book === closeBook) return "the linking record is from the Close's own book";
    if (!isNonEmptyString(peer)) return "the claim names no peer, so no book can be the counterparty";
    if (book !== peer) return "the linking record's book_id is not the claim's named peer";
    return null;
  }

  function closeDerivation(body, byDigest) {
    var asserted = body.close_state;
    var closeDigest = body.close_ref.digest;
    if (!Object.prototype.hasOwnProperty.call(byDigest, closeDigest)) {
      return { derivation: "producer-asserted", state: asserted, asserted: asserted, links: [], ignored: [], mismatch: false, peerRefMismatch: false };
    }
    var closeRecord = byDigest[closeDigest];
    var links = [];
    var ignored = [];
    Object.keys(byDigest).forEach(function (digest) {
      var record = byDigest[digest];
      var recordLinks = record && Array.isArray(record.links) ? record.links : [];
      recordLinks.forEach(function (link) {
        if (link && link.target === closeDigest && CLOSE_LINK_TYPES[link.type]) {
          var reason = ignoredLinkReason(closeRecord, body.peer, record);
          if (reason === null) links.push({ type: link.type, record: digest });
          else ignored.push({ type: link.type, record: digest, reason: reason });
        }
      });
    });
    var derived = deriveCloseState(links);
    var wanted = derived === "AGREED" ? "acknowledges" : derived === "CONTESTED" ? "rebuts" : null;
    var peerDigest = body.peer_close_ref ? body.peer_close_ref.digest : undefined;
    var peerRefMismatch =
      wanted !== null &&
      !links.some(function (link) {
        return link.type === wanted && link.record === peerDigest;
      });
    return {
      derivation: "recomputed",
      state: derived,
      asserted: asserted,
      links: links,
      ignored: ignored,
      mismatch: derived !== asserted,
      peerRefMismatch: peerRefMismatch,
    };
  }

  // A close claim's body. The three states are three classes AND three
  // wordings. A UNILATERAL close has nothing on its row that could read as
  // agreement ("UNILATERAL never like AGREED"), and a CONTESTED close -- a
  // peer record REBUTS it -- renders as its own state (rv0-close-contested,
  // "contested -- peer rebuts"), never in AGREED's or UNILATERAL's wording.
  // AGREED carries NO mark of its own (the former check-mark-and-peer
  // affordance is gone, 2026-09-28): its label, the peer, and the peer's
  // acknowledging Close by digest are the whole affordance -- a check-mark
  // beside a state the card may not have been able to verify read as a
  // verification it was not. The peer line and the cited peer record are
  // shown on AGREED and CONTESTED (both exist only because a peer record
  // links to the Close). A UNILATERAL close MAY name the peer it was
  // closed against and MAY cite the peer's Close it reconciled with; when
  // it does, the line says the peer has not responded, and "acknowledges"
  // -- AGREED's link word -- never appears on a UNILATERAL row.
  //
  // The state shown is `derived.state`: recomputed from the supplied
  // records' links when the cited Close is among them, the Result's own
  // value otherwise. Every close row carries exactly one derivation chip
  // (rv0-close-recomputed or rv0-close-producer-asserted) -- an asserted
  // state is never shown bare -- and a `state mismatch` marker
  // (rv0-close-state-mismatch) whenever the recomputed state is not the
  // asserted one; the asserted value lives on that marker's data
  // attribute, never in the text a reader takes as the state. Pinned by
  // tests, not styling.
  //
  // Every AGREED row also carries a visible caveat (rv0-close-key-unchecked,
  // "peer key not checked"; maintainer's fourth pass, 2026-09-29). The
  // counterparty rule has three parts -- another book, the named peer's
  // book, a different signing key -- and this card sees only record
  // headers, which carry no signer. It checks the first two; the third is
  // the emitter's and the CLI's, which verify the Producer Envelope under
  // its key_id. So an AGREED this card draws never reads as a key check.
  function renderClose(helpers, body, derived) {
    var wrap = helpers.el("div", "rv0-close");
    var state = derived.state;
    var peer = body.peer;
    var peerRef = body.peer_close_ref;
    wrap.appendChild(helpers.el("div", "rv0-close-period", "close period: " + renderPeriod(body.period)));
    if (state === "AGREED") {
      wrap.appendChild(helpers.el("span", "rv0-close-state rv0-close-agreed", "AGREED -- the peer's own Close acknowledges this one"));
      var unchecked = helpers.el(
        "span",
        "rv0-close-key-unchecked",
        "peer key not checked -- this card sees no signing keys, so it cannot show the peer's record was signed under a key other than this Close's"
      );
      unchecked.setAttribute("data-key-checked", "false");
      wrap.appendChild(unchecked);
      wrap.appendChild(helpers.el("div", "rv0-close-peer", "peer: " + (peer !== undefined ? peer : "(not named by the Result)")));
      if (peerRef !== undefined) {
        wrap.appendChild(helpers.el("div", "rv0-mono", "peer's acknowledging Close: " + peerRef.digest_alg + ": " + peerRef.digest));
      }
    } else if (state === "CONTESTED") {
      wrap.appendChild(helpers.el("span", "rv0-close-state rv0-close-contested", "CONTESTED -- peer rebuts this Close"));
      wrap.appendChild(helpers.el("span", "rv0-close-contested-mark", "contested -- peer rebuts: " + (peer !== undefined ? peer : "(not named by the Result)")));
      wrap.appendChild(helpers.el("div", "rv0-close-peer", "peer: " + (peer !== undefined ? peer : "(not named by the Result)")));
      if (peerRef !== undefined) {
        wrap.appendChild(helpers.el("div", "rv0-mono", "peer's rebutting record: " + peerRef.digest_alg + ": " + peerRef.digest));
      }
    } else {
      wrap.appendChild(
        helpers.el("span", "rv0-close-state rv0-close-unilateral", "UNILATERAL -- closed by this book alone; no peer record has responded to it")
      );
      if (peer !== undefined) {
        wrap.appendChild(helpers.el("div", "rv0-close-peer", "peer: " + peer + " -- no response from it"));
      }
      if (peerRef !== undefined) {
        wrap.appendChild(
          helpers.el("div", "rv0-mono", "peer's Close reconciled with (no link back): " + peerRef.digest_alg + ": " + peerRef.digest)
        );
      }
    }
    wrap.appendChild(helpers.el("div", "rv0-mono rv0-close-ref", "cited Close: " + body.close_ref.digest_alg + ": " + body.close_ref.digest));
    var chip;
    if (derived.derivation === "recomputed") {
      chip = helpers.el(
        "span",
        "rv0-close-derivation rv0-close-recomputed",
        "recomputed from " + derived.links.length + (derived.links.length === 1 ? " link" : " links") + " to the cited Close in the supplied records" +
          (derived.ignored.length === 0 ? "" : " (" + derived.ignored.length + (derived.ignored.length === 1 ? " other link" : " other links") + " ignored -- not from the counterparty)")
      );
    } else {
      chip = helpers.el(
        "span",
        "rv0-close-derivation rv0-close-producer-asserted",
        "producer-asserted -- the cited Close is not among the supplied records, so this state is the Result's own word, unverified here"
      );
    }
    chip.setAttribute("data-derivation", derived.derivation);
    wrap.appendChild(chip);
    if (derived.mismatch) {
      var mismatch = helpers.el(
        "span",
        "rv0-close-state-mismatch",
        "state mismatch -- the Result asserts a different state than the cited Close's links read; the recomputed state is shown"
      );
      mismatch.setAttribute("data-asserted-state", derived.asserted);
      mismatch.setAttribute("data-recomputed-state", derived.state);
      wrap.appendChild(mismatch);
    }
    if (derived.peerRefMismatch) {
      wrap.appendChild(
        helpers.el("span", "rv0-close-peer-ref-mismatch", "peer_close_ref is not the record carrying the link that makes this state")
      );
    }
    // Inbound links that made no state -- from the Close's own book, or a
    // book that is not the named peer -- are listed with the reason, never
    // counted: a reader sees why the state was not read from them. The
    // link type goes on a data attribute only, so an ignored acknowledgement
    // never puts AGREED's wording on a UNILATERAL row; the digest is the
    // card's own jsonDigest of the record, rendered as text.
    derived.ignored.forEach(function (link) {
      var line = helpers.el(
        "div",
        "rv0-close-ignored-link",
        "link from " + link.record + " ignored -- not from the counterparty: " + link.reason
      );
      line.setAttribute("data-ignored-link", link.type);
      wrap.appendChild(line);
    });
    return wrap;
  }

  // A claim whose type this card does not know. It is NOT refused (its
  // base fields may be perfectly well-formed) and NOT dropped: it renders
  // as its own labelled row, shown as-is, carrying the raw type and the
  // contract_ref so a reader can see exactly what the document claimed
  // and under which contract -- and go find a renderer that knows it.
  function renderClaimUnrecognized(helpers, claim) {
    var row = helpers.el("div", "rv0-claim rv0-claim-unrecognized");
    var id = isNonEmptyString(claim.id) ? claim.id : "(no id)";
    row.appendChild(
      helpers.el(
        "div",
        "rv0-claim-unrecognized-title",
        "unrecognized claim type \"" + rawTypeText(claim) + "\" -- claim \"" + id + "\" shown as-is, not interpreted"
      )
    );
    row.appendChild(helpers.el("div", "rv0-claim-unrecognized-type", "type: " + rawTypeText(claim)));
    row.appendChild(helpers.el("div", "rv0-contract", "contract_ref: " + claim.contract_ref));
    row.appendChild(helpers.el("div", "rv0-requirement", "requirement: " + claim.requirement_ref));
    row.appendChild(
      helpers.el(
        "div",
        "rv0-verdict-line",
        "tier: " + claim.tier + " -- grade: " + claim.grade + " -- sufficiency: " + claim.sufficiency + " -- verdict: " + claim.verdict
      )
    );
    return row;
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
    if (claim && typeof claim === "object" && !isKnownClaimType(claim)) {
      row.appendChild(
        helpers.el(
          "div",
          "rv0-claim-refused-note",
          "type \"" + rawTypeText(claim) + "\" is unrecognized; the row is refused for the reasons above, not for its type"
        )
      );
    }
    return row;
  }

  function renderClaim(helpers, claim, byDigest, retiredSpelling) {
    var row = helpers.el("div", "rv0-claim");
    var head = helpers.el("div", "rv0-claim-head");
    head.appendChild(helpers.el("span", "rv0-claim-id", claim.id));
    head.appendChild(helpers.el("span", "rv0-claim-type", "type: " + claimType(claim)));
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
    if (retiredSpelling) {
      row.appendChild(
        helpers.el(
          "div",
          "rv0-retired-verdict",
          "the sealed record spells this verdict \"" + retiredSpelling + "\", a retired spelling read as " + claim.verdict
        )
      );
    }
    var type = claimType(claim);
    if (type === "reconcile") row.appendChild(renderReconcile(helpers, claim.reconcile));
    if (type === "close") row.appendChild(renderClose(helpers, claim.close, closeDerivation(claim.close, byDigest)));
    row.appendChild(renderPresentation(helpers, claim.presentation));
    row.appendChild(renderDigestRefs(helpers, "evidence", claim.evidence));
    row.appendChild(renderDigestRefs(helpers, "proofs", claim.proofs));
    return row;
  }

  async function renderResultV0Card(entry, helpers) {
    var record = entry.record || {};
    var sealedClaims = Array.isArray(record.claims) ? record.claims : [];
    var claims = sealedClaims.map(readClaim);
    var aggregate = record.aggregate || {};
    var statedCoverage = aggregate.coverage || {
      evaluated_population: "(missing)",
      excluded_not_applicable: "(missing)",
      unknown_count: "(missing)",
    };
    var statedBuckets = readBuckets(aggregate.buckets || {});

    var allClaimsById = indexAllClaims(claims);
    var recomputed = recompute(claims);
    var diagnostics = bucketDiagnostics(allClaimsById, statedBuckets);
    // The records the entry carries beside the Result (result_v0.py's
    // `records=`): what a close claim's state is recomputed from. Absent
    // means every close state is producer-asserted, and says so.
    var byDigest = await indexRecordsByDigest(entry.records);

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
    // One row per input claim, always: refused, unrecognized, or rendered.
    // Nothing is ever dropped -- the rendered row count equals claims.length.
    claims.forEach(function (claim, i) {
      var issues = claimIssues(claim);
      var retiredSpelling = claim !== sealedClaims[i] ? sealedClaims[i].verdict : null;
      var row;
      if (issues.length) row = renderClaimRefusal(helpers, claim, issues);
      else if (!isKnownClaimType(claim)) row = renderClaimUnrecognized(helpers, claim);
      else row = renderClaim(helpers, claim, byDigest, retiredSpelling);
      claimsWrap.appendChild(row);
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
    claimType: claimType,
    isKnownClaimType: isKnownClaimType,
    isDigestRef: isDigestRef,
    deriveCloseState: deriveCloseState,
    closeDerivation: closeDerivation,
    KNOWN_CLAIM_TYPES: KNOWN_CLAIM_TYPES.slice(),
    RECONCILE_STATES: RECONCILE_ROWS.map(function (spec) { return spec.state; }),
    RECONCILE_KEYS: RECONCILE_KEYS.slice(),
    CLOSE_STATES: CLOSE_STATES.slice(),
  };
})();
