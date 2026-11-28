<!-- SPDX-License-Identifier: Apache-2.0 -->

# Changelog

All notable changes to capsule-viewer's published packages, the npm package
`@action-state-group/capsule-viewer` (`ts/`) and the Go module
`github.com/action-state-group/capsule-viewer/go` (`go/`), are documented
here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/) once it reaches 1.0.

## Unreleased

## ts 0.28.0 and go 0.28.0 (2026-11-27)

Both state viewer 0.28.0: `ts/v0.28.0`, then `go/v0.28.0` on the commit that ships its page runtime. Pull requests: #415, #417, #419, #420, #421, #422, #426, #427, #428, #435, #436, #437, #438, #441, #442, #444, #449, #451, #453, #455, #457, #458, #459, #462, #464, #467, #468, #469, #472, #474, #475, #483, #484, #485, #486, #493, #495, #499, #501, #502, #503, #510. The Go module drops `go/historyview` (#486), a breaking change, so `go/v0.28.0` is a minor release, not a patch. Mesh-LLM/capsules-plugin#398 updates to this release.

### Removed

- The Go module drops `go/historyview`, the Go twin of the History view (#477, receipt view-model note `docs/design/receipt-view-model.md` row 11). No repository imported it: Muse's `history page`, its intended caller, draws with its own template. The TypeScript `history-view` and the `vectors/history-view/` vectors stay. Removing an exported package breaks the module's API, so the next `go/` tag is a minor bump (go/v0.28.0).

### Changed

- The provider's own receipt (`capsuleviewer.receipt.provider/v0`) no longer says the other party "has not countersigned" it (#460): in these records a countersignature is a third party re-checking a bundle, not the other party signing. `provider.own_half` now reads "This is this node's own record of its half of the exchange. It is not a joint record: the other party keeps its own." (Sherlock2's wording), and the frozen Python twin's `OWN_HALF` carries the same words. The wording pack keeps its id, so its digest changes, and with it every `go/receipt` script's and manifest's `script_sha256` and `ts/src/receipt-core.generated.ts`; no other receipt draws differently.
- The x-deal-v1 receipt reads the offer a copy carries (`extensions/x-deal-v1/book/offer`) as the offer's sent pair `{record, agent_input}`, the file `capsulectl deal offer --out` writes and the form evidencebook#1065 carries (#498). It is read only when the record's `agent_input_digest` is SHA-256 over the JCS bytes of `agent_input`, `agent_input` is an x-deal-v1 propose, and that digest is the offer the copy's sealed agreement cites; anything else there, the `{record, header, payload}` form no producer wrote included, is refused. The item, quantity and price take their source from `/agent_input/body/terms/...` of that record. The page's words are unchanged; the `deal_offer` side input stays. The change is in `receipt_core.js`, so every `go/receipt` script's and manifest's `script_sha256` and `ts/src/receipt-core.generated.ts` change.
- The x-deal-v1 receipt draws the offer's quantity and total price under its item ("Quantity: 200 · Total: 60.00 USD", #487; Steven's u561 items 2 and 5): each from the holder's own offer, wherever the page draws the item, in the offer's own currency and never converted, and only when the offer states it. A dispute step's drawer shows each statement the dispute cites as the record it names, or says it is not in this copy, where it showed a blank field with "-" (#491; PRD C16). The witness check has one name, "Witness time stamp", in the deal page's proof rows and unwitnessed line and the History card's proof rows, as in the core's check list (#494, Sherlock2 on #493); the deal page's "Not countersigned in this copy" no longer says the other party may have countersigned (the v0 pages keep the frozen Python pack's words for both lines), and the receipt page's ladder says "each record's place in the log" for its inclusion rung.
- The provider's own receipt (`capsuleviewer.receipt.provider/v0`) also draws an exchange whose record says it failed or was sent on with no response (#465; Steven's u1578 E and F, evidencebook#205). A failed record's page says "This node's record says the exchange failed: <reason>. It was not served. Any payment this node received for it is listed below.", with the reason only when the record names one of the classes payment required, refused, upstream error, timed out or dropped (never its code); a failed exchange with no payment is drawn too. A dispatched record's page says "This node's record says the request was sent on, but the host reported no response. It does not show that the exchange was served." Both label the model "Model asked for" and the time "Recorded at", and the owner's page is titled "Your record of an exchange you were asked to serve" (Sherlock2's words); the confirmed page is unchanged. A record summarising failures not sealed one by one is not drawn. `checkReceipt` now answers `checked` for such a bundle at the owner's audience, where it answered `no_module`. The model gains `effect` and `reason`. The wording pack gains the words as `provider.*` keys and keeps its id, so its digest changes, and with it every receipt script's and manifest's `script_sha256` and `ts/src/receipt-core.generated.ts`. The frozen Python twin draws the same, and the oracle golden is regenerated with the new cases.
- The provider's own receipt for a failed exchange with no payment says so and draws no Received section (#470; Sherlock2's words). Its status line ends "It was not served. This node received no payment for it.", its no-content and records lines read "It names the model. It holds no request or response text." and "The exchange is a record of its own:" with the exchange id, and the page draws no "Received in total", no "Received (0)" and no empty table. A failed exchange with a payment, a dispatched one and a confirmed one are drawn as before. The pack gains four `provider.*_unpaid` keys, so `go/receipt`'s scripts and manifests and `ts/src/receipt-core.generated.ts` change their hashes.
- A History deal page's row no longer fills RECORDED from the `deal_report` check (#384): RECORDED means checkpointed (Steven), and that check says only that each deal was read with its own report.
- The x-deal-v1 receipt says capsulectl once above the fold, in the "Is this record intact?" summary (#461, from Steven's 11-26 hand run). The other side's card, the TIME-STAMPED stamp, the outside time stamp row and "The other side's agreement" tile say what was checked; the proof panel gains a row for the other side's signed agreement as capsulectl verify reported it (a failed one makes the summary say no), and the summary names capsulectl as the source of the rows it shows when it was not given an answer for each test. "Check it yourself" keeps both verify commands. On the holder's own page, the hero names the deal's item when the page is given the holder's own sealed offer: `renderEvidenceGraph` takes `dealOffer` (the offer record, `{"x-deal-v1", "body"}`) beside capsulectl's report, and the receipt module draws its `terms.item` only when the offer's SHA-256 over its JCS bytes is the digest the copy's own sealed agreement cites. The seller is not named: no record the agreement cites seals the seller's name yet (evidencebook#1031), and a key id is never drawn as one. New words are new keys in the wording pack; `go/pageruntime` is rebuilt with `dealOffer`.
- A contract report page takes each claim's deal from its builder (evidencebook#116, subject convention v0). Before, the page read a claim's deal from its id's part before `::`. Now `renderEvidenceGraph` takes `receiptDeals`, a map from claim id to deal id, beside `receipts`, and the Go emitter takes it as `OfflineOptions.ReceiptDeals`. evidencebook's report owns the rule: a claim's deal is the subject of the records it cites, else its id's part before `::`. A claim the map leaves out gets no receipt line. A page built without the map reads the prefix, as before. The emitter refuses the map on a page that carries no receipts, and refuses a claim id or deal id that is empty or `__proto__`. It now accepts a deal id containing `::`, since a subject id may contain it. A card's rows stay one per conversation, the claim id's part before `::` (`claimsFitCard` is unchanged). `go/pageruntime` is rebuilt with it.
- The x-deal-v1 receipt (`capsuleviewer.receipt.deal/v1`), the page capsulectl draws for a deal, takes Steven's receipt design as its top surface (#382): a header naming the receipt by the holder's own sealed role ("Order receipt", "Sale receipt") with a private or shared tag and "Download proof file"; a top line with the harbour seal (Done only when the deal is settled, every term has both sides saying the same and met, and the holder's payment record is in the copy; "Didn't go as agreed" only on a final ruling of not met; no seal otherwise; Sherlock2's table and words, the seal's meaning awaiting Steven's ruling); cards for the amount (sats and msat, said as recorded: the page checks no payment proof, u203), the status and the other side's half; the RECORDED, TIME-STAMPED and COUNTERSIGNED stamps, each from its own evidence; "What happened, step by step", one row per record the copy carries, each opening to what it records; "Is this record intact?", capsulectl verify's answer per check, never the page's own; "Check it yourself" with capsulectl's command and the fingerprint to expect; "What this does not prove"; "What else is in this receipt"; and a footer. It draws only what the copy holds: the item, the seller's name and a simulated rail are not in a v1 copy, so they are left out (Sherlock2 ranked them as fields for evidencebook). The ladder of rungs, the records each term rests on, what the report rests on and the checks stay, under "For checkers: every sealed record" (L1, with a table of every sealed record) and "Technical details" (L2). One column under 720px. A shared copy, or the holder's copy shown to others, says the holder's words and shows no record time (u239). The page runtime now carries capsulectl's own result for each bundle check, its verdict, the page's `verifyCommand` and the page's own classification of each countersignature to the receipt, in the x-deal-v1 entry it adds (`withVerifierReport`); `go/pageruntime` is rebuilt with it. A payment record not settled says its status; the amount and the seal use the holder's payment only when exactly one applies.
- The receipt modules' wording pack in `go/receipt` is `capsuleviewer.receipt.wording.en/v1`, with the same words: a person's receipt page no longer names a pack called "example" (Sherlock2 on evidencebook#956, ops a3c37efc). The pack's digest changes with its id (the id is part of the pack), and `go/receipt`'s scripts and manifests and `ts/src/receipt-core.generated.ts` change their hashes with it. The frozen Python twin's pack takes the same id with its own 0.25.0 words (#439), so its `static/receipt_*.js` scripts, `receipt_slot/manifest-*.json` and the oracle golden change their hashes with it; the parity tests read its pages with the current pack's digest. Pages written before keep their own scripts and pack, and still open.

### Added

- The History view draws a card page (#384, `docs/design/history-view.md` section 11): a deal page that carries its signed card bundle (`machine`: the bundle's canonical JSON and capsulectl verify's answer, bound by its `bundle_digest`) is drawn from that bundle in the x-deal-v1 receipt's look, as "Your History" (the holder's own copy, one row per deal entry, newest first, with the stamp row, the harbour seal on a deal ruled not met, and a link to its receipt) or as "<name>'s History" (a card someone was sent: counts only). It offers the bundle's exact bytes as "Download card" with the `capsulectl verify --bundle` line, and a scripted page shows times in the reader's zone. New optional `history-view/v0` members: `machine`, `deals`, `sample`. A static attribute may now hold a validated file name, time or percent-encoded download (no `<`, `>`, `"`; `&` written `&amp;`).
- A Mesh provider's own receipt, `capsuleviewer.receipt.provider/v0`, is in `go/receipt` (`receipt.Provider`, `receipt_provider.js`, `manifest-provider.json`) and the npm `./receipt` export (`RECEIPT_KINDS` gains `provider`) (#390). It is the frozen Python module's page, words unchanged: the node's own record of an exchange it served and the payments it received, the model, each amount with its unit and the time served in UTC. `checkReceipt` now answers `checked` with that module for a provider's receipt bundle at the owner's audience, where it answered `no_module`; at any other audience it is still `no_module`. The wording pack gains the page's words as `provider.*` keys and keeps its id, so its digest changes, and with it every receipt script's and manifest's `script_sha256` and `ts/src/receipt-core.generated.ts`; no other receipt draws differently.
- The x-deal-v1 receipt fills COUNTERSIGNED from its own check of a countersigned copy the page carries (#456, evidencebook#1015): `renderEvidenceGraph` takes `countersignedCopy: {bundle, countersigners}` beside capsulectl's report. On a copy capsulectl passed, the page verifies that bundle, classifies its countersignatures with AAC's classifier over its own digest under the rows given (a key either bundle declares as its producer's is the holder's own), and checks that its records 1 to k carry the capsule ids of the shown copy's records 1 to k. Only then does the stamp read "Countersigned by <name> at <time>, through record <k> of <n>." (Sherlock2's line, from u523 and u638), followed by "Its directory entry does not list it as independent of the parties." unless the signer's row lists both parties' keys (the holder's producer key and the counterparty key its sealed agreement names) in `independent_of` (u649, Sherlock2 on #457); otherwise it reads as without the copy. The runtime carries the result to the receipt as `countersigned_copy` in the x-deal-v1 entry it adds; `go/pageruntime` is rebuilt with it.
- `go/receipt` returns each receipt module's stylesheets: `Styles(kind)` gives copies of the kit stylesheet, the receipt's dark overrides and the receipt's own rules, in the order of the manifest's `style_sha256`, each with the SHA-256 the manifest pins at that index (#383). A page builder that loads modules from files, such as `capsulectl presentation build`, needs these beside `Module`'s script (evidencebook#869). `go generate` writes byte-identical copies of `kit.css` and `kit-dark.css` into `go/receipt` from `src/capsule_viewer/static`, which stays the one source.
- A page or the receipt API can carry capsulectl's own verify report for an x-deal-v0 copy too (#383, CV3b), bringing the two deal-view lines only capsulectl can check: the holder's own book's witness time (u219) and the countersign rung it resolved (line 9 of Sherlock2's ruling on the deal-view lines). The report is read only when it is this bundle's (format, `bundle_digest`, record identities) and has exactly one `x-deal-v0` entry, in any report form (a Mesh copy seals its report in the log). Its field contract and fixtures are in `tests/testdata/deal-v0-report/` (README):
  - `witnessed` (`{status, witness, at}`, as for x-deal-v1): drawn only on the holder's own keep copy drawn for the holder, in the u219 words, in place of the header's witness notice; never on a shared copy or a page or report shown to others.
  - `countersign` (`{directory, countersignatures_sha256, entries}`, each entry capsule-cli's `CountersignatureReport`): bound to the copy by the SHA-256 of the JCS of its `countersignatures` array, one entry each with its signer's key id, in order. Each countersignature gets its own line in capsulectl's voice, naming the directory: a resolved signer and its results, not independent for the producer's own key, an unknown signer by its key, or a type capsulectl does not check. An unbound member, or one with any malformed member, is ignored, and the page keeps its own countersign line.
  - A failing `x-deal-v0` entry refuses the copy with "Didn't verify: capsulectl deal verify reported that this deal's records did not pass."; a bound entry in state `invalid` with "Didn't verify: capsulectl deal verify reported a countersignature on this file that does not verify." A verdict other than VALID (or INCOMPLETE only as a producer selection) refuses it as for x-deal-v1.
  - The page's own check of a standalone report (#397) stays the page's: the receipt module receives capsulectl's members in an `x-deal-v0` entry marked `reported_by: "capsulectl"`, with no status. `verifierReportReading` is now async (it hashes the countersignatures). `go/pageruntime` is rebuilt with it.
- The x-deal-v0 seller copy draws the settlement line too, with its proof checked as on the buyer receipt (in the page and in the npm `./receipt` export), and its own payment lines follow it (#383): with a settled leg, the headline's payment no longer says "Not recorded in this copy" but follows the line's state (for example "Settled on Lightning; this page checked its proof against its invoice" or "Recorded as settled on Lightning; this copy does not show its proof", in the settlement line's words), the Payment section says the copy carries a payment record, and the legs table says the payment leg is recorded. With no settled leg they read as before.
- An x-deal-v0 receipt (the buyer receipt and the seller copy) names its deal after its title ("Deal report · deal-…", from the sealed report's `deal_id`; none when the report names none, as a Mesh payer's does), and an adjudicator's copy names the referee its sealed report states, saying the page does not check that the other side named the same one, as capsulectl's deal view did (#383, line 8). No fixture's adjudicator copy seals a referee yet.
- An x-deal-v0 receipt (the buyer receipt and the seller copy) shows its sealed report's authority blocks in its detail, as capsulectl's deal view did (#383, line 5): for each act, the layers it relied on in the report's order, each with its time and step, and an act they did not cover flagged. They are the holder's computation, shown as sealed text that the page says it does not check. capsulectl writes them on the holder's own copy of a deal sealed in typed records only, so among the fixtures only the seller's own copies show them.
- An x-deal-v0 receipt (the buyer receipt and the seller copy) says whether each act came after the holder's yes, recomputed in the page from the order of the copy's deal log as capsulectl's deal view recomputed it (#383, line 4): an act's approval must proceed and come before it, answering its check's verdict first; standing intent approves only a passing verdict; on typed records an evaluation must say DO, or the user's own approval answer an ASK; and the check must be about that act. The line says passed, failed (naming the act, by its sealed line or its action), missing (an approval's record withheld) or not checked (a step withheld, or steps with no place in a book's log, as in every fixture but the main-standalone copies), then how each act was approved, as recorded. Another's copy, or a page for others, names the holder instead of "your".
- An x-deal-v0 receipt (the buyer receipt and the seller copy) names who the deal was with and quotes their words accepting the offer, when its sealed report opens them, as capsulectl's deal view did (#383, line 3 of Sherlock2's ruling on the deal-view lines). The page recomputes each itself, with no value from capsulectl's page: a name, site, phone or email against the keyed fingerprint its step sealed (HMAC-SHA256 over the value normalized as evidencebook's `dealprofile` normalizes it), the words against the acceptance's sealed commitment. Only what recomputes is shown; anything else is said not to be shown. A site's registrable domain is matched without the public suffix list (any suffix of two or more labels), and a site name in another script or in punycode reads as not checked, since the page does not follow IDNA. The line is drawn whenever the copy opens them; capsulectl's counterparty copies carry neither (u499, enforced where capsulectl writes the copy), and draw none.
- An x-deal-v0 buyer receipt says how its payment settled, a line capsulectl's own deal view drew and the viewer now draws instead (#383, Sherlock2's ruling on the deal-view lines). From the copy's settled payee-observed legs: on Lightning, the page checks each leg's proof against its invoice (`paymentPreimageCheck`) and says only what it checked: "settled" in the page's own voice only when it checked every proof ("this page checked its proof against its invoice"); otherwise "recorded as settled" with what the page could not check (the proof did not match, is sealed and can't be checked here, is not in this copy, or is carried for only some payments so none was checked), or "the payee's wallet reported it final" when no leg carries a proof (u203, u94; Sherlock2's wording); the npm `./receipt` export checks the proof too; x402 and other rails are "recorded as settled" with what the page does not check. With no leg, an action naming a rail says no settlement record is in the file; the simulated rail draws nothing, since test money is said once at the top. The exchange's size follows ruling u94: one band for the exchange, never per leg, and none for a zero or absent amount. The seller copy draws it too (see below); the two-sided receipt does not.
- A page or the receipt API can carry capsulectl's own verify report for an x-deal-v1 copy, so its receipt draws (#405 route 1). A page cannot run the x-deal-v1 report rule itself. With `verifierReport` (the output of `capsulectl deal verify --bundle`, `capsule-cli-result/v1`) given to `renderEvidenceGraph`, `checkReceipt` or `renderReceipt`, the report is read only when it is this bundle's: its format, its `bundle_digest` and its record identities, as the Python twin checks them.
  - When it passed, the v1 receipt draws, and its line says so in `summary.standalone`'s words: "capsulectl verify reported its signature check as: pass. This page did not check the signature itself."
  - When it failed, the copy is refused (Sherlock2):
    - when its x-deal-v1 entry did not pass: "Didn't verify: capsulectl deal verify reported that the deal report carried outside the log did not pass.";
    - when the entry passed but the verdict is not VALID: "Didn't verify: capsulectl deal verify reported this bundle as <verdict>.", never that the report failed. A producer selection (INCOMPLETE only because the interval coverage is withheld as `selection_not_checkable`) is not refused: its receipt draws, as the Python twin reads it.
  - A missing report, or another bundle's, keeps the can't-check line (#407). A report is read only for a bundle that is an x-deal-v1 copy with a standalone report. Capsulectl's passing entry reaches the receipt module only, never the page's own checks or extension rows.
- An x-deal-v1 receipt drawn from capsulectl's report says when the copy carries the other party's half and capsulectl reported it verified (`counterparty_half` in its x-deal-v1 entry, evidencebook#886): "Signed by both sides: this copy carries the other party's signed agreement, recorded in their own book. capsulectl verify reported it as verified; this page did not check it itself. It covers their agreement only, not anything after it." On such a copy the countersign line no longer reads as unsigned: "No countersignature in this copy (a separate signature over the whole copy). The other party's own signed agreement is the line above." A half with any other status, or none reported, draws no line, and the countersign line is unchanged.

### Fixed

- The banner frame check after a module renders no longer misses what the module draws on its next frame when a busy page draws that frame more than 100 ms late (#500, #492). The check waited for the first of the next frame and a 100 ms timer; now a shown page waits for its next frame however late it comes, and the timer stands in only while the page is hidden. A page shown again before that timer fires waits for its frame after all. `go/pageruntime` is rebuilt with it.

- A downgraded x-deal-v0 copy, whose `x-deal-v0` block names no sealed report and carries the report's text inline (a page from before reports were sealed, or a hand-edited one), no longer draws as a plain page of records with nothing saying a receipt was left out (#452). The buyer receipt and seller copy modules draw two lines in its place, in one block marked `data-cannot-check-reason="downgraded"`: "⚠️ The receipt's text is not shown: this copy names no sealed report, so its text could not be checked." and "`capsulectl deal verify --bundle <file>` reports this copy as INVALID (sealed_report_not_named)." Nothing from the inline text is shown. The npm `./receipt` export returns `{kind: "cannot_check", reason: "downgraded"}` for it, with both lines in `receiptPageLines` and "receipt text not checked" as its row label. The wording pack gains the three keys, so `go/receipt`'s scripts and manifests and `ts/src/receipt-core.generated.ts` change their hashes.
- The receipt's can't-check lines that name a command (the downgraded copy's verdict line and the x-deal-v1 "To check it, run ..." pointer) no longer show the wording's Markdown backticks as characters (#454). The receipt modules draw the command as inline code (`<code class="cv-mono">`) in the same line, words unchanged, and the npm `./receipt` export's `receiptPageLines` returns the same words without the backticks, since its callers draw them as text. `go/receipt`'s scripts and manifests and `ts/src/receipt-core.generated.ts` change their hashes.
- The x-deal-v1 receipt page, as Steven's ARD hand run of 2026-11-25 read it (#424, #429, #430, #431, #432; words by Sherlock2 where she gave them):
  - Terms are named in words, "Payment as agreed", "Delivery" and "Item as described", not by id (#429). The id stays on the element (`data-row-id`, `title`); a term id the wording pack does not word is shown as it is. The viewer's names are a stand-in until a deal terms pack carries term text; then the pack's name wins (Sherlock2). A side or a term name in a table breaks between words, never inside one ("buye / r"): `go/receipt/receipt.css`, the receipt's own rules, scoped to a receipt, which the receipt modules insert as a third stylesheet. Each receipt module's `style_sha256` gains a third pin, for `receipt.css`, and its script pin changes; `kit.css`, `kit-dark.css`, their pins and the Python receipt modules do not change.
  - "Where it stands" on a started deal that is not settled also says where its terms stand, as the rows give them: "Started · Terms: Both say the same so far (2 of 2)", so it no longer reads "Started" beside two terms met (#430). It counts the statuses shown, beside the deal-level line (`data-deal-terms`, outside `data-deal-state`): it is not a deal state and claims no close.
  - The table of the records each term's status rests on says each time in the reader's own zone, as the header does, instead of raw UTC (#431). Only the holder's own page shows a record's time (u239, below).
  - Where no payment record is among the records the terms rest on, one line says why, of those records together: they are the sides' own statements, statements and other deal records, or other deal records, or no term rests on any record yet (#432).
  - "Time from a named witness" on the holder's own page says "yes, as your report states it", not a bare "yes", so the page never asserts a witness it did not check (#424). A record's time and named-witness flag are the holder's own report's, so a counterparty's or adjudicator's copy, or the holder's copy carried in a page or report for others, lists the records each term rests on with no record time and no named-witness column (Sherlock2, u239; the producer side is evidencebook#963).
- A receipt's "Deal" line words `service` and `rental` as "Service" and "Rental" (#391, Sherlock2), so a Mesh exchange reads "Deal: Service" instead of the raw value. These are the two `deal_type` values the x-deal profile allows that the wording pack did not word.
- A receipt follows its page's colour scheme (#391). On a page that declares a dark scheme (`color-scheme: light dark` in dark mode, as the Mesh saved page does), the receipt is drawn dark instead of as a white block. A page that declares none, such as the emitter's shell and the report pages, keeps a light receipt. The dark colours are `tokens/tokens.json`'s new `kit-dark`, generated into `kit-dark.css`, which the receipt modules insert as a second stylesheet that applies inside a receipt only. A browser without CSS `light-dark()` keeps the light colours. Each receipt module's `style_sha256` gains a second pin, for `kit-dark.css`, and its script pin changes; its `kit.css` pin, `kit.css` itself, the kit's other modules and the Python receipt modules do not change.
- An x-deal-v1 receipt shows its times in the reader's own zone, as the page is viewed. The data keeps UTC (#423, Sherlock2):
  - "As the holder computed it at …", due times, the contest window's end and payment times are local, with the zone;
  - a deadline (due, window end) says its UTC time beside the local one, for example "Dec 2, 2026, 12:56 PM CST (18:56 UTC)";
  - a value that is not a full UTC timestamp is shown as stored.
- On the holder's own x-deal-v1 page, when capsulectl verify reported the book's witness time verified, the receipt says it in one line: "Time-stamped by <witness> at <local time> (<UTC time>), as capsulectl verify reported on your own book. This file carries no witness receipt, so this page did not check it itself." The page's header line "This file carries no witness receipt, so this page could not check a time-stamp itself." is left out on that page only, so a reader who stops at the header no longer takes it as "not stamped" (#424, Sherlock2). Shared copies, and failed, withheld or not-reported pages, keep the header line.
- An x-deal-v1 keep page says your own book's witness time as capsulectl reported it, and only as reported (Sherlock2, u219); a shared copy, or a receipt shown as a shared page or report, never does. `capsulectl deal report --html --witness-directory W` runs verify with the stamp proof beside the copy, and the page carries only verify's `witnessed` (evidencebook#935). The receipt's witness line then reads one of:
  - "Time-stamped by <witness> at <time>, as capsulectl verify reported on your own book. This page did not check it itself.";
  - "capsulectl verify reported that your own book's witness time-stamp did not verify, so no time-stamp is shown. This page did not check it itself.";
  - "capsulectl verify found no time-stamp for your own book from the witnesses it was given. That does not mean there is none. This page did not check it itself."
  With nothing reported, the line is unchanged.
- Every x-deal-v1 page this runtime draws (`renderEvidenceGraph` and the receipt API), keep and shared, says "This file carries no witness receipt, so this page could not check a time-stamp itself." in place of "No witness this verifier trusts has vouched for this log…", which invited a reader to take the holder's book as never witnessed. No x-deal-v1 copy carries witness evidence (u219). Other profiles' pages are unchanged.
- On a receipt page refused because of capsulectl's report (#417), capsulectl's line sits under its own heading, "Reported by capsulectl verify". It is no longer under "Failed on this page", which now names only failures the page found itself and is left out when capsulectl is the only reason. The folded summary no longer counts capsulectl's reading as "a check on this page failed" (Sherlock2: a heading names only what the page itself checked).
- A receipt page (the receipt modules in its registry, as go/emitter's module slot puts them) refuses a deal copy whose standalone report fails the page's own check, as a report and the receipt API already do since 0.27.2 (#412, Sherlock2). Before, it drew the copy under "✓ Unchanged since it was sealed" with the built-in fallback page, because the bundle's own checks pass. Now it gets agent-action-capsule's refused banner ("✗ This bundle did not verify: do not rely on it"), no module and no fallback page. Its records and payloads are not shown, and its banner reads as invalid, as for any bundle that did not verify. "Failed on this page" names each condition that failed, for example "Didn't verify: the deal report carried outside the log was not signed by the deal's last step."; the others are "does not match its Capsule", "was not made at this deal's checkpoint", "is not a report of this deal", and "this deal's log has more than one report record, so the page can't tell which report counts". The bundle checks that passed stay beside them. `dealStandaloneReportFailures` gives those conditions, and the report path and the receipt API use the same module.

## ts 0.27.2 and go 0.27.2 (2026-11-25)

Both state viewer 0.27.2: `ts/v0.27.2`, then `go/v0.27.2` on the commit that ships its page runtime. A standalone report the page checked itself says so, and a failing one reads as not verified (#411); an x-deal-v1 receipt a page cannot check says so and how to check it (#407); the History card fixes from the ARD hand run (#403); a test that waited a fixed delay (#409). evidencebook#880's settlement report takes this release.

### Fixed

- A deal copy whose standalone report this page checked itself (#398, #410) no longer says "capsulectl verify reported its signature check as: pass. This page did not check the signature itself." It says what the page checked: "This report's text is carried in the file outside the log. This page checked it itself: signed by the deal's last step, matching its Capsule, and made at this deal's checkpoint." (`summary.standalone.here`; Sherlock2). A copy drawn from capsulectl's report keeps `summary.standalone`. A copy whose standalone report fails the page's check now reads as a receipt that did not pass its checks: `did_not_verify` from `checkReceipt`/`renderReceipt`, and "This receipt did not pass its checks" in a report. Before, it read as having no module, as if it were not there (Sherlock2). An emitted receipt page's own top level still draws such a copy as a verified bundle; that predates #398 and is #412.
- The History card no longer repeats a card-level fact on every row, and no longer names a label its rows may not carry (Sherlock2, from the ARD hand run). A deal row draws its RECORDED stamp only when the deal report check passed. When the check did not run, the rows carry no stamp, and "How this was checked" says "Not checked here" once for the card. A deal page that does not list the check is read as not having run it, so that line is never missing. A failed check already drew no rows. "What this does not show" now reads "Each deal's outcome here is what this side recorded, not a confirmed outcome." (`callout.deals`; `callout.deals.picked` likewise), which holds whatever the rows' outcome labels are. A card titled with its holder's name ("History · {name}") names the holder there too: "what {name} recorded" (`callout.deals.named`). A failed card draws no callout. A picked card's summary line says "this side's record, not confirmed outcomes" in place of "steps recorded, not outcomes" (`hero.deals.picked.*`). The Go twin (`go/historyview`) changes the same way.
- A page that carries an x-deal-v1 receipt says it can't check it, instead of "This page has no viewer for this kind of receipt" (a report) or nothing at all (a receipt page). A v1 copy's report passes only under its profile's own rule (evidencebook `xdealv1.VerifyReportBundle`), which no page runs yet (#405 has the measured route). So on a page whose verifier reports no check of that report, the v1 module draws no receipt, only Sherlock2's line: "This page can't check this receipt, so it shows nothing from it and no verdict. To check it, run `capsulectl deal verify --bundle <file>` on the receipt file. It needs the capsulectl-deal plugin." (`row.cannot_check.report_rule`, `row.cannot_check.report_rule_pointer`). Its row label is "can't be checked here". A report draws the line in the receipt's panel. `checkReceipt` and `renderReceipt` give `{kind: "cannot_check", reason: "report_rule"}`; `renderReceipt` then draws nothing, as for any result that is not `checked`, and `receiptPageLines` carries the line, so a saved receipt page says it once. A v1 copy that does not verify still says so, and a kind with no module still has none. Given a verifier's report (capsulectl's), the v1 receipt is drawn as before.

The four receipt scripts change, so each receipt manifest's `script_sha256` changes, and the wording pack gains three keys. A consumer that pins the receipt modules takes the new manifests.

## ts 0.27.1 and go 0.27.1 (2026-11-25)

Both state viewer 0.27.1: `ts/v0.27.1`, then `go/v0.27.1` on the commit that ships its page runtime. The page's check of a deal copy's standalone report, which evidencebook#880's settlement report needs to draw capsulectl-deal's own receipts: #398.

### Fixed

- A receipt page draws capsulectl-deal's own receipts again (#397). Their report rides standalone in `x-deal-report/v0`, which the page's verifier does not interpret, so every receipt module declined them ("This page has no viewer for this kind of receipt"; `checkReceipt` gave `no_module`). The page's runtime now checks that report as `capsulectl deal verify --bundle` does for x-deal-v0 (evidencebook `standaloneReportEntry`): the record is the pointer's deal report; it is signed by the deal's last step's key; its payload is the one its Capsule commits; it is this deal's report for a copy audience; it binds this bundle's checkpoint and its time; and no report record is beside it. The receipt module reads the report only when that check passes. The check is the runtime's `dealStandaloneReport`, which the npm `./receipt` export also uses. An x-deal-v1 copy gets no answer until the profile's own report rule is checked here, so its receipt still declines. A composed receipt whose carried copies keep their report standalone also still declines: their reports are not asked about yet (#401).

The four receipt scripts change, so each receipt manifest's `script_sha256` changes. A consumer that pins the receipt modules takes the new manifests.

## ts 0.27.0 and go 0.27.0 (2026-11-25)

Both state viewer 0.27.0: `ts/v0.27.0`, then `go/v0.27.0` on the commit that ships its page runtime. The receipt carrier the Mesh plugin's saved receipt page needs (Mesh-LLM/capsules-plugin#378, Sherlock2): #396.

### Added

- A third receipt carrier, `"page"`, for a receipt page saved for anyone to check, such as a Mesh node's saved receipt page (#395, Sherlock2). `renderReceipt(…, { carrier: "page" })` draws the report's shared copy: no PRIVATE banner, no "you", and no prompts for the owner's agent. Two lines differ from the report's. The banner reads "This node's own record of this exchange, saved as a page for anyone to check. It is not the other side's copy." (`banner.page.text`), and the owner's half reads "This node's side · in its book" (`sides.ours.page`). The label stays "Shared copy".
- `receiptPageLines(result, { carrier: "page" })`: on a page for anyone, one side's own receipt is labeled "Receipt: this node's receipt only" (`row.one_sided.page`), not "your receipt only".

The four receipt scripts change, so each receipt manifest's `script_sha256` changes, and the wording pack gains three keys. A consumer that pins the receipt modules takes the new manifests.

## ts 0.26.1 and go 0.26.1 (2026-11-25)

Both state viewer 0.26.1: `ts/v0.26.1`, then `go/v0.26.1` on the commit that ships its page runtime. The receipt fixes Sherlock2 set as a condition on the Mesh plugin release counted toward #383 (#391): #392.
The four receipt scripts change, so each receipt manifest's `script_sha256` changes, and the wording pack gains `verify.tested_here`: a consumer that pins the receipt modules takes the new manifests.

### Fixed

- The receipt's top line no longer says the page "did not re-check anything itself" when the page's own verifier (agent-action-capsule in the browser) ran the checks. It reads "Checked in this browser by {verifier}: {checks}." (new key `verify.tested_here`). An outside verifier's report, such as capsulectl's, keeps "did not re-check anything itself" (#391, Sherlock2).
- A receipt page whose own check cannot run in this browser (no Ed25519, so no strict result) draws no receipt. It shows only "this browser can't check the receipt. Open the bundle in the offline viewer (capsule-viewer) to check it; this page shows no verdict for it." (`row.cannot_check`, `row.cannot_check_pointer`; #392, Sherlock2).
- The buyer's receipt has no Amount card when no signed field carries an amount, so "not present" never sits beside a paid deal that records its payment only in the producer's words, such as a Mesh node's (#391, Sherlock2). A copy whose acted step seals an amount keeps the card. The seller's receipt is unchanged.

## ts 0.26.0 and go 0.26.0 (2026-11-24)

Both state viewer 0.26.0: `ts/v0.26.0`, then `go/v0.26.0` on the commit that ships its page runtime. capsule-viewer becomes the one receipt renderer (#383): #385, #386, #387.

### Added

- Go: package `receipt` (`go/receipt`), the receipt modules for Go page builders (#383): `capsuleviewer.receipt.unilateral/v0`, `.seller/v0`, `.bilateral/v0` and `.deal/v1` as module-slot scripts, each with the manifest that pins it, through `receipt.Module(kind)` (a `go/emitter` module) and `receipt.ID(kind)`. The scripts started as the ones 0.25.0 ships; Changed below says what differs. The receipt source `receipt_core.js` and its writer now live in `go/receipt` (`go generate`); the Python package's copies stay frozen at 0.25.0.

- npm: export `@action-state-group/capsule-viewer/receipt` (#383), the same receipt modules for a page that bundles them itself: `receiptModules()` (the four modules with go/receipt's manifests), `checkReceipt(bundle)` and `renderReceipt(bundle, host, { audience, depth, carrier })`, which verify with agent-action-capsule's runtime and draw only a verified receipt, `receiptLabel(result)`, an exchanges row's one-line label, and `receiptPageLines(result)`, the lines a saved receipt page shows above it, both in the receipt modules' words (the owner's own row and page, not for a report; new pack keys `row.both`, `row.one_sided`, `row.none`, `row.cannot_check`, `row.did_not_verify`, `row.cannot_check_pointer`, `row.page.receipt`, `row.page.records_tied`). A checked result carries the runtime's banner line and how many of its records are tied to a signed checkpoint; a two-sided receipt whose composition or a carried copy failed did not verify, as does one whose banner failed. `go generate` in go/receipt writes its source, `ts/src/receipt-core.generated.ts`, from the same receipt script.

### Changed

- A deal receipt carried in a report opens with capsule-viewer's own receipt modules (#383): the page runtime's receipt list adds `capsuleviewer.receipt.unilateral/v0`, `.seller/v0`, `.bilateral/v0` and `.deal/v1` beside evidencebook's deal view, which stays until evidencebook's pages move. The runtime marks a carried receipt's panel `data-receipt-carrier="report"`, and the owner's own copy there carries the badge "Shared copy" and the line "The report owner's own record of this deal, included in this report because their "Receipts in the settlement report" setting is on. It is not the counterparty's copy." in place of the PRIVATE banner (Sherlock2's ruling; wording keys `banner.shared.label` and `banner.shared.text`). In a report the page's own words never say "you" or "your": each such key has a `<key>.report` form in the pack ("the owner", "the owner's", "the buyer" on a counterparty's lines), the owner's half of a two-sided receipt reads "The report owner's side · in their book" (`sides.ours.shared`), "Your receipt only" takes its existing `.shared` form, and the prompts for the owner's own agent ("Tell your agent:") are left out. Words the producer sealed are shown as recorded. Standing alone, every copy keeps its lines, its PRIVATE banner and its prompts. Each receipt manifest also lists `"*"`, which matches every audience, including the one a report opens a receipt for; so `presentation build` at its default audience resolves a receipt too.
- The receipt modules accept a producer-selected bundle (interval coverage withheld as `selection_not_checkable`, as a Mesh node's receipt is) on its other checks, as agent-action-capsule's page verdict does; before, the page verified such a receipt and the module declined it.

## ts 0.25.0 and go 0.25.0 (2026-11-24)

Both state viewer 0.25.0: `ts/v0.25.0`, then `go/v0.25.0` on the commit that ships its page runtime.

### Changed

- The receipt page's presentation rules R1 to R8 (#374, #373): the top line states the verifier's outcome with the checks it ran, test money is said once, sealed tokens read as words, one "Problems spotted" section, and layout fixes (the "Step" table header no longer breaks). `kit.css` changed, so every kit module's `style_sha256` pin moves; consumers that pin a module script or the three ledger page goldens see new pins.
- The words "all" and the per-check form of the verification line are wording-pack keys, `verify.checks_all` and `verify.check_one`, in both twins (#377, #375). The words on the page do not change.

## ts 0.24.0 and go 0.24.0 (2026-11-24)

Both state viewer 0.24.0: `ts/v0.24.0`, then `go/v0.24.0` on the commit that ships its page runtime.

### Added

- The History view's `witness` check takes optional `values` `{ n, at }` when its status is `not_run` (#368; capsules-plugin#358, Sherlock2's rulings): `n` is the 1-based place of the checkpoint row the witness has not registered yet and `at` that row's own `cut_at`. The "How this was checked" line then reads "Not checked here: A witness time-stamped these records. Checkpoint {n} (cut {at}) is not registered with the witness yet.", so the line and the chip's "Time-stamped: N-1 of N" name the same checkpoint. The view refuses `values` unless the page is a checkpoint page, `n` is one of its rows, that row's time-stamp slot has not passed and `at` is its cut time; `values` on any other check, or on a witness check that passed or failed, is still refused. The TypeScript `values` type is now `{ n: number; at: string }`; an empty `values` object on that check still means no values. New wording key `check.line.unregistered` (Go and TypeScript packs), the whole line, so a language pack or overlay sets its own sentence break.

## ts 0.23.1 and go 0.23.1 (2026-11-23)

Both state viewer 0.23.1: `ts/v0.23.1`, then `go/v0.23.1` on the commit that ships its page runtime.
### Fixed

- `readerCadenceWitness` reads `parent-log-witness/v1` (Evidence Bundle -03), so the deal page's witness stamp line reads "recorded by <witness> at <time>" for a witnessed v1 bundle instead of "not checked" (#362; evidencebook#826, Sherlock2's ruling on capsule-cli#428). It reads the block as agent-action-capsule's `verifyParentLogWitness` does: the log member is `parent`, a block that is present is the claim (no `state`), coverage is `earlier` when that member is present and never a stated `extent`, and a path holds 0 to 32 lowercase hashes with `index` below `2**path.length`. A v1 block wins over a v0 chain beside it, and a block that is not an object fails as `parent_witness_malformed`. The v0 names still work, the result type and the page's wording are unchanged.

## ts 0.23.0 and go 0.23.0 (2026-11-23)

Both state viewer 0.23.0: `ts/v0.23.0`, then `go/v0.23.0` on the commit that ships its page runtime.

### Added

- A deal with no receipt yet reads "No receipt: this deal had not closed when this page was built." on a contract report page (#358, Sherlock2's what: keep the deal in the Result, never "never closed"). The page's `receipts` setting takes `{ "state": "not-closed" }` for such a deal (`DealReceiptEntry`, `ReceiptNotClosed`), and the Go emitter takes `OfflineOptions.ReceiptsNotClosed`, apart from `null` (the holder's policy keeps the receipt off) and a missing deal (still "Receipt not carried with this page", a page built wrong). An object entry the page does not know reads as not carried. The Go option reaches a page only from the release that refreshes the embedded page runtime. The evidencebook builder's matching `--receipts` value is a separate task.

## ts 0.22.0 and go 0.22.0 (2026-11-23)

Both state viewer 0.22.0: `ts/v0.22.0`, then `go/v0.22.0` on the commit that ships its page runtime.

### Added

- A contract report whose claims are deals opens the 9b receipt module from each deal line (#228, capsules-plugin#96 button 2, Steven's ruling that current strength counts): the page's new `receipts` setting (a deal id to that deal's receipt bundle as the node served it, or `null` for a receipt the holder's disclosure policy keeps off the page, which says so apart from one not carried) gives each claim of a carried deal an "Open receipt" control that draws the receipt under the claim with the receipt module the page carries, and says "Receipt not carried with this page" for a deal whose receipt is missing. A receipt that is not JSON says it could not be read, one that does not pass its checks says so, and a verified one no receipt module takes says the page has no viewer for that kind of receipt; the page pairs a claim with a receipt by the deal id key alone and trusts the builder's filing. The generic pack gains `generic.receipt.*` words (locked), so its `wording_sha256` changes. The Go emitter takes it as `OfflineOptions.Receipts` (deal id to receipt JSON text) and `OfflineOptions.ReceiptsWithheld` (deal ids sent as `null`), and refuses a receipt that is not JSON, a deal id that is empty, `__proto__` or contains `::`, and a deal both carried and withheld.

### Fixed

- The generic contract-report view's stylesheet is listed in the offline page's content security policy (`runtime-style-hashes.txt`, `CORE_RUNTIME_STYLES`); it was inserted at render time but not listed, so a browser blocked it.
- A report page's "How this page was checked" link opens its own verification section when another render sits inside it.

## ts 0.21.0 and go 0.21.0 (2026-11-22)

Both state viewer 0.21.0: `ts/v0.21.0`, then `go/v0.21.0` on the commit that ships its page runtime.

### Added

- The EU AI Act card reads the renamed template `eu-ai-act-obligations-report/v2` (#349, evidencebook-skills#201, Steven's ruling of 2026-11-23: drop severity and retrain advice, keep the report layout): the same grouped obligation layout, with each finding `{id, observed, owner_due}` drawn as what was observed and its owner, no severity pill and no advice line (a `severity` or `recommendation` a producer still writes on a v2 finding is not read). A report sealed with `eu-ai-act-compliance/v1` reads and draws unchanged. The card is drawn through `contract-report/v1`, which the pack's compiler writes beside the template block; a v2 block with no `contract-report/v1` is drawn by the generic Result page. The v2 row on the verification page reads as interpreted by the card (the v1 row only when no v2 block is accepted). The page's basis footnote for a v2 report names the producer's finding ids, what each finding observed, its owner and due date instead of severities and recommendations (two new locked entries in the EU AI Act wording pack, so its digest and the four EU goldens' printed digest change). The card reads the v2 block first, then the v1 block; each key's own reader decides whether that block is engaged. No built-in manifest, Go, Python or vector change.

## ts 0.20.0 and go 0.20.0 (2026-11-22)

Both state viewer 0.20.0: `ts/v0.20.0`, then `go/v0.20.0` on the commit that ships its page runtime.

### Added

- The contract-report module shows a claim's `reason` beside its verdict and grade (agent-action-capsule `spec/evidence-result-v0.md` section 4.4, AAC#658, @action-state-group/agent-action-capsule 0.16.0; #344, the sentences adapted from Sherlock2's wording on evidencebook-skills#207): the pack's sentence for the token under the new key `row.<requirement_ref>.reason.<code>` (`spec/contract-report-module-v1.md` sections 2 and 3), else the core's own words for the four registered tokens, else the raw token (an unregistered token is always raw), labelled as the producer's statement; a `finding` token in the warning tone, a `setting` or an unregistered token neutrally; a not-yet-in-force claim's reason under its readiness label; a count in the row's summary; nothing on a claim that failed verification. The pack's key applies only to a Result citing one contract; the reason itself shows on any Result. The Outcomes and EU cards draw no claim row and show no reason. It is display-only: no verdict, grade, tally, bucket or count changes, and it reads no `x-` member. The generic pack gains `generic.reason.*` words, so its `wording_sha256` changes; the example pack carries the four registered tokens' sentences. The ts package now pins agent-action-capsule 0.16.0.

- The History card page shows a card statement's Receipt and the `card_registered` result (agent-action-capsule `spec/standard-history-v0.md` section 13, AAC#641; #342, evidencebook#616, Steven u618, u620 and u621): the `x-standard-history/v0` block takes an optional `card_statements` member (hex card statements beside the card), the runtime's new `readerCardRegistered` runs agent-action-capsule's `checkCardRegistered` under the reader's own list for the key the card is signed with, and the page draws "Registered with <service> at <time> by the key this card is signed with" for a pass on a standard card, or says a statement came and did not pass or was not checked. It shows existence at a time and nothing else: no claim that the service checked the counts, the deals or the anchor, or that it is the key's only card; `anchor_inclusion` stays not checked and the level reached is unchanged. A block member older module copies do not know makes them refuse the bundle. Vectors: `vectors/card-registration-v0` (a copy of agent-action-capsule's at 3072014e). The ts package now pins `@action-state-group/agent-action-capsule` 0.15.0, which carries `checkCardRegistered`.

- The v1 deal receipt page shows the payment records an adjudicator copy carries (#340, Steven's ruling u532 part 3, Sherlock2's discussion round): a copy that withholds the rows has no term to tie a record to, so the page draws the settle legs of the extension's `book.relied_on` in the book's order, without the Term column, with the side column showing the settlement's own `sealer_role` ("Sealer, as recorded"), and a note that the terms are withheld, that the page does not check who signed the records and does not judge the payment, and its own none line when the book holds no settle leg. It draws no "payment check above" wording in that copy. The wording pack gains three words, so its digest, the manifests, the scripts and the frozen golden's digest change; the Python twins are unchanged.

- The v1 deal receipt page shows the payment legs a payment row relied on (#330, evidencebook#588 and #597 in v0.22.0, Steven's ruling u532): it reads the `x-deal-v1` extension's `book.relied_on` (each record the rows rely on, keyed by record id) and, for each row's `relied_on` record that carries a `settlement` member, draws that member as recorded (the leg, status, the money members `amount`, `received` and `receive_fee`, `observed_at`, `payment_ref`, the record id), so a seller's copy shows the payment its own received leg records. It picks no leg and derives no verdict: `check` stays the only verdict, and the page says it does not check who signed a record (the side is the report's own). Like evidencebook's `VerifyReportBundle`, it declines a bundle whose extension has no `book`, has a member beyond `sealed_report` and `book` (or `agreement` and `relied_on` in the book), holds a pair not keyed by its Capsule id, lacks a record a row relies on or holds one no row relies on. A money member it cannot write as a decimal is shown as recorded. A v1 bundle carrying only `sealed_report` (no `book`) now declines; none is known to have been handed out, since evidencebook-deal's v1 deals serve no report command yet (its `x-deal-v1` commands answer "not served for x-deal-v1 deals yet", evidencebook-deal#212 open at origin/main), and evidencebook#597 is the first producer of the extension's book. The report vectors are refreshed to evidencebook v0.22.0 and `tests/testdata/deal-v1/report-bundle-vectors.json` holds its bundle vectors; `js-tests/receipt_deal_v1_legs.test.js` draws each accepted case and declines the shape refusals. The wording pack gains the payment-records words, so its digest, the manifests, the scripts and the frozen golden's digest change; the Python twins are unchanged.

- The History card page reads and draws a `standard_history/4` card (agent-action-capsule `spec/standard-history-v0.md` section 12; #337, Steven u616): a deal with no witnessed time is counted and shown in the local results, never left out; its entry carries `no_witness_time` and the card has no `not_counted` tally. `/3` is read as before and refuses `no_witness_time`. Reads `/4` as agent-action-capsule#636 (python/v0.18.0) published it.
- The History card page (`capsuleviewer.standard-history/v0`) reads and draws a `standard_history/3` card (agent-action-capsule `spec/standard-history-v0.md` section 11; #324, evidencebook#461): the check is AAC's reference `check_card` (every case of `vectors-3.json`, 27, runs in `js-tests/standard_history_3_card.test.js`), the check recounts from the deal entries' term rows by the section 11.3 outcome order, but the page has no shelf handover, so a `/3` card's `counts_recompute` stays NOT_CHECKED (section 11.7) and the page only says the entries in a holder's own copy add up to the card, and the page draws remedied, not honoured, why deals are not counted, the coverage start and the local results (section 11.8). The block's `as_of` may carry `coverage_start_time`, which a `/3` card needs. `/1` is unchanged; a `/2` card is still not a standard card on this page. The manifest's `script_sha256` and `wording_sha256` change.

- The v1 deal receipt page refuses a report member spelled otherwise than a field name at any level it reads (evidencebook#559, #562): another case (`Status`, `AGAINST`), U+017F long s (`ſtatus`) or U+212A Kelvin sign, beside the real name or in its place. The reader reads exact names only; it now declines the report instead of ignoring the second spelling. The report's own text and a term's `owed` are free-form and left alone. Held in `js-tests/receipt_deal_v1_names.test.js` on real reports; evidencebook's `pair-names` vectors are sent and book pairs, which this page does not read.

- The v1 deal receipt page refuses what evidencebook's VerifyReport refuses since #558 (the vectors file has 36 cases; the 29 that read the report's own payload or its pair are run in `js-tests/receipt_deal_v1_verify.test.js`, and the 7 that need signatures or the deal's first record are `capsulectl verify`'s): a report pair whose members are not exactly `record` and `agent_input` (no `Record`, no second `Agent_Input`), a present `rulings_unnamed` that is not a positive count, a present `disputes` that is not a non-empty list, and a `rests_on.witnesses` that is not a list. The first was already the reader's rule for the pair; the vectors now hold it.

- A v1 deal receipt module-slot script, `static/receipt_deal.js` (`capsuleviewer.receipt.deal/v1`, manifest `receipt_slot/manifest-deal.json`; #322, evidencebook#461): it reads the `x-deal-v1` sealed report (evidencebook `docs/design/461-deal-profile.md` section 9) and shows each term row's computed status as the report gives it, the deal-level line as the start state and "settled" or nothing, and an adjudicator's copy as "withheld" rather than "no rows". It never computes a status and declines a word outside the report's closed sets. The three `x-deal-v0` receipt modules are unchanged and still read a v0 deal's close. The wording pack gains the `deal.*` entries (Sherlock2 reviews them); the oracle golden is regenerated for the new pack digest only. `manifest-provider.json` now also forbids `x-deal-v1`. The page is held to evidencebook's real output: the 16 report vectors (`testdata/deal-v1/report/vectors.json`, evidencebook main 3c5cb7e) all draw, a ruled payment's remedy reads `not_counted` ("a payment, ordered by the ruling; not checked yet"), and the VerifyReport vectors (`report-verify/vectors.json`, evidencebook#555, #556 and #558) are applied for what the report's own payload holds: a ruling's `against` is `buyer`, `seller` or null and always present, a row's `owed`, `relied_on` and `late` lists and the `report` text are not null or mistyped, `rulings_unnamed` is a positive count, a `relied_on` entry's `witnessed` matches whether it has a time, a top-level member outside §9 or a v0 profile declines the report (a deeper extra member is `capsulectl verify`'s check, as it reads the report as Go does). The signature and its binding to the deal's first record are `capsulectl verify`'s check, which the page shows and does not repeat; the page says a report that passes it shows who signed it and which deal it covers, not that each term's status is correct; a ruled payment's remedy shows whether the owing side recorded making it, as unchecked.

### Changed

- The module-slot writer for the receipt scripts moved out of the deprecated Python `capsule_viewer.receipt` package (#71): `python -m capsule_viewer.receipt_slot --write` (and `--check`) replaces `python -m capsule_viewer.receipt.module_slot`. The example wording pack (`wording-en.json`) and the three module-slot manifests (`manifest-<kind>.json`) moved with it to `capsule_viewer/receipt_slot/`; the writer reads each manifest and replaces only its `executable` block. The shipped scripts change only in three comment lines that name the new command, so each manifest's `script_sha256` changes (the wording pack's bytes and digest do not); a plugin that pins the old digests takes the new manifests. The scripts' behaviour is held to a frozen golden of the Python modules' output (`tests/testdata/receipt/oracle-golden.json.gz`). This meets one of the removal conditions in the 0.19.0 notes (the writer has moved out); the others stand.

## ts 0.19.2 and go 0.19.2 (2026-11-17)

Both state viewer 0.19.2: `ts/v0.19.2`, then `go/v0.19.2` on the commit that ships its page runtime. This release carries #328.

### Changed

- The x-deal-v0 receipt pages no longer say capsulectl wrote text it did not (#328). The sentences that named capsulectl as the writer of the sealed summary (`summary.sealed`, `summary.lines`) and of the amounts read from a merchant email (`merchant.intro`) now take the producer from the records: the name the one producer every disclosed step records (version and commit stay in the provenance line), else "the producer"; a report carried outside the log is always "the producer", since no record of the log says who wrote it. A receipt sealed by another producer, such as the Goose reference, which records none, no longer reads as capsulectl's. `provenance.unrecorded` says "a producer that did not record its version", and a producer record with a version but no name is shown as "an unnamed producer", not "capsulectl". `summary.lines` no longer says "on this device", and `merchant.intro` says the seal shows the bytes were kept unchanged and is "the sealer's own record" instead of "our own record". The wording pack (`wording-en.json`) and the three module-slot scripts change, so each manifest's `script_sha256` and the pack digest change: a plugin that pins them takes the new manifests. The Python oracle and its frozen golden change with them, and the golden gains a case with no producer recorded.

## ts 0.19.1 and go 0.19.1 (2026-11-17)

Both state viewer 0.19.1: `ts/v0.19.1`, then `go/v0.19.1` on the commit that ships its page runtime. This release carries #325.

### Changed

- The bundled `@action-state-group/cll` is 0.4.0 (was 0.3.0, #325). The page runtime's checkpoint verifier now accepts the bare log id as the COSE subject that checkpointed-local-log go v0.4.0 writes (the -02 checkpoint subject); with 0.3.0 such a checkpoint was refused as `checkpoint_authentication_invalid`. The contract-report goldens change only in the viewer and cll version strings they name. The published `@action-state-group/agent-action-capsule` 0.14.0 declares an optional peer `cll` 0.3.0, which npm refuses (`ERESOLVE`) next to the direct `cll` 0.4.0, so `ts/package.json` overrides that peer to the direct dependency's version; agent-action-capsule's `main` already pins 0.4.0 but is not yet released, and a later viewer release drops the override once an AAC release accepts cll 0.4.0.

## ts 0.19.0 and go 0.19.0 (2026-11-16)

Both state viewer 0.19.0: `ts/v0.19.0`, then `go/v0.19.0` on the commit that ships its page runtime. This release carries #291 (the Studio home, with #305 and evidencebook-skills#146), #302 (the backfill timeline), #303 (the imported headline), #87 (a wording pack with a `core.` key is refused at load), #310 (PR #312, dark History view), #68 (PR #313, the not-yet-in-force section), #71 (PR #314, the Python receipt deprecation), the agent-action-capsule/go v0.21.0 pin (PR #309) and the test change in PR #315 (#99). The Python `capsule_viewer.receipt` package is deprecated in this release (in the repository source at this tag; the Python package is not published): it emits a `DeprecationWarning` on import and is planned for removal in a later release, under the conditions listed under Deprecated below.

### Added

- Page vectors for `contract-report/v1` (#99, `vectors/contract-report-page/`): Result-rooted bundles with a view, and the page sections drawn from them as structured data, the core strip (banner, identity, coverage, the three tiles) asserted apart from the module's rows, with negative cases (a claim the bundle does not carry never appears; a not-evaluable claim stays not evaluable). Generated by the TypeScript renderer and checked in CI against the committed files and `SHA256SUMS`; made-up fixtures only. Listing in agent-action-capsule's vector index (agent-action-capsule#420) follows.
- The Studio home (#291, design note `docs/design/studio-page.md`), in `ts/src/studio-view.ts`: `studioViewHtml` and `studioViewDocument` draw the loop diagram ("switched on" only from a history line that says `in_force`, never from a publish), the readiness table, a term map of the active pack on request, and the switch between packs' report pages, from a viewer-owned `studio-view/v0` input built from the `terms` workspace files. The page is static and labels its embedded snapshot as workspace data, not sealed evidence, with the snapshot's SHA-256; rebuilt from that JSON it is byte-identical. `static` report pages are refused in the switch. `ts/src/studio-card.ts` reads a `standard_history/1` or `/2` card from its bytes once and draws the card view and the stapled form from the same facts and digest. The card reader is run against agent-action-capsule's `vectors/standard-history-v0` (vendored in `vectors/standard-history-v0/`). New tests hold that a report page carries its bundle, is rebuilt byte-identically from it and calls no network, storage or worker API while drawing. Pages for two packs over the same data cite the same dataset digest (and plan digest); each carries its own bundle (`packCitation`, `ts/src/studio-pack.ts`, reads them from the bundle).
- The core strip says "imported" for a Result that rests on backfill alone (#303). When the Result's own `coverage_report` lists at least one source and every source in `requirements[].sources[]` has `contemporaneous_count` 0 and `backfilled_count` equal to its `record_count` (a declared source with no records is 0 of 0 and counts for nothing against it) and the sources hold at least one record between them, the strip draws, after the mock-judge mark and before the identity line, the line "Imported: the records behind this result were all backfilled after the fact; none was recorded at the time." One contemporaneous source, a missing report or counts that do not add up draw nothing. The strip draws the same for a rehearsal and for a Result on the record. No schema member is added: `coverage_report` is read from the Result document (`backfillOnly`, `ts/src/core-strip.ts`), because agent-action-capsule 0.14.0's `ResultRoot` does not carry it. The three default contract-report wording packs gain `front.agg.imported` (a locked entry) and change digests, so the report goldens move; the Go page runtime picks the change up at the next `go/` release.
- A timeline per backfill import (#302, `ts/src/backfill-timeline.ts`): `backfillTimelineHtml` draws one `backfill-import/v0` record (evidencebook `capsulectl/BACKFILL.md`) with each row's `at` (source says) against the pass's `imported_at`, the declared gaps (named, and never blocking the page), a late pass, anomalies, refused rows and the checkpoints that cover the pass (caller input `{digest, size, at}`), labelled as imported in both forms (rehearsal and on the record). `studio-view/v0` takes an optional `backfill` list drawn with it; unknown members and bad times are refused. Wording is the neutral pack `ts/src/wording/backfill-timeline.en.json`.
- A not-yet-in-force section on both contract-report layouts (#68). The Outcomes card draws every conversation's later criteria (`Conversation.notYetInForce` and the all-later `notYetInForce` conversations of agent-action-capsule's outcome model) in a section after the rules, never merged with them and counted in no tally; an all-later conversation is never "could not decide". The EU card moves tests whose every claim is later out of the obligation table into their own section after the in-force tests. Both are titled and noted by `applicability.not_yet_in_force.title` / `.note`, and every result in them carries the readiness label. The core strip reads `applicability.as_of` (the bare date when the word lacks exactly one `{date}`) and `contract_fact.note` (also beside the out-of-scope count); `front.agg.as-of` and `front.agg.copied.*` are replaced by the locked `applicability.as_of` and `contract_fact.note` (and `applicability.not_yet_in_force.note` is locked). A pack that still carries the old `front.agg.as-of` or `front.agg.copied.*` keys now carries unknown, unlocked entries; the three default packs change digests, so anything that pins the old digests (and the report goldens) moves. A rule whose every claim is later has no row in the Outcomes rules table.

### Deprecated

- The Python `capsule_viewer.receipt` package (the unilateral, seller and bilateral receipt modules, their provider page and `python -m capsule_viewer.receipt`) emits a `DeprecationWarning` on import (#71). No other Action State repository calls it at runtime; it is the test oracle for the JS module-slot scripts, and it also holds the module-slot writer (`python -m capsule_viewer.receipt.module_slot --write`) that generates the shipped `static/receipt_*.js` scripts and their manifests, which now emits the warning too (Python hides it by default under `python -m`; add `-W default` to see it). It will be removed in a later release, once the static golden covers L0/L1/L2, the module-slot writer has moved out of the package and a release has carried this warning. For new work, build receipt pages with the TypeScript `buildPresentation` (`format: "static"`); its golden coverage of every page the Python modules draw is part of the removal condition above. `capsule_viewer.ledger` and `capsule_viewer.evidence_report` are not deprecated.

### Fixed

- The History view is readable under `prefers-color-scheme: dark` (#310): `historyViewStyles` (TS and Go) gains a dark palette and sets its own dark background, so the view no longer draws 1.2:1 dark-on-dark text on a dark host page. The light palette is unchanged; a page with a strict CSP lists the new stylesheet hash.

### Changed

- A wording pack with a `core.` key is refused when it loads, not only by its schema (#87). The TypeScript `readWordingPack`/`checkWordingPackInput`, the Go `CheckWordingPack` and the Python `load_wording_pack` all refuse it, with the right `wording_sha256` as without, and the page then shows the core's own fallback labels, as it does for a digest mismatch. Presentation contract §7.4 gains the sentence that says so. The three loaders run the shared `wording-pack-core-key-cases.json`.

## ts 0.18.3 and go 0.18.3 (2026-11-05)

Both state viewer 0.18.3: `ts/v0.18.3`, then `go/v0.18.3` on the commit that ships its page runtime. This release carries #294 (PR #295), #296 (PR #297) and #298 (PR #299), and the agent-action-capsule 0.14.0 pin.

### Changed

- Same customer tiles (#294, PR #295): under a contract that states a tier, the tiles read "every must-have met" and "one or more required terms not met", and the gap line drops the must-have and informational clause. Without a contract, or with one that states no tier, nothing changes.
- Same customer note (#296, PR #297): under a contract it says informational-only, and says no counted term applied when the contract keeps the rules out; the row word says must-have.
- History card layout (#298): the PRIVATE notice is a rounded, bordered box like the card's other boxes (a refusal lead gets the same corner and padding), and the "Which checks ran" fold-out has the same gap (`--cv-space-3`) under the "How this page was checked" line as the other sections; it sat 1px under it. CSS only.
- The pin moves to `@action-state-group/agent-action-capsule` 0.14.0, which carries `parentWitness` (agent-action-capsule#572). The verification page draws a checkpoint witnessed through a parent log (parent-log-witness/v1) in the core's Verification section, below the receipts: "witnessed through a parent log: all 3 entries", or "entries 1–2 of 3; entry 3 is not covered by this witness" for a part, and one line per verified receipt with the witness and "recorded 2026-11-04 23:22:21 UTC" (UTC; "time not stated" when the receipt has none). Such a bundle gets no "self-witnessed" line. The viewer computes nothing: it draws AAC's result (J.8), and a page shows it only for a context built with a witness directory (`witnessDirectory` of `buildVerifiedBundleContext`). The wording is Sherlock2's (capsule-viewer#237). `readerCadenceWitness` stays until capsulectl writes `parent-log-witness/v1` (action-state-group/evidencebook#401). The stated verifier version and the goldens that print it changed with the pin.

## ts 0.18.2 and go 0.18.2 (2026-11-04)

Both state viewer 0.18.2: `ts/v0.18.2`, then `go/v0.18.2` on the commit that ships its page runtime. This release carries #281 (PR #282) and #283 (PR #284).

### Changed

- History card layout (#283): the "Everything on the card" fold-out has the same gap (`--cv-space-3`) under the card as the other sections; it sat about 2px under the card's border. CSS only, no wording or contract change; the module's `style_sha256` and the goldens are regenerated.
- History view wording (#281, from Sherlock2's review of Mesh-LLM/capsules-plugin#263): a checkpoint row's "Cut" time shows to the minute ("Nov 3, 2026, 18:07 UTC"), no longer to the second or with a fraction; the fraction shown when two rows shared a second is gone. The "What this does not show" block on a checkpoint page adds "The exact time of each exchange. Checkpoint times are rounded to the minute, and each side of an exchange gets its own checkpoint, so two can share a time." (`callout.checkpoints.time`). No input or contract change; the goldens are regenerated.

## ts 0.18.1 and go 0.18.1 (2026-11-03)

Both state viewer 0.18.1: `ts/v0.18.1`, then `go/v0.18.1` on the commit that ships its page runtime. This release carries #274 (PR #275) and #276 (PR #277).

### Changed

- Receipt amounts (#276, evidencebook-deal#133): for currency BTC, `amount_minor` counts millisatoshi (1e-11 BTC), so the receipt shows `500 msat`, never `5.00 BTC`, in `format_amount` and in the unilateral, seller and bilateral receipt scripts. Fiat amounts are unchanged.
- Verification summary wording (#274, from Sherlock2's review of actionstate-muse#337): the record count reads "1 top-level record" / "5 top-level records" instead of "1 record". The count is the file's own records; capsules a record carries inside it (a History's picked deals) are not counted, so the line no longer reads as a contradiction beside a module's own count of them. No input or contract change.

## ts 0.18.0 and go 0.18.0 (2026-11-03)

Both state viewer 0.18.0: `ts/v0.18.0`, then `go/v0.18.0` on the commit that ships its page runtime. This release carries #266 (PR #268) and #271 (PR #272).

### Changed

- History view wording (#266, #268, from Sherlock2's review of loop#362): the sharing block no longer draws one "this node's settings don't say" line per unstated setting (eight on a Goose page). It draws one closing sentence, "This node's settings don't say: <a>; <b>; ...", naming only the settings the node does not state (one missing setting reads without the colon), and nothing when all are stated. The pack's eight `shares.*.unstated` keys become `shares.unstated`, `shares.unstated.one` and `shares.unstated.*`. No input or contract change; the goldens are regenerated.
- History view wording (#271, #272, Sherlock2's point on the #266 sentence): when a node states `stranger_safe` (an empty list included), the closing "this node's settings don't say" sentence no longer lists whether a record goes to someone who doesn't prove who they are, since the stranger line already says what a stranger gets; no "Never" line is drawn in its place. No input or contract change.

## ts 0.17.0 and go 0.17.0 (2026-11-03)

Both state viewer 0.17.0: `ts/v0.17.0`, then `go/v0.17.0` on the commit that ships its page runtime. This release carries #260 and #261.

### Added

- The History view draws a Goose node's `share_deal_half` and `stranger_safe` (#259, #260), in `ts/src/history-view.ts` and `go/historyview`: `share_deal_half` (`counterparty`, the only value) says the other side of an exchange can ask for that exchange's half of the record; `stranger_safe` lists what goes to anyone who asks, drawn right after the first sharing line, with the known token `history_card/1` named "the History Card", an empty list reading "Nothing else goes to a stranger.", and an absent member drawing no line. A present member of the wrong type or outside its list is refused. Vector `goose-policy-share-deal-half-only`.

### Changed

- History view wording (#261, Sherlock2's ruling in the Buzz thread on the loop#361 review): the "These checks ..." sentence under "How this was checked" is drawn only when at least one check passed or failed, and reads "These checks cover the records as of {at} ({by})." on a builder page; "This page did not check how these records were locked." is gone, since the Second signature box says it; "Built {at}" is now "As of {at}. It is a snapshot, not a page that updates itself." and the sharing note reads "Set by this node as of {at}." No input or contract change. `built.owner` is no longer a copy of Muse's words.

## ts 0.16.0 and go 0.16.0 (2026-11-03)

Both state viewer 0.16.0: `ts/v0.16.0`, then `go/v0.16.0` on the commit that ships its page runtime. `ts/v0.15.0` was tagged but never published: its `npm run check` failed because the release pull request did not regenerate the contract-report goldens, which name the viewer version. This release carries what 0.15.0 was to carry (#254 and #255, #257 and #258, #253 and #256) with the goldens regenerated.

### Added

- The History view's Go twin, `go/historyview` (#253, design note `docs/design/history-view.md` section 2): `Render(input, overlay)` writes the same bytes as the TypeScript `historyViewHtml` for every vector in `vectors/history-view/`, `Document` writes the whole static page the goldens hold, and `Styles` is the stylesheet. It refuses the same inputs with the same reasons, in the same order, as a `*Refused` error, and writes the page with its own serializer, not `html/template`. The wording pack is a byte copy of `ts/src/wording/history-view.en.json`, held by a test, and `vectors/history-view/refusals.json` holds both views to the same refusal reasons in the same order. It is for Muse's static `history page`.

- Every member of the History view's `sharing` is optional (#257, #258): a Goose node's advertised policy states none of the five that mesh nodes advertise, so its page drew nothing. A member the node does not state draws "this node's settings don't say" and never a default, and the "Never: a record to anyone who doesn't prove who they are" line is drawn only when the policy states `history_segments`. Vector `goose-policy-share-deal-half-only`.

### Changed

- The History view's wording (#254, #255): the witnesses line with an empty list says the settings name no witness now and that a row's time-stamp may come from an earlier setting, and the seal's second-signature slot reads "<k> of <n> didn't verify; see each row" when only some of the countersigned rows failed. The goldens are regenerated.

### Fixed

- `historyViewHtml` and `renderHistoryView` refuse an overlay entry named like an `Object.prototype` member (`toString`, `constructor`) as an unknown key; they threw a `TypeError` instead.

## ts 0.14.0 and go 0.14.0 (2026-11-03)

Both state viewer 0.14.0: `ts/v0.14.0`, then `go/v0.14.0` on the commit that
ships its page runtime. This release carries the changes merged since 0.13.0:
#244 (issue #243), #246 (issue #245), #248 and #249 (issue #247), and #250.

### Added

- The History view (#247, design note `docs/design/history-view.md`): one History page for Muse's private History, the mesh-llm console's saved History page and the Goose History card, on the actionstate-muse#203 anatomy (header, one-line headline, chips, rows, "What this does not show", "What this node shares", the seal and "How this was checked"). It draws a `history-view/v0` object its caller builds from what it checked, and never verifies or fetches. `historyViewHtml` and `historyViewDocument` write a static page, and `renderHistoryView` draws the same page as DOM; all three are exported from the package root and from `@action-state-group/capsule-viewer/history-view`, and the page runtime carries `renderHistoryView` and `historyViewHtml`. `dist/history-view.iife.js` (global `HistoryView`, with its `.sha256`) ships the view alone. Its words are `src/wording/history-view.en.json`, neutral only; a product caller passes an overlay pack. The vectors are `vectors/history-view/`. The Go twin follows in a later release.

- A case's card has a page address, `#case-<case id>` (#243): the Outcomes page's per-conversation card and the EU AI Act page's per-session card carry `data-case`, and a page opened at the address opens that card and every toggle that shows it, as `#record-` does. It is meant for the Terms Pack day table's card column, which is not drawn yet (#172). It is a page address, not a permalink, and is matched on the whole case id. `caseAddress`, `caseHref`, `revealCase` and `anchorCases` are in `report-levels.ts`.

### Fixed

- `go/pageruntime` again states a commit on `main` (#250): it named a commit of #246's branch that the squash merge left off `main`, so the `pageruntime` CI job failed on `main` and on every pull request. It is rebuilt at a `main` commit, and only the stated commit changes.
- A page that runs no script shows a case card that sits in an expandable row's detail row when opened at its `#case-<case id>` address (#245, follow-up of #244): on the static page only (scoped to a page that carries the static notice), `tr.x-detail:has(:target)` shows the detail row that holds the target; the scripted page's rows still follow their toggles. The report-front stylesheet changes, so `go/emitter/runtime-style-hashes.txt`, the contract-report goldens, the Go goldens and the page runtime are regenerated.

## ts 0.13.0 and go 0.13.0 (2026-11-02)

Both state viewer 0.13.0: `ts/v0.13.0`, then `go/v0.13.0` on the commit that
ships its page runtime. This release carries the changes merged since 0.12.0:
#220, #218, #225 (issue #123), #226 (issue #172), #230, #235 (issue #171),
#236 (issue #56), #238 and #240 (issue #239).

### Added

- A generic `contract-report/v1` view (#56): a Result that opts in with the empty block and carries neither Outcomes nor EU AI Act data now draws rows from its claims (grouped by `requirement_ref` prefix, each tally with its denominator, tier sections when a contract is given, claims not yet in force apart) instead of the plain Result page. It has its own default wording pack, `capsule-viewer/contract-report/generic@1`, beneath a host pack's `report.*`, `row.*` and `group.*` words. A Result whose claims do not fit its card still draws the plain Result page.
- The EU AI Act page has two new locked notes, `groups.summary.basis.pack-titles` and `groups.od.mapped.pack-titles` (#123). The page draws them instead of `groups.summary.basis` and `groups.od.mapped` only when the host's wording pack words every obligation title on the page (`eu-deployer/en` does); they say the titles are the Act's article headings from the pack and the rest stays the producer's mapping. If even one title falls back to the producer's, the base notes stand. The default EU pack's digest changes with the two keys.
- A signed `policy_declined` refusal reads as the other party's limit, never a no (#220, closes #209): a bundle whose only cause for an incomplete verdict is a verified `policy_declined` refusal now draws a neutral "limit" receipt beside a "Not shared" half, where it drew the generic "did not verify" page. Anything else stays failed.
- The Outcomes page draws the canvas's footnotes 1 to 3 (#226, part of #172): what a record and a conversation are, what "resolved" means, and that the page is read-only. Footnote 4 is not drawn.

### Changed

- The pin moves to `@action-state-group/agent-action-capsule` 0.13.1 (#239), whose TypeScript reader recognizes `type: "calibration"` claims (agent-action-capsule#575). The stated verifier version and the goldens that print it changed with it.
- The core strip counts requirement claims only and gives calibration claims their own line. A weekly calibration claim (`type: "calibration"`) is a check of the judge, not an evaluation of a requirement, but capsulectl and evidence-result-v0 section 4.1 count it in the sealed aggregate, so a monthly compliance report that cites weekly calibration overstated its evaluations ("19 evaluations of 5 requirements … Could not decide 7"). The strip now draws the sealed figure minus its calibration claims ("16 evaluations of 4 requirements … Could not decide 4", the same for the buckets and `unknown_count`) and a line "N calibration checks of the judge, not counted as evaluations", so the strip plus that line is the sealed coverage. The `count mismatch` marker is suppressed only when the sealed figure minus the calibration claims equals the claims' figure minus theirs, and still fires for any other gap. Both default wording packs gain `front.agg.calibration.one|other` and change digests, and the strip's stylesheet changes, so the goldens, `go/emitter/runtime-style-hashes.txt` and the Go goldens move. Origin: evidencebook-skills#73 (Sherlock2).
- The History card's "Which side" rows read "in 3 of 5" instead of "3 of 5" (#171): the role count no longer looks like the outcome count it can coincide with ("3 of 5 … went as agreed"). The wording pack gains `role.count`, so `wording_sha256` and the script's `script_sha256` move; consumers that pin them re-pin on the next release.
- The History card says disputes are not recorded yet instead of "You raised 0 / Raised with you 0" (#218, closes #212): the `standard_history/1` profile seals no statement that disputes were recorded, so an all-zero tally is the producer's silence, not a count of none. A tally that counts something is drawn as before.
- The History card says plainly that a card from a default deal profile is signed by its holder and that no outside witness recorded its snapshot (the repository's prose lint bans a bare "witnessed"). Its "What it doesn't" list, when no witness line is drawn, now reads that no outside witness recorded the snapshot, that the holder has to choose a witness, and that none is set by default (Steven's 2026-11-01 ruling on capsule-cli#519, wording by Sherlock2). A card that carries a Receipt a reader's witness accepts still reads "Snapshot recorded … by …". Wording only: no check changes.

## ts 0.12.0 and go 0.12.0 (2026-11-01)

Both state viewer 0.12.0: `ts/v0.12.0`, then `go/v0.12.0` on the commit that
ships its page runtime. This release carries the changes merged since 0.11.0:
#232 (issue #156), #231 (issue #222), #223 (issue #171) and #227 (issue #122).
The Go module now accepts `view` entries in `charts` (#156), which evidencebook's
report builder needs to draw a Terms Pack or EU AI Act page from a Go build.

### Added

- Go twin of the view checks (#156): `go/chartspec` has `CheckView` and `IsView`, the Go port of `ts/src/report-view.ts` for the calendar, by-period, timeline and co-failure views, and `Chart.Units` (the temporal chart's every unit and whether it was not run). `go/emitter` routes a `view` entry in `charts` to it, so a Go-built page (and `capsulectl`'s build) carries a checked view and the page runtime draws it, where the build refused it before. The refusals are pinned by new shared vectors, `vectors/view-spec/`, which the TypeScript and Go checkers both run.
- The History card's stamped note no longer says the other side's record points at yours as if the card had checked it (#222, F4.15b): it reads "your agent’s receipt checks whether their record points at yours", because the card carries a count, not the other half. The check itself runs on the receipt (action-state-group/evidencebook-deal#117), per Sherlock2's ruling (Buzz 3224c6af).
- Same customer in this report on a shared page (#122): when the producer salts the customer handle per share (`handle_scope` `{tier: "shared", salting: "per-share"}`, evidencebook-skills#93, #96), a shared Outcomes page draws the customer grouping the operator page draws (the customer line, tiles with their denominators, the timeline with the follow-up link and the table), in the third person, with two new words, `lines.subject.slice.per-share` and `lines.subject.explain.per-share`. A shared member salted any other way, or with no `handle_scope`, is drawn as before: the handle and `follow_up_of` are ignored and no conversations are grouped. The Outcomes default pack's digest changes, so the contract-report goldens are regenerated.
- The History card's headline is one sentence, as Steven's 9b frame 1 draws it: "44 of 46 deals where you had to come through went as agreed. **1 didn't.** **1 we couldn't tell.**", and "What it proves" is a fold-out in the first level (#171). The wording pack gains `sentence.did_not_hold` and `sentence.undecided`, so its digest and the manifest pins change.

## ts 0.11.0 and go 0.11.0 (2026-11-01)

Both state viewer 0.11.0: `ts/v0.11.0`, then `go/v0.11.0` on the commit that
ships its page runtime. This release carries the changes merged since 0.10.0:
#221 (issue #211).

### Added

- The History card checks its signature, as frame 4 of Steven's 9b canvas says it is "signed" (rule F4.7, #211). The runtime has a new global, `readerCardSignature(context)`, which reads the context's own strict verdict for the card's record (`spec/presentation-contract-v0.md` §3). On a pass, the card says "Signed with key <first 12 hex>…; this page checked the signature", and "What it doesn't" says the page cannot tell who holds that key. A card whose signature fails draws none of its counts: "This History card's signature does not check". A card that claims no signature says no one signed it. A runtime that cannot check it keeps today's "This page does not check the signature". "Which checks ran" gains the row "The card's signature checks under the key it names". The goldens are rebuilt for that row, and new ones cover pass, fail and not checked. `go/pageruntime` ships the global from 0.11.0.

## ts 0.10.0 and go 0.10.0 (2026-11-01)

Both state viewer 0.10.0: `ts/v0.10.0`, then `go/v0.10.0` on the commit that
ships its page runtime. This release carries the changes merged since 0.9.0:
#215 (the viewer half of evidencebook-deal#94, issue #214).

### Added

- Two runtime checks for the deal receipt, which a presentation module cannot run itself (`spec/presentation-contract-v0.md` §3): the runtime's new globals `paymentPreimageCheck` and `readerCadenceWitness` (#214, #215). `paymentPreimageCheck(paymentRef, preimage)` is lightning-v0's preimage check: `PASS` when `paymentRef` is `ln.payment_hash` and the SHA-256 of the preimage's 32 octets is its value, `FAIL` when the preimage is not 32 bytes of hex or hashes to something else, `NOT_PRESENT` with no preimage or hash, and `NOT_CHECKED` for another rail. It returns a status only, never the preimage. `readerCadenceWitness(context)` walks a deal bundle's `x-cadence-witness/v0` chain from the context's own authenticated checkpoint, as capsule-cli does, and checks the cadence checkpoint's receipts under the reader's own witness list (never the bundle's). `PASS` names the witness and, when the receipt carries one, its registration time. A page whose runtime predates this release has neither global, so a module that asks for them must fall back to its lines without a check.

## ts 0.9.0 and go 0.9.0 (2026-10-31)

Both state viewer 0.9.0: `ts/v0.9.0`, then `go/v0.9.0` on the commit that
ships its page runtime. This release carries the changes merged since 0.8.0:
#205, #206, #207.

### Added

- The red mark on a claim sealed `WITHHELD`, as Steven's Terms Pack canvas draws it in Outcomes frame 6 (#198): "Withheld by the holder", with the digests the claim cites ("cites <digests>"), in the outcome table's assurance cell and the compliance proofs. It is drawn for `WITHHELD` only, never for an absent or mismatched carrier, and a claim that failed verification is not marked (its sealed status no longer stands). It names no level or tier: nothing in the Result carries one, and a holder's uniform refusal exists so as not to characterize what it withholds. The two words are locked (`card.mark.withheld`, `card.mark.withheld.cited`), so a pack cannot reword them. The default packs gain the two keys, so the `wording_sha256` of both built-in packs moves (a host that pins either digest re-pins it); the content of every other word is unchanged.
- The History card says a witness recorded the snapshot, as Steven's History card canvas draws frame 1 (#183, #206). When the block's `as_of` carries `receipts` (1 to 64 lowercase hex strings, each one witness Receipt for the card's anchor) and the reader's own witness list accepts one that checks, the card shows "Snapshot recorded <time> by <witness>", and "What it doesn't" says the witness recorded the snapshot and did not check the counts. The line draws only when agent-action-capsule's `checkAnchorWitnessed` returns PASS and the card's own `as_of` check passes. A Receipt that fails reads "failed" in the checks and says nothing in the card; a Receipt the page cannot check says only that one came with the card, not checked. `as_of` may also carry `checkpoint` (hex): one whose SHA-256 is not the anchor makes the block unreadable. The witness list is the reader's: empty by default, shown and editable in the card's checks, held in the page's memory only, and never read from the bundle. The module verifies nothing itself: it asks the runtime's new global `readerAnchorWitness` (with `readerWitnessPolicy` and `setReaderWitnessPolicy`), and `spec/presentation-contract-v0.md` §3 names this shape. The line says "recorded", not "witnessed" (#206). Producers write the new `as_of` members only for a viewer at or after this release (evidencebook#237, evidencebook-deal#85).

### Changed

- The calibration readers read `calibration-summary/v1` per clause, as agent-action-capsule 0.13.0 defines it (#204, #205), and the pin moves to `@action-state-group/agent-action-capsule` 0.13.0. The Outcomes "Human spot checks" section now has one row per clause of the cited summary: Clause, Agreed (k of n), Drift (k of n) and a recount from the cited ratings (matches, does not match, not checked here), with no weeks, no held and added split and no rate. A summary that does not match the schema, or is cited twice, draws no figures. The generic "Human check" section shows the same per-clause figures, and its confusion matrix, corrected rate and period window are gone, since the schema carries none. The `lines.hc.*` words changed, so the Outcomes pack's digest did.

## ts 0.8.0 and go 0.8.0 (2026-10-31)

Both state viewer 0.8.0: `ts/v0.8.0`, then `go/v0.8.0` on the commit that
ships its page runtime. This release carries the changes merged since 0.7.0:
#196, #197, #200, #201.

### Added

- The compiled Evidence Contract as a builder setting, and rows drawn by requirement tier, as Steven's Terms Pack canvas draws Outcomes frame 1 and EU AI Act frame 9 (#199, the viewer half of evidencebook#204). `buildPresentation` takes `contract` (the contract's exact text and its `contract_sha256`; Go: `OfflineOptions.Contract`, checked with the exported `CheckContract`), checks its bytes and shape the same way in both (`go/emitter/testdata/contract-vectors.json`), and carries it in every packaging, the fragment payload's new optional `contract` member included. The contract-report module reads each row's `tier` by (`contract_ref`, `requirement_ref`): rows are drawn in must-have, informational ("reported, never in the answer") and tier-not-stated sections, each with its chip; the derived lines (a conversation's or session's result, the headline, an obligation's worst line) leave out informational rows and keep rows whose tier is not stated; when the Result has an informational row, L0 says the sealed result counts it and the derived lines do not; the verification page states the contract's `id@version` and digest. Without a contract no row shows a tier and every page draws what it drew before; its bytes change only where the default packs' digests and the card stylesheets (which now carry the tier rules) do. New section 3 key family `requirement_tier.*` (locked) and `lines.rtier.*` / `groups.rtier.*` words in the default packs; both packs and both card stylesheets change, so the contract-report goldens, `go/emitter/runtime-style-hashes.txt` and the Go goldens are regenerated. Spec text: `spec/presentation-builder-v0.md` sections 1, 2.1 and 2.2; `spec/contract-report-module-v1.md` sections 2 and 3.
- Same customer in this report, as Steven's Terms Pack canvas draws Outcomes frame 5 (#122, #196): when the day Result carries the producer's `x-<pack>.subject_history` member (evidencebook-skills#89, #92; no new AAC vocabulary), the Outcomes page adds a section with, per customer handle that has two or more conversations, the CORE customer line, four tiles (conversations of the report's total, resolved, missed, could not decide, each "k of n"), a timeline with the dashed follow-up link and its days, and "Each conversation, each term": request, term squares, USD band as a range (`$10-99`, never `e+1`), halves present and outcome, each row opening a three-column card (what happened, the terms not met, the verdict and why). At the operator tier (`handle_scope.tier`) the page speaks to "you" and draws the handle and `follow_up_of`; at any other tier, or with no `handle_scope`, the viewer ignores both fields whatever the document says and draws only request, band, halves and terms, with no customer grouping, until per-share salting exists (evidencebook-skills#93). What the bundle does not carry (must-have versus informational terms, when a term is met, the adjudication) is a locked line, not drawn. 44 new `lines.subject.*` words in the Outcomes default pack (one locked); its digest changes, so the contract-report goldens, `go/emitter/runtime-style-hashes.txt` and the Go goldens are regenerated.

### Changed

- Outcomes frames 6 and 7, finished as Steven's Terms Pack canvas draws them (#123, #197): the regions the core always draws, with no toggle (the verification banner and its notices, the core strip, the refused-wording notice), carry the ■ at their left edge. The L0 legend now names all five word sources (core, wording pack, capsule field, payload, producer); the core strip's identity lines, its tile captions and the spot check's labels are marked core or wording pack, and the spot check's judge pin digest is drawn as a capsule field with its path (`judge_pin_digest: …`), so "judge pin" changes; the confidence, parsed from the judge's words, stays the pack's. Both default wording packs gain the `legend.src.core|pack|field` entries and change digests, and three stylesheets change, so the goldens, `go/emitter/runtime-style-hashes.txt` and the Go goldens move. Not drawn: depth `L3` (a change to the public depth set, left out with Sherlock2's agreement) and the red tier-gated mark, because a bundle carries no signal for which tier withheld a record's content.

## ts 0.7.0 and go 0.7.0 (2026-10-31)

Both state viewer 0.7.0: `ts/v0.7.0`, then `go/v0.7.0` on the commit that
ships its page runtime. This release carries the frames merged since 0.6.0, as
Steven's canvases draw them: #186, #187, #188, #189, #190, #192, #193.

### Added

- The lowest level, as Steven's Terms Pack canvas draws Outcomes frame 8 (#191): every record in a bundle has a page at its entry in "Records in this bundle" (where each Proofs link already lands). It draws the record's producer envelope read from its own COSE_Sign1 bytes (protected header, unprotected header, payload, signature), its capsule JSON member by member in clear or by digest, the eleven-rung ladder of what each proof proves and does not with its status on the page (PASS, FAIL, NOT_PRESENT, NOT_CHECKED), how to check each yourself, and the canvas's three-column footer. Each status comes from what the verified bundle holds; rung 6 (checkpoint consistency) and rung 8 (controller binding) read NOT_CHECKED because the bundle carries no retained head and no binding (agent-action-capsule#513, #514). `renderEvidenceGraph`'s new `voice` option (`own` or `shared`, default `shared`) writes the page to the holder in their own preview or about the holder once shared. About 100 new `record.*` words in both default wording packs (the lines that say what a proof does not prove are locked); both packs change their digests, so the contract-report goldens are regenerated. A new stylesheet adds one CSP hash (`go/emitter/runtime-style-hashes.txt`), and the Go goldens move with it.
- Spot check, side by side (#184), as Steven's Terms Pack canvas draws it (Outcomes frame 3, EU AI Act frame 10): each conversation or session opens a "Spot check, side by side" toggle with one card, in three columns: what happened (the conversation, drawn once, who said what and each tool call), and, one row per rule that has a claim, the criterion (the rule as the judge was given it, from the sealed report) and the verdict with the judge's words, judge pin and confidence. On a page that runs no script the conversation is a link to its record, so the page still keeps each conversation once. What the bundle does not carry is said in locked lines, not drawn: who produced each message, when a rule is met and when it cannot be decided, and the blind adjudication. Both default wording packs gain the `spot.*` entries, so their digests change; both card stylesheets changed, so `go/emitter/runtime-style-hashes.txt` and the Go goldens carry the new CSP hashes.
- Calendar cells as Steven's Terms Pack canvas draws them (frame 2 and EU frame 11, #172): a calendar lane may carry a `role` (`activity`, `judgment`, `adjudication`) and `classes` for its values, and the cell then shows the day's count, `judged · 8 resolved · 1 missed`, a bar of those shares, a green, amber or red colour (one judged case that was not met is red, never green), a diamond chip for the day's adjudications ("all concur" or "1 differs"), a legend, and a link to the day's section (heading, counts with Show evidence, the day's records). A calendar with no `role` is drawn as before. A new refusal, `view-lane-role`, names a role on two lanes, classes on a lane with no key channel, or a value with no class.
- A `timeline` view ("What happened across the month"): one row per lane, a tick or diamond on each day with a count, coloured by the value's class, days that did not run hatched, and a list of each lane's days with Show evidence as its text alternative.
- A `co-failure` view ("Which fail together"): a matrix of the sessions failing both of two requirements, recomputed from the rows of a not-met chart and the field that names their session.
- Wording: 23 locked words (long weekday and month names, the day section's labels) and 17 pack words (the cell's nouns and verbs, the legend and the co-failure total) in both default packs; their digests change. Spans with a duration and the per-case columns of the day section need records no producer writes yet.
- The Adjudications page (`capsuleviewer.adjudications/v0`, a module-slot script), Outcomes frame 4 of Steven's Terms Pack canvas: the strip of four tiles, By term, By adjudicator and rows that open the judge's and the adjudicator's sides side by side, drawn from `calibration-summary/v1`, `human-rating/v1` and `evaluation-report/v1` records. The only percentage is derived from the k and n beside it; what the records do not carry (either side's words, a case's term, the adjudicator's book) is named on the page, not drawn (#121). Design: `docs/design/adjudications.md`.
- The report front opens with the CORE identity line the Terms Pack canvas draws: the pack and version, the Result's generation time, the Result capsule's id and the judge pin, each stated only when the Result and its cited reports carry it. The rest of the canvas's line (coverage window, closed time, countersign state, pack digest, skills, book, agent key, controller, developer, epoch, model) is not in any bundle and is not drawn; evidencebook#238 tracks it (#172).
- The EU AI Act page opens with one sentence of whole-number session counts, and each obligation's heading carries a derived "worst" line (the test with the most not-met sessions, else the most that could not be verified or decided), as the canvas draws them (#172).

### Changed

- Release · Go attaches `adjudications-module-v<version>.tar.gz` and its `.sha256`, the Adjudications module's bundle, beside the History card module's.
- The report levels' third-level bar is lifted for that page only: it sits in no level-1 or level-2 toggle and holds no toggle (`nestingProblems` checks both).
- `emitter-csp-browser.test.ts` asserts that every stylesheet the shipped `go/pageruntime` inserts is listed in `runtime-style-hashes.txt` (it asserted equality; the runtime is rebuilt only at a release, so a new stylesheet is listed before it ships).
- The Outcomes and EU AI Act report pages draw Steven's two design-system frames, "One glyph says what opens; its colour says who opens it" and "Five sources of text" (#123). Every toggle opens with a triangle drawn by the stylesheet (closed, open), in the reader's colour, or the view's when the depth opened it (`data-opened-by="view"`). L0 leads with a legend of the three glyphs (open by the view's depth, closed for the reader, no toggle for the core) and a one-line strip of the sources the page marks (payload and producer, each chip in the source's style; "Unmarked text is the viewer's or the report's own words"), with the payload (a conversation's turns, a tool call's arguments) and producer text (the judge's sealed rule wording, the producer's note) drawn in their source's style. Both default wording packs gain the `legend.*` keys and change their digests (`DEFAULT_PACK_SHA256`); the contract-report goldens, `go/emitter/runtime-style-hashes.txt` and the Go emitter's pinned pages are regenerated. The core, wording-pack and capsule-field sources are styled in the stylesheet but not yet tagged node by node, so the legend leaves their chips out until they are; the depth `L3` the canvas draws is not added: it is a presentation-contract change.
- The report front's tiles read "Met · of N evaluations", on one line, as the canvas draws them. The packs' digests change (`DEFAULT_PACK_SHA256`) and the contract-report goldens are regenerated (#172).

## ts 0.6.0 and go 0.6.0 (2026-10-31)

Both state viewer 0.6.0: `ts/v0.6.0`, then `go/v0.6.0` on the commit that
ships its page runtime. This release carries the History card and Outcomes
pages as Steven's canvases draw them: #173, #174, #176, #177, #178, #179, #180.

### Changed

- The History card (`capsuleviewer.standard-history/v0`) draws the window with the snapshot's time ("as of Oct 28 12:00 UTC"), the title as one row ("History card" and "Standard · last 3 months"), on the holder's own copy the "Level they see" line and the green lead box, and under the headline how many deals in the window are not counted (#173). "What it proves" no longer says the log's snapshot covers the card; it says the card names its snapshot and the page checked it against the one carried beside it, only when that check passed (#173).
- The History card draws the outcomes tally as one bar of its three counts, as the 9b canvas does and as the History frame now allows (agent-action-capsule#506): the bar's widths are the counts, it states no figure, and it is drawn for a card with a counted deal only (#180). USD, EUR and GBP size rows read "under $10", "$10 – $99", each with the canvas's chip ("27 · 26 as agreed · 1 unsure"); other currencies keep their decade in their own units (#180).
- The report front's third tile reads "Could not decide (evaluations)" in both default wording packs, as Steven's Terms Pack canvas draws it and as the results table's column already says; it read "Not evaluable". The packs keep their ids and change their digests (`DEFAULT_PACK_SHA256`), so the contract-report goldens are regenerated (#172).

### Added

- The outcome report's report lines open with one sentence of the same counts, as Steven's Terms Pack canvas opens: "188 of 244 conversations resolved: every rule that applied was met. 49 missed at least one. 7 could not be decided." Whole numbers, never a share, whether or not the presentation asks for percentages in the table below; the first count carries the total the others are of, and a report with no conversation draws no sentence (#172). A conversation no rule applied to is counted on its own ("had no rule that applied"), not as one the judge could not decide. Six new words in `contract-report-outcomes.en.json`; its digest changes.
- Each Go release carries `standard-history-module-v<version>.tar.gz` and its `.sha256` as release assets (attested like the page runtime): the History card module `capsuleviewer.standard-history/v0` in the form a plugin carries, with its manifest, script, stylesheets and wording pack, and `presentation.json`, the `cli-plugin/v1` presentations entry for them. The bundle's files and tar members carry nothing of the run (sorted, no owner, no time); the bytes are the same on every run in one build environment, and the release states the sha256 (#171).

### Fixed

- The kit's `.cv-pill` rules apply only inside `.cv-kit`. The page shell's verification banner is a `.cv-pill` outside it, and a module that inserted `kit.css` restyled the banner, so the page's frame check refused the module: capsulectl's page builder showed "The presentation for this bundle failed" for the History card (#179). The scripts that embed `kit.css` change: `receipt_unilateral.js`, `receipt_seller.js`, `receipt_bilateral.js` and `standard_history_card.js`, and their manifests' digests with them; anything that pins one of them re-pins. `history_card.js` is unchanged.

## ts 0.5.0 and go 0.5.0 (2026-10-31)

Both state viewer 0.5.0: `ts/v0.5.0`, then `go/v0.5.0` on the commit that
ships its page runtime.

### Added

- The page runtime's global carries `buildVerifiedBundleContext`,
  agent-action-capsule's bundle verifier, beside the other verifier functions
  a presentation module may call (`ts/src/browser.ts`). A module that draws a
  bundle carried inside the one the page verified, such as each member of a
  `composed/v1` bundle, verifies it with the page's own verifier. capsulectl's
  own runtime build had it until capsule-cli v0.1.0-rc24, which embeds this
  runtime instead, and such modules then refused: this repository's own
  `receipt_bilateral.js` (`src/capsule_viewer/static/receipt_bilateral.js:356`)
  among them (capsule-viewer#167).
- Calendar and by-period views over a monthly Result's daily runs
  (capsule-viewer#120; `docs/design/report-views.md`). A `charts` entry with a
  `view` member (`"calendar"` or `"by-period"`) lays several chart specs out
  in a grid, and the viewer checks each against the sealed dataset exactly as
  it checks a chart. The calendar is a Monday-first month table, a cell per
  day with the pack's lanes (each a chart spec with its own id); a day with no
  daily run reads "Not run", never 0, in every lane. The by-period table
  counts the rows of one chart by requirement and Monday-start UTC week, with
  the `out_of_scope` and `not_yet_in_force` rows in columns of their own and
  no "met" column; a row counted by two of its charts is refused
  (`view-overlap`). Every count carries Show evidence. Refusals add the
  `view-*` reasons beside the chart's. The run record type is `daily_run`; the
  viewer never names it, since a view reads it from the spec's `runs` filter.
  Words: `calendar.weekday.1` to `.7`, `period.week`, `period.not_run_days.*`
  and `view.unplaced.*`, locked like the `chart.*` words. Both default wording
  packs change, so their digests do, and the chart stylesheet's CSP hash does.
  `go/chartspec` refuses a view entry as an unsupported member, so a page the
  Go builder writes never draws one unchecked until its twin lands.

- Python receipt modules: `capsuleviewer.receipt.provider/v0`, a Mesh node's
  own receipt for an exchange it served and the payments it received
  (`receipt/provider.py`, `manifest-provider.json`, audience `keep`;
  capsule-viewer#161). It is not a deal receipt, and it holds no request or
  response text. The receipt modules also draw a bundle whose only gap is
  that its producer chose the records (interval coverage `withheld` /
  `selection_not_checkable`, every other check `pass`). It reads
  "Incomplete", with a notice that the verifier cannot check that nothing was
  left out (capsule-viewer#159).

### Fixed

- A verified or incomplete banner over a signed checkpoint no longer reads as
  checked when no witness receipt was (capsule-viewer#162, from
  evidencebook#209). A notice under the bar (`data-witness-notice`) says the
  file checks only against its holder's own signatures: `not-witnessed` when
  AAC's strict witness status is `withheld` or the bundle carries no receipt,
  `witness-unreported` when this runtime reached no strict result. A passed
  receipt draws no notice, and a failed one already fails the banner. The
  words are the Python pages' own, and the status is the one the "Witnessed
  by" line reads (`witnessStatus`), so the two never disagree. The notice is
  part of the banner's frame: a module that changes, hides or moves it is
  discarded like one that alters the banner.

- The Python evidence report and Ledger page no longer show a file as
  checking in full when its checkpoint carries no witness receipt the
  verifier checked: an amber banner or notice says it checks only against
  its holder's own signatures (capsule-viewer#163, the Python half of #162).

## ts 0.4.0 and go 0.4.0 (2026-10-29)

Both state viewer 0.4.0: `ts/v0.4.0`, then `go/v0.4.0` on the commit that
ships its page runtime.

### Breaking

- The offline page carries the bundle in a `<script type="application/json">`
  element, and a fixed inline script sets `window.__BUNDLE__` from it with
  `JSON.parse` (the emitter shell and the Go emitter's `shell.html`;
  capsule-viewer#109). The page used to write the bundle as a JavaScript
  object literal, where a `"__proto__"` member became the object's prototype:
  the page verified the bundle without that member, yet could show the
  member's fields as if the record carried them. It now verifies and shows
  what any JSON reader sees. `window.__BUNDLE__` is still set before the
  bootstrap runs, so bootstraps that pass it keep working. Code that extracts
  the bundle from a page by the text `window.__BUNDLE__ = …;` must read the
  JSON element instead.
- The core strip (capsule-viewer#81). On a verified bundle whose root is an
  Evidence Result, the core draws the strip as the first thing in L0, before
  anything a module, a section or a composed layout writes. The strip holds
  the mock-judge mark when a cited report names a mock judge, then the
  Result's sealed coverage, then each bucket's count beside its denominator
  ("of N", the evaluated population). It shows no percentage. The outcome
  and EU cards no longer draw the aggregate or the mock-judge mark
  themselves, and the generic Result page drops its own coverage line. A
  bundle whose root is no Result draws no strip.
- A module is discarded for the "presentation failed" refusal if it puts
  anything before the strip or between the banner and L0, or if it changes,
  moves or hides the strip. On a page with no Result, a module that draws
  the Result's count marks is discarded the same way. Those marks are the
  strip, `data-bucket`, `data-bucket-count` and `data-count-mismatch`.
  Presentation contract §9.1 and contract-report module §2 say so.
- The strip's stylesheet (`CORE_STRIP_CSS`) joins `CORE_RUNTIME_STYLES`.
  The emitters' CSP, `go/emitter/runtime-style-hashes.txt` and the embedded
  snippet's `styleSources` list one more hash; a host page that pins the
  embedded snippet's style hashes must add it.
- Both default contract-report wording packs gain `front.agg.of`
  ("of {n}"), so their digests change. A page built with this version
  records the new digests; a supplied pack layered over a default needs no
  change. A supplied pack is refused if it puts a percentage in any
  `front.agg.*` word the strip draws.
- The outcome and EU frame stylesheets drop their aggregate and mock-mark
  rules, so their CSP hashes change.

### Added

- Show evidence on the contract report (capsule-viewer#83). Every count in
  L1 of both layouts (the Outcomes rules table; the EU summary's "Checked
  in" count and each verdict count its result states) carries a "Show
  evidence" toggle. It lists the records the counted claims cite, each a
  link to its entry in the records section, then any cited digest not
  disclosed in this bundle, how many were counted from a claim that cites
  no evidence, and how many were counted with no claim. The list is in the
  page's HTML, so the static package shows it with no script. A count whose
  claims cite no record in the bundle reads "Unsupported" instead, and one
  that no claim stands behind reads "Interpretation". Clicking inside the
  list leaves the row's own drill-down as it was. Where a host loaded the Show-evidence component
  (`static/show_evidence.js`), opening the toggle also draws each claim side
  by side. Each record's entry in the records section lists the counts that
  cite it, as "Cited by" links back. The default wording packs gain the
  `evidence.*` entries; the ones that say what a page does not show are
  locked.
- The deal receipt modules (Python and the module-slot scripts) draw three
  cases, read from the verifier's composed result and never from a
  producer's label (capsule-viewer#124, #137): stamped by both (two carried
  copies whose joins all derive `agree`, each agreement corroborating, one
  deal; ours in blue, theirs in
  amber and labelled "as received"), your receipt only (one carried copy,
  the other party's member a carried `absence`, every join deriving
  `one_sided`; the missing member is drawn grey and dashed, saying when it
  was asked) and no record (the holder's own copy alone, as the unilateral
  and seller keep pages). A `refusal` member makes no receipt, so the page
  declines the bundle. Two copies that miss the first case read "not
  stamped by both", never drawn like an agreement, and no side takes the
  negative tone. Only the holder's page says "your" and lists the sentences
  for their agent; a page cut for someone else names each side by its role,
  and a single copy cut for someone else draws no sides.
  "Your receipt only" rests on the recorded ask: when agent-action-capsule's
  `receipt_document` record kind lands it adds a line to this case without
  changing it.
- History card module (`capsuleviewer.standard-history/v0`) draws a
  standard_history/1 card as the 9b History card, with the consumer/en
  wording pack (capsule-viewer#134, #149). It reads an evidence-bundle/v2
  whose root record's `agent_input` is the card, with an
  `x-standard-history/v0` block carrying what a receiver holds beside it.
  A shared card (no `deals` in the block) shows its counts as the holder's
  statement, with `counts_recompute` not checked. A block that carries
  `deals` is the holder's own copy: it is drawn under the PRIVATE banner,
  with the sentences for their agent. Its counts are recounted from the
  deal entries only when the block also carries `policy` and `as_of`;
  without one, that check reads not checked and the counts stay the
  holder's statement. The six checks of the standard-history spec §6 run, and a
  card that fails them draws none of its counts. `anchor_inclusion` is
  always shown as not checked, the page never says a signature or a witness
  was checked, and no ratio or percentage is drawn. The rules module
  (`capsuleviewer.rules/v0`) now forbids `x-standard-history/v0`, as it
  already forbids `x-history-selection/v0`, so no bundle selects both the
  rules module and the History card.
- Charts from a checked spec (capsule-viewer#82;
  `docs/design/chart-spec.md`). The builder's new `charts` setting takes
  Vega-Lite v5 specs in a closed subset. Each spec is checked against the
  dataset the Result names (`plan_ref`, `dataset_ref`) and drawn in L1 as
  SVG by the viewer's own code: a caption with the population and window,
  a "derived" label, and a table of every value, each with Show evidence or
  a label. A unit with no run record reads "Not run", never 0, and only on a
  plan with exactly one window node. A spec that does not match refuses the
  build, and a page that carries one anyway shows the core's notice instead
  of the chart. The page's "How this page was checked" section states each
  spec's SHA-256. `fragment` with charts is unavailable
  (`fragment-has-charts`). Go: `go/chartspec` checks the same shared vectors
  (`vectors/chart-spec/`), and `OfflineOptions.Charts` carries specs in the
  Go offline and embedded pages. `render-report.mjs` gains `--charts` and
  `--format static`, and the page shell gains a `<noscript>` line pointing
  to that scripts-off copy. The page runtime and the npm package depend on
  `@action-state-group/agent-action-capsule` 0.10.0, whose
  Result reader accepts `plan_ref` and `dataset_ref`
  (agent-action-capsule#443); the "Verified by" line names it.

### Changed

- The Show-evidence component's `side.unsupported` reads "not all disclosed
  in this bundle" rather than "not all in this bundle": a capsule carried
  by a record whose disclosure is withheld reads unsupported, though the
  bundle carries it.
- The page runtime and the npm package depend on
  `@action-state-group/agent-action-capsule` 0.10.0 and
  `@action-state-group/cll` 0.3.0 (were 0.8.0 and 0.2.1), and `go/pageruntime`
  ships a runtime built on them (capsule-viewer#115, with 0.10.0 from #82
  above). AAC's strict verifier (from 0.9.0) now checks a signed checkpoint
  in the browser, so a page whose records and checkpoint verify reads verified where it read incomplete ("checkpoint
  signature not checked here", `checkpoint_verifier_unavailable`), and a
  forged checkpoint reads failed. In a page with no SubtleCrypto the
  checkpoint signature is checked too (a forged one reads failed), but strict
  verification does not run there, so the producer signatures stay unchecked
  and the page reads incomplete. The runtime now also bundles `@noble/curves`
  and `@noble/hashes` 2.4.0 (MIT), which cll 0.3.0 uses for the Ed25519
  check; `go/pageruntime/THIRD_PARTY_NOTICES.md` reproduces their license.

## ts 0.3.0 and go 0.3.0 (2026-10-28)

The first release under RELEASING.md's pairing rule: `ts/v0.3.0` is tagged on
this merge, and `go/v0.3.0` follows on the commit that ships its page runtime.
Both state viewer 0.3.0. There was no ts 0.2.0, because the Go module had
already used 0.2.0. Go entries below include changes first tagged in
`go/v0.1.1` and `go/v0.2.0`. `go/v0.1.1` has its own section further down;
`go/v0.2.0` has none.

### Breaking

- The page shell (`renderEvidenceGraph`, the emitter shell and the Go
  emitter's `shell.html`; capsule-viewer#60):
  - Every page has a width and padding: the theme's `--aac-page-width` and
    `--aac-gutter` now default to 60rem and 1rem (they were `none` and `0`),
    and `--aac-page-pad-block` is new. A module's own `.cv-page` drops its
    width and padding inside it. The outcome and compliance cards keep their
    own frame (`#app.cv-shell-chrome`).
  - The verdict is a pill at the top of the page, after the presentation
    header, in the words of agent-action-capsule's presentation contract
    section 6.2 (capsule-viewer#79): one of its five states, drawn from
    AAC's `verificationBanner`, with each line exactly
    `vectors/viewer-core-text/core-text.json`. `data-verify` is `checking`
    while the checks run, then `verified` only for a `valid` verdict,
    `incomplete` when no check failed but some were not run (a bundle with
    unsigned records or an unsigned checkpoint, which earlier read as
    verified), `failed`, or `unable`; the pill also carries `data-verdict`
    and `data-checkpoint`, and a `[data-banner-detail]` line under the bar
    names the verifier's findings. The words "Contents checked" and "Check
    failed" are gone, as are the pill's `role="img"` and `aria-label`: its
    visible line is the whole verdict. A module that changes, moves, hides
    or restyles the banner or its details line while it renders, by its
    nodes or by a stylesheet, is discarded for the `presentation-failed`
    refusal, on the live page and when the static page is built. The static builder's `verification`
    is the same state (`"verified" | "incomplete" | "failed"`, type
    `StaticVerification`), as is its notice's `data-built-verification`.
    An embedded mount (`mountPresentation`) draws the same elements
    (`.cv-shell-bar`, `.cv-pill`, `details.cv-checked`) and leaves their
    styling to its host page: the viewer sets no page-level style on a page
    it does not own.
  - The verification page is folded into one `<details data-checked>`
    section, "How this page was checked", closed when the bundle verified.
    It is now the rendering's last element, with the
    `[data-page="verification"]` section inside it.

- Python `capsule_viewer.ledger`: the page is drawn over an evidence file the
  ledger's producer wrote, such as `capsule-emit bundle LEDGER --all`; the
  viewer no longer builds one. `ledger_bundle()` is removed,
  `check_and_render(bundle, *, source, depth)` takes that bundle instead of
  the ledger's records, and `python -m capsule_viewer.ledger BUNDLE.json`
  reads a bundle file instead of a JSONL ledger. Requires capsule-emit 0.12
  (`capsule-emit>=0.12,<0.13` in the `evidence` and `dev` extras), which
  removes the `permalink.build_bundle` this used (capsule-emit#338).
- The contract-report module's own words moved off the `report.*` prefix
  onto `card.*`: `report.*` is reserved by agent-action-capsule
  spec/contract-report-v1.md section 3 (`report.title`, `report.summary`),
  and the module's own words must stay off every section 3 prefix. A pack
  carrying the old `report.*` keys for the module's own concepts no longer
  reaches them.
- Both default wording packs bump to `@2`
  (`capsule-viewer/contract-report/outcomes@2`,
  `capsule-viewer/contract-report/eu-ai-act@2`); their `wording_sha256`
  changes (#52 adds section 3 enum defaults and the resolved-conversation
  out-of-scope header split). A pinned `@1` digest no longer matches.

### Added

- `go/pageruntime` ships the page runtime (capsule-viewer#111): the
  `evidence-graph.iife.js` that `ts/scripts/build-iife.mjs` builds, committed
  as built at the commit `pageruntime.Commit` names, as `IIFE` with its
  `SHA256` pin, beside its NOTICE and THIRD_PARTY_NOTICES.
  `scripts/pageruntime.sh` rebuilds it there and compares it byte for byte
  (CI), or refreshes it with `--write`.
- The runtime's global `EvidenceGraph` carries the verifier functions a
  presentation module may call, beside `registerPresentation`:
  `buildResultRoot`, `disclosureOf`, `ed25519Available`, `verifiedPayload`,
  `verifyDisclosureEnvelope` and `verifyProducerEnvelope`,
  agent-action-capsule's own functions re-exported from `ts/src/browser.ts`.
- `go/presentation` declares the report page's block names:
  `CardExtension` (`report-card/v1`), `PresentationExtension`
  (`presentation/v1`) and `ContractReportExtension` (`contract-report/v1`).
- The embedded packaging writes a snippet a host page inlines
  (action-state-group/capsule-cli#254). Given the core runtime,
  `buildPresentation(..., {format: "embedded"})` also returns `html`, the
  snippet `emitEmbeddedHtml` writes. It makes `mount`'s
  `renderEvidenceGraph` call, with the bundle in a JSON data element. It
  also returns `scriptSources` and `styleSources`, the hash sources a strict
  host CSP must allow.
- The Go emitter writes the fragment and embedded packagings
  (action-state-group/capsule-cli#254). `BuildPresentationFragment` and
  `EncodePresentationFragment` write the `aac.presentation-fragment/v0`
  token and refuse an over-long token or URL with `*FragmentTooLargeError`.
  `BuildEmbeddedHTML` writes the embedded snippet. Both match the
  TypeScript builder byte for byte on seeded vectors that the TypeScript
  tests generate (`go/emitter/testdata/fragment-vectors.json`,
  `embedded-vectors.json`).
- The deal receipt modules (unilateral and seller; Python and the module-slot
  scripts) show the errand's journey under "How it went" (capsule-viewer#53):
  one row per move in the sealed report's `journey`, in order, as who moved
  ("You", "Your agent", "The other side") and what, opening to the step it was
  read from. A switch of merchant is the user's move. The words are the
  receipt pack's `journey.*` keys, mirrored from capsulectl's by test, and
  match capsulectl's own deal page for the same bundle. A shared copy and a
  report with no journey show no section.

- The Outcomes rule table draws each requirement of the cited contract that the
  Result's `requirements_covered` leaves out as a "not covered" row, in a group of
  its own (capsule-viewer#96; agent-action-capsule#355). It is in no
  conversation, count, column or sentence on the page, and a card without
  `requirements_covered` is unchanged. New wording keys
  `lines.rules.not-run` and `lines.rules.not-run.h` in the Outcomes pack
  (`@2`, still unreleased). `spec/contract-report-module-v1.md` §2 gains a bullet for it.
- The presentation contract's text, schema, examples and checkers, moved from
  agent-action-capsule at `60a5b11` (agent-action-capsule#379), with every
  public name unchanged: `spec/presentation-contract-v0.md` (without the
  parts that stay in agent-action-capsule, which it cites there: the
  "Verified" gate, the check lists and banner words, the refusal sentence,
  evidentiary words and `sha256-jcs-nonce256`, and I3, in
  agent-action-capsule's `spec/verification-display-v0.md`, and the
  deprecation table, in its `spec/REGISTRY.md` section 14),
  `spec/contract-report-module-v1.md` (sections 2 to 4 of
  agent-action-capsule's `spec/contract-report-v1.md`, which keeps the block),
  `spec/presentation-builder-v0.md`, `schemas/presentation-manifest-v0.json`
  and its examples, `schemas/check_presentation_manifest_examples.py`, and the
  wording-pack half of `schemas/check_contract_report_examples.py`, which
  reads byte copies of agent-action-capsule's Result schema and rendering
  cases pinned by SHA-256 (`schemas/README.md`). The moved text keeps its
  BSD-3-Clause licence (`LICENSE-BSD-3-Clause`). `scripts/check-moved-spec.py`
  checks that the text changed only by its declared edits, and CI runs it and
  both checkers on every pull request.
- A wording pack may not carry a key that begins `core.`: the prefix is
  reserved for the core's own text (presentation contract section 7.4), and
  `$defs/WordingPack` rejects such a pack (`neg-wording-pack-core-key.json`,
  with its mutant, and `wording-pack-core-key-cases.json`). Carried from
  Steven Mih's agent-action-capsule#356, with thanks.
- capsule-viewer now carries the presentation registry runtime, moved from
  agent-action-capsule at `60a5b11` unchanged, names included
  (agent-action-capsule#379): in TypeScript the registry
  (`ts/src/presentation-registry.ts`), the built-in manifests
  (`ts/src/builtin-manifests.ts`) and the fragment packaging
  (`ts/src/presentation-fragment.ts`), exported from the package and used by the
  viewer in place of agent-action-capsule's; in Go the package
  `github.com/action-state-group/capsule-viewer/go/presentation`. The
  presentation-resolution corpus moves with them to
  `vectors/presentation-resolution/`, regenerated byte for byte by
  its generator in `npm test` and run in full by both languages, with the
  agent-action-capsule bundle vectors and manifest examples it reads
  vendored under `ts/test/testdata/aac-vectors/`. The Go module now
  requires agent-action-capsule Go v0.14.0.
- The verification page's extension rows carry `data-interpreter`, the id of
  the interpreter that showed the block, when one did, as
  agent-action-capsule's renderer wrote it (agent-action-capsule#379).
- The contract-report module (`ts/src/contract-report.ts`): one view for the
  Outcomes report and the EU AI Act Results, with the module's own words
  taken from a wording pack (`aac.wording-pack/v0`). Not in the pack: what
  the bundle itself states (the producer's obligation titles and test
  names, in italics; sealed rule wording) and two lines
  agent-action-capsule's outcome model writes (the outcome statement and
  the resolution rule); the module never takes its own words from a bundle
  (presentation contract section 6). Two default packs ship
  with the viewer, never in a bundle: `ts/src/wording/contract-report-outcomes.en.json`
  and `ts/src/wording/contract-report-eu-ai-act.en.json`. A host passes its
  own pack as the page's `wording` (bound by `wording_sha256`, the pack the
  presentation builder already carries); its entries replace the default
  pack's. A pack changes words only: every entry it replaces must keep the
  same `{placeholders}`, two verdicts may not share a word or take another
  verdict's default word, and the grouping is fixed, or the pack is refused and no card is drawn. The lines that say what the page checked
  or didn't, what the bundle withholds or doesn't state, and which text is
  the producer's rather than evidence are locked (`LOCKED_ENTRIES`): a pack
  that rewords one is refused. The presentation builder refuses a pack that
  doesn't fit the selected report, naming every problem, as
  `ts/scripts/render-report.mjs` does; `render-report.mjs`
  draws a page from a bundle with a pack. The grade-ladder word set the cards
  kept behind a code flag (`LADDER_WORDS`, removed) is now just a pack.
- One nesting rule for every report page (SEAMS ruling 11): a level-2 toggle
  inside a level-1 toggle, never deeper (and, in `nestingProblems`, never
  inside another level 2). `nestingProblems` in
  `ts/src/report-levels.ts` and `capsule_viewer.kit.check_nesting` check it;
  both cards pass with every toggle open. The receipts adopt it in #47.
- Golden pages for both cards, closed and fully open
  (`ts/test/goldens/contract-report/`).
- The outcome report and EU AI Act obligations cards carry a short block on
  their front, outside every toggle, that says who judged, who witnessed and
  what verified:
  - **Judged by:** each distinct judge pin the cited reports state, with its
    count (never one picked for all); the model only where every report with
    that pin states the same components and they recompute to it, else why
    no model is shown. Withheld reports read "withheld" with their count,
    reports the bundle does not carry are counted with their judge "not
    stated", and results recomputed by a checker are named as such.
  - **Witnessed by:** the witness receipts in `checkpoint.witnesses` as the
    bundle states them (this page does not check them), else "not stated".
    Placeholder entries and entries that cannot be read are counted, never
    named as witnesses. Then the checkpoint's log id, size and root, and
    whether this page could check its signature.
  - **Verified by:** this page's code, by package name and version, at the
    commit the build was made from (the first 12 hex characters), or
    "commit not stated" when the build didn't supply one, with the
    verifier and its version (`ts/src/viewer-build.ts`, held to the
    installed packages by a test and by the page runtime build), and the
    tool that built the bundle as the bundle's own report names it, which
    this page does not check, with its version or "version not stated".

  Every value comes from the verified bundle or the viewer's build constants
  and is set as text only. Strings from the bundle (model ids, checker refs,
  witness addresses, log id, producer and version) are quoted and capped at
  120 characters, so they never read as the page's own words. New runtime
  style hashes in `go/emitter/runtime-style-hashes.txt` and the Go goldens.

- The contract-report module resolves on `contract-report/v1`
  (agent-action-capsule#352), registered in place of
  `aac.builtin.result-contract-report/v0`, never beside it
  (spec/contract-report-v1.md section 4). It reads section 3's keys
  (`report.title`, `report.summary`, `group.<segment>.title`,
  `row.<requirement_ref>.label`/`.detail`/`.not_evaluable`,
  `verdict.<value>`, `sufficiency.<value>`, `tier.<value>`,
  `grade.<value>`, `status.<value>`), layered over the module's own
  default pack entry by entry: a host layer that does not check (digest,
  shape or fit) is refused and contributes no words, and the card draws
  with the default layer and a visible notice. A `verdict.*` or `tier.*`
  word is read through the layout's own key and checked as it is, and may
  not differ from that key in the same pack; the claims' assurance words
  (`status.*`, `grade.*`, `sufficiency.*`) are locked. A Result whose
  claims the card cannot place one by one (claims under more than one
  `contract_ref`, a requirement judged more than once in one conversation,
  claims of another type or id shape) is drawn as the generic Result page
  with a note, so no claim is merged or left out. Tuning details in
  `ts/README.md`. By Jody Edmondson (#58), completed by Ethan Zhang.
- Requires `@action-state-group/agent-action-capsule` 0.8.0 (it was
  0.5.0; 0.6.1 adds the `contract-report` interpreter id, #72, 0.7.0
  exports `verificationBanner`, capsule-viewer#79, and 0.8.0 removes the
  presentation registry and the page renderers that moved here,
  agent-action-capsule#379), which
  carries the `contract-report/v1`
  registration (#352), `out_of_scope`/`applies_from` (#368, #363, 8732264) this release also ports onto `compliance.ts`,
  `compliance-view.ts`, `outcome-report-view.ts` and the generic Result
  page: a judged-out-of-scope claim is its own count, in the population,
  never "met" and never "not applicable"; a claim not yet in force is
  readiness only, outside the population, unless it failed verification.

- One record view in the core (capsule-viewer#76): the check section's
  "Records in this bundle" lists every record once, each with its own
  address `#record-<capsule id>`, its times, seal status and disclosed
  content. Content modules (`ts/src/record-content.ts`) draw content they
  recognise; the conversation module draws chats, and content no module
  recognises is shown as recorded, indented.

### Changed

- One token source (capsule-viewer#71, part 1): `tokens/tokens.json` now
  generates the kit's `TOKENS` and `--cv-*` stylesheet block, the emitter
  shell's `--aac-*` block (Go and TypeScript copies) and the outcome and
  compliance frames' variables, and `tests/test_tokens_sync.py` fails when a
  generated file differs. Emitted pages are byte-identical.

- Go: `presentation` takes the page's verification gate and its reading of
  a producer selection from agent-action-capsule's `go/bundle`
  (`bundle.Verified`, `bundle.VerifyBundleForPage`, in AAC Go v0.14.0)
  instead of carrying copies, so AAC owns the one verification reading
  (agent-action-capsule#379). `presentation.Verified` is removed; use
  `bundle.Verified`. `DescribeBundle` is unchanged.
- With agent-action-capsule 0.8.0 (agent-action-capsule#379), with no
  change on the page:
  - The verification gate is AAC's own `bundleVerified`, which
    `ts/src/presentation-registry.ts` re-exports in place of its copy.
  - AAC's verification page model no longer carries presentation refusals.
    The registry lays them over it: `presentationExtensionRows` replaces the
    row of an extension a refused module requires with its refusal row,
    taking the integrity words from the row's own `integrity`, and
    `presentationRefusalNotices` gives the line for each refused module with
    no row. `PresentationExtensionRow` and `PresentationRefusalNotice` are
    capsule-viewer's own types for them.
  - The deprecated aliases `outcome-report/v1` and `eu-ai-act-compliance/v1`
    keep their reader and their rows: `ts/src/outcome-report-presentation.ts`
    is AAC 0.7.0's reader, and `ts/src/alias-interpreters.ts` defines the
    `outcome-report-card` and `compliance-card` interpreters AAC removed,
    until the alias path is removed here.
  - The page runtime (`dist/evidence-graph.iife.js`) bundles AAC through
    its own browser entry, so the esbuild plugin `ts/scripts/aac-browser.mjs`
    is removed.
- AAC 0.8.0's outcome-report model reads a criterion with no claim as not
  applicable only when the Result's `excluded_not_applicable` accounts for
  every missing claim, and otherwise as the new verdict `no_claim`, a gap
  (agent-action-capsule#355). The outcome card draws a `no_claim` criterion
  in the words of one no judge decided ("could not decide"), counts it with
  the rule's undecided conversations, and names it in the conversation's
  sentence without a judge: "this bundle holds no rule result for {names}"
  (new keys `lines.sentence.undecided.gaps`,
  `lines.sentence.undecided.gap-note` and `lines.pf.verdict.no_claim`, "no
  claim", in the proofs). Such a Result's page changes: those criteria no
  longer read as not applicable.
- The moved spec text cites agent-action-capsule's
  `spec/verification-display-v0.md` and `spec/REGISTRY.md` section 14, now
  that they exist (agent-action-capsule#400), in place of the presentation
  contract sections they came from. The vendored agent-action-capsule files
  are re-copied at `b646f94`, and `scripts/check-vendored-aac.py` pins that
  revision itself (`--print-rev`), apart from the revision the spec text
  moved from.

- "Witnessed by" on the front of both cards says the witnesses are "stated by
  the bundle, not checked here" (SEAMS ruling 12), in place of "as the bundle
  states; this page does not check witness receipts".
- "Witnessed by" on the front of both cards follows agent-action-capsule's
  strict witness status alone, as the banner already did (capsule-viewer#46,
  from evidencebook#115). The contract-report modules now get AAC's strict
  result as `verification.strict`. A receipt AAC passed reads "receipt
  checked here, and it verifies". One AAC could not check keeps "stated by
  the bundle, not checked here". When AAC fails any entry, nothing on the
  line reads as witnessed: it says "not witnessed", and names each failing
  receipt with AAC's reason and counts the entries it cannot read (or, for
  any other failure, quotes AAC's findings). The folded line reads "witness
  receipts partly checked here" when only some receipts passed. A page's
  context has no witness directory, so on today's pages a well-formed
  receipt reads as not checked. The line carries the state in
  `data-witness` (`verified`, `not-checked`, `invalid` or `absent`). New
  locked keys in both default packs: `prov.witness.verified`,
  `prov.witness.invalid`, `prov.witness.failed`, `prov.witness.failed-entry`,
  `prov.witness.invalid.unreadable.one` and `.other`,
  `prov.witness.invalid.findings`, `prov.brief.witness.verified`,
  `prov.brief.witness.partly-checked` and `prov.brief.witness.invalid`. Both packs'
  digests change.
- The report proofs name the wording pack that drew the card ("Words"), and
  now every wording layer applied, by digest -- the built-in default's too,
  even on a default-only page. A few default words moved with the rewrite:
  `judge.note.sure`, `lines.hc.lede`, `lines.line.added.help` and
  `lines.line.undecided`; no style changed, so no CSP hash moves.
- The outcome report and EU AI Act obligations cards have two levels and no
  more. The summary states what was checked and the result per line in plain
  words. A first toggle on a line lists the conversations behind it in place,
  each one readable as it stands: the result, rule by rule or test by test
  with the test names, and the conversation as a chat (User, Agent, tool calls
  and tool results). A conversation is never a toggle of its own. The second
  toggle is that conversation's proofs: record ids, digests, the judge pin and
  how to recompute. One more second-level toggle at the foot of the page holds
  the proofs for the whole report. No `<details>` sits inside more than one
  other, and a first-level toggle never holds another. Toggle bodies are built
  when first opened, and each conversation's body when it scrolls near the
  view. Shared code is in `report-levels.ts`.
- The missed line still says why conversations missed: the producer's sealed
  reason code by its label in the terms, else the first rule not met, then
  the missed conversations under each reason, inside the same toggle.
- Tool results are shown exactly as sealed. JSON is indented only when that
  changes nothing but whitespace; a number JSON cannot hold exactly, a
  duplicate key or a differently written escape keeps the original text.
  Tool arguments are shown as the outcome report model hands them over, and
  the page says so: at agent-action-capsule 0.5.0 `transcriptTurns`
  re-serialises them, so a number JSON cannot hold exactly may already be
  rounded. They are never called verbatim.
- A conversation that could not be decided, or where no rule applied, is no
  longer counted as missed. One with no rule result at all reads "could not
  decide", never "no rule applied".
- Results are worded met, not met, did not apply and could not decide. No
  bundle setting chooses the words (presentation contract section 6): the
  grade-ladder set (established, failed, not present, inconclusive, not
  checked) is the module's own vocabulary in `report-levels.ts`, off, for a
  viewer-side wording pack to select once packs reach the modules. A failed
  or unsupported claim reads "failed verification" or "evidence missing", in
  a neutral tone. An undecided rule whose report is withheld reads "could
  not decide" with the note that the report is withheld; one whose report is
  in the bundle but cannot be read says that instead. Neither reads "not
  checked". The ladder never says "established in every session".
- A claim that failed verification, or whose cited evidence is not in the
  bundle, is its own state, never counted as "not met": the outcome card
  shows a "Could not verify" line and, when a bundle has any, its own column
  in the rule table; the EU card counts such sessions apart from the
  exceptions and draws no finding for them.
- An undecided conversation says no rule result was "not met", never "no
  rule was broken": the records do not show that an undecided rule was met.
- An EU obligation reads "No exceptions", in the ok tone, only when every
  one of its tests was met by at least one session. When none of its tests
  could be checked it reads "Could not be checked"; when some could not, the
  pill is neutral and says how many. A test with no result never reads as a
  pass.
- The EU card's obligation pill speaks only for the sealed counts. Whether
  an obligation is in force is the producer's `applicability`, shown in the
  producer's italic line beside the title, never in the pill. The regulation
  named in the heading, finding ids and severities are set as the
  producer's too; an unknown severity gets no colour of its own.
- The proofs say the judge's note is derived from its probabilities only
  when every rationale is the judge's probability line.
- A conversation body built lazily holds no print listener of its own: one
  `beforeprint` listener per page builds the bodies still in it, so a host
  that re-renders the card keeps no old model alive.
- Pages built from bundles that withhold the reports read the period, the
  case record and the EU tiers from what the bundle does carry, and say the
  judge pin is withheld rather than "not stated". Only withheld reports are
  called withheld; a report that does not match what was sealed, cannot be
  read, or whose capsule is missing or does not check out, is named as such.
  A case taken from the claims (every report withheld) shows its conversation
  as the case every claim cites, never as the conversation the judge read. "Terms locked" and "Agreed with the counterparty"
  are drawn only when a bundle states them.
- Both card stylesheets changed, so `go/emitter/runtime-style-hashes.txt`
  and the Go goldens carry the new CSP hashes.
- Requires `@action-state-group/agent-action-capsule` 0.5.0 (ts), which
  carries the outcome report model change (model-named case ids,
  `reportState` and the withheld-report helpers, the `cited` transcript
  state). `ts/src/record-dating.ts` repeats three of its unexported
  functions until a release exports them.

- The contract-report page layout (capsule-viewer#75): the mock-judge line
  is a mark under the report title; the provenance line opens the L1 card
  and no longer names the mock judge; every panel starts at one inset
  (`--aac-inset`); count headers stay on one line on wide screens; the EU
  report has the same white header as the outcome report.
- A conversation opens in place inside its card, with close controls at
  both ends and a link to its record (capsule-viewer#76). On a static page
  the card links to the record instead, so each conversation is in the page
  once.

### Fixed

- The verification section's summary line names the signature checks that
  were not run, each by its own words (for example "checkpoint signature not
  checked here"), instead of the fixed "signatures not checked here". Under
  AAC's strict verdict in a browser, where only the checkpoint signature
  cannot be checked, the line no longer says the producer signatures, listed
  as checked beneath it, were not (capsule-viewer#118).
- A report page's "Verified by" line says "plus unreleased changes" after the
  viewer version when the page runtime was built from a commit that no tag
  `ts/v<version>` points at, so a page drawn by code newer than `0.1.0` no
  longer reads as the `0.1.0` release (capsule-viewer#118). A build from the
  tagged release reads as before.
- The banner frame check discards a module that covers the banner with a
  layer the browser hit-tests, or clips it (capsule-viewer#125). After
  comparing computed properties, it hit-tests the centre of every character
  of the bar and the details line that is in view where the reader is. A
  layer of the module's, or a module rule laying out `<head>` or `<style>`,
  found over a character discards the module, unless it paints nothing there
  (a faded-out dialog, an empty container for toasts). The host's own
  elements are passed over. An overlay with `pointer-events: none` is found
  too. Every box that clips the banner, from `<html>` to the banner's own
  elements, may not shrink by more than a scrollbar, wherever the reader has
  scrolled. The bar's place now maps each scroll offset into viewport px
  through the transforms above it, which are compared exactly, instead of
  through the container's size ratio. Nothing is scrolled to measure, so a
  reader's scroll, smooth or not, is left as it was. The whole check runs
  again once the page settles (after the next frame and the timers then
  due), so a toolbar or modal a module opens just after its render returns is
  caught too. The routes capsule-viewer#117 left open are closed:
  - an opaque layer drawn by `head`, `style` or the module's own content;
  - a scrolling host shrunk to zero height;
  - a fractional host height skewing the place bound.

  An honest module now renders while the reader scrolls inside a rotated
  host. Not found:
  - paint the browser does not hit-test (an outline, a shadow, a reflection);
  - a layer whose `pointer-events: none` is set important inline or in the
    module's own cascade layer;
  - a layer over words out of view when the check runs;
  - anything a module draws after the settle.

  The check targets a module's mistakes, not trusted code written to hide the
  banner, which the builder's pin governs (see capsule-viewer#125). The Go
  module ships the runtime built with this fix (`go/pageruntime`).

- The banner frame check discards a module whose stylesheet scales, moves,
  clips or hides the banner by styling `html`, `body` or another ancestor of
  the page root, or pushes the banner's words out of view with padding or a
  border (capsule-viewer#117). Earlier it read only the root, the bar and the
  details line, and not their paddings or border widths, so `transform`,
  `scale`, `translate`, `opacity`, `filter`, `clip-path`, `mask-image`,
  `contain`, margins, paddings, borders or `position` kept the render while
  the banner shrank, left the page or was clipped. It now compares the same
  computed properties on every ancestor up to `<html>`, before and after the
  module renders, and adds `mask-image`, `contain`, the paddings and the
  border widths to what it compares on the banner and the root. On an
  ancestor, `top`, `left`, the vertical margins, paddings, border widths and a
  transform's translation are compared to within the same 9px as the side
  margins, since an embedded host that places its widget with percentages
  moves them when the page grows a scrollbar; `right` and `bottom` are not
  compared there. Because those shifts add up across ancestors, the bar's
  place in the document is bounded too: it may rise by at most 9px and move
  sideways by at most 18px, wherever the reader has scrolled. A host that
  centres a growing widget vertically lifts the banner by itself, and an
  honest module there is discarded (it fails closed). A module that restyles
  `html` or `body` in any other compared property is discarded. The routes it
  left open are closed by capsule-viewer#125 (above).

  The Go module ships the runtime built with this fix (`go/pageruntime`).

- The banner frame check no longer discards a module render when the page
  grows a classic scrollbar (capsule-viewer#113). A computed `auto` side margin
  is its used width, so the shell's centred page root and bar changed by half
  the scrollbar width; the side margins are now compared to within 9px
  instead of exactly. This assumes a classic scrollbar of up to about 18 CSS px;
  at a very low page zoom a module that makes the page scroll can still be
  discarded (it fails closed).

- The deal receipt modules (Python and the module-slot scripts) read a copy
  whose report capsulectl seals as a standalone record in `x-deal-report/v0`,
  on no log (capsule-cli#294; capsule-viewer#104). Earlier they matched no
  module for any copy capsulectl cut since that change. The signature of that
  record is checked by capsulectl verify, not by the module: the module reads
  the report only when the verifier reported its check as passed, and says
  only that reported status.

- The composition section (`composed/v1`) fits the page at 1280px and in
  print (capsule-viewer#57). Its tables were wider than the page because the
  ten-column members table, and the joins and agreement tables, carry
  unbroken 64-hex ids. A value cell may now break anywhere, with the full id
  still the cell's text, and on screen each table sits in a container that
  scrolls sideways instead of widening the page. The section inserts its own
  scoped stylesheet (`COMPOSED_CSS`), so the emitters' CSP lists one more
  core runtime style hash (`go/emitter/runtime-style-hashes.txt`).
- A static page shows every toggle's content when a reader opens it
  (capsule-viewer#67). The builder builds every body still pending before
  it writes the page (rule rows, test rows and their sessions, proofs),
  with the toggles' own builders, keeping each toggle open or closed as
  the depth left it; before, only the records section was built and a
  closed toggle at L0 or L1 opened empty. The static result now returns
  the page's size (`bytes`) and its budget (`limit`): 16 MiB by default
  (`STATIC_PAGE_DEFAULT_BUDGET`), changed with `maxStaticBytes`. A page
  over it is refused as `static-too-large`, and a body the builder cannot
  build as `static-body-unbuilt`; `availablePackagings` reports both.
- The two report notes on tampering (`groups.vd.note`, `lines.rp.tamper`) say
  what a bundle that did not verify now gets: no report, the red "Check
  failed" callout, the checks that failed and each record's id and status,
  with no record content. They said
  the whole page was replaced by a banner, which stopped being true with
  capsule-viewer#74 and #76.
- A capsule id the bundle lists more than once has one entry in "Records in
  this bundle", with one address and a note of how many times it is listed,
  and the summary counts ids, naming listings when they differ; it had an
  entry per listing and only one address.

- The verification page lists `contract-report/v1` as interpreted, shown by
  the page's module, when the contract-report module drew the page; the
  earlier `outcome-report/v1` or `eu-ai-act-compliance/v1` block it drew its
  card from is still listed as interpreted beside it. It read "not
  interpreted" before. Takes agent-action-capsule 0.6.1, which adds the
  `contract-report` interpreter id (agent-action-capsule#377). (#72)

- The outcome report counts the criteria each conversation was judged on
  instead of always saying "nine", and fits a 390px viewport: the header
  stacks at narrow widths, and the day calendar keeps each date on one line.
  Ported from agent-action-capsule#323. The Go emitter's CSP hash for
  `OUTCOME_REPORT_CSS` (`go/emitter/runtime-style-hashes.txt`) follows, so a
  page whose runtime carries the new stylesheet is not blocked.
- The EU AI Act obligations card dates each session by its cited case record,
  as the outcome card does, instead of by the day its reports were sealed: a
  backfilled record by its `source_asserted_at` ("source says",
  self-attested), with the import time and sealed day in the session's proofs;
  a plain record by its own timestamp; otherwise the sealed day. The header
  says "judged" only for sealed days, and What ran shows the period, the
  sealed days and the outcome card's dating note. Ported from
  agent-action-capsule#193. No style changes, so no CSP hash moves.

## go 0.1.1 (2026-10-20)

Go module only (tag `go/v0.1.1`); there was no ts release. The same entry is
also listed under ts 0.3.0 above, the first ts release to carry the change. In
the Go module this release changed only the CSP hash for `OUTCOME_REPORT_CSS`
in `go/emitter/runtime-style-hashes.txt`: the criteria count and the phone
layout are in the TypeScript runtime. The new hash replaced the old one, so
a page whose runtime carries the ts 0.1.0 outcome stylesheet has it blocked by
this emitter.

### Fixed

- The outcome report counts the criteria each conversation was judged on
  instead of always saying "nine", and fits a 390px viewport: the header
  stacks at narrow widths, and the day calendar keeps each date on one line.
  Ported from agent-action-capsule#323. The Go emitter's CSP hash for
  `OUTCOME_REPORT_CSS` (`go/emitter/runtime-style-hashes.txt`) follows, so a
  page whose runtime carries the new stylesheet is not blocked.

## ts 0.1.0 and go 0.1.0 (2026-10-16)

The first release of the npm package and of the Go module (tag `go/v0.1.0`).

### Added

- The page emitter and presentation builder, moved from agent-action-capsule
  (agent-action-capsule#281) and still pinned to the same Go/TypeScript
  byte-parity goldens and CSP hashes:
  - Go: package `github.com/action-state-group/capsule-viewer/go/emitter`,
    the former `github.com/action-state-group/agent-action-capsule/go/emitter`,
    with the same API. It depends on agent-action-capsule's Go module v0.8.0.
  - TypeScript: `emitEvidenceGraphHtml`, `buildPresentation`,
    `offlineHtmlFromFragment` and the rest of agent-action-capsule's
    `emitter.ts` and `presentation-builder.ts` exports, from the package
    root. The in-browser renderer (`renderEvidenceGraph`) ships bundled as
    `dist/evidence-graph.iife.js`. Bundle verification comes from
    `@action-state-group/agent-action-capsule` 0.1.1, now a dependency, along
    with `@action-state-group/cll`, which that version needs to load.
- The moved files keep their BSD-3-Clause license (`ts/LICENSE-BSD-3-Clause`,
  `go/emitter/LICENSE`).

## ts 0.0.0

A placeholder, published by hand so npm could take a trusted publisher. It
holds no code; see RELEASING.md, "Registry configuration".
