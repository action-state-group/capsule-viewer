// SPDX-License-Identifier: Apache-2.0
// The deal receipt modules, in the page: capsuleviewer.receipt.unilateral/v0,
// capsuleviewer.receipt.seller/v0 and capsuleviewer.receipt.bilateral/v0, as
// module-slot scripts (agent-action-capsule's presentation contract, as
// capsulectl.deal-view/v0 and capsuleviewer.history/v0 are).
//
// This file is the source of the three scripts the manifests pin
// (static/receipt_unilateral.js, receipt_seller.js, receipt_bilateral.js).
// `python -m capsule_viewer.receipt.module_slot --write` writes each one from
// it, filling the lines marked "@generated": the module it registers, its
// manifest, the words (compiled in from the example English wording pack,
// receipt/wording-en.json, whose id and sha256 the page names in L2) and the
// kit stylesheet (static/kit.css, pinned by the manifest's style_sha256).
// Each script carries the whole of this file and registers exactly one
// module: the page builder puts one script in the page per module it chose,
// and a script never registers a module the builder did not choose.
//
// It is the twin of the Python modules (capsule_viewer.receipt: model.py,
// module.py, seller.py, bilateral.py, role.py), which stay the test oracle:
// js-tests/receipt_parity.test.js renders every receipt fixture both ways
// and fails on any difference in the model or the rendered result. Names
// below follow the Python ones, so a reader can hold the two side by side.
//
// It imports nothing and reads no wording pack. UTF-8, SHA-256 and JCS are
// computed here, synchronously. It never verifies: canRender and buildModel
// read the VerifiedBundleContext the page's runtime built (one verification
// run); the gate and every disclosure state arrive decided. Committed words
// are shown only when their opening recomputes to the sealed commitment (the
// presentation contract's sha256-jcs-nonce256, section 7.2). render draws
// into the host's L0, L1 and L2 with createElement and textContent: nothing
// from the bundle is parsed as HTML.
//
// What the page's runtime does not hand a module, and how this reads it:
// * the page's audience: resolution matched the manifest's audiences against
//   it, and the module is not told which it was. A copy is shown as the
//   audience its own sealed report names (a keep copy carries the PRIVATE
//   banner, any other copy never does), never relabelled. The Python twin is
//   given the page's audience and also declines a copy cut for another one.
// * the verifier's witness and countersignature results beyond the context:
//   the page's verifier reports no witness result (so the witness rung says
//   none was reported to this page), and each countersignature as it reports
//   it.
// * a composition's carried copies as contexts of their own: the bilateral
//   module asks the page's runtime to verify each carried copy
//   (EvidenceGraph.buildVerifiedBundleContext), as the Python twin reads each
//   copy's own verifier report. Nothing of one copy fills another.
(function (root) {
  "use strict";

  var KIND = "unilateral"; // @generated KIND
  var MANIFEST = {}; // @generated MANIFEST
  var WORDS = {}; // @generated WORDS
  var PACK = { id: "", sha256: "" }; // @generated PACK
  var KIT_CSS = ""; // @generated KIT_CSS
  // The seller copy's bundle extension kind (capsule_viewer.receipt.role.SELLER_KIND).
  var SELLER_KIND = ""; // @generated SELLER_KIND

  var EXTENSION = "x-deal-v0";
  // Where capsulectl carries a copy's report when it is on no log (capsule-cli#294).
  var STANDALONE_EXTENSION = "x-deal-report/v0";
  var COMPOSED_KIND = "composed/v1";
  var REPORT_TYPE = "deal_report";
  var REPORT_ACTION_ID = "capsulectl-deal-report";
  var ACCEPTANCE_KIND = "counterparty-acceptance-observation";
  var DEPTHS = ["L0", "L1", "L2"];
  var SHARED_AUDIENCES = ["counterparty", "adjudicator"];
  var MAX_SAFE = 9007199254740991;
  var VERIFIER = "the page's verifier (agent-action-capsule)";

  var SECTION_BY_RECORD_TYPE = {
    baseline: "authorized", check: "proposed", verdict: "proposed", approval: "approved",
    action: "acted", claim: "statements", task_authority: "authorized",
  };
  var RECORD_TYPE_BY_TYPED = {
    "proposed-action/v0": "check", "action-evaluation/v0": "verdict", "action-approval/v0": "approval",
    "action-record/v0": "action", "task-authority/v0": "task_authority",
  };
  var SECTION_BY_STEP_KIND = {
    open: "authorized", snapshot: "proposed", check: "proposed", approval: "approved", act: "acted", claim: "statements",
  };
  var EXPONENT = {};
  ["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"].forEach(function (c) { EXPONENT[c] = 0; });
  ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"].forEach(function (c) { EXPONENT[c] = 3; });
  var MERCHANT_ROWS = ["approved", "agent_reported", "charged", "charged_on", "cancel_by", "domains", "key_size"];
  var PROVENANCES = ["seller_observed", "carrier", "buyer_confirmed"];
  var CUTS = { keep: ["keep", "counterparty"], counterparty: ["counterparty"], adjudicator: ["adjudicator"] };
  // sides.CASE_TONE and sides.ACTIONS: a case's tone (never "negative": one
  // side missing is not a finding) and the sentences a holder's page offers.
  var CASE_TONE = { both: "positive", one_sided: "caution", not_agreed: "neutral" };
  var ACTIONS = {
    both: ["actions.dispute", "actions.send", "actions.show_theirs"],
    one_sided: ["actions.send", "actions.ask_again"],
    none: ["actions.send", "actions.ask"],
    not_agreed: ["actions.dispute", "actions.send", "actions.show_theirs"],
  };
  // The kit's closed vocabularies (capsule_viewer.kit.components).
  var DISCLOSURE_STATES = {
    disclosed: ["DISCLOSED", "positive"],
    committed: ["COMMITTED (opening not supplied)", "info"],
    withheld: ["WITHHELD", "caution"],
    not_present: ["NOT PRESENT", "neutral"],
  };
  var VERIFICATION_OUTCOMES = {
    verified: ["Verified", "positive"],
    failed: ["Did not verify", "negative"],
    not_checked: ["Not checked", "neutral"],
  };
  // The composition section's words: agent-action-capsule's composition view
  // (capsule_viewer.composed, after ts/src/composed-view.ts).
  var NOT_APPLICABLE = "—";
  var COMPOSED_SCOPE = "Composition closure covers the declared members only; it is not completeness of participation.";
  var COMPOSED_CUSTODY = "Custody domains are labels declared by whoever composed this block. Identical labels make an agreeing pair " +
    "redundant; distinct labels do not establish that two observers are independent.";

  // ---- JSON as Python reads it ----------------------------------------------
  // The Python twin reads decoded JSON with isinstance checks and Python
  // truthiness; these are the same tests over JavaScript values.

  function own(o, k) { return o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function isMap(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function map(v) { return isMap(v) ? v : {}; }
  function get(o, k) { return own(o, k) ? o[k] : null; }
  function seq(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return typeof v === "string" ? v : null; }
  function int(v) { return typeof v === "number" && Number.isInteger(v) ? v : null; }
  function strings(v) {
    if (typeof v === "string") return [v];
    return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string"; }) : [];
  }
  // Python truthiness of a JSON value.
  function truthy(v) {
    if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  }
  // Python's `a or b`.
  function or(a, b) { return truthy(a) ? a : b; }
  function iter(v) {
    // Python's `for x in v or ()` over a JSON value: an array's items, a
    // string's characters, an object's keys.
    if (!truthy(v)) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") return Array.from(v);
    if (isMap(v)) return Object.keys(v);
    return [];
  }
  // Python's str() of a JSON scalar.
  function pyStr(v) {
    if (v === null || v === undefined) return "None";
    if (v === true) return "True";
    if (v === false) return "False";
    if (typeof v === "string") return v;
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
    return JSON.stringify(v);
  }
  // Python's sorted() order of strings: by code point.
  function codepointCompare(a, b) {
    var x = Array.from(a), y = Array.from(b);
    for (var i = 0; i < Math.min(x.length, y.length); i++) {
      var d = x[i].codePointAt(0) - y[i].codePointAt(0);
      if (d !== 0) return d;
    }
    return x.length - y.length;
  }
  function sortedKeys(o) { return Object.keys(o).sort(codepointCompare); }
  function distinct(list) {
    var out = [];
    list.forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
    return out;
  }

  function Unavailable(message) { this.name = "ReceiptUnavailable"; this.message = message; }
  Unavailable.prototype = Object.create(Error.prototype);

  // ---- SHA-256 (FIPS 180-4), UTF-8 and JCS, synchronous ----------------------

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

  function NotCanonical(message) { this.name = "NotCanonical"; this.message = message; }
  NotCanonical.prototype = Object.create(Error.prototype);

  // UTF-8; a lone surrogate has no UTF-8 form and is refused.
  function utf8(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) {
          c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
          i++;
        }
      }
      if (c >= 0xd800 && c <= 0xdfff) throw new NotCanonical("a string holds a lone surrogate");
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  function jcsString(s) {
    utf8(s); // refuses a lone surrogate before JSON.stringify would escape it
    return JSON.stringify(s);
  }

  // As capsule_viewer.digest.jcs: null, booleans, strings, safe integers,
  // arrays and objects (members by UTF-16 code units, RFC 8785 3.2.3).
  function jcs(v) {
    if (v === null) return "null";
    if (v === true) return "true";
    if (v === false) return "false";
    if (typeof v === "string") return jcsString(v);
    if (typeof v === "number") {
      if (!Number.isInteger(v)) throw new NotCanonical("a JSON float has no canonical form in this profile");
      if (Math.abs(v) > MAX_SAFE) throw new NotCanonical("integer " + v + " is outside +/-" + MAX_SAFE);
      return String(v);
    }
    if (Array.isArray(v)) return "[" + v.map(jcs).join(",") + "]";
    if (typeof v === "object") {
      return "{" + Object.keys(v).sort().map(function (key) { return jcsString(key) + ":" + jcs(v[key]); }).join(",") + "}";
    }
    throw new NotCanonical(typeof v + " is not a JSON value");
  }

  function digestOf(value) { return sha256Hex(utf8(jcs(value))); }

  // capsule_viewer.digest.record_digest: the digest a typed reference names.
  function recordDigest(payload) {
    try {
      return digestOf(payload);
    } catch (e) {
      if (e instanceof NotCanonical) return null;
      throw e;
    }
  }

  // The presentation contract's text binding (section 7.2,
  // sha256-jcs-nonce256): capsule_viewer.binding.check_opening.
  var HEX64 = /^[0-9a-f]{64}$/;
  function checkOpening(committed, nonce, text) {
    if ((nonce === null || nonce === undefined) && (text === null || text === undefined)) return "committed";
    if (!(typeof committed === "string" && HEX64.test(committed))) return "mismatch";
    if (!(typeof nonce === "string" && HEX64.test(nonce) && typeof text === "string")) return "mismatch";
    var recomputed;
    try {
      recomputed = digestOf({ nonce: nonce, text: text });
    } catch (e) {
      if (e instanceof NotCanonical) return "mismatch";
      throw e;
    }
    return recomputed === committed ? "opened" : "mismatch";
  }

  // ---- the page's verifier: agent-action-capsule's VerifiedBundleContext ------

  function claim(c) {
    var o = map(c);
    return { status: typeof o.status === "string" ? o.status : "", findings: Array.isArray(o.findings) ? o.findings : [] };
  }

  // The runtime's gate (presentation-registry.ts bundleVerified).
  function bundleVerified(verification) {
    var v = map(verification);
    var membership = claim(v.perRecordMembership);
    var results = map(v.capsuleResults);
    return claim(v.graphClosure).status === "pass" &&
      claim(v.intervalCoverage).status === "pass" &&
      (membership.status === "pass" || (membership.status === "fail" && membership.findings.length > 0 &&
        membership.findings.every(function (f) { return typeof f === "string" && f.indexOf("membership_record_unbound:") === 0; }))) &&
      Object.keys(results).every(function (id) { return map(results[id]).ok === true; }) &&
      seq(v.disclosures).every(function (d) { return map(d).status === "disclosure_match" || map(d).status === "withheld"; });
  }

  var OUTCOME_OF = { pass: "verified", fail: "failed", withheld: "not_checked" };

  // What the page's verifier reported, as the kit's VerificationResult.
  function pageVerification(context) {
    var v = map(map(context).verification);
    var checks = [["graph closure", v.graphClosure], ["interval coverage", v.intervalCoverage], ["per record membership", v.perRecordMembership]]
      .map(function (pair) {
        var c = claim(pair[1]);
        return { name: pair[0], outcome: own(OUTCOME_OF, c.status) ? OUTCOME_OF[c.status] : "failed", detail: c.findings.map(String).join(", ") };
      });
    return { verifier: VERIFIER, outcome: bundleVerified(v) ? "verified" : "failed", checks: checks };
  }

  // capsulectl's status for the x-deal-v0 check when it names the report as
  // standalone. A page runtime that does not interpret x-deal-v0 reports none.
  function reportChecked(verification) {
    var entry = seq(map(verification).extensions).map(map).find(function (e) { return e.kind === EXTENSION && e.report === "standalone"; });
    return entry !== undefined && typeof entry.status === "string" ? entry.status : null;
  }

  function pageAssurance(context) {
    var c = map(context);
    var v = map(c.verification);
    return {
      bundle_digest: typeof v.bundleDigest === "string" ? v.bundleDigest : null,
      witnesses: "absent",
      countersignatures: seq(c.countersignatures).map(function (x) { return isMap(x) && typeof x.status === "string" ? x.status : "unknown"; }),
      report_checked: reportChecked(v),
    };
  }

  // A carried copy, verified by the page's runtime on its own.
  function pageMemberContext(bundle) {
    var graph = root.EvidenceGraph;
    if (!graph || typeof graph.buildVerifiedBundleContext !== "function") {
      throw new Unavailable("the page's runtime offers no verifier for a carried copy");
    }
    return graph.buildVerifiedBundleContext(bundle);
  }

  // The context, read as the Python twin's VerifiedBundleContext is read.
  function view(context, env) {
    var c = map(context);
    var bundle = map(c.bundle);
    var records = seq(c.records).map(function (r) { return map(r).capsule_id; }).filter(function (id) { return typeof id === "string"; });
    var resolved = c.resolvedDisclosures;
    var verification = env.verification(context);
    var disclosed = function (id, member) {
      var entry = resolved && typeof resolved.get === "function" ? resolved.get(id) : undefined;
      var r = entry ? entry[member] : undefined;
      return r && r.state === "disclosed" ? (r.payload === undefined ? null : r.payload) : null;
    };
    var mismatch = records.some(function (id) {
      var entry = resolved && typeof resolved.get === "function" ? resolved.get(id) : undefined;
      return !!entry && ["agent_input", "agent_output"].some(function (m) { return entry[m] && entry[m].state === "disclosure_mismatch"; });
    });
    return {
      context: context,
      bundle: bundle,
      root: typeof c.root === "string" ? c.root : null,
      records: records,
      disclosed: disclosed,
      memberships: map(map(c.completeness).memberships),
      verification: verification,
      verified: verification.outcome === "verified" && !mismatch,
      assurance: env.assurance(context),
    };
  }

  // ---- which side of a deal a copy is from (role.py) ------------------------

  function sellerKindEngaged(v) {
    return own(map(v.bundle.extensions), SELLER_KIND);
  }

  function sealedPartyRole(v) {
    var roles = [];
    v.records.forEach(function (cid) {
      var payload = map(v.disclosed(cid, "agent_input"));
      var block = map(get(payload, EXTENSION));
      if (get(block, "record_type") !== "baseline" || get(block, "seq") !== 1) return;
      var intent = map(get(map(get(payload, "body")), "intent"));
      roles.push(own(intent, "party_role") ? intent.party_role : "buyer");
    });
    if (roles.length !== 1 || (roles[0] !== "buyer" && roles[0] !== "seller")) return null;
    return roles[0];
  }

  function sellerOnly(payload) {
    var body = map(get(payload, "body"));
    var kind = or(get(payload, "type"), get(map(get(payload, EXTENSION)), "record_type"));
    if (["proposed-action/v0", "action-record/v0", "check", "action"].indexOf(kind) >= 0) return get(body, "action") === "offer";
    if (kind === "action-approval/v0") return get(body, "kind") === ACCEPTANCE_KIND;
    if (kind === "task-authority/v0") return own(body, "sale_authority_commitment");
    return false;
  }

  function sealedSide(v) {
    var role = sealedPartyRole(v);
    if (role !== null) return role;
    for (var i = 0; i < v.records.length; i++) {
      if (sellerOnly(map(v.disclosed(v.records[i], "agent_input")))) return "seller";
    }
    return null;
  }

  // ---- the receipt model (model.py) -----------------------------------------

  function formatAmount(minor, currency) {
    var exponent = own(EXPONENT, currency) ? EXPONENT[currency] : 2;
    var sign = minor < 0 ? "-" : "";
    var abs = Math.abs(minor);
    var scale = Math.pow(10, exponent);
    var whole = Math.floor(abs / scale);
    var part = abs % scale;
    if (!exponent) return sign + whole + " " + currency;
    return sign + whole + "." + String(part).padStart(exponent, "0") + " " + currency;
  }

  function fact(name, value, kind) { return { name: name, value: value, kind: kind || "token" }; }

  function amountFact(name, minor, currency) {
    var m = int(minor), c = str(currency);
    return m !== null && c ? fact(name, formatAmount(m, c), "amount") : null;
  }

  function token(name, value) {
    if (typeof value === "boolean") return fact(name, value ? "true" : "false");
    if (typeof value === "number" && Number.isInteger(value)) return fact(name, String(value), "count");
    if (typeof value === "string" && value) return fact(name, value);
    if (Array.isArray(value) && value.length && value.every(function (x) { return typeof x === "string"; })) return fact(name, value.join(", "));
    return null;
  }

  function facts(recordType, body) {
    var terms = map(get(body, "terms"));
    var currency = or(get(body, "currency"), get(terms, "currency"));
    var found;
    if (recordType === "baseline") {
      var intent = map(get(body, "intent"));
      var asked = map(get(intent, "asked"));
      found = [token("deal_type", get(body, "deal_type"))]
        .concat(sortedKeys(asked).map(function (key) { return token("asked." + key, asked[key]); }))
        .concat([
          token("allowed", get(intent, "allowed")),
          token("item", get(terms, "item")),
          token("quantity", get(terms, "quantity")),
          amountFact("price", get(terms, "price_minor"), get(terms, "currency")),
          token("expect_close_by", get(body, "expect_close_by")),
        ]);
    } else if (recordType === "check") {
      found = [
        token("action", get(body, "action")),
        token("action_class", get(body, "action_class")),
        amountFact("amount", get(body, "amount_minor"), currency),
        amountFact("authorized_max", get(body, "authorized_max_minor"), currency),
        token("item", get(terms, "item")),
        token("quantity", get(terms, "quantity")),
        token("material_fields_changed", get(body, "material_fields_changed")),
        token("offer_fields_changed", get(body, "offer_fields_changed")),
      ];
    } else if (recordType === "verdict") {
      var differences = get(body, "differences");
      found = [
        token("result", get(body, "result")),
        token("disposition", get(body, "disposition")),
        Array.isArray(differences) ? fact("differences", String(differences.length), "count") : null,
        token("judge", get(map(get(body, "judge")), "kind")),
        token("rules", get(map(get(body, "rules")), "status")),
        token("notes", get(body, "notes")),
      ];
    } else if (recordType === "approval") {
      found = [token("approver", get(body, "approver")), token("choice", get(body, "choice"))];
    } else if (recordType === "action") {
      found = [
        token("action", get(body, "action")),
        amountFact("amount", get(body, "amount_minor"), currency),
        token("direction", get(body, "direction")),
        token("rail", get(body, "rail")),
      ];
    } else if (recordType === "claim") {
      found = [token("class", get(body, "class")), token("source_kind", get(body, "source_kind"))];
    } else {
      found = [];
    }
    return found.filter(function (f) { return f !== null; });
  }

  function item(text, steps, at, flagged) {
    return { text: text, steps: steps || [], at: at === undefined ? null : at, flagged: !!flagged };
  }

  function items(raw, stepsKey) {
    var out = [];
    seq(raw).forEach(function (entry) {
      entry = map(entry);
      var text = str(get(entry, "text"));
      if (text !== null) out.push(item(text, strings(get(entry, stepsKey || "steps")), str(get(entry, "at"))));
    });
    return out;
  }

  function pyStrip(s) { return s.replace(/^\s+|\s+$/g, ""); }

  function deadline(d) {
    var when = or(str(get(d, "cancel_by")), or(str(get(d, "due_by")), ""));
    var marking = or(str(get(d, "marking")), or(str(get(d, "status")), ""));
    var text = pyStrip(when + " · " + marking + ": " + or(str(get(d, "text")), "") + ". " + or(str(get(d, "holds")), ""));
    return item(text, [], null, get(d, "status") === "open" || get(d, "status") === "carried_at_close");
  }

  function merchant(m) {
    var rows = MERCHANT_ROWS.filter(function (key) { return truthy(str(get(m, key))); }).map(function (key) { return [key, or(str(get(m, key)), "")]; });
    var its = strings(get(m, "items"));
    if (its.length) rows.push(["items", its.join(" · ")]);
    return {
      order_id: str(get(m, "order_id")),
      verified: get(m, "verified") === true,
      merchant_says: or(str(get(m, "merchant_says")), ""),
      we_say: or(str(get(m, "we_say")), ""),
      key_supplied: get(m, "key_source") === "supplied",
      approved_basis: str(get(m, "approved_basis")),
      rows: rows,
      steps: strings(get(m, "steps")),
    };
  }

  function told(t) {
    var parts = [str(get(t, "text")), str(get(t, "at")), str(get(t, "authority_text"))].filter(truthy);
    return item(parts.join(" · "), strings(get(t, "steps")), null, get(t, "authority") === "none");
  }

  // The errand's journey as the sealed report states it (model.py Move).
  function journeyOf(raw) {
    var out = [];
    seq(raw).forEach(function (e) {
      if (!isMap(e)) return;
      var entry = map(e);
      // A move with no key is still a move: capsulectl's page lists it as who moved, with no label.
      var key = or(str(get(entry, "key")), "");
      var facts = map(get(entry, "facts"));
      var pairs = [];
      Object.keys(facts).forEach(function (name) {
        var value = str(facts[name]);
        if (value !== null) pairs.push([name, value]);
      });
      out.push({ by: or(str(get(entry, "by")), ""), key: key, step: str(get(entry, "step")), facts: pairs, classes: Array.isArray(get(facts, "classes")) ? strings(get(facts, "classes")) : null });
    });
    return out;
  }

  function report(capsuleId, raw) {
    var life = map(get(raw, "lifecycle"));
    var deadlines = seq(get(raw, "deadlines")).map(map);
    var anomalies = seq(get(raw, "anomalies")).map(map);
    var side = function (name) {
      return anomalies.filter(function (a) { return get(a, "side") === name; })
        .map(function (a) { return item(or(str(get(a, "text")), ""), strings(get(a, "steps")), null, true); });
    };
    return {
      capsule_id: capsuleId,
      audience: or(str(get(raw, "audience")), ""),
      state: str(get(life, "state")),
      did: items(get(raw, "did")),
      money: str(get(map(get(raw, "money")), "text")),
      lifecycle: str(get(life, "text")),
      later: items(get(life, "later"), "capsule_id"),
      may_change: str(get(life, "may_change")),
      as_of: str(get(life, "as_of")),
      scope: str(get(raw, "scope")),
      did_line: str(get(raw, "did_line")),
      instructions: str(get(raw, "instructions")),
      told: seq(get(raw, "told")).map(function (t) { return told(map(t)); }),
      deadlines: deadlines.map(deadline),
      deadline_note: deadlines.length ? str(get(deadlines[0], "note")) : null,
      cancellations: seq(get(raw, "cancellations")).map(map).map(function (c) {
        return { proven: strings(get(c, "proven")), not_proven: strings(get(c, "not_proven")), confirmed: get(c, "merchant") === "confirmed", steps: strings(get(c, "steps")) };
      }),
      merchant: seq(get(raw, "merchant")).map(function (m) { return merchant(map(m)); }),
      email_scope: str(get(raw, "email_scope")),
      agent_anomalies: side("agent"),
      counterparty_anomalies: side("counterparty"),
      withheld: strings(get(raw, "withheld")),
      journey: journeyOf(get(raw, "journey")),
    };
  }

  // The context, read once: headers by id and disclosed deal payloads.
  function Reader(v) {
    this.v = v;
    var headers = new Map();
    seq(v.bundle.records).map(map).forEach(function (r) {
      if (typeof r.capsule_id === "string") headers.set(r.capsule_id, r);
    });
    this.headers = headers;
  }
  Reader.prototype.payload = function (cid) {
    var value = this.v.disclosed(cid, "agent_input");
    return isMap(value) ? value : null;
  };
  Reader.prototype.disclosure = function (cid) {
    if (!this.headers.has(cid)) return "not_present";
    return this.payload(cid) !== null ? "disclosed" : "withheld";
  };
  Reader.prototype.isReport = function (cid) {
    var payload = this.payload(cid);
    if (payload !== null) return get(payload, "type") === REPORT_TYPE;
    return get(this.headers.get(cid) || {}, "action_id") === REPORT_ACTION_ID;
  };
  Reader.prototype.log = function (cid) {
    var coords = map(get(map(get(this.v.memberships, cid)), "log_coordinates"));
    var logId = str(get(coords, "log_id")), s = int(get(coords, "seq")), leaf = int(get(coords, "leaf_index"));
    return logId !== null && s !== null && leaf !== null ? { log_id: logId, seq: s, leaf_index: leaf } : null;
  };
  // The named report is the standalone record, not a record on the log.
  Reader.prototype.standalone = function () {
    var extensions = map(get(this.v.bundle, "extensions"));
    var named = str(get(map(get(extensions, EXTENSION)), "sealed_report"));
    return named !== null && !this.headers.has(named) && own(extensions, STANDALONE_EXTENSION);
  };
  // The report in x-deal-report/v0 when it is the named one; null when `named`
  // is a record on the log. This script cannot check that record's signature:
  // it is read only when capsulectl verify reported the check as passed
  // (assurance.report_checked), and shown with that reported status only.
  Reader.prototype.standaloneReport = function (named) {
    var self = this;
    if (this.headers.has(named)) return null;
    var block = map(get(map(get(this.v.bundle, "extensions")), STANDALONE_EXTENSION));
    var record = map(get(block, "record"));
    if (get(record, "capsule_id") !== named || Object.keys(block).sort().join() !== "agent_input,record" || get(record, "action_id") !== REPORT_ACTION_ID) {
      throw new Unavailable("the named report " + named + " is neither a record in the bundle nor the one in " + STANDALONE_EXTENSION);
    }
    if (this.v.assurance.report_checked !== "pass") throw new Unavailable("the verifier did not report a passing check of the standalone report");
    if (this.v.records.some(function (cid) { return self.isReport(cid); })) throw new Unavailable("a standalone report and a report record are both in the bundle");
    var content = map(get(block, "agent_input"));
    var rep = get(content, "report");
    if (get(content, "type") !== REPORT_TYPE || !isMap(rep)) throw new Unavailable("the standalone report carries no report object");
    return rep;
  };
  Reader.prototype.sealedReport = function () {
    var self = this;
    var extension = map(get(map(get(this.v.bundle, "extensions")), EXTENSION));
    var named = str(get(extension, "sealed_report"));
    if (named === null) throw new Unavailable("the x-deal-v0 extension names no sealed report");
    var standalone = this.standaloneReport(named);
    if (standalone !== null) return [named, standalone];
    var disclosed = this.v.records.filter(function (cid) { return self.isReport(cid) && self.payload(cid) !== null; });
    if (!(disclosed.length === 1 && disclosed[0] === named)) {
      throw new Unavailable("disclosed deal reports are not exactly the named one, " + named);
    }
    var rep = get(this.payload(named) || {}, "report");
    if (!isMap(rep)) throw new Unavailable("the sealed report carries no report object");
    return [named, rep];
  };

  function stepOf(reader, cid, entry) {
    var payload = reader.payload(cid);
    var recordType = null;
    var body = {};
    if (payload !== null) {
      var typed = str(get(payload, "type"));
      recordType = or(str(get(map(get(payload, EXTENSION)), "record_type")),
        or(str(get(payload, "record_type")), typed !== null && own(RECORD_TYPE_BY_TYPED, typed) ? typed : null));
      body = map(get(payload, "body"));
    }
    var key = or(recordType, "");
    var kind = own(RECORD_TYPE_BY_TYPED, key) ? RECORD_TYPE_BY_TYPED[key] : recordType;
    var section;
    if (kind !== null) section = own(SECTION_BY_RECORD_TYPE, kind) ? SECTION_BY_RECORD_TYPE[kind] : "other";
    else {
      var stepKind = or(str(get(entry, "kind")), "");
      section = own(SECTION_BY_STEP_KIND, stepKind) ? SECTION_BY_STEP_KIND[stepKind] : "other";
    }
    return {
      capsule_id: cid,
      disclosure: reader.disclosure(cid),
      section: section,
      record_type: recordType,
      log: reader.log(cid),
      key_id: str(get(reader.headers.get(cid) || {}, "key_id")),
      facts: facts(kind, body),
      line: str(get(entry, "line")),
      at: str(get(entry, "at")),
      n: int(get(entry, "n")),
    };
  }

  function producerOf(payload) {
    var producer = map(or(get(map(get(payload, EXTENSION)), "producer"), get(payload, "producer")));
    var version = str(get(producer, "version"));
    if (version === null) return null;
    return or(str(get(producer, "name")), "capsulectl") + " " + version + " (" + or(str(get(producer, "commit")), "unknown") + ")";
  }

  function committed(reader, stepId, commitmentOf, nonce, text, label) {
    label = label === undefined ? null : label;
    if (stepId === null || reader.disclosure(stepId) === "not_present") return { state: "not_present", step: stepId, text: null, label: label };
    var payload = reader.payload(stepId);
    if (payload === null) return { state: "withheld", step: stepId, text: null, label: label };
    var state = checkOpening(commitmentOf(payload), nonce, text);
    return { state: state, step: stepId, text: state === "opened" ? str(text) : null, label: label };
  }

  function askedOf(reader, raw) {
    var opening = map(get(raw, "asked_opening"));
    return committed(reader, str(get(raw, "asked_step")), function (p) {
      return get(map(get(map(get(p, "body")), "intent")), "verbatim_commitment");
    }, get(opening, "nonce"), get(opening, "text"));
  }

  function statementsOf(reader, raw) {
    return seq(get(raw, "representations")).map(map).map(function (r) {
      var index = int(get(r, "index"));
      var claimOf = function (payload) {
        var body = map(get(payload, "body"));
        if (index === null) return body;
        var claims = seq(get(body, "claims"));
        return index >= 0 && index < claims.length ? map(claims[index]) : {};
      };
      var commitmentOf = function (payload) {
        var c = claimOf(payload);
        return get(c, "source_kind") === "agent" ? get(c, "text_commitment") : null;
      };
      var stepId = str(get(r, "step"));
      var payload = stepId ? reader.payload(stepId) : null;
      var label = payload !== null ? str(get(claimOf(payload), "class")) : null;
      return committed(reader, stepId, commitmentOf, get(r, "nonce"), get(r, "text"), label);
    });
  }

  function partOf(step, name) {
    if (step === null || step === undefined) return "not_present";
    if (step.disclosure !== "disclosed") return step.disclosure;
    for (var i = 0; i < step.facts.length; i++) if (step.facts[i].name === name) return step.facts[i];
    return "not_present";
  }

  function headlineOf(steps, rootId, rep) {
    var opened = steps.find(function (s) { return s.section === "authorized"; }) || null;
    var it = partOf(opened, "item");
    if (it === "not_present") it = partOf(opened, "asked.item");
    var rootStep = steps.find(function (s) { return s.capsule_id === rootId; }) || null;
    var acted = rootStep !== null && rootStep.section === "acted" ? rootStep : (steps.slice().reverse().find(function (s) { return s.section === "acted"; }) || null);
    return { deal_type: partOf(opened, "deal_type"), item: it, amount: partOf(acted, "amount"), state: rep.state };
  }

  function stepIn(model, cid) {
    return model.steps.find(function (s) { return s.capsule_id === cid; }) || null;
  }

  function copyAudience(v) {
    var raw = new Reader(v).sealedReport()[1];
    var audience = str(get(raw, "audience"));
    if (audience === null) throw new Unavailable("the sealed report names no audience");
    return audience;
  }

  function namedDeals(v) {
    var named = [];
    v.records.forEach(function (cid) {
      var payload = v.disclosed(cid, "agent_input");
      if (!isMap(payload)) return;
      var deal = or(str(get(map(get(payload, EXTENSION)), "deal_id")), or(str(get(payload, "deal_id")), str(get(payload, "chain_id"))));
      if (deal !== null && named.indexOf(deal) < 0) named.push(deal);
    });
    return named.sort(codepointCompare);
  }

  // model.build_receipt. `audience` null: the copy's own (see the file comment).
  function buildReceipt(v, audience) {
    if (!v.verified) throw new Unavailable("the bundle did not verify");
    var reader = new Reader(v);
    var sealed = reader.sealedReport();
    var reportId = sealed[0], raw = sealed[1];
    var rep = report(reportId, raw);
    if (audience !== null && rep.audience !== audience) throw new Unavailable("this copy was cut for " + rep.audience + ", not " + audience);

    var entries = new Map();
    seq(get(raw, "steps")).map(map).forEach(function (e) {
      var cid = str(get(e, "capsule_id"));
      if (cid !== null) entries.set(cid, e);
    });
    var order = v.records.filter(function (cid) { return !reader.isReport(cid); });
    var cited = Array.from(entries.keys());
    rep.did.concat(rep.told, rep.later).forEach(function (i) { cited = cited.concat(i.steps); });
    cited.forEach(function (cid) {
      if (order.indexOf(cid) < 0 && !reader.isReport(cid)) order.push(cid);
    });
    var steps = order.map(function (cid) { return stepOf(reader, cid, entries.has(cid) ? entries.get(cid) : {}); });
    v.records.forEach(function (cid) {
      if (!reader.isReport(cid)) return;
      steps.push({
        capsule_id: cid, disclosure: reader.disclosure(cid), section: "report", record_type: cid === reportId ? REPORT_TYPE : null,
        log: reader.log(cid), key_id: str(get(reader.headers.get(cid), "key_id")), facts: [], line: null, at: null, n: null,
      });
    });

    var payloads = v.records.map(function (cid) { return reader.payload(cid); }).filter(function (p) { return p !== null; });
    var demo = payloads.some(function (p) {
      return get(map(get(p, EXTENSION)), "record_type") === "baseline" && get(map(get(p, "body")), "demo") === true;
    });
    return {
      deal_id: or(str(get(raw, "deal_id")), ""),
      demo: demo,
      headline: headlineOf(steps, v.root, rep),
      asked: askedOf(reader, raw),
      statements: statementsOf(reader, raw),
      steps: steps,
      report: rep,
      producers: distinct(payloads.map(producerOf)),
      bundle_digest: v.assurance.bundle_digest,
      witnessed: v.assurance.witnesses,
      countersignatures: v.assurance.countersignatures,
      verification: v.verification,
      report_checked: reader.standalone() ? or(str(v.assurance.report_checked), null) : null,
    };
  }

  // ---- the seller model (seller.py) -----------------------------------------

  function sellerAmount(body, minorKey) {
    var minor = get(body, minorKey || "amount_minor"), currency = str(get(body, "currency"));
    if (typeof minor === "number" && Number.isInteger(minor) && currency) return fact("amount", formatAmount(minor, currency), "amount");
    return null;
  }

  function recordTypeOf(payload) {
    return or(str(get(payload, "type")), str(get(map(get(payload, EXTENSION)), "record_type")));
  }

  function refDigests(payload, rel) {
    var refs = or(get(payload, "refs"), get(map(get(payload, EXTENSION)), "refs"));
    var out = [];
    seq(refs).forEach(function (ref) {
      ref = map(ref);
      var digest = str(get(ref, "digest"));
      if (get(ref, "rel") === rel && digest !== null) out.push(digest);
    });
    return out;
  }

  function commitmentsOf(step, body, prefix) {
    prefix = prefix || "";
    var out = [];
    sortedKeys(body).forEach(function (key) {
      var value = body[key];
      if (key.slice(-"_commitment".length) === "_commitment") {
        var c = str(value);
        if (c !== null) out.push([step, prefix + key, c]);
        return;
      }
      out = out.concat(commitmentsOf(step, map(value), prefix + key + "."));
    });
    return out;
  }

  function buildSeller(v, audience) {
    if (!sellerKindEngaged(v)) throw new Unavailable("the copy does not engage " + SELLER_KIND);
    var role = sealedSide(v);
    if (role !== "seller") throw new Unavailable("the copy engages " + SELLER_KIND + " and its sealed records show side " + role + ", not seller");
    var receipt = buildReceipt(v, audience);
    var raw = new Reader(v).sealedReport()[1];

    var payloads = new Map();
    receipt.steps.forEach(function (step) {
      var payload = v.disclosed(step.capsule_id, "agent_input");
      if (isMap(payload) && step.section !== "report") payloads.set(step.capsule_id, payload);
    });
    var kindOf = new Map();
    iter(get(raw, "steps")).map(map).forEach(function (entry) {
      var cid = str(get(entry, "capsule_id")), kind = str(get(entry, "kind"));
      if (cid !== null && kind !== null) kindOf.set(cid, kind);
    });
    var bodies = function (recordType) {
      var out = [];
      payloads.forEach(function (p, cid) { if (recordTypeOf(p) === recordType) out.push([cid, map(get(p, "body"))]); });
      return out;
    };
    var withheld = function (kind) {
      return receipt.steps.filter(function (s) { return s.disclosure === "withheld" && kindOf.get(s.capsule_id) === kind; }).map(function (s) { return s.capsule_id; });
    };
    var byDigest = new Map();
    var digestOfPayload = new Map();
    payloads.forEach(function (p, cid) {
      var d = recordDigest(p);
      digestOfPayload.set(cid, d);
      if (d !== null) byDigest.set(d, cid);
    });

    var acceptances = [];
    bodies("action-approval/v0").forEach(function (pair) {
      var cid = pair[0], body = pair[1];
      if (get(body, "kind") !== ACCEPTANCE_KIND) return;
      var named = str(get(map(get(body, "proposed_action_ref")), "digest"));
      acceptances.push({
        step: cid, channel: str(get(body, "channel")), observed_at: str(get(body, "observed_at")), offer_digest: named,
        offer: named && byDigest.has(named) ? byDigest.get(named) : null,
      });
    });

    var proposed = bodies("proposed-action/v0").filter(function (pair) { return ["offer", "commit"].indexOf(get(pair[1], "action")) >= 0; });
    var supersededBy = new Map();
    proposed.forEach(function (pair) {
      refDigests(payloads.get(pair[0]), "supersedes").forEach(function (d) {
        var old = byDigest.get(d);
        if (truthy(old)) supersededBy.set(old, pair[0]);
      });
    });
    var acceptedBy = new Map();
    acceptances.forEach(function (a) { if (a.offer !== null) acceptedBy.set(a.offer, a.step); });
    var offers = proposed.map(function (pair) {
      var cid = pair[0], body = pair[1];
      var supersedes = null;
      var refs = refDigests(payloads.get(cid), "supersedes");
      for (var i = 0; i < refs.length; i++) if (byDigest.has(refs[i])) { supersedes = byDigest.get(refs[i]); break; }
      return {
        step: cid, action: pyStr(get(body, "action")), amount: sellerAmount(body), digest: digestOfPayload.get(cid),
        supersedes: supersedes, superseded_by: supersededBy.has(cid) ? supersededBy.get(cid) : null,
        accepted_by: acceptedBy.has(cid) ? acceptedBy.get(cid) : null,
      };
    });

    var evidence = bodies("evidence").map(function (pair) {
      return { step: pair[0], disclosure: "disclosed", source: str(get(pair[1], "source")), verified: get(pair[1], "verified") === true };
    }).concat(withheld("evidence").map(function (cid) { return { step: cid, disclosure: "withheld", source: null, verified: null }; }));

    var handover = { state: "not_present", step: null, facts: [] };
    var delivered = bodies("action-outcome/v0").map(function (pair) { return [pair[0], map(get(pair[1], "delivered"))]; })
      .filter(function (pair) { return truthy(pair[1]); });
    if (delivered.length) {
      var last = delivered[delivered.length - 1];
      var terms = last[1];
      var hf = ["item", "quantity"].filter(function (k) { return own(terms, k); })
        .map(function (k) { return fact(k, pyStr(terms[k]), k === "quantity" ? "count" : "token"); });
      var price = sellerAmount(terms, "price_minor");
      if (price) hf.push(fact("price", price.value, "amount"));
      handover = { state: "recorded", step: last[0], facts: hf };
    } else if (withheld("outcome").length) {
      var wo = withheld("outcome");
      handover = { state: "withheld", step: wo[wo.length - 1], facts: [] };
    }

    var closes = bodies("close");
    var outcome = closes.length ? str(get(closes[closes.length - 1][1], "outcome")) : null;

    var baselines = bodies("baseline");
    var opening = baselines.length ? baselines[0][1] : {};
    var authorities = bodies("task-authority/v0");
    var authorityBody = authorities.length ? authorities[0][1] : {};
    var intent = map(get(opening, "intent"));
    var oterms = map(get(opening, "terms"));
    var it = truthy(str(get(oterms, "item"))) ? fact("item", oterms.item) : "not_present";
    if (typeof it === "string" && truthy(str(get(map(get(intent, "asked")), "item")))) it = fact("item", pyStr(map(get(intent, "asked")).item));

    var commits = offers.filter(function (o) { return o.action === "commit"; });
    var acted = bodies("action-record/v0").filter(function (pair) { return get(pair[1], "action") === "commit"; }).map(function (pair) { return pair[1]; });
    var amount = "not_present";
    if (acted.length && sellerAmount(acted[acted.length - 1])) amount = sellerAmount(acted[acted.length - 1]) || "not_present";
    else if (commits.length && commits[commits.length - 1].amount) amount = commits[commits.length - 1].amount;
    else if (receipt.steps.some(function (s) { return kindOf.get(s.capsule_id) === "act" && s.disclosure === "withheld"; })) amount = "withheld";

    var boundsSealed = truthy(or(str(get(authorityBody, "bounds_commitment")), str(get(intent, "bounds_commitment"))));
    var floor;
    if (truthy(get(raw, "bounds_openings"))) floor = "committed";
    else if (boundsSealed || withheld("task_authority").length || withheld("open").length) floor = "withheld";
    else floor = "not_present";

    var isAddress = function (f) { return get(map(f), "class") === "address"; };
    var addressSteps = [];
    iter(get(raw, "told")).map(map).forEach(function (t) {
      if (!iter(get(t, "fields")).some(isAddress)) return;
      iter(get(t, "steps")).map(str).forEach(function (cid) {
        if (cid !== null && kindOf.get(cid) === "disclosure") addressSteps.push(cid);
      });
    });
    bodies("disclosure").forEach(function (pair) {
      if (iter(get(pair[1], "fields")).some(isAddress) && addressSteps.indexOf(pair[0]) < 0) addressSteps.push(pair[0]);
    });
    var address;
    if (addressSteps.some(function (cid) { return payloads.has(cid); })) address = "committed";
    else if (addressSteps.length) address = "withheld";
    else address = "not_present";

    var authority = [
      truthy(get(authorityBody, "allowed_actions")) ? fact("allowed_actions", iter(authorityBody.allowed_actions).map(pyStr).join(", ")) : null,
      truthy(str(get(authorityBody, "outcome_id"))) ? fact("outcome_id", authorityBody.outcome_id) : null,
    ].filter(function (f) { return f !== null; });
    var commitments = [];
    payloads.forEach(function (p, cid) { commitments = commitments.concat(commitmentsOf(cid, map(get(p, "body")))); });
    var keys = distinct(receipt.steps.map(function (s) { return s.key_id; }).filter(truthy));
    return {
      receipt: receipt,
      item: truthy(opening) || !withheld("open").length ? it : "withheld",
      amount: amount,
      outcome: outcome,
      floor: floor,
      address: address,
      authority: authority,
      offers: offers,
      acceptances: acceptances,
      evidence: evidence,
      handover: handover,
      commitments: commitments,
      keys: keys,
    };
  }

  // ---- the composition (composed.py, bilateral.py) ---------------------------

  function pyStrings(v) { return seq(v).map(pyStr); }
  function pair(v) { var s = pyStrings(v).concat(["", ""]); return [s[0], s[1]]; }
  function pyClaim(c) { var o = map(c); return { status: pyStr(get(o, "status")), findings: pyStrings(get(o, "findings")) }; }

  // The page verifier's composed/v1 result (context.extensions[].composed, in
  // agent-action-capsule's ComposedResult shape), as composed.py's Composition.
  function compositionOf(v) {
    var entry = seq(map(v.context).extensions).find(function (e) { return get(map(e), "kind") === COMPOSED_KIND; });
    if (entry === undefined) return null;
    var raw = map(get(map(entry), "composed"));
    if (!truthy(raw)) throw new Unavailable("the page's verifier names a composed/v1 block and carries no result for it");
    if (get(raw, "malformed") === true || !own(raw, "composedDigest")) {
      return {
        status: pyStr(get(raw, "status")), findings: pyStrings(get(raw, "findings")), malformed: true, digest_declared: "", digest_recomputed: "",
        digest_matches: false, members: [], observers: [], closure: { status: "fail", findings: [] }, closure_missing: [], joins: [], corroboration: [],
      };
    }
    var digest = map(get(raw, "composedDigest"));
    var closure = map(get(raw, "compositionClosure"));
    var declared = map(get(map(get(v.bundle, "extensions")), COMPOSED_KIND));
    return {
      status: pyStr(get(raw, "status")),
      findings: pyStrings(get(raw, "findings")),
      malformed: false,
      digest_declared: pyStr(get(digest, "declared")),
      digest_recomputed: pyStr(or(get(digest, "recomputed"), "")),
      digest_matches: get(digest, "matches") === true,
      members: seq(get(raw, "members")).map(map).map(function (m) {
        var b = get(m, "bundle");
        var signature = get(m, "refusalSignature");
        return {
          id: pyStr(get(m, "id")), observer: pyStr(get(m, "observer")), outcome: pyStr(get(m, "outcome")), body: pyStr(get(m, "body")),
          digest: pyStr(get(m, "digest")), findings: pyStrings(get(m, "findings")),
          claims: isMap(b) ? [pyClaim(b.graphClosure), pyClaim(b.intervalCoverage), pyClaim(b.perRecordMembership)] : null,
          refusal_signature: typeof signature === "string" ? signature : null,
          report: null,
        };
      }),
      observers: seq(get(declared, "observers")).map(map).map(function (o) {
        return { id: pyStr(get(o, "id")), role: pyStr(get(o, "role")), custody_domain: pyStr(get(o, "custody_domain")) };
      }),
      closure: pyClaim(closure),
      closure_missing: pyStrings(get(closure, "missing")),
      joins: seq(get(raw, "joins")).map(map).map(function (j) {
        var derived = get(j, "derived");
        return {
          members: pair(get(j, "members")), basis: pyStr(get(j, "basis")), declared: pyStr(get(j, "declared")),
          derived: typeof derived === "string" ? derived : null, result: pyStr(get(j, "result")),
          differences: seq(get(j, "differences")).map(map).map(function (d) {
            return {
              pointer: pyStr(get(d, "pointer")),
              values: seq(get(d, "values")).map(map).map(function (x) { return { member: pyStr(get(x, "member")), resolved: get(x, "resolved") === true, value: own(x, "value") ? x.value : null }; }),
            };
          }),
        };
      }),
      corroboration: seq(get(raw, "corroboration")).map(map).map(function (c) {
        var rep = get(c, "report");
        return { members: pair(get(c, "members")), result: pyStr(get(c, "result")), reasons: pyStrings(get(c, "reasons")), report: typeof rep === "string" ? rep : null };
      }),
    };
  }

  function compositionProblem(c) {
    if (c.status !== "pass" || !c.digest_matches || c.closure.status !== "pass") return "the composition did not pass";
    var members = c.members;
    var copies = members.filter(function (m) { return m.outcome === "artifact"; });
    if (members.length !== 2 || !copies.length || members.some(function (m) { return m.body !== "carried"; })) return "a bilateral receipt is two carried members, at least one a copy";
    if (copies.length === 1 && members.some(function (m) { return m.outcome !== "artifact" && m.outcome !== "absence"; })) return "a one-sided receipt's other member is an absence";
    if (copies.length === 1 && c.joins.some(function (j) { return j.derived !== "one_sided"; })) return "a one-sided composition's joins do not all derive one_sided";
    if (members.some(function (m) { return m.digest !== "reproduced"; })) return "a carried member's digest was not reproduced";
    if (distinct(members.map(function (m) { return m.id; })).length !== 2 || distinct(members.map(function (m) { return m.observer; })).length !== 2) {
      return "the two copies are not from two observers";
    }
    if (c.corroboration.length !== c.joins.length) return "the report does not give one corroboration result per join";
    return null;
  }

  function pageMayShow(audience, cuts) {
    if (audience === null) {
      // The page's audience is not handed to a module: the copies must be
      // ones some page may show together.
      return Object.keys(CUTS).some(function (a) { return pageMayShow(a, cuts); });
    }
    var allowed = own(CUTS, audience) ? CUTS[audience] : [];
    return cuts.every(function (cut) { return allowed.indexOf(cut) >= 0; }) && cuts.filter(function (cut) { return cut === "keep"; }).length <= 1;
  }

  function oneDeal(named) {
    var every = [];
    named.forEach(function (deals) { deals.forEach(function (d) { if (every.indexOf(d) < 0) every.push(d); }); });
    every.sort(codepointCompare);
    if (named.some(function (deals) { return deals.length === 0; })) return ["unnamed", every];
    if (every.length === 1) return ["agree", every];
    return ["mismatch", every];
  }

  function carriedBodies(v) {
    var block = map(get(map(get(v.bundle, "extensions")), COMPOSED_KIND));
    return seq(get(block, "members")).map(map).filter(function (raw) {
      return get(raw, "outcome") === "artifact" && isMap(get(raw, "bundle"));
    });
  }

  // sides.missing_member: the one absence member, its body read
  // from the bundle's own block (carried, its digest reproduced:
  // compositionProblem).
  function missingMember(v, composition) {
    var others = composition.members.filter(function (m) { return m.outcome === "absence"; });
    if (others.length !== 1) return null;
    var member = others[0];
    var observer = composition.observers.find(function (o) { return o.id === member.observer; }) || null;
    var block = map(get(map(get(v.bundle, "extensions")), COMPOSED_KIND));
    var raw = seq(get(block, "members")).map(map).find(function (r) { return get(r, "id") === member.id; }) || {};
    var win = map(get(map(get(raw, "absence")), "window"));
    var start = str(get(win, "from")), end = str(get(win, "to"));
    if (start === null || end === null) throw new Unavailable("the absence member " + pyRepr(member.id) + " carries no window");
    return { member: member.id, role: observer ? observer.role : null, window: [start, end] };
  }

  // sides.plain_date: an RFC 3339 timestamp's date, as "Oct 9, 2026".
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function plainDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
    if (m === null || +m[2] < 1 || +m[2] > 12) return value;
    return MONTHS[+m[2] - 1] + " " + +m[3] + ", " + m[1];
  }

  // sides.two_copy_case.
  function twoCopyCase(dealState, joins) {
    var agreed = joins.length > 0 && joins.every(function (jv) {
      return jv.join.derived === "agree" && jv.join.result === "derived_matches" && !!jv.corroboration && jv.corroboration.result === "corroborating";
    });
    return dealState === "agree" && agreed ? "both" : "not_agreed";
  }

  // bilateral.build_bilateral. Asynchronous: each carried copy is verified by
  // the page's runtime, which may need a digest.
  function buildBilateral(v, env) {
    if (!v.verified) return Promise.reject(new Unavailable("the bundle did not verify"));
    var composition;
    try {
      composition = env.composition(v);
    } catch (e) {
      return Promise.reject(e);
    }
    if (composition === null) return Promise.reject(new Unavailable("no composed/v1 result was reported for this bundle"));
    var problem = compositionProblem(composition);
    if (problem !== null) return Promise.reject(new Unavailable(problem));
    var raws = carriedBodies(v);
    var members = [];
    for (var i = 0; i < raws.length; i++) {
      var member = composition.members.find(function (m) { return m.id === pyStr(get(raws[i], "id")); });
      if (!member) return Promise.reject(new Unavailable("the verifier assesses no carried bundle for a member"));
      members.push(member);
    }
    return Promise.all(raws.map(function (raw, i) {
      // A carried copy the page's runtime cannot verify is no copy to show.
      return Promise.resolve().then(function () { return env.memberContext(raw.bundle, members[i].id); }).then(null, function (err) {
        throw err instanceof Unavailable ? err : new Unavailable("a carried copy could not be verified: " + (err && err.message));
      });
    })).then(function (contexts) {
      var copies = composition.members.filter(function (m) { return m.outcome === "artifact"; }).length;
      if (contexts.length !== copies) throw new Unavailable("the bundle does not carry the copies its report assessed");
      var parties = contexts.map(function (ctx, i) {
        var pv = view(ctx, env);
        var m = members[i];
        var observer = composition.observers.find(function (o) { return o.id === m.observer; }) || null;
        var cut = copyAudience(pv);
        if (!sellerKindEngaged(pv) && sealedSide(pv) === "seller") throw new Unavailable(m.id + " is sealed as a seller's copy and does not engage the seller kind");
        var seller = sellerKindEngaged(pv) ? buildSeller(pv, cut) : null;
        return {
          member: m.id, observer: m.observer, role: observer ? observer.role : null, custody_domain: observer ? observer.custody_domain : null,
          audience: cut, deals: namedDeals(pv), assurance: pv.assurance, receipt: buildReceipt(pv, cut), seller: seller,
        };
      });
      if (!pageMayShow(env.audience, parties.map(function (p) { return p.audience; }))) {
        throw new Unavailable("a page does not show copies cut for " + parties.map(function (p) { return p.audience; }).join(", "));
      }
      var deal = oneDeal(parties.map(function (p) { return p.deals; }));
      var joins = composition.joins.map(function (j, i) { return { join: j, corroboration: composition.corroboration[i] }; });
      var missing = missingMember(v, composition);
      return {
        deal: deal[0] === "agree" ? deal[1][0] : null,
        deal_state: deal[0],
        named: deal[1],
        parties: parties,
        joins: joins,
        composition: composition,
        bundle_digest: v.assurance.bundle_digest,
        verification: v.verification,
        case: missing !== null ? "one_sided" : twoCopyCase(deal[0], joins),
        missing: missing,
      };
    });
  }

  // ---- drawing: the kit (capsule_viewer.kit.components), as DOM -------------
  // A child is a string (a text node), a node, an array of children, or null.

  function Drawing(doc) { this.doc = doc; }
  Drawing.prototype.el = function (tag, attrs, children) {
    var node = this.doc.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) { if (a[k] !== null && a[k] !== undefined) node.setAttribute(k, a[k]); });
    this.append(node, children);
    return node;
  };
  Drawing.prototype.append = function (node, children) {
    var self = this;
    if (children === null || children === undefined) return;
    if (Array.isArray(children)) { children.forEach(function (c) { self.append(node, c); }); return; }
    node.appendChild(typeof children === "string" ? this.doc.createTextNode(children) : children);
  };
  Drawing.prototype.frag = function (children) {
    var f = this.doc.createDocumentFragment();
    this.append(f, children);
    return f;
  };

  function pyRepr(s) {
    var quote = s.indexOf("'") >= 0 && s.indexOf('"') < 0 ? '"' : "'";
    var body = s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    if (quote === "'") body = body.replace(/'/g, "\\'");
    return quote + body + quote;
  }

  function Kit(d) { this.d = d; }
  Kit.prototype.refusal = function (component, value, reason) {
    return this.d.el("span", { class: "cv-refusal cv-badge", "data-refused": component }, [component + " refused " + pyRepr(value) + ": " + reason]);
  };
  Kit.prototype.section = function (title, children, level) {
    level = level || 2;
    if ([2, 3, 4].indexOf(level) < 0) throw new Error("section level must be 2, 3 or 4, got " + level);
    var d = this.d;
    return d.el("section", { class: "cv-section", "data-cv": "section" }, [
      d.el("h" + level, { class: "cv-section__title" }, [title]),
      d.el("div", { class: "cv-section__body" }, children),
    ]);
  };
  Kit.prototype.metricGrid = function (metrics) {
    var d = this.d;
    var tiles = metrics.map(function (m) {
      var parts = [d.el("dt", { class: "cv-metric__label" }, [m.label]), d.el("dd", { class: "cv-metric__value" }, [m.value])];
      if (m.note) parts.push(d.el("dd", { class: "cv-metric__note" }, [m.note]));
      return d.el("div", { class: "cv-metric" }, parts);
    });
    return d.el("div", { class: "cv-metrics-wrap", "data-cv": "metric-grid" }, [d.el("dl", { class: "cv-metrics" }, tiles)]);
  };
  Kit.prototype.dataTable = function (columns, rows) {
    var d = this.d;
    rows.forEach(function (row, i) {
      if (row.length !== columns.length) throw new Error("data_table row " + i + " has " + row.length + " cells for " + columns.length + " columns");
    });
    var head = d.el("thead", {}, [d.el("tr", {}, columns.map(function (c) { return d.el("th", { scope: "col" }, [c]); }))]);
    var body = d.el("tbody", {}, rows.map(function (row) {
      return d.el("tr", {}, row.map(function (cell, i) { return d.el("td", { "data-label": columns[i] }, [cell]); }));
    }));
    return d.el("div", { class: "cv-table-wrap", "data-cv": "data-table" }, [d.el("table", { class: "cv-table" }, [head, body])]);
  };
  Kit.prototype.disclosureBadge = function (state) {
    if (!own(DISCLOSURE_STATES, state)) return this.refusal("DisclosureBadge", state, "state must be one of " + Object.keys(DISCLOSURE_STATES).join(", "));
    var entry = DISCLOSURE_STATES[state];
    return this.d.el("span", { class: "cv-badge cv-tone--" + entry[1], "data-cv": "disclosure-badge", "data-state": state }, [entry[0]]);
  };
  Kit.prototype.drilldown = function (summary, children, expanded) {
    var d = this.d;
    var attrs = { class: "cv-drilldown", "data-cv": "drilldown" };
    if (expanded) attrs.open = "";
    return d.el("details", attrs, [d.el("summary", {}, [summary]), d.el("div", { class: "cv-drilldown__body" }, children)]);
  };
  Kit.prototype.evidenceDetails = function (list) {
    var d = this.d, kit = this;
    return d.el("ul", { class: "cv-evidence", "data-cv": "evidence-details" }, list.map(function (it) {
      var parts = [d.el("div", { class: "cv-evidence__head" }, [d.el("span", { class: "cv-evidence__label" }, [it.label]), kit.disclosureBadge(it.disclosure)])];
      if (it.media_type) parts.push(d.el("span", { class: "cv-muted" }, [it.media_type]));
      if (it.digest) parts.push(d.el("span", { class: "cv-mono" }, [it.digest]));
      if (it.note) parts.push(d.el("span", {}, [it.note]));
      return d.el("li", { class: "cv-evidence__item" }, parts);
    }));
  };
  Kit.prototype.outcome = function (outcome, cls) {
    if (!own(VERIFICATION_OUTCOMES, outcome)) return this.refusal("VerificationDetails", outcome, "outcome must be one of " + Object.keys(VERIFICATION_OUTCOMES).join(", "));
    var entry = VERIFICATION_OUTCOMES[outcome];
    return this.d.el("span", { class: cls + " cv-tone--" + entry[1], "data-outcome": outcome }, [entry[0]]);
  };
  Kit.prototype.verificationDetails = function (result) {
    var d = this.d, kit = this;
    var headline = d.el("div", { class: "cv-verification__outcome-row" }, [
      kit.outcome(result.outcome, "cv-verification__outcome cv-pill"), d.el("span", { class: "cv-muted" }, [" reported by " + result.verifier]),
    ]);
    var checks = result.checks.map(function (c) {
      var parts = [kit.outcome(c.outcome, "cv-pill"), d.el("span", {}, [c.name])];
      if (c.detail) parts.push(d.el("span", { class: "cv-mono cv-muted" }, [c.detail]));
      return d.el("li", { class: "cv-check" }, parts);
    });
    return d.el("div", { class: "cv-verification", "data-cv": "verification-details" }, [headline, d.el("ul", { class: "cv-checks" }, checks)]);
  };

  // ---- words ----------------------------------------------------------------

  var PLACEHOLDER = /\{([a-z_]+)\}/g;
  function word(key) { return own(WORDS, key) ? WORDS[key] : null; }
  function w(key, values) {
    var template = word(key);
    if (template === null) return "[" + key + "]";
    return template.replace(PLACEHOLDER, function (_, name) {
      if (!values || !own(values, name)) throw new Error("no value for {" + name + "} in " + key);
      return values[name];
    });
  }

  // ---- drawing: one copy (module.py, seller.py) ------------------------------

  function Drawer(doc, depth, seller) {
    this.d = new Drawing(doc);
    this.kit = new Kit(this.d);
    this.depth = depth;
    this.seller = !!seller;
  }
  var P = Drawer.prototype;

  P.p = function (text, attrs) { return this.d.el("p", attrs, [text]); };
  P.note = function (text, attrs) { return this.d.el("p", Object.assign({ class: "cv-muted" }, attrs || {}), [text]); };
  P.enumText = function (prefix, value) {
    var text = word(prefix + "." + value);
    if (text !== null) return text;
    return this.d.el("span", { class: "cv-mono", "data-unworded": prefix + "." + value }, [value]);
  };
  P.privateBanner = function () {
    var label = this.d.el("span", { class: "cv-badge" }, [w("banner.private.label")]);
    return this.d.el("p", { class: "cv-tone--caution", "data-banner": "private" }, [label, " ", w("banner.private.text")]);
  };
  // module.py's sides, half and missing_half (sides.py has the cases).
  P.sides = function (kase, halves, keep, line) {
    var d = this.d;
    var parts = halves.slice();
    if (line !== false) {
      var key = kase === "one_sided" && !keep ? "sides.case.one_sided.shared" : "sides.case." + kase;
      parts.unshift(d.el("p", { class: "cv-sides__case cv-tone--" + CASE_TONE[kase], "data-case": kase }, [w(key)]));
    }
    return d.el("div", { class: "cv-sides", "data-receipt-case": kase }, parts);
  };
  // module.py's actions: after L1's drilldown, on the holder's own page only.
  P.actions = function (kase) {
    var d = this.d;
    var items = [d.el("li", { class: "cv-actions__heading" }, [w("actions.heading")])].concat(ACTIONS[kase].map(function (k) {
      return d.el("li", { "data-action": k.replace(/^actions\./, "") }, [w(k)]);
    }));
    return d.el("ul", { class: "cv-actions", "data-actions": "true" }, items);
  };
  P.half = function (kind, label, body, attrs) {
    return this.d.el("div", Object.assign({ class: "cv-half cv-half--" + kind, "data-half": kind }, attrs || {}), [this.d.el("p", { class: "cv-half__label" }, [label])].concat(body));
  };
  P.missingHalf = function (missing, keep) {
    var text;
    if (missing === null) text = w("sides.missing.none");
    else text = w("sides.missing.absence", { start: plainDate(missing.window[0]), end: plainDate(missing.window[1]) });
    var label = keep || missing === null || missing.role === null ? w("sides.missing.heading") : missing.role;
    var attrs = missing !== null ? { "data-outcome": "absence", "data-party": missing.member } : { "data-outcome": "none" };
    return this.half("missing", label, [this.d.el("p", {}, [text])], attrs);
  };
  P.part = function (part, prefix) {
    if (typeof part === "object" && part !== null) return prefix ? this.enumText(prefix, part.value) : part.value;
    return this.kit.disclosureBadge(part);
  };
  P.headline = function (model) {
    var h = model.headline;
    var state = h.state ? this.enumText("state", h.state) : w("l0.state.missing");
    var dealType = this.d.el("p", { "data-deal-type": "true" }, [w("l0.deal_type"), ": ", this.part(h.deal_type, "deal_type")]);
    return [dealType, this.kit.metricGrid([
      { label: w("l0.item"), value: this.part(h.item) },
      { label: w("l0.amount"), value: this.part(h.amount) },
      { label: w("l0.state"), value: state },
    ])];
  };
  P.copyNotes = function (model) {
    var parts = [];
    var aud = model.report.audience;
    if (SHARED_AUDIENCES.indexOf(aud) >= 0) parts.push(this.p(w("shared." + aud, { kinds: model.report.withheld.join(", ") }), { "data-shared": aud }));
    if (model.report.scope) parts.push(this.p(model.report.scope, { "data-sealed-text": "scope" }));
    parts.push(this.p(this.witness(model), { "data-rung": "witness" }));
    parts.push(this.p(this.countersign(model), { "data-rung": "countersign" }));
    return parts;
  };
  P.witness = function (model) {
    if (model.witnessed === "pass") return w("rung.witness_verified");
    if (model.witnessed === "fail") return w("rung.witness_failed");
    if (model.witnessed === "withheld") return w("rung.unwitnessed");
    return w("rung.unreported");
  };
  P.countersign = function (model) {
    if (!model.countersignatures.length) return w("countersign.none");
    return w("countersign.some", { statuses: model.countersignatures.join(", ") });
  };
  P.logText = function (log) {
    return log ? w("step.log", { seq: String(log.seq), leaf: String(log.leaf_index), log: log.log_id }) : w("step.no_log");
  };
  P.factLabel = function (name) {
    if (this.seller) {
      var worded = word("seller.fact." + name);
      if (truthy(worded)) return worded;
    }
    return w("fact." + name);
  };
  P.step = function (step) {
    var d = this.d, self = this;
    var label = step.n !== null && step.at ? w("step.position", { n: String(step.n), at: step.at }) : w("step.unnumbered");
    var parts = [this.kit.evidenceDetails([{ label: label, disclosure: step.disclosure, digest: step.capsule_id, media_type: "", note: this.logText(step.log) }])];
    if (step.line) parts.push(this.p(w("step.line", { text: step.line }), { "data-sealed-text": "step-line" }));
    if (step.disclosure === "disclosed") {
      var list = step.facts.map(function (f) {
        return [d.el("dt", {}, [self.factLabel(f.name)]), d.el("dd", { class: "cv-mono", "data-fact": f.name }, [f.value])];
      });
      if (step.record_type) list.unshift([d.el("dt", {}, [w("step.type")]), d.el("dd", { class: "cv-mono", "data-fact": "record_type" }, [step.record_type])]);
      parts.push(d.el("dl", { "data-facts": "true" }, list));
    }
    var attrs = { "data-record": step.capsule_id, "data-disclosure": step.disclosure };
    if (step.log) attrs["data-log"] = step.log.log_id + ":" + step.log.seq + ":" + step.log.leaf_index;
    return d.el("div", attrs, parts);
  };
  P.steps = function (model, ids) {
    var d = this.d, kit = this.kit;
    return d.el("ol", {}, ids.map(function (cid) {
      var step = stepIn(model, cid);
      if (step === null) return d.el("li", {}, [kit.disclosureBadge("not_present"), " ", d.el("span", { class: "cv-mono" }, [cid])]);
      var line = step.line || "";
      var at = step.at ? step.at + " · " : "";
      return d.el("li", { "data-step": cid }, [kit.disclosureBadge(step.disclosure), " ", d.el("span", {}, [at + line])]);
    }));
  };
  P.item = function (model, it, prefix) {
    var text = (prefix || "") + (it.at ? it.at + " · " + it.text : it.text);
    if (it.flagged) text = "⚠️ " + text;
    if (!it.steps.length) return this.p(text, { "data-sealed-text": "item" });
    return this.d.el("div", { "data-item": "true" }, [
      this.p(text, { "data-sealed-text": "item" }),
      this.kit.section(w("steps.summary"), [this.steps(model, it.steps)], 4),
    ]);
  };
  P.sectionSteps = function (model, section) {
    var self = this;
    return model.steps.filter(function (s) { return s.section === section; }).map(function (s) { return self.step(s); });
  };
  P.committed = function (c, prefix) {
    if (c.state === "opened" && c.text !== null) {
      var label = "";
      if (c.label) {
        var worded = word("class." + c.label);
        label = truthy(worded) ? worded + ": " : "";
      }
      return [
        this.d.el("p", { "data-committed": prefix, "data-state": "opened" }, [label + "“" + c.text + "”"]),
        this.note(w(prefix + ".opened")),
      ];
    }
    if (c.state === "committed") {
      return [this.kit.disclosureBadge("committed"), this.note(w(prefix + ".committed"), { "data-committed": prefix, "data-state": "committed" })];
    }
    if (c.state === "withheld" || c.state === "not_present") {
      return [this.kit.disclosureBadge(c.state), this.note(w(prefix + "." + c.state), { "data-committed": prefix, "data-state": c.state })];
    }
    return this.p(w(prefix + ".mismatch"), { "data-committed": prefix, "data-state": "mismatch" });
  };
  P.claims = function (keys) {
    var d = this.d;
    return [
      d.el("ul", {}, keys.map(function (k) { return d.el("li", { "data-claim": k }, [w(k)]); })),
      this.note(w("claims.scope")),
    ];
  };
  P.deadlineList = function (deadlines) {
    var d = this.d;
    return d.el("ul", {}, deadlines.map(function (x) { return d.el("li", { "data-flagged": x.flagged ? "true" : "false" }, [x.text]); }));
  };

  // How the report was sealed. A report carried outside the log is described
  // by what capsulectl verify reported of it and nothing more (module.py).
  P.sealedNote = function (model) {
    if (model.report_checked === null) return this.note(w("summary.sealed"), { "data-sealed": "x-deal-v0" });
    return this.note(w("summary.standalone", { status: model.report_checked }), { "data-sealed": "x-deal-report" });
  };

  // The words for one move, as capsulectl's deal page words it (module.py
  // _journey_label): a key the pack has no word for, or a placeholder with no
  // value, words nothing.
  P.journeyLabel = function (move) {
    var template = word(move.key);
    if (template === null) return "";
    var facts = {};
    move.facts.forEach(function (pair) { facts[pair[0]] = pair[1]; });
    var values = {};
    Object.keys(facts).forEach(function (name) { if (name !== "detail") values[name] = facts[name]; });
    if (own(facts, "reason")) {
      var reason = facts.reason === "other" ? (own(facts, "detail") ? facts.detail : null) : word("journey.reason." + facts.reason) || "";
      delete values.reason;
      if (reason !== null) values.reason = reason;
    }
    if (move.classes !== null) {
      var named = move.classes.map(function (c) { return word("class." + c) || c.replace(/_/g, " "); });
      values.classes = named.length < 2 ? named.join("") : named.slice(0, -1).join(", ") + " and " + named[named.length - 1];
    }
    var missing = false;
    template.replace(PLACEHOLDER, function (_, name) { if (!own(values, name)) missing = true; return ""; });
    if (missing) return "";
    // A reason the pack has no word for is said as nothing: no empty "()" is left behind
    // (capsulectl's page prints it; capsule-cli#465).
    return template.replace(PLACEHOLDER, function (_, name) { return values[name]; })
      .replace(/\s*\(\s*\)/g, "").replace(/\s+\)/g, ")");
  };

  // "How it went": the errand's moves in order, each opening to its sealed step.
  P.journey = function (model) {
    var r = model.report, self = this;
    if (SHARED_AUDIENCES.indexOf(r.audience) >= 0 || !r.journey.length) return [];
    var rows = [];
    var said = null;
    r.journey.forEach(function (move) {
      var step = move.step ? model.steps.find(function (s) { return s.capsule_id === move.step; }) || null : null;
      var when = step !== null && step.disclosure === "disclosed" ? step.at : null;
      var shown = when && when !== said ? when : null;
      said = when || said;
      var mover = word("journey_by." + move.by) || w("journey_by.unknown");
      var label = self.journeyLabel(move);
      rows.push(self.item(model, item(label ? mover + " · " + label : mover, move.step ? [move.step] : [], shown, false)));
    });
    return [this.kit.section(w("section.journey"), rows.concat([this.note(w("journey_note"))]))];
  };

  P.l1 = function (model) {
    var d = this.d, kit = this.kit, self = this;
    var r = model.report;
    var out = [this.sealedNote(model)];
    out.push(kit.section(w("section.authorized"), [this.committed(model.asked, "asked"), this.sectionSteps(model, "authorized")]));
    out = out.concat(this.journey(model));
    out.push(kit.section(w("section.proposed"), this.sectionSteps(model, "proposed")));
    out.push(kit.section(w("section.approved"), this.sectionSteps(model, "approved")));
    out.push(kit.section(w("section.merchant"), this.merchant(model)));

    var acted = [this.note(w("summary.lines"))];
    var did = r.did.map(function (i) { return self.item(model, i); });
    acted = acted.concat(did.length ? did : [this.note(w("acted.nothing"))]);
    if (r.money) acted.push(this.p(r.money, { "data-sealed-text": "money" }));
    acted = acted.concat(this.sectionSteps(model, "acted"));
    if (r.did_line) acted.push(this.note(r.did_line, { "data-sealed-text": "did-line" }));
    out.push(kit.section(w("section.acted"), acted));

    if (r.lifecycle) {
      var life = [this.p(r.lifecycle, { "data-sealed-text": "lifecycle" })];
      r.later.forEach(function (i) {
        life.push(self.item(model, item(w("lifecycle.later", { at: i.at || "", text: i.text }), i.steps)));
      });
      if (r.may_change && r.as_of) life.push(this.note(w("lifecycle.as_of", { text: r.may_change, at: r.as_of }), { "data-sealed-text": "may-change" }));
      out.push(kit.section(w("section.lifecycle"), life));
    }

    if (model.statements.length) {
      var heading = ["keep"].concat(SHARED_AUDIENCES).indexOf(r.audience) >= 0 ? "section.statements." + r.audience : "section.statements.keep";
      out.push(kit.section(w(heading), [model.statements.map(function (c) { return self.committed(c, "statement"); }), this.sectionSteps(model, "statements")]));
    }

    var toldItems = r.told.map(function (i) { return self.item(model, i); });
    out.push(kit.section(w("section.told"), [toldItems.length ? toldItems : [this.note(w("told.none"))], this.note(w("told.note"))]));

    if (r.deadlines.length) {
      var extra = r.deadline_note ? [this.note(r.deadline_note)] : [];
      out.push(kit.section(w("section.deadlines"), [this.deadlineList(r.deadlines), extra]));
    }
    r.cancellations.forEach(function (c) {
      var shows = kit.section(w("cancellation.shows"), [
        d.el("ul", {}, c.proven.map(function (p) { return d.el("li", {}, [p]); })),
        kit.section(w("cancellation.not_shows"), [d.el("ul", {}, c.not_proven.map(function (p) { return d.el("li", {}, [p]); }))], 4),
        self.steps(model, c.steps),
      ], 3);
      out.push(kit.section(w("section.cancellation"), [shows]));
    });

    var anomalies = [["agent", r.agent_anomalies], ["counterparty", r.counterparty_anomalies]].map(function (pair) {
      var body = pair[1].map(function (i) { return self.item(model, i); });
      return kit.section(w("anomalies." + pair[0]), body.length ? body : [self.note(w("anomalies.none"))], 3);
    });
    out.push(kit.section(w("section.anomalies"), anomalies));

    var other = this.sectionSteps(model, "other");
    if (other.length) out.push(kit.section(w("section.other"), other));

    var keys = ["claims.tamper", "claims.reported", "claims.merchant"];
    if (model.steps.some(function (s) { return s.disclosure === "withheld"; })) keys.push("claims.withheld");
    out.push(kit.section(w("section.claims"), this.claims(keys)));
    return out;
  };

  P.merchant = function (model) {
    var d = this.d, kit = this.kit, self = this;
    var r = model.report;
    if (!r.merchant.length) return [this.note(w("merchant.none"))];
    var out = [this.note(w("merchant.intro"))];
    if (r.email_scope) out.push(this.p(r.email_scope, { "data-sealed-text": "email-scope" }));
    r.merchant.forEach(function (m) {
      var rows = m.rows.map(function (row) {
        var label = row[0] === "approved" && m.approved_basis ? w("merchant.approved_basis", { basis: m.approved_basis }) : w("merchant." + row[0]);
        return [label, row[1]];
      });
      var body = [
        self.p(w("merchant.signature", { text: m.merchant_says }), { "data-merchant-verified": m.verified ? "true" : "false" }),
        self.note(w("merchant.seal", { text: m.we_say })),
      ];
      if (m.key_supplied) body.push(self.p(w("merchant.key_supplied")));
      if (rows.length) body.push(d.el("dl", {}, rows.map(function (row) { return [d.el("dt", {}, [row[0]]), d.el("dd", {}, [row[1]])]; })));
      body.push(self.steps(model, m.steps));
      var title = m.order_id ? w("merchant.order", { order: m.order_id }) : w("merchant.email");
      out.push(kit.section(title, body, 3));
    });
    return out;
  };

  P.l2 = function (model) {
    var d = this.d, kit = this.kit, self = this;
    var out = [kit.verificationDetails(model.verification)];
    if (model.bundle_digest) {
      out.push(d.el("p", {}, [w("l2.bundle_digest"), " ", d.el("span", { class: "cv-mono", "data-bundle-digest": "true" }, [model.bundle_digest])]));
    }
    var rows = model.steps.map(function (s) {
      var position = s.n !== null ? String(s.n) : (s.section === "report" ? w("records.report") : "");
      return [position, s.record_type || w("records.unknown"), kit.disclosureBadge(s.disclosure), self.logText(s.log), d.el("span", { class: "cv-mono" }, [s.capsule_id])];
    });
    out.push(kit.section(w("section.records"), [
      kit.dataTable([w("records.step"), w("records.kind"), w("records.disclosure"), w("records.log"), w("records.id")], rows),
    ], 3));
    var producers = model.producers.map(function (p) { return p !== null ? p : w("provenance.unrecorded"); }).join(w("provenance.then"));
    var prov = [this.note(w("provenance.by", { producers: producers }), { "data-provenance": "true" })];
    if (model.report.instructions) prov.push(this.note(model.report.instructions, { "data-sealed-text": "instructions" }));
    prov.push(this.note(w("wording.provenance", { id: PACK.id, sha: PACK.sha256 || "-" })));
    out.push(kit.section(w("section.provenance"), prov, 3));
    return out;
  };

  P.levels = function (model) {
    var l1Open = this.depth === "L1" || this.depth === "L2";
    return {
      headline: this.d.el("div", { "data-headline": "true" }, this.headline(model)),
      notes: this.copyNotes(model),
      l1: this.l1(model),
      l2: this.l2(model),
      l1_open: l1Open,
      l2_open: this.depth === "L2",
    };
  };

  // ---- seller drawing -------------------------------------------------------

  P.audienceKey = function (prefix, model) {
    var audience = model.receipt.report.audience;
    return prefix + "." + (["keep"].concat(SHARED_AUDIENCES).indexOf(audience) >= 0 ? audience : "keep");
  };
  P.n = function (model, step) {
    var found = step ? stepIn(model.receipt, step) : null;
    return found !== null && found.n !== null ? String(found.n) : "-";
  };
  P.withheldRow = function (state, key, attr) {
    return this.d.el("p", { "data-seller": attr, "data-state": state }, [this.kit.disclosureBadge(state), " ", this.d.el("span", {}, [w(key + "." + state)])]);
  };
  P.handoverText = function (h) {
    if (h.state === "recorded") return w("seller.handover.seller_observed");
    if (h.state === "withheld") return this.kit.disclosureBadge("withheld");
    return w("seller.handover.none");
  };
  P.sellerHeadline = function (model) {
    var d = this.d;
    var state;
    if (model.outcome) state = this.enumText("seller.outcome", model.outcome);
    else if (model.receipt.report.state) state = this.enumText("state", model.receipt.report.state);
    else state = w("l0.state.missing");
    var grid = this.kit.metricGrid([
      { label: w("seller.l0.item"), value: this.part(model.item) },
      { label: w("seller.l0.amount"), value: this.part(model.amount) },
      { label: w("l0.state"), value: state },
    ]);
    var payment = d.el("p", { "data-seller-line": "payment" }, [w("seller.l0.payment"), ": ", w("seller.payment.not_recorded")]);
    var handover = d.el("p", { "data-seller-line": "handover" }, [
      w("seller.l0.handover"), ": ", d.el("span", { "data-handover": model.handover.state }, [this.handoverText(model.handover)]),
    ]);
    return [grid, payment, handover];
  };
  P.sellerNotes = function (model) {
    var audience = model.receipt.report.audience;
    var notes = this.copyNotes(model.receipt);
    if (SHARED_AUDIENCES.indexOf(audience) >= 0) notes[0] = this.p(w("seller.shared." + audience), { "data-shared": audience });
    return notes;
  };
  P.leftOut = function (model) {
    var audience = model.receipt.report.audience;
    if (SHARED_AUDIENCES.indexOf(audience) < 0) return [];
    var kinds = model.receipt.report.withheld.join(", ");
    return [this.kit.section(w("seller.section.left_out"), [this.p(w("shared." + audience, { kinds: kinds }), { "data-left-out": audience })])];
  };
  P.sellerL1 = function (model) {
    var d = this.d, kit = this.kit, self = this;
    var r = model.receipt;
    var out = [this.sealedNote(r)].concat(this.leftOut(model));

    var authorised = [this.committed(r.asked, "seller.asked")];
    if (model.authority.length) {
      authorised.push(d.el("dl", {}, model.authority.map(function (f) {
        return [d.el("dt", {}, [w("seller.fact." + f.name)]), d.el("dd", { class: "cv-mono", "data-fact": f.name }, [f.value])];
      })));
    }
    authorised.push(this.withheldRow(model.floor, "seller.floor", "floor"));
    authorised = authorised.concat(this.sectionSteps(r, "authorized"));
    out.push(kit.section(w(this.audienceKey("seller.section.authorised", model)), authorised));
    out = out.concat(this.journey(r));

    var toldList = r.statements.map(function (c) { return self.committed(c, "statement"); });
    out.push(kit.section(w(this.audienceKey("seller.section.represented", model)), [
      toldList.length ? toldList : [this.note(w("seller.represented.none"))], this.sectionSteps(r, "statements"),
    ]));

    out.push(kit.section(w("seller.section.offers"), [this.offers(model), this.sectionSteps(r, "proposed")]));
    out.push(kit.section(w(this.audienceKey("seller.section.accepted", model)), [this.acceptances(model), this.sectionSteps(r, "approved")]));

    var payment = [this.note(w("seller.payment.none"), { "data-seller": "payment" })];
    model.evidence.forEach(function (e) {
      if (e.disclosure === "disclosed") {
        var verified = w(e.verified ? "seller.evidence.verified" : "seller.evidence.unverified");
        payment.push(d.el("p", { "data-evidence": e.step }, [w("seller.evidence.source") + " " + (e.source || "-") + " · " + verified]));
      } else {
        payment.push(d.el("p", { "data-evidence": e.step }, [kit.disclosureBadge(e.disclosure), " ", d.el("span", {}, [w("seller.evidence.withheld")])]));
      }
    });
    out.push(kit.section(w("seller.section.payment"), payment));

    out.push(kit.section(w("seller.section.handover"), [this.handover(model), this.sectionSteps(r, "acted")]));

    var given = [this.withheldRow(model.address, "seller.address", "address")];
    r.report.told.forEach(function (i) { given.push(self.item(r, i)); });
    given.push(this.note(w("told.note")));
    out.push(kit.section(w(this.audienceKey("seller.section.given", model)), given));

    if (r.report.deadlines.length) out.push(kit.section(w("seller.section.obligations"), [this.deadlineList(r.report.deadlines)]));
    else out.push(kit.section(w("seller.section.obligations"), [this.note(w("seller.obligations.none"))]));

    var stands = [];
    if (model.outcome) {
      stands.push(d.el("p", { "data-outcome": model.outcome }, [this.enumText("seller.outcome", model.outcome)]));
      if (model.outcome === "not_selected") stands.push(this.note(w("seller.not_selected")));
    }
    if (r.report.lifecycle) stands.push(this.p(r.report.lifecycle, { "data-sealed-text": "lifecycle" }));
    stands.push(this.note(w("seller.threads")));
    out.push(kit.section(w("section.lifecycle"), stands));

    var other = this.sectionSteps(r, "other");
    if (other.length) out.push(kit.section(w("section.other"), other));

    var keys = ["claims.tamper", "claims.reported", "seller.claims.handover"];
    if (r.steps.some(function (s) { return s.disclosure === "withheld"; })) keys.push("claims.withheld");
    out.push(kit.section(w("section.claims"), this.claims(keys)));
    return out;
  };
  P.offers = function (model) {
    var d = this.d, self = this;
    if (!model.offers.length) return [this.note(w("seller.offers.none"))];
    var rows = model.offers.map(function (o) {
      var status = o.accepted_by ? w("seller.offer.accepted") : (o.superseded_by ? w("seller.offer.superseded") : w("seller.offer.open"));
      return [
        self.n(model, o.step),
        self.enumText("seller.action", o.action),
        o.amount ? o.amount.value : "-",
        d.el("span", { "data-offer-status": o.accepted_by ? "accepted" : (o.superseded_by ? "superseded" : "open"), "data-offer": o.step }, [status]),
      ];
    });
    return [
      this.kit.dataTable([w("records.step"), w("seller.offers.action"), w("seller.offers.amount"), w("seller.offers.status")], rows),
      this.note(w("seller.offers.note")),
    ];
  };
  P.acceptances = function (model) {
    var d = this.d, self = this;
    if (!model.acceptances.length) return [this.note(w("seller.accepted.none"))];
    return model.acceptances.map(function (a) {
      var offer = model.offers.find(function (o) { return o.step === a.offer; }) || null;
      var named, detail;
      if (offer !== null) {
        named = w("seller.accepted.offer");
        detail = self.n(model, offer.step) + " · " + (offer.amount ? offer.amount.value : "-");
      } else {
        named = w("seller.accepted.offer_not_here");
        detail = "";
      }
      var parts = [
        d.el("p", {}, [named, " ", d.el("span", { "data-accepted-offer": a.offer || "" }, [detail])]),
        d.el("p", {}, [w("seller.accepted.digest"), " ", d.el("span", { class: "cv-mono", "data-offer-digest": "true" }, [a.offer_digest || "-"])]),
      ];
      if (a.channel || a.observed_at) parts.push(self.note((a.channel || "-") + " · " + (a.observed_at || "-")));
      parts.push(self.note(w("seller.accepted.words")));
      return d.el("div", { "data-acceptance": a.step }, parts);
    });
  };
  P.handover = function (model) {
    var d = this.d;
    var h = model.handover;
    var rows = PROVENANCES.map(function (provenance) {
      var state = provenance === "seller_observed" ? h.state : "not_present";
      return d.el("li", { "data-provenance": provenance, "data-state": state }, [
        d.el("strong", {}, [w("seller.provenance." + provenance)]), " ", d.el("span", {}, [w("seller.provenance." + provenance + "." + state)]),
      ]);
    });
    var out = [d.el("ul", {}, rows)];
    if (h.facts.length) {
      out.push(d.el("dl", {}, h.facts.map(function (f) {
        return [d.el("dt", {}, [w("seller.delivered." + f.name)]), d.el("dd", { class: "cv-mono", "data-fact": f.name }, [f.value])];
      })));
    }
    out.push(this.note(w("seller.handover.note")));
    return out;
  };
  P.sellerL2 = function (model) {
    var d = this.d, kit = this.kit, self = this;
    var out = this.l2(model.receipt);
    var chain = model.offers.map(function (o) {
      return [self.n(model, o.step), o.digest || "-", o.supersedes ? self.n(model, o.supersedes) : "-", o.superseded_by ? self.n(model, o.superseded_by) : "-"];
    });
    if (chain.length) {
      out.push(kit.section(w("seller.section.chain"), [
        kit.dataTable([w("records.step"), w("seller.chain.digest"), w("seller.chain.supersedes"), w("seller.chain.superseded_by")], chain),
      ], 3));
    }
    var opened = [];
    if (model.receipt.asked.state === "opened") opened.push(model.receipt.asked.step + "\u0000intent.verbatim_commitment");
    model.receipt.statements.forEach(function (c) { if (c.state === "opened") opened.push(c.step + "\u0000text_commitment"); });
    var rows = model.commitments.map(function (c) {
      var isOpened = opened.indexOf(c[0] + "\u0000" + c[1]) >= 0;
      return [self.n(model, c[0]), c[1], d.el("span", { class: "cv-mono" }, [c[2]]), w(isOpened ? "seller.commitment.opened" : "seller.commitment.sealed")];
    });
    out.push(kit.section(w("seller.section.commitments"), [
      kit.dataTable([w("records.step"), w("seller.commitment.field"), w("seller.commitment.value"), w("seller.commitment.state")], rows),
    ], 3));
    var legs = [
      [w("seller.leg.agreement"), w(model.offers.some(function (o) { return o.action === "commit"; }) ? "seller.leg.recorded" : "seller.leg.none")],
      [w("seller.leg.payment"), w("seller.leg.none")],
      [w("seller.leg.handover"), w("seller.provenance.seller_observed." + model.handover.state)],
    ];
    out.push(kit.section(w("seller.section.legs"), [kit.dataTable([w("seller.leg.name"), w("seller.leg.state")], legs)], 3));
    out.push(kit.section(w("seller.section.keys"), [
      d.el("ul", {}, model.keys.map(function (k) { return d.el("li", { class: "cv-mono", "data-key": "true" }, [k]); })),
    ], 3));
    return out;
  };
  P.sellerLevels = function (model) {
    var l1Open = this.depth === "L1" || this.depth === "L2";
    return {
      headline: this.d.el("div", { "data-headline": "true" }, this.sellerHeadline(model)),
      notes: this.sellerNotes(model),
      l1: this.sellerL1(model),
      l2: this.sellerL2(model),
      l1_open: l1Open,
      l2_open: this.depth === "L2",
    };
  };

  // The three levels of one page: L0 always shown, L1 and L2 one toggle each.
  P.page = function (l0, l1Summary, l1, l1Open, l2, l2Open, after) {
    var d = this.d;
    return [
      d.el("div", { "data-level": "L0" }, l0),
      d.el("div", { "data-level": "L1" }, [this.kit.drilldown(l1Summary, l1, l1Open)].concat(after ? [after] : [])),
      d.el("div", { "data-level": "L2" }, [this.kit.drilldown(w("depth.l2"), l2, l2Open)]),
    ];
  };

  function drawUnilateral(doc, depth, model) {
    var dr = new Drawer(doc, depth, false);
    var levels = dr.levels(model);
    var l0 = [];
    if (model.demo) l0.push(dr.d.el("p", { "data-demo": "true" }, [w("badge.demo")]));
    l0.push(dr.d.el("h2", {}, [w("page.title")]));
    var keep = model.report.audience === "keep";
    if (keep) l0.push(dr.privateBanner());
    l0 = l0.concat([levels.headline], levels.notes);
    // The holder's own copy and nothing from the other side: no record.
    if (keep) l0.push(dr.sides("none", [dr.missingHalf(null, true)], true, false));
    return dr.page(l0, w("depth.l1"), levels.l1, levels.l1_open, levels.l2, levels.l2_open, keep ? dr.actions("none") : null);
  }

  function drawSeller(doc, depth, model) {
    var dr = new Drawer(doc, depth, true);
    var levels = dr.sellerLevels(model);
    var l0 = [];
    if (model.receipt.demo) l0.push(dr.d.el("p", { "data-demo": "true" }, [w("badge.demo")]));
    l0.push(dr.d.el("h2", {}, [w("seller.title")]));
    var keep = model.receipt.report.audience === "keep";
    if (keep) l0.push(dr.privateBanner());
    l0 = l0.concat([levels.headline], levels.notes);
    if (keep) l0.push(dr.sides("none", [dr.missingHalf(null, true)], true, false));
    return dr.page(l0, w("seller.depth.l1"), levels.l1, levels.l1_open, levels.l2, levels.l2_open, keep ? dr.actions("none") : null);
  }

  // ---- drawing: the composition section and the bilateral page ---------------

  function pairText(members) { return members[0] + " – " + members[1]; }
  function findingsText(findings) { return findings.length ? findings.join(", ") : "none"; }
  function claimText(c) { return c.findings.length ? c.status + " (" + c.findings.join(", ") + ")" : c.status; }
  // Python's json.dumps(v, ensure_ascii=False, separators=(",", ":")).
  function pyJson(v) {
    if (v === null || v === undefined) return "null";
    if (Array.isArray(v)) return "[" + v.map(pyJson).join(",") + "]";
    if (typeof v === "object") return "{" + Object.keys(v).map(function (k) { return JSON.stringify(k) + ":" + pyJson(v[k]); }).join(",") + "}";
    return JSON.stringify(v);
  }
  function corroborationText(c) {
    if (c.result === "redundant") return (c.report || "redundant, not corroborating") + " (" + c.reasons.join(", ") + ")";
    if (c.result === "corroborating") return "corroborating, on declared custody";
    return "not applicable: the join did not derive agree";
  }

  function compositionSection(dr, c) {
    var d = dr.d, kit = dr.kit;
    var out = [d.el("p", { "data-composition-status": c.status }, ["composed/v1 check: " + c.status])];
    if (c.findings.length) out.push(d.el("p", {}, ["findings: " + c.findings.join(", ")]));
    if (c.malformed) return kit.section("Composition", out, 3);
    out.push(d.el("p", {}, [COMPOSED_SCOPE]));
    out.push(kit.section("Composed digest", [kit.dataTable(["declared", "recomputed", "matches"],
      [[c.digest_declared, c.digest_recomputed || "uncomputable", c.digest_matches ? "yes" : "no"]])], 4));
    var rows = c.members.map(function (m) {
      return [m.id, m.observer, m.outcome, m.body, m.digest]
        .concat(m.claims !== null ? m.claims.map(claimText) : [NOT_APPLICABLE, NOT_APPLICABLE, NOT_APPLICABLE])
        .concat([m.refusal_signature || NOT_APPLICABLE, findingsText(m.findings)]);
    });
    out.push(kit.section("Members", [kit.dataTable(["member", "observer", "outcome", "body", "digest", "graph closure", "interval coverage",
      "per-record membership", "refusal signature", "findings"], rows)], 4));
    out.push(kit.section("Observers", [
      kit.dataTable(["observer", "role", "custody domain"], c.observers.map(function (o) { return [o.id, o.role, o.custody_domain]; })),
      d.el("p", {}, [COMPOSED_CUSTODY]),
    ], 4));
    var missing = c.closure_missing.length ? c.closure_missing.join(", ") : "none";
    out.push(kit.section("Composition closure", [
      d.el("p", { "data-closure-status": c.closure.status }, [c.closure.status + "; missing: " + missing + "; findings: " + findingsText(c.closure.findings)]),
    ], 4));
    if (!c.joins.length) {
      out.push(kit.section("Joins", [d.el("p", {}, ["No joins."])], 4));
      return kit.section("Composition", out, 3);
    }
    var joins = [kit.dataTable(["members", "basis", "declared", "derived", "result"], c.joins.map(function (j) {
      return [pairText(j.members), j.basis, j.declared, j.derived || "not derivable", j.result];
    }))];
    c.joins.forEach(function (j) {
      if (!j.differences.length) return;
      var lists = j.differences.map(function (diff) {
        return d.el("dl", { "data-pointer": diff.pointer }, [d.el("dt", {}, [diff.pointer])].concat(diff.values.map(function (x) {
          return d.el("dd", {}, [x.resolved ? x.member + ": " + pyJson(x.value) : x.member + ": does not resolve"]);
        })));
      });
      joins.push(d.el("div", { "data-differences": "true" }, [d.el("p", {}, ["Differing values: " + pairText(j.members)])].concat(lists)));
    });
    out.push(kit.section("Joins", joins, 4));
    out.push(kit.section("Agreement", [kit.dataTable(["members", "result"], c.corroboration.map(function (x) {
      return [pairText(x.members), corroborationText(x)];
    }))], 4));
    return kit.section("Composition", out, 3);
  }

  // bilateral._token: an enum's words, or the token itself when there are none.
  function enumToken(prefix, value) { var t = word(prefix + "." + value); return truthy(t) ? t : value; }

  function drawBilateral(doc, depth, model) {
    var dr = new Drawer(doc, depth, false);
    var d = dr.d, kit = dr.kit;
    var drawn = model.parties.map(function (p) {
      if (p.seller !== null) return new Drawer(doc, depth, true).sellerLevels(p.seller);
      return new Drawer(doc, depth, false).levels(p.receipt);
    });
    var heading = function (party) {
      return w("party.heading", { role: party.role || w("party.role_undeclared"), member: party.member });
    };
    var keep = model.parties.some(function (p) { return p.audience === "keep"; });
    var one = model.parties.length === 1;
    var l0 = [d.el("h2", {}, [w(one ? "bilateral.title.one_sided" : "bilateral.title")])];
    if (keep) l0.push(dr.privateBanner());
    var dealText;
    if (model.deal_state === "agree" && model.deal !== null) dealText = w(one ? "deal.one" : "deal.agree", { deal: model.deal });
    else if (model.deal_state === "mismatch") dealText = w("deal.mismatch", { deals: model.named.join(", ") });
    else dealText = w("deal.unnamed");
    l0.push(d.el("p", { "data-deal-state": model.deal_state }, [dealText]));
    // A one-sided page's joins all derive one_sided, which its case line
    // says; they stay in L2's composition section.
    if (one) {
      // no joins section in L0
    } else if (!model.joins.length) {
      l0.push(kit.section(w("joins.heading"), [d.el("p", {}, [w("joins.none")])], 3));
    } else {
      l0.push(kit.section(w("joins.heading"), [d.el("ul", {}, model.joins.map(function (jv) {
        var j = jv.join, c = jv.corroboration;
        var derived = j.derived || "not_derivable";
        var parts = [d.el("span", {}, [w("join.line", { basis: enumToken("join.basis", j.basis), declared: enumToken("join.state", j.declared), derived: enumToken("join.state", derived) })])];
        if (j.result === "join_state_mismatch") parts.push(d.el("span", {}, [" " + w("join.result.join_state_mismatch")]));
        if (c && c.result === "corroborating") parts.push(d.el("span", {}, [" " + w("corroboration.corroborating")]));
        else if (c && c.result === "redundant") parts.push(d.el("span", {}, [" " + w("corroboration.redundant", { reasons: c.reasons.join(", ") })]));
        return d.el("li", {
          "data-join-basis": j.basis, "data-join-declared": j.declared, "data-join-derived": derived, "data-join-result": j.result,
          "data-corroboration": c ? c.result : "none",
        }, parts);
      }))], 3));
    }
    var halves = model.parties.map(function (party, i) {
      var levels = drawn[i];
      var section = kit.section(heading(party), [levels.headline].concat(levels.notes), 3);
      var attrs = { "data-party": party.member, "data-cut": party.audience };
      // On the holder's page their own copy is ours; every other copy is theirs, as received.
      if (party.audience === "keep") return dr.half("ours", w("sides.ours"), [section], attrs);
      var label = keep ? w("sides.theirs") : w("sides.half", { role: party.role || w("party.role_undeclared") });
      return dr.half("theirs", label, [section], attrs);
    });
    if (model.missing !== null) halves.push(dr.missingHalf(model.missing, keep));
    l0.push(dr.sides(model.case, halves, keep));
    if (!one) l0.push(d.el("p", { class: "cv-muted" }, [w("parts.own")]));
    var l1 = model.parties.map(function (p, i) { return d.el("div", { "data-party": p.member }, [kit.section(heading(p), drawn[i].l1, 3)]); });
    var l2 = [kit.verificationDetails(model.verification)];
    if (model.bundle_digest) {
      l2.push(d.el("p", {}, [w("l2.bundle_digest"), " ", d.el("span", { class: "cv-mono", "data-bundle-digest": "true" }, [model.bundle_digest])]));
    }
    l2.push(d.el("div", { "data-composition": "true" }, [kit.section(w("l2.composition"), [compositionSection(dr, model.composition)], 3)]));
    model.parties.forEach(function (p, i) { l2.push(d.el("div", { "data-party": p.member }, [kit.section(heading(p), drawn[i].l2, 3)])); });
    return dr.page(l0, w("depth.l1"), l1, depth === "L1" || depth === "L2", l2, depth === "L2", keep ? dr.actions(model.case) : null);
  }

  // ---- the modules (presentation contract: canRender, buildModel, render) ----

  var DRAW = { unilateral: drawUnilateral, seller: drawSeller, bilateral: drawBilateral };
  var TITLES = { unilateral: "page.title", seller: "seller.title", bilateral: "bilateral.title" };

  // The kit stylesheet, once per document (its bytes are what the manifest's
  // style_sha256 pins).
  function ensureStyle(doc) {
    if (!KIT_CSS || doc.getElementById("cv-kit-css")) return;
    var style = doc.createElement("style");
    style.id = "cv-kit-css";
    style.textContent = KIT_CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  // One module. `env` is what the page's runtime does not hand a module (see
  // the file comment); a page's module takes the defaults. The tests give the
  // Python twin's inputs instead, to compare the two.
  //   audience        the page's audience, or null (the copy's own)
  //   verification    context -> the kit's VerificationResult
  //   assurance       context -> {bundle_digest, witnesses, countersignatures}
  //   composition     view -> the composed/v1 result, or null
  //   memberContext   (bundle, member id) -> a carried copy's context (or a promise of one)
  function createModule(kind, env) {
    if (!own(DRAW, kind)) throw new Error("no receipt module " + kind);
    var e = {
      audience: env && env.audience !== undefined ? env.audience : null,
      verification: (env && env.verification) || pageVerification,
      assurance: (env && env.assurance) || pageAssurance,
      composition: (env && env.composition) || compositionOf,
      memberContext: (env && env.memberContext) || pageMemberContext,
    };
    var build = function (context) {
      var v = view(context, e);
      if (kind === "bilateral") return buildBilateral(v, e);
      if (kind === "seller") return buildSeller(v, e.audience);
      // A seller's copy, by its packaging or by its own sealed records, is
      // never shown as a buyer's receipt.
      if (sellerKindEngaged(v) || sealedSide(v) === "seller") throw new Unavailable("a seller's copy is the seller receipt's");
      return buildReceipt(v, e.audience);
    };
    var declined = function (err) {
      if (err instanceof Unavailable) return false;
      throw err;
    };
    return {
      manifest: kind === KIND ? MANIFEST : { id: "capsuleviewer.receipt." + kind + "/v0" },
      title: w(TITLES[kind]),
      // Declining is canRender's answer: nothing of this module is shown.
      canRender: function (context) {
        try {
          var built = build(context);
          if (built && typeof built.then === "function") return built.then(function () { return true; }, declined);
          return true;
        } catch (err) {
          return declined(err);
        }
      },
      buildModel: build,
      // Draws into host.L0, host.L1 and host.L2 at host.depth.
      render: function (model, host) {
        var doc = host.L0.ownerDocument;
        var depth = DEPTHS.indexOf(host.depth) >= 0 ? host.depth : "L0";
        ensureStyle(doc);
        var levels = DRAW[kind](doc, depth, model);
        // One text node per run of text, as the Python twin's HTML parses: the
        // browser shapes each text node on its own, so a run built from several
        // would lay out a fraction of a pixel differently.
        levels.forEach(function (level) { level.normalize(); });
        [host.L0, host.L1, host.L2].forEach(function (region, i) {
          var wrap = doc.createElement("div");
          wrap.className = "cv-kit";
          wrap.setAttribute("data-receipt-module", "capsuleviewer.receipt." + kind + "/v0");
          wrap.appendChild(levels[i]);
          region.appendChild(wrap);
        });
      },
    };
  }

  var module = createModule(KIND, {});

  root.CapsuleViewerReceipt = {
    KIND: KIND,
    MANIFEST: MANIFEST,
    WORDS: WORDS,
    PACK: PACK,
    KIT_CSS: KIT_CSS,
    module: module,
    createModule: createModule,
    Unavailable: Unavailable,
    checkOpening: checkOpening,
    recordDigest: recordDigest,
    sha256Hex: sha256Hex,
    utf8: utf8,
    jcs: jcs,
    formatAmount: formatAmount,
    bundleVerified: bundleVerified,
  };
  if (typeof root.EvidenceGraph !== "undefined" && root.EvidenceGraph && typeof root.EvidenceGraph.registerPresentation === "function") {
    root.EvidenceGraph.registerPresentation(module);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
