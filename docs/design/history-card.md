# History Card: design (v0)

Status: built, reworked on 2026-10-12 to the History file shape agreed with
the producer (capsule-cli PR #209), reading agent-action-capsule's
VerifiedBundleContext (PM u334, design v0.5), and re-cut on capsule-cli
main, #209 merged as squash 88503f96 (first cut on #209's head cb68ea9), whose `deal history` writes the `history` audience by default
(neutral u888/u890, PM u335), seals who the History is for and each deal's
steps after its checkpoint, and writes each History on a log of its own
(D2/D3/D4, neutral u949). The History Basic wording (L0 lines, banned
status words, page check states, checks-ran list) follows wording
requirements FR-7a, FR-7b, FR-31, FR-32, section 5.2 and test T8
(company-oss u343, rc16); its consumer strings are in one table, **Wording
(Steven-gated)**, at the end. The module is
`src/capsule_viewer/static/history_card.js`, one self-contained module-slot
script that reads its words from its wording pack,
`src/capsule_viewer/history/wording-en.json`, carried in the script as data
(the pack's bytes, which the script hashes for the `wording_sha256` its model
records with its `renderer_version`); its manifest is
`src/capsule_viewer/history/manifest.json` (this directory's sketch, plus the
script's pin). The Python side is the manifest, the check's Python twin
(`capsule_viewer.history.recompute`) and the fixture helpers.

A History Card shows a reader the deal copies that the holder of one key, K,
presents: which deals, over what period, and the effect status each act's
record states. A History's copies withhold every record's payload, so the card
shows a deal's outcome and its acts' action classes as **not proven**. The
card publishes properties of the presented selection and never a score,
rating, reputation, rank or trust number.

**What a History shows, and what it does not.** A History shows only that the
holder of key K presents these copies, each of which verifies on its own. It
does not show that the holder of key K made, took part in or owns these deals.
A record's signature sits outside its Capsule ID, so anyone can take someone
else's counterparty copies, re-sign every record under a fresh key K, seal a
selection with K, and `capsulectl verify --bundle` still says VALID. The page
says this in L0, in that sentence (pinned by a test), and none of its words
says or implies that the holder of key K made, took part in or owns the deals.

## Sources this design rests on

| Ref | Repository and commit | Path |
| --- | --- | --- |
| [producer] | capsule-cli `88503f966ce85c40e01705f37c9ef734678cfd59` (main, #209 merged as squash 88503f96) | `internal/cli/deal_history.go` (`deal history`, `dealHistoryMember`, `historyBundle`, `historyEntry`, `historyHolderStated`, `historyNotProven`, `historyLogPrefix`, `stepCount`, `payloadDisclosed`), `internal/cli/deal_sale_bundle.go` (`sealedOrInlineReport`) |
| [aac-id] | agent-action-capsule `ab4ee43b71d6e074c6a000b5b19a9caf9720235e` | `python/agent_action_capsule/canonical.py` (`compute_capsule_id`, `json_digest`) |
| [registry] | this repository | `src/capsule_viewer/registry.py` (`co_matchable`, the static ambiguity test) |
| [aac-context] | agent-action-capsule `3a7aca6` | `ts/src/bundle.ts` (`VerifiedBundleContext`, `buildVerifiedBundleContext`, `verifyBundle`), `ts/src/verify.ts` (`VerificationResult`, `verifyClass1`), `ts/src/presentation-registry.ts` (`bundleVerified`, `resolveModules`), `ts/src/evidence-graph-view.ts` (`renderEvidenceGraph`) |

## 1. The History file

The holder of key K selects deal copies. The card never selects and never widens the selection.

`capsulectl deal history --deal ID [--deal ID ...] --out FILE [--audience A] [--to RECIPIENT]`
[producer] writes one file. `--to` is required for the audience `history`
and refused for `keep` (`tests/testdata/history/refused/`).

- The file is an `evidence-bundle/v2` of a **log of its own**, log id
  `deal-history/<nonce>` (the completeness certificate's and checkpoint's
  `log_id`), where `<nonce>` is the 64-hex nonce the selection record seals.
  One log and one selection record per History, so a History carries nothing
  of any other. No deal's log is written.
- One record on that log, the **selection record** (action_id
  `capsulectl-deal-history`), is the bundle's `root`, seals the selection and
  is signed by key K. Its disclosed `agent_input`, at
  `disclosures[<selection record>].agent_input`, is:

  ```json
  {"type": "history_selection", "profile": "x-history-selection/v0",
   "audience": "history" | "keep", "nonce": "<64 hex>",
   "recipient": "<who the History is for>",
   "selection": [{"deal_id": "deal-<16 hex>", "bundle_digest": "<sha256 of the nested bundle's JCS>",
                  "steps_after_checkpoint": <JSON integer >= 0>}]}
  ```

  **What the holder states (D2, D3).** Two reads are the holder's word,
  signed with the selection and checked against no deal; capsulectl verify
  lists them as `"holder_stated": ["recipient", "steps_after_checkpoint"]`
  on every History entry, reports `recipient` and each deal's
  `steps_after_checkpoint`, and the page derives the same list
  (`holder_stated` in its model; a test holds it equal to verify's on every
  real file):

  - `recipient` (D2), who the History is for: required for the audience
    `history` (absent, not a string, or blank after trimming:
    `selection_recipient_missing`, INVALID), absent for `keep`. The card shows
    it in L0 as "For \<recipient\>, as stated by the holder", only on the card.
  - `steps_after_checkpoint` (D3), per entry: how many steps the deal has
    after its copy's checkpoint, which the copy therefore leaves out (a later
    refund or dispute, say). A JSON integer >= 0; missing, negative or not an
    integer makes the entry `selection_entry_malformed:<id>` (INVALID). A
    deal with a count above 0 is not a finding (the History stays VALID); L1
    marks that deal "later steps exist, per the holder". It is not checked
    against the deal.

  Their property, `holder_stated`, is NOT_CHECKED at best ("what the holder
  states, sealed with the selection; not checked against the deals by this
  page or by capsulectl"), FAIL on either finding, and never PASS.

  **Fields added later.** The check tolerates any other field in either
  place and never shows it. The carried `selection` is still compared with
  the sealed one entry for entry, every field included
  (`steps_after_checkpoint` too), so an entry that differs only in a field the
  page does not know is still `selection_not_sealed`.
- `extensions["x-history-selection/v0"]` carries the deals:

  ```json
  {"selection_record": "<capsule id of the selection record>",
   "selection": [{"deal_id": "...", "bundle_digest": "...", "steps_after_checkpoint": 0}],
   "deals": {"<deal id>": <that deal's copy for the selected audience, an evidence-bundle/v2>}}
  ```

  The carried `selection` must equal the sealed one exactly. Each nested copy
  is its deal's own bundle, of its own deal log, verified on its own.

**The audience and the keep marker.** The History's audience is the sealed
selection record's `audience`. Each nested deal's audience is its report's
`audience`, read as capsule-cli's `sealedOrInlineReport` reads it: the sealed
`deal_report` record's `report` when `x-deal-v0` names one by
`sealed_report`, else the inline `x-deal-v0` block. `deal history` writes two
audiences [producer]:

- `history` (the default, and the **only shareable audience**): each deal's
  copy withholds the payload of every record on its log up to its checkpoint,
  so a record shows only what its capsule states: its time and, for an act,
  its effect's status. The copy's `x-deal-v0` block is
  `{"audience": "history", "deal_id": "<id>"}`, with no report text. No new
  record kind and no new field name.
- `keep`: the keep copy, with every private value in it, never one to send.
  capsulectl verify says VALID with audience `keep`; the page says **Not a
  shareable History** (`history_audience_keep`, `deal_audience_keep:<id>`,
  this page's own names).

`counterparty` and `adjudicator` are copies of one deal for someone in it
(`deal report --share`). The producer refuses both for a History
(`tests/testdata/history/refused/`), and capsulectl verify fails a History
whose sealed audience is neither `history` nor `keep`
(`selection_audience_not_history`), or one holding a member for another
audience (`deal_audience_not_selected:<id>`) or one that discloses a payload
(`deal_payload_disclosed:<id>`). The page fails closed on each, as **This
History does not check**.

**What a History does not prove.** A deal's outcome and its acts' action
classes are in record payloads, beside the item, the amounts and the other
party's details, and a payload is disclosed whole or not at all. So
capsulectl verify's History entry carries `"not_proven": ["outcome",
"action_class"]` on every History for the `history` audience. It is not a
finding: such a History is still VALID. The page derives the same list from
the payloads its copies withhold (it cannot see capsulectl's output),
exposes it as `not_proven` in its model, and shows each as "not proven: the
copy withholds the record payload", with no inference. Proving outcome and
action class would need a per-step sealed record that discloses only them;
that is a producer decision (capsule-cli 0.1.5, Steven's call), not this
page's.

**The byte scans.** The history copy carries none of the floor, address,
card, code or contact values of the deals it holds; the keep copy of the same
deals does (the control). For two buyers of one seller, the History of both
sales (the one the seller sends to buyer B) carries none of buyer A's name,
contact, address, item, price or message text, nor B's; the keep copy carries
A's name, address, item and price. The step written after the floor deal's
checkpoint is in no copy. `tests/test_history_card_design.py` scans the bytes.

Every read of a deal record goes through one function, `selected_records`
(Python) and `selectedRecords` (the module): the records of each deal the
carried `selection` names, in selection order, each with its own copy's
disclosed `agent_input` (or none, when the copy withholds it). A deal carried
but not selected is a finding, never read for values. No value is read from a
payload.

## 2. What the card states

| Value | How this page derives it |
| --- | --- |
| `period` | `{from, to, temporal_provenance: "producer_asserted"}`: the earliest and latest `timestamp` of the selected deals' records |
| `selected_count` | the number of selected deals (capsule-cli adds no count field; the page counts the deals) |
| `effect_status` | `{status: count}`: each selected record whose capsule states `effect.status` counts once under it |
| `completeness` | always `"not_asserted"` |
| K (L0) | the number of selected deals with at least one record whose capsule states `effect.status` `confirmed` |
| F (L0) | the number of selected deals with at least one record whose capsule states `effect.status` `failed` |
| outcome, action class | **not proven**: "not proven: the copy withholds the record payload" (`not_proven`, above) |

**K and F, and the status values.** agent-action-capsule defines five
`effect.status` values (spec draft -05, the Effect Record): `planned`,
`dispatched` (sent; result not observed), `confirmed` (result observed and
bound), `failed` and `reverted`. A recorded completed step is `confirmed`, the
only value that says the result was observed; a recorded failed step is
`failed`. `dispatched`, `planned` and `reverted` count toward neither. K and F
count deals, not records, and one deal can count in both. capsule-cli at
[producer] writes only `dispatched` for a deal's act (`internal/cli/deal.go`,
`dealCapsuleInput`), so the real fixtures give K = 0 and F = 0; the in-memory
golden (`tests/testdata/history/l0-golden.json`) exercises both counts.

**L0.** The card opens with two lines, then the page check state:

```
History Card · Delivery outcomes not established
N selected deals · <period> · K with recorded completed steps · F with a recorded failed step
```

`<period>` is the months of the earliest and latest record times, as the
records state them: `Oct 2026`, `Jan–Sep 2026`, or `Dec 2025–Feb 2026`
across a year. With N = 1 the line says `1 selected deal`. The golden holds
section 5.2's example (`6 selected deals · Jan–Sep 2026 · 5 with recorded
completed steps · 1 with a recorded failed step`) and the two real cards.
No line suggests the deals resemble any item, and no deal status uses a
phrase in `tests/testdata/history/t8-banned.json`: test T8 greps the module
for those phrases and its similarity patterns and finds none.

`effect_status` reads only the capsule's own field. `dispatched` means the
producer's runtime claimed a dispatch, not that it arrived. A record with no
effect (most steps, every report) counts under nothing, and nothing is
inferred from a withheld payload.

**`asserted_result` is optional.** The producer writes none. When the
extension carries one (exactly `period`, `selected_count`, `effect_status`
and `completeness`), the page recomputes
it, shows the card only when it matches, and labels the values "stated in
this file and recomputed by this page". When it does not match, the page shows
**This History does not recompute** and no value. When there is none, the
values are labelled "computed by this page from the records in this file".

**`completeness: not_asserted` is always visible.** A selection that leaves a
deal out is a different, honest selection; no check can tell. The card never
claims the selection is all of anything.

## 3. The check

`check(bundle)` (Python, `capsule_viewer.history.recompute`) and `check` (the
module) read the file alone. The module's `check(bundle, context)`, which its
`buildModel` runs, also reads the page verifier's result from the context
(below). They return the findings, a status per property and one state. The findings carry `capsulectl verify`'s names where it has
one [producer, `historyEntry`]:

| Finding | When |
| --- | --- |
| `selection_record_unverified` | the selection record is missing, is not `capsulectl-deal-history`, does not recompute to its capsule id, its disclosed pick does not hash to its `agent_input_digest`, or is not `history_selection` / `x-history-selection/v0` |
| `selection_record_unsigned` | the selection record carries no `key_id` or `signature` |
| `selection_record_not_root` | the bundle's `root` is not the selection record |
| `not_a_history_log` | the History's completeness certificate or checkpoint names a `log_id` other than `deal-history/` and the sealed nonce, or the sealed nonce is not 64 lowercase hex (D4) |
| `selection_not_sealed` | the carried `selection` is not the sealed one |
| `selection_missing`, `selection_entry_malformed:<id>` | the sealed pick is empty, or an entry is malformed or repeated: its deal id, its digest, or its `steps_after_checkpoint` missing, negative or not a JSON integer (D3; makes the History INVALID) |
| `selection_recipient_missing` | the sealed audience is `history` and the sealed `recipient` is absent, not a string or blank (D2; makes the History INVALID) |
| `deal_not_in_selection:<id>` | a deal is carried that the sealed pick does not name |
| `deal_missing:<id>` | the sealed pick names a deal that is not carried |
| `deal_bundle_not_the_selected_one:<id>` | the carried copy's JCS SHA-256 is not the entry's `bundle_digest` |
| `selection_audience_not_history` | the sealed audience is neither `history` nor `keep` (makes the History INVALID) |
| `deal_audience_not_selected:<id>` | the copy's audience is not the sealed audience |
| `deal_payload_disclosed:<id>` | in a History for `history`, the copy discloses a record payload (any non-empty disclosure entry, as capsule-cli's `payloadDisclosed`; makes the History INVALID) |
| `deal_invalid:<id>` | the copy cannot verify on its own: a record of it does not recompute to its id or a disclosure does not match (capsulectl verify reports this from the nested verdict) |
| `deal_signed_by_other_key:<id>`, `deal_signers_differ` | a deal's records name a key other than K; the carried deals' records name more than one key |
| `deal_record_unsigned:<id>` | a deal record carries no `key_id` or `signature` |
| `history_audience_keep`, `deal_audience_keep:<id>` | the keep marker (section 1), this page's own names |
| `history_log_unproven` | (module, from the context) the page's verifier found the history log's interval coverage or membership failing, or the selection record's coordinates are not on the History's own log |
| `history_bundle_unverified` | (module, from the context) the runtime's own gate does not hold for the History's bundle |
| `deal_record_id_mismatch:<id>`, `deal_disclosure_mismatch:<id>` | a nested record does not recompute to its capsule id [aac-id], or a disclosure does not match its digest |
| `history_checkpoint_missing`, `deal_checkpoint_missing:<id>` | no checkpoint (this page's own names) |

**The states**, in order; only the last shows a value:

0. **This History does not check**, first, when the page's verifier does not
   pass the History's own bundle (`history_bundle_unverified`), or when
   capsulectl's `selection_audience_not_history`, `deal_payload_disclosed`,
   `selection_recipient_missing` or `selection_entry_malformed` holds,
   whatever else does.
1. **Not a shareable History**: mixed signers, a signer that is not the
   selection record's key, a keep History or keep copy, a deal that is not in
   the selection, or a selection entry with no deal.
2. **This History does not check**: any other finding.
3. **This History does not recompute**: a stated `asserted_result` that does
   not match.
4. **The card.**

**The page check states** (FR-32), one per page, each drawn as its own
line with its own tone and its own `data-history-page-state`:

| Page check state | The module's outcome |
| --- | --- |
| checking | before the model is built: the host renders `checkingModel()`; no value, no finding |
| integrity checked | the card (state `card`) |
| failed | This History does not check (`invalid`), This History does not recompute (`mismatch`), Not a shareable History (`not_shareable`) |
| unable to verify | the check could not run (`not_checked`: `buildModel` caught an error, every property NOT_CHECKED); titled "This page could not check this file", never "does not check" |

A keep History is VALID to capsulectl but is still **failed** here: the page
check is whether this is a History to show, and a keep copy is not.

**The checks-ran list** (FR-31). L2 lists, from the property statuses
themselves, the properties this page checked (PASS or FAIL), those it did not
check (NOT_CHECKED) and those the file does not carry (NOT_PRESENT). The
signature rows are never under "Checked by this page"; they read
"checked by capsulectl on the sender's machine, not by this page". Without a
verifier context the history log is listed as not checked.

**Per-property statuses** distinguish FAIL, NOT_CHECKED and NOT_PRESENT
(PM design v0.3 §345); a property this page checks and finds holding is PASS.
The page lists all fourteen in L2:

| Property | What this page does |
| --- | --- |
| selection record (also FAIL when the context's `capsuleResults` for it is not ok), selection record is the root (the context's `root`), carried vs sealed selection, membership, nested digests, audience, signer keys (as `key_id` names them), nested record ids and disclosures, stated values | recomputes: PASS or FAIL, "checked by this page" (stated values NOT_PRESENT when there are none) |
| the history log: its `log_id` (recomputed: FAIL when it is not `deal-history/` and the sealed nonce), its checkpoint and the selection record's membership | read from the context: PASS or FAIL, "checked by this page"; NOT_CHECKED when the verifier passed the range and memberships against a checkpoint it could not authenticate (`checkpoint_unverified`), or with no context (the Python twin); NOT_PRESENT when absent |
| what the holder states (`holder_stated`: the recipient, each deal's later steps) | NOT_CHECKED, "what the holder states, sealed with the selection; not checked against the deals by this page or by capsulectl"; FAIL on `selection_recipient_missing` or a malformed `steps_after_checkpoint`; never PASS |
| every signature status: the selection record's signature, each deal's record signatures | NOT_CHECKED when present (the context carries no signature verdict, below), in one wording: "checked by capsulectl on the sender's machine, not by this page"; NOT_PRESENT when absent |
| each copy's deal log, checkpoint and membership | NOT_CHECKED, in the same words; NOT_PRESENT when absent |

No rendered text (L0, L1, L2, in jsdom and in Chromium) says a signature is
verified, valid or checked by this page; the tests pin that with the outer
root's signature forged, and with a member record's signature forged and the
selection re-sealed over it (both still render the card, since this page
checks no signature).

**What the module reads from the context [aac-context].** The runtime hands
`canRender` and `buildModel` a `VerifiedBundleContext`, built once by
`buildVerifiedBundleContext` from one `verifyBundle` run. The module reads:

- the selection record's identity: `verification.capsuleResults[<id>]`
  (`ok`, `capsuleId`; `verifyClass1` recomputes the capsule id);
- the root: `root`;
- the history log: `completeness.intervalCoverage` (the range proof up to the
  checkpoint and the checkpoint's authentication), `completeness.perRecordMembership`
  (each record's inclusion proof) and `completeness.memberships[<id>].log_coordinates`
  (the selection record's place in `deal-history/<nonce>`); the log id is read from
  the certificate and checkpoint the verifier checked them against;
- the runtime's gate, recomputed from `verification` as `bundleVerified` does.

**Not in the context: the selection record's signature.** `verifyClass1`
leaves `signature` and `key_id` out of the capsule id and checks neither;
nothing in `verifyBundle` checks a record's signature. So
`selection_record_signature` stays NOT_CHECKED, a broken signature leaves the
context unchanged (a test pins this), and `capsulectl verify --bundle` on the
sender's machine remains the check of it.

**When outer verification fails.** The runtime does not call the module:
`resolveModules` refuses an unverified context before any manifest is
matched or any `canRender` is called, and `renderEvidenceGraph` throws if a
module is ever selected for one. Called anyway (directly, or by another
host), the module shows **This History does not check** with
`history_bundle_unverified` first, and no card value.

Each nested deal copy is still only recomputed here (ids, disclosures,
digests); its signatures and log are NOT_CHECKED. An unsigned stand-in (every
signature removed) is NOT_PRESENT and refused: it never renders as a
History.

The tests hold each real file's reading to what `capsulectl verify` printed
for it (`tests/testdata/history/verify/`): capsulectl's findings are among the
page's (but for a signature that does not verify, which this page does not
check), key K (`holder_key`), audience, signer keys, `not_proven`, `holder_stated`,
`recipient` and each deal's `steps_after_checkpoint` are capsulectl's, and the page shows a card exactly when capsulectl says VALID and
the audience is `history`. In the module the context of a real file carries
capsulectl verify's verdicts on it (`js-tests/aacContext.js`, a stand-in for
`buildVerifiedBundleContext`, which js-tests cannot import; its shape is
checked against the interface source).

## 4. Manifest sketch: `capsuleviewer.history/v0`

`history-card.manifest.json`, schema-valid against the vendored
`aac.presentation-manifest/v0` schema:

- `requires`: `bundle_kind: evidence-bundle/v2`, `extensions.required:
  ["x-history-selection/v0"]`.
- `executable`: `{"carrier": "module-slot", "script_sha256": ...}`, the carrier
  capsulectl's `presentation build` takes for a plugin's module (capsule-cli
  #207). The pin is the SHA-256 of `history_card.js`'s bytes; the sketch
  carries zeros, as a script's own copy of its manifest does. No
  `style_sha256` and no `wording_sha256`: the pack's bytes are inside the
  pinned script (so `script_sha256` pins them too), none of its words is
  private, and the page's model records the pack's `wording_sha256`.
- `forbids`: the three report and result profiles the receipt manifests
  forbid (`spec_version:report/v1`, `spec_version:evaluation-summary/v1`,
  `result_version:evidence-result-v0`). Nothing else.

**Why it forbids those three and nothing more.** The registry's static
ambiguity test [registry] is run in the tests:

- Without any forbids, the sketch co-matches all five specific built-ins.
  With the three profile forbids, it co-matches none.
- The three receipt manifests and the Rules manifest each forbid
  `x-history-selection/v0`; with that one token each, none co-matches.
- capsulectl's own deal view (`capsulectl.deal-view/v0`) forbids
  `x-history-selection/v0` at [producer] (`deal-view.manifest.json`, pinned by
  capsule-cli's `TestDealViewForbidsAHistory`), so it never co-matches this
  module either.

`x-history-selection/v0` is a private `x-` kind, shared by capsule-cli and this
repository's modules. It is not proposed to the neutral spec.

## 5. The fixtures

Real files, cut by a capsulectl built from [producer] with
`examples/history/cut_fixtures.sh` (the build script) and
`examples/history/make_mutants.py`; `tests/testdata/history/README.md`
names the commit and lists each file. The deals are the ones capsule-cli's
`deal_history_test.go` makes: a closed retail deal, a purchase whose baseline
holds a home address, a card number, a code and the shop's contact details,
a seller's deal with a price floor and one step after its checkpoint
(`steps_after_checkpoint` 1), and two sales of one seller to two buyers, A
and B. Each History sent names its recipient (`--to "a new buyer"`; the
two-buyer one `--to "buyer B"`).

| File | `capsulectl verify` | The page |
| --- | --- | --- |
| `history-history` (the default audience) | VALID, `not_proven: [outcome, action_class]` | the card |
| `history-keep` (`--audience keep`) | VALID, audience keep | Not a shareable History |
| `history-two-buyers` (both sales, the History sent to buyer B) | VALID, `not_proven` | the card |
| `history-two-buyers-keep` | VALID, audience keep | Not a shareable History |
| `mutant-flipped-status` (the pay act's `effect.status` says failed) | INVALID: `deal_bundle_not_the_selected_one`, `deal_invalid` | This History does not check |
| `mutant-mixed-signer` (a second profile's deal spliced in) | INVALID | Not a shareable History |
| `mutant-not-in-selection` (an unselected deal of the same key spliced in) | INVALID | Not a shareable History |
| `mutant-selection-not-root` (the bundle's `root` edited) | INVALID: `selection_record_not_root` | This History does not check (the page's verifier fails it: graph closure) |
| `mutant-not-history-log` (the certificate's `log_id` set to a deal's log) | INVALID: `not_a_history_log` | This History does not check (the page's verifier fails it: checkpoint) |
| `mutant-payload-disclosed` (one payload of the closed deal disclosed, from its keep copy) | INVALID: `deal_payload_disclosed` | This History does not check |
| `mutant-counterparty-member` (the private deal's counterparty copy in place of its history copy) | INVALID: `deal_audience_not_selected`, `deal_payload_disclosed` | This History does not check |
| `mutant-audience-not-history` (the sealed audience set to counterparty, re-sealed) | INVALID: `selection_audience_not_history` (and `selection_record_unsigned`: its old signature) | This History does not check |
| `mutant-wrong-nonce` (the certificate's `log_id` set to another History's log, `deal-history/<its nonce>`) | INVALID: `not_a_history_log` | This History does not check (the page's verifier fails it: checkpoint) |
| `mutant-recipient-missing` (the sealed `recipient` removed, re-sealed) | INVALID: `selection_recipient_missing` (and `selection_record_unsigned`) | This History does not check |
| `mutant-steps-negative` (the floor deal's `steps_after_checkpoint` set to -1, re-sealed) | INVALID: `selection_entry_malformed`, `deal_not_in_selection` (and `selection_record_unsigned`) | This History does not check |
| `mutant-steps-not-integer` (the same, set to the text `"1"`, re-sealed) | INVALID: `selection_entry_malformed`, `deal_not_in_selection` (and `selection_record_unsigned`) | This History does not check |

capsulectl refuses `--audience counterparty` and `--audience adjudicator`
for a History, a History sent without `--to`, and `--to` with `--audience
keep`; `refused/*.txt` keeps what it printed. The tests
build those Histories by re-sealing in memory (`fixture.with_audience`), and
add further edits: a selected deal dropped, the keep copy of one deal
spliced in, another key under a picked deal's name, either selection edited,
a nested record or (keep) disclosure edited, every signature or checkpoint
removed, a forged root or member signature, an `asserted_result` that
recomputes or has one effect status flipped, a recipient removed, blank or
not a string, a `steps_after_checkpoint` negative, text, missing or 1.5, a log
id with another nonce or the fixed `deal-history` of earlier heads, and
fields the page does not know, re-sealed.

## Wording (Steven-gated)

Every consumer string this design adds for History Basic (FR-7a, FR-7b,
FR-31, FR-32, section 5.2), in one place for review. They live in the
module's wording pack, `src/capsule_viewer/history/wording-en.json`, under
the keys below: the script reads every word from that pack as data
(`python -m capsule_viewer.history pin` puts the pack's bytes in it), and the
Python twin reads its L0 words from the same pack (`recompute.py`). Moving
them there changed no string (2026-10-13, [viewer-wording-pack-data]).

| Pack key | Where | String |
| --- | --- | --- |
| `l0.title` | L0, line 1 (the card's heading) | History Card · Delivery outcomes not established |
| `l0.deals.other` / `l0.deals.one` | L0, line 2 | N selected deals / 1 selected deal |
| `l0.completed` | L0, line 2 | K with recorded completed steps |
| `l0.failed` | L0, line 2 | F with a recorded failed step |
| (line 2, assembled) | L0, line 2 | N selected deals · \<period\> · K with recorded completed steps · F with a recorded failed step |
| `page_state.checking` | page check state | Checking |
| `page_state_note.checking` | page check state | This page is checking the file. No value is shown until the check ends. |
| `page_state.integrity_checked` | page check state | Integrity checked |
| `page_state_note.integrity_checked` | page check state | This page checked the file's contents, as listed under How this page checked the file. Signatures are checked by capsulectl on the sender's machine, not by this page. |
| `page_state.failed` | page check state | Failed |
| `page_state_note.failed` | page check state | This page found that the file does not hold as a History to show. No value is shown. |
| `page_state.unable_to_verify` | page check state | Unable to verify |
| `page_state_note.unable_to_verify` | page check state | This page could not run its check on this file. That is not a finding about the file: check it with capsulectl verify --bundle. |
| `not_checked.title` | L0, unable to verify | This page could not check this file |
| `not_checked.lead` | L0, unable to verify | The check stopped before it finished, so no card is shown. |
| `checks.ran` | L2 list heading | Checked by this page |
| `checks.not_ran` | L2 list heading | Not checked by this page |
| `checks.absent` | L2 list heading | Not in this file |
| `checks.none` | L2, an empty list | None. |
| `l2.signing` (changed) | L2 | before: "... and for the History's own bundle reads the page's verifier on the selection record's identity, the history log's checkpoint and the selection record's membership in that log: those are checked by this page. The page's verifier ..." after: "... and, where the page has a verifier, reads it on the History's own bundle. The lists below name exactly what this page checked in this file and what it did not. The page's verifier ..." (the ending, "every signature status here is checked by capsulectl on the sender's machine, not by this page.", is unchanged) |
| `title` (removed) | L0 heading | before: "History"; after: `l0Title` |

**D2/D3/D4 additions, pending Steven** (capsule-cli cb68ea9, neutral u949):

| Pack key | Where | String |
| --- | --- | --- |
| `recipient` (`{recipient}` filled) | L0, the card only, after the limitation | For \<recipient\>, as stated by the holder |
| `l1.later_steps` | L1, beside a deal whose `steps_after_checkpoint` > 0 | later steps exist, per the holder |
| `property.holder_stated` | L2 | What the holder states with the selection: who the History is for, and each deal's later steps |
| `holder_stated_not_checked` | L2, `holder_stated` when NOT_CHECKED | what the holder states, sealed with the selection; not checked against the deals by this page or by capsulectl |
| `finding.selection_recipient_missing` | L0, a refusal's reasons | the sealed selection does not say who the History is for |
| `finding.selection_entry_malformed` (changed) | L0, a refusal's reasons | before: "a selection entry is malformed"; after: "a selection entry is malformed (its deal id, digest or count of later steps)" |
| `finding.not_a_history_log` (changed) | L0, a refusal's reasons | before: "the History's bundle is not of a deal-history log"; after: "the History's bundle is not of its own log (deal-history/ and the nonce its selection record seals)" |
| `property.history_log` (changed) | L2 | before: "The bundle is of a deal-history log (its checkpoint and the selection record's membership)"; after: "The bundle is of the History's own log, deal-history/ and the sealed nonce (its checkpoint and the selection record's membership)" |

**Ruled by Steven on 2026-10-12** (company-oss u346); none is open:

- K and F stay as counted: on capsule-cli's Histories they are 0 (it writes only `dispatched`), and the zeros stay until neutral [deal-outcome-seal] lands.
- Section 5.2's "· deals you picked, not all of them" tail stays dropped from L0 line 2 (the reader is the recipient; the Completeness note says the selection is not all of anything).
- A keep History's page check state is "failed", not a fifth wording.

## Not in this design

- No `wording_sha256` in the manifest: the pack is inside the pinned script.
- No change to capsule-cli or capsule-emit.
- Nothing proposed to the neutral spec.
