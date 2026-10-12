# History Card: design (v0)

Status: built, reworked on 2026-10-12 to the History file shape agreed with
the producer (capsule-cli PR #209). The module is
`src/capsule_viewer/static/history_card.js`, one self-contained module-slot
script with its words compiled in; its manifest is
`src/capsule_viewer/history/manifest.json` (this directory's sketch, plus the
script's pin). The Python side is the manifest, the check's Python twin
(`capsule_viewer.history.recompute`) and the fixture helpers.

A History Card shows someone else the deals a person chose to show: which
deals, over what period, and what outcome evidence their records carry. The
card publishes properties of the selection and never a score, rating, reputation, rank or trust number.

## Sources this design rests on

| Ref | Repository and commit | Path |
| --- | --- | --- |
| [producer] | capsule-cli `521d41f315a69d38a1f793dfb159c249abbcfcb3` (PR #209) | `internal/cli/deal_history.go` (`deal history`, `historyEntry`), `internal/cli/deal_sale_bundle.go` (`sealedOrInlineReport`) |
| [aac-id] | agent-action-capsule `ab4ee43b71d6e074c6a000b5b19a9caf9720235e` | `python/agent_action_capsule/canonical.py` (`compute_capsule_id`, `json_digest`) |
| [registry] | this repository | `src/capsule_viewer/registry.py` (`co_matchable`, the static ambiguity test) |

## 1. The History file

The holder picks deals. The card never picks for them and never widens the pick.

`capsulectl deal history --deal ID [--deal ID ...] --out FILE [--audience A]`
[producer] writes one file:

- The file is an `evidence-bundle/v2` of the holder's **own history log**,
  log id `deal-history`. No deal's log is written.
- One record on that log, the **selection record** (action_id
  `capsulectl-deal-history`), seals the pick and is signed by the holder's key
  K. Its disclosed `agent_input`, at
  `disclosures[<selection record>].agent_input`, is:

  ```json
  {"type": "history_selection", "profile": "x-history-selection/v0",
   "audience": "counterparty" | "adjudicator" | "keep", "nonce": "<hex>",
   "selection": [{"deal_id": "deal-<16 hex>", "bundle_digest": "<sha256 of the nested bundle's JCS>"}]}
  ```

  Every earlier selection on the log is withheld; the nonce keeps a
  withheld one from being confirmed by a guess.
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
`sealed_report`, else the inline `x-deal-v0` block. `counterparty` and
`adjudicator` are both shareable. `keep` anywhere (the History's or any
deal's) means the file is the holder's own copy and **not a shareable
History**.

**The Standard preset** is the counterparty copy, `deal history`'s default
audience: each deal as `deal report --share counterparty` withholds it (home
address, card and payment identifiers, codes, contact details, the price
floor). `tests/testdata/history/history-counterparty.bundle.json` is one; the
tests scan its bytes for those values and find none.

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

**`completeness: not_asserted` is always visible.** A holder who leaves a deal
out has made a different, honest pick; no check can tell. The card never
claims the selection is all of anything.

## 3. The check

`check(bundle)` (Python, `capsule_viewer.history.recompute`) and `check` (the
module) read the file alone. They return the findings, a status per property
and one state. The findings carry `capsulectl verify`'s names where it has
one [producer, `historyEntry`]:

| Finding | When |
| --- | --- |
| `selection_record_unverified` | the selection record is missing, is not `capsulectl-deal-history`, does not recompute to its capsule id, its disclosed pick does not hash to its `agent_input_digest`, or is not `history_selection` / `x-history-selection/v0` |
| `selection_record_unsigned` | the selection record carries no `key_id` or `signature` |
| `selection_not_sealed` | the carried `selection` is not the sealed one |
| `selection_missing`, `selection_entry_malformed:<id>` | the sealed pick is empty, or an entry is malformed or repeated |
| `deal_not_in_selection:<id>` | a deal is carried that the sealed pick does not name |
| `deal_missing:<id>` | the sealed pick names a deal that is not carried |
| `deal_bundle_not_the_selected_one:<id>` | the carried copy's JCS SHA-256 is not the entry's `bundle_digest` |
| `deal_audience_not_selected:<id>` | the copy's audience is not the sealed audience |
| `deal_signed_by_other_key:<id>`, `deal_signers_differ` | a deal's records name a key other than K; the carried deals' records name more than one key |
| `deal_record_unsigned:<id>` | a deal record carries no `key_id` or `signature` |
| `history_audience_keep`, `deal_audience_keep:<id>` | the keep marker (section 1), this page's own names |
| `deal_record_id_mismatch:<id>`, `deal_disclosure_mismatch:<id>` | a nested record does not recompute to its capsule id [aac-id], or a disclosure does not match its digest |
| `history_checkpoint_missing`, `deal_checkpoint_missing:<id>`, `history_not_of_its_log` | no checkpoint, or the History's is not of `deal-history` |

**The states**, in order; only the last shows a value:

1. **Not a shareable History**: mixed signers, a signer that is not the
   selection record's key, any keep member or keep audience, a deal that is
   not in the selection, or a selection entry with no deal.
2. **This History does not check**: any other finding.
3. **This History does not recompute**: a stated `asserted_result` that does
   not match.
4. **The card.**

**Per-property statuses** distinguish FAIL, NOT_CHECKED and NOT_PRESENT
(PM design v0.3 §345); a property this page checks and finds holding is PASS.
The page lists all twelve in L2:

| Property | What this page does |
| --- | --- |
| selection record, carried vs sealed selection, membership, nested digests, audience, signer keys (as `key_id` names them), nested record ids and disclosures, stated values | recomputes: PASS or FAIL (stated values NOT_PRESENT when there are none) |
| the selection record's signature; each deal's record signatures | NOT_CHECKED when present, NOT_PRESENT when absent |
| the history log's checkpoint and the selection record's membership; each copy's deal log, checkpoint and membership | NOT_CHECKED when present, NOT_PRESENT when absent |

This page never calls a signature, a checkpoint or log membership verified.
`capsulectl verify --bundle` checks them, for the History and for each deal
in it; the module runs after the page runtime's gate, never instead of it. An
unsigned stand-in (every signature removed) is NOT_PRESENT and refused: it
never renders as a History.

The tests hold each real file's reading to what `capsulectl verify` printed
for it (`tests/testdata/history/verify/`): capsulectl's findings are among the
page's, the holder key, audience and signer keys are capsulectl's, and the
page shows a card exactly when capsulectl says VALID and the audience is
shareable.

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
| `history-counterparty` (the Standard preset) | VALID | the card |
| `history-adjudicator` | VALID | the card |
| `history-keep` (`--audience keep`) | VALID, audience keep | Not a shareable History |
| `mutant-flipped-outcome` (the closed deal's report says it failed) | INVALID | This History does not check |
| `mutant-mixed-signer` (a second profile's deal spliced in) | INVALID | Not a shareable History |
| `mutant-not-in-selection` (the holder's unpicked deal spliced in) | INVALID | Not a shareable History |

The tests add further edits of the counterparty History in memory: a selected
deal dropped, the keep copy of one deal spliced in, another key under a
picked deal's name, either selection edited, a nested record or disclosure
edited, every signature or checkpoint removed, and an `asserted_result` that
recomputes or has one outcome flipped.

## Not in this design

- No wording pack: the module's words are compiled in.
- No change to capsule-cli or capsule-emit.
- Nothing proposed to the neutral spec.
