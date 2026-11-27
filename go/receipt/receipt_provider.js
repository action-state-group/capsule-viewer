// SPDX-License-Identifier: Apache-2.0
// The receipt modules, in the page: capsuleviewer.receipt.unilateral/v0,
// capsuleviewer.receipt.seller/v0 and capsuleviewer.receipt.bilateral/v0 (the
// x-deal-v0 modules, each with a Python twin), capsuleviewer.receipt.deal/v1
// (the x-deal-v1 sealed report, no twin) and capsuleviewer.receipt.provider/v0
// (a Mesh provider's own record of an exchange it served, with a Python twin,
// capsule-viewer#390), as module-slot scripts (agent-action-capsule's presentation contract, as
// capsulectl.deal-view/v0 and capsuleviewer.history/v0 are).
//
// This file is the source of the five scripts the manifests pin
// (go/receipt/receipt_unilateral.js, receipt_seller.js, receipt_bilateral.js,
// receipt_deal.js and receipt_provider.js; capsule-viewer#383 made go/receipt the one receipt renderer).
// `go generate` in go/receipt writes each one from
// it, filling the lines marked "@generated": the module it registers, its
// manifest, the words (compiled in from the example English wording pack,
// go/receipt/wording-en.json, whose id and sha256 the page names in L2) and the
// kit stylesheet (src/capsule_viewer/static/kit.css), the receipt's dark
// overrides (static/kit-dark.css, capsule-viewer#391) and its own rules
// (go/receipt/receipt.css, capsule-viewer#429), each pinned by the manifest's
// style_sha256.
// Each script carries the whole of this file and registers exactly one
// module: the page builder puts one script in the page per module it chose,
// and a script never registers a module the builder did not choose.
//
// It is the twin of the Python modules (capsule_viewer.receipt: model.py,
// module.py, seller.py, bilateral.py, role.py, provider.py, frozen at 0.25.0), which stay the test oracle:
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

  var KIND = "provider"; // @generated KIND
  var MANIFEST = {"spec_version": "aac.presentation-manifest/v0", "id": "capsuleviewer.receipt.provider/v0", "presentation_api": "aac.presentation-api/v0", "runtime_min": "0.1.0", "trust_class": "trusted-executable", "requires": {"bundle_kind": "evidence-bundle/v2"}, "forbids": {"profiles": ["spec_version:report/v1", "spec_version:evaluation-summary/v1", "result_version:evidence-result-v0", "spec_version:org.example.rules-comparison/v0"], "extensions": ["x-deal-v0", "x-deal-v1", "composed/v1", "x-history-selection/v0", "x-standard-history/v0"]}, "audiences": ["keep"], "formats": ["html"], "fallback": false, "priority": 1, "executable": {"carrier": "module-slot", "script_sha256": "0000000000000000000000000000000000000000000000000000000000000000", "style_sha256": ["1b600ce6847453be63fd2613dbd07a9f6edc9ec9fe3ac6386ffece284c5ec73c", "1393b3ffc8c2702f79a9d2565201509560bc6008d34d325de8994b8d9ecc749b", "99f181ed34205bb6cfa8f5fd85de14d6b725f5f4e7cd8a3cf6ed3efdff30e56a"]}}; // @generated MANIFEST
  var WORDS = {"page.title": "Deal report", "badge.demo": "DEMO", "banner.private.label": "PRIVATE", "banner.private.text": "This is your own copy of this deal report, with everything this page shows. Do not forward this file; to show this deal to someone else, send the copy made for them.", "banner.shared.label": "Shared copy", "banner.shared.text": "The report owner's own record of this deal, included in this report because their \"Receipts in the settlement report\" setting is on. It is not the counterparty's copy.", "banner.page.text": "This node's own record of this exchange, saved as a page for anyone to check. It is not the other side's copy.", "summary.standalone": "This report's text is carried in the file outside the log. capsulectl verify reported its signature check as: {status}. This page did not check the signature itself.", "summary.standalone.here": "This report's text is carried in the file outside the log. This page checked it itself: signed by the deal's last step, matching its Capsule, and made at this deal's checkpoint.", "depth.l1": "Why: what was asked, proposed, approved and done", "depth.l2": "Verify: the records, their places in the log and the checks", "l0.deal_type": "Deal", "l0.item": "Item", "l0.amount": "Amount", "l0.state": "Where it stands", "l0.state.missing": "not stated", "deal_type.purchase": "Purchase", "deal_type.sale": "Sale", "deal_type.booking": "Booking", "deal_type.subscription": "Subscription", "deal_type.rental": "Rental", "deal_type.service": "Service", "state.open": "Open", "state.cancelled": "Cancelled", "state.closed": "Closed", "shared.counterparty": "A shared copy for the other party. Left out of this copy: {kinds}.", "shared.adjudicator": "A shared copy for an adjudicator. Left out of this copy: {kinds}.", "rung.witness_verified": "Witness receipt checked: the verifier checked a witness receipt in this file. Which steps that receipt covers is not shown here; capsulectl verify reports it. It does not confirm what the agent did.", "rung.unwitnessed": "No outside time stamp: this copy carries no witness receipt.", "rung.witness_failed": "A witness receipt is in this file and did not verify.", "countersign.none": "Not countersigned in this copy. A signature from the other party, if there is one, is in their own copy.", "countersign.none.two_sided": "No countersignature in this copy (a separate signature over the whole copy). The other party's own signed agreement is the line above.", "counterparty_half.verified": "Signed by both sides: this copy carries the other party's signed agreement, recorded in their own book. capsulectl verify reported it as verified; this page did not check it itself. It covers their agreement only, not anything after it.", "countersign.some": "Countersignatures, as the verifier reported them: {statuses}.", "section.authorized": "What you asked", "section.authorized.report": "What the owner asked", "section.proposed": "What the agent proposed, and how it was checked", "section.approved": "What you approved", "section.approved.report": "What the owner approved", "section.merchant": "The merchant's own evidence", "section.acted": "What the agent did", "section.lifecycle": "Where this deal stands", "section.statements.keep": "What your agent told the buyer", "section.statements.keep.report": "What the owner's agent told the buyer", "section.statements.counterparty": "What the seller's agent told you", "section.statements.counterparty.report": "What the seller's agent told the buyer", "section.statements.adjudicator": "What the seller's agent told the buyer", "section.told": "What your agent told whom", "section.told.report": "What the owner's agent told whom", "section.deadlines": "Cancel-by and due dates", "section.cancellation": "Your cancellation", "section.cancellation.report": "The owner's cancellation", "section.anomalies": "Problems spotted", "section.other": "Other steps", "section.claims": "What this does not claim", "section.records": "Every record in this receipt", "section.provenance": "Who sealed these records", "asked.opened": "✓ These are the exact words sealed when the deal opened.", "asked.committed": "Your words are sealed as a commitment, and their opening is not in this copy, so they are not checked here.", "asked.committed.report": "The owner's words are sealed as a commitment, and their opening is not in this copy, so they are not checked here.", "asked.mismatch": "⚠️ The words you asked could not be checked against the sealed record.", "asked.mismatch.report": "⚠️ The words the owner asked could not be checked against the sealed record.", "asked.withheld": "Withheld from this copy.", "asked.not_present": "The deal's opening step is not in this report.", "statement.opened": "✓ These are the exact words sealed when the agent said them; this page does not check that they are true.", "statement.mismatch": "⚠️ A statement here could not be checked against its sealed step.", "statement.committed": "A statement is sealed as a commitment; its opening is not in this copy.", "statement.withheld": "A statement's step is withheld from this copy.", "statement.not_present": "A statement's step is not in this report.", "class.condition": "Condition", "class.warranty": "Warranty", "class.refund_terms": "Refund terms", "class.delivery_promise": "Delivery promise", "class.other": "Other", "summary.sealed": "The text on this page was written by {producer} when the receipt was made and sealed as a record in this file; the verifier checked that record. It summarises the steps and is not the steps themselves.", "summary.lines": "The summary lines below, and each step's line, were written by {producer} and sealed with the receipt: they were checked as unchanged since, not that they are right. Under each item are the steps it was read from; each step's sealed record is checked.", "acted.nothing": "Nothing yet.", "merchant.none": "No merchant email is attached to this receipt.", "merchant.intro": "Two different things stand behind each email. The merchant's signature is checked against the merchant's published key, saved when the email was sealed; it shows what the merchant sent, and it does not depend on the agent. The receipt's seal shows these exact bytes were kept unchanged from that time on; it is the sealer's own record. Amounts, dates and order numbers below are read from the email by {producer} and may be misread.", "merchant.order": "Order {order}", "merchant.email": "Merchant email", "merchant.signature": "Merchant's signature: {text}", "merchant.seal": "Our seal: {text}", "merchant.key_supplied": "The merchant's key was supplied by hand, not read from the merchant's DNS.", "merchant.approved": "You approved", "merchant.approved.report": "The owner approved", "merchant.approved_basis": "You approved ({basis})", "merchant.approved_basis.report": "The owner approved ({basis})", "merchant.agent_reported": "The agent reported paying", "merchant.charged": "The merchant's email says (read from the email)", "merchant.charged_on": "Charged on (the email's date)", "merchant.cancel_by": "Cancel by (read from the email)", "merchant.items": "Items (read from the email)", "merchant.domains": "Signing domain", "merchant.key_size": "Merchant's key (sealed when the email was sealed)", "lifecycle.later": "{at} · confirms the close: {text}", "lifecycle.as_of": "{text} (as of {at})", "told.none": "Nothing about you was recorded as shared.", "told.none.report": "Nothing about the owner was recorded as shared.", "told.note": "Only what the agent sealed as shared is listed here; something it told without sealing it is not.", "cancellation.shows": "What this shows", "cancellation.not_shows": "What this does not show", "anomalies.agent": "Agent side", "anomalies.counterparty": "Counterparty side", "anomalies.none": "None reported.", "claims.tamper": "It is tamper-evident: it shows these records were not changed after they were sealed, not who made them.", "claims.reported": "It records what the agent reported. It does not show that what was reported was true.", "claims.merchant": "It does not prove the merchant shipped, delivered or refunded anything.", "claims.scope": "The verification below covers every step's sealed record and its place in this deal's log. The records carry fingerprints, not names or numbers; the words shown come from the device that sealed them. The seal key is on the agent's machine, so this shows the record was not changed after it was made, not who made it. It covers this skill's own records only, never the agent host's own store.", "claims.withheld": "Steps marked WITHHELD are proven present and unchanged, at their place in the log; what they say is not in this copy.", "step.position": "Step {n} · {at}", "step.unnumbered": "A step this receipt cites", "step.line": "The receipt's line: {text}", "verify.tested": "Checked by {verifier}: {checks}. This page shows its answer; it did not re-check anything itself.", "verify.tested_here": "Checked in this browser by {verifier}: {checks}.", "verify.check_one": "{name} ({outcome})", "verify.checks_all": "{checks} (all {outcome})", "verify.self_reported": "Reported by {verifier}: {checks}. This view shows that report; it did not re-check anything itself.", "verify.reported": "Checked by {verifier}. This page shows its answer; it did not re-check anything itself.", "money.test": "Test money: this deal's payment was on a simulated rail. No real money moved.", "record.short": "{head}…{tail}", "value.action.pay": "Pay", "value.action.commit": "Commit to the deal", "value.action.offer": "Make an offer", "value.action.share_contact": "Share contact details", "value.action_class.money.purchase": "Spend money on a purchase", "value.action_class.agreement.accept": "Accept an agreement", "value.action_class.marketplace.offer": "Make an offer in a marketplace", "value.action_class.disclosure.personal": "Share personal details", "value.action_class.external_commitment.other": "Another kind of commitment to an outside party", "value.result.pass": "Passed", "value.result.pause": "Paused to ask first", "value.disposition.do": "Go ahead", "value.disposition.ask": "Ask first", "value.approver.user": "The person, directly", "value.approver.human": "Another person", "value.approver.standing_intent": "The person's standing instructions to the agent", "value.approver.policy": "A policy", "value.choice.proceed": "Go ahead", "value.direction.out": "Money going out", "value.direction.in": "Money coming in", "value.rail.card": "Card", "value.rail.lightning": "Lightning", "value.rail.simulated": "Simulated (test money)", "value.judge.rules": "Rules", "value.rules.not_configured": "No rules checker was set for this check", "value.rules.evaluated": "Checked by the rules", "value.rules.not_evaluated": "The rules could not be checked", "value.rules.not_applicable": "No rules apply to this step", "value.result.deny": "Refused by the rules", "value.approver.agent_card": "The agent's card", "step.log": "seq {seq} · leaf {leaf} · {log}", "step.no_log": "no place in a log was supplied", "step.record": "Record", "step.type": "Recorded as", "step.key": "Signing key", "steps.summary": "The steps this was read from", "records.step": "Step", "records.kind": "Recorded as", "records.disclosure": "Disclosure", "records.log": "Place in the log", "records.id": "Record", "records.report": "the sealed report", "records.unknown": "not in this copy", "provenance.by": "Produced by {producers}.", "provenance.then": ", then ", "provenance.unrecorded": "a producer that did not record its version", "provenance.the_producer": "the producer", "wording.provenance": "This page's words: wording pack {id}, sha256 {sha}.", "fact.deal_type": "Deal type", "fact.allowed": "Allowed", "fact.item": "Item", "fact.quantity": "Quantity", "fact.price": "Price", "fact.expect_close_by": "Expected to close by", "fact.asked.item": "You asked for (item)", "fact.asked.item.report": "The owner asked for (item)", "fact.asked.quantity": "You asked for (quantity)", "fact.asked.quantity.report": "The owner asked for (quantity)", "fact.action": "Action", "fact.action_class": "Action class", "fact.amount": "Amount", "fact.authorized_max": "Most you allowed", "fact.authorized_max.report": "Most the owner allowed", "fact.material_fields_changed": "Material details changed", "fact.offer_fields_changed": "Offer details changed", "fact.result": "Check result", "fact.differences": "Differences found", "fact.judge": "Checked by", "fact.rules": "Rules", "fact.notes": "Notes", "fact.approver": "Approved by", "fact.choice": "Choice", "fact.direction": "Direction", "fact.rail": "Paid by", "fact.class": "Statement class", "fact.source_kind": "Said by", "rung.book_witnessed": "Time-stamped by {witness} at {at} ({utc}), as capsulectl verify reported on your own book. This file carries no witness receipt, so this page did not check it itself.", "rung.book_witness_failed": "capsulectl verify reported that your own book's witness time-stamp did not verify, so no time-stamp is shown. This page did not check it itself.", "rung.book_witness_withheld": "capsulectl verify found no time-stamp for your own book from the witnesses it was given. That does not mean there is none. This page did not check it itself.", "rung.unreported": "No witness result was reported to this page.", "l2.bundle_digest": "The verifier's report is for the bundle with digest", "fact.disposition": "Disposition", "bilateral.title": "Deal report: both parties' copies", "bilateral.title.one_sided": "Deal report: one party's copy", "deal.agree": "Both copies name one deal: {deal}.", "deal.one": "This copy is for deal {deal}.", "deal.mismatch": "The copies name different deals ({deals}). They are not shown as one deal, and neither is picked.", "deal.unnamed": "A copy names no deal, so the copies are not shown as one deal.", "party.heading": "{role} copy ({member})", "party.role_undeclared": "Undeclared", "parts.own": "Each copy is shown from its own records. What one copy leaves out is never filled in from the other.", "joins.heading": "How the two copies line up", "joins.none": "The composition declares no join between the copies.", "sides.case.both": "Stamped by both sides: both records are here, and the verifier found they agree.", "sides.case.one_sided": "Your receipt only: the other side's record is missing.", "sides.case.one_sided.shared": "One side's record only: the other side's record is missing.", "sides.case.limit": "Your receipt only: the other side's record is not shared. That is the limit they set on what they share, and it says nothing against the deal.", "sides.case.limit.shared": "One side's record only: the other side's record is not shared. That is the limit they set on what they share, and it says nothing against the deal.", "sides.case.not_agreed": "Not stamped by both: the two records do not show one agreement.", "sides.ours": "Your side · in your book", "sides.ours.shared": "The report owner's side · in their book", "sides.ours.page": "This node's side · in its book", "sides.theirs": "Their side · as received", "sides.half": "{role}'s side · as received", "sides.missing.heading": "Their side", "sides.missing.none": "No record. Nothing from their side is in this receipt.", "sides.missing.absence": "No record. Their side was asked on {start} and had not answered by {end}. The ask is on record.", "sides.missing.refusal.policy_declined": "Not shared. Their side was asked for its record, and on {date} signed a reply that its sharing policy does not allow it. This is a limit on what they share. They have not refused the deal.", "row.both": "stamped by both", "row.one_sided": "your receipt only", "row.one_sided.page": "this node's receipt only", "row.none": "no record", "row.cannot_check": "this browser can't check the receipt", "row.did_not_verify": "the receipt did not verify: do not rely on it", "row.cannot_check_pointer": "Open the bundle in the offline viewer (capsule-viewer) to check it; this page shows no verdict for it.", "row.cannot_check.report_rule": "This page can't check this receipt, so it shows nothing from it and no verdict.", "row.cannot_check.report_rule_pointer": "To check it, run `capsulectl deal verify --bundle <file>` on the receipt file. It needs the capsulectl-deal plugin.", "row.cannot_check.report_rule.row": "can't be checked here", "row.cannot_check.downgraded": "⚠️ The receipt's text is not shown: this copy names no sealed report, so its text could not be checked.", "row.cannot_check.downgraded_verdict": "`capsulectl deal verify --bundle <file>` reports this copy as INVALID (sealed_report_not_named).", "row.cannot_check.downgraded.row": "receipt text not checked", "row.page.receipt": "Receipt: {label}", "row.page.records_tied": "{tied} of {total} records in the receipt are tied to a signed checkpoint.", "actions.heading": "Tell your agent:", "actions.dispute": "“Dispute this”", "actions.send": "“Send me this receipt”", "actions.show_theirs": "“Show me the other side's receipt”", "actions.ask_again": "“Ask their side again”", "actions.ask": "“Ask their side for their receipt”", "join.line": "{basis}: declared {declared}; the verifier derived {derived}.", "join.basis.pre_agreed_identifier": "Pre-agreed identifier", "join.basis.shared_artifact_digest": "Shared artifact digest", "join.basis.issued_receipt": "Issued receipt", "join.basis.same_interval": "Same interval", "join.state.agree": "agree", "join.state.mismatch": "mismatch", "join.state.unjoined": "unjoined", "join.state.one_sided": "one-sided", "join.state.not_derivable": "not derivable", "join.result.join_state_mismatch": "What was declared is not what the verifier derived.", "corroboration.corroborating": "They agree, and their declared custody differs: corroborating, on declared custody only.", "corroboration.redundant": "They agree, but redundantly, not corroborating ({reasons}).", "l2.composition": "How the copies were put together, as the verifier checked it", "seller.title": "Sale receipt", "seller.depth.l1": "Why: what was authorised, said, offered, accepted and handed over", "seller.l0.item": "Sold", "seller.l0.amount": "Amount agreed", "seller.l0.payment": "Payment", "seller.l0.handover": "Handed over", "seller.payment.not_recorded": "Not recorded in this copy", "seller.handover.seller_observed": "By the seller's own record (not confirmed by the buyer or a carrier)", "seller.handover.none": "Not recorded", "seller.outcome.completed": "Closed: matches what was agreed", "seller.outcome.mismatch": "Closed: differs from what was agreed", "seller.outcome.not_selected": "Closed: not selected", "seller.outcome.open": "Open", "seller.fact.allowed_actions": "The agent may", "seller.fact.outcome_id": "Kind of deal", "seller.floor.committed": "The lowest price is sealed as a commitment. Its opening is in this copy; this page does not open it.", "seller.floor.withheld": "The lowest price is not in this copy.", "seller.floor.not_present": "No lowest price is sealed in this copy.", "seller.section.authorised.keep": "What you authorised", "seller.section.authorised.keep.report": "What the owner authorised", "seller.section.authorised.counterparty": "What the seller authorised their agent to do", "seller.section.authorised.adjudicator": "What the seller authorised their agent to do", "seller.section.represented.keep": "What your agent told this buyer", "seller.section.represented.keep.report": "What the owner's agent told this buyer", "seller.section.represented.counterparty": "What the seller's agent told you", "seller.section.represented.counterparty.report": "What the seller's agent told the buyer", "seller.section.represented.adjudicator": "What the seller's agent told the buyer", "seller.represented.none": "No statement to the buyer is recorded in this copy.", "seller.section.offers": "Offers, and which replaced which", "seller.offers.none": "No offer is disclosed in this copy.", "seller.offers.action": "Proposed", "seller.offers.amount": "Amount", "seller.offers.status": "Status", "seller.offers.note": "A later offer that names an earlier one replaces it; the earlier one can no longer be accepted.", "seller.offer.accepted": "accepted by the buyer", "seller.offer.superseded": "replaced by a later offer", "seller.offer.open": "not replaced", "seller.action.offer": "Offer", "seller.action.commit": "Commit", "seller.section.accepted.keep": "What the buyer accepted", "seller.section.accepted.counterparty": "What you accepted", "seller.section.accepted.counterparty.report": "What the buyer accepted", "seller.section.accepted.adjudicator": "What the buyer accepted", "seller.accepted.none": "No acceptance is recorded in this copy.", "seller.accepted.offer": "The acceptance names the offer at step", "seller.accepted.offer_not_here": "The acceptance names an offer that is not disclosed in this copy.", "seller.accepted.digest": "Digest of the exact offer accepted:", "seller.accepted.words": "The seller's agent recorded this acceptance as an observation. The buyer's words are sealed as a commitment and are not shown here.", "seller.section.payment": "Payment", "seller.payment.none": "This copy carries no payment record. Evidence the seller's agent recorded is listed with its source; this page does not read what it is about.", "seller.evidence.source": "Evidence from", "seller.evidence.verified": "marked verified", "seller.evidence.unverified": "not verified", "seller.evidence.withheld": "An evidence step is withheld from this copy.", "seller.section.handover": "Handover, and who says so", "seller.provenance.seller_observed": "The seller's own record:", "seller.provenance.seller_observed.recorded": "recorded (a claim by the seller)", "seller.provenance.seller_observed.withheld": "withheld from this copy", "seller.provenance.seller_observed.not_present": "not recorded", "seller.provenance.carrier": "A carrier's confirmation:", "seller.provenance.carrier.not_present": "none in this copy", "seller.provenance.buyer_confirmed": "The buyer's confirmation:", "seller.provenance.buyer_confirmed.not_present": "none in this copy (only the buyer's own records can carry it)", "seller.delivered.item": "Handed over (item)", "seller.delivered.quantity": "Handed over (quantity)", "seller.delivered.price": "At the price", "seller.handover.note": "A handover recorded by the seller alone shows what the seller says was handed over, not that the buyer received it.", "seller.address.committed": "An address was given. Its record carries the field's class and a commitment to the value, not the value.", "seller.address.withheld": "The address given is not in this copy.", "seller.address.not_present": "No address is recorded as given in this copy.", "seller.section.given.keep": "What your agent gave this buyer", "seller.section.given.keep.report": "What the owner's agent gave this buyer", "seller.section.given.counterparty": "What the seller's agent gave you", "seller.section.given.counterparty.report": "What the seller's agent gave the buyer", "seller.section.given.adjudicator": "What the seller's agent gave the buyer", "seller.section.obligations": "Open obligations", "seller.obligations.none": "No open obligation is recorded in this copy.", "seller.not_selected": "The seller closed this thread without a sale to this buyer. Nothing was committed or handed over in it.", "seller.threads": "This copy covers one buyer's thread. Other buyers' threads of the same sale are not in it.", "seller.claims.handover": "It does not show that the buyer received anything: a handover recorded by the seller is the seller's claim.", "seller.section.chain": "Offers and what they replaced", "seller.chain.digest": "Record digest", "seller.chain.supersedes": "Replaces step", "seller.chain.superseded_by": "Replaced by step", "seller.section.commitments": "Commitments the disclosed records seal", "seller.commitment.field": "Field", "seller.commitment.value": "Commitment", "seller.commitment.state": "Opening", "seller.commitment.opened": "opened on this page", "seller.commitment.sealed": "not opened on this page", "seller.section.legs": "Settlement legs", "seller.leg.name": "Leg", "seller.leg.state": "In this copy", "seller.leg.agreement": "Agreement", "seller.leg.payment": "Payment", "seller.leg.handover": "Handover", "seller.leg.recorded": "recorded", "seller.leg.none": "not recorded", "seller.section.keys": "Signing keys", "seller.asked.opened": "✓ These are the seller's exact words, sealed when the sale opened.", "seller.asked.committed": "The seller's words are sealed as a commitment, and their opening is not in this copy, so they are not checked here.", "seller.asked.mismatch": "⚠️ The seller's words could not be checked against the sealed record.", "seller.asked.withheld": "The seller's words are withheld from this copy.", "seller.asked.not_present": "The sale's opening step is not in this copy.", "seller.fact.asked.item": "To sell (item)", "seller.fact.asked.quantity": "To sell (quantity)", "seller.fact.item": "Item", "seller.fact.price": "Asking price", "seller.shared.counterparty": "A shared copy for the buyer. What it leaves out is listed under Why.", "seller.shared.adjudicator": "A shared copy for an adjudicator. What it leaves out is listed under Why.", "seller.section.left_out": "What this copy leaves out", "class.address": "address", "class.credential": "login", "class.email": "email", "class.home_address": "home address", "class.id_document": "ID document", "class.name": "name", "class.other_contact": "contact details", "class.payment_card": "payment card", "class.phone": "phone", "class.pickup_area": "pickup area", "class.pickup_location": "pickup location", "class.verification_code": "verification code", "section.journey": "How it went", "journey_by.user": "You", "journey_by.user.report": "Owner", "journey_by.agent": "Your agent", "journey_by.agent.report": "Owner's agent", "journey_by.other": "The other side", "journey_by.unknown": "Someone", "journey_note": "Who moved, and each row's names, items and amounts, come from the report sealed in this file; open a row to see the step it came from. The rest of the wording comes from this page and is not sealed.", "journey.agent.act.cancel": "Cancelled", "journey.agent.act.commit": "Booked", "journey.agent.act.offer": "Made an offer", "journey.agent.act.other": "Done", "journey.agent.act.pay": "Paid {amount}", "journey.agent.act.pay.no_amount": "Paid", "journey.agent.act.pay.within": "Paid {amount} within your {limit} limit", "journey.agent.act.pay.within.report": "Paid {amount} within the owner's {limit} limit", "journey.agent.act.sign": "Signed", "journey.agent.asked_seller": "Asked the seller", "journey.agent.checked": "Checked", "journey.agent.chose": "Chose for you", "journey.agent.chose.report": "Chose for the owner", "journey.agent.chose.item": "Chose {item} for you", "journey.agent.chose.item.report": "Chose {item} for the owner", "journey.agent.couldnt": "Couldn't ({reason})", "journey.agent.couldnt.who": "Couldn't ({who} {reason})", "journey.agent.options": "Showed you {count} options", "journey.agent.options.report": "Showed the owner {count} options", "journey.agent.paused": "Waited for your OK", "journey.agent.paused.report": "Waited for the owner's OK", "journey.agent.recommended": "Recommended", "journey.agent.searched": "Searched", "journey.agent.told": "Told {who} your {classes}", "journey.agent.told.report": "Told {who} the owner's {classes}", "journey.other.changed": "Seller changed", "journey.other.said": "Seller said", "journey.reason.blocked": "blocked", "journey.reason.cannot_ship_here": "can't ship here", "journey.reason.out_of_stock": "out of stock", "journey.reason.payment_declined": "payment declined", "journey.reason.sign_in_required": "sign-in", "journey.reason.site_error": "site error", "journey.user.approved.commit": "OK'd agreeing to {amount}", "journey.user.approved.offer": "OK'd offering {amount}", "journey.user.approved.other": "OK'd it", "journey.user.approved.pay": "OK'd paying {amount}", "journey.user.approved.share_contact": "OK'd sharing your {classes}", "journey.user.approved.share_contact.report": "OK'd sharing the owner's {classes}", "journey.user.asked": "Asked", "journey.user.called_off": "Called off", "journey.user.changed": "Changed what you asked", "journey.user.changed.report": "Changed what the owner asked", "journey.user.declined.commit": "Said no to agreeing to {amount}", "journey.user.declined.offer": "Said no to offering {amount}", "journey.user.declined.other": "Said no", "journey.user.declined.pay": "Said no to paying {amount}", "journey.user.declined.share_contact": "Said no to sharing your {classes}", "journey.user.declined.share_contact.report": "Said no to sharing the owner's {classes}", "journey.user.narrowed": "Narrowed", "journey.user.picked": "Picked", "journey.user.raised": "Raised", "journey.user.switched": "Switched to {who}", "journey.user.switched.item": "Switched to {item}", "deal.title": "Receipt report", "deal.depth.l1": "Terms: what each term stands at", "deal.state.started": "Started", "deal.state.awaiting_agreement": "Awaiting agreement", "deal.state.not_started": "Not started", "deal.report.scope": "A report that passes the check shows who signed it and which deal it covers. It does not show that each term's status is correct. It is the holder's own record of the deal.", "deal.settled": "Settled: every term has both sides saying the same, is uncontested, or is ruled with its remedy made, as the holder computed it.", "deal.start.by": "Started by: {by}.", "deal.start.by.offerer_in_time": "the offerer, in time", "deal.start.by.acceptor_named": "the acceptor, as named", "deal.start.by.first_act": "the first act", "deal.local": "Holder's time only: this result rests on a record with no time from a named witness, so when it happened is the holder's own word.", "deal.rows.not_started": "Nothing is agreed yet, so there are no terms to show.", "deal.rows.withheld": "The holder has not shared each term's status with this reader.", "deal.rows.none": "The agreement lists no terms.", "deal.rows.note": "Each status is the one the holder computed. This page shows it and does not compute it.", "deal.as_of": "As the holder computed it at {at}. This is not a time any witness attests.", "deal.no_time": "no time", "deal.date.not_set": "not set", "deal.section.rows": "Terms", "deal.section.basis": "The records each term's status rests on", "deal.section.rests": "What this report rests on", "deal.col.row": "Term", "deal.col.owed_by": "Owed by", "deal.col.status": "Status", "deal.col.due": "Due", "deal.col.window_end": "Contest window ends", "deal.col.detail": "Detail", "deal.col.record": "Record", "deal.col.side": "Side", "deal.col.time": "Time", "deal.basis.none": "No record is listed for any term.", "deal.status.not_reached": "Not reached", "deal.status.not_due": "Not due", "deal.status.no_statement": "No statement", "deal.status.waiting": "Waiting for the other side", "deal.status.uncontested": "Uncontested", "deal.status.agreed_so_far": "Both say the same so far", "deal.status.agreed": "Both say the same", "deal.status.in_disagreement": "Statements differ", "deal.status.in_dispute": "In dispute", "deal.status.ruled": "Ruled", "deal.value.met": "met", "deal.value.not_met": "not met", "deal.remedy.none": "none ordered", "deal.remedy.due": "due", "deal.remedy.made": "recorded as made", "deal.remedy.not_honoured": "not honoured", "deal.remedy.not_counted": "a payment, ordered by the ruling; not checked yet", "deal.row.remedy_made": "The owing side has recorded making it (not checked).", "deal.check.passed": "passed", "deal.check.failed": "failed", "deal.check.not_run": "not run", "deal.check.not_recomputed": "not recomputed", "deal.row.value": "Statement: {value}", "deal.row.remedy": "Remedy: {remedy}", "deal.row.ruling": "Ruling: {value}, against the {side}", "deal.row.check": "Payment check: {check}", "deal.pack_digest": "The terms pack the agreement cites, by digest:", "deal.rests.own": "The holder's own log held {size} records.", "deal.rests.counterparty": "The other side's log was counted to {counted} records.", "deal.rests.fork": "The other side's log forks at record {at}.", "deal.rests.layer": "The other side keeps its own record of this deal.", "deal.rests.no_layer": "The other side does not keep its own record of this deal.", "deal.rests.witnesses": "Witnesses the agreement names: {count}.", "deal.named_witness.yes": "yes", "deal.named_witness.no": "no", "deal.col.named_witness": "Time from a named witness", "deal.row.ruling.bare": "Ruling: {value}", "deal.side.buyer": "buyer", "deal.side.seller": "seller", "deal.section.legs": "Payment records the terms' statuses rest on", "deal.col.leg_side": "Side, as the report names it", "deal.col.leg": "Leg", "deal.col.leg_status": "Status as recorded", "deal.col.amount": "Amounts as recorded", "deal.col.observed": "Observed at (as recorded)", "deal.col.payment_ref": "Payment reference", "deal.legs.note": "Each line is a payment record a term relies on, shown as the record states it. This page does not check who signed each record, does not match the legs and does not judge the payment; the payment check above is the only verdict.", "deal.col.sealer": "Sealer, as recorded", "deal.legs.note.withheld": "This copy withholds the terms, so these payment records are not tied to a term. They are the records the report's holder says its terms rest on, shown as each states it. This page does not check who signed them and does not judge the payment.", "deal.legs.none.withheld": "This copy withholds the terms. Among the records the report's holder says they rest on, there is no payment record.", "deal.legs.none": "No payment record is among the records the terms' statuses rest on.", "deal.legs.why.statements": "These terms rest only on what the sides say, not on a payment record, so this page does not show or check a payment.", "deal.legs.why.mixed": "These terms rest on what the sides say and on other deal records. None is a payment record, so this page does not show or check a payment.", "deal.legs.why.other": "These terms rest on deal records, none of them a payment record, so this page does not show or check a payment.", "deal.legs.why.no_records": "No term's status rests on any record yet, so there is no payment record to show.", "deal.state.terms": "Terms: {tally}", "deal.state.terms.count": "{status} ({count} of {total})", "deal.term.paid_as_agreed": "Payment as agreed", "deal.term.delivered": "Delivery", "deal.term.as_described": "Item as described", "deal.named_witness.report.own": "yes, as your report states it", "settlement.lightning.proof": "Payment: settled on Lightning; this page checked its proof against its invoice.", "settlement.lightning.failed": "Payment: recorded as settled on Lightning, but its proof did not match its invoice when this page checked it.", "settlement.lightning.sealed": "Payment: recorded as settled on Lightning; its proof is sealed in this file, so this page can't check it.", "settlement.lightning.withheld": "Payment: recorded as settled on Lightning; this copy does not show its proof.", "settlement.lightning.partial": "Payment: recorded as settled on Lightning; this file carries a proof for only some of its payments, so this page checked none of them.", "settlement.lightning.final": "Payment: the payee's wallet reported it final on Lightning; this file carries no proof to check.", "settlement.x402": "Payment: recorded as settled on x402; this page does not check the on-chain record.", "settlement.other": "Payment: recorded as settled; this page can't check payments on this rail.", "settlement.missing": "Payment: a {rail} payment; no settlement record is in this file.", "settlement.card": "Payment: a card payment; the card processor's report is not in this file.", "settlement.size": " Size: {band}.", "size.between": "{low} – {high}", "size.under": "under {amount}", "size.range": "{low} to under {high} {currency}", "deal.surface.title": "Deal receipt", "deal.surface.title.buyer": "Order receipt", "deal.surface.title.seller": "Sale receipt", "deal.surface.tag.private": "Private: your copy", "deal.surface.tag.shared": "Shared copy", "deal.surface.download": "Download proof file", "deal.top.settled": "Settled, as your records show", "deal.top.settled.report": "Settled, as the holder's records show", "deal.top.settled.seller": "Sale settled, as your records show", "deal.top.settled.seller.report": "Sale settled, as the holder's records show", "deal.top.ruled_not_met": "Ruled: {term} not met", "deal.top.remedied": "Settled after a remedy: {term} not met, remedy made", "deal.top.none_due": "Settled: no term came due", "deal.top.paid_waiting": "Payment recorded. Waiting for the seller to say it too", "deal.top.paid_waiting.seller": "Payment recorded as received. Waiting for the buyer to say it too", "deal.top.waiting": "Waiting for the seller to say it too", "deal.top.waiting.seller": "Waiting for the buyer to say it too", "deal.top.in_dispute": "In dispute before the adjudicator", "deal.top.in_disagreement": "The two sides' statements differ", "deal.top.state.awaiting_agreement": "Awaiting agreement", "deal.top.state.not_started": "Not started", "deal.seal.done": "Done: recorded as settled, and both sides say the same", "deal.seal.not_as_agreed": "Didn't go as agreed", "deal.seal.short": "Intact, not true: the seal says the records are unchanged, not that what they say is true.", "deal.card.status": "Status", "deal.card.status.done": "Settled", "deal.card.as_of": "As of {at}", "deal.card.other.seller": "Seller's side", "deal.card.other.buyer": "Buyer's side", "deal.card.other.verified": "Their signed agreement: capsulectl verify reported it verified", "deal.card.other.none": "Not in this copy", "deal.stamp.recorded": "RECORDED", "deal.stamp.recorded.filled": "Checkpointed", "deal.stamp.recorded.partial": "Checkpointed through step {k} of {n}", "deal.stamp.recorded.open": "Not checkpointed yet", "deal.stamp.recorded.not_checked": "Not checked here", "deal.stamp.recorded.failed": "Didn't verify", "deal.stamp.time_stamped": "TIME-STAMPED", "deal.stamp.time_stamped.filled": "{witness} · {at}, as capsulectl verify reported", "deal.stamp.time_stamped.open": "Not time-stamped yet", "deal.stamp.time_stamped.not_checked": "Not checked here", "deal.stamp.time_stamped.failed": "Didn't verify", "deal.stamp.countersigned": "COUNTERSIGNED", "deal.stamp.countersigned.open": "Not countersigned", "deal.stamp.countersigned.not_checked": "Not checked here", "deal.section.steps": "What happened, step by step", "deal.steps.lede": "{count} sealed steps in this copy. Open one to see exactly what was recorded.", "deal.steps.none": "This copy carries no sealed steps.", "deal.step.withheld": "A sealed step whose contents are not in this copy", "deal.step.agree": "Deal agreed", "deal.step.settle.payer": "Payment recorded as settled: {amount}", "deal.step.settle.payee": "Payment recorded as received: {amount}", "deal.step.statement": "You said: {said}", "deal.step.statement.report": "The holder said: {said}", "deal.step.other": "A {kind} record", "deal.drawer.kind": "Kind", "deal.drawer.kind.withheld": "not in this copy", "deal.drawer.time": "When", "deal.drawer.leg": "Payment", "deal.drawer.payment_ref": "Payment reference", "deal.drawer.role": "Side", "deal.drawer.record": "Record", "deal.drawer.seq": "seq {seq}", "deal.drawer.leaf": "leaf {leaf}", "deal.section.proof": "Is this record intact?", "deal.proof.lede.passed": "Yes. capsulectl verify passed every test when this page was made. The page shows its answer; it did not re-check by itself.", "deal.proof.lede.partial": "capsulectl verify passed every test it ran when this page was made; a test marked – was not run on this copy. The page shows its answer; it did not re-check by itself.", "deal.proof.lede.failed": "No. capsulectl verify reported a test that failed.", "deal.proof.lede.none": "This page was not given capsulectl verify's answer for each test. Download the proof file and check it yourself.", "deal.proof.producer_signatures": "Signed by the agent's device", "deal.proof.interval_coverage": "No step missing from first to last", "deal.proof.graph_closure": "Each step links to the one before", "deal.proof.per_record_membership": "Every step is in this deal's log", "deal.proof.checkpoint": "The log's summary adds up", "deal.proof.witness.filled": "Outside time stamp: {witness} at {at}, as capsulectl verify reported on your own book", "deal.proof.witness.open": "Outside time stamp: not in this copy", "deal.proof.witness.not_checked": "Outside time stamp: not checked here", "deal.proof.witness.failed": "Outside time stamp: didn't verify", "deal.proof.witness.note": "Your History card's checkpoint may carry it.", "deal.proof.witness.note.report": "The holder's History card's checkpoint may carry it.", "deal.proof.status.pass": "passed", "deal.proof.status.fail": "failed", "deal.proof.status.absent": "not in this copy", "deal.proof.status.withheld": "not run on this copy", "deal.check.title": "Check it yourself", "deal.check.no_command": "Download the proof file and run capsulectl deal verify --bundle on it.", "deal.check.expect": "Expect: {verdict}, fingerprint {fingerprint}.", "deal.section.not_proven": "What this does not prove", "deal.not_proven.true": "That what the agents said was true. Only that it wasn't changed after sealing.", "deal.not_proven.who": "Who made the records. The signing key is on your agent's machine.", "deal.not_proven.who.report": "Who made the records. The signing key is on the holder's agent's machine.", "deal.not_proven.goods": "That the goods shipped or arrived.", "deal.not_proven.outside": "Anything outside this deal.", "deal.section.else": "What else is in this receipt", "deal.else.problems": "Problems spotted", "deal.else.problems.none": "None", "deal.else.whose": "Whose records these are", "deal.else.whose.text": "Only your side's records are here. The seller keeps its own copy, signed by them.", "deal.else.whose.text.report": "Only the holder's side's records are here.", "deal.else.whose.text.seller": "Only your side's records are here. The buyer keeps its own copy, signed by them.", "deal.else.half": "The other side's agreement", "deal.else.half.text": "This copy carries the seller's signed agreement, which capsulectl verify checked. It covers their agreement only, not anything after it.", "deal.else.half.text.seller": "This copy carries the buyer's signed agreement, which capsulectl verify checked. It covers their agreement only, not anything after it.", "deal.footer.times": "Times are in your time zone.", "deal.footer.private": "This file is your private copy: to show this deal to someone, send them the copy made for them.", "deal.footer.shared": "This is a shared copy of the holder's records.", "deal.footer.after": "Records sealed after {at} are not in this receipt.", "deal.depth.l1.checkers": "For checkers: every sealed record", "deal.depth.l2.technical": "Technical details", "deal.section.rungs": "What this copy carries", "deal.col.step": "Step", "deal.col.what": "What", "deal.col.kind": "Kind", "deal.col.place": "Log position (seq · leaf)", "deal.col.shown": "Shown", "deal.inventory.shown": "Shown", "deal.inventory.withheld": "Withheld", "deal.inventory.log": "Log", "deal.inventory.fingerprint": "Proof fingerprint", "deal.inventory.profile": "Profile checked against", "deal.inventory.producer": "Producer version", "deal.inventory.not_recorded": "not recorded", "deal.inventory.pack": "Wording pack", "deal.step.perform": "Recorded as done: {act}", "deal.else.whose.text.seller.report": "Only the holder's side's records are here.", "deal.else.half.text.report": "This copy carries the other side's signed agreement, which capsulectl verify checked. It covers their agreement only, not anything after it.", "deal.card.payment": "Payment", "deal.card.payment.status": "Recorded as {status}", "deal.card.payment.several": "{count} payment records; see the steps", "deal.step.settle.status": "Payment recorded as {status}: {amount}", "deal.step.settle.refund": "Refund recorded as {status}: {amount}", "deal.check.page": "On this page's own file, as capsulectl gave it:", "deal.check.download": "On the downloaded proof file:", "deal.stamp.countersigned.filled": "{signer} signed this record too · {at}, by their clock", "deal.stamp.countersigned.filled_copy": "Countersigned by {signer} at {at}, through record {k} of {n}.", "deal.stamp.countersigned.filled_copy_not_listed": "Countersigned by {signer} at {at}, through record {k} of {n}. Its directory entry does not list it as independent of the parties.", "deal.stamp.countersigned.failed": "Didn't verify", "deal.stamp.countersigned.self": "Signed by the producer only, not by another party", "deal.stamp.countersigned.unresolved": "Signed by an unlisted signer", "deal.else.problems.withheld": "Not shown: each term's status is withheld from this reader", "deal.card.payment.settled": "Recorded as settled", "deal.card.payment.received": "Recorded as received", "deal.steps.lede.one": "1 sealed step in this copy. Open it to see exactly what was recorded.", "deal.top.all.not_due": "Nothing is due yet", "deal.top.all.not_reached": "No term has come due", "deal.top.all.no_statement": "No one has said yet whether the terms were met", "deal.top.all.agreed_so_far": "Both sides say the same so far; still open to dispute", "deal.top.all.agreed": "Both sides say the same", "deal.top.all.uncontested": "One side has said, and the other has not contested it so far", "counterparty.with": "With {who}, as this page checked against what the deal sealed for them.", "counterparty.unchecked": "Part of who this deal was with could not be checked against what the deal sealed, so this page does not show it.", "accepted.words": "Their words accepting the offer, checked in this page against what was sealed: “{text}”", "accepted.unchecked": "Their words accepting the offer could not be checked against what was sealed, so this page does not show them.", "after_yes.passed": "Each act came after {who} yes: passed, recomputed in this page from the order of this log.", "after_yes.failed.unapproved": "Each act came after {who} yes: failed; {act} was taken without {who} yes.", "after_yes.failed.order": "Each act came after {who} yes: failed; {act} does not follow its approval in this log.", "after_yes.missing": "Each act came after {who} yes: missing; the approval for {act} is not in this copy.", "after_yes.withheld": "Each act came after {who} yes: not checked; steps are withheld from this copy.", "after_yes.unplaced": "Each act came after {who} yes: not checked; this copy's steps are not placed in a book's log, so their order can't be checked.", "after_yes.approvers": " How each was approved, as recorded: {list}.", "after_yes.approver.user": "{who} yes is in {their} words, recorded by {their} agent", "after_yes.approver.standing_intent": "approved under {who} standing limits, recorded by {their} agent", "after_yes.approver.agent_card": "answered on a card {who} agent showed, recorded by {their} agent", "after_yes.approver.task_authority": "allowed by the task {giver} gave {their} agent, recorded by {their} agent", "after_yes.act.named": "the {action} step", "after_yes.act.unnamed": "a step", "after_yes.who.own": "your", "after_yes.who.shared": "the holder's", "after_yes.their.own": "your", "after_yes.their.shared": "their", "after_yes.giver.own": "you", "after_yes.giver.shared": "the holder", "section.authority": "Authority, as the holder's report states it", "authority.sealed": "For each act, what it relied on, in the order the holder's sealed report lists it. This page shows it as sealed and does not check it.", "authority.uncovered": "The holder's report says this act was not covered by what it relied on.", "title.deal": " · {deal}", "seller.payment.settled.proof": "Settled on Lightning; this page checked its proof against its invoice", "seller.payment.settled.failed": "Recorded as settled on Lightning, but its proof did not match its invoice when this page checked it", "seller.payment.settled.sealed": "Recorded as settled on Lightning; its proof is sealed in this file, so this page can't check it", "seller.payment.settled.withheld": "Recorded as settled on Lightning; this copy does not show its proof", "seller.payment.settled.partial": "Recorded as settled on Lightning; this file carries a proof for only some of its payments, so this page checked none of them", "seller.payment.settled.final": "The payee's wallet reported it final on Lightning; this file carries no proof to check", "seller.payment.settled.x402": "Recorded as settled on x402; this page does not check the on-chain record", "seller.payment.settled.other": "Recorded as settled; this page can't check payments on this rail", "seller.payment.recorded": "This copy carries a payment record: the payment line at the top says how it settled and what this page checked. Evidence the seller's agent recorded is listed with its source; this page does not check what it says.", "referee.named": "The referee this side named, as its sealed report states it: {referee}. This page does not check that the other side named the same one, or that the name belongs to any particular person.", "countersign.reported.resolved": "Countersigned by {name}, a signer listed in the directory capsulectl verify was given ({directory}): it signed this bundle's digest, which covers its records but not the countersignatures beside them{checks}. It vouches only as far as you trust that directory. capsulectl verify reported this; this page did not check it itself.", "countersign.reported.checks": ", with its own results ({checks})", "countersign.reported.not_independent": "Not independent: capsulectl verify reported a countersignature by the producer's own key. A self-countersignature is not a check by anyone else.", "countersign.reported.unresolved_signer": "capsulectl verify reported a countersignature by a key the directory it was given ({directory}) does not list ({key}): its signer is unknown. This page did not check it itself.", "countersign.reported.unverified": "capsulectl verify reported a countersignature of a type it does not check, so this page does not show it as a countersignature.", "countersign.reported.receipt.verified": " Its log signature verifies, as capsulectl verify reported.", "countersign.reported.receipt.absent": " It carries no log signature.", "countersign.reported.receipt.unverified": " Its log signature does not verify, as capsulectl verify reported.", "provider.title": "Your receipt for an exchange you served", "provider.own_half": "This is this node's own record of its half of the exchange. It is not a joint record: the other party keeps its own.", "provider.no_content": "It names the model and what was received. It holds no request or response text.", "provider.records_note": "The exchange and each payment are records of their own, listed below.", "provider.model": "Model served", "provider.served_at": "Served at", "provider.received": "Received", "provider.received_count": "Received ({count})", "provider.fee": "Fee for receiving", "provider.total": "Received in total", "provider.payment_record": "Payment record", "provider.not_shown": "not shown", "provider.title_asked": "Your record of an exchange you were asked to serve", "provider.model_asked": "Model asked for", "provider.recorded_at": "Recorded at", "provider.status.failed": "This node's record says the exchange failed. It was not served. Any payment this node received for it is listed below.", "provider.status.failed_reason": "This node's record says the exchange failed: {reason}. It was not served. Any payment this node received for it is listed below.", "provider.status.dispatched": "This node's record says the request was sent on, but the host reported no response. It does not show that the exchange was served.", "provider.reason.payment_required": "payment required", "provider.reason.refused": "refused", "provider.reason.upstream_error": "upstream error", "provider.reason.timeout": "timed out", "provider.reason.dropped": "dropped", "deal.card.other.checked": "Their signed agreement: checked", "deal.stamp.time_stamped.filled_checked": "{witness} · {at}", "deal.proof.witness.filled_checked": "Outside time stamp: {witness} at {at}, on your own book", "deal.proof.counterparty_half": "The seller's signed agreement", "deal.proof.counterparty_half.seller": "The buyer's signed agreement", "deal.proof.counterparty_half.report": "The other side's signed agreement", "deal.else.half.checked": "This copy carries the seller's signed agreement. It covers their agreement only, not anything after it.", "deal.else.half.checked.seller": "This copy carries the buyer's signed agreement. It covers their agreement only, not anything after it.", "deal.else.half.checked.report": "This copy carries the other side's signed agreement. It covers their agreement only, not anything after it.", "deal.proof.lede.answers.failed": "No. capsulectl verify failed a test when this page was made. The page shows its answers; it did not re-check by itself.", "deal.hero.item": "{item}", "deal.proof.lede.answers.some": "These are the only answers capsulectl verify gave this page; a test marked – was not among them. Download the proof file and check it yourself."}; // @generated WORDS
  var PACK = {"id": "capsuleviewer.receipt.wording.en/v1", "sha256": "ea477b9d26eb7956d7cbcd946f926bf5299af0449ec08692653b291a3a3acb7d"}; // @generated PACK
  var KIT_CSS = "/* SPDX-License-Identifier: Apache-2.0 */\n/*\n * kit.css -- the presentation component kit's stylesheet.\n *\n * The token block below is generated from capsule_viewer/kit/tokens.py\n * (python -m capsule_viewer.kit tokens --write); tests/test_kit_tokens.py\n * fails if the two disagree. Every colour in the component rules is a\n * var(--cv-*) reference -- the same test refuses a literal colour outside the\n * generated block.\n *\n * Phone behaviour lives here, in the primitives: each responsive component is\n * its own size container and reflows on ITS width (@container), so a module\n * that places a MetricGrid or DataTable in a narrow column gets the phone\n * layout without writing a media query. Nothing in the kit scrolls the page\n * sideways: long tokens (digests, ids) wrap anywhere.\n */\n/* BEGIN GENERATED TOKENS (capsule_viewer.kit.tokens) -- do not edit by hand */\n:root {\n  --cv-font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;\n  --cv-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;\n  --cv-font-size-sm: 0.8125rem;\n  --cv-font-size-md: 0.9375rem;\n  --cv-font-size-lg: 1.125rem;\n  --cv-line-height: 1.5;\n  --cv-space-1: 0.25rem;\n  --cv-space-2: 0.5rem;\n  --cv-space-3: 0.75rem;\n  --cv-space-4: 1rem;\n  --cv-space-5: 1.5rem;\n  --cv-radius: 0.5rem;\n  --cv-radius-pill: 999px;\n  --cv-color-text: #1b1f27;\n  --cv-color-text-muted: #4d5564;\n  --cv-color-surface: #ffffff;\n  --cv-color-surface-sunken: #f4f5f7;\n  --cv-color-border: #d3d7de;\n  --cv-color-accent: #2445a8;\n  --cv-color-positive-fg: #17603a;\n  --cv-color-positive-bg: #e6f3eb;\n  --cv-color-negative-fg: #a31d1d;\n  --cv-color-negative-bg: #fbe9e9;\n  --cv-color-caution-fg: #6f4700;\n  --cv-color-caution-bg: #fcf1dc;\n  --cv-color-neutral-fg: #3d4452;\n  --cv-color-neutral-bg: #eceef2;\n  --cv-color-info-fg: #1f3c94;\n  --cv-color-info-bg: #e7ecfb;\n}\n/* END GENERATED TOKENS */\n\n.cv-kit { font-family: var(--cv-font-sans); font-size: var(--cv-font-size-md); line-height: var(--cv-line-height); color: var(--cv-color-text); background: var(--cv-color-surface); overflow-wrap: anywhere; }\nbody.cv-kit { margin: 0; }\n.cv-page { max-width: 60rem; margin: 0 auto; padding: var(--cv-space-5) var(--cv-space-4); }\n.cv-kit *, .cv-kit *::before, .cv-kit *::after { box-sizing: border-box; }\n.cv-kit :where(h1, h2, h3, h4, p, ul, ol, dl, dd, figure) { margin: 0; padding: 0; }\n.cv-kit :where(ul, ol) { list-style: none; }\n.cv-mono { font-family: var(--cv-font-mono); font-size: var(--cv-font-size-sm); }\n.cv-muted { color: var(--cv-color-text-muted); }\n\n/* Section */\n.cv-section { margin: 0 0 var(--cv-space-5); }\n.cv-section__title { font-size: var(--cv-font-size-lg); font-weight: 600; margin-bottom: var(--cv-space-3); }\n.cv-section__body { display: flex; flex-direction: column; gap: var(--cv-space-3); min-width: 0; }\n\n/* MetricGrid: as many columns as fit, never narrower than the label needs; one column on a phone. */\n.cv-metrics-wrap { container-type: inline-size; }\n.cv-metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 10rem), 1fr)); gap: var(--cv-space-3); }\n.cv-metric { min-width: 0; border: 1px solid var(--cv-color-border); border-radius: var(--cv-radius); padding: var(--cv-space-3); background: var(--cv-color-surface-sunken); }\n.cv-metric__label { font-size: var(--cv-font-size-sm); color: var(--cv-color-text-muted); }\n.cv-metric__value { font-size: var(--cv-font-size-lg); font-weight: 600; }\n.cv-metric__note { font-size: var(--cv-font-size-sm); color: var(--cv-color-text-muted); }\n@container (max-width: 24rem) { .cv-metrics { grid-template-columns: 1fr; } }\n\n/* DataTable: a real table when there is room; stacked label/value rows when there is not. */\n.cv-table-wrap { container-type: inline-size; }\n.cv-table { width: 100%; border-collapse: collapse; font-size: var(--cv-font-size-sm); }\n.cv-table caption { text-align: left; font-weight: 600; padding-bottom: var(--cv-space-2); }\n.cv-table th, .cv-table td { text-align: left; vertical-align: top; padding: var(--cv-space-2); border-bottom: 1px solid var(--cv-color-border); min-width: 0; }\n.cv-table th { color: var(--cv-color-text-muted); font-weight: 600; background: var(--cv-color-surface-sunken); }\n/* A column header is one short word: never broken mid-word to squeeze a wide table (\"Ste\" over \"p\"). */\n.cv-table th { overflow-wrap: normal; }\n@container (max-width: 40rem) {\n  .cv-table, .cv-table tbody, .cv-table tr, .cv-table td { display: block; width: 100%; }\n  .cv-table caption { display: block; }\n  .cv-table thead { display: none; }\n  .cv-table tr { border: 1px solid var(--cv-color-border); border-radius: var(--cv-radius); margin-bottom: var(--cv-space-2); }\n  .cv-table td { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--cv-space-2); }\n  .cv-table td::before { content: attr(data-label); color: var(--cv-color-text-muted); font-weight: 600; }\n  .cv-table tr > td:last-child { border-bottom: 0; }\n}\n\n/* CalendarGrid: always seven columns; the cells shrink, the text wraps. */\n.cv-calendar { font-size: var(--cv-font-size-sm); }\n.cv-calendar__title { font-weight: 600; margin-bottom: var(--cv-space-2); }\n.cv-calendar__grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }\n.cv-calendar__dow { text-align: center; color: var(--cv-color-text-muted); font-weight: 600; padding: var(--cv-space-1) 0; }\n.cv-calendar__day { min-width: 0; min-height: 3rem; border: 1px solid var(--cv-color-border); border-radius: 4px; padding: 2px var(--cv-space-1); background: var(--cv-color-surface); }\n.cv-calendar__day--blank { border-color: transparent; background: transparent; }\n.cv-calendar__num { font-weight: 600; }\n.cv-calendar__mark { display: block; font-size: 0.6875rem; line-height: 1.25; border-radius: 3px; padding: 0 2px; }\n\n/* Tones shared by badges, pills, calendar marks and verification outcomes. */\n.cv-tone--positive { color: var(--cv-color-positive-fg); background: var(--cv-color-positive-bg); }\n.cv-tone--negative { color: var(--cv-color-negative-fg); background: var(--cv-color-negative-bg); }\n.cv-tone--caution { color: var(--cv-color-caution-fg); background: var(--cv-color-caution-bg); }\n.cv-tone--neutral { color: var(--cv-color-neutral-fg); background: var(--cv-color-neutral-bg); }\n.cv-tone--info { color: var(--cv-color-info-fg); background: var(--cv-color-info-bg); }\n\n/* Receipt sides: ours blue, theirs amber (always \"as received\"), a missing side grey and dashed. No side is ever the negative tone: one side missing is not a finding. */\n.cv-sides { display: flex; flex-direction: column; gap: var(--cv-space-2); margin: 0 0 var(--cv-space-3); }\n.cv-sides__case { padding: var(--cv-space-1) var(--cv-space-3); border-radius: var(--cv-radius); font-weight: 600; font-size: var(--cv-font-size-sm); }\n.cv-half { min-width: 0; border-radius: var(--cv-radius); padding: var(--cv-space-1) var(--cv-space-3) var(--cv-space-2); border: 1px solid var(--cv-color-border); }\n.cv-half > .cv-section { margin-bottom: 0; }\n.cv-half__label { font-size: var(--cv-font-size-sm); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--cv-color-text-muted); margin-bottom: var(--cv-space-1); }\n.cv-half--ours { background: var(--cv-color-info-bg); border-color: var(--cv-color-info-fg); }\n.cv-half--theirs { background: var(--cv-color-caution-bg); border-color: var(--cv-color-caution-fg); }\n.cv-half--missing { background: var(--cv-color-neutral-bg); border: 1px dashed var(--cv-color-neutral-fg); }\n.cv-actions { display: flex; flex-wrap: wrap; column-gap: var(--cv-space-3); font-size: var(--cv-font-size-sm); font-weight: 600; color: var(--cv-color-info-fg); }\n.cv-actions__heading { font-weight: 400; color: var(--cv-color-text-muted); }\n\n/* DisclosureBadge and VerdictPill. The pill is scoped to the kit wrapper: the page shell's verification banner is a .cv-pill outside it, and a module's stylesheet must not restyle the banner (the frame check refuses the module). */\n.cv-badge, .cv-kit .cv-pill { display: inline-block; max-width: 100%; font-size: var(--cv-font-size-sm); font-weight: 600; border-radius: var(--cv-radius-pill); padding: 0 var(--cv-space-2); border: 1px solid currentColor; }\n.cv-badge { letter-spacing: 0.02em; }\n/* A state label breaks between words, never inside one. */\n.cv-badge, .cv-kit .cv-pill { overflow-wrap: normal; }\n.cv-refusal { color: var(--cv-color-negative-fg); background: var(--cv-color-negative-bg); border: 1px dashed currentColor; }\n\n/* CitationList */\n.cv-citations { display: flex; flex-direction: column; gap: var(--cv-space-2); counter-reset: cv-cite; }\n.cv-citation { counter-increment: cv-cite; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--cv-space-2); }\n.cv-citation::before { content: \"[\" counter(cv-cite) \"]\"; color: var(--cv-color-text-muted); }\n.cv-citation__ref { display: block; color: var(--cv-color-text-muted); }\n\n/* Drilldown: native details/summary -- opens with no script; prints open. */\n.cv-drilldown { border: 1px solid var(--cv-color-border); border-radius: var(--cv-radius); background: var(--cv-color-surface); }\n.cv-drilldown > summary { cursor: pointer; padding: var(--cv-space-2) var(--cv-space-3); font-weight: 600; color: var(--cv-color-accent); }\n.cv-drilldown__body { padding: 0 var(--cv-space-3) var(--cv-space-3); display: flex; flex-direction: column; gap: var(--cv-space-2); min-width: 0; }\n\n/* EvidenceDetails */\n.cv-evidence { display: flex; flex-direction: column; gap: var(--cv-space-2); }\n.cv-evidence__item { border-left: 3px solid var(--cv-color-border); padding-left: var(--cv-space-3); display: flex; flex-direction: column; gap: var(--cv-space-1); }\n.cv-evidence__head { display: flex; flex-wrap: wrap; gap: var(--cv-space-2); align-items: baseline; }\n.cv-evidence__label { font-weight: 600; }\n\n/* VerificationDetails */\n.cv-verification { display: flex; flex-direction: column; gap: var(--cv-space-2); }\n.cv-verification__outcome { border-radius: var(--cv-radius); padding: var(--cv-space-2) var(--cv-space-3); font-weight: 600; }\n.cv-checks { display: flex; flex-direction: column; gap: var(--cv-space-1); }\n.cv-check { display: flex; flex-wrap: wrap; gap: var(--cv-space-2); align-items: baseline; }\n\n/* PartyCard */\n.cv-party { border: 1px solid var(--cv-color-border); border-radius: var(--cv-radius); padding: var(--cv-space-3); background: var(--cv-color-surface-sunken); }\n.cv-party__role { font-size: var(--cv-font-size-sm); color: var(--cv-color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }\n.cv-party__name { font-weight: 600; }\n.cv-party__facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--cv-space-1) var(--cv-space-3); margin-top: var(--cv-space-2); font-size: var(--cv-font-size-sm); }\n.cv-party__facts dt { color: var(--cv-color-text-muted); }\n.cv-party-wrap { container-type: inline-size; }\n@container (max-width: 20rem) { .cv-party__facts { grid-template-columns: minmax(0, 1fr); } }\n\n/* Timeline: entries in the order given. */\n.cv-timeline { border-left: 2px solid var(--cv-color-border); padding-left: var(--cv-space-3); display: flex; flex-direction: column; gap: var(--cv-space-3); }\n.cv-timeline__at { display: block; color: var(--cv-color-text-muted); }\n.cv-timeline__label { font-weight: 600; }\n\n@media print {\n  .cv-kit { background: none; }\n  .cv-drilldown > summary { color: var(--cv-color-text); }\n  /* A closed drilldown still prints its body (Chromium's details-content). */\n  .cv-drilldown::details-content { content-visibility: visible; display: block; }\n  .cv-section, .cv-metric, .cv-party, .cv-table tr, .cv-evidence__item { break-inside: avoid; }\n}\n"; // @generated KIT_CSS
  var KIT_DARK_CSS = "/* SPDX-License-Identifier: Apache-2.0 */\n/*\n * kit-dark.css -- GENERATED from tokens/tokens.json (\"kit-dark\") by\n * scripts/gen-tokens.py. Do not edit by hand.\n *\n * Inserted after kit.css by the go/receipt modules only, as a stylesheet of\n * their own, and scoped to a receipt ([data-receipt-module]), so no other\n * kit module's card changes. Each colour token becomes\n * light-dark(<light>, <dark>), which follows the colour scheme the host page\n * declares (color-scheme), not the reader's OS: a host that declares\n * \"light dark\" gets the dark values in dark mode, and a host that declares\n * none stays light. A browser without light-dark() skips the @supports block\n * and keeps kit.css's light values.\n */\n@supports (color: light-dark(#000, #fff)) {\n  [data-receipt-module] {\n    --cv-color-text: light-dark(#1b1f27, #e6e9ef);\n    --cv-color-text-muted: light-dark(#4d5564, #aab1bd);\n    --cv-color-surface: light-dark(#ffffff, #16191f);\n    --cv-color-surface-sunken: light-dark(#f4f5f7, #1e222a);\n    --cv-color-border: light-dark(#d3d7de, #3a414d);\n    --cv-color-accent: light-dark(#2445a8, #9db4ff);\n    --cv-color-positive-fg: light-dark(#17603a, #7fd8a2);\n    --cv-color-positive-bg: light-dark(#e6f3eb, #12301f);\n    --cv-color-negative-fg: light-dark(#a31d1d, #ff9a92);\n    --cv-color-negative-bg: light-dark(#fbe9e9, #3b1a18);\n    --cv-color-caution-fg: light-dark(#6f4700, #f0c674);\n    --cv-color-caution-bg: light-dark(#fcf1dc, #33270d);\n    --cv-color-neutral-fg: light-dark(#3d4452, #c7ccd6);\n    --cv-color-neutral-bg: light-dark(#eceef2, #262b34);\n    --cv-color-info-fg: light-dark(#1f3c94, #a9bdff);\n    --cv-color-info-bg: light-dark(#e7ecfb, #1b2546);\n  }\n}\n"; // @generated KIT_DARK_CSS
  var RECEIPT_CSS = "/* SPDX-License-Identifier: Apache-2.0 */\n/*\n * receipt.css -- the receipt modules' own rules, inserted after kit.css and\n * kit-dark.css by the go/receipt modules only, and scoped to a receipt\n * ([data-receipt-module]), so no other kit module's card changes.\n *\n * kit.css lets text wrap anywhere so a long id never pushes a table sideways.\n * Beside a 64-character record id that squeezed a short word to \"buye / r\".\n * A side or a term name breaks between words, never inside one (#429).\n */\n[data-receipt-module] .cv-receipt-word { overflow-wrap: normal; }\n\n/*\n * The v1 receipt's top surface (#382, Steven's design): a header, a hero card\n * with the seal and three cards, the stamps, then the steps beside the proof\n * panel. One column under 720px, so a phone shows the proof panel and a step's\n * drawer on one narrow screen; long ids and the verify line wrap.\n */\n[data-receipt-module] .cv-rcpt { display: grid; gap: 0.875rem; }\n[data-receipt-module] .cv-rcpt-header { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: space-between; }\n[data-receipt-module] .cv-rcpt-tags { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }\n[data-receipt-module] .cv-rcpt-title { font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; font-size: var(--cv-font-size-sm); color: var(--cv-color-text-muted); }\n[data-receipt-module] .cv-rcpt-tag { border-radius: var(--cv-radius-pill); padding: 0.125rem 0.625rem; font-size: var(--cv-font-size-sm); background: var(--cv-color-neutral-bg); color: var(--cv-color-neutral-fg); }\n[data-receipt-module] .cv-rcpt-tag--private { background: var(--cv-color-caution-bg); color: var(--cv-color-caution-fg); }\n[data-receipt-module] .cv-rcpt-button { display: inline-block; border-radius: var(--cv-radius); padding: 0.5rem 0.875rem; font-weight: 600; text-decoration: none; background: var(--cv-color-info-bg); color: var(--cv-color-info-fg); }\n[data-receipt-module] .cv-rcpt-button--primary { background: var(--cv-color-accent); color: #ffffff; }\n[data-receipt-module] .cv-rcpt-panel { background: var(--cv-color-surface); border: 1px solid var(--cv-color-border); border-radius: calc(var(--cv-radius) * 2); padding: 1rem 1.125rem; min-width: 0; }\n[data-receipt-module] .cv-rcpt-hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 1rem; align-items: center; }\n[data-receipt-module] .cv-rcpt-top { display: flex; gap: 0.875rem; align-items: center; min-width: 0; }\n[data-receipt-module] .cv-rcpt-seal { flex: none; }\n[data-receipt-module] .cv-rcpt-headline { margin: 0; font-size: 1.5rem; line-height: 1.25; }\n[data-receipt-module] .cv-rcpt-mood { margin: 0.25rem 0 0; font-weight: 600; }\n[data-receipt-module] .cv-rcpt-lede { margin: 0.25rem 0 0.5rem; }\n[data-receipt-module] .cv-rcpt-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); gap: 0.5rem; }\n[data-receipt-module] .cv-rcpt-card { background: var(--cv-color-surface-sunken); border-radius: var(--cv-radius); padding: 0.625rem 0.75rem; min-width: 0; }\n[data-receipt-module] .cv-rcpt-card__label, [data-receipt-module] .cv-rcpt-tile__label { font-size: var(--cv-font-size-sm); font-weight: 600; color: var(--cv-color-text-muted); }\n[data-receipt-module] .cv-rcpt-card__value { font-size: var(--cv-font-size-lg); font-weight: 700; overflow-wrap: anywhere; }\n[data-receipt-module] .cv-rcpt-card[data-card=\"other\"] .cv-rcpt-card__value { font-size: var(--cv-font-size-md); font-weight: 600; }\n[data-receipt-module] .cv-rcpt-card__note, [data-receipt-module] .cv-rcpt-sub { display: block; font-size: var(--cv-font-size-sm); font-weight: 400; color: var(--cv-color-text-muted); }\n[data-receipt-module] .cv-rcpt-stamps { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; }\n[data-receipt-module] .cv-rcpt-stamp { border-radius: var(--cv-radius); padding: 0.375rem 0.625rem; font-size: var(--cv-font-size-sm); border: 1px dashed var(--cv-color-border); }\n[data-receipt-module] .cv-rcpt-stamp--filled { border-style: solid; background: var(--cv-color-positive-bg); color: var(--cv-color-positive-fg); }\n[data-receipt-module] .cv-rcpt-stamp__name { font-weight: 700; letter-spacing: 0.06em; }\n[data-receipt-module] .cv-rcpt-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 0.875rem; align-items: start; }\n[data-receipt-module] .cv-rcpt-main, [data-receipt-module] .cv-rcpt-side { display: grid; gap: 0.875rem; min-width: 0; }\n[data-receipt-module] .cv-rcpt-h { margin: 0 0 0.25rem; font-size: var(--cv-font-size-lg); }\n[data-receipt-module] .cv-rcpt-h4 { font-weight: 600; margin-bottom: 0.25rem; }\n[data-receipt-module] .cv-rcpt-steps { list-style: none; margin: 0.5rem 0 0; padding: 0; }\n[data-receipt-module] .cv-rcpt-step { border-top: 1px solid var(--cv-color-border); }\n[data-receipt-module] .cv-rcpt-step summary { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 0.625rem; align-items: center; padding: 0.625rem 0; cursor: pointer; list-style: none; }\n[data-receipt-module] .cv-rcpt-step__n { display: inline-grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--cv-color-info-bg); color: var(--cv-color-info-fg); font-size: var(--cv-font-size-sm); font-weight: 700; }\n[data-receipt-module] .cv-rcpt-step__title { font-weight: 600; overflow-wrap: anywhere; }\n[data-receipt-module] .cv-rcpt-step__time { font-size: var(--cv-font-size-sm); color: var(--cv-color-text-muted); white-space: nowrap; }\n[data-receipt-module] .cv-rcpt-step__drawer { padding: 0 0 0.75rem 2.125rem; }\n[data-receipt-module] .cv-rcpt-fields { display: grid; gap: 0.25rem; margin: 0; }\n[data-receipt-module] .cv-rcpt-field { display: grid; grid-template-columns: minmax(7rem, 0.8fr) minmax(0, 1.2fr); gap: 0.5rem; }\n[data-receipt-module] .cv-rcpt-field dt { color: var(--cv-color-text-muted); }\n[data-receipt-module] .cv-rcpt-field dd { margin: 0; overflow-wrap: anywhere; }\n[data-receipt-module] .cv-rcpt-record { margin-top: 0.5rem; padding: 0.5rem 0.625rem; background: var(--cv-color-surface-sunken); border-radius: var(--cv-radius); display: grid; gap: 0.25rem; }\n[data-receipt-module] .cv-rcpt-record__label { font-size: var(--cv-font-size-sm); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cv-color-text-muted); }\n[data-receipt-module] .cv-rcpt-fullid { display: block; overflow-wrap: anywhere; }\n[data-receipt-module] .cv-rcpt-proof { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }\n[data-receipt-module] .cv-rcpt-proof__row { display: grid; grid-template-columns: 1.25rem minmax(0, 1fr); gap: 0.5rem; }\n[data-receipt-module] .cv-rcpt-proof__label { display: block; font-weight: 600; }\n[data-receipt-module] .cv-rcpt-proof__code, [data-receipt-module] .cv-rcpt-proof__note { display: block; font-size: var(--cv-font-size-sm); color: var(--cv-color-text-muted); }\n[data-receipt-module] .cv-rcpt-mark { font-weight: 700; text-align: center; }\n[data-receipt-module] .cv-rcpt-mark--pass { color: var(--cv-color-positive-fg); }\n[data-receipt-module] .cv-rcpt-mark--fail { color: var(--cv-color-negative-fg); }\n[data-receipt-module] .cv-rcpt-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }\n[data-receipt-module] .cv-rcpt-check { margin-top: 0.75rem; padding: 0.625rem 0.75rem; background: var(--cv-color-surface-sunken); border-radius: var(--cv-radius); display: grid; gap: 0.375rem; justify-items: start; }\n[data-receipt-module] .cv-rcpt-command { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--cv-font-mono); font-size: var(--cv-font-size-sm); }\n[data-receipt-module] .cv-rcpt-list { margin: 0; padding-left: 1.125rem; list-style: disc; }\n[data-receipt-module] .cv-rcpt-list li { margin: 0.125rem 0; }\n[data-receipt-module] .cv-rcpt-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.5rem; }\n[data-receipt-module] .cv-rcpt-tile { background: var(--cv-color-surface-sunken); border-radius: var(--cv-radius); padding: 0.625rem 0.75rem; }\n[data-receipt-module] .cv-rcpt-footer { font-size: var(--cv-font-size-sm); color: var(--cv-color-text-muted); }\n@media (max-width: 720px) {\n  [data-receipt-module] .cv-rcpt-hero, [data-receipt-module] .cv-rcpt-grid { grid-template-columns: minmax(0, 1fr); }\n  [data-receipt-module] .cv-rcpt-step__drawer { padding-left: 0; }\n  [data-receipt-module] .cv-rcpt-step summary { grid-template-columns: auto minmax(0, 1fr); row-gap: 0; }\n  [data-receipt-module] .cv-rcpt-step__time { grid-column: 2; white-space: normal; }\n  [data-receipt-module] .cv-rcpt-field { grid-template-columns: minmax(0, 1fr); gap: 0; }\n}\n"; // @generated RECEIPT_CSS
  // The seller copy's bundle extension kind (capsule_viewer.receipt_slot.SELLER_KIND).
  var SELLER_KIND = "x-deal-seller/v0"; // @generated SELLER_KIND

  var EXTENSION = "x-deal-v0";
  // The v1 deal profile's extension and sealed report (evidencebook
  // docs/design/461-deal-profile.md, section 9). A v1 page reads this and never x-deal-v0.
  var EXTENSION_V1 = "x-deal-v1";
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
  var CASE_TONE = { both: "positive", one_sided: "caution", limit: "neutral", not_agreed: "neutral" };
  var ACTIONS = {
    both: ["actions.dispute", "actions.send", "actions.show_theirs"],
    one_sided: ["actions.send", "actions.ask_again"],
    limit: ["actions.send"],
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
    incomplete: ["Incomplete", "caution"],
    failed: ["Did not verify", "negative"],
    not_checked: ["Not checked", "neutral"],
  };
  // The composition section's words: agent-action-capsule's composition view
  // (capsule_viewer.composed, after ts/src/composed-view.ts).
  var NOT_APPLICABLE = "—";
  // module.py's TEST_RAIL, WITNESS_CHECK, _TIME_MARK, SHORT_HEAD and SHORT_TAIL.
  var TEST_RAIL = "simulated";
  var WITNESS_CHECK = "witnesses";
  var TIME_MARK = "\u0000";
  var SHORT_HEAD = 8, SHORT_TAIL = 4;
  function isRail(f) { return f.name === "rail" && f.kind === "token"; }
  // module.py's _test_money: every rail the steps name is the simulated one, and at least one is named.
  function testMoney(model) {
    var rails = [];
    seq(model.steps).forEach(function (s) { s.facts.forEach(function (f) { if (isRail(f)) rails.push(f); }); });
    return rails.length > 0 && rails.every(function (f) { return f.value === TEST_RAIL; });
  }
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

  // The runtime's gate (presentation-registry.ts re-exports
  // agent-action-capsule's bundleVerified; 0.16.0, verification-page.ts): a
  // producer-selected bundle, whose interval coverage is withheld as
  // selection_not_checkable (a Mesh node's receipt), passes the gate on its
  // other checks, as the page's own verdict does (#383).
  function producerSelection(v) {
    var coverage = claim(v.intervalCoverage);
    return coverage.status === "withheld" && coverage.findings.indexOf("selection_not_checkable") >= 0;
  }

  function bundleVerified(verification) {
    var v = map(verification);
    var membership = claim(v.perRecordMembership);
    var results = map(v.capsuleResults);
    return claim(v.graphClosure).status === "pass" &&
      (claim(v.intervalCoverage).status === "pass" || producerSelection(v)) &&
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
    var outcome = bundleVerified(v) ? "verified" : "failed";
    // verifier_report._declined_only: capsulectl reads a composition holding a policy_declined
    // refusal INCOMPLETE, which the page's claims do not show, so such a bundle is never
    // "verified" here; the bilateral module still declines unless the refusal's signature
    // verified (missingMember).
    if (outcome === "verified" && declinedMember(map(map(context).bundle))) {
      outcome = "incomplete";
      checks.push({ name: "declined member", outcome: "not_checked", detail: "policy_declined" });
    }
    // The page's own check ran in full only when the runtime has a strict
    // result: without Ed25519 a producer selection is read on its plain
    // checks alone (agent-action-capsule's buildVerifiedBundleContext).
    return { verifier: VERIFIER, outcome: outcome, checks: checks, here: map(context).strict !== undefined };
  }

  function declinedMember(bundle) {
    var block = map(get(map(get(bundle, "extensions")), COMPOSED_KIND));
    return seq(get(block, "members")).map(map).some(function (m) {
      return get(m, "outcome") === "refusal" && get(map(get(m, "refusal")), "reason") === "policy_declined";
    });
  }

  // capsulectl's status for the `extension` check (x-deal-v0, or x-deal-v1 for the
  // deal module) when it names the report as standalone. A page runtime that does
  // not interpret that extension reports none.
  function reportChecked(verification, extension) {
    var entry = seq(map(verification).extensions).map(map).find(function (e) { return e.kind === extension && e.report === "standalone"; });
    return entry !== undefined && typeof entry.status === "string" ? entry.status : null;
  }

  function counterpartyHalf(verification) {
    var entry = seq(map(verification).extensions).map(map).find(function (e) { return e.kind === EXTENSION_V1 && e.report === "standalone"; });
    var half = entry !== undefined ? map(entry.counterparty_half) : {};
    return typeof half.status === "string" ? half.status : null;
  }

  // capsulectl's report of the holder's own book's witness time (verify
  // --stamp-proof, beside the copy and never in it), from its x-deal-v1
  // entry: {status, witness, at} with strings only, else null.
  function bookWitnessed(verification, extension) {
    var entry = extension === EXTENSION ? capsulectlV0Entry(verification) : seq(map(verification).extensions).map(map).find(function (e) { return e.kind === EXTENSION_V1 && e.report === "standalone"; });
    var got = entry !== undefined ? map(entry.witnessed) : {};
    if (["verified", "failed", "withheld"].indexOf(got.status) < 0) return null;
    if (got.status === "verified" && (typeof got.witness !== "string" || got.witness === "" || !validUtcTime(got.at))) return null;
    return got.status === "verified" ? { status: got.status, witness: got.witness, at: got.at } : { status: got.status };
  }

  // capsulectl's report of an x-deal-v0 copy, as the page's runtime hands it
  // to the module (ts/src/verifier-report.ts withDealV0Report, capsule-viewer#383
  // CV3b): an x-deal-v0 entry marked reported_by capsulectl, with no status, so
  // the report's form and its check stay the page's own.
  function capsulectlV0Entry(verification) {
    return seq(map(verification).extensions).map(map).find(function (e) { return e.kind === EXTENSION && e.reported_by === "capsulectl" && !own(e, "status"); });
  }
  var COUNTERSIGN_REPORTED = ["resolved", "not_independent", "unresolved_signer", "unverified"];
  // capsulectl's countersign rung of an x-deal-v0 copy (line 9): the directory
  // it resolved signers in and each entry, strings only, else null. The page's
  // runtime bound each entry to this copy's countersignatures.
  function reportedCountersign(verification) {
    var entry = capsulectlV0Entry(verification);
    var got = entry !== undefined ? map(entry.countersign) : {};
    var directory = str(get(got, "directory"));
    var list = seq(get(got, "entries")).map(map);
    if (directory === null || !list.length) return null;
    if (!list.every(function (e) { return COUNTERSIGN_REPORTED.indexOf(get(e, "state")) >= 0 && str(get(e, "key_id")) !== null; })) return null;
    return {
      directory: directory,
      entries: list.map(function (e) {
        return {
          state: get(e, "state"),
          key_id: str(get(e, "key_id")),
          signer_name: str(get(e, "signer_name")),
          receipt: ["verified", "absent", "unverified"].indexOf(get(e, "receipt")) >= 0 ? get(e, "receipt") : null,
          checks: seq(get(e, "checks")).map(map).filter(function (c) { return str(get(c, "name")) !== null && str(get(c, "result")) !== null; })
            .map(function (c) { return { name: get(c, "name"), result: get(c, "result") }; }),
        };
      }),
    };
  }

  function pageAssurance(context, extension) {
    var c = map(context);
    var v = map(c.verification);
    var checked = reportChecked(v, extension);
    var here = false;
    // The page runtime's own answer, asked before the model is built
    // (pageReportCheck), when its verifier reports none.
    if (checked === null && extension === EXTENSION && REPORT_CHECKS !== null && REPORT_CHECKS.has(context)) {
      checked = REPORT_CHECKS.get(context);
      here = true;
    }
    var out = {
      bundle_digest: typeof v.bundleDigest === "string" ? v.bundleDigest : null,
      witnesses: "absent",
      countersignatures: seq(c.countersignatures).map(function (x) { return isMap(x) && typeof x.status === "string" ? x.status : "unknown"; }),
      report_checked: checked,
    };
    // The v1 deal module only: capsulectl's status for the other party's half
    // carried in the copy (x-deal-v1-counterparty-half), from its x-deal-v1
    // entry, else null. The page never checks the half itself.
    if (extension === EXTENSION_V1) {
      out.counterparty_half = counterpartyHalf(v);
      out.book_witnessed = bookWitnessed(v, extension);
      out.checks = reportedChecks(v);
      out.verify_command = reportedCommand(v);
      out.verdict = reportedVerdict(v);
      out.countersigned = reportedCountersigned(v);
      out.countersigned_copy = reportedCountersignedCopy(v);
      out.deal_offer = reportedEntry(v, "deal_offer");
    }
    // The x-deal-v0 modules: capsulectl's report of the holder's own book's
    // witness time and its countersign rung, only when the page was given
    // capsulectl's report (CV3b). Absent otherwise, so a model built from a
    // verifier report alone (the Python twin's inputs) is unchanged.
    if (extension === EXTENSION) {
      var book = bookWitnessed(v, extension);
      var rung = reportedCountersign(v);
      if (book !== null) out.book_witnessed = book;
      if (rung !== null) out.countersign_reported = rung;
    }
    // Said only when the page checked it itself: a verifier's report (the
    // Python twin's inputs too) carries no such member.
    if (here) out.report_checked_here = true;
    return out;
  }

  // A copy's standalone report (x-deal-report/v0) is read only once it is
  // checked. The page's verifier does not interpret x-deal-v0, so on a page
  // the module asks the page's runtime, which checks it as capsulectl deal
  // verify does (EvidenceGraph.dealStandaloneReport, capsule-viewer#397): its
  // "pass" or "fail" is kept per context, here, until the model is built.
  // A runtime without that check, or a v1 copy, gives no answer, and the
  // standalone report stays unread.
  var REPORT_CHECKS = typeof WeakMap === "function" ? new WeakMap() : null;
  function pageReportCheck(bundle) {
    var graph = root.EvidenceGraph;
    return graph && typeof graph.dealStandaloneReport === "function" ? graph.dealStandaloneReport(bundle) : null;
  }
  // The pending check of a context's standalone report, or null when there
  // is none to ask: no standalone report, the verifier already reported it,
  // or no place to keep the answer.
  function askReportCheck(context, check) {
    var c = map(context);
    if (REPORT_CHECKS === null || REPORT_CHECKS.has(context) || !isMap(c.verification)) return null;
    if (!own(map(map(c.bundle).extensions), STANDALONE_EXTENSION) || reportChecked(c.verification, EXTENSION) !== null) return null;
    return Promise.resolve(check(c.bundle)).then(function (status) {
      if (status === "pass" || status === "fail") REPORT_CHECKS.set(context, status);
    });
  }

  // ---- the settlement line (capsule-viewer#383; Sherlock2's ruling on the deal-view lines) ----
  //
  // The x-deal-v0 buyer receipt and seller copy say how the payment settled,
  // by rail, from the settled payee-observed legs among this copy's records
  // (draft-mih-agent-settlement-records; Mesh-LLM/capsules-plugin
  // adapters/lightning-v0.md), as evidencebook's deal view did. A Lightning
  // leg's proof is its disclosed preimage; this page hashes nothing, so the
  // page's runtime checks it (env.preimageCheck: the npm export passes
  // paymentPreimageCheck, a page's runtime offers EvidenceGraph's,
  // capsule-viewer#214), asked before the model is built and kept per
  // context, as the standalone report's check is. Only a check that ran is
  // claimed: no runtime check, a verifier's report given in env, or any answer
  // but PASS or FAIL leaves the proof "sealed here, not checked".
  var SETTLEMENT_CHECKS = typeof WeakMap === "function" ? new WeakMap() : null;
  // A leg names Bitcoin by its CAIP-19 asset id (evidencebook
  // deal_settlement_lightning.go, lightningBTC); the band names it BTC.
  var ASSET_CODES = { "bip122:000000000019d6689c085ae165831e93/slip44:0": "BTC" };
  var BAND_SYMBOLS = { USD: "$", EUR: "€", GBP: "£" };
  var LEG_VALUE = /^(0|[1-9][0-9]*)$/;

  // The settled payee-observed legs among the context's records, each with
  // its disclosed agent_input (null when this copy does not disclose it).
  function settledLegs(context, disclosed) {
    var legs = [];
    seq(map(context).records).forEach(function (r) {
      var s = map(get(r, "settlement"));
      var cid = str(get(r, "capsule_id"));
      if (cid === null || s.leg !== "payee_observed" || s.status !== "settled") return;
      var input = disclosed(cid, "agent_input");
      legs.push({ settlement: s, input: isMap(input) ? input : null });
    });
    return legs;
  }
  function legRail(legs) {
    var type = function (l) { return or(str(get(map(get(l.settlement, "payment_ref")), "type")), ""); };
    if (legs.every(function (l) { return type(l) === "ln.payment_hash"; })) return "lightning";
    if (legs.every(function (l) { return type(l).indexOf("x402.") === 0; })) return "x402";
    return "other";
  }
  function legPreimage(l) {
    var p = get(map(get(l.input, "body")), "preimage");
    return typeof p === "string" && p !== "" ? p : null;
  }
  // The leg proof's state before any check: withheld (a leg's record is not
  // disclosed in this copy), sealed (every leg carries a preimage, as the deal
  // view required), partial (some legs carry one, some don't; nothing is
  // checked, so no leg is claimed either way) or final (no leg carries one:
  // the wallet's report only).
  function lightningProof(legs) {
    if (legs.some(function (l) { return l.input === null; })) return "withheld";
    var carried = legs.filter(function (l) { return legPreimage(l) !== null; }).length;
    return carried === legs.length ? "sealed" : carried ? "partial" : "final";
  }

  // Two non-negative decimal digit strings added.
  function addDigits(a, b) {
    var out = "", carry = 0;
    for (var i = a.length - 1, j = b.length - 1; i >= 0 || j >= 0 || carry; i--, j--) {
      var s = (i >= 0 ? a.charCodeAt(i) - 48 : 0) + (j >= 0 ? b.charCodeAt(j) - 48 : 0) + carry;
      out = String(s % 10) + out;
      carry = s >= 10 ? 1 : 0;
    }
    return out.replace(/^0+(?=.)/, "");
  }
  // Ruling u94: one band per exchange, never per leg; the legs' received and
  // receive_fee summed, only when all share one currency and scale and each
  // value is a non-negative integer. A zero sum, or no amount, is no band.
  // decade = digits - assetScale - 1 (lightning-v0's "Band"), never converted.
  function legBand(legs) {
    var amounts = [];
    legs.forEach(function (l) {
      ["received", "receive_fee"].forEach(function (k) { if (own(l.settlement, k)) amounts.push(get(l.settlement, k)); });
    });
    if (!amounts.length) return null;
    var code = str(get(map(amounts[0]), "assetCode")), scale = int(get(map(amounts[0]), "assetScale"));
    if (code === null || code === "" || scale === null || scale < 0) return null;
    var sum = "0";
    for (var i = 0; i < amounts.length; i++) {
      var a = map(amounts[i]), value = get(a, "value");
      if (get(a, "assetCode") !== code || int(get(a, "assetScale")) !== scale || typeof value !== "string" || !LEG_VALUE.test(value)) return null;
      sum = addDigits(sum, value);
    }
    if (sum === "0") return null;
    return { currency: own(ASSET_CODES, code) ? ASSET_CODES[code] : code, decade: sum.length - scale - 1 };
  }

  // The band's words, as the History card names a size
  // (src/capsule_viewer/static/standard_history_card.js bandLabel): a
  // currency with a symbol as "$10 – $99", every band below its first ten
  // units as "under $10"; another currency in its own units.
  function bandPower(d) {
    if (d > 18 || d < -18) return "1e" + d;
    if (d >= 0) return "1" + new Array(d + 1).join("0");
    return "0." + new Array(-d).join("0") + "1";
  }
  function bandGrouped(digits) { return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function bandLabel(band) {
    var sym = own(BAND_SYMBOLS, band.currency) ? BAND_SYMBOLS[band.currency] : null;
    if (sym !== null && band.decade <= 17) {
      if (band.decade <= 0) return w("size.under", { amount: sym + "10" });
      return w("size.between", { low: sym + bandGrouped(bandPower(band.decade)), high: sym + bandGrouped(bandPower(band.decade + 1).slice(1).replace(/0/g, "9")) });
    }
    return w("size.range", { low: bandPower(band.decade), high: bandPower(band.decade + 1), currency: band.currency });
  }

  // The line's model, or null when nothing is drawn: no leg and no disclosed
  // action naming a rail other than the simulated one. `checked` is the runtime's answer kept for this
  // context ("proof", "failed" or "sealed"), or undefined.
  function settlementOf(v, checked) {
    var legs = settledLegs(v.context, v.disclosed);
    if (!legs.length) {
      // The first rail a disclosed action names, other than the simulated one:
      // test money is said once, at the top (money.test; the 0.25.0 top line),
      // so it draws no second line here, and never hides a real rail named after it.
      var rail = null;
      v.records.forEach(function (cid) {
        var p = v.disclosed(cid, "agent_input");
        var named = str(get(map(get(p, "body")), "rail"));
        if (rail === null && isMap(p) && recordTypeOf(p) === "action" && named !== null && named !== "" && named !== TEST_RAIL) rail = named;
      });
      return rail === null ? null : { state: "missing", rail: rail, band: null };
    }
    var railOf = legRail(legs);
    var state = railOf !== "lightning" ? railOf : lightningProof(legs);
    if (state === "sealed" && (checked === "proof" || checked === "failed")) state = checked;
    return { state: state, rail: null, band: legBand(legs) };
  }

  // Whether a settlement line rests on a settled leg (any state but "missing").
  function settledLine(line) { return !!line && line.state !== "missing"; }

  // The pending runtime check of a context's Lightning proofs, or null when
  // there is none to ask: no legs, another rail, a leg withheld or no
  // preimage, no runtime check, already answered, or no place to keep it.
  function askSettlementCheck(context, check) {
    if (SETTLEMENT_CHECKS === null || SETTLEMENT_CHECKS.has(context) || typeof check !== "function") return null;
    var legs = settledLegs(context, disclosedIn(context));
    if (!legs.length || legRail(legs) !== "lightning" || lightningProof(legs) !== "sealed") return null;
    var answers;
    try {
      answers = Promise.all(legs.map(function (l) { return check(get(l.settlement, "payment_ref"), legPreimage(l)); }));
    } catch (err) {
      answers = Promise.reject(err);
    }
    return answers.then(function (got) {
      // A FAIL is the runtime's answer that the check ran and a proof does not match.
      var state = got.every(function (a) { return a === "PASS"; }) ? "proof" : got.some(function (a) { return a === "FAIL"; }) ? "failed" : "sealed";
      SETTLEMENT_CHECKS.set(context, state);
    }, function () {
      SETTLEMENT_CHECKS.set(context, "sealed");
    });
  }

  // The page runtime's check of one leg's Lightning proof, or null without one.
  function pagePreimageCheck(paymentRef, preimage) {
    var graph = root.EvidenceGraph;
    if (!graph || typeof graph.paymentPreimageCheck !== "function") return Promise.resolve(null);
    return graph.paymentPreimageCheck(paymentRef, preimage);
  }

  // ---- who the deal was with, and their words accepting (capsule-viewer#383, line 3) ----
  //
  // A copy's sealed report may open who the deal was with
  // (counterparty_openings: the deal's key and, per step, the raw payee,
  // name, domain, phone or email) and what the other party wrote accepting
  // (acceptance_openings: each acceptance's words under the nonce they were
  // committed with), as capsulectl writes them on the holder's own copy
  // (evidencebook capsulectl/internal/deal/deal_counterparty_openings.go). The
  // page recomputes each one against what the step sealed, as capsulectl did
  // for its own deal view (deal_page_openings.go): a name against the keyed
  // fingerprint the record carries (dealprofile.Fingerprint, HMAC-SHA256 over
  // the normalized value), the words against the acceptance's
  // content_commitment (checkOpening). A value that does not recompute here
  // is never shown. The line is drawn whenever the copy discloses an opening:
  // which copies may carry them is capsulectl's rule where it writes a copy.
  var COUNTERPARTY_KINDS = ["payee", "name", "domain", "phone", "email"];
  var ACCEPTANCE_KIND = "counterparty-acceptance-observation";

  function hexBytes(h) {
    if (typeof h !== "string" || h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) return null;
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
    return out;
  }
  function concatBytes(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
  }
  // HMAC-SHA256 (RFC 2104) of msg under key, as lowercase hex.
  function hmacHex(key, msg) {
    var k = new Uint8Array(64);
    k.set(key.length > 64 ? hexBytes(sha256Hex(key)) : key);
    var inner = new Uint8Array(64), outer = new Uint8Array(64);
    for (var i = 0; i < 64; i++) { inner[i] = k[i] ^ 0x36; outer[i] = k[i] ^ 0x5c; }
    return sha256Hex(concatBytes(outer, hexBytes(sha256Hex(concatBytes(inner, msg)))));
  }

  // The normalization dealprofile.Normalize takes each identifier through
  // before its fingerprint (evidencebook dealprofile/keys.go), as far as a page
  // can follow it: each function returns the forms the sealed fingerprint may
  // be over (empty when this page cannot normalize the value, which then
  // reads as not checked, never as a match). Go's \s, \d and \D are ASCII.
  var GO_SPACE = "\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
  var GO_TRIM = new RegExp("^[" + GO_SPACE + "]+|[" + GO_SPACE + "]+$", "g");
  var GO_FIELDS = new RegExp("[" + GO_SPACE + "]+");
  var PHONE_EXTENSION = /[\t\n\f\r ]*(?:ext\.?|x|#)[\t\n\f\r ]*[0-9]+[\t\n\f\r ]*$/i;
  var PAYEE_IS_PHONE = /^[\t\n\f\r ]*\+?[0-9\t\n\f\r ().-]{7,}[\t\n\f\r ]*$/;
  var LEGAL_FORMS = ["llc", "inc", "ltd", "corp", "co", "company", "gmbh", "llp", "plc"];
  var PUNCTUATION = (function () {
    try { return new RegExp("\\p{P}", "gu"); } catch (e) { return null; }
  })();
  function nfc(s, form) { return typeof s.normalize === "function" ? s.normalize(form || "NFC") : null; }
  function goTrim(s) { return s.replace(GO_TRIM, ""); }
  // Go's strings.ToLower: each code point's simple lowercase mapping.
  function goLower(s) {
    return Array.from(s).map(function (c) { return c === "İ" ? "i" : c.toLowerCase(); }).join("");
  }
  // Full case folding (CaseFolding.txt, C and F), per code point, with
  // Cherokee folded to its capitals as dealprofile's foldCase does.
  function caseFold(s) {
    return Array.from(s).map(function (c) {
      if (c === "ı") return c;
      if (c === "ẞ") return "ss";
      return Array.from(c.toUpperCase().toLowerCase()).map(function (f) {
        var cp = f.codePointAt(0);
        if (cp >= 0xab70 && cp <= 0xabbf) return String.fromCodePoint(cp - 0xab70 + 0x13a0);
        if (cp >= 0x13f8 && cp <= 0x13fd) return String.fromCodePoint(cp - 0x13f8 + 0x13f0);
        return f;
      }).join("");
    }).join("");
  }
  function normPhone(v) {
    v = nfc(v, "NFKC");
    if (v === null) return [];
    v = goTrim(v);
    var at = v.search(PHONE_EXTENSION);
    if (at >= 0) v = v.slice(0, at);
    var digits = v.replace(/[^0-9]/g, "");
    if (v.charAt(0) !== "+") {
      if (digits.length === 10) digits = "1" + digits;
      else if (!(digits.length === 11 && digits.charAt(0) === "1")) return [];
    }
    return digits.length < 8 || digits.length > 15 ? [] : ["+" + digits];
  }
  function normEmail(v) {
    v = nfc(goTrim(v));
    if (v === null) return [];
    v = goLower(v);
    var ats = v.split("@").length - 1;
    return ats !== 1 || v.charAt(0) === "@" || v.charAt(v.length - 1) === "@" ? [] : [v];
  }
  // A domain's fingerprint is over its registrable domain (eTLD+1, from the
  // public suffix list, which this page does not carry): every suffix of two
  // or more labels is a candidate, so a match shows the value's registrable
  // domain is the sealed one. A name in another script, or in punycode, is
  // not normalized here (IDNA is not followed), so it reads as not checked.
  function normDomain(v) {
    v = nfc(goTrim(v));
    if (v === null) return [];
    v = goLower(v).replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    var cut = v.search(/[\/?#]/);
    if (cut >= 0) v = v.slice(0, cut);
    v = v.slice(v.lastIndexOf("@") + 1).replace(/:[0-9]+$/, "").replace(/\.+$/, "");
    var labels = v.split(".");
    if (labels.length < 2) return [];
    var ldh = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!labels.every(function (l) { return ldh.test(l) && l.slice(2, 4) !== "--"; })) return [];
    var out = [];
    for (var i = labels.length - 2; i >= 0; i--) out.push(labels.slice(i).join("."));
    return out;
  }
  function normName(v) {
    v = nfc(v);
    if (v === null || PUNCTUATION === null) return [];
    var toks = caseFold(v).replace(PUNCTUATION, " ").split(GO_FIELDS).filter(function (t) { return t !== ""; });
    if (toks.length && toks[0] === "the") toks = toks.slice(1);
    while (toks.length && LEGAL_FORMS.indexOf(toks[toks.length - 1]) >= 0) toks = toks.slice(0, -1);
    return toks.length ? [toks.join(" ")] : [];
  }
  function normalized(kind, v) {
    if (kind === "phone") return normPhone(v);
    if (kind === "email") return normEmail(v);
    if (kind === "domain") return normDomain(v);
    if (kind === "name") return normName(v);
    // A payee is an email, a phone or a name, read as dealprofile reads it.
    if (v.indexOf("@") >= 0) return normEmail(v);
    return PAYEE_IS_PHONE.test(v) ? normPhone(v) : normName(v);
  }
  // Whether value, as an identifier of kind, recomputes to the sealed fingerprint.
  function fingerprintMatches(key, kind, value, want) {
    try {
      return normalized(kind, value).some(function (n) {
        return hmacHex(key, utf8("x-deal-v0/fp\u0000" + kind + "\u0000" + n)) === want;
      });
    } catch (err) {
      if (err instanceof NotCanonical) return false;
      throw err;
    }
  }
  // The keyed fingerprints a record seals for its counterparty: in its
  // x-deal-v0 block or, in a typed record, its body.
  function sealedCounterpartyIds(payload) {
    var holders = [map(get(payload, EXTENSION)), map(get(payload, "body"))];
    for (var i = 0; i < holders.length; i++) {
      var ids = get(map(get(holders[i], "counterparty")), "ids");
      if (isMap(ids)) return ids;
    }
    return {};
  }

  // The line's model, or null when the copy opens neither: `who` is the
  // counterparty as the deal view named them (the payee, else the name,
  // else the site, phone or email, then the site in brackets), from the
  // values that recomputed; `unchecked` is true when any value did not;
  // `accepted` lists each acceptance in order, its text only when it
  // recomputed. A step named twice verifies no second entry for it.
  function counterpartyOf(reader, raw) {
    var hasWho = own(raw, "counterparty_openings"), hasAccepted = own(raw, "acceptance_openings");
    if (!hasWho && !hasAccepted) return null;
    var out = { who: null, unchecked: false, accepted: [] };
    var cp = map(get(raw, "counterparty_openings"));
    var key = hexBytes(get(cp, "key"));
    var got = {}, seen = {};
    seq(get(cp, "steps")).forEach(function (e) {
      var entry = map(e);
      var step = or(str(get(entry, "step")), "");
      var payload = reader.headers.has(step) ? reader.payload(step) : null;
      var ids = sealedCounterpartyIds(payload);
      COUNTERPARTY_KINDS.forEach(function (kind) {
        var value = get(entry, kind);
        if (typeof value !== "string") return;
        var want = str(get(ids, kind));
        var ok = key !== null && key.length > 0 && truthy(want) && !own(seen, step + "\u0000" + kind) && fingerprintMatches(key, kind, value, want);
        seen[step + "\u0000" + kind] = true;
        // The last entry for a field decides it; one that did not recompute
        // leaves the field unnamed rather than an earlier entry's value.
        if (ok) got[kind] = value;
        else {
          delete got[kind];
          out.unchecked = true;
        }
      });
    });
    var label = got.payee || got.name || got.domain || got.phone || got.email || null;
    if (label !== null) out.who = got.domain && label !== got.domain ? label + " (" + got.domain + ")" : label;
    var stepsSeen = {};
    seq(get(raw, "acceptance_openings")).forEach(function (a) {
      var opening = map(a);
      var step = str(get(opening, "step"));
      var c = committed(reader, step, function (p) {
        var body = map(get(p, "body"));
        return get(body, "kind") === ACCEPTANCE_KIND ? get(body, "content_commitment") : null;
      }, get(opening, "nonce"), get(opening, "text"));
      var first = step !== null && !own(stepsSeen, step);
      if (step !== null) stepsSeen[step] = true;
      out.accepted.push({ step: step, text: first && c.state === "opened" ? c.text : null });
    });
    return out;
  }

  // ---- "each act came after your yes" (capsule-viewer#383, line 4) ----
  //
  // Recomputed in the page from the copy's deal log, as evidencebook's deal
  // view recomputed it (deal-view.js dealLogSteps and dealAfterYes; F8.1,
  // x-deal-v0 section 6): each act (a step that cites what authorized it) is
  // preceded in this log by that authority, each at an earlier place: an
  // approval that proceeds, answering a verdict that answers a check; or, on
  // typed records, an evaluation that let it go ahead under the task's
  // authority (DO), answering the proposed action. An act sealed without an
  // approval (an unchecked_action outcome, x-deal or typed; a disclosure with
  // no authority; a claim sealed unchecked) fails, named; an authority
  // withheld from this copy is missing; a copy with any step withheld is not
  // checked, since that step may be an act. A step's place is its book
  // header's seq and its record digest the header's one payload commitment,
  // which a rel ref names (x-deal-v0 section 2): figures read from verified
  // content, nothing hashed here.
  var DEAL_STEP_TYPES = ["deal_step", "step_completed", "step_failed"];
  var APPROVAL_TYPES = ["approval", "action-approval/v0"];
  var EVALUATION_TYPES = ["verdict", "action-evaluation/v0"];
  var CHECK_TYPES = ["check", "proposed-action/v0"];
  var APPROVERS = ["user", "standing_intent", "agent_card", "task_authority"];

  // The copy's steps on its deal log, each with its place, digest, deal block
  // (null when its record is withheld) and body.
  function dealLogSteps(v) {
    var steps = [];
    seq(map(v.context).records).forEach(function (r) {
      var h = map(get(r, "evidence_record_header"));
      var cid = str(get(r, "capsule_id"));
      if (cid === null || DEAL_STEP_TYPES.indexOf(get(h, "record_type")) < 0 || int(get(h, "seq")) === null) return;
      var input = v.disclosed(cid, "agent_input");
      // A typed record (task-authority/v0 and the rest) names its type and
      // refs at its top level; an x-deal-v0 record, in its block.
      var deal = null;
      if (isMap(input)) deal = isMap(get(input, EXTENSION)) ? input[EXTENSION] : (typeof get(input, "type") === "string" ? { record_type: input.type, refs: get(input, "refs") } : null);
      steps.push({ id: cid, seq: h.seq, digest: str(seq(get(h, "payload_commitments"))[0]), deal: deal, body: map(get(input, "body")) });
    });
    return steps;
  }
  function refTo(deal, rel) {
    var found = seq(get(deal, "refs")).find(function (r) { return get(map(r), "rel") === rel; });
    return found ? str(get(found, "digest")) : null;
  }
  // The line's model: state passed, failed (why unapproved or order, the act
  // named), missing (the act named), withheld (a step withheld: not checked),
  // unplaced (no step has a place in a book: not checked) or none (no act:
  // nothing drawn), and the approvers the acts were approved by.
  function afterYesOf(v) {
    var steps = dealLogSteps(v);
    if (!steps.length) return { state: "unplaced", approvers: [] };
    var byDigest = new Map();
    steps.forEach(function (s) { if (s.digest !== null) byDigest.set(s.digest, s); });
    var earlier = function (digest, than, types) {
      var s = digest === null ? undefined : byDigest.get(digest);
      if (!s) return "absent";
      if (s.deal === null) return "withheld";
      return s.seq < than.seq && types.indexOf(get(s.deal, "record_type")) >= 0 ? s : "bad";
    };
    var failed = function (act, why) { return { state: "failed", why: why, act: act, approvers: [] }; };
    var acts = [];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (s.deal === null) continue;
      var t = get(s.deal, "record_type");
      if ((t === "outcome" || t === "action-outcome/v0") && get(s.body, "status") === "unchecked_action") return failed(s, "unapproved");
      if (t === "disclosure" && get(s.body, "authority") === "none") return failed(s, "unapproved");
      if (t === "claim" && get(s.body, "unchecked") === true) return failed(s, "unapproved");
      // An action record is an act whether or not it cites an authority, in
      // either form (RECORD_TYPE_BY_TYPED), so one citing none fails below.
      if (refTo(s.deal, "authorized_by") !== null || t === "action" || RECORD_TYPE_BY_TYPED[t] === "action" || (t === "disclosure" && get(s.body, "authority") === "approval")) acts.push(s);
    }
    var withheld = steps.some(function (s) { return s.deal === null; });
    if (!acts.length) return { state: withheld ? "withheld" : "none", approvers: [] };
    var approvers = [];
    var missing = null;
    for (i = 0; i < acts.length; i++) {
      var act = acts[i];
      var by = earlier(refTo(act.deal, "authorized_by"), act, APPROVAL_TYPES.concat(EVALUATION_TYPES));
      var evaluation = by;
      var approver = null;
      if (typeof by === "object" && APPROVAL_TYPES.indexOf(get(by.deal, "record_type")) >= 0) {
        if (get(by.body, "proceed") !== true) return failed(act, "order");
        var answered = refTo(by.deal, "approves");
        evaluation = earlier(answered, by, EVALUATION_TYPES);
        // x-deal-v0 section 6 rule 5: only the verdict's first answer
        // authorizes; a later one ("Hold", then "Pay anyway") never does.
        var answeredBefore = steps.some(function (o) {
          return o.deal !== null && APPROVAL_TYPES.indexOf(get(o.deal, "record_type")) >= 0 && o.seq < by.seq && refTo(o.deal, "approves") === answered;
        });
        if (answeredBefore) return failed(act, "order");
        if (get(by.deal, "record_type") === "approval") {
          approver = str(get(by.body, "approver"));
          // Standing intent approves only a passing verdict (rule 6).
          if (approver === "standing_intent" && typeof evaluation === "object" && get(evaluation.body, "result") !== "pass") return failed(act, "order");
        } else {
          // A typed ASK is answered only by the user's own approval, and
          // only an ASK is (a DO authorizes on its own; a DENY never does).
          if (get(by.body, "authority") !== "user_approval") return failed(act, "order");
          if (typeof evaluation === "object" && get(evaluation.body, "disposition") !== "ASK") return failed(act, "order");
          approver = "user";
        }
      } else if (typeof by === "object") {
        if (get(by.body, "disposition") !== "DO") return failed(act, "order");
        approver = "task_authority";
      }
      var check = typeof evaluation === "object" ? earlier(refTo(evaluation.deal, "checks"), evaluation, CHECK_TYPES) : evaluation;
      if (check === "withheld") {
        missing = missing || act;
        continue;
      }
      if (typeof check === "string") return failed(act, "order");
      // The check asked about this very act (rule 5).
      if (typeof get(act.body, "action") === "string" && get(check.body, "action") !== act.body.action) return failed(act, "order");
      if (approver !== null && approvers.indexOf(approver) < 0) approvers.push(approver);
    }
    if (missing !== null) return { state: "missing", act: missing, approvers: approvers };
    return { state: withheld ? "withheld" : "passed", approvers: approvers };
  }
  // The model kept: the act by its capsule id and its sealed action name.
  function afterYesModel(v) {
    var yes = afterYesOf(v);
    if (yes.state === "none") return null;
    var out = { state: yes.state, approvers: yes.approvers.filter(function (a) { return APPROVERS.indexOf(a) >= 0; }) };
    if (yes.why) out.why = yes.why;
    if (yes.act) out.act = { step: yes.act.id, action: str(get(yes.act.body, "action")) };
    return out;
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
  // A record member's payload as the runtime resolved it, or null unless disclosed.
  function disclosedIn(context) {
    var resolved = map(context).resolvedDisclosures;
    return function (id, member) {
      var entry = resolved && typeof resolved.get === "function" ? resolved.get(id) : undefined;
      var r = entry ? entry[member] : undefined;
      return r && r.state === "disclosed" ? (r.payload === undefined ? null : r.payload) : null;
    };
  }

  function view(context, env) {
    var c = map(context);
    var bundle = map(c.bundle);
    var records = seq(c.records).map(function (r) { return map(r).capsule_id; }).filter(function (id) { return typeof id === "string"; });
    var resolved = c.resolvedDisclosures;
    var verification = env.verification(context);
    var disclosed = disclosedIn(context);
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
      // context.py GATE_OUTCOMES: an incomplete outcome (a producer-selected bundle, which the
      // page supplies only for the top-level bundle) passes the gate as it does there.
      verified: (verification.outcome === "verified" || verification.outcome === "incomplete") && !mismatch,
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

  // model.group_thousands: ``2000`` -> ``2,000``, by hand and never by locale, so every reader and both twins agree.
  function groupThousands(whole) {
    if (whole < 0) return "-" + groupThousands(-whole);
    var digits = String(whole);
    var head = digits.length % 3 || 3;
    var out = [digits.slice(0, head)];
    for (var i = head; i < digits.length; i += 3) out.push(digits.slice(i, i + 3));
    return out.join(",");
  }

  function formatAmount(minor, currency) {
    // BTC counts millisatoshi (1e-11 BTC): shown as counted, never sats or a BTC decimal.
    if (currency === "BTC") return (minor < 0 ? "-" : "") + groupThousands(Math.abs(minor)) + " msat";
    var exponent = own(EXPONENT, currency) ? EXPONENT[currency] : 2;
    var sign = minor < 0 ? "-" : "";
    var abs = Math.abs(minor);
    var scale = Math.pow(10, exponent);
    var whole = Math.floor(abs / scale);
    var part = abs % scale;
    if (!exponent) return sign + groupThousands(whole) + " " + currency;
    return sign + groupThousands(whole) + "." + String(part).padStart(exponent, "0") + " " + currency;
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

  // The sealed report's AUTHORITY blocks (capsule-viewer#383, line 5), which
  // report() leaves out as the frozen twin does: for each act, the layers it
  // relied on, in its sealed order, each with its time and step, and whether
  // they covered it. capsulectl writes them on the holder's own copy of a
  // deal sealed in typed records (evidencebook deal_report.go, the AUTHORITY
  // block; deal_authority.go). They are the holder's computation, shown as
  // sealed text: this page checks none of it. Null when the report has none.
  function authorityOf(raw) {
    var blocks = [];
    seq(get(raw, "authority")).forEach(function (b) {
      if (!isMap(b)) return;
      var layers = [];
      seq(get(b, "layers")).forEach(function (l) {
        if (!isMap(l)) return;
        var text = str(get(l, "text"));
        if (text === null) return;
        layers.push({ layer: or(str(get(l, "layer")), ""), at: str(get(l, "at")), text: text, note: or(str(get(l, "note")), null), step: str(get(l, "step")) });
      });
      blocks.push({ action: or(str(get(b, "action")), ""), step: str(get(b, "step")), covered: get(b, "covered") === true, layers: layers });
    });
    if (!blocks.length) return null;
    return { order: str(get(raw, "authority_order")), blocks: blocks };
  }

  // The referee an adjudicator's copy names (capsule-viewer#383, line 8):
  // the sealed report's own `referee`, beside its report (capsulectl seals the
  // adjudicator the copy is handed to; evidencebook deal_report.go
  // dealRefereeOf), on an adjudicator's copy only. Null otherwise. Whether the
  // other side named the same one is a check of both copies, not of this one.
  function refereeOf(reader, raw) {
    if (get(raw, "audience") !== "adjudicator") return null;
    var named = str(get(map(get(map(get(reader.v.bundle, "extensions")), EXTENSION)), "sealed_report"));
    if (named === null) return null;
    var payload = reader.standalone() ? reader.standaloneContent(named) : reader.payload(named);
    var referee = str(get(payload, "referee"));
    return truthy(referee) ? referee : null;
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
  // it is read only when its check passed (assurance.report_checked), as
  // capsulectl verify reported it or, on a page whose verifier reports none,
  // as the page's runtime checked it (EvidenceGraph.dealStandaloneReport,
  // #397), and shown with that status only.
  Reader.prototype.standaloneReport = function (named) {
    var content = this.standaloneContent(named);
    return content === null ? null : get(content, "report");
  };
  // The whole payload of the standalone report (its `report` is the text body).
  Reader.prototype.standaloneContent = function (named) {
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
    return content;
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
    return or(str(get(producer, "name")), "an unnamed producer") + " " + version + " (" + or(str(get(producer, "commit")), "unknown") + ")";
  }

  function producerNameOf(payload) {
    var producer = map(or(get(map(get(payload, EXTENSION)), "producer"), get(payload, "producer")));
    return str(get(producer, "version")) === null ? null : str(get(producer, "name"));
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
    var model = {
      deal_id: or(str(get(raw, "deal_id")), ""),
      demo: demo,
      headline: headlineOf(steps, v.root, rep),
      asked: askedOf(reader, raw),
      statements: statementsOf(reader, raw),
      steps: steps,
      report: rep,
      producers: distinct(payloads.map(producerOf)),
      producer_names: distinct(payloads.map(producerNameOf)),
      bundle_digest: v.assurance.bundle_digest,
      witnessed: v.assurance.witnesses,
      countersignatures: v.assurance.countersignatures,
      verification: v.verification,
      report_checked: reader.standalone() ? or(str(v.assurance.report_checked), null) : null,
    };
    // capsulectl's report, when the page was given one (CV3b): the holder's
    // own book's witness time (u219) and the countersign rung (line 9).
    if (v.assurance.book_witnessed) model.book_witnessed = v.assurance.book_witnessed;
    if (v.assurance.countersign_reported) model.countersign_reported = v.assurance.countersign_reported;
    if (reader.standalone() && v.assurance.report_checked_here === true) model.report_checked_here = true;
    return model;
  }

  // ---- the v1 deal receipt (evidencebook docs/design/461-deal-profile.md, section 9) ----
  //
  // A v1 deal has no close and no status a record holds: the holder's sealed
  // report lists each row with the status evidencebook's rowstatus computed,
  // and this page only shows it. It never computes or corrects one, and it
  // reads a word outside section 9's closed sets as an unknown version of the
  // report (the module declines), never as a word of its own.

  var V1_AUDIENCES = ["keep", "counterparty", "adjudicator"];
  var V1_START_STATES = ["started", "awaiting_agreement", "not_started"];
  var V1_START_BY = ["offerer_in_time", "acceptor_named", "first_act"];
  var V1_ROWS_STATES = ["listed", "not_started", "withheld"];
  var V1_STATUSES = ["not_reached", "not_due", "no_statement", "waiting", "uncontested", "agreed_so_far", "agreed", "in_disagreement", "in_dispute", "ruled"];
  var V1_VALUES = ["met", "not_met"];
  var V1_REMEDIES = ["none", "due", "made", "not_honoured", "not_counted"];
  var V1_SIDES = ["buyer", "seller"];
  var V1_CHECKS = ["passed", "failed", "not_run", "not_recomputed"];

  function closedWord(list, value, what) {
    if (typeof value !== "string" || list.indexOf(value) < 0) throw new Unavailable("the v1 report's " + what + " is not one of " + list.join(", "));
    return value;
  }
  function optionalWord(list, value, what) { return value === null || value === undefined ? null : closedWord(list, value, what); }
  // A row date is an RFC 3339 UTC time to the second, or the word not_set.
  var RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  // The regex checks the shape; the round trip rejects a date Date.parse would silently move (30 February, hour 24).
  function validUtcTime(t) {
    if (!RFC3339_UTC.test(t)) return false;
    var ms = Date.parse(t);
    return !isNaN(ms) && new Date(ms).toISOString().slice(0, 19) + "Z" === t;
  }
  function rowDate(value, what) {
    var t = str(value);
    if (t === null || (t !== "not_set" && !validUtcTime(t))) {
      throw new Unavailable("the v1 report's " + what + " is neither an RFC 3339 UTC time nor not_set");
    }
    return t;
  }
  function flag(o, k, what) {
    var value = get(o, k);
    if (typeof value !== "boolean") throw new Unavailable("the v1 report's " + what + " is not a boolean");
    return value;
  }

  // The members section 9's report has; evidencebook's VerifyReport refuses any other.
  var V1_REPORT_MEMBERS = ["type", "profile", "deal_id", "audience", "nonce", "as_of", "deal_checkpoint", "pack_digest", "start", "settled", "rows_state", "rows", "rests_on", "report", "disputes", "rulings_unnamed", "status_fact", "referee"];

  // Every field name section 9's report has, at any level. VerifyReport refuses a member spelled otherwise (another case, or
  // U+017F long s and U+212A Kelvin sign, which case-fold to s and k): the reader reads exact names only, and declines the
  // report rather than ignore a second spelling beside, or in place of, the one it reads.
  var V1_FIELD_NAMES = ["against", "as_of", "audience", "by", "check", "claimant", "counted", "counterparty", "counterparty_kind", "counterparty_layer", "counterparty_proof", "current", "deal_checkpoint", "deal_id", "disputes", "due", "final", "fork_at", "forum", "id", "key_id", "last", "late", "local", "log_id", "mmr_size", "nonce", "outcome", "owed", "owed_by", "own", "pack_digest", "profile", "record", "referee", "relied_on", "remedy", "remedy_due", "remedy_made", "report", "rests_on", "root", "row", "rows", "rows_state", "ruling", "rulings_unnamed", "settled", "side", "size", "start", "state", "statements", "status", "status_fact", "time", "type", "url", "value", "window_end", "witnessed", "witnesses"];
  function foldName(k) { return String(k).toUpperCase().toLowerCase(); }
  function refuseRespelledNames(node) {
    if (Array.isArray(node)) { node.forEach(refuseRespelledNames); return; }
    if (!isMap(node)) return;
    Object.keys(node).forEach(function (k) {
      if (V1_FIELD_NAMES.indexOf(k) < 0) {
        var folded = foldName(k);
        if (V1_FIELD_NAMES.some(function (n) { return foldName(n) === folded; })) throw new Unavailable("the v1 report has a member spelled otherwise than a field name: " + k);
      }
      // The report's text and a term's owed are free-form: their names are not the profile's.
      if (k !== "report" && k !== "owed") refuseRespelledNames(node[k]);
    });
  }

  function failV1(what) { throw new Unavailable("the v1 report's " + what); }

  function dealRow(raw) {
    if (!isMap(raw)) throw new Unavailable("a row of the v1 report is not an object");
    var r = raw;
    var id = str(get(r, "id"));
    if (id === null || id === "") throw new Unavailable("a row of the v1 report has no id");
    var ruling = get(r, "ruling");
    // section 9: the first final ruling rowstatus applied, or null.
    if (ruling !== null && (!isMap(ruling) || flag(ruling, "final", "ruling final") !== true)) throw new Unavailable("the v1 report's ruling is not a final ruling or null");
    // A ruling names its side, buyer, seller or null, and always carries the member.
    if (ruling !== null && !own(ruling, "against")) throw new Unavailable("the v1 report's ruling has no against member");
    var relied = get(r, "relied_on");
    if (!Array.isArray(relied)) throw new Unavailable("the v1 report's row relied_on is not an array");
    // VerifyReport refuses a null or mistyped list or object where section 9 has one.
    if (!isMap(get(r, "owed"))) throw new Unavailable("the v1 report's row owed is not an object");
    var late = get(r, "late");
    if (own(r, "late")) {
      if (!isMap(late) || !Array.isArray(get(late, "statements")) || !Array.isArray(get(late, "disputes"))) throw new Unavailable("the v1 report's row late is not {statements, disputes} lists");
    }
    return {
      id: id,
      owed_by: or(str(get(r, "owed_by")), ""),
      due: rowDate(get(r, "due"), "due"),
      window_end: rowDate(get(r, "window_end"), "window_end"),
      status: closedWord(V1_STATUSES, get(r, "status"), "row status"),
      value: optionalWord(V1_VALUES, get(r, "value"), "row value"),
      remedy: optionalWord(V1_REMEDIES, get(r, "remedy"), "row remedy"),
      remedy_made: flag(r, "remedy_made", "row remedy_made"),
      local: flag(r, "local", "row local"),
      check: closedWord(V1_CHECKS, get(r, "check"), "row check"),
      // `late` (optional in section 9, undefined until rowstatus reports it) is not read: the page shows no late line.
      ruling: isMap(ruling)
        ? { value: or(str(get(ruling, "value")), ""), against: optionalWord(V1_SIDES, get(ruling, "against"), "ruling against") }
        : null,
      relied_on: relied.map(function (e) {
        if (!isMap(e)) throw new Unavailable("a relied_on entry of the v1 report is not an object");
        var time = str(get(e, "time"));
        var named = flag(e, "witnessed", "relied_on named-witness flag");
        // A time is given exactly when a named witness receipt gives it (section 9).
        if (named !== (time !== null)) throw new Unavailable("a relied_on entry's named-witness flag does not match its time");
        return { record: or(str(get(e, "record")), ""), side: or(str(get(e, "side")), ""), time: time, named_witness: named };
      }),
    };
  }

  // Reader.sealedReport's twin for v1: the named report is always standalone (section 9).
  Reader.prototype.dealReportV1 = function () {
    var extensions = map(get(this.v.bundle, "extensions"));
    if (own(extensions, EXTENSION)) throw new Unavailable("a deal has one version: the bundle carries x-deal-v0 beside x-deal-v1");
    var named = str(get(map(get(extensions, EXTENSION_V1)), "sealed_report"));
    if (named === null) throw new Unavailable("the x-deal-v1 extension names no sealed report");
    if (!own(extensions, STANDALONE_EXTENSION)) throw new Unavailable("the v1 report is standalone and the bundle carries none in " + STANDALONE_EXTENSION);
    var content = this.standaloneContent(named);
    if (content === null) throw new Unavailable("the v1 report is a record on a log; a v1 report travels standalone");
    return [named, content];
  };

  // The settle legs a payment row relied on (evidencebook#588, docs/design/461-deal-profile.md
  // section 9, "The payment legs and the bundle extension"). The x-deal-v1 extension is exactly
  // {sealed_report, book}, and book is {agreement, relied_on}: relied_on holds, keyed by record id, the
  // book pair of every record the holder's rows rely on, so a leg is read by its relied_on id. VerifyReportBundle
  // refuses a bundle without the book, so this page does too. It checks the shape and that each key is its
  // pair's Capsule id; it does not check who signed a record or the logs (the check capsulectl runs does
  // that), so the side shown is the report's own. It picks no leg and derives no verdict from one: `check`
  // stays the only verdict.
  function dealBook(extension) {
    Object.keys(extension).forEach(function (k) {
      if (k !== "sealed_report" && k !== "book") throw new Unavailable("the x-deal-v1 extension has a member section 9 does not: " + k);
    });
    var book = get(extension, "book");
    if (!isMap(book)) throw new Unavailable("the x-deal-v1 extension carries no book object");
    Object.keys(book).forEach(function (k) {
      if (k !== "agreement" && k !== "relied_on") throw new Unavailable("the x-deal-v1 extension's book has a member section 9 does not: " + k);
    });
    if (!isMap(get(book, "agreement")) || !isMap(get(book, "relied_on"))) throw new Unavailable("the x-deal-v1 extension's book has no agreement and relied_on objects");
    var relied = get(book, "relied_on");
    Object.keys(relied).forEach(function (k) {
      var pair = relied[k];
      if (!isMap(pair) || !isMap(get(pair, "record"))) throw new Unavailable("a book pair of the x-deal-v1 extension is not a Capsule pair");
      if (get(get(pair, "record"), "capsule_id") !== k) throw new Unavailable("a book pair's Capsule id is not its key in the x-deal-v1 extension: " + k);
    });
    return relied;
  }

  // A money member of a settlement as recorded: its value counted in 10^-assetScale of assetCode. A member
  // this cannot write that way (the draft allows any scale and any digit string) is shown as recorded, never
  // a reason to decline the receipt.
  // The payer's leg records `amount`, the payee's `received` and `receive_fee` (draft-mih-agent-settlement-records).
  var LEG_MONEY = ["amount", "received", "receive_fee"];
  function legAmount(a) {
    if (!isMap(a)) return "-";
    var value = str(get(a, "value")), code = str(get(a, "assetCode")), scale = int(get(a, "assetScale"));
    if (value === null || !/^-?\d+$/.test(value) || code === null || code === "" || scale === null || scale < 0 || scale > 255) {
      return [value, code, scale === null ? null : "scale " + scale].filter(function (x) { return x !== null; }).join(" ") || "-";
    }
    if (!scale) return value + " " + code;
    var sign = value.charAt(0) === "-" ? "-" : "";
    var digits = value.replace("-", "").padStart(scale + 1, "0");
    return sign + digits.slice(0, digits.length - scale) + "." + digits.slice(digits.length - scale) + " " + code;
  }

  // One leg, as its record states it: the settlement member's names and values, the record id, and the side
  // the report names (or, in a copy that withholds the rows, the settlement's own sealer_role).
  function readLeg(record, id, side) {
    var settlement = get(record, "settlement");
    if (!isMap(settlement)) throw new Unavailable("a leg's settlement is not an object");
    var leg = str(get(settlement, "leg")), status = str(get(settlement, "status"));
    if (leg === null || status === null) throw new Unavailable("a leg's settlement has no leg and status");
    var ref = get(settlement, "payment_ref");
    return {
      record: id,
      side: side,
      sealer_role: str(get(settlement, "sealer_role")),
      leg: leg,
      status: status,
      money: LEG_MONEY.filter(function (k) { return own(settlement, k); }).map(function (k) { return [k, legAmount(get(settlement, k))]; }),
      observed_at: str(get(settlement, "observed_at")),
      payment_ref: isMap(ref) ? { type: or(str(get(ref, "type")), ""), value: or(str(get(ref, "value")), "") } : null,
    };
  }

  // A copy that withholds the rows (an adjudicator's) ties no record to a term: every settle leg the book holds,
  // in the book's order, with no side but the settlement's own sealer_role.
  function bookLegs(relied) {
    return Object.keys(relied).filter(function (k) { return own(get(relied[k], "record"), "settlement"); })
      .map(function (k) { return readLeg(get(relied[k], "record"), k, null); });
  }

  function legsOf(rows, rowsState, relied) {
    // Rows listed: the book holds exactly the records they name (section 9).
    if (rowsState === "listed") {
      var named = {};
      rows.forEach(function (row) { row.relied_on.forEach(function (e) { named[e.record] = true; }); });
      Object.keys(relied).forEach(function (k) { if (!own(named, k)) throw new Unavailable("the x-deal-v1 extension's book holds a record no row relies on: " + k); });
    }
    return rows.map(function (row) {
      var legs = [];
      row.relied_on.forEach(function (e) {
        if (!own(relied, e.record)) throw new Unavailable("a record a row relies on is not in the x-deal-v1 extension's book: " + e.record);
        var record = get(get(relied, e.record), "record");
        // The record's type as its book payload states it (statement, settle, ...), or null: read only to
        // say why no payment record is shown (#432), never for a verdict.
        e.record_type = str(get(map(get(map(get(get(relied, e.record), "payload")), EXTENSION_V1)), "record_type"));
        if (!own(record, "settlement")) return;
        legs.push(readLeg(record, e.record, e.side));
      });
      return legs;
    });
  }

  function buildDeal(v, audience) {
    if (!v.verified) throw new Unavailable("the bundle did not verify");
    var reader = new Reader(v);
    var sealed = reader.dealReportV1();
    var content = sealed[1];
    if (get(content, "profile") !== EXTENSION_V1) throw new Unavailable("the sealed report is not an x-deal-v1 report");
    refuseRespelledNames(content);
    Object.keys(content).forEach(function (k) { if (V1_REPORT_MEMBERS.indexOf(k) < 0) throw new Unavailable("the v1 report has a member section 9 does not: " + k); });
    var cut = closedWord(V1_AUDIENCES, get(content, "audience"), "audience");
    if (audience !== null && cut !== audience) throw new Unavailable("this copy was cut for " + cut + ", not " + audience);
    var startRaw = map(get(content, "start"));
    var start = {
      state: closedWord(V1_START_STATES, get(startRaw, "state"), "start state"),
      local: flag(startRaw, "local", "start local"),
      by: optionalWord(V1_START_BY, get(startRaw, "by"), "start by"),
    };
    if (!isMap(get(content, "report"))) throw new Unavailable("the v1 report's report text is not an object");
    var unnamed = get(content, "rulings_unnamed");
    // Both are left out at zero (section 9), so a present one is a positive count, or a non-empty list.
    if (own(content, "rulings_unnamed") && (int(unnamed) === null || unnamed < 1)) throw new Unavailable("the v1 report's rulings_unnamed is not a positive count");
    if (own(content, "disputes") && (!Array.isArray(get(content, "disputes")) || !get(content, "disputes").length)) throw new Unavailable("the v1 report's disputes is not a non-empty list");
    var rowsState = closedWord(V1_ROWS_STATES, get(content, "rows_state"), "rows_state");
    var rawRows = get(content, "rows");
    if (!Array.isArray(rawRows)) throw new Unavailable("the v1 report's rows is not an array");
    var rows = rawRows.map(dealRow);
    var relied = dealBook(map(get(map(get(v.bundle, "extensions")), EXTENSION_V1)));
    var legs = legsOf(rows, rowsState, relied);
    rows.forEach(function (row, i) { row.legs = legs[i]; });
    var withheldLegs = rowsState === "withheld" ? bookLegs(relied) : [];
    // section 9: an adjudicator's copy, and only it, withholds the rows.
    if ((rowsState === "withheld") !== (cut === "adjudicator")) throw new Unavailable("the v1 report's rows_state is withheld exactly on an adjudicator's copy");
    if (rowsState !== "listed" && rows.length) throw new Unavailable("the v1 report lists rows while its rows_state is " + rowsState);
    var rests = map(get(content, "rests_on"));
    var theirs = get(rests, "counterparty");
    var rep = report(sealed[0], map(get(content, "report")));
    rep.audience = cut;
    var steps = dealSteps(v);
    return {
      deal_id: or(str(get(content, "deal_id")), ""),
      audience: cut,
      as_of: or(str(get(content, "as_of")), ""),
      pack_digest: str(get(content, "pack_digest")),
      start: start,
      settled: flag(content, "settled", "settled"),
      rows_state: rowsState,
      rows: rows,
      withheld_legs: withheldLegs,
      rests_on: {
        own_size: int(get(map(get(rests, "own")), "size")),
        counterparty: isMap(theirs) ? { counted: int(get(theirs, "counted")), fork_at: int(get(theirs, "fork_at")) } : null,
        // The adjudicator's copy omits these two (section 9's audience table): absent is not zero.
        counterparty_layer: own(rests, "counterparty_layer") ? flag(rests, "counterparty_layer", "counterparty_layer") : null,
        witnesses: own(rests, "witnesses") ? (Array.isArray(rests.witnesses) ? rests.witnesses.length : failV1("witnesses is not an array")) : null,
      },
      report: rep,
      bundle_digest: v.assurance.bundle_digest,
      witnessed: v.assurance.witnesses,
      countersignatures: v.assurance.countersignatures,
      counterparty_half: or(str(v.assurance.counterparty_half), null),
      book_witnessed: v.assurance.book_witnessed || null,
      verification: v.verification,
      report_checked: or(str(v.assurance.report_checked), null),
      // The top surface (#382): every record the copy carries, the holder's role as its own
      // agreement states it, capsulectl's answer per check and the command it gave, and the
      // copy itself for "Download proof file" (null when it cannot be written back exactly).
      sealed_steps: steps,
      role: roleOf(steps),
      checks: or(v.assurance.checks, null),
      verify_command: or(str(v.assurance.verify_command), null),
      verdict: or(str(v.assurance.verdict), null),
      countersigned: Array.isArray(v.assurance.countersigned) ? v.assurance.countersigned : null,
      countersigned_copy: v.assurance.countersigned_copy || null,
      item: offerItem(steps, v.assurance.deal_offer),
      log_id: str(get(map(get(content, "deal_checkpoint")), "log_id")),
      checkpoint_size: int(get(map(get(content, "deal_checkpoint")), "mmr_size")),
      proof_file: proofFile(v.bundle),
    };
  }
  // The item, from the holder's own sealed offer the page's maker gave (#461, Sherlock2's rule on #384:
  // the item is the agreement's offer `terms.item`): only when the offer's SHA-256 over its JCS bytes is
  // the digest the copy's own sealed agreement cites, and it is a propose record. Else null: nothing drawn.
  function offerItem(steps, offer) {
    if (!isMap(offer)) return null;
    var agree = steps.find(function (s) { return s.kind === "agree" && s.offer_ref !== null; });
    if (!agree || recordDigest(offer) !== agree.offer_ref) return null;
    if (str(get(map(get(offer, EXTENSION_V1)), "record_type")) !== "propose") return null;
    var item = str(get(map(get(map(get(offer, "body")), "terms")), "item"));
    return item !== null && item.trim() !== "" ? item.trim() : null;
  }
  function roleOf(steps) {
    var agree = steps.find(function (s) { return s.kind === "agree"; });
    return agree && (agree.role === "buyer" || agree.role === "seller") ? agree.role : null;
  }
  // The copy as the page carries it: the emitter writes the bundle as JCS, so its JCS is the file.
  function proofFile(bundle) {
    try {
      return jcs(bundle);
    } catch (e) {
      if (e instanceof NotCanonical) return null;
      throw e;
    }
  }

  // ---- the v1 receipt's top surface: what the copy holds, record by record (#382) ----

  // A book pair's payload, read only when it is the one its header commits to and the header is the
  // one its record attests (the record's agent_input digest): never a word the record does not seal.
  function base64Bytes(text) {
    if (typeof text !== "string" || !/^[A-Za-z0-9_\-+/]*={0,2}$/.test(text)) return null;
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var clean = text.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
    if (clean.length % 4 === 1) return null;
    var out = [], bits = 0, acc = 0;
    for (var i = 0; i < clean.length; i++) {
      acc = (acc << 6) | alphabet.indexOf(clean.charAt(i));
      bits += 6;
      if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
    }
    return new Uint8Array(out);
  }
  function utf8Text(bytes) {
    try {
      if (typeof TextDecoder === "function") return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return decodeURIComponent(escape(String.fromCharCode.apply(null, Array.prototype.slice.call(bytes))));
    } catch (e) {
      return null;
    }
  }
  function attestedHeader(record, header) {
    var attested = str(get(map(get(map(get(record, "model_attestation")), "compute_attestation")), "agent_input_digest"));
    return isMap(header) && attested !== null && recordDigest(header) === attested ? header : null;
  }
  // The payload a header's first commitment names, from the copy's evidencebook/payloads, when its bytes
  // hash to that commitment; else null (withheld, or not the sealed one).
  function committedPayload(header, payloads) {
    var commitment = str(seq(get(header, "payload_commitments"))[0]);
    if (commitment === null || !HEX64.test(commitment)) return null;
    var bytes = base64Bytes(get(payloads, commitment));
    if (bytes === null || sha256Hex(bytes) !== commitment) return null;
    var text = utf8Text(bytes);
    if (text === null) return null;
    try {
      var payload = JSON.parse(text);
      return isMap(payload) ? payload : null;
    } catch (e) {
      return null;
    }
  }

  // One step per record the copy carries, in the copy's order: its time, its log place, its kind and
  // what it records, as far as the copy opens it. A record whose payload the copy does not open is a
  // step with no kind ("withheld").
  function dealSteps(v) {
    var bundle = v.bundle;
    var payloads = map(get(map(get(bundle, "extensions")), "evidencebook/payloads"));
    var disclosures = map(get(bundle, "disclosures"));
    var book = map(get(map(get(bundle, "extensions")), EXTENSION_V1)).book;
    var pairs = {};
    var agreement = map(get(map(book), "agreement"));
    if (isMap(get(agreement, "record"))) pairs[str(get(get(agreement, "record"), "capsule_id"))] = agreement;
    var relied = map(get(map(book), "relied_on"));
    Object.keys(relied).forEach(function (k) { pairs[k] = map(relied[k]); });
    return seq(get(bundle, "records")).filter(isMap).map(function (record) {
      var id = or(str(get(record, "capsule_id")), "");
      var pair = own(pairs, id) ? pairs[id] : null;
      var header = attestedHeader(record, pair ? get(pair, "header") : get(map(get(disclosures, id)), "agent_input"));
      var payload = null;
      if (header !== null) {
        payload = pair && isMap(get(pair, "payload")) && recordDigest(get(pair, "payload")) === str(seq(get(header, "payload_commitments"))[0])
          ? get(pair, "payload")
          : committedPayload(header, payloads);
      }
      var block = map(get(map(payload), EXTENSION_V1));
      var body = map(get(map(payload), "body"));
      var coords = map(get(map(get(v.memberships, id)), "log_coordinates"));
      var statements = seq(get(body, "statements")).filter(isMap).map(function (st) {
        return { row: or(str(get(st, "row")), ""), value: optionalWordOrNull(V1_VALUES, get(st, "value")) };
      });
      return {
        record: id,
        // The step's own sealed time (its block's `at`), else the record's timestamp to the second.
        time: stepTime(payload !== null ? str(get(block, "at")) : null, str(get(record, "timestamp"))),
        seq: payload !== null && int(get(block, "seq")) !== null ? int(get(block, "seq")) : header !== null ? int(get(header, "seq")) : null,
        leaf: int(get(coords, "leaf_index")),
        kind: payload !== null ? str(get(block, "record_type")) : null,
        shown: payload !== null,
        role: payload !== null ? str(get(body, "role")) : null,
        leg: isMap(get(record, "settlement")) ? readLeg(record, id, null) : null,
        // The settlement's money members as recorded, for the page to say in msat and sats.
        money: isMap(get(record, "settlement")) ? LEG_MONEY.reduce(function (acc, k) {
          if (own(get(record, "settlement"), k) && isMap(get(get(record, "settlement"), k))) acc[k] = get(get(record, "settlement"), k);
          return acc;
        }, {}) : {},
        statements: statements,
        act: payload !== null ? str(get(body, "act")) : null,
        // The offer the sealed agreement cites (#461): its digest, read only from the agreement's sealed payload.
        offer_ref: payload !== null && str(get(block, "record_type")) === "agree" ? str(get(map(get(body, "offer")), "digest")) : null,
        // A refund or a remedy's payment (evidencebook payment.go: `reverses`, `remedy_for`), never the deal's own payment.
        refund: payload !== null && (own(body, "reverses") || own(body, "remedy_for")),
      };
    });
  }
  function stepTime(at, timestamp) {
    if (at !== null && validUtcTime(at)) return at;
    var m = timestamp !== null ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?Z$/.exec(timestamp) : null;
    return m && validUtcTime(m[1] + "Z") ? m[1] + "Z" : timestamp;
  }
  function optionalWordOrNull(words, value) { return typeof value === "string" && words.indexOf(value) >= 0 ? value : null; }

  // capsulectl verify's own answer for each bundle check, as the page runtime carries it in the
  // x-deal-v1 entry (#382): {name: {status, findings}} with strings only, or null when none came.
  function reportedChecks(verification) {
    var entry = seq(map(verification).extensions).map(map).find(function (e) { return e.kind === EXTENSION_V1 && e.report === "standalone"; });
    var given = entry !== undefined ? get(entry, "checks") : null;
    if (!isMap(given)) return null;
    var out = {};
    Object.keys(given).forEach(function (name) {
      var c = map(given[name]);
      if (typeof c.status === "string") out[name] = { status: c.status, findings: seq(c.findings).filter(function (f) { return typeof f === "string"; }) };
    });
    return out;
  }
  function reportedEntry(verification, member) {
    var entry = seq(map(verification).extensions).map(map).find(function (e) { return e.kind === EXTENSION_V1 && e.report === "standalone"; });
    return entry !== undefined ? get(entry, member) : null;
  }
  function reportedVerdict(verification) {
    var v = reportedEntry(verification, "verdict");
    return typeof v === "string" && v !== "" ? v : null;
  }
  // The page's classification of each countersignature, as the runtime carries it: [{kind, name, at}].
  function reportedCountersigned(verification) {
    var given = reportedEntry(verification, "countersigned");
    if (!Array.isArray(given)) return null;
    return given.filter(isMap).map(function (c) {
      return { kind: or(str(get(c, "kind")), "unknown"), name: str(get(c, "name")), at: str(get(c, "at")) };
    });
  }
  // The page's own check of the countersigned copy it carries (#456), as the runtime carries it:
  // {name, at, k, n} only when every check passed, else null.
  function reportedCountersignedCopy(verification) {
    var c = map(reportedEntry(verification, "countersigned_copy"));
    var name = str(get(c, "name")), at = str(get(c, "at")), k = get(c, "k"), n = get(c, "n");
    if (name === null || at === null || !Number.isInteger(k) || !Number.isInteger(n) || k < 1 || k > n) return null;
    return { name: name, at: at, k: k, n: n, independent: get(c, "independent") === true };
  }
  function reportedCommand(verification) {
    var entry = seq(map(verification).extensions).map(map).find(function (e) { return e.kind === EXTENSION_V1 && e.report === "standalone"; });
    var command = entry !== undefined ? get(entry, "verify_command") : null;
    return typeof command === "string" && command !== "" ? command : null;
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
    if (copies.length === 1 && members.some(function (m) { return m.outcome !== "artifact" && m.outcome !== "absence" && m.outcome !== "refusal"; })) return "a one-sided receipt's other member is an absence or a refusal";
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
    var others = composition.members.filter(function (m) { return m.outcome === "absence" || m.outcome === "refusal"; });
    if (others.length !== 1) return null;
    var member = others[0];
    var observer = composition.observers.find(function (o) { return o.id === member.observer; }) || null;
    var block = map(get(map(get(v.bundle, "extensions")), COMPOSED_KIND));
    var raw = seq(get(block, "members")).map(map).find(function (r) { return get(r, "id") === member.id; }) || {};
    if (member.outcome === "refusal") {
      var body = map(get(raw, "refusal"));
      var issued = str(get(body, "issued_at")), reason = str(get(body, "reason"));
      if (issued === null || reason !== "policy_declined" || member.refusal_signature !== "verified") {
        throw new Unavailable("the refusal member " + pyRepr(member.id) + " is not a verified policy_declined refusal");
      }
      return { member: member.id, role: observer ? observer.role : null, window: [issued, issued], kind: "refusal", reason: reason };
    }
    var win = map(get(map(get(raw, "absence")), "window"));
    var start = str(get(win, "from")), end = str(get(win, "to"));
    if (start === null || end === null) throw new Unavailable("the absence member " + pyRepr(member.id) + " carries no window");
    return { member: member.id, role: observer ? observer.role : null, window: [start, end], kind: "absence", reason: null };
  }

  // sides.plain_date: an RFC 3339 timestamp's date, as "Oct 9, 2026".
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function plainDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
    if (m === null || +m[2] < 1 || +m[2] > 12) return value;
    return MONTHS[+m[2] - 1] + " " + +m[3] + ", " + m[1];
  }

  // sides.plain_time: a UTC RFC 3339 instant, as "Oct 9, 2026, 18:00 UTC"; anything else as it is.
  // The reader's own zone is set after drawing (localTimes), where the page has a script.
  function plainTime(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]00:00)$/.exec(value);
    if (m === null || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31 || +m[4] > 23 || +m[5] > 59) return value;
    return MONTHS[+m[2] - 1] + " " + +m[3] + ", " + m[1] + ", " + m[4] + ":" + m[5] + " UTC";
  }

  // "18:56:20 UTC" for a UTC RFC 3339 instant; the value as it is otherwise.
  // With minutesOnly, "18:56 UTC" (a deadline).
  function utcClock(value, minutesOnly) {
    var m = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})(:\d{2})?(?:\.\d+)?(?:Z|[+-]00:00)$/.exec(value);
    if (m === null) return value;
    return m[1] + (minutesOnly ? "" : m[2] || ":00") + " UTC";
  }

  // Each data-time span the drawing made, said in the reader's own time zone.
  function localTimes(root) {
    var Format = typeof Intl !== "undefined" && Intl.DateTimeFormat;
    if (!Format) return;
    var format;
    try { format = new Format(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }); } catch (e) { return; }
    Array.prototype.forEach.call(root.querySelectorAll("[data-time]"), function (node) {
      var date = new Date(node.getAttribute("data-time"));
      if (!isNaN(date.getTime())) node.textContent = format.format(date);
    });
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
        case: missing !== null ? (missing.kind === "refusal" ? "limit" : "one_sided") : twoCopyCase(deal[0], joins),
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
  // On a shared copy (in a report or a page for anyone) a key's
  // "<key>.report" form wins when the pack has one: the reader may not be the
  // owner, so no line says "you" or "your" (Sherlock2, #386, #395;
  // drawCarrier is set by render for one draw).
  function word(key) {
    if (sharedCarrier(drawCarrier) && own(WORDS, key + ".report")) return WORDS[key + ".report"];
    return own(WORDS, key) ? WORDS[key] : null;
  }
  function w(key, values) {
    var template = word(key);
    if (template === null) return "[" + key + "]";
    return template.replace(PLACEHOLDER, function (_, name) {
      if (!values || !own(values, name)) throw new Error("no value for {" + name + "} in " + key);
      return values[name];
    });
  }

  // ---- drawing: one copy (module.py, seller.py) ------------------------------

  // What carries the receipt being drawn, set by render for the length of
  // one synchronous draw: "report" (a report carries it), "page" (a page
  // saved for anyone to check, capsules-plugin#378), or null when it stands
  // alone as the owner's copy.
  var drawCarrier = null;
  // A receipt read by someone other than its owner: a shared copy, with no
  // second person and no prompts for the owner's agent (Sherlock2, #386;
  // "page" differs from "report" only in two lines, capsule-viewer#395).
  function sharedCarrier(carrier) { return carrier === "report" || carrier === "page"; }

  function Drawer(doc, depth, seller) {
    this.d = new Drawing(doc);
    this.kit = new Kit(this.d);
    this.depth = depth;
    this.seller = !!seller;
    this.carrier = drawCarrier;
  }
  var P = Drawer.prototype;

  P.p = function (text, attrs) { return this.d.el("p", attrs, [text]); };
  P.note = function (text, attrs) { return this.d.el("p", Object.assign({ class: "cv-muted" }, attrs || {}), [text]); };
  // module.py's time_el, _timed, _short, _short_id, _fact_value and checked_note.
  P.timeEl = function (at) {
    var shown = plainTime(at);
    return shown !== at ? this.d.el("span", { "data-time": at }, [shown]) : at;
  };
  P.timed = function (key, at, values) {
    var clean = {};
    Object.keys(values || {}).forEach(function (k) { clean[k] = values[k].split(TIME_MARK).join(""); });
    var parts = w(key, Object.assign({ at: TIME_MARK }, clean)).split(TIME_MARK);
    if (parts.length < 2) return parts[0];
    return [parts[0], this.timeEl(at), parts.slice(1).join(TIME_MARK)];
  };
  P.short = function (id) {
    if (id.length <= SHORT_HEAD + SHORT_TAIL + 1) return id;
    return w("record.short", { head: id.slice(0, SHORT_HEAD), tail: id.slice(-SHORT_TAIL) });
  };
  P.shortId = function (id) { return this.d.el("span", { class: "cv-mono", "data-capsule-id": id }, [this.short(id)]); };
  P.factValue = function (f) {
    var d = this.d;
    var worded = f.kind === "token" ? word("value." + f.name + "." + f.value.toLowerCase()) : null;
    if (worded === null) return d.el("dd", { class: "cv-mono", "data-fact": f.name }, [f.value]);
    if (worded.toLowerCase() === f.value.toLowerCase()) return d.el("dd", { "data-fact": f.name, "data-token": f.value }, [worded]);
    return d.el("dd", { "data-fact": f.name, "data-token": f.value }, [worded, " ", d.el("span", { class: "cv-mono cv-muted", "data-code": "true" }, [f.value])]);
  };
  P.checkedNote = function (result) {
    var pill = this.kit.outcome(result.outcome, "cv-verification__outcome cv-pill");
    var ran = result.checks.filter(function (c) { return c.name !== WITNESS_CHECK; });
    var said = function (c) { return VERIFICATION_OUTCOMES[c.outcome][0].toLowerCase(); };
    var tested;
    if (ran.length && ran.every(function (c) { return c.outcome === ran[0].outcome; })) {
      tested = ran.length > 1 ? w("verify.checks_all", { checks: ran.map(function (c) { return c.name; }).join(", "), outcome: said(ran[0]) }) : w("verify.check_one", { name: ran[0].name, outcome: said(ran[0]) });
    } else {
      tested = ran.map(function (c) { return w("verify.check_one", { name: c.name, outcome: said(c) }); }).join(", ");
    }
    // The page's own verifier ran in this browser, so the line says so; an
    // outside verifier's report (capsulectl's), or a page whose check could
    // not run in full here, keeps "did not re-check" (Sherlock2,
    // capsule-viewer#391: never on a can't-check result).
    var here = result.verifier === VERIFIER && result.here === true && tested;
    var text = here ? w("verify.tested_here", { verifier: result.verifier, checks: tested })
      : tested ? w("verify.tested", { verifier: result.verifier, checks: tested }) : w("verify.reported", { verifier: result.verifier });
    return this.d.el("p", { "data-checked": "true" }, [pill, " ", text]);
  };
  P.enumText = function (prefix, value) {
    var text = word(prefix + "." + value);
    if (text !== null) return text;
    return this.d.el("span", { class: "cv-mono", "data-unworded": prefix + "." + value }, [value]);
  };
  // The owner's own copy says PRIVATE when it stands alone. As a shared copy
  // it says so instead, with no do-not-forward line: carried in a report (its
  // panel bears data-receipt-carrier="report", set by the page's runtime) it
  // was shared by the report owner's setting (Sherlock2, ops bc71ecae, #383);
  // saved as a page for anyone (data-receipt-carrier="page") it is the node's
  // own record (#395).
  P.privateBanner = function () {
    if (sharedCarrier(this.carrier)) {
      var shared = this.d.el("span", { class: "cv-badge" }, [w("banner.shared.label")]);
      return this.d.el("p", { "data-banner": "shared" }, [shared, " ", w(this.carrier === "page" ? "banner.page.text" : "banner.shared.text")]);
    }
    var label = this.d.el("span", { class: "cv-badge" }, [w("banner.private.label")]);
    return this.d.el("p", { class: "cv-tone--caution", "data-banner": "private" }, [label, " ", w("banner.private.text")]);
  };
  // module.py's sides, half and missing_half (sides.py has the cases).
  P.sides = function (kase, halves, keep, line) {
    var d = this.d;
    var parts = halves.slice();
    if (line !== false) {
      var key = (kase === "one_sided" || kase === "limit") && (!keep || sharedCarrier(this.carrier)) ? "sides.case." + kase + ".shared" : "sides.case." + kase;
      parts.unshift(d.el("p", { class: "cv-sides__case cv-tone--" + CASE_TONE[kase], "data-case": kase }, [w(key)]));
    }
    return d.el("div", { class: "cv-sides", "data-receipt-case": kase }, parts);
  };
  // module.py's actions: after L1's drilldown, on the holder's own page only.
  // They are prompts for the owner's own agent, so a shared copy (in a report
  // or a page for anyone), read by someone other than the owner, has none
  // (Sherlock2, #386, #395).
  P.actions = function (kase) {
    if (sharedCarrier(this.carrier)) return null;
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
    else if (missing.kind === "refusal") text = w("sides.missing.refusal." + missing.reason, { date: plainDate(missing.window[0]) });
    else text = w("sides.missing.absence", { start: plainDate(missing.window[0]), end: plainDate(missing.window[1]) });
    var label = keep || missing === null || missing.role === null ? w("sides.missing.heading") : missing.role;
    var attrs = missing !== null ? { "data-outcome": missing.kind, "data-party": missing.member } : { "data-outcome": "none" };
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
    // No Amount card when no signed field carries an amount: a deal that
    // records its payment only in prose (a Mesh node's outcome and close) must
    // not show "not present" beside a paid deal, and prose is never parsed
    // into a figure (Sherlock2, capsule-viewer#391).
    var cards = [{ label: w("l0.item"), value: this.part(h.item) }];
    if (h.amount !== "not_present") cards.push({ label: w("l0.amount"), value: this.part(h.amount) });
    cards.push({ label: w("l0.state"), value: state });
    return [dealType, this.kit.metricGrid(cards)];
  };
  P.copyNotes = function (model) {
    var parts = [];
    var aud = model.report.audience;
    if (SHARED_AUDIENCES.indexOf(aud) >= 0) parts.push(this.p(w("shared." + aud, { kinds: model.report.withheld.join(", ") }), { "data-shared": aud }));
    if (model.referee) parts.push(this.p(w("referee.named", { referee: model.referee }), { "data-rung": "referee" }));
    if (model.report.scope) parts.push(this.p(model.report.scope, { "data-sealed-text": "scope" }));
    if (model.counterparty_named) parts = parts.concat(this.counterpartyNamed(model.counterparty_named));
    parts.push(this.p(this.witness(model), { "data-rung": "witness" }));
    // Only a half capsulectl reported as verified is said; any other status,
    // or none, draws no line (a failed half fails the x-deal-v1 entry, which
    // refuses the copy before it is drawn).
    if (model.counterparty_half === "verified") parts.push(this.p(w("counterparty_half.verified"), { "data-rung": "counterparty-half" }));
    if (model.countersign_reported) parts = parts.concat(this.countersignReported(model.countersign_reported));
    else parts.push(this.p(this.countersign(model), { "data-rung": "countersign" }));
    if (model.after_yes) parts.push(this.p(this.afterYes(model, model.after_yes), { "data-rung": "after-yes", "data-after-yes": model.after_yes.state }));
    if (model.settlement) parts.push(this.p(this.settlement(model.settlement), { "data-rung": "settlement", "data-settlement": model.settlement.state }));
    if (testMoney(model)) parts.push(this.p(w("money.test"), { class: "cv-tone--caution", "data-test-money": "true" }));
    return parts;
  };
  // The holder's own copy drawn for the holder: neither a shared copy nor a
  // page or report shown to others. Its lines may say "your".
  P.ownPage = function (model) { return model.report.audience === "keep" && !sharedCarrier(this.carrier); };
  P.witness = function (model) {
    // capsulectl's report of the holder's own book (x-deal-v1 keep page,
    // amended u203): said in its voice, only as reported.
    // Only on the holder's own copy drawn for the holder: a shared copy, or a
    // page shown to others, never shows the holder's witness time.
    var book = this.ownPage(model) ? model.book_witnessed : null;
    if (book) {
      // One line: the reader's local time, with UTC beside it (a short zone
      // name such as CST is ambiguous), and the file's own fact (#424).
      if (book.status === "verified") return this.timed("rung.book_witnessed", book.at, { witness: book.witness, utc: utcClock(book.at) });
      return w(book.status === "failed" ? "rung.book_witness_failed" : "rung.book_witness_withheld");
    }
    if (model.witnessed === "pass") return w("rung.witness_verified");
    if (model.witnessed === "fail") return w("rung.witness_failed");
    if (model.witnessed === "withheld") return w("rung.unwitnessed");
    return w("rung.unreported");
  };
  // Who the deal was with and their words accepting (counterpartyOf): only
  // what recomputed here is shown; anything else is said to be not shown.
  P.counterpartyNamed = function (named) {
    var self = this;
    var out = [];
    if (named.who !== null) out.push(this.p(w("counterparty.with", { who: named.who }), { "data-rung": "counterparty", "data-counterparty": "checked" }));
    if (named.unchecked) out.push(this.p(w("counterparty.unchecked"), { class: "cv-tone--caution", "data-rung": "counterparty", "data-counterparty": "unchecked" }));
    named.accepted.forEach(function (a) {
      if (a.text !== null) out.push(self.p(w("accepted.words", { text: a.text }), { "data-rung": "accepted", "data-accepted": a.step }));
      else out.push(self.p(w("accepted.unchecked"), { class: "cv-tone--caution", "data-rung": "accepted", "data-accepted": "unchecked" }));
    });
    return out;
  };
  // Whether each act came after the holder's yes (afterYesModel), then how
  // each was approved, as recorded. The holder's own copy, drawn for them,
  // says "your"; any other copy, or a page for others, names the holder.
  P.afterYes = function (model, yes) {
    var side = model.report.audience === "keep" && !sharedCarrier(this.carrier) ? "own" : "shared";
    var who = w("after_yes.who." + side), their = w("after_yes.their." + side), giver = w("after_yes.giver." + side);
    var act = function () {
      var step = stepIn(model, yes.act.step);
      if (step !== null && step.line) return "“" + step.line + "”";
      return yes.act.action !== null ? w("after_yes.act.named", { action: yes.act.action }) : w("after_yes.act.unnamed");
    };
    var text;
    if (yes.state === "failed") text = w("after_yes.failed." + yes.why, { who: who, act: act() });
    else if (yes.state === "missing") text = w("after_yes.missing", { who: who, act: act() });
    else text = w("after_yes." + yes.state, { who: who });
    var said = yes.approvers.map(function (a) { return w("after_yes.approver." + a, { who: who, their: their, giver: giver }); });
    return said.length ? text + w("after_yes.approvers", { list: said.join("; ") }) : text;
  };
  // The settlement line (settlementOf): its rail and proof, then the size band when there is one.
  P.settlement = function (line) {
    if (line.state === "missing") {
      return line.rail === "card" ? w("settlement.card") : w("settlement.missing", { rail: line.rail.replace(/_/g, " ") });
    }
    var text = w(["x402", "other"].indexOf(line.state) >= 0 ? "settlement." + line.state : "settlement.lightning." + line.state);
    return line.band ? text + w("settlement.size", { band: bandLabel(line.band) }) : text;
  };
  P.countersign = function (model) {
    // A two-sided copy is not unsigned by the other party: its half is above.
    if (!model.countersignatures.length) return w(model.counterparty_half === "verified" ? "countersign.none.two_sided" : "countersign.none");
    return w("countersign.some", { statuses: model.countersignatures.join(", ") });
  };
  // Line 9 (capsule-viewer#383): the countersign rung capsulectl verify
  // resolved against the directory it was given, one line per
  // countersignature, in capsulectl's voice, never the page's. A
  // self-countersignature is flagged.
  P.countersignReported = function (rung) {
    var self = this;
    return rung.entries.map(function (e) {
      var text;
      if (e.state === "resolved") {
        var checks = e.checks.map(function (c) { return c.name + ": " + c.result; }).join(", ");
        text = w("countersign.reported.resolved", { name: e.signer_name, directory: rung.directory, checks: checks ? w("countersign.reported.checks", { checks: checks }) : "" });
      } else if (e.state === "unresolved_signer") {
        text = w("countersign.reported.unresolved_signer", { directory: rung.directory, key: e.key_id.length > 16 ? e.key_id.slice(0, 16) + "…" : e.key_id });
      } else {
        text = w("countersign.reported." + e.state);
      }
      if (e.receipt !== null && e.state !== "not_independent" && e.state !== "unverified") text += w("countersign.reported.receipt." + e.receipt);
      var attrs = { "data-rung": "countersign", "data-countersign": e.state };
      if (e.state === "not_independent") attrs["class"] = "cv-tone--caution";
      return self.p(text, attrs);
    });
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
  P.step = function (step, testMoneyOnly) {
    var d = this.d, self = this;
    var label = step.n !== null && step.at ? this.timed("step.position", step.at, { n: String(step.n) }) : w("step.unnumbered");
    var parts = [this.kit.evidenceDetails([{ label: label, disclosure: step.disclosure, digest: step.capsule_id, media_type: "", note: this.logText(step.log) }])];
    if (step.line) parts.push(this.p(w("step.line", { text: step.line }), { "data-sealed-text": "step-line" }));
    if (step.disclosure === "disclosed") {
      var list = step.facts.filter(function (f) { return !(testMoneyOnly && isRail(f)); }).map(function (f) {
        return [d.el("dt", {}, [self.factLabel(f.name)]), self.factValue(f)];
      });
      if (step.record_type) list.unshift([d.el("dt", {}, [w("step.type")]), d.el("dd", { class: "cv-mono", "data-fact": "record_type" }, [step.record_type])]);
      parts.push(d.el("dl", { "data-facts": "true" }, list));
    }
    var attrs = { "data-record": step.capsule_id, "data-disclosure": step.disclosure };
    if (step.log) attrs["data-log"] = step.log.log_id + ":" + step.log.seq + ":" + step.log.leaf_index;
    return d.el("div", attrs, parts);
  };
  P.steps = function (model, ids) {
    var d = this.d, kit = this.kit, self = this;
    return d.el("ol", {}, ids.map(function (cid) {
      var step = stepIn(model, cid);
      if (step === null) return d.el("li", {}, [kit.disclosureBadge("not_present"), " ", d.el("span", { class: "cv-mono" }, [cid])]);
      var line = step.line || "";
      var at = step.at ? [self.timeEl(step.at), " · "] : "";
      return d.el("li", { "data-step": cid }, [kit.disclosureBadge(step.disclosure), " ", d.el("span", {}, [at, line])]);
    }));
  };
  P.item = function (model, it, prefix) {
    var text = it.at ? [prefix || "", this.timeEl(it.at), " · ", it.text] : [prefix || "", it.text];
    if (it.flagged) text = ["⚠️ ", text];
    if (!it.steps.length) return this.p(text, { "data-sealed-text": "item" });
    return this.d.el("div", { "data-item": "true" }, [
      this.p(text, { "data-sealed-text": "item" }),
      this.kit.section(w("steps.summary"), [this.steps(model, it.steps)], 4),
    ]);
  };
  // The sealed report's authority blocks (authorityOf), as sealed text: each
  // act and the layers it relied on, an act they did not cover flagged.
  P.authoritySealed = function (model, authority) {
    var self = this, kit = this.kit;
    var body = [this.note(w("authority.sealed"))];
    if (authority.order !== null) body.push(this.note(authority.order, { "data-sealed-text": "authority-order" }));
    authority.blocks.forEach(function (b) {
      var layers = b.layers.map(function (l) {
        var line = self.item(model, item(l.text, l.step !== null ? [l.step] : [], l.at, !b.covered && l.layer === "action"));
        if (l.note === null) return line;
        return [line, self.note(l.note, { "data-sealed-text": "authority-note" })];
      });
      var head = b.covered ? [] : [self.p(w("authority.uncovered"), { class: "cv-tone--caution", "data-authority-uncovered": b.step || "" })];
      var block = kit.section(b.covered ? b.action : "⚠️ " + b.action, head.concat(layers), 3);
      block.setAttribute("data-authority-block", b.covered ? "covered" : "uncovered");
      body.push(block);
    });
    var section = kit.section(w("section.authority"), body);
    section.setAttribute("data-authority", "sealed");
    return section;
  };
  P.sectionSteps = function (model, section) {
    var self = this;
    var testMoneyOnly = testMoney(model);
    return model.steps.filter(function (s) { return s.section === section; }).map(function (s) { return self.step(s, testMoneyOnly); });
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

  // Who wrote the sealed text, as the records say: the one producer every
  // disclosed step names, else "the producer"; a report carried outside the
  // log has no record of its own to say (module.py _producer).
  P.producer = function (model) {
    var ns = model.producer_names;
    return model.report_checked === null && ns.length === 1 && ns[0] !== null ? ns[0] : w("provenance.the_producer");
  };

  // How the report was sealed. A report carried outside the log is described
  // by what checked it and nothing more: capsulectl verify's report
  // (module.py), or this page's own check (#398), which names what it
  // checked (summary.standalone.here).
  P.sealedNote = function (model) {
    if (model.report_checked === null) return this.note(w("summary.sealed", { producer: this.producer(model) }), { "data-sealed": "x-deal-v0" });
    if (model.report_checked_here === true && model.report_checked === "pass") return this.note(w("summary.standalone.here"), { "data-sealed": "x-deal-report", "data-checked-here": "true" });
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
    if (model.authority_sealed) out.push(this.authoritySealed(model, model.authority_sealed));
    out = out.concat(this.journey(model));
    out.push(kit.section(w("section.proposed"), this.sectionSteps(model, "proposed")));
    out.push(kit.section(w("section.approved"), this.sectionSteps(model, "approved")));
    out.push(kit.section(w("section.merchant"), this.merchant(model)));

    var acted = [this.note(w("summary.lines", { producer: this.producer(model) }))];
    var did = r.did.map(function (i) { return self.item(model, i); });
    acted = acted.concat(did.length ? did : [this.note(w("acted.nothing"))]);
    if (r.money) acted.push(this.p(r.money, { "data-sealed-text": "money" }));
    acted = acted.concat(this.sectionSteps(model, "acted"));
    if (r.did_line) acted.push(this.note(r.did_line, { "data-sealed-text": "did-line" }));
    out.push(kit.section(w("section.acted"), acted));

    if (r.lifecycle) {
      var life = [this.p(r.lifecycle, { "data-sealed-text": "lifecycle" })];
      r.later.forEach(function (i) {
        life.push(self.item(model, item(self.timed("lifecycle.later", i.at || "", { text: i.text }), i.steps)));
      });
      if (r.may_change && r.as_of) life.push(this.note(this.timed("lifecycle.as_of", r.as_of, { text: r.may_change }), { "data-sealed-text": "may-change" }));
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

    if (!r.agent_anomalies.length && !r.counterparty_anomalies.length) {
      // One "none", not one per side: nothing is hidden by joining them.
      out.push(kit.section(w("section.anomalies"), [this.note(w("anomalies.none"))]));
    } else {
      var anomalies = [["agent", r.agent_anomalies], ["counterparty", r.counterparty_anomalies]].map(function (pair) {
        var body = pair[1].map(function (i) { return self.item(model, i); });
        return kit.section(w("anomalies." + pair[0]), body.length ? body : [self.note(w("anomalies.none"))], 3);
      });
      out.push(kit.section(w("section.anomalies"), anomalies));
    }

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
    var out = [this.note(w("merchant.intro", { producer: this.producer(model) }))];
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
      return [position, s.record_type || w("records.unknown"), kit.disclosureBadge(s.disclosure), self.logText(s.log), self.shortId(s.capsule_id)];
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
    var payment = d.el("p", { "data-seller-line": "payment" }, [w("seller.l0.payment"), ": ", this.sellerPayment(model.receipt.settlement)]);
    var handover = d.el("p", { "data-seller-line": "handover" }, [
      w("seller.l0.handover"), ": ", d.el("span", { "data-handover": model.handover.state }, [this.handoverText(model.handover)]),
    ]);
    return [grid, payment, handover];
  };
  // The seller headline's payment value: "not recorded in this copy" unless
  // the copy's settlement line rests on a settled leg (settlementOf), whose
  // state it then follows.
  P.sellerPayment = function (line) {
    return settledLine(line) ? w("seller.payment.settled." + line.state) : w("seller.payment.not_recorded");
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
    if (r.authority_sealed) out.push(this.authoritySealed(r, r.authority_sealed));
    out = out.concat(this.journey(r));

    var toldList = r.statements.map(function (c) { return self.committed(c, "statement"); });
    out.push(kit.section(w(this.audienceKey("seller.section.represented", model)), [
      toldList.length ? toldList : [this.note(w("seller.represented.none"))], this.sectionSteps(r, "statements"),
    ]));

    out.push(kit.section(w("seller.section.offers"), [this.offers(model), this.sectionSteps(r, "proposed")]));
    out.push(kit.section(w(this.audienceKey("seller.section.accepted", model)), [this.acceptances(model), this.sectionSteps(r, "approved")]));

    var payment = [this.note(w(settledLine(r.settlement) ? "seller.payment.recorded" : "seller.payment.none"), { "data-seller": "payment" })];
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
      [w("seller.leg.payment"), w(settledLine(model.receipt.settlement) ? "seller.leg.recorded" : "seller.leg.none")],
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

  // The deal's id after the card's title, as capsulectl's deal view named it
  // (capsule-viewer#383, line 8): the sealed report's deal_id, none when it
  // names none.
  P.dealId = function (model) {
    return model.deal_id ? [this.d.el("span", { "data-deal-id": model.deal_id }, [w("title.deal", { deal: model.deal_id })])] : [];
  };

  // The three levels of one page: L0 always shown, L1 and L2 one toggle each.
  P.page = function (l0, l1Summary, l1, l1Open, l2, l2Open, after, l2Summary) {
    var d = this.d;
    return [
      d.el("div", { "data-level": "L0" }, l0),
      d.el("div", { "data-level": "L1" }, [this.kit.drilldown(l1Summary, l1, l1Open)].concat(after ? [after] : [])),
      d.el("div", { "data-level": "L2" }, [this.kit.drilldown(l2Summary || w("depth.l2"), l2, l2Open)]),
    ];
  };

  function drawUnilateral(doc, depth, model) {
    var dr = new Drawer(doc, depth, false);
    var levels = dr.levels(model);
    var l0 = [];
    if (model.demo) l0.push(dr.d.el("p", { "data-demo": "true" }, [w("badge.demo")]));
    l0.push(dr.d.el("h2", {}, [w("page.title")].concat(dr.dealId(model))));
    l0.push(dr.checkedNote(model.verification));
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
    l0.push(dr.d.el("h2", {}, [w("seller.title")].concat(dr.dealId(model.receipt))));
    l0.push(dr.checkedNote(model.receipt.verification));
    var keep = model.receipt.report.audience === "keep";
    if (keep) l0.push(dr.privateBanner());
    l0 = l0.concat([levels.headline], levels.notes);
    if (keep) l0.push(dr.sides("none", [dr.missingHalf(null, true)], true, false));
    return dr.page(l0, w("seller.depth.l1"), levels.l1, levels.l1_open, levels.l2, levels.l2_open, keep ? dr.actions("none") : null);
  }

  // ---- drawing: the v1 deal receipt -----------------------------------------

  P.token = function (prefix, value) {
    var text = word(prefix + "." + value);
    return text !== null ? text : value;
  };
  P.dealState = function (model) {
    var d = this.d;
    var parts = [this.token("deal.state", model.start.state)];
    // The deal-level line is the start state, then "settled" or nothing: no close, no done (section 9).
    if (model.start.state === "started" && model.settled) parts.push(" · ", d.el("span", { "data-settled": "true" }, [w("deal.settled")]));
    var line = d.el("span", { "data-deal-state": model.start.state }, parts);
    // A started deal not yet settled also says where its terms stand, as the rows below give them, so
    // the value never reads behind the terms ("Started" beside two terms met, #430). It counts the
    // statuses shown, beside the deal-level line and outside it: it is not a deal state and claims no close.
    if (model.start.state === "started" && !model.settled && model.rows_state === "listed" && model.rows.length) {
      return [line, " · ", d.el("span", { "data-deal-terms": "true" }, [this.termsTally(model.rows)])];
    }
    return line;
  };
  // "Terms: Both say the same so far (2 of 2)": each status the rows give, in the rows' order, with its count.
  P.termsTally = function (rows) {
    var self = this, order = [], counts = {};
    rows.forEach(function (row) {
      if (!own(counts, row.status)) { order.push(row.status); counts[row.status] = 0; }
      counts[row.status] += 1;
    });
    var total = String(rows.length);
    return w("deal.state.terms", { tally: order.map(function (status) {
      return w("deal.state.terms.count", { status: self.token("deal.status", status), count: String(counts[status]), total: total });
    }).join("; ") });
  };
  // A term by its name in words (#429). The page holds no terms pack (section 9, "Row text"), so the
  // wording pack words the profile's known term ids, as a stand-in (Sherlock2, #437): once a deal
  // terms pack carries term text, the pack's name wins over these. Any other id is shown as it is. The id stays on
  // the element. A name or a side breaks between words, never inside one (receipt.css).
  P.termName = function (id) {
    var text = word("deal.term." + id);
    if (text === null) return this.d.el("span", { class: "cv-mono", "data-row-id": id }, [id]);
    return this.d.el("span", { class: "cv-receipt-word", "data-row-id": id, title: id }, [text]);
  };
  P.sideWord = function (side) { return this.d.el("span", { class: "cv-receipt-word", "data-side": side }, [this.token("deal.side", side)]); };
  P.dealHeadline = function (model) {
    var d = this.d;
    var out = [this.kit.metricGrid([{ label: w("l0.state"), value: this.dealState(model) }])];
    if (model.start.by !== null) out.push(this.note(w("deal.start.by", { by: this.token("deal.start.by", model.start.by) }), { "data-start-by": model.start.by }));
    if (model.start.local) out.push(this.note(w("deal.local"), { "data-local": "start" }));
    if (model.rows_state !== "listed") out.push(this.note(w("deal.rows." + model.rows_state), { "data-rows-state": model.rows_state }));
    // Times in the reader's own zone where the page has a script (#423); the data keeps UTC.
    var asOf = !model.as_of ? w("deal.as_of", { at: w("deal.no_time") }) : validUtcTime(model.as_of) ? this.timed("deal.as_of", model.as_of) : w("deal.as_of", { at: model.as_of });
    out.push(this.note(asOf, { "data-as-of": model.as_of }));
    return d.el("div", { "data-headline": "true" }, out);
  };
  // A full UTC instant becomes a data-time span (the reader's own zone); a
  // date-only value is shown as stored, since converting it would move the day.
  // A deadline also says its UTC time beside the local one, since a short
  // zone name is ambiguous (Sherlock2, #423).
  P.dateText = function (value) {
    if (value === "not_set") return w("deal.date.not_set");
    if (!validUtcTime(value)) return value;
    return this.d.el("span", {}, [this.timeEl(value), " (" + utcClock(value, true) + ")"]);
  };
  // An x-deal-v1 time: the reader's zone for a real UTC instant, else as stored.
  P.v1Time = function (value) { return validUtcTime(value) ? this.timeEl(value) : value; };
  P.rowDetail = function (row) {
    var bits = [];
    // A ruled term shows the ruling's value, not a statement value: a statement's value is not the ruling's.
    if (row.value !== null && row.status !== "ruled") bits.push(w("deal.row.value", { value: this.token("deal.value", row.value) }));
    if (row.remedy !== null) bits.push(w("deal.row.remedy", { remedy: this.token("deal.remedy", row.remedy) }));
    if (row.remedy === "not_counted" && row.remedy_made) bits.push(w("deal.row.remedy_made"));
    if (row.ruling !== null) {
      var value = this.token("deal.value", row.ruling.value);
      // `against` is buyer, seller or null (anything else declined the report); null: the ruling alone.
      bits.push(row.ruling.against !== null ? w("deal.row.ruling", { value: value, side: this.token("deal.side", row.ruling.against) }) : w("deal.row.ruling.bare", { value: value }));
    }
    bits.push(w("deal.row.check", { check: this.token("deal.check", row.check) }));
    if (row.local) bits.push(w("deal.local"));
    return bits.join("; ");
  };
  P.dealRows = function (model) {
    var d = this.d, self = this;
    if (model.rows_state !== "listed") return [this.note(w("deal.rows." + model.rows_state), { "data-rows-state": model.rows_state })];
    if (!model.rows.length) return [this.note(w("deal.rows.none"), { "data-rows-state": "listed" })];
    var rows = model.rows.map(function (row) {
      return [
        self.termName(row.id),
        self.sideWord(row.owed_by),
        d.el("span", { "data-row-status": row.status }, [self.token("deal.status", row.status)]),
        self.dateText(row.due),
        self.dateText(row.window_end),
        self.rowDetail(row),
      ];
    });
    return [this.kit.dataTable([w("deal.col.row"), w("deal.col.owed_by"), w("deal.col.status"), w("deal.col.due"), w("deal.col.window_end"), w("deal.col.detail")], rows),
      this.note(w("deal.rows.note"))];
  };
  // The payment legs the rows relied on, each as its record states it (evidencebook#588). No leg is picked
  // and no verdict is drawn from one: the check above stays the only verdict.
  P.dealLegs = function (model) {
    var d = this.d, self = this;
    var withheld = model.rows_state === "withheld";
    if (!withheld && (model.rows_state !== "listed" || !model.rows.length)) return [];
    var rows = [];
    function cells(leg, lead) {
      return lead.concat([
        leg.leg,
        leg.status,
        leg.money.length ? leg.money.map(function (m) { return m[0] + " " + m[1]; }).join("; ") : "-",
        // A record's time only on the holder's own page (Sherlock2, u239).
        leg.observed_at !== null && self.ownPage(model) ? self.v1Time(leg.observed_at) : w("deal.no_time"),
        leg.payment_ref !== null ? leg.payment_ref.type + " " + leg.payment_ref.value : "-",
        d.el("span", { class: "cv-mono", "data-leg-record": leg.record }, [leg.record]),
      ]);
    }
    var head = [w(withheld ? "deal.col.sealer" : "deal.col.leg_side"), w("deal.col.leg"), w("deal.col.leg_status"), w("deal.col.amount"), w("deal.col.observed"), w("deal.col.payment_ref"), w("deal.col.record")];
    if (withheld) {
      // The rows are withheld, so no record is tied to a term: the side is the settlement's own sealer_role.
      model.withheld_legs.forEach(function (leg) { rows.push(cells(leg, [leg.sealer_role !== null ? leg.sealer_role : "-"])); });
    } else {
      head.unshift(w("deal.col.row"));
      model.rows.forEach(function (row) {
        row.legs.forEach(function (leg) {
          rows.push(cells(leg, [self.termName(row.id), self.sideWord(leg.side)]));
        });
      });
    }
    var inner = rows.length
      ? [this.kit.dataTable(head, rows), this.note(w(withheld ? "deal.legs.note.withheld" : "deal.legs.note"), { "data-legs": withheld ? "withheld" : "listed" })]
      : [this.note(w(withheld ? "deal.legs.none.withheld" : "deal.legs.none"), { "data-legs": "none" })];
    var why = !rows.length && !withheld ? legsWhy(model.rows) : null;
    // One line about the records the terms rest on together, never about each term.
    if (why !== null) inner.push(this.note(w("deal.legs.why." + why), { "data-legs-why": why }));
    return [this.kit.section(w("deal.section.legs"), inner)];
  };
  // Why no payment record is shown on a copy that lists its terms (#432), from what the records the
  // terms rest on are, taken together: none at all, only the sides' statements, statements and other
  // deal records, or only other deal records. It says what the copy carries, not whether a payment
  // was made, and nothing of any one term. A settle record that carries no settlement member to show
  // gets no line: "not a payment record" would not be true of it.
  function legsWhy(rows) {
    var types = [];
    rows.forEach(function (row) { row.relied_on.forEach(function (e) { types.push(e.record_type); }); });
    if (!types.length) return "no_records";
    if (types.indexOf("settle") >= 0) return null;
    var statements = types.filter(function (t) { return t === "statement"; }).length;
    return statements === types.length ? "statements" : statements ? "mixed" : "other";
  }
  P.dealL1 = function (model) {
    return [
      this.note(w("summary.standalone", { status: model.report_checked === null ? "-" : model.report_checked }), { "data-sealed": "x-deal-report" }),
      this.note(w("deal.report.scope")),
      this.kit.section(w("deal.section.rows"), this.dealRows(model)),
    ].concat(this.dealLegs(model));
  };
  P.dealL2 = function (model) {
    var d = this.d, kit = this.kit, self = this;
    var out = [kit.verificationDetails(model.verification)];
    if (model.bundle_digest) {
      out.push(d.el("p", {}, [w("l2.bundle_digest"), " ", d.el("span", { class: "cv-mono", "data-bundle-digest": "true" }, [model.bundle_digest])]));
    }
    // Each record's time and named-witness flag are the holder's own report's (VerifyReport checks only
    // that a record is witnessed exactly when it has a time). Only the holder's own page shows them; a
    // counterparty's or adjudicator's copy, or a page shown to others, lists the records without them
    // (Sherlock2, u239). This table is the only place a relied_on time is drawn.
    var witnessColumns = this.ownPage(model);
    // The yes says whose word it is (#424): this page checked no witness receipt. The pack's bare
    // "deal.named_witness.yes" stays as the frozen pack has it (packAddsOnly).
    var yes = w("deal.named_witness.report.own");
    var basis = [];
    model.rows.forEach(function (row) {
      row.relied_on.forEach(function (e) {
        var cells = [self.termName(row.id), d.el("span", { class: "cv-mono" }, [e.record]), self.sideWord(e.side)];
        // The time in the reader's zone, as the header's (#431).
        if (witnessColumns) cells.push(e.time !== null ? self.v1Time(e.time) : w("deal.no_time"),
          d.el("span", { "data-named-witness": e.named_witness ? "yes" : "no" }, [e.named_witness ? yes : w("deal.named_witness.no")]));
        basis.push(cells);
      });
    });
    var head = [w("deal.col.row"), w("deal.col.record"), w("deal.col.side")];
    if (witnessColumns) head.push(w("deal.col.time"), w("deal.col.named_witness"));
    var inner = basis.length
      ? [kit.dataTable(head, basis)]
      : [this.note(w("deal.basis.none"))];
    out.push(kit.section(w("deal.section.basis"), inner, 3));
    var rest = [];
    if (model.pack_digest) rest.push(this.note(w("deal.pack_digest"), { "data-pack": "true" }), d.el("p", { class: "cv-mono" }, [model.pack_digest]));
    var r = model.rests_on;
    if (r.own_size !== null) rest.push(this.note(w("deal.rests.own", { size: String(r.own_size) })));
    if (r.counterparty !== null) {
      rest.push(this.note(w("deal.rests.counterparty", { counted: r.counterparty.counted === null ? "-" : String(r.counterparty.counted) })));
      if (r.counterparty.fork_at) rest.push(this.note(w("deal.rests.fork", { at: String(r.counterparty.fork_at) })));
    }
    if (r.counterparty_layer !== null) rest.push(this.note(w(r.counterparty_layer ? "deal.rests.layer" : "deal.rests.no_layer")));
    if (r.witnesses !== null) rest.push(this.note(w("deal.rests.witnesses", { count: String(r.witnesses) })));
    rest.push(this.note(w("wording.provenance", { id: PACK.id, sha: PACK.sha256 || "-" })));
    out.push(kit.section(w("deal.section.rests"), rest, 3));
    return out;
  };

  // ---- drawing: the v1 receipt's top surface (#382, Steven's design) ----------
  //
  // L0 is the design: header and tags, the top line with the seal, the cards, the stamps, the steps,
  // the proof panel, what this does not prove, what else is here, the footer. L1 ("For checkers") is
  // every sealed record and the terms; L2 ("Technical details") is the ladder of rungs, the records
  // each term rests on, what the report rests on and the checks, as the page drew them before. Every
  // line says only what the copy holds or capsulectl reported: a field the copy does not carry (the
  // item, the seller's name, a simulated rail) is left out, never filled in.

  // The harbour seal (Steven's design, two of its three moods: a v1 receipt never shows "Waiting for
  // you"). Decorative: the mood is always also said in words beside it.
  var SVG_NS = "http://www.w3.org/2000/svg";
  var SEAL_BODY = [
    ["path", { d: "M22 106 C18 70 34 44 60 42 C86 44 102 70 98 106 Z", fill: "#7F96A8" }],
    ["ellipse", { cx: "60", cy: "88", rx: "24", ry: "19", fill: "#C9D5DE" }],
    ["circle", { cx: "60", cy: "40", r: "26", fill: "#8FA5B6" }],
  ];
  var SEAL_MOODS = {
    done: [
      ["circle", { cx: "50", cy: "37", r: "3.6", fill: "#13202B" }], ["circle", { cx: "70", cy: "37", r: "3.6", fill: "#13202B" }],
      ["circle", { cx: "43", cy: "46", r: "3.4", fill: "#E8A3A3", opacity: "0.7" }], ["circle", { cx: "77", cy: "46", r: "3.4", fill: "#E8A3A3", opacity: "0.7" }],
      ["ellipse", { cx: "60", cy: "48", rx: "9", ry: "6", fill: "#C9D5DE" }],
      ["ellipse", { cx: "60", cy: "45.5", rx: "3.2", ry: "2.2", fill: "#13202B" }],
      ["path", { d: "M57 50 Q60 53 63 50", stroke: "#13202B", "stroke-width": "1.6", fill: "none", "stroke-linecap": "round" }],
      ["path", { d: "M76 76 Q92 70 95 82 Q88 86 79 82 Z", fill: "#6E8597" }],
      ["circle", { cx: "96", cy: "78", r: "14", fill: "#C2412D" }],
      ["path", { d: "M90.5 78.5 L94.5 82.5 L101.5 74.5", stroke: "#FFFFFF", "stroke-width": "2.6", fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }],
    ],
    not_as_agreed: [
      ["path", { d: "M45 31 L54 34 M75 31 L66 34", stroke: "#13202B", "stroke-width": "1.8", "stroke-linecap": "round" }],
      ["circle", { cx: "50", cy: "39", r: "3.4", fill: "#13202B" }], ["circle", { cx: "70", cy: "39", r: "3.4", fill: "#13202B" }],
      ["ellipse", { cx: "60", cy: "49", rx: "9", ry: "6", fill: "#C9D5DE" }],
      ["ellipse", { cx: "60", cy: "46.5", rx: "3.2", ry: "2.2", fill: "#13202B" }],
      ["path", { d: "M56.5 53 Q60 50.5 63.5 53", stroke: "#13202B", "stroke-width": "1.6", fill: "none", "stroke-linecap": "round" }],
      ["path", { d: "M76 76 Q92 70 95 82 Q88 86 79 82 Z", fill: "#6E8597" }],
      ["circle", { cx: "96", cy: "78", r: "14", fill: "#D97A1E" }],
      ["path", { d: "M96 71 L96 79", stroke: "#FFFFFF", "stroke-width": "2.8", "stroke-linecap": "round" }],
      ["circle", { cx: "96", cy: "84.5", r: "1.7", fill: "#FFFFFF" }],
    ],
  };
  P.seal = function (mood) {
    var doc = this.d.doc;
    var svg = doc.createElementNS(SVG_NS, "svg");
    [["viewBox", "0 0 120 120"], ["width", "72"], ["height", "72"], ["aria-hidden", "true"], ["focusable", "false"], ["class", "cv-rcpt-seal"], ["data-seal", mood]]
      .forEach(function (a) { svg.setAttribute(a[0], a[1]); });
    SEAL_BODY.concat(SEAL_MOODS[mood]).forEach(function (shape) {
      var node = doc.createElementNS(SVG_NS, shape[0]);
      Object.keys(shape[1]).forEach(function (k) { node.setAttribute(k, shape[1][k]); });
      svg.appendChild(node);
    });
    return svg;
  };

  // The holder's own payment: the payer's leg on a buyer's copy, the payee's on a seller's. A page cannot
  // weigh a payment's superseded or refused legs as capsulectl does (evidencebook payment.go), so it picks
  // one only when one applies: the legs the payment term relies on when the report names any, else the
  // holder's own legs in the copy, refunds aside. Several, or none: null, and the page names no amount.
  function ownLegs(model) {
    var want = model.role === "seller" ? "payee" : "payer";
    var mine = function (leg) { return leg.leg.indexOf(want) === 0; };
    var relied = [];
    if (model.rows_state === "listed") model.rows.forEach(function (r) { seq(r.legs).forEach(function (l) { if (mine(l) && relied.indexOf(l.record) < 0) relied.push(l.record); }); });
    return model.sealed_steps.filter(function (s) {
      return s.leg !== null && !s.refund && mine(s.leg) && (!relied.length || relied.indexOf(s.record) >= 0);
    });
  }
  function ownLeg(model) {
    var legs = ownLegs(model);
    return legs.length === 1 ? legs[0].leg : null;
  }
  function paidLeg(model) {
    var leg = ownLeg(model);
    return leg !== null && leg.status === "settled" ? leg : null;
  }
  // The seal's mood and the top line, from the report's own facts (Sherlock2, 2026-11-26, buzz
  // 368bf508 and 12969602; the seal's meaning awaits Steven's ruling):
  // * done: settled, every term "both say the same" with value met, and the holder's settle record held;
  // * not_as_agreed: a term has a final ruling of not met;
  // * no seal otherwise, and a top line in words. "Waiting for you" is never a receipt's.
  function dealVerdict(model) {
    var rows = model.rows_state === "listed" ? model.rows : [];
    var ruled = rows.find(function (r) { return r.status === "ruled" && r.ruling !== null && r.ruling.value === "not_met"; });
    if (ruled) return { mood: "not_as_agreed", line: "ruled_not_met", term: ruled.id, remedy: ruled.remedy };
    if (model.start.state !== "started") return { mood: null, line: "state." + model.start.state };
    var leg = paidLeg(model);
    if (model.settled) {
      var conceded = rows.find(function (r) { return r.value === "not_met" && r.remedy_made; });
      if (conceded) return { mood: null, line: "remedied", term: conceded.id };
      if (rows.length && rows.every(function (r) { return r.status === "not_reached"; })) return { mood: null, line: "none_due" };
      var agreed = rows.length > 0 && rows.every(function (r) { return r.status === "agreed" && r.value === "met"; });
      return { mood: agreed && leg !== null ? "done" : null, line: "settled" };
    }
    if (rows.some(function (r) { return r.status === "in_dispute"; })) return { mood: null, line: "in_dispute" };
    if (rows.some(function (r) { return r.status === "in_disagreement"; })) return { mood: null, line: "in_disagreement" };
    if (rows.length && rows.every(function (r) { return r.status === "waiting"; })) return { mood: null, line: leg !== null ? "paid_waiting" : "waiting" };
    // One status every term shares, said in plain words; mixed statuses are counted (termsTally).
    var only = rows.length && rows.every(function (r) { return r.status === rows[0].status; }) ? rows[0].status : null;
    if (only !== null && own(WORDS, "deal.top.all." + only)) return { mood: null, line: "all." + only };
    return { mood: null, line: "terms" };
  }
  // A key's form for this copy: the seller's when the copy is a seller's, and the third person's
  // (".report") when the reader is not the holder on their own page (a counterparty's or adjudicator's
  // copy, or a page or report shown to others), so no line says "your" to someone it is not about.
  P.say = function (model, key, values) {
    var forms = [];
    if (!this.ownPage(model)) {
      if (model.role === "seller") forms.push(key + ".seller.report");
      forms.push(key + ".report");
    }
    if (model.role === "seller") forms.push(key + ".seller");
    forms.push(key);
    var chosen = forms.find(function (k) { return own(WORDS, k); });
    return w(chosen || key, values);
  };

  // A key that names the other side: its neutral form (".report", "the other side's") when the copy's own
  // agreement does not say which side the holder is, since a verified half shows only that it is the
  // other party's, not its role; else as say() picks it.
  P.sideSay = function (model, key, values) {
    return model.role === null ? w(key + ".report", values) : this.say(model, key, values);
  };

  // A money member as a reader says it: BTC at scale 11 (or less) is counted in msat, with sats above
  // when it is whole sats; anything else as recorded (legAmount).
  function moneyOf(a) {
    var value = str(get(a, "value")), code = str(get(a, "assetCode")), scale = int(get(a, "assetScale"));
    if (code === "BTC" && value !== null && /^\d+$/.test(value) && scale !== null && scale >= 0 && scale <= 11) {
      var msat = Number(value) * Math.pow(10, 11 - scale);
      if (Number.isSafeInteger(msat)) {
        var main = groupThousands(msat) + " msat";
        return msat % 1000 === 0 && msat > 0 ? { main: groupThousands(msat / 1000) + (msat === 1000 ? " sat" : " sats"), sub: main } : { main: main, sub: null };
      }
    }
    return { main: legAmount(a), sub: null };
  }
  P.surfaceHeader = function (model) {
    var d = this.d;
    var tags = [d.el("span", { class: "cv-rcpt-title", "data-receipt-title": model.role || "deal" }, [w(model.role === "seller" ? "deal.surface.title.seller" : model.role === "buyer" ? "deal.surface.title.buyer" : "deal.surface.title")])];
    if (model.audience === "keep" && !sharedCarrier(this.carrier)) tags.push(d.el("span", { class: "cv-rcpt-tag cv-rcpt-tag--private", "data-banner": "private" }, [w("deal.surface.tag.private")]));
    else tags.push(d.el("span", { class: "cv-rcpt-tag", "data-banner": "shared" }, [w(sharedCarrier(this.carrier) ? "banner.shared.label" : "deal.surface.tag.shared")]));
    var actions = [];
    if (model.proof_file !== null) actions.push(this.proofDownload(model, "cv-rcpt-button cv-rcpt-button--primary"));
    return d.el("div", { class: "cv-rcpt-header", "data-surface": "header" }, [d.el("div", { class: "cv-rcpt-tags" }, tags), d.el("div", { class: "cv-rcpt-actions" }, actions)]);
  };
  function proofName(model) { return (model.deal_id || "deal") + ".bundle.json"; }
  // "Download proof file": the copy as this page carries it, saved as a file capsulectl verify reads.
  P.proofDownload = function (model, cls) {
    var d = this.d;
    var name = proofName(model);
    var link = d.el("a", { class: cls, href: "#", download: name, "data-proof-download": name }, [w("deal.surface.download")]);
    var text = model.proof_file;
    link.addEventListener("click", function () {
      var view = link.ownerDocument.defaultView;
      var url = view && view.URL && typeof view.URL.createObjectURL === "function" && typeof view.Blob === "function"
        ? view.URL.createObjectURL(new view.Blob([text], { type: "application/json" }))
        : "data:application/json;charset=utf-8," + encodeURIComponent(text);
      link.setAttribute("href", url);
    });
    return link;
  };

  P.topLine = function (model, verdict) {
    var d = this.d;
    var key = "deal.top." + verdict.line;
    var values = {};
    if (verdict.term) values.term = word("deal.term." + verdict.term) || verdict.term;
    var text = verdict.line === "terms" ? this.termsTally(model.rows) : this.say(model, key, values);
    var line = [d.el("h2", { class: "cv-rcpt-headline", "data-top-line": verdict.line }, [text])];
    // What the deal was for, from the holder's own sealed offer (#461); the seller is not named: no record
    // the agreement cites seals the seller's name, and a key id is never drawn as one.
    // On the holder's own page only: the offer is given beside the copy, not carried in it, so a copy
    // shown to others never shows it.
    if (model.item !== null && this.ownPage(model)) line.push(this.p(w("deal.hero.item", { item: model.item }), { class: "cv-rcpt-lede", "data-hero-item": "" }));
    if (verdict.line === "ruled_not_met" && verdict.remedy !== null) line.push(this.p(w("deal.row.remedy", { remedy: this.token("deal.remedy", verdict.remedy) }), { class: "cv-rcpt-lede", "data-remedy": verdict.remedy }));
    if (verdict.mood !== null) line.push(this.p(w("deal.seal." + verdict.mood), { class: "cv-rcpt-mood", "data-mood": verdict.mood }), this.note(w("deal.seal.short")));
    var parts = [];
    if (verdict.mood !== null) parts.push(this.seal(verdict.mood));
    parts.push(d.el("div", { class: "cv-rcpt-topline" }, line));
    return d.el("div", { class: "cv-rcpt-top", "data-surface": "top" }, parts);
  };

  P.surfaceCards = function (model, verdict) {
    var d = this.d;
    var cards = [];
    var leg = ownLeg(model);
    if (leg !== null) {
      var amountKey = model.role === "seller" ? "received" : "amount";
      // Said as recorded, never in the page's own voice: the page checks no payment proof (u203).
      var recorded = leg.status === "settled" ? w(model.role === "seller" ? "deal.card.payment.received" : "deal.card.payment.settled") : w("deal.card.payment.status", { status: leg.status });
      cards.push({ key: "paid", label: w("deal.card.payment"), value: this.legMoney(model, leg, amountKey), note: recorded });
    } else if (ownLegs(model).length > 1) {
      cards.push({ key: "paid", label: w("deal.card.payment"), value: w("deal.card.payment.several", { count: String(ownLegs(model).length) }), note: null });
    }
    cards.push({ key: "status", label: w("deal.card.status"), value: d.el("span", { "data-card-status": verdict.line }, [this.statusWord(model, verdict)]), note: model.as_of && validUtcTime(model.as_of) ? this.timed("deal.card.as_of", model.as_of) : null });
    // The other side's half, named by side only when the copy's own agreement says which side the holder is.
    if (model.role !== null) cards.push({ key: "other", label: w(model.role === "seller" ? "deal.card.other.buyer" : "deal.card.other.seller"), value: w(model.counterparty_half === "verified" ? "deal.card.other.checked" : "deal.card.other.none"), note: null });
    return d.el("div", { class: "cv-rcpt-cards", "data-surface": "cards" }, cards.map(function (c) {
      var parts = [d.el("div", { class: "cv-rcpt-card__label" }, [c.label]), d.el("div", { class: "cv-rcpt-card__value" }, [c.value])];
      if (c.note) parts.push(d.el("div", { class: "cv-rcpt-card__note" }, [c.note]));
      return d.el("div", { class: "cv-rcpt-card", "data-card": c.key }, parts);
    }));
  };
  // The status card: "Settled" under the Done seal, else the terms' one shared status, else the start state.
  P.statusWord = function (model, verdict) {
    if (verdict.mood === "done") return w("deal.card.status.done");
    var rows = model.rows_state === "listed" ? model.rows : [];
    var first = rows.length ? rows[0].status : null;
    if (first !== null && model.start.state === "started" && rows.every(function (r) { return r.status === first; })) return this.token("deal.status", first);
    return this.token("deal.state", model.start.state);
  };
  P.legMoney = function (model, leg, key) {
    var step = model.sealed_steps.find(function (s) { return s.leg === leg; });
    var m = step ? step.money[key] : null;
    var said = m ? moneyOf(m) : { main: "-", sub: null };
    return said.sub ? [said.main, this.d.el("span", { class: "cv-rcpt-sub" }, [said.sub])] : said.main;
  };

  // The three stamps (Muse design §3.3, as #382 item 14 words them), each from its own evidence.
  P.stamps = function (model) {
    var d = this.d, self = this;
    var checks = model.checks;
    var recorded;
    var checkpoint = checks !== null && own(checks, "checkpoint") ? checks.checkpoint.status : null;
    if (checkpoint === null) recorded = { state: "not_checked" };
    else if (checkpoint === "fail") recorded = { state: "failed" };
    else if (checkpoint !== "pass") recorded = { state: "open" };
    else {
      var leaves = mmrLeaves(model.checkpoint_size), size = model.rests_on.own_size;
      recorded = leaves !== null && size !== null && leaves < size ? { state: "partial", k: leaves, n: size } : { state: "filled" };
    }
    var witness = this.timeStamp(model);
    var counter = this.countersigned(model);
    var items = [["recorded", recorded], ["time_stamped", witness], ["countersigned", counter]];
    return d.el("ul", { class: "cv-rcpt-stamps", "data-surface": "stamps" }, items.map(function (it) {
      var name = it[0], s = it[1];
      var values = {};
      if (s.k !== undefined) { values.k = String(s.k); values.n = String(s.n); }
      if (s.witness !== undefined) values.witness = s.witness;
      if (s.signer !== undefined) values.signer = s.signer;
      var key = "deal.stamp." + name + "." + (s.words || s.state);
      var text = s.at !== undefined ? self.timed(key, s.at, values) : w(key, values);
      return d.el("li", { class: "cv-rcpt-stamp cv-rcpt-stamp--" + (s.state === "filled" ? "filled" : "open"), "data-stamp": name, "data-stamp-state": s.state }, [
        d.el("span", { class: "cv-rcpt-stamp__name" }, [w("deal.stamp." + name)]), " ", d.el("span", { class: "cv-rcpt-stamp__text" }, [text]),
      ]);
    }));
  };
  // COUNTERSIGNED (#382 item 14): filled only for a countersignature from a resolved signer that this page
  // verified, over this very bundle or over the countersigned copy the page carries (#456; AAC's
  // classification, carried by the runtime); a producer's own, an unlisted signer's or a failed one never
  // fills it, nor does the other side's verified half.
  P.countersigned = function (model) {
    // The countersigned copy the page carries, checked by the page itself (#456): it verifies, a
    // countersignature on it resolves, and its records 1 to k are this copy's records 1 to k. It
    // decides the stamp even when a countersignature on this very bundle failed: the copy is the
    // signed one the page checked (Sherlock2 on #457). Unless the signer's directory row lists it as
    // independent of both parties, the line says the row does not (u649).
    var copy = model.countersigned_copy;
    var copyAt = copy ? stepTime(null, copy.at) : null;
    if (copy && copyAt !== null && validUtcTime(copyAt)) return { state: "filled", words: copy.independent ? "filled_copy" : "filled_copy_not_listed", signer: copy.name, at: copyAt, k: copy.k, n: copy.n };
    var list = model.countersigned;
    if (list === null) return model.countersignatures.length ? { state: "not_checked" } : { state: "open" };
    var given = list.filter(function (c) { return c.kind !== "hollow"; });
    if (!given.length) return { state: "open" };
    // AAC's classifier keeps the signer's own time, fractions of a second included; the page says it to the second.
    var secondOf = function (at) { var t = at !== null ? stepTime(null, at) : null; return t !== null && validUtcTime(t) ? t : null; };
    var resolved = given.find(function (c) { return c.kind === "resolved" && c.name !== null && secondOf(c.at) !== null; });
    if (resolved) return { state: "filled", signer: resolved.name, at: secondOf(resolved.at) };
    if (given.some(function (c) { return c.kind === "invalid"; })) return { state: "failed" };
    if (given.some(function (c) { return c.kind === "not-independent"; })) return { state: "self" };
    if (given.some(function (c) { return c.kind === "unresolved-signer"; })) return { state: "unresolved" };
    return { state: "not_checked" };
  };
  // The leaves an MMR of `size` nodes holds (size = 2L - popcount(L)), or null when no L gives it.
  function mmrLeaves(size) {
    if (size === null || size < 0) return null;
    for (var l = 0; l <= size; l++) {
      var ones = 0, x = l;
      while (x) { ones += x & 1; x >>>= 1; }
      if (2 * l - ones === size) return l;
    }
    return null;
  }
  // TIME-STAMPED and the proof panel's "Outside time stamp" row, one decision: capsulectl's check of
  // the holder's own book, on the holder's own page only (a shared copy never shows the holder's time).
  P.timeStamp = function (model) {
    if (!this.ownPage(model)) return { state: "not_checked" };
    var book = model.book_witnessed;
    if (book === null) return { state: "not_checked" };
    if (book.status === "verified") return { state: "filled", words: "filled_checked", at: book.at, witness: book.witness };
    if (book.status === "failed") return { state: "failed" };
    return { state: "open" };
  };

  // "What happened, step by step": one row per record the copy carries, each opening to what it records.
  P.stepTitle = function (model, step) {
    if (!step.shown) return w("deal.step.withheld");
    if (step.kind === "agree") return w("deal.step.agree");
    if (step.kind === "settle" && step.leg !== null) {
      var payee = step.leg.leg.indexOf("payee") === 0;
      var raw = this.rawMoney(step, payee ? "received" : "amount");
      var amount = raw !== null ? moneyOf(raw).sub || moneyOf(raw).main : "-";
      if (step.refund) return w("deal.step.settle.refund", { amount: amount, status: step.leg.status });
      // "Paid" only for a leg recorded as settled: a pending, failed or reversed one says its status.
      if (step.leg.status !== "settled") return w("deal.step.settle.status", { amount: amount, status: step.leg.status });
      return w(payee ? "deal.step.settle.payee" : "deal.step.settle.payer", { amount: amount });
    }
    if (step.kind === "statement") {
      var self = this;
      var said = step.statements.map(function (st) { return (word("deal.term." + st.row) || st.row) + ": " + (st.value !== null ? self.token("deal.value", st.value) : "-"); }).join("; ");
      return this.say(model, "deal.step.statement", { said: said || "-" });
    }
    if (step.kind === "perform") return w("deal.step.perform", { act: step.act !== null ? step.act : "-" });
    var known = step.kind !== null ? word("deal.step.kind." + step.kind) : null;
    return known !== null ? known : w("deal.step.other", { kind: step.kind || "-" });
  };
  P.rawMoney = function (step, key) { return step.money && own(step.money, key) ? step.money[key] : null; };
  P.stepDrawer = function (model, step) {
    var d = this.d, self = this;
    var rows = [[w("deal.drawer.kind"), d.el("span", { class: "cv-mono" }, [step.kind !== null ? step.kind : w("deal.drawer.kind.withheld")])]];
    if (step.time !== null && this.ownPage(model)) rows.push([w("deal.drawer.time"), this.v1Time(step.time)]);
    if (step.leg !== null) {
      var leg = step.leg;
      rows.push([w("deal.drawer.leg"), leg.leg + " · " + leg.status]);
      leg.money.forEach(function (m) {
        var raw = self.rawMoney(step, m[0]);
        var said = raw !== null ? moneyOf(raw) : { main: m[1], sub: null };
        rows.push([m[0], said.sub ? said.main + " (" + said.sub + ")" : said.main]);
      });
      if (leg.payment_ref !== null) rows.push([w("deal.drawer.payment_ref"), d.el("span", { class: "cv-mono" }, [leg.payment_ref.type + " " + self.short(leg.payment_ref.value)])]);
    }
    step.statements.forEach(function (st) { rows.push([self.termName(st.row), st.value !== null ? self.token("deal.value", st.value) : "-"]); });
    if (step.kind === "agree" && step.role !== null) rows.push([w("deal.drawer.role"), this.sideWord(step.role)]);
    var id = d.el("details", { class: "cv-rcpt-id", "data-record-id": step.record }, [
      d.el("summary", {}, [d.el("span", { class: "cv-mono" }, [this.short(step.record)]), " · ", step.kind !== null ? step.kind : w("deal.drawer.kind.withheld")]),
      d.el("code", { class: "cv-mono cv-rcpt-fullid" }, [step.record]),
    ]);
    var place = [];
    if (step.seq !== null) place.push(w("deal.drawer.seq", { seq: String(step.seq) }));
    if (step.leaf !== null) place.push(w("deal.drawer.leaf", { leaf: String(step.leaf) }));
    return [
      d.el("dl", { class: "cv-rcpt-fields" }, rows.map(function (r) { return d.el("div", { class: "cv-rcpt-field" }, [d.el("dt", {}, [r[0]]), d.el("dd", {}, [r[1]])]); })),
      d.el("div", { class: "cv-rcpt-record" }, [d.el("span", { class: "cv-rcpt-record__label" }, [w("deal.drawer.record")]), id].concat(place.length ? [d.el("span", { class: "cv-mono cv-muted" }, [place.join(" · ")])] : [])),
    ];
  };
  P.timeline = function (model) {
    var d = this.d, self = this;
    var steps = model.sealed_steps;
    // Each step's time only on the holder's own page (Sherlock2, u239).
    var own = this.ownPage(model);
    var head = [d.el("h3", { class: "cv-rcpt-h" }, [w("deal.section.steps")]), this.note(w(steps.length === 1 ? "deal.steps.lede.one" : "deal.steps.lede", { count: String(steps.length) }))];
    if (!steps.length) return d.el("section", { class: "cv-rcpt-panel", "data-surface": "steps" }, head.concat([this.note(w("deal.steps.none"))]));
    var list = d.el("ol", { class: "cv-rcpt-steps" }, steps.map(function (step, i) {
      return d.el("li", { class: "cv-rcpt-step", "data-step": String(i + 1), "data-step-kind": step.kind || "withheld" }, [
        d.el("details", {}, [
          d.el("summary", {}, [
            d.el("span", { class: "cv-rcpt-step__n", "aria-hidden": "true" }, [String(i + 1)]),
            d.el("span", { class: "cv-rcpt-step__title" }, [self.stepTitle(model, step)]),
            d.el("span", { class: "cv-rcpt-step__time" }, [step.time !== null && own ? self.v1Time(step.time) : ""]),
          ]),
          d.el("div", { class: "cv-rcpt-step__drawer" }, self.stepDrawer(model, step)),
        ]),
      ]);
    }));
    return d.el("section", { class: "cv-rcpt-panel", "data-surface": "steps" }, head.concat([list]));
  };

  // "Is this record intact?": capsulectl verify's own answer per check, never the page's (#378: no
  // bare "Verified"), with the outside time stamp as the TIME-STAMPED stamp says it.
  var PROOF_ROWS = ["producer_signatures", "interval_coverage", "graph_closure", "per_record_membership", "checkpoint"];
  P.proofPanel = function (model) {
    var d = this.d, self = this;
    var checks = model.checks;
    var statuses = PROOF_ROWS.map(function (name) { return checks !== null && own(checks, name) ? checks[name].status : null; });
    var lede = checks === null ? "deal.proof.lede.none"
      : statuses.some(function (s) { return s === "fail"; }) ? "deal.proof.lede.failed"
      : statuses.every(function (s) { return s === "pass"; }) ? "deal.proof.lede.passed" : "deal.proof.lede.partial";
    var rows = PROOF_ROWS.map(function (name, i) {
      var status = statuses[i] === null ? "absent" : ["pass", "fail", "withheld"].indexOf(statuses[i]) >= 0 ? statuses[i] : "absent";
      return self.proofRow(name, status, w("deal.proof." + name), null);
    });
    // The other side's signed agreement, as capsulectl verify reported it (the card says only that it
    // was checked; this panel carries the attribution, #461). Drawn only when capsulectl reported on it.
    var half = model.counterparty_half === "verified" ? "pass" : model.counterparty_half === "failed" ? "fail" : null;
    if (half !== null) rows.push(this.proofRow("counterparty_half", half, this.sideSay(model, "deal.proof.counterparty_half"), null));
    var stamp = this.timeStamp(model);
    var stampState = stamp.state === "filled" ? "pass" : stamp.state === "failed" ? "fail" : "absent";
    // The summary counts every row it shows: any failed row, the agreement and the time stamp included,
    // makes it "failed". With no per-test answer but a row capsulectl did answer, the lede still names
    // capsulectl as the source of the rows it shows.
    if (stampState === "fail" || half === "fail") lede = "deal.proof.lede.failed";
    else if (lede === "deal.proof.lede.none" && (stampState === "pass" || half === "pass")) lede = "deal.proof.lede.answers.some";
    if (lede === "deal.proof.lede.failed") lede = "deal.proof.lede.answers.failed";
    var stampText = stamp.state === "filled" ? this.timed("deal.proof.witness.filled_checked", stamp.at, { witness: stamp.witness }) : w("deal.proof.witness." + stamp.state);
    rows.push(this.proofRow("witnesses", stampState, stampText, stamp.state === "filled" ? null : this.say(model, "deal.proof.witness.note")));
    var parts = [
      d.el("h3", { class: "cv-rcpt-h" }, [w("deal.section.proof")]),
      this.p(w(lede), { class: "cv-rcpt-lede", "data-proof": lede.split(".").pop() }),
      d.el("ul", { class: "cv-rcpt-proof" }, rows),
      this.checkYourself(model),
    ];
    return d.el("section", { class: "cv-rcpt-panel", "data-surface": "proof" }, parts);
  };
  P.proofRow = function (name, status, text, note) {
    var d = this.d;
    var mark = status === "pass" ? "✓" : status === "fail" ? "✗" : "–";
    var parts = [
      d.el("span", { class: "cv-rcpt-mark cv-rcpt-mark--" + status, "aria-hidden": "true" }, [mark]),
      d.el("span", { class: "cv-rcpt-proof__text" }, [
        d.el("span", { class: "cv-rcpt-sr" }, [w("deal.proof.status." + status) + ": "]),
        d.el("span", { class: "cv-rcpt-proof__label" }, [text]),
        d.el("span", { class: "cv-mono cv-rcpt-proof__code" }, [name.replace(/_/g, " ")]),
      ].concat(note ? [d.el("span", { class: "cv-rcpt-proof__note" }, [note])] : [])),
    ];
    return d.el("li", { class: "cv-rcpt-proof__row", "data-check": name, "data-check-status": status }, parts);
  };
  P.checkYourself = function (model) {
    var d = this.d;
    var parts = [d.el("div", { class: "cv-rcpt-h4" }, [w("deal.check.title")])];
    // capsulectl's command checks the file it was given (this page); the downloaded proof file is checked
    // by name, quoted for a shell when it is not plain.
    if (model.verify_command !== null) {
      parts.push(this.note(w("deal.check.page")), d.el("pre", { class: "cv-rcpt-command" }, [d.el("code", { "data-verify-command": "page" }, [model.verify_command])]));
    }
    if (model.proof_file !== null) {
      var name = proofName(model);
      var quoted = /^[A-Za-z0-9._-]+$/.test(name) ? name : "'" + name.replace(/'/g, "'\\''") + "'";
      parts.push(this.note(w("deal.check.download")), d.el("pre", { class: "cv-rcpt-command" }, [d.el("code", { "data-verify-command": "download" }, ["capsulectl deal verify --bundle " + quoted])]));
    }
    if (model.verify_command === null && model.proof_file === null) parts.push(this.note(w("deal.check.no_command")));
    if (model.bundle_digest) parts.push(this.note(w("deal.check.expect", { verdict: model.verdict || "VALID", fingerprint: this.short(model.bundle_digest) }), { "data-expect": model.bundle_digest }));
    if (model.proof_file !== null) parts.push(this.proofDownload(model, "cv-rcpt-button"));
    return d.el("div", { class: "cv-rcpt-check", "data-surface": "check" }, parts);
  };

  P.notProven = function (model) {
    var d = this.d, self = this;
    return d.el("section", { class: "cv-rcpt-panel", "data-surface": "not-proven" }, [
      d.el("h3", { class: "cv-rcpt-h" }, [w("deal.section.not_proven")]),
      d.el("ul", { class: "cv-rcpt-list" }, ["true", "who", "goods", "outside"].map(function (k) { return d.el("li", {}, [self.say(model, "deal.not_proven." + k)]); })),
    ]);
  };
  P.elseHere = function (model) {
    var d = this.d;
    var rows = model.rows_state === "listed" ? model.rows : [];
    var problems = rows.filter(function (r) { return r.status === "in_dispute" || r.status === "in_disagreement" || (r.ruling !== null && r.ruling.value === "not_met"); });
    var self = this;
    var problemText = model.rows_state === "withheld" ? w("deal.else.problems.withheld") : problems.length
      ? problems.map(function (r) { return (word("deal.term." + r.id) || r.id) + ": " + self.token("deal.status", r.status); }).join("; ")
      : w("deal.else.problems.none");
    var tiles = [
      { key: "problems", label: w("deal.else.problems"), text: problemText },
      { key: "whose", label: w("deal.else.whose"), text: this.say(model, "deal.else.whose.text") },
    ];
    if (model.counterparty_half === "verified") tiles.push({ key: "half", label: w("deal.else.half"), text: this.sideSay(model, "deal.else.half.checked") });
    return d.el("section", { class: "cv-rcpt-panel", "data-surface": "else" }, [
      d.el("h3", { class: "cv-rcpt-h" }, [w("deal.section.else")]),
      d.el("div", { class: "cv-rcpt-tiles" }, tiles.map(function (t) {
        return d.el("div", { class: "cv-rcpt-tile", "data-else": t.key }, [d.el("div", { class: "cv-rcpt-tile__label" }, [t.label]), d.el("div", {}, [t.text])]);
      })),
    ]);
  };
  P.surfaceFooter = function (model) {
    var parts = [w("deal.footer.times")];
    parts.push(" ", this.ownPage(model) ? w("deal.footer.private") : w("deal.footer.shared"));
    if (model.as_of && validUtcTime(model.as_of)) parts.push(" ", this.timed("deal.footer.after", model.as_of));
    return this.d.el("p", { class: "cv-rcpt-footer", "data-surface": "footer" }, parts);
  };

  // "For checkers: every sealed record": each record once, then the copy's own facts.
  P.recordTable = function (model) {
    var d = this.d, self = this;
    var rows = model.sealed_steps.map(function (step, i) {
      return [String(i + 1), self.stepTitle(model, step), d.el("span", { class: "cv-mono" }, [step.kind !== null ? step.kind : "-"]),
        d.el("span", { class: "cv-mono" }, [(step.seq !== null ? String(step.seq) : "-") + " · " + (step.leaf !== null ? String(step.leaf) : "-")]),
        d.el("span", { class: "cv-mono", "data-inventory-record": step.record, title: step.record }, [self.short(step.record)]),
        w(step.shown ? "deal.inventory.shown" : "deal.inventory.withheld")];
    });
    var facts = [
      [w("deal.inventory.log"), model.log_id !== null ? d.el("span", { class: "cv-mono" }, [model.log_id]) : w("deal.inventory.not_recorded")],
      [w("deal.inventory.fingerprint"), model.bundle_digest ? d.el("span", { class: "cv-mono" }, [model.bundle_digest]) : w("deal.inventory.not_recorded")],
      [w("deal.inventory.profile"), d.el("span", { class: "cv-mono" }, [EXTENSION_V1])],
      [w("deal.inventory.producer"), w("deal.inventory.not_recorded")],
      [w("deal.inventory.pack"), d.el("span", { class: "cv-mono" }, [PACK.id])],
    ];
    return [
      rows.length ? this.kit.dataTable([w("deal.col.step"), w("deal.col.what"), w("deal.col.kind"), w("deal.col.place"), w("deal.col.record"), w("deal.col.shown")], rows) : this.note(w("deal.steps.none")),
      d.el("dl", { class: "cv-rcpt-fields", "data-inventory": "facts" }, facts.map(function (f) { return d.el("div", { class: "cv-rcpt-field" }, [d.el("dt", {}, [f[0]]), d.el("dd", {}, [f[1]])]); })),
    ];
  };

  function drawDeal(doc, depth, model) {
    var dr = new Drawer(doc, depth, false);
    var d = dr.d;
    var verdict = dealVerdict(model);
    var main = d.el("div", { class: "cv-rcpt-main" }, [dr.timeline(model), dr.elseHere(model)]);
    var side = d.el("div", { class: "cv-rcpt-side" }, [dr.proofPanel(model), dr.notProven(model)]);
    var l0 = [d.el("div", { class: "cv-rcpt", "data-receipt-surface": "v1" }, [
      dr.surfaceHeader(model),
      d.el("div", { class: "cv-rcpt-panel cv-rcpt-hero" }, [dr.topLine(model, verdict), dr.surfaceCards(model, verdict)]),
      dr.stamps(model),
      d.el("div", { class: "cv-rcpt-grid" }, [main, side]),
    ])];
    // For checkers: every sealed record, the copy's facts, then where the deal stands and its terms.
    var l1 = dr.recordTable(model).concat([dr.dealHeadline(model)], dr.dealL1(model));
    // Technical details: the ladder of rungs as the page drew them before, and the report's grounds.
    var l2 = [dr.kit.section(w("deal.section.rungs"), dr.copyNotes(model), 3)].concat(dr.dealL2(model));
    var levels = dr.page(l0, w("deal.depth.l1.checkers"), l1, depth === "L1" || depth === "L2", l2, depth === "L2", null, w("deal.depth.l2.technical"));
    levels[1].appendChild(dr.surfaceFooter(model));
    return levels;
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
    var l0 = [d.el("h2", {}, [w(one ? "bilateral.title.one_sided" : "bilateral.title")]), dr.checkedNote(model.verification)];
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
      // In a report the reader may not be the owner, so the owner's side is
      // named, not "your" (Sherlock2, #386).
      if (party.audience === "keep") return dr.half("ours", w(dr.carrier === "page" ? "sides.ours.page" : sharedCarrier(dr.carrier) ? "sides.ours.shared" : "sides.ours"), [section], attrs);
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

  // ---- the provider's own receipt (provider.py) ------------------------------
  // capsuleviewer.receipt.provider/v0: the page for a bundle of one exchange a
  // Mesh node served, or was asked to serve and recorded as failed or sent on
  // with no response (#465), and the payments it received for it (capsules-plugin
  // provider-receipt-bundle, Mesh-LLM/capsules-plugin#134). Not a deal
  // receipt: the root is the node's own record of the exchange it served
  // (x-mesh-poc-v1) and every other record is a settled payee_observed leg.
  // It reads no request or response text and nothing of who asked.

  var PROVIDER_POC = "x-mesh-poc-v1";
  var PROVIDER_LEG = "payee_observed";
  var CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/;

  // group_thousands on a canonical integer string: amounts are exact at any size.
  function groupDigits(digits) {
    var head = digits.length % 3 || 3;
    var out = [digits.slice(0, head)];
    for (var i = head; i < digits.length; i += 3) out.push(digits.slice(i, i + 3));
    return out.join(",");
  }
  // The sum of two canonical integer strings, digit by digit.
  function addDigits(a, b) {
    var out = "", carry = 0;
    for (var i = a.length - 1, j = b.length - 1; i >= 0 || j >= 0 || carry; i--, j--) {
      var s = (i >= 0 ? +a[i] : 0) + (j >= 0 ? +b[j] : 0) + carry;
      out = (s % 10) + out;
      carry = s >= 10 ? 1 : 0;
    }
    return out.replace(/^0+(?=.)/, "");
  }

  // provider.amount_text: an AAC exact amount (exactly value, assetCode and
  // assetScale; a canonical integer string, a code, a scale of 0 to 255) with
  // its unit. A BTC amount at scale 11 reads in msat; any other is shown as
  // sealed, never converted. null when it is not one: the page then shows
  // nothing rather than a number with no unit. `msat` is the value in msat,
  // for the total.
  function providerAmount(amount) {
    if (!isMap(amount)) return null;
    var keys = Object.keys(amount).sort();
    if (keys.join(",") !== "assetCode,assetScale,value") return null;
    var value = amount.value, code = amount.assetCode, scale = amount.assetScale;
    if (typeof value !== "string" || !CANONICAL_UINT.test(value)) return null;
    if (typeof code !== "string" || code === "" || int(scale) === null || scale < 0 || scale > 255) return null;
    if (code === "BTC" && scale === 11) return { text: groupDigits(value) + " msat", msat: value };
    return { text: value + " × 10^-" + scale + " " + code, msat: null };
  }

  var ISO_OFFSET = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?([Zz]|[+-]\d{2}(?::?\d{2})?)$/;
  // provider._utc: a time with its offset (RFC 3339, seconds optional, the
  // offset as +05, +0500 or +05:00), in UTC to the second
  // ("2026-10-30T19:50:00 UTC"), or "?" when it is not one, has no offset or
  // falls outside years 1 to 9999. Python's fromisoformat (3.11 and later)
  // also reads spellings no provider bundle carries, and this shows "?" for
  // each: another separator than T, t or a space, an hour with no minutes, a
  // basic-format time, a comma before the fraction, 24:00, an offset with
  // seconds (js-tests/receipt_provider.test.js).
  function providerUtc(stamp) {
    var m = ISO_OFFSET.exec(stamp);
    if (m === null) return "?";
    var y = +m[1], mo = +m[2], da = +m[3], h = +m[4], mi = +m[5], s = m[6] === undefined ? 0 : +m[6];
    if (y < 1 || mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59 || s > 59) return "?";
    var base = new Date(0);
    base.setUTCFullYear(y, mo - 1, da);
    base.setUTCHours(h, mi, s, 0);
    // The date must exist as written (no 31 June).
    if (base.getUTCFullYear() !== y || base.getUTCMonth() !== mo - 1 || base.getUTCDate() !== da) return "?";
    var off = 0;
    if (m[8] !== "Z" && m[8] !== "z") {
      var digits = m[8].slice(1).replace(":", "");
      var oh = +digits.slice(0, 2), om = digits.length > 2 ? +digits.slice(2, 4) : 0;
      if (oh > 23 || om > 59) return "?";
      off = (m[8][0] === "-" ? -1 : 1) * (oh * 60 + om);
    }
    var when = new Date(base.getTime() - off * 60000);
    var year = when.getUTCFullYear();
    if (year < 1 || year > 9999) return "?";
    // toISOString writes years 1 to 9999 as four digits.
    return when.toISOString().slice(0, 19) + " UTC";
  }

  // provider._is_leg: a payment this node received, only a settled one.
  function isProviderLeg(record) {
    var leg = map(get(record, "settlement"));
    return get(leg, "leg") === PROVIDER_LEG && get(leg, "sealer_role") === "payee" && get(leg, "status") === "settled";
  }

  // provider._REASONS: the failure classes a failed record may name
  // (capsules-plugin FailedExchange.class), each drawn in words; any other
  // value is drawn as no reason, never as its code.
  var PROVIDER_REASONS = ["payment_required", "refused", "upstream_error", "timeout", "dropped"];

  // provider._parts: the node's own record of the exchange, the legs and the
  // record's effect, when the bundle is exactly those. The effect is
  // confirmed (served), failed or dispatched (sent on, no response
  // recorded): each side keeps its half of a failed exchange too (Steven's
  // u1578 E and F, evidencebook#205; capsule-viewer#465). A failed exchange
  // may have no payment; any other needs one.
  function providerParts(v) {
    var records = get(v.bundle, "records");
    if (!Array.isArray(records) || !records.every(isMap)) return null;
    var root = get(v.bundle, "root");
    var exchange = records.filter(function (r) { return get(r, "capsule_id") === root; });
    var others = records.filter(function (r) { return get(r, "capsule_id") !== root; });
    if (exchange.length !== 1 || !others.every(isProviderLeg)) return null;
    var poc = get(map(get(map(get(exchange[0], "model_attestation")), "compute_attestation")), PROVIDER_POC);
    // The node's own record: a mesh exchange block naming its serving
    // provenance and not marked as another role.
    if (!isMap(poc) || !isMap(get(poc, "serving_provenance"))) return null;
    if ((own(poc, "role") ? poc.role : "served") !== "served") return null;
    // A summary of the failures a node did not seal one by one is not one exchange.
    if (own(poc, "unsealed_failures")) return null;
    var effect = get(map(get(exchange[0], "effect")), "status");
    if (effect !== "confirmed" && effect !== "failed" && effect !== "dispatched") return null;
    if (!others.length && effect !== "failed") return null;
    var reason = get(poc, "failure_class");
    return {
      exchange: exchange[0],
      legs: others,
      effect: effect,
      reason: effect === "failed" && PROVIDER_REASONS.indexOf(reason) >= 0 ? reason : null,
    };
  }

  // provider._text: a scalar as Python's str() writes it; "" for null, a map or
  // a list. A float such as 1.0 reads "1" here and "1.0" there; no provider
  // bundle writes a number where this reads text.
  function pyText(value) {
    if (value === null || value === undefined || typeof value === "object") return "";
    if (typeof value === "boolean") return value ? "True" : "False";
    return String(value);
  }

  // provider.build_model, field for field.
  function buildProvider(v) {
    var parts = v.verified ? providerParts(v) : null;
    if (parts === null) throw new Unavailable("not a provider's served exchange with its payments");
    var total = "0";
    var payments = parts.legs.map(function (leg) {
      var settlement = map(get(leg, "settlement"));
      var received = providerAmount(get(settlement, "received"));
      var fee = providerAmount(get(settlement, "receive_fee"));
      total = total !== null && received !== null && received.msat !== null ? addDigits(total, received.msat) : null;
      return { capsule_id: pyText(get(leg, "capsule_id")), received: received && received.text, fee: fee && fee.text };
    });
    return {
      effect: parts.effect,
      reason: parts.reason,
      exchange_id: pyText(get(parts.exchange, "capsule_id")),
      model: pyText(get(map(get(parts.exchange, "model_attestation")), "model_id")),
      served_at: providerUtc(pyText(get(parts.exchange, "timestamp"))),
      payments: payments,
      total: total === null ? null : groupDigits(total) + " msat",
    };
  }

  // provider.render, all in L0 (the twin's page has one level and shows the
  // payments expanded), under the title the twin's page heads it with. The
  // title addresses the owner ("Your receipt ..."), so a shared copy (a page
  // saved for anyone, or a report) draws none: its other lines speak of
  // "this node" (#395). The served time stays in UTC, as the twin says it: it
  // is no data-time span, so the page's local-time pass leaves it.
  function drawProvider(doc, depth, model) {
    var d = new Drawing(doc);
    var kit = new Kit(d);
    var mono = function (id) { return d.el("span", { class: "cv-mono" }, [id.slice(0, 16)]); };
    // A failed or dispatched exchange was not served: its page says what the
    // record says, asks no "served" of its labels and heads it accordingly.
    var served = model.effect === "confirmed";
    var status = served ? null
      : model.effect === "dispatched" ? w("provider.status.dispatched")
      : model.reason !== null ? w("provider.status.failed_reason", { reason: w("provider.reason." + model.reason) })
      : w("provider.status.failed");
    var metrics = [
      { label: w(served ? "provider.model" : "provider.model_asked"), value: model.model || "?" },
      { label: w(served ? "provider.served_at" : "provider.recorded_at"), value: model.served_at || "?" },
    ];
    if (model.total !== null) metrics.push({ label: w("provider.total"), value: model.total });
    var notShown = w("provider.not_shown");
    var rows = model.payments.map(function (p) { return [mono(p.capsule_id), p.received || notShown, p.fee || notShown]; });
    var table = kit.dataTable([w("provider.payment_record"), w("provider.received"), w("provider.fee")], rows);
    var l0 = d.el("div", { "data-level": "L0" }, [
      sharedCarrier(drawCarrier) ? null : d.el("h2", {}, [w(served ? "provider.title" : "provider.title_asked")]),
      d.el("div", { class: "cv-provider-receipt", "data-module": moduleId("provider") }, [
        d.el("p", { "data-provider": "own-half" }, [w("provider.own_half")]),
        status === null ? null : d.el("p", { "data-provider": "status", "data-effect": model.effect }, [status]),
        d.el("p", { "data-provider": "no-content" }, [w("provider.no_content")]),
        kit.metricGrid(metrics),
        kit.drilldown(w("provider.received_count", { count: String(model.payments.length) }), [table], true),
        d.el("p", { class: "cv-muted", "data-provider": "records" }, [w("provider.records_note") + " ", mono(model.exchange_id)]),
      ]),
    ]);
    return [l0, d.el("div", { "data-level": "L1" }, []), d.el("div", { "data-level": "L2" }, [])];
  }

  // ---- the modules (presentation contract: canRender, buildModel, render) ----

  // The module's manifest id: the x-deal-v1 module is /v1, every other /v0.
  function moduleId(kind) { return "capsuleviewer.receipt." + kind + (kind === "deal" ? "/v1" : "/v0"); }

  var DRAW = { unilateral: drawUnilateral, seller: drawSeller, bilateral: drawBilateral, deal: drawDeal, provider: drawProvider };

  // A wording line's runs: the text between each pair of backticks as a
  // <code> element, the rest as text. The npm export's page lines drop the
  // same backticks (ts/src/receipt.ts, fill).
  function withCode(d, text) {
    return text.split(/`([^`]+)`/).map(function (part, i) {
      return i % 2 ? d.el("code", { class: "cv-mono" }, [part]) : part;
    }).filter(function (part) { return part !== ""; });
  }

  // The page could not check the receipt here: no receipt, only the line
  // and where to check it, in the pack's words. Without Ed25519 the browser
  // checks nothing (row.cannot_check, row.cannot_check_pointer; Sherlock2,
  // capsule-viewer#392); an x-deal-v1 copy's report passes only under its
  // profile's own rule, which no page runs yet (reason "report_rule",
  // row.cannot_check.report_rule and its pointer; capsule-viewer#405); a
  // downgraded x-deal-v0 copy names no sealed report to check its text
  // against: what was left out and why, then capsulectl's verdict on such a
  // copy as a second line of the same block (reason "downgraded",
  // row.cannot_check.downgraded and its _verdict; Sherlock2 on capsule-viewer#452).
  // A command in those words is marked with backticks; the line draws it as
  // inline code, words unchanged, as text nodes so "<file>" stays text
  // (withCode; Sherlock2 on capsule-viewer#454).
  function cannotCheckLevels(doc, reason) {
    var d = new Drawing(doc);
    var attrs = { class: "cv-tone--caution", "data-cannot-check": "true" };
    if (reason) attrs["data-cannot-check-reason"] = reason;
    var line = reason === "downgraded"
      ? d.el("div", attrs, [d.el("p", {}, [w("row.cannot_check.downgraded")]), d.el("p", {}, withCode(d, w("row.cannot_check.downgraded_verdict")))])
      : d.el("p", attrs, reason === "report_rule"
        ? withCode(d, w("row.cannot_check.report_rule") + " " + w("row.cannot_check.report_rule_pointer"))
        : [w("row.cannot_check") + ". " + w("row.cannot_check_pointer")]);
    return [d.el("div", { "data-level": "L0" }, [line]), d.el("div", { "data-level": "L1" }, []), d.el("div", { "data-level": "L2" }, [])];
  }
  var TITLES = { unilateral: "page.title", seller: "seller.title", bilateral: "bilateral.title", deal: "deal.title", provider: "provider.title" };

  // The kit stylesheet, the receipt's dark overrides and its own rules
  // (receipt.css, #429), each once per document under its own id (their
  // bytes are what the manifest's style_sha256 pins). The kit's other modules insert the same kit.css under
  // "cv-kit-css", so the overrides never ride on it: whichever module draws
  // first, a receipt gets them, and they apply only inside a receipt
  // ([data-receipt-module]), never to another module's card (#391).
  function insertStyle(doc, id, css) {
    if (!css || doc.getElementById(id)) return;
    var style = doc.createElement("style");
    style.id = id;
    style.textContent = css;
    (doc.head || doc.documentElement).appendChild(style);
  }
  function ensureStyle(doc) {
    insertStyle(doc, "cv-kit-css", KIT_CSS);
    insertStyle(doc, "cv-receipt-dark-css", KIT_DARK_CSS);
    insertStyle(doc, "cv-receipt-css", RECEIPT_CSS);
  }

  // One module. `env` is what the page's runtime does not hand a module (see
  // the file comment); a page's module takes the defaults. The tests give the
  // Python twin's inputs instead, to compare the two.
  //   audience        the page's audience, or null (the copy's own)
  //   verification    context -> the kit's VerificationResult
  //   assurance       context -> {bundle_digest, witnesses, countersignatures}
  //   composition     view -> the composed/v1 result, or null
  //   memberContext   (bundle, member id) -> a carried copy's context (or a promise of one)
  //   reportCheck     bundle -> "pass", "fail" or null (or a promise of one): the page
  //                   runtime's check of the copy's standalone report, asked on a page
  //                   (no assurance given) for the copy itself, not for a carried copy
  //   preimageCheck   (payment_ref, preimage) -> "PASS", "FAIL", "NOT_PRESENT",
  //                   "NOT_CHECKED" (or a promise of one): one Lightning leg's proof,
  //                   asked on a page for the x-deal-v0 settlement line
  function createModule(kind, env) {
    if (!own(DRAW, kind)) throw new Error("no receipt module " + kind);
    var e = {
      audience: env && env.audience !== undefined ? env.audience : null,
      verification: (env && env.verification) || pageVerification,
      assurance: (env && env.assurance) || function (context) { return pageAssurance(context, kind === "deal" ? EXTENSION_V1 : EXTENSION); },
      composition: (env && env.composition) || compositionOf,
      memberContext: (env && env.memberContext) || pageMemberContext,
      reportCheck: (env && env.reportCheck) || pageReportCheck,
      preimageCheck: (env && env.preimageCheck) || pagePreimageCheck,
      // The page says each time in the reader's zone; the parity tests leave it off to compare with the script-free twin.
      localTime: !!(env && env.localTime),
    };
    // Sherlock2 on capsule-viewer#392: a page whose own check cannot run in
    // full here (no strict result: this browser has no Ed25519) draws no
    // receipt, only the can't-check line and where to check it. A verifier's
    // report given in env (capsulectl's) is not this page's own check.
    var cannotCheckHere = function (context) {
      return !(env && env.verification) && map(context).strict === undefined;
    };
    // On a page (no verifier's assurance given) the copy's own standalone
    // report is asked about before its model is built. A composed copy's
    // carried copies are not asked about yet (#401): a carried copy whose
    // report is standalone stays unread, as before.
    var pageChecks = !(env && env.assurance);
    // An x-deal-v1 copy on a page whose verifier reports no check of its
    // standalone report: that report passes only under the profile's own
    // rule, which no page runs yet (#405), so the page draws no receipt and
    // says so, once the bundle itself verified. A verifier's report given in
    // env (capsulectl's) is read as before.
    var reportRuleNotRun = function (context) {
      if (!pageChecks || kind !== "deal") return false;
      var c = map(context);
      if (!own(map(get(map(c.bundle), "extensions")), STANDALONE_EXTENSION)) return false;
      if (reportChecked(c.verification, EXTENSION_V1) !== null) return false;
      return view(context, e).verified === true;
    };
    // The x-deal-v0 receipts: the buyer's and the seller copy, whose own
    // payment lines follow the settlement line (P.sellerPayment).
    var settles = kind === "unilateral" || kind === "seller";
    // A downgraded x-deal-v0 copy (capsule-viewer#452): its x-deal-v0 block
    // names no sealed report, as a page from before reports were sealed or a
    // hand-edited one carries its report text inline. Nothing sealed is there
    // to check that text against, so once the bundle itself verified the page
    // draws one line saying so in place of the receipt and reads nothing from
    // the block. capsulectl deal verify calls such a copy INVALID
    // (sealed_report_not_named), so this holds whatever verifier report env gives.
    var downgraded = function (context) {
      if (!settles) return false;
      var extensions = map(get(map(map(context).bundle), "extensions"));
      if (!own(extensions, EXTENSION)) return false;
      if (str(get(map(get(extensions, EXTENSION)), "sealed_report")) !== null) return false;
      return view(context, e).verified === true;
    };
    var build = function (context) {
      if (cannotCheckHere(context)) return { cannot_check: true };
      if (downgraded(context)) return { cannot_check: true, reason: "downgraded" };
      if (reportRuleNotRun(context)) return { cannot_check: true, reason: "report_rule" };
      var asked = [
        // A provider bundle carries no sealed report.
        pageChecks && kind !== "deal" && kind !== "provider" ? askReportCheck(context, e.reportCheck) : null,
        // The settlement line's Lightning proof, on the x-deal-v0 receipts only.
        pageChecks && settles ? askSettlementCheck(context, e.preimageCheck) : null,
      ].filter(function (p) { return p !== null; });
      if (asked.length) return Promise.all(asked).then(function () { return buildChecked(context); });
      return buildChecked(context);
    };
    // The lines the viewer draws and the frozen Python twin never does
    // (capsule-viewer#383, Sherlock2's ruling on the deal-view lines), on the
    // receipt model the copy notes draw from: the settlement line (see
    // settlementOf), who the deal was with (counterpartyOf), whether each
    // act came after the holder's yes (afterYesModel), the sealed report's
    // authority blocks (authorityOf) and the referee an adjudicator's copy
    // names (refereeOf).
    var withViewerLines = function (v, receipt) {
      if (settles) {
        var line = settlementOf(v, pageChecks && SETTLEMENT_CHECKS !== null ? SETTLEMENT_CHECKS.get(v.context) : undefined);
        if (line !== null) receipt.settlement = line;
      }
      var reader = new Reader(v);
      var raw = reader.sealedReport()[1];
      var named = counterpartyOf(reader, raw);
      if (named !== null) receipt.counterparty_named = named;
      var authority = authorityOf(raw);
      if (authority !== null) receipt.authority_sealed = authority;
      var referee = refereeOf(reader, raw);
      if (referee !== null) receipt.referee = referee;
      var yes = afterYesModel(v);
      if (yes !== null) receipt.after_yes = yes;
    };
    var buildChecked = function (context) {
      var v = view(context, e);
      if (kind === "provider") return buildProvider(v);
      if (kind === "deal") return buildDeal(v, e.audience);
      if (kind === "bilateral") return buildBilateral(v, e);
      if (kind === "seller") {
        var sale = buildSeller(v, e.audience);
        withViewerLines(v, sale.receipt);
        return sale;
      }
      // A seller's copy, by its packaging or by its own sealed records, is
      // never shown as a buyer's receipt.
      if (sellerKindEngaged(v) || sealedSide(v) === "seller") throw new Unavailable("a seller's copy is the seller receipt's");
      var receipt = buildReceipt(v, e.audience);
      withViewerLines(v, receipt);
      return receipt;
    };
    var declined = function (err) {
      if (err instanceof Unavailable) return false;
      throw err;
    };
    return {
      manifest: kind === KIND ? MANIFEST : { id: moduleId(kind) },
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
        var carried = host.L0.closest ? host.L0.closest("[data-receipt-carrier]") : null;
        var mark = carried ? carried.getAttribute("data-receipt-carrier") : null;
        drawCarrier = mark === "report" || mark === "page" ? mark : null;
        var levels;
        try {
          levels = model && model.cannot_check === true ? cannotCheckLevels(doc, model.reason) : DRAW[kind](doc, depth, model);
        } finally {
          drawCarrier = null;
        }
        // One text node per run of text, as the Python twin's HTML parses: the
        // browser shapes each text node on its own, so a run built from several
        // would lay out a fraction of a pixel differently.
        levels.forEach(function (level) { level.normalize(); });
        [host.L0, host.L1, host.L2].forEach(function (region, i) {
          var wrap = doc.createElement("div");
          wrap.className = "cv-kit";
          wrap.setAttribute("data-receipt-module", moduleId(kind));
          wrap.appendChild(levels[i]);
          region.appendChild(wrap);
          if (e.localTime) localTimes(wrap);
        });
      },
    };
  }

  var module = createModule(KIND, { localTime: true });

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
    providerAmount: providerAmount,
    providerUtc: providerUtc,
    plainTime: plainTime,
    localTimes: localTimes,
    bundleVerified: bundleVerified,
  };
  if (typeof root.EvidenceGraph !== "undefined" && root.EvidenceGraph && typeof root.EvidenceGraph.registerPresentation === "function") {
    root.EvidenceGraph.registerPresentation(module);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
