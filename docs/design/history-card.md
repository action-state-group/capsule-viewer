# History Card: design (v0)

Status: built, reworked on 2026-10-12 to the History file shape agreed with
the producer (capsule-cli PR #209), re-cut on #209's head 7ebf001, and since
reading agent-action-capsule's VerifiedBundleContext and the "history" audience
(PM u334, design v0.5, neutral u888). The module is
`src/capsule_viewer/static/history_card.js`, one self-contained module-slot
script with its words compiled in; its manifest is
`src/capsule_viewer/history/manifest.json` (this directory's sketch, plus the
script's pin). The Python side is the manifest, the check's Python twin
(`capsule_viewer.history.recompute`) and the fixture helpers.

A History Card shows a reader the deal copies that the holder of one key, K,
presents: which deals, over what period, and what outcome evidence their
records carry. The card publishes properties of the presented selection and
never a score, rating, reputation, rank or trust number.

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
| [producer] | capsule-cli `7ebf00173c95e9287069a159a864e0793744da2e` (PR #209) | `internal/cli/deal_history.go` (`deal history`, `historyEntry`), `internal/cli/deal_sale_bundle.go` (`sealedOrInlineReport`) |
| [aac-id] | agent-action-capsule `ab4ee43b71d6e074c6a000b5b19a9caf9720235e` | `python/agent_action_capsule/canonical.py` (`compute_capsule_id`, `json_digest`) |
| [registry] | this repository | `src/capsule_viewer/registry.py` (`co_matchable`, the static ambiguity test) |
| [aac-context] | agent-action-capsule `3a7aca6` | `ts/src/bundle.ts` (`VerifiedBundleContext`, `buildVerifiedBundleContext`, `verifyBundle`), `ts/src/verify.ts` (`VerificationResult`, `verifyClass1`), `ts/src/presentation-registry.ts` (`bundleVerified`, `resolveModules`), `ts/src/evidence-graph-view.ts` (`renderEvidenceGraph`) |

## 1. The History file

The holder of key K selects deal copies. The card never selects and never widens the selection.

`capsulectl deal history --deal ID [--deal ID ...] --out FILE [--audience A]`
[producer] writes one file:

- The file is an `evidence-bundle/v2` of a **history log**, log id
  `deal-history` (the completeness certificate's and checkpoint's `log_id`).
  No deal's log is written.
- One record on that log, the **selection record** (action_id
  `capsulectl-deal-history`), is the bundle's `root`, seals the selection and
  is signed by key K. Its disclosed `agent_input`, at
  `disclosures[<selection record>].agent_input`, is:

  ```json
  {"type": "history_selection", "profile": "x-history-selection/v0",
   "audience": "history" | "counterparty" | "adjudicator" | "keep", "nonce": "<hex>",
   "selection": [{"deal_id": "deal-<16 hex>", "bundle_digest": "<sha256 of the nested bundle's JCS>"}]}
  ```

  Every earlier selection on the log is withheld; the nonce keeps a
  withheld one from being confirmed by a guess.

  **Fields added later.** Two open decisions may add a field: `recipient` in
  this `agent_input`, and `steps_after_checkpoint` in each selection entry.
  The check tolerates any field it does not know in either place and never
  shows it. The carried `selection` is still compared with the sealed one
  entry for entry, every field included, so an entry that differs only in a
  field the page does not know is still `selection_not_sealed`.
- `extensions["x-history-selection/v0"]` carries the deals:

  ```json
  {"selection_record": "<capsule id of the selection record>",
   "selection": [{"deal_id": "...", "bundle_digest": "..."}],
   "deals": {"<deal id>": <that deal's copy for the selected audience, an evidence-bundle/v2>}}
  ```

  The carried `selection` must equal the sealed one exactly. Each nested copy
  is its deal's own bundle, of its own deal log, verified on its own.

**The audience and the keep marker.** The History's audience is the sealed
selection record's `audience`. Each nested deal's audience is its report's
`audience`, read as capsule-cli's `sealedOrInlineReport` reads it: the sealed
`deal_report` record's `report` when `x-deal-v0` names one by
`sealed_report`, else the inline `x-deal-v0` block. **`history` is the only
shareable audience** (neutral u888: the producer will make `--audience
history` the default for `deal history` and refuse `counterparty`). Every
other audience, the History's or any deal's, makes the file **not a
shareable History**, each under its own finding:

- `keep`: the keep copy, never one to send (`history_audience_keep`,
  `deal_audience_keep:<id>`);
- `counterparty`: the original participant's copy, not one to show anyone
  else (`history_audience_counterparty`, `deal_audience_counterparty:<id>`);
- `adjudicator`: a copy made for an adjudicator in a dispute about that deal,
  not for showing to a third party (`history_audience_adjudicator`,
  `deal_audience_adjudicator:<id>`). **Open**: em-dev recommends the producer
  refuse it and confirms with their measurement; until then the page fails
  closed.

**The Standard preset** will be the `history` copy. 7ebf001 writes no
`history` audience yet, so the real fixtures stay cut from it (its default,
`counterparty`, withholds the home address, card and payment identifiers,
codes, contact details and the price floor; the tests scan
`history-counterparty.bundle.json` and `history-adjudicator.bundle.json` for
those values and find none) and the tests reach the `history` audience by an
in-memory re-seal (`capsule_viewer.history.fixture.with_audience`). They are
re-cut when em-dev's u888 producer lands.

Every read of a deal record goes through one function, `selected_records`
(Python) and `selectedRecords` (the module): the records of each deal the
carried `selection` names, in selection order, each with its own copy's
disclosed `agent_input` (or none, when the copy withholds it). A deal carried
but not selected is a finding, never read for values.

## 2. What the card states

| Value | How this page derives it |
| --- | --- |
| `period` | `{from, to, temporal_provenance: "producer_asserted"}`: the earliest and latest `timestamp` of the selected deals' records |
| `selected_count` | the number of selected deals |
| `outcome_evidence` | `{bucket: count}` over the selected deals' records, each in exactly one bucket (below) |
| `completeness` | always `"not_asserted"` |

The buckets read only sealed fields, first rule that applies:

1. the record's disclosed `body.outcome` -> `outcome:<value>`
2. else `body.action_class` is `money.refund` -> `action_class:money.refund`
3. else the record header's `effect.status` -> `effect.status:<value>`
4. else, when the copy withholds the record's `agent_input` -> `withheld`
5. else -> `none`

A bucket name is the sealed field and value it came from, not an
interpretation. `effect.status:dispatched` means the producer's runtime claimed
a dispatch, not that it arrived. A counterparty copy withholds most record
bodies, so most of its records count as `withheld`; the header's
`effect.status` stays visible. The buckets always sum to the number of
records in the selected deals.

**`asserted_result` is optional.** The producer writes none. When the
extension carries one (exactly the four members above), the page recomputes
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
| `not_a_history_log` | the History's completeness certificate or checkpoint names a `log_id` other than `deal-history` |
| `selection_not_sealed` | the carried `selection` is not the sealed one |
| `selection_missing`, `selection_entry_malformed:<id>` | the sealed pick is empty, or an entry is malformed or repeated |
| `deal_not_in_selection:<id>` | a deal is carried that the sealed pick does not name |
| `deal_missing:<id>` | the sealed pick names a deal that is not carried |
| `deal_bundle_not_the_selected_one:<id>` | the carried copy's JCS SHA-256 is not the entry's `bundle_digest` |
| `deal_audience_not_selected:<id>` | the copy's audience is not the sealed audience |
| `deal_signed_by_other_key:<id>`, `deal_signers_differ` | a deal's records name a key other than K; the carried deals' records name more than one key |
| `deal_record_unsigned:<id>` | a deal record carries no `key_id` or `signature` |
| `history_audience_keep`, `deal_audience_keep:<id>` | the keep marker (section 1), this page's own names |
| `history_audience_counterparty`, `deal_audience_counterparty:<id>`, `history_audience_adjudicator`, `deal_audience_adjudicator:<id>` | a copy for the other party or for an adjudicator (section 1), this page's own names |
| `history_audience_unknown` | the sealed audience is none of the four |
| `history_log_unproven` | (module, from the context) the page's verifier found the history log's interval coverage or membership failing, or the selection record has no `deal-history` coordinates |
| `history_bundle_unverified` | (module, from the context) the runtime's own gate does not hold for the History's bundle |
| `deal_record_id_mismatch:<id>`, `deal_disclosure_mismatch:<id>` | a nested record does not recompute to its capsule id [aac-id], or a disclosure does not match its digest |
| `history_checkpoint_missing`, `deal_checkpoint_missing:<id>` | no checkpoint (this page's own names) |

**The states**, in order; only the last shows a value:

0. **This History does not check**, first, when the page's verifier does not
   pass the History's own bundle (`history_bundle_unverified`).
1. **Not a shareable History**: mixed signers, a signer that is not the
   selection record's key, any member or sealed audience other than
   `history`, a deal that is not in the selection, or a selection entry with
   no deal.
2. **This History does not check**: any other finding.
3. **This History does not recompute**: a stated `asserted_result` that does
   not match.
4. **The card.**

**Per-property statuses** distinguish FAIL, NOT_CHECKED and NOT_PRESENT
(PM design v0.3 §345); a property this page checks and finds holding is PASS.
The page lists all thirteen in L2:

| Property | What this page does |
| --- | --- |
| selection record (also FAIL when the context's `capsuleResults` for it is not ok), selection record is the root (the context's `root`), carried vs sealed selection, membership, nested digests, audience, signer keys (as `key_id` names them), nested record ids and disclosures, stated values | recomputes: PASS or FAIL (stated values NOT_PRESENT when there are none) |
| the history log: its `log_id` (recomputed: FAIL when it is not `deal-history`), its checkpoint and the selection record's membership | read from the context: PASS (checked by this page) or FAIL; NOT_CHECKED when the verifier passed the range and memberships against a checkpoint it could not authenticate (`checkpoint_unverified`), or with no context (the Python twin); NOT_PRESENT when absent |
| the selection record's signature | NOT_CHECKED when present (the context carries no signature verdict, below), NOT_PRESENT when absent |
| each deal's record signatures; each copy's deal log, checkpoint and membership | NOT_CHECKED, in the words "verified by capsulectl on the sender's machine, not by this page"; NOT_PRESENT when absent |

**What the module reads from the context [aac-context].** The runtime hands
`canRender` and `buildModel` a `VerifiedBundleContext`, built once by
`buildVerifiedBundleContext` from one `verifyBundle` run. The module reads:

- the selection record's identity: `verification.capsuleResults[<id>]`
  (`ok`, `capsuleId`; `verifyClass1` recomputes the capsule id);
- the root: `root`;
- the history log: `completeness.intervalCoverage` (the range proof up to the
  checkpoint and the checkpoint's authentication), `completeness.perRecordMembership`
  (each record's inclusion proof) and `completeness.memberships[<id>].log_coordinates`
  (the selection record's place in `deal-history`); the log id is read from
  the certificate and checkpoint the verifier checked them against;
- the runtime's gate, recomputed from `verification` as `bundleVerified` does.

**Not in the context: the selection record's signature.** `verifyClass1`
leaves `signature` and `key_id` out of the capsule id and checks neither;
nothing in `verifyBundle` checks a record's signature. So
`selection_record_signature` stays NOT_CHECKED, a broken signature leaves the
context unchanged (a test pins this), and `capsulectl verify --bundle`
remains the check of it.

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
page's, key K (`holder_key`), audience and signer keys are capsulectl's, and the
page shows a card exactly when capsulectl says VALID and the audience is
`history` (no 7ebf001 file). In the module the context of a real file carries
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
  `style_sha256` and no `wording_sha256`: the words are compiled into the
  script, and none is private.
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
and a seller's deal with a price floor.

| File | `capsulectl verify` | The page |
| --- | --- | --- |
| `history-counterparty` (7ebf001's default audience) | VALID | Not a shareable History (counterparty) |
| `history-adjudicator` | VALID | Not a shareable History (adjudicator; open) |
| `history-keep` (`--audience keep`) | VALID, audience keep | Not a shareable History |
| `mutant-flipped-outcome` (the closed deal's report says it failed) | INVALID | Not a shareable History (counterparty), with `deal_bundle_not_the_selected_one` |
| `mutant-mixed-signer` (a second profile's deal spliced in) | INVALID | Not a shareable History |
| `mutant-not-in-selection` (an unselected deal of the same key spliced in) | INVALID | Not a shareable History |
| `mutant-selection-not-root` (the bundle's `root` edited) | INVALID: `selection_record_not_root` | This History does not check (the page's verifier fails it: graph closure) |
| `mutant-not-history-log` (the certificate's `log_id` set to a deal's log) | INVALID: `not_a_history_log` | This History does not check (the page's verifier fails it: checkpoint) |

The card is shown for the `history` audience, reached by re-sealing the
counterparty History in memory (`fixture.with_audience`). The tests add
further edits of that History in memory: a selected
deal dropped, the keep copy of one deal spliced in, another key under a
picked deal's name, either selection edited, a nested record or disclosure
edited, every signature or checkpoint removed, and an `asserted_result` that
recomputes or has one outcome flipped, and a History carrying the two
possible future fields (`recipient`, `steps_after_checkpoint`), re-sealed.

## Not in this design

- No wording pack: the module's words are compiled in.
- No change to capsule-cli or capsule-emit.
- Nothing proposed to the neutral spec.
