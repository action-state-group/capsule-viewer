// SPDX-License-Identifier: Apache-2.0
// The History Card, in the page: capsuleviewer.history/v0's check and card
// (docs/design/history-card.md, sections 1 to 3).
//
// One self-contained script. It imports nothing and reads no wording pack:
// its words are compiled in (WORDS below). It needs only the DOM; UTF-8 and
// SHA-256 are computed here, synchronously, so the check runs the same in a
// secure context, on file:// and in Node.
//
// It is a module-slot script (agent-action-capsule's presentation contract,
// as capsulectl.deal-view/v0 is): at load it registers its module with the
// page's runtime (EvidenceGraph.registerPresentation), whose resolver selects
// it for a bundle carrying x-history-selection/v0. canRender takes any
// selection block, so a bad one is shown as what is wrong with it rather than
// passed over; buildModel runs the check; render draws exactly one of the card
// (every check here holds) or the reason there is no card, into the host's
// L0, L1 and L2. Never a card value beside a failed check. All text is set
// with textContent; nothing from the bundle is parsed as HTML.
//
// The input is a History as capsulectl `deal history` writes it: an
// evidence-bundle/v2 of the holder's own history log ("deal-history") whose
// one disclosed record (action_id "capsulectl-deal-history") seals the pick,
// and whose x-history-selection/v0 extension carries
//   {selection_record, selection: [{deal_id, bundle_digest}], deals: {<deal id>: <evidence-bundle/v2>}}.
// check(bundle) is the twin of the Python check
// (capsule_viewer.history.recompute.check): the same findings, the same
// per-property statuses (PASS, FAIL, NOT_CHECKED, NOT_PRESENT), the same state.
// It recomputes record ids, disclosure digests and nested bundle digests.
// It does not verify a signature, a checkpoint or log membership; those are
// NOT_CHECKED here, and the page never calls them verified.
//
// Deal records are read from the input only by selectedRecords (the twin of
// the Python selected_records). derive and drawing take its output only.
//
// MANIFEST below is the module's manifest (capsule_viewer/history/manifest.json)
// except executable.script_sha256, which a script cannot carry for itself
// (all zeros here), as in capsulectl's deal view.
(function (root) {
  "use strict";

  var SELECTION_EXTENSION = "x-history-selection/v0";
  var HISTORY_LOG_ID = "deal-history";
  var SELECTION_ACTION_ID = "capsulectl-deal-history";
  var DEAL_PROFILE = "x-deal-v0";
  var REPORT_POINTER = "sealed_report";
  var SHAREABLE_AUDIENCES = ["counterparty", "adjudicator"];
  var RECOMPUTED_KEYS = ["completeness", "outcome_evidence", "period", "selected_count"];
  var PROPERTIES = [
    "selection_record", "selection_record_signature", "history_log", "selection_sealed", "membership", "member_digests",
    "audience", "signer_keys", "member_records", "member_signatures", "member_logs", "values",
  ];
  var CAPSULE_ID_EXCLUDED = { capsule_id: true, signature: true, key_id: true };
  var DEAL_ID = /^deal-[0-9a-f]{16}$/;
  var HEX_DIGEST = /^[0-9a-f]{64}$/;
  var MAX_SAFE = 9007199254740991;
  var MANIFEST = {"spec_version": "aac.presentation-manifest/v0", "id": "capsuleviewer.history/v0", "presentation_api": "aac.presentation-api/v0", "runtime_min": "0.1.0", "trust_class": "trusted-executable", "requires": {"bundle_kind": "evidence-bundle/v2", "extensions": {"required": ["x-history-selection/v0"]}}, "forbids": {"profiles": ["spec_version:report/v1", "spec_version:evaluation-summary/v1", "result_version:evidence-result-v0"]}, "audiences": ["keep", "counterparty", "adjudicator"], "formats": ["html"], "fallback": false, "priority": 1, "executable": {"carrier": "module-slot", "script_sha256": "0000000000000000000000000000000000000000000000000000000000000000"}};

  // ---- the page's words (compiled in; no pack is read) ---------------------

  var WORDS = {
    title: "History",
    lead: "Deals the holder chose to show, each as its own copy for the reader. The holder made this pick; the card does not widen it.",
    audience: { counterparty: "Copy for the other party in each deal", adjudicator: "Copy for an adjudicator" },
    period: "Period",
    periodNote: "earliest to latest record time in the selected deals, as the holder's producer wrote them (producer_asserted)",
    selected: "Deals selected",
    completeness: "Completeness",
    notAsserted: "Not asserted",
    completenessNote: "This is the holder's pick. It does not claim to be all of their deals, for any period.",
    outcome: "Outcome evidence in the selected deals' records",
    outcomeNote: "Each record counts once, under the sealed field and value it came from. A record this copy withholds counts as withheld.",
    computedHere: "Computed by this page from the records in this file. The file states no values of its own.",
    recomputedHere: "Stated in this file and recomputed by this page from the records in it.",
    forbidding: "This card shows properties of the holder's selection and never a score, rating, reputation, rank or trust number.",
    l1: "Each selected deal and its records",
    l1DealId: "Deal",
    l1Copy: "Copy for",
    l1Records: "Records",
    l1Digest: "Matches its selection entry",
    l1Time: "Time",
    l1Bucket: "Outcome evidence",
    l1Id: "Record (capsule id)",
    l2: "How this page checked the file",
    l2Lead: "Each property and what this page found. NOT_CHECKED means this page does not check it; it is not a pass.",
    l2Property: "Property",
    l2Status: "Status",
    l2Holder: "Holder key (signs the selection record)",
    l2Signers: "Keys named by the selected deals' records",
    l2Signing: "This page recomputes record ids, disclosure digests and each deal copy's digest. It does not check a signature, a checkpoint or log membership: capsulectl verify --bundle does, for the History and for each deal in it.",
    property: {
      selection_record: "The selection record is on the history log's bundle, recomputes to its id and its sealed pick matches its digest",
      selection_record_signature: "The selection record's signature",
      history_log: "The history log's checkpoint and the selection record's membership",
      selection_sealed: "The selection the file carries is the sealed one",
      membership: "Every carried deal is selected and every selected deal is carried",
      member_digests: "Each deal copy is the one its selection entry names (digest)",
      audience: "Every copy is for the sealed audience, and that audience is shareable",
      signer_keys: "One key, the holder's, named by every record",
      member_records: "Each deal's records recompute to their ids and their disclosures match",
      member_signatures: "Each deal's record signatures",
      member_logs: "Each deal copy is of its own deal log (checkpoint and membership)",
      values: "Values stated in the file recompute",
    },
    status: {
      PASS: "holds (checked in this page)",
      FAIL: "fails",
      NOT_CHECKED: "not checked by this page",
      NOT_PRESENT: "not in this file",
    },
    notShareableTitle: "Not a shareable History",
    notShareableLead: "This file is not one History a person can be shown: it holds the holder's own copy, deals signed by another key, or deals outside the sealed pick. No card is shown.",
    invalidTitle: "This History does not check",
    invalidLead: "This page found what does not hold in this file, so no card is shown.",
    mismatchTitle: "This History does not recompute",
    mismatchLead: "The values this file states do not follow from the records it carries, so no card is shown.",
    reasons: "What did not hold:",
    finding: {
      history_audience_keep: "the History is the holder's own copy (keep), never one to send",
      history_audience_unknown: "the sealed selection names no audience this page knows",
      deal_audience_keep: "this deal is the holder's own copy (keep)",
      deal_audience_not_selected: "this deal's copy is for another audience than the sealed one",
      deal_signers_differ: "the selected deals' records are signed by more than one key",
      deal_signed_by_other_key: "this deal's records name a key other than the holder's",
      deal_not_in_selection: "this deal is carried but is not in the sealed selection",
      deal_missing: "this deal is in the sealed selection but is not carried",
      deal_bundle_not_the_selected_one: "this deal's copy is not the one the selection names",
      deal_not_a_bundle: "this deal's copy is not an evidence-bundle/v2",
      deal_record_unsigned: "a record of this deal carries no signature",
      deal_record_id_mismatch: "a record of this deal does not recompute to its id",
      deal_disclosure_mismatch: "a disclosure of this deal does not match its digest",
      deal_checkpoint_missing: "this deal's copy carries no checkpoint",
      selection_not_sealed: "the selection the file carries is not the sealed one",
      selection_missing: "the sealed selection names no deal",
      selection_entry_malformed: "a selection entry is malformed",
      selection_record_unverified: "the selection record is missing, or does not match its seal",
      selection_record_unsigned: "the selection record carries no signature",
      history_checkpoint_missing: "the History carries no checkpoint",
      history_not_of_its_log: "the History is not of the holder's history log",
    },
    gloss: {
      none: "a disclosed record with no outcome evidence",
      withheld: "a record this copy withholds",
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

  function isObj(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  function has(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  }

  function safeDigest(value) {
    try { return digest(value); } catch (e) { return null; }
  }

  function same(a, b) {
    try {
      return jcs(a === undefined ? null : a) === jcs(b === undefined ? null : b);
    } catch (e) {
      return false;
    }
  }

  // The x-history-selection/v0 block, as carried (null when absent).
  function selectionBlock(bundle) {
    var ext = obj(obj(bundle).extensions);
    return has(ext, SELECTION_EXTENSION) ? ext[SELECTION_EXTENSION] : null;
  }

  // The selection record's disclosed agent_input (null when not disclosed).
  function sealedSelection(bundle) {
    var id = obj(selectionBlock(bundle)).selection_record;
    if (typeof id !== "string") return null;
    var disclosures = obj(obj(bundle).disclosures);
    var sealed = has(disclosures, id) ? obj(disclosures[id]).agent_input : null;
    return isObj(sealed) ? sealed : null;
  }

  // A deal copy's report, as capsule-cli's sealedOrInlineReport reads it.
  function sealedOrInlineReport(member) {
    var report = obj(obj(obj(member).extensions)[DEAL_PROFILE]);
    var pointer = report[REPORT_POINTER];
    if (typeof pointer === "string") {
      var disclosures = obj(obj(member).disclosures);
      return obj(obj(has(disclosures, pointer) ? obj(disclosures[pointer]).agent_input : null).report);
    }
    return report;
  }

  // Every record of every selected deal copy: the members of "deals" that
  // "selection" names, in selection order, each member's records in its own
  // order, each with that member's disclosed agent_input (null when
  // withheld): [{deal, record, agent_input}]. The twin of
  // capsule_viewer.history.recompute.selected_records.
  function selectedRecords(bundle) {
    var block = obj(selectionBlock(bundle));
    var deals = obj(block.deals);
    var out = [];
    (Array.isArray(block.selection) ? block.selection : []).forEach(function (entry) {
      var deal = obj(entry).deal_id;
      if (typeof deal !== "string" || !has(deals, deal) || !isObj(deals[deal])) return;
      var member = deals[deal];
      var disclosures = obj(member.disclosures);
      (Array.isArray(member.records) ? member.records : []).forEach(function (r) {
        if (!isObj(r)) return;
        var ai = typeof r.capsule_id === "string" && has(disclosures, r.capsule_id) ? obj(disclosures[r.capsule_id]).agent_input : null;
        out.push({ deal: deal, record: r, agent_input: isObj(ai) ? ai : null });
      });
    });
    return out;
  }

  // ---- the values (design section 2) -----------------------------------------

  function bucket(record, agentInput) {
    var body = obj(obj(agentInput).body);
    if (has(body, "outcome")) return "outcome:" + body.outcome;
    if (body.action_class === "money.refund") return "action_class:money.refund";
    var status = obj(record.effect).status;
    if (status) return "effect.status:" + status;
    if (agentInput === null || agentInput === undefined) return "withheld";
    return "none";
  }

  function derive(selected, selectedCount) {
    var breakdown = {};
    selected.forEach(function (s) {
      var b = bucket(s.record, s.agent_input);
      breakdown[b] = (breakdown[b] || 0) + 1;
    });
    var sorted = {};
    Object.keys(breakdown).sort().forEach(function (key) { sorted[key] = breakdown[key]; });
    var times = selected.map(function (s) { return String(s.record.timestamp); }).sort();
    return {
      period: { from: times.length ? times[0] : null, to: times.length ? times[times.length - 1] : null, temporal_provenance: "producer_asserted" },
      selected_count: selectedCount,
      outcome_evidence: sorted,
      completeness: "not_asserted",
    };
  }

  // ---- the check (design section 3) ------------------------------------------

  function signed(record) {
    return !!record.key_id && !!record.signature;
  }

  function preimage(record) {
    var out = {};
    Object.keys(record).forEach(function (k) { if (!CAPSULE_ID_EXCLUDED[k]) out[k] = record[k]; });
    return out;
  }

  function recordFindings(deal, member) {
    var out = [];
    var disclosures = obj(member.disclosures);
    (Array.isArray(member.records) ? member.records : []).forEach(function (raw) {
      var r = obj(raw);
      if (r.capsule_id !== safeDigest(preimage(r))) {
        out.push("deal_record_id_mismatch:" + deal);
        return;
      }
      var disclosed = typeof r.capsule_id === "string" && has(disclosures, r.capsule_id) ? obj(disclosures[r.capsule_id]).agent_input : undefined;
      var bound = obj(obj(r.model_attestation).compute_attestation).agent_input_digest;
      if (disclosed !== undefined && disclosed !== null && safeDigest(disclosed) !== bound) out.push("deal_disclosure_mismatch:" + deal);
    });
    return out.filter(function (f, i) { return out.indexOf(f) === i; }).sort();
  }

  function notShareable(finding) {
    if (finding === "deal_signers_differ" || finding === "history_audience_keep") return true;
    var head = finding.split(":")[0];
    return ["deal_signed_by_other_key", "deal_audience_keep", "deal_not_in_selection", "deal_missing"].indexOf(head) >= 0;
  }

  function show(v) {
    return v === undefined ? "null" : JSON.stringify(v);
  }

  // The whole reading of a bundle: {state, findings, properties, holder_key,
  // audience, signer_keys, deals, values, asserted, mismatches}. values is
  // null unless state is "card".
  function check(bundle) {
    bundle = obj(bundle);
    var block = selectionBlock(bundle);
    var status = {};
    PROPERTIES.forEach(function (p) { status[p] = "PASS"; });
    var failed = [];
    function fail(prop, finding) {
      status[prop] = "FAIL";
      failed.push(finding);
    }

    if (!isObj(block) || bundle.bundle_kind !== "evidence-bundle/v2") {
      var none = {};
      PROPERTIES.forEach(function (p) { none[p] = "NOT_PRESENT"; });
      return {
        state: "invalid", findings: ["no " + SELECTION_EXTENSION + " block in an evidence-bundle/v2"], properties: none,
        holder_key: "", audience: "", signer_keys: {}, deals: [], values: null, asserted: false, mismatches: [],
      };
    }

    var recordId = block.selection_record;
    var records = Array.isArray(bundle.records) ? bundle.records : [];
    var record = null;
    if (typeof recordId === "string") {
      records.forEach(function (r) { if (record === null && obj(r).capsule_id === recordId) record = obj(r); });
    }
    var sealed = sealedSelection(bundle);
    var holder = "";
    if (record === null || sealed === null) {
      status.selection_record = record === null ? "NOT_PRESENT" : "FAIL";
      failed.push("selection_record_unverified");
    } else {
      var bound = obj(obj(record.model_attestation).compute_attestation).agent_input_digest;
      if (record.action_id !== SELECTION_ACTION_ID || record.capsule_id !== safeDigest(preimage(record)) || safeDigest(sealed) !== bound ||
          sealed.type !== "history_selection" || sealed.profile !== SELECTION_EXTENSION) {
        fail("selection_record", "selection_record_unverified");
      }
      holder = typeof record.key_id === "string" ? record.key_id : "";
    }
    if (record !== null && signed(record)) {
      status.selection_record_signature = "NOT_CHECKED";
    } else {
      status.selection_record_signature = "NOT_PRESENT";
      failed.push("selection_record_unsigned");
    }
    var checkpoint = obj(bundle.checkpoint), certificate = obj(bundle.completeness_certificate);
    if (Object.keys(checkpoint).length && Object.keys(certificate).length) {
      status.history_log = "NOT_CHECKED";
      if (checkpoint.log_id !== HISTORY_LOG_ID || certificate.log_id !== HISTORY_LOG_ID) fail("history_log", "history_not_of_its_log");
    } else {
      status.history_log = "NOT_PRESENT";
      failed.push("history_checkpoint_missing");
    }

    sealed = obj(sealed);
    if (!same(block.selection, sealed.selection)) fail("selection_sealed", "selection_not_sealed");
    var audience = typeof sealed.audience === "string" ? sealed.audience : "";

    var listed = Array.isArray(sealed.selection) ? sealed.selection : [];
    if (!listed.length) fail("membership", "selection_missing");
    var picked = {}, order = [];
    listed.forEach(function (raw) {
      var e = obj(raw), deal = e.deal_id, dg = e.bundle_digest;
      if (has(picked, deal) || typeof deal !== "string" || !DEAL_ID.test(deal) || typeof dg !== "string" || !HEX_DIGEST.test(dg)) {
        fail("membership", "selection_entry_malformed:" + (typeof deal === "string" ? deal : ""));
        return;
      }
      picked[deal] = dg;
      order.push(deal);
    });

    if (audience === "keep") fail("audience", "history_audience_keep");
    else if (SHAREABLE_AUDIENCES.indexOf(audience) < 0) fail("audience", "history_audience_unknown");

    var carried = obj(block.deals);
    var signers = {};
    function noteKeys(deal, member) {
      var keys = {}, unsigned = false;
      (Array.isArray(member.records) ? member.records : []).forEach(function (raw) {
        var r = obj(raw);
        if (!signed(r)) unsigned = true;
        if (typeof r.key_id === "string" && r.key_id) keys[r.key_id] = true;
      });
      var list = Object.keys(keys).sort();
      list.forEach(function (key) { (signers[key] = signers[key] || []).push(deal); });
      return { keys: list, unsigned: unsigned };
    }

    Object.keys(carried).filter(function (d) { return !has(picked, d); }).sort().forEach(function (deal) {
      fail("membership", "deal_not_in_selection:" + deal);
      noteKeys(deal, obj(carried[deal]));
    });

    var deals = [];
    var checkpointMissing = false, anyUnsigned = false;
    order.forEach(function (deal) {
      var member = has(carried, deal) ? carried[deal] : null;
      var entry = { deal_id: deal, audience: "", digest: "missing" };
      deals.push(entry);
      if (!isObj(member)) {
        fail("membership", "deal_missing:" + deal);
        return;
      }
      if (member.bundle_kind !== "evidence-bundle/v2" || member.bundle_version !== "2") {
        fail("member_digests", "deal_not_a_bundle:" + deal);
        return;
      }
      if (safeDigest(member) === picked[deal]) {
        entry.digest = "match";
      } else {
        entry.digest = "mismatch";
        fail("member_digests", "deal_bundle_not_the_selected_one:" + deal);
      }
      var copyFor = sealedOrInlineReport(member).audience;
      entry.audience = typeof copyFor === "string" ? copyFor : "";
      if (copyFor !== audience) fail("audience", "deal_audience_not_selected:" + deal);
      if (copyFor === "keep") fail("audience", "deal_audience_keep:" + deal);
      var k = noteKeys(deal, member);
      if (k.unsigned) {
        anyUnsigned = true;
        failed.push("deal_record_unsigned:" + deal);
      }
      k.keys.forEach(function (key) { if (key !== holder) fail("signer_keys", "deal_signed_by_other_key:" + deal); });
      recordFindings(deal, member).forEach(function (f) { fail("member_records", f); });
      if (!Object.keys(obj(member.checkpoint)).length || !Object.keys(obj(member.completeness_certificate)).length) {
        checkpointMissing = true;
        failed.push("deal_checkpoint_missing:" + deal);
      }
    });
    if (Object.keys(signers).length > 1) fail("signer_keys", "deal_signers_differ");
    status.member_signatures = anyUnsigned || !deals.length ? "NOT_PRESENT" : "NOT_CHECKED";
    status.member_logs = checkpointMissing || !deals.length ? "NOT_PRESENT" : "NOT_CHECKED";

    var hasAsserted = has(block, "asserted_result");
    var values = derive(selectedRecords(bundle), order.length);
    var mismatches = [];
    if (hasAsserted) {
      var a = obj(block.asserted_result);
      var extra = Object.keys(a).filter(function (key) { return RECOMPUTED_KEYS.indexOf(key) < 0; }).sort();
      if (extra.length) mismatches.push("asserted_result carries values nothing recomputes: " + show(extra));
      RECOMPUTED_KEYS.forEach(function (key) {
        if (!same(values[key], a[key])) mismatches.push(key + ": recomputed " + show(values[key]) + " != asserted " + show(a[key]));
      });
      status.values = mismatches.length ? "FAIL" : "PASS";
    } else {
      status.values = "NOT_PRESENT";
    }

    var findings = failed.filter(function (f, i) { return failed.indexOf(f) === i; });
    var state = findings.some(notShareable) ? "not_shareable" : findings.length ? "invalid" : mismatches.length ? "mismatch" : "card";
    var sortedSigners = {};
    Object.keys(signers).sort().forEach(function (key) { sortedSigners[key] = signers[key].slice().sort(); });
    return {
      state: state, findings: findings.concat(mismatches), properties: status, holder_key: holder, audience: audience,
      signer_keys: sortedSigners, deals: deals, values: state === "card" ? values : null, asserted: hasAsserted, mismatches: mismatches,
    };
  }

  function recomputeErrors(bundle) {
    return check(bundle).findings;
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

  function findingText(finding) {
    var parts = finding.split(":");
    var words = WORDS.finding[parts[0]];
    if (!words) return finding;
    return parts.length > 1 && parts[1] ? words + " (" + parts.slice(1).join(":") + ")" : words;
  }

  function statusBadge(doc, status) {
    var tone = status === "PASS" ? "cv-tone--positive" : status === "FAIL" ? "cv-tone--negative" : "cv-tone--caution";
    return el(doc, "span", { class: "cv-badge " + tone, "data-status": status }, [status]);
  }

  // L2: every property with its status, the holder key and the keys the deals name.
  function drawChecks(doc, result) {
    var rows = PROPERTIES.map(function (p) {
      var s = result.properties[p];
      return { attrs: { "data-property": p, "data-property-status": s }, cells: [WORDS.property[p], el(doc, "span", {}, [statusBadge(doc, s), " " + WORDS.status[s]])] };
    });
    var signerRows = Object.keys(result.signer_keys).map(function (key) {
      return el(doc, "li", { "data-signer": key }, [el(doc, "span", { class: "cv-mono" }, [key]), ": " + result.signer_keys[key].join(", ")]);
    });
    return drilldown(doc, WORDS.l2, [
      el(doc, "p", {}, [WORDS.l2Lead]),
      table(doc, [WORDS.l2Property, WORDS.l2Status], rows),
      el(doc, "dl", {}, [
        el(doc, "dt", {}, [WORDS.l2Holder]), el(doc, "dd", { class: "cv-mono", "data-holder-key": "true" }, [result.holder_key || "-"]),
        el(doc, "dt", {}, [WORDS.l2Signers]), el(doc, "dd", {}, [el(doc, "ul", {}, signerRows)]),
      ]),
      el(doc, "p", { class: "cv-muted" }, [WORDS.l2Signing]),
    ]);
  }

  function drawCard(doc, result, selected) {
    var v = result.values;
    var outcomeRows = Object.keys(v.outcome_evidence).map(function (name) {
      return el(doc, "li", { "data-bucket": name }, [
        el(doc, "strong", {}, [String(v.outcome_evidence[name])]), " ",
        el(doc, "span", { class: "cv-mono" }, [name]),
        gloss(name) ? el(doc, "span", { class: "cv-muted" }, [" (" + gloss(name) + ")"]) : null,
      ]);
    });
    var l0 = el(doc, "div", { "data-history": "card" }, [
      el(doc, "h2", {}, [WORDS.title]),
      el(doc, "p", {}, [WORDS.lead]),
      el(doc, "p", { "data-history-audience": result.audience }, [WORDS.audience[result.audience] + " (" + result.audience + ")"]),
      el(doc, "div", { class: "cv-metrics-wrap", "data-cv": "metric-grid" }, [
        el(doc, "dl", { class: "cv-metrics" }, [
          metric(doc, WORDS.period, v.period.from + " to " + v.period.to, WORDS.periodNote, "period"),
          metric(doc, WORDS.selected, String(v.selected_count), "", "selected_count"),
          metric(doc, WORDS.completeness, WORDS.notAsserted, WORDS.completenessNote, "completeness"),
        ]),
      ]),
      section(doc, WORDS.outcome, [el(doc, "ul", { "data-history-value": "outcome_evidence" }, outcomeRows), el(doc, "p", { class: "cv-muted" }, [WORDS.outcomeNote])]),
      el(doc, "p", { class: "cv-notice", "data-history-provenance": result.asserted ? "recomputed" : "computed" }, [result.asserted ? WORDS.recomputedHere : WORDS.computedHere]),
      el(doc, "p", { class: "cv-muted", "data-history-forbids": "true" }, [WORDS.forbidding]),
    ]);

    var counts = {};
    selected.forEach(function (s) { counts[s.deal] = (counts[s.deal] || 0) + 1; });
    var dealRows = result.deals.map(function (d) {
      return { attrs: { "data-deal": d.deal_id }, cells: [el(doc, "span", { class: "cv-mono" }, [d.deal_id]), d.audience, String(counts[d.deal_id] || 0), d.digest] };
    });
    var recordRows = selected.map(function (s) {
      return { attrs: { "data-record": s.record.capsule_id }, cells: [String(s.record.timestamp), s.deal, el(doc, "span", { class: "cv-mono" }, [bucket(s.record, s.agent_input)]), el(doc, "span", { class: "cv-mono" }, [String(s.record.capsule_id)])] };
    });
    var l1 = drilldown(doc, WORDS.l1, [
      table(doc, [WORDS.l1DealId, WORDS.l1Copy, WORDS.l1Records, WORDS.l1Digest], dealRows),
      table(doc, [WORDS.l1Time, WORDS.l1DealId, WORDS.l1Bucket, WORDS.l1Id], recordRows),
    ]);
    return [l0, l1, drawChecks(doc, result)];
  }

  function drawRefusal(doc, result) {
    var title = { not_shareable: WORDS.notShareableTitle, invalid: WORDS.invalidTitle, mismatch: WORDS.mismatchTitle }[result.state];
    var lead = { not_shareable: WORDS.notShareableLead, invalid: WORDS.invalidLead, mismatch: WORDS.mismatchLead }[result.state];
    return el(doc, "div", { "data-history": result.state }, [
      el(doc, "h2", {}, [title]),
      el(doc, "p", { class: "cv-notice cv-tone--negative", "data-notice": "history-" + result.state }, [lead]),
      el(doc, "p", {}, [WORDS.reasons]),
      el(doc, "ul", {}, result.findings.map(function (f) {
        return el(doc, "li", { "data-history-error": f }, [findingText(f) + " ", el(doc, "span", { class: "cv-mono cv-muted" }, ["[" + f + "]"])]);
      })),
    ]);
  }

  // ---- the module (presentation contract: canRender, buildModel, render) ------

  function canRender(context) {
    return isObj(selectionBlock(obj(context).bundle));
  }

  // {result: check's reading, selected: selectedRecords}.
  function buildModel(context) {
    var bundle = obj(context).bundle;
    var result;
    try {
      result = check(bundle);
    } catch (e) {
      var none = {};
      PROPERTIES.forEach(function (p) { none[p] = "NOT_CHECKED"; });
      result = { state: "invalid", findings: ["the check could not read this file: " + e.message], properties: none, holder_key: "", audience: "", signer_keys: {}, deals: [], values: null, asserted: false, mismatches: [] };
    }
    return { result: result, selected: result.state === "card" ? selectedRecords(bundle) : [] };
  }

  // Draws into host.L0, host.L1 and host.L2: the card, or only the reason
  // there is none (with the property statuses in L2, no value among them).
  function render(model, host) {
    var doc = host.L0.ownerDocument;
    var r = model.result;
    var parts = r.state === "card" ? drawCard(doc, r, model.selected) : [drawRefusal(doc, r), null, drawChecks(doc, r)];
    [host.L0, host.L1, host.L2].forEach(function (region, i) {
      if (parts[i]) region.appendChild(parts[i]);
    });
    host.L0.setAttribute("data-history-state", r.state);
  }

  var module = { manifest: MANIFEST, canRender: canRender, buildModel: buildModel, render: render };

  root.CapsuleViewerHistory = {
    SELECTION_EXTENSION: SELECTION_EXTENSION,
    PROPERTIES: PROPERTIES,
    MANIFEST: MANIFEST,
    WORDS: WORDS,
    module: module,
    sha256Hex: sha256Hex,
    utf8: utf8,
    jcs: jcs,
    bucket: bucket,
    selectionBlock: selectionBlock,
    sealedSelection: sealedSelection,
    sealedOrInlineReport: sealedOrInlineReport,
    selectedRecords: selectedRecords,
    derive: derive,
    check: check,
    recomputeErrors: recomputeErrors,
  };
  if (typeof root.EvidenceGraph !== "undefined" && root.EvidenceGraph && typeof root.EvidenceGraph.registerPresentation === "function") {
    root.EvidenceGraph.registerPresentation(module);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
