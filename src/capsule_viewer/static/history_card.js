// SPDX-License-Identifier: Apache-2.0
// The History Card, in the page: capsuleviewer.history/v0's selection check,
// recompute and card (docs/design/history-card.md, sections 2 and 3).
//
// One self-contained script. It imports nothing and reads no wording pack:
// its words are compiled in (WORDS below). It needs only the DOM; UTF-8 and
// SHA-256 are computed here, synchronously, so the check runs the same in a
// secure context, on file:// and in Node.
//
// It is a module-slot script (agent-action-capsule's presentation contract,
// as capsulectl.deal-view/v0 is): at load it registers its module with the
// page's runtime (EvidenceGraph.registerPresentation), whose resolver selects
// it for a verified bundle carrying x-history-selection/v0. canRender takes
// any selection block, so a bad one is shown as the mismatch rather than
// passed over; buildModel runs the check; render draws exactly one of the
// card (the check passed) or the mismatch (it did not) into the host's L0, L1
// and L2. Never both, and never a card value beside a failed check. All text
// is set with textContent; nothing from the bundle is parsed as HTML.
//
// recomputeErrors(bundle) is the twin of the Python check
// (capsule_viewer.history.recompute.recompute_errors): it reads the bundle
// alone and returns every reason the selection does not hold, or []. Its
// messages follow the Python ones; values are printed as JSON.
//
// Deal records are read from the input only by selectedRecords (the twin of
// the Python selected_records): the records of the nested per-deal bundles
// under the selection block's "deals". check, derive and drawing take its
// output only.
//
// MANIFEST below is the module's manifest (capsule_viewer/history/manifest.json)
// except executable.script_sha256, which a script cannot carry for itself
// (all zeros here), as in capsulectl's deal view.
(function (root) {
  "use strict";

  var SELECTION_EXTENSION = "x-history-selection/v0";
  var RECOMPUTED_KEYS = ["completeness", "outcome_evidence", "period", "selected_count"];
  var CAPSULE_ID_EXCLUDED = { capsule_id: true, signature: true, key_id: true };
  var MAX_SAFE = 9007199254740991;
  var MANIFEST = {"spec_version": "aac.presentation-manifest/v0", "id": "capsuleviewer.history/v0", "presentation_api": "aac.presentation-api/v0", "runtime_min": "0.1.0", "trust_class": "trusted-executable", "requires": {"bundle_kind": "evidence-bundle/v2", "extensions": {"required": ["x-history-selection/v0"]}}, "forbids": {"profiles": ["spec_version:report/v1", "spec_version:evaluation-summary/v1", "result_version:evidence-result-v0"]}, "audiences": ["keep", "counterparty", "adjudicator"], "formats": ["html"], "fallback": false, "priority": 1, "executable": {"carrier": "module-slot", "script_sha256": "0000000000000000000000000000000000000000000000000000000000000000"}};

  // ---- the page's words (compiled in; no pack is read) ---------------------

  var WORDS = {
    title: "History",
    lead: "Records the holder chose to show from their own deals. The holder made this pick; the card does not widen it.",
    period: "Period",
    periodNote: "earliest to latest record time, as the holder's producer wrote them (producer_asserted)",
    selected: "Records selected",
    completeness: "Completeness",
    notAsserted: "Not asserted",
    completenessNote: "This is the holder's pick. It does not claim to be all of their records, for any period.",
    outcome: "Outcome evidence in the selected records",
    outcomeNote: "Each record counts once, under the sealed field and value it came from.",
    holder: "Stated by the holder, not recomputed",
    holderNote: "Nothing in this file can recompute these values; they are shown only under the holder's own label.",
    forbidding: "This card shows properties of the holder's selection and never a score, rating, reputation, rank or trust number.",
    l1: "Each selected record",
    l1Time: "Time",
    l1Deal: "Deal",
    l1Bucket: "Outcome evidence",
    l1Id: "Record (capsule id)",
    l2: "How this card was checked",
    l2Checked: "Recomputed in this page from the records in this file:",
    l2Steps: [
      "the definition's digest matches the definition carried",
      "the selection is an explicit_set, recomputed deterministically",
      "completeness is not_asserted and nothing else sits beside the four values",
      "every holder value carries the holder_asserted label",
      "each selected record is in the file once, recomputes to its capsule id, and its disclosure matches its digest",
      "the period, the count and the outcome evidence recompute from those records and equal what the card states",
    ],
    l2Definition: "Definition",
    l2Digest: "Definition digest",
    l2Kind: "Selection kind",
    l2Signing: "This check covers selection and recompute: record ids, disclosure digests and the four values. Each deal bundle's signatures and log membership are its verifier's, not this card's.",
    mismatchTitle: "This selection does not recompute",
    mismatchLead: "The values this file states do not follow from the records it carries, so no card is shown.",
    mismatchList: "What did not hold:",
    gloss: {
      none: "a noted act with no outcome evidence",
      "action_class:money.refund": "a refund record",
      "outcome:": "an outcome record that says ",
      "effect.status:": "the producer's runtime claimed ",
    },
  };

  // ---- SHA-256 (FIPS 180-4), synchronous ------------------------------------

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function sha256Hex(bytes) {
    var len = bytes.length;
    var padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[len] = 0x80;
    var bits = len * 8;
    var view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
    view.setUint32(padded.length - 4, bits >>> 0);
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    for (var off = 0; off < padded.length; off += 64) {
      for (var i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
      for (i = 16; i < 64; i++) {
        var x = w[i - 15], y = w[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (k + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + k) | 0;
    }
    var out = "";
    for (i = 0; i < 8; i++) out += ("00000000" + (h[i] >>> 0).toString(16)).slice(-8);
    return out;
  }

  // ---- JCS (RFC 8785), over the profile's value domain ----------------------
  // As capsule_viewer.digest.jcs: null, booleans, strings, safe integers,
  // arrays, objects. A float or an unsafe integer has no canonical form here.

  function jcs(v) {
    if (v === null) return "null";
    if (v === true) return "true";
    if (v === false) return "false";
    if (typeof v === "string") return JSON.stringify(v);
    if (typeof v === "number") {
      if (!Number.isInteger(v)) throw new Error("a JSON float has no canonical form in this profile");
      if (Math.abs(v) > MAX_SAFE) throw new Error("integer " + v + " is outside +/-" + MAX_SAFE);
      return String(v);
    }
    if (Array.isArray(v)) return "[" + v.map(jcs).join(",") + "]";
    if (typeof v === "object") {
      // Default string order is by UTF-16 code units, as 3.2.3 asks.
      return "{" + Object.keys(v).sort().map(function (key) { return JSON.stringify(key) + ":" + jcs(v[key]); }).join(",") + "}";
    }
    throw new Error(typeof v + " is not a JSON value");
  }

  // UTF-8, by hand: no platform encoder needed. A lone surrogate has no UTF-8
  // form and is refused, as capsule_viewer.digest.jcs refuses it.
  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) {
          c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
          i++;
        }
      }
      if (c >= 0xd800 && c <= 0xdfff) throw new Error("a string holds a lone surrogate");
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  function digest(value) {
    return sha256Hex(utf8(jcs(value)));
  }

  // ---- the input: the one place deal records are read ------------------------

  function obj(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v) ? v : {};
  }

  function has(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  }

  // The x-history-selection/v0 block, as carried (null when absent).
  function selectionBlock(bundle) {
    var ext = obj(obj(bundle).extensions);
    return has(ext, SELECTION_EXTENSION) ? ext[SELECTION_EXTENSION] : null;
  }

  // Every deal record the nested per-deal bundles carry: the members under
  // the selection block's "deals" ({deal id: evidence-bundle/v2}), in deal id
  // order, each member's records in its own order, each with that member's
  // disclosed agent_input (null when none): [{deal, record, agent_input}].
  // The twin of capsule_viewer.history.recompute.selected_records; check and
  // drawing take only this, so another bundle shape changes these two only.
  function selectedRecords(bundle) {
    var deals = obj(obj(selectionBlock(bundle)).deals);
    var out = [];
    Object.keys(deals).sort().forEach(function (deal) {
      var member = obj(deals[deal]);
      var records = member.records;
      var disclosures = obj(member.disclosures);
      (Array.isArray(records) ? records : []).forEach(function (r) {
        if (r === null || typeof r !== "object" || Array.isArray(r)) return;
        var entry = disclosures[r.capsule_id];
        var ai = entry !== null && typeof entry === "object" && has(entry, "agent_input") ? entry.agent_input : null;
        out.push({ deal: deal, record: r, agent_input: ai === undefined ? null : ai });
      });
    });
    return out;
  }

  // What the page embeds and checks: {selection, selected}.
  function pageData(bundle) {
    return { selection: selectionBlock(bundle), selected: selectedRecords(bundle) };
  }

  // ---- the recompute (design section 3) -------------------------------------

  function bucket(record, agentInput) {
    var body = obj(obj(agentInput).body);
    if (has(body, "outcome")) return "outcome:" + body.outcome;
    if (body.action_class === "money.refund") return "action_class:money.refund";
    var status = obj(record.effect).status;
    if (status) return "effect.status:" + status;
    return "none";
  }

  function derive(selected) {
    var breakdown = {};
    selected.forEach(function (s) {
      var b = bucket(s.record, s.agent_input);
      breakdown[b] = (breakdown[b] || 0) + 1;
    });
    var sorted = {};
    Object.keys(breakdown).sort().forEach(function (key) { sorted[key] = breakdown[key]; });
    var times = selected.map(function (s) { return s.record.timestamp; }).sort();
    return {
      period: { from: times[0], to: times[times.length - 1], temporal_provenance: "producer_asserted" },
      selected_count: selected.length,
      outcome_evidence: sorted,
      completeness: "not_asserted",
    };
  }

  function same(a, b) {
    try {
      return jcs(a) === jcs(b === undefined ? null : b);
    } catch (e) {
      return false;
    }
  }

  function show(v) {
    return v === undefined ? "null" : JSON.stringify(v);
  }

  function safeDigest(value) {
    try { return digest(value); } catch (e) { return null; }
  }

  // Every reason the selection block *ext* does not hold over *selected*
  // (selectedRecords' output), or [].
  function check(ext, selected) {
    if (ext === null || typeof ext !== "object" || Array.isArray(ext)) return ["no " + SELECTION_EXTENSION + " block"];
    var errors = [];
    var definition = obj(ext.definition), account = obj(ext.account);
    var derivation = obj(account.derivation), selection = obj(account.selection);
    var asserted = obj(account.asserted_result);

    if (derivation.definition_digest !== safeDigest(definition)) errors.push("definition_digest does not match the definition document");
    if (derivation.derivation_class !== "deterministic" || definition.derivation_class !== "deterministic") {
      errors.push("a history card's counts are deterministic; nothing else is recomputed");
    }
    if (selection.kind !== "explicit_set" || definition.selection_kind !== "explicit_set") {
      errors.push("a holder-directed selection is an explicit_set");
    }

    if (asserted.completeness !== "not_asserted") errors.push("completeness must be not_asserted, is " + show(asserted.completeness));
    var extra = Object.keys(asserted).filter(function (k) { return RECOMPUTED_KEYS.indexOf(k) < 0; }).sort();
    if (extra.length) errors.push("asserted_result carries values nothing recomputes: " + show(extra) + " (label them holder_asserted)");
    var held = obj(ext.holder_asserted);
    Object.keys(held).forEach(function (key) {
      var entry = held[key];
      if (entry === null || typeof entry !== "object" || entry.label !== "holder_asserted") {
        errors.push("holder_asserted." + key + " is not labelled holder_asserted");
      }
    });

    var refs = obj(selection.input_identity).references;
    refs = Array.isArray(refs) ? refs.slice() : [];
    if (!refs.length) errors.push("the selection names no records");
    if (new Set(refs).size !== refs.length) errors.push("the selection names a record twice");
    var byId = {};
    (selected || []).forEach(function (s) {
      var rec = obj(s.record);
      var cid = rec.capsule_id;
      var preimage = {};
      Object.keys(rec).forEach(function (k) { if (!CAPSULE_ID_EXCLUDED[k]) preimage[k] = rec[k]; });
      if (cid !== safeDigest(preimage)) errors.push("record " + cid + " does not recompute to its capsule_id");
      if (has(byId, cid)) errors.push("record " + cid + " is carried twice");
      byId[cid] = { deal: s.deal, record: rec, agent_input: s.agent_input };
    });
    var missing = refs.filter(function (ref) { return !has(byId, ref); });
    if (missing.length) errors.push("selected but not disclosed: " + show(missing));
    var unselected = Object.keys(byId).filter(function (cid) { return refs.indexOf(cid) < 0; }).sort();
    if (unselected.length) errors.push("in the bundle but not selected: " + show(unselected));
    refs.forEach(function (ref) {
      if (!has(byId, ref)) return;
      var disclosed = byId[ref].agent_input;
      var bound = obj(obj(byId[ref].record.model_attestation).compute_attestation).agent_input_digest;
      if (disclosed === undefined || disclosed === null) {
        errors.push("record " + ref + " has no disclosed agent_input");
      } else if (safeDigest(disclosed) !== bound) {
        errors.push("record " + ref + ": disclosed agent_input does not match its agent_input_digest");
      }
    });
    if (errors.length) return errors;

    var recomputed = derive(refs.map(function (ref) { return byId[ref]; }));
    RECOMPUTED_KEYS.forEach(function (key) {
      if (!same(recomputed[key], asserted[key])) {
        errors.push(key + ": recomputed " + show(recomputed[key]) + " != asserted " + show(asserted[key]));
      }
    });
    return errors;
  }

  function recomputeErrors(bundle) {
    return check(selectionBlock(bundle), selectedRecords(bundle));
  }

  // ---- drawing (the host's document; kit class names, so a kit stylesheet applies) ---------------------------------------------------------------

  function el(doc, tag, attrs, children) {
    var node = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === "string" ? doc.createTextNode(c) : c);
    });
    return node;
  }

  function section(doc, title, children, level) {
    return el(doc, "section", { class: "cv-section", "data-cv": "section" }, [
      el(doc, "h" + (level || 3), { class: "cv-section__title" }, [title]),
      el(doc, "div", { class: "cv-section__body" }, children),
    ]);
  }

  function drilldown(doc, summary, children) {
    return el(doc, "details", { class: "cv-drilldown", "data-cv": "drilldown" }, [
      el(doc, "summary", {}, [summary]),
      el(doc, "div", { class: "cv-drilldown__body" }, children),
    ]);
  }

  function metric(doc, label, value, note, key) {
    var parts = [el(doc, "dt", { class: "cv-metric__label" }, [label]), el(doc, "dd", { class: "cv-metric__value", "data-history-value": key }, [value])];
    if (note) parts.push(el(doc, "dd", { class: "cv-metric__note" }, [note]));
    return el(doc, "div", { class: "cv-metric" }, parts);
  }

  function table(doc, columns, rows) {
    var head = el(doc, "thead", {}, [el(doc, "tr", {}, columns.map(function (c) { return el(doc, "th", { scope: "col" }, [c]); }))]);
    var body = el(doc, "tbody", {}, rows.map(function (row) {
      return el(doc, "tr", row.attrs || {}, row.cells.map(function (cell, i) { return el(doc, "td", { "data-label": columns[i] }, [cell]); }));
    }));
    return el(doc, "div", { class: "cv-table-wrap", "data-cv": "data-table" }, [el(doc, "table", { class: "cv-table" }, [head, body])]);
  }

  function gloss(name) {
    if (WORDS.gloss[name]) return WORDS.gloss[name];
    if (name.indexOf("outcome:") === 0) return WORDS.gloss["outcome:"] + name.slice(8);
    if (name.indexOf("effect.status:") === 0) return WORDS.gloss["effect.status:"] + name.slice(14) + " (not that it arrived)";
    return "";
  }

  function drawCard(doc, ext, selected) {
    var asserted = ext.account.asserted_result;
    var refs = ext.account.selection.input_identity.references;
    var byId = {};
    selected.forEach(function (s) { byId[s.record.capsule_id] = s; });

    var outcomeRows = Object.keys(asserted.outcome_evidence).map(function (name) {
      return el(doc, "li", { "data-bucket": name }, [
        el(doc, "strong", {}, [String(asserted.outcome_evidence[name])]), " ",
        el(doc, "span", { class: "cv-mono" }, [name]),
        gloss(name) ? el(doc, "span", { class: "cv-muted" }, [" (" + gloss(name) + ")"]) : null,
      ]);
    });
    var holderRows = Object.keys(ext.holder_asserted || {}).map(function (key) {
      return el(doc, "li", { "data-holder-asserted": key }, [
        el(doc, "span", { class: "cv-mono" }, [key]), ": " + JSON.stringify(ext.holder_asserted[key].value) + " ",
        el(doc, "span", { class: "cv-badge cv-tone--caution" }, ["holder_asserted"]),
      ]);
    });

    var l0 = el(doc, "div", { "data-history": "card" }, [
      el(doc, "h2", {}, [WORDS.title]),
      el(doc, "p", {}, [WORDS.lead]),
      el(doc, "div", { class: "cv-metrics-wrap", "data-cv": "metric-grid" }, [
        el(doc, "dl", { class: "cv-metrics" }, [
          metric(doc, WORDS.period, asserted.period.from + " to " + asserted.period.to, WORDS.periodNote, "period"),
          metric(doc, WORDS.selected, String(asserted.selected_count), "", "selected_count"),
          metric(doc, WORDS.completeness, WORDS.notAsserted, WORDS.completenessNote, "completeness"),
        ]),
      ]),
      section(doc, WORDS.outcome, [el(doc, "ul", { "data-history-value": "outcome_evidence" }, outcomeRows), el(doc, "p", { class: "cv-muted" }, [WORDS.outcomeNote])]),
      holderRows.length ? section(doc, WORDS.holder, [el(doc, "ul", {}, holderRows), el(doc, "p", { class: "cv-muted" }, [WORDS.holderNote])]) : null,
      el(doc, "p", { class: "cv-muted", "data-history-forbids": "true" }, [WORDS.forbidding]),
    ]);

    var rows = refs.map(function (ref) {
      var r = byId[ref].record;
      var ai = byId[ref].agent_input;
      return { attrs: { "data-record": ref }, cells: [r.timestamp, byId[ref].deal, el(doc, "span", { class: "cv-mono" }, [bucket(r, ai)]), el(doc, "span", { class: "cv-mono" }, [ref])] };
    });
    var l1 = drilldown(doc, WORDS.l1, [table(doc, [WORDS.l1Time, WORDS.l1Deal, WORDS.l1Bucket, WORDS.l1Id], rows)]);

    var l2 = drilldown(doc, WORDS.l2, [
      el(doc, "p", {}, [WORDS.l2Checked]),
      el(doc, "ol", {}, WORDS.l2Steps.map(function (s) { return el(doc, "li", {}, [s]); })),
      el(doc, "dl", {}, [
        el(doc, "dt", {}, [WORDS.l2Definition]), el(doc, "dd", { class: "cv-mono" }, [String(ext.definition.name)]),
        el(doc, "dt", {}, [WORDS.l2Digest]), el(doc, "dd", { class: "cv-mono" }, [String(ext.account.derivation.definition_digest)]),
        el(doc, "dt", {}, [WORDS.l2Kind]), el(doc, "dd", { class: "cv-mono" }, [String(ext.account.selection.kind)]),
      ]),
      el(doc, "p", { class: "cv-muted" }, [WORDS.l2Signing]),
    ]);

    return [l0, l1, l2];
  }

  function drawMismatch(doc, errors) {
    return el(doc, "div", { "data-history": "mismatch" }, [
      el(doc, "h2", {}, [WORDS.mismatchTitle]),
      el(doc, "p", { class: "cv-notice cv-tone--negative", "data-notice": "history-mismatch" }, [WORDS.mismatchLead]),
      el(doc, "p", {}, [WORDS.mismatchList]),
      el(doc, "ul", {}, errors.map(function (e) { return el(doc, "li", { class: "cv-mono", "data-history-error": "true" }, [e]); })),
    ]);
  }

  // ---- the module (presentation contract: canRender, buildModel, render) ------

  function canRender(context) {
    var block = selectionBlock(obj(context).bundle);
    return block !== null && typeof block === "object" && !Array.isArray(block);
  }

  // {data: pageData, errors}: the check's reasons, empty when it holds.
  function buildModel(context) {
    var data = pageData(obj(context).bundle);
    var errors;
    try {
      errors = check(data.selection, data.selected);
    } catch (e) {
      errors = ["the check could not read this file: " + e.message];
    }
    return { data: data, errors: errors };
  }

  // Draws into host.L0, host.L1 and host.L2: the card, or only the mismatch.
  function render(model, host) {
    var doc = host.L0.ownerDocument;
    var parts = model.errors.length ? [drawMismatch(doc, model.errors), null, null] : drawCard(doc, model.data.selection, model.data.selected);
    [host.L0, host.L1, host.L2].forEach(function (region, i) {
      if (parts[i]) region.appendChild(parts[i]);
    });
    host.L0.setAttribute("data-history-state", model.errors.length ? "mismatch" : "card");
  }

  var module = { manifest: MANIFEST, canRender: canRender, buildModel: buildModel, render: render };

  root.CapsuleViewerHistory = {
    SELECTION_EXTENSION: SELECTION_EXTENSION,
    MANIFEST: MANIFEST,
    WORDS: WORDS,
    module: module,
    sha256Hex: sha256Hex,
    utf8: utf8,
    jcs: jcs,
    bucket: bucket,
    selectionBlock: selectionBlock,
    selectedRecords: selectedRecords,
    pageData: pageData,
    derive: derive,
    check: check,
    recomputeErrors: recomputeErrors,
  };
  if (typeof root.EvidenceGraph !== "undefined" && root.EvidenceGraph && typeof root.EvidenceGraph.registerPresentation === "function") {
    root.EvidenceGraph.registerPresentation(module);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
