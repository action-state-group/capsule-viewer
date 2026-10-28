// SPDX-License-Identifier: Apache-2.0
// Show evidence, in the page: one claim of an Evidence Result v0 drawn side by
// side, read-only: what happened (the claim's cited records), the criterion and
// the verdict (capsule-viewer#83; Steven's Terms Pack brief, boards SpotCheck
// and EUSpotCheck5).
//
// One self-contained script. It imports nothing, needs only the DOM, and
// never fetches: a digest the bundle does not carry is drawn as not in this
// bundle. It is a module-slot component, not a presentation: every Result
// descriptor is already served by a "*"-audience module (the contract report
// and the built-in Result pages), so a presentation of its own would be a
// registry ambiguity (presentation contract section 4.5). Report modules call
// it instead, through root.CapsuleViewerShowEvidence.
//
// resolve(result, claim) reads one claim as agent-action-capsule's own
// Result reader resolved it (buildResultRoot: a ResultRoot and one of its
// ResultClaims, as the page runtime and the contract report hold them). This
// script resolves nothing itself. A cited digest is drawn from
// result.records, the records the reader resolved it to: a capsule an
// evidence-book record carries is drawn from its carried input. A digest the
// reader lists in claim.missing is drawn as not in this bundle. A record's
// content is drawn only when the reader found it disclosed and matching the
// digest the record committed.
//
// The verdict is drawn as the Result states it, labelled so, and only where
// the page would draw it: a claim that failed the reader's checks, or whose
// cited evidence does not all resolve (unsupported), gets no verdict word,
// only the reason (agent-action-capsule result-root.ts: such a claim is never
// shown as met).
//
// The carrier decides what is drawn (Evidence Result v0 sections 2 and 6).
// Under `disclosure`, each disclosed record's content is drawn, boxed, as the
// digest-checked payload. Under `analysis` or `story`, the carrier's own text
// is drawn as the producer's, and no record content: that text explains a gap
// and may not repair it. A record the bundle carries but does not disclose
// draws carrier.withheld.
//
// Producer text (a judge's rationale, an analysis or story carrier) is drawn
// italic, inside an element marked data-source="producer", after a label
// naming it as the producer's words. Every drawn string sits inside an element
// whose data-source names where it comes from (Steven's WordSources rule):
// "pack" (a word, WORDS or the host's layer over it), "field" (a capsule or
// Result field), "payload" (disclosed record content, digest-checked) or
// "producer" (a producer's own words). Only separators carry no tag. render returns one element for the
// page's deepest level (data-level="L2"): a host never puts it, or any
// producer text, in L0. Nothing is interactive: there is no control that
// records, agrees or submits. All text is set with textContent; nothing from
// the bundle is parsed as HTML.
//
// Words are keyed as in the brief (side.*, carrier.withheld) with the
// contract-report verdict keys (verdict.<value>, contract-report/v1 section
// 3). WORDS holds the default English words; a host may pass its own pack's
// entries to render, layered over these key by key.
(function (root) {
  "use strict";

  var DISCLOSURE = "disclosure";
  var WITHHELD_STATUSES = { WITHHELD: true, NOT_COMMITTED: true };
  // An evaluation report (evidencebook's judge output) seals the criterion as
  // the judge read it (clause_claim) and the judge's own words (rationale).
  var EVALUATION_REPORT = "evaluation-report/v1";
  var REPORT_CRITERION = "clause_claim";
  var REPORT_PRODUCER_TEXT = "rationale";

  var WORDS = {
    "side.what_happened": "What happened",
    "side.criterion": "The criterion",
    "side.verdict": "The verdict, as the Result states it",
    "side.producer_said": "In the producer's words, not checked by this page",
    "side.criterion_as_recorded": "As the cited record states it",
    "side.analysis": "The producer's summary, in place of the evidence",
    "side.story": "The producer's account, in place of the evidence",
    "side.not_in_bundle": "Not in this bundle. This page does not fetch it.",
    "side.disclosure_mismatch": "The disclosed content does not match the record's digest, so it is not shown.",
    "side.no_evidence": "This claim cites no evidence.",
    "side.unsupported": "No verdict is drawn: the evidence this claim cites is not all in this bundle.",
    "side.failed": "No verdict is drawn: this claim failed this page's checks.",
    "carrier.withheld": "Withheld: the record is in this bundle, but its content is not disclosed.",
    "verdict.met": "Met",
    "verdict.not_met": "Not met",
    "verdict.not_evaluable": "Could not be decided",
    "verdict.out_of_scope": "Out of scope",
  };

  function obj(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v) ? v : {};
  }

  function str(v) {
    return typeof v === "string" ? v : undefined;
  }

  // One cited digest, as the reader resolved it: {digest, state, kind,
  // payload}. state is "disclosed", "withheld", "disclosure_mismatch" or
  // "not_in_bundle".
  function resolveRef(result, ref) {
    var digest = str(obj(ref).digest) || "";
    var record = ref.resolved === true && result.records && typeof result.records.get === "function" ? result.records.get(digest) : undefined;
    if (record === undefined) return { digest: digest, state: "not_in_bundle" };
    // A capsule a book record carries, cited by its own id, is its carried input.
    var input = obj(record.carriedCapsuleId === digest && record.carriedInput !== undefined ? record.carriedInput : record.agentInput);
    var state = input.state === "disclosed" ? "disclosed" : input.state === "disclosure_mismatch" ? "disclosure_mismatch" : "withheld";
    var out = { digest: digest, state: state };
    if (state === "disclosed") {
      out.payload = input.payload;
      if (str(obj(input.payload).record_type) !== undefined) out.kind = input.payload.record_type;
    }
    return out;
  }

  // The model render draws: the claim's own fields, its carrier, whether its
  // verdict is drawn, and each cited digest as the reader resolved it.
  function resolve(result, claim) {
    var c = obj(claim);
    var presentation = obj(c.presentation);
    var carrier = {
      kind: str(presentation.kind) || "",
      status: str(presentation.status) || "",
    };
    if (carrier.kind === "analysis" && str(presentation.summary) !== undefined) carrier.text = presentation.summary;
    if (carrier.kind === "story" && str(presentation.narrative) !== undefined) carrier.text = presentation.narrative;
    var evidence = (Array.isArray(c.evidence) ? c.evidence : []).map(function (ref) {
      return resolveRef(obj(result), obj(ref));
    });
    var model = {
      id: str(c.id) || "",
      contract_ref: str(c.contractRef) || "",
      requirement_ref: str(c.requirementRef) || "",
      verdict: str(c.verdict) || "",
      verdict_drawn: c.failed === true ? "failed" : c.support === "supported" ? "drawn" : "unsupported",
      tier: str(c.tier) || "",
      grade: str(c.grade) || "",
      sufficiency: str(c.sufficiency) || "",
      carrier: carrier,
      evidence: evidence,
    };
    if (str(c.appliesFrom) !== undefined) model.applies_from = c.appliesFrom;
    return model;
  }

  // Only the disclosure carrier shows record content; analysis and story
  // never do, and a withheld carrier status never does (ER section 2's gate).
  function showsContent(model) {
    return model.carrier.kind === DISCLOSURE && !WITHHELD_STATUSES[model.carrier.status];
  }

  // The evaluation reports among the disclosed evidence, when content is shown.
  function reports(model) {
    if (!showsContent(model)) return [];
    return model.evidence.filter(function (e) {
      return e.state === "disclosed" && e.kind === EVALUATION_REPORT;
    });
  }

  // ---- drawing ---------------------------------------------------------------

  function el(doc, tag, attrs, children) {
    var node = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === "string" ? doc.createTextNode(child) : child);
    });
    return node;
  }

  // A word from the pack (WORDS, or the host's layer over it).
  function word(doc, tag, attrs, text) {
    var a = { "data-source": "pack" };
    Object.keys(attrs || {}).forEach(function (k) {
      a[k] = attrs[k];
    });
    return el(doc, tag, a, [text]);
  }

  // A capsule or Result field, drawn as "name: value" in monospace.
  function field(doc, name, value) {
    return el(doc, "span", { class: "cv-side-field", "data-source": "field" }, [name + ": ", el(doc, "code", {}, [value])]);
  }

  function scalar(v) {
    return typeof v === "string" ? v : JSON.stringify(v);
  }

  // A disclosed payload, boxed: one row per member, in the record's order,
  // less the members drawn in their own column (the criterion, the producer's
  // words). Nested values are drawn as their JSON text.
  function payloadBox(doc, payload, skip) {
    var p = payload;
    if (p === null || typeof p !== "object" || Array.isArray(p)) {
      return el(doc, "pre", { class: "cv-side-payload", "data-source": "payload" }, [scalar(p)]);
    }
    var rows = Object.keys(p)
      .filter(function (k) {
        return !skip[k];
      })
      .map(function (k) {
        return el(doc, "div", { "data-member": k }, [el(doc, "dt", {}, [k]), el(doc, "dd", {}, [scalar(p[k])])]);
      });
    return el(doc, "dl", { class: "cv-side-payload", "data-source": "payload" }, rows);
  }

  function producerText(doc, w, text) {
    return el(doc, "p", { class: "cv-side-producer", "data-source": "producer" }, [
      word(doc, "span", { class: "cv-side-producer-label" }, w("side.producer_said")),
      ": ",
      el(doc, "i", {}, ["“" + text + "”"]),
    ]);
  }

  function stateNote(doc, w, state) {
    var key = {
      withheld: "carrier.withheld",
      not_in_bundle: "side.not_in_bundle",
      disclosure_mismatch: "side.disclosure_mismatch",
    }[state];
    return word(doc, "p", { class: "cv-side-state", "data-state": state }, w(key));
  }

  function whatHappened(doc, w, model) {
    var col = el(doc, "div", { class: "cv-side-col", "data-side": "what_happened" }, [word(doc, "h5", {}, w("side.what_happened"))]);
    if (model.evidence.length === 0) col.appendChild(word(doc, "p", { "data-state": "no_evidence" }, w("side.no_evidence")));
    var shows = showsContent(model);
    var skip = {};
    skip[REPORT_CRITERION] = true;
    skip[REPORT_PRODUCER_TEXT] = true;
    model.evidence.forEach(function (e) {
      var head = [field(doc, "digest", e.digest)];
      if (e.kind !== undefined) head.push(" · ", field(doc, "kind", e.kind));
      var item = el(doc, "div", { class: "cv-side-record", "data-evidence": e.digest, "data-state": e.state }, [el(doc, "p", {}, head)]);
      if (e.state !== "disclosed") item.appendChild(stateNote(doc, w, e.state));
      else if (shows) item.appendChild(payloadBox(doc, e.payload, e.kind === EVALUATION_REPORT ? skip : {}));
      col.appendChild(item);
    });
    if (!shows && model.carrier.text !== undefined) {
      var key = model.carrier.kind === "story" ? "side.story" : "side.analysis";
      col.appendChild(word(doc, "p", { class: "cv-side-carrier", "data-carrier": model.carrier.kind }, w(key)));
      col.appendChild(producerText(doc, w, model.carrier.text));
    }
    return col;
  }

  function criterion(doc, w, model) {
    var col = el(doc, "div", { class: "cv-side-col", "data-side": "criterion" }, [
      word(doc, "h5", {}, w("side.criterion")),
      el(doc, "p", {}, [field(doc, "contract_ref", model.contract_ref), " · ", field(doc, "requirement_ref", model.requirement_ref)]),
    ]);
    // The criterion as each cited report seals it, once per distinct wording.
    var seen = {};
    reports(model).forEach(function (e) {
      var text = str(obj(e.payload)[REPORT_CRITERION]);
      if (text === undefined || seen[text]) return;
      seen[text] = true;
      col.appendChild(
        el(doc, "blockquote", { class: "cv-side-criterion", "data-source": "payload", "data-evidence": e.digest }, [
          word(doc, "span", {}, w("side.criterion_as_recorded")),
          ": ",
          text,
        ]),
      );
    });
    return col;
  }

  function verdict(doc, w, model) {
    var verdictWord = model.verdict_drawn !== "drawn" ? w("side." + model.verdict_drawn) : model.verdict ? w("verdict." + model.verdict) : "";
    var col = el(doc, "div", { class: "cv-side-col", "data-side": "verdict" }, [
      word(doc, "h5", {}, w("side.verdict")),
      word(doc, "p", { class: "cv-side-verdict", "data-verdict": model.verdict, "data-verdict-drawn": model.verdict_drawn }, verdictWord),
      el(doc, "p", {}, [
        field(doc, "tier", model.tier),
        " · ",
        field(doc, "grade", model.grade),
        " · ",
        field(doc, "sufficiency", model.sufficiency),
        " · ",
        field(doc, "presentation.kind", model.carrier.kind),
        " · ",
        field(doc, "presentation.status", model.carrier.status),
      ]),
    ]);
    if (model.applies_from !== undefined) col.appendChild(el(doc, "p", {}, [field(doc, "applies_from", model.applies_from)]));
    reports(model).forEach(function (e) {
      var text = str(obj(e.payload)[REPORT_PRODUCER_TEXT]);
      if (text !== undefined) col.appendChild(producerText(doc, w, text));
    });
    return col;
  }

  // One claim, side by side, as one element for the page's deepest level.
  // words: optional {key: word} entries layered over WORDS; a key neither
  // holds is drawn as the key itself, never guessed.
  function render(model, doc, words) {
    var pack = obj(words);
    var w = function (key) {
      if (typeof pack[key] === "string") return pack[key];
      return Object.prototype.hasOwnProperty.call(WORDS, key) ? WORDS[key] : key;
    };
    return el(doc, "section", { class: "cv-side", "data-level": "L2", "data-claim": model.id, "data-verdict": model.verdict }, [
      el(doc, "h4", {}, [field(doc, "requirement_ref", model.requirement_ref), " · ", field(doc, "id", model.id)]),
      el(doc, "div", { class: "cv-side-cols" }, [whatHappened(doc, w, model), criterion(doc, w, model), verdict(doc, w, model)]),
    ]);
  }

  root.CapsuleViewerShowEvidence = {
    WORDS: WORDS,
    resolve: resolve,
    render: render,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
