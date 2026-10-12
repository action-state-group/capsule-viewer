# History Card: design (v0)

Status: built, as amended on 2026-10-12 (rulings PM u331). The module is
`src/capsule_viewer/static/history_card.js`, one self-contained module-slot
script with its words compiled in; its manifest is
`src/capsule_viewer/history/manifest.json` (this directory's sketch, plus the
script's pin). The Python side is the manifest, the recompute check's Python
twin (`capsule_viewer.history.recompute`) and the fixtures.

**Amendment (2026-10-12): records come from nested per-deal bundles.** The
first version of this design read the selected records from one flat bundle.
That shape cannot verify on real binaries: each real deal lives in its own log
with its own checkpoint, and rc15's `verify --bundle` reports the flat fixture
INVALID (`membership_record_unbound`). A History Card's input is now a
container that nests one member bundle per picked deal, the way
`x-deal-sale/v0` nests a sale's threads (section 1). The container is written
by a verb that does not exist yet, neutral `[deal-history-container-verb]`
(section 6). Until it does, the tests run on a hand-built nested stand-in
(section 5), which is rebuilt from real nested bundles once the verb exists.

A History Card shows a person's own selected deal records to someone else: what
they chose to show, over what period, and what outcome evidence those records
carry. It follows the mesh node history card: an account over the neutral
account core that states properties a reader can recompute offline.
The card publishes properties of the selection and never a score, rating, reputation, rank or trust number.

## Sources this design rests on

All paths are at the commits named here. Nothing in this design changes them.

| Ref | Repository and commit | Path |
| --- | --- | --- |
| [core-def] | capsule-emit `4527e56a27c4bdf8b7b29ccb15834181a0131cb6` | `python/capsule_emit/account/definition.py` |
| [core-acct] | capsule-emit `4527e56a27c4bdf8b7b29ccb15834181a0131cb6` | `python/capsule_emit/account/account.py` |
| [core-replay] | capsule-emit `4527e56a27c4bdf8b7b29ccb15834181a0131cb6` | `python/capsule_emit/account/replay.py` |
| [mesh-card] | capsule-emit-mesh `37f41e531812750113021223bff8e87220292e19` | `history_card.py` |
| [aac-id] | agent-action-capsule `ab4ee43b71d6e074c6a000b5b19a9caf9720235e` | `python/agent_action_capsule/canonical.py` (`compute_capsule_id`, `json_digest`) |
| [registry] | this repository | `src/capsule_viewer/registry.py` (`co_matchable`, the static ambiguity test) |

## 1. Selection: holder-directed, an `explicit_set` account

The holder picks records. The card never picks for them and never widens the pick.

**Where the records are.** The input is a container (`evidence-bundle/v2`)
whose `x-history-selection/v0` block carries, beside `definition`, `account`
and `holder_asserted`, a `deals` object: `{"<deal id>": <that deal's own
evidence-bundle/v2>}`, one member per picked deal, as `x-deal-sale/v0` carries
`{"threads": {"<thread deal id>": <the thread's own bundle>}}`. Each member is
verified as its own Evidence Bundle (its own log, checkpoint and membership),
never as part of the container. The container carries no deal records of its
own. Every read of a deal record goes through one function,
`selected_records(bundle)` (Python) and `selectedRecords(bundle)` (the
module): the records of every member, in deal id order, each with its own
member's disclosed `agent_input`. Selection, recompute and drawing take only
its output; a record outside the members (a top-level record, as in the flat
fixture) is never read.

The selection is a `capsule_emit.account` **`Selection(kind="explicit_set",
coverage=Coverage(references=(...)))`** [core-acct], under an
**`AccountDefinition`** document [core-def]:

```json
{
  "name": "capsuleviewer.history.outcome_evidence/0",
  "selection_kind": "explicit_set",
  "reads": ["timestamp", "effect.status", "agent_input.body.outcome", "agent_input.body.action_class"],
  "derivation_class": "deterministic"
}
```

Its `definition_digest` is SHA-256 over the JCS bytes of that document [core-def]:
`a6cf2944408ac0b8b0fe0adaf54d40631e9772376838bb413220e0c77f2da2b1`. The fixture
was built through `parse_definition`, `build_account` and `verify_account`
[core-def, core-acct, core-replay]. The test recomputes the same digest with this
repository's own JCS (`capsule_viewer.digest.jcs`). Two implementations, one file.

Why `explicit_set` and not the other two kinds the core defines [core-def]:

- `range` names a contiguous span under one coverage root. A holder's pick is
  not contiguous: it skips records and crosses deals.
- `chain_segment` is what the mesh card uses [mesh-card, `core_account()`]: one
  node's checkpoint chain, A to B, linked in-record. A History Card's records
  come from many deals, each with its own chain. A single deal's whole chain
  could be a `chain_segment`, but that is a different card and is not
  designed here.
- `explicit_set` cites each member through `references[]`, which is exactly
  a holder pick. The core notes that it does not build the reference
  resolution path for `explicit_set` [core-acct, `Coverage` docstring]. The card
  does not need the core to: every reference must resolve inside the nested
  member bundles (section 3). Nothing is filed against capsule-emit.

The definition carries no `predicate`. A predicate would make the card a
filter over a history the reader cannot see. The pick is the `references` list.

## 2. What the card states

The account's `asserted_result` [core-acct, `Account.to_document`] holds exactly
four members, and nothing else:

| Member | Value | How it is derived |
| --- | --- | --- |
| `period` | `{from, to, temporal_provenance: "producer_asserted"}` | earliest and latest `timestamp` of the selected records |
| `selected_count` | integer | number of selected records |
| `outcome_evidence` | `{bucket: count}` | each record in exactly one bucket, first rule that applies (below) |
| `completeness` | always `"not_asserted"` | constant |

The outcome-evidence buckets read only sealed fields the definition declares in
`reads`:

1. the record discloses `body.outcome` (an outcome record) -> `outcome:<value>`
2. else `body.action_class` is `money.refund` -> `action_class:money.refund`
3. else the record header has `effect.status` -> `effect.status:<value>`
4. else -> `none` (a noted act with no outcome evidence, such as a booking note)

A bucket name is the sealed field and value it came from, not an
interpretation. `effect.status:dispatched` means the producer's runtime claimed
a dispatch (`effect_attestation: runtime_claimed`), not that it arrived. The
buckets always sum to `selected_count`, and the test pins that.

`temporal_provenance: "producer_asserted"` follows the mesh card's own label for
times only the producer wrote [mesh-card, `HistoryProperties.temporal_provenance`].
The period is recomputable from the records, but the times in them are the
holder's own producer's times.

**`completeness: not_asserted` is always visible.** The card does not claim that
the selection is all of anything. Section 3 shows why it cannot: a holder who
drops a record and restates every count has made a different, honest selection.
No check can tell the two apart. Some producer inputs carry their own completeness
claim (a live check's history scope with `complete: true`). That claim is
about a different question and is never carried onto the card.

## 3. Recompute rule

Every derived value either recomputes from the records disclosed in the bundle
or sits under `holder_asserted`, labelled. Nothing else is shown.

The check (`capsule_viewer.history.recompute.recompute_errors` in Python, and
`recomputeErrors` / `check` in the module) reads the container alone, its deal
records only through `selected_records`:

1. The account's `definition_digest` equals SHA-256 of the JCS of the
   `definition` it carries. A swapped definition fails [core-replay,
   `DEFINITION_DIGEST_MISMATCH`].
2. Both the class and the kind are what this design fixes: `deterministic`,
   verified by recompute and match [core-replay, `_verify_deterministic`], and
   `explicit_set`.
3. `completeness` is `not_asserted`. `asserted_result` has no member beyond the
   four in section 2.
4. Every entry under `holder_asserted` is `{value, label: "holder_asserted"}`.
5. Each reference is unique and resolves to exactly one record of the member
   bundles; no record is carried twice (in two members, or twice in one).
   That record recomputes to its `capsule_id` (JCS without `capsule_id`,
   `signature`, `key_id` [aac-id]), and its member's disclosure hashes to its
   `agent_input_digest`. The members hold no record outside the selection
   (open for the container verb: if a deal bundle cannot be cut to the picked
   records and still verify, this rule becomes "a record outside the selection
   is not counted and carries no disclosure", and both twins change).
6. `period`, `selected_count` and `outcome_evidence` are recomputed from the
   resolved records and must equal the asserted values.

The mesh card keeps values from outside its chain beside its core account,
never inside it [mesh-card, `verify_history_card` and its enrichment note]. This card does the same. In the
fixture, `holder_asserted.records_held_in_period` (23) is such a value. Nothing
in the bundle can recompute it, so it is shown only under its label.

The nested stand-in passes. The mutants, each in `tests/test_history_card_design.py` (and run against the module in `js-tests/history_card.test.js`, which agrees with the Python check on every one):

| Mutant | Result |
| --- | --- |
| a record (and its disclosure) dropped, reference kept, each of the 8 | fails: `selected but not disclosed` |
| a record dropped with its reference, counts left as asserted, each of the 8 | fails: `selected_count: recomputed 7 != asserted 8`, `outcome_evidence` mismatch |
| a record dropped with its reference and every count restated | **passes**: an honest smaller selection, which is why `completeness` is `not_asserted` |
| a bucket count edited | fails |
| `completeness` set to `complete` | fails |
| an extra count inside `asserted_result`; a `holder_asserted` entry relabelled | fails |
| a disclosed `agent_input` edited | fails: digest binding |
| the definition's `reads` extended | fails: `definition_digest` |
| a record in the bundle but not in the selection | fails |
| a record carried in two deal bundles | fails: `carried twice` |
| the flat shape (records at the top level) | fails: none is read, `selected but not disclosed` |
| one outcome flipped in what the card states | fails: `outcome_evidence` mismatch; the module draws the mismatch, never the card |

The check itself was mutated too. With the reference-resolution step and the
count comparison removed, the dropped-record tests fail (they expect the error).
Restored, they pass.

The stand-in's records carry no signatures. This check covers selection and
recompute, not signing. The module runs it after the page runtime's gate, never
instead of it; each member bundle's signatures, log and membership are its own
verifier's (as each sale thread is verified as its own bundle), and the card
says so in L2.

## 4. Manifest sketch: `capsuleviewer.history/v0`

`history-card.manifest.json`, schema-valid against the vendored
`aac.presentation-manifest/v0` schema:

- `requires`: `bundle_kind: evidence-bundle/v2`, `extensions.required:
  ["x-history-selection/v0"]`.
- `executable`: `{"carrier": "module-slot", "script_sha256": ...}`, the carrier
  capsulectl's `presentation build` takes for a plugin's module (capsule-cli
  #207; any other carrier is `unsupported_carrier`). The pin is the SHA-256 of
  `history_card.js`'s bytes; the sketch carries zeros, as a script's own copy
  of its manifest does. No `style_sha256` and no `wording_sha256`: the words
  are compiled into the script, and none is private.
- `forbids`: the three report and result profiles the receipt manifests already
  forbid (`spec_version:report/v1`, `spec_version:evaluation-summary/v1`,
  `result_version:evidence-result-v0`). Nothing else.

**Why it requires the selection extension and not "composed/v1 or x-deal-v0".**
`requires.extensions.required` is all-of; the manifest has no any-of. A
selection's records are x-deal-v0 records whether the holder cut them from a
unilateral copy or a composed one. So the card needs only the selection block
(`x-history-selection/v0`: `definition`, `account`, `holder_asserted`). The
other route is two manifests, one requiring x-deal-v0 and one requiring
composed/v1, made disjoint by forbids as the receipts are. That doubles the
module for no difference in what it shows.

**Why it forbids those three and nothing more.** The registry's static ambiguity
test [registry] is run in the tests:

- Without any forbids, the sketch co-matches all five specific built-ins. With
  the three profile forbids, it co-matches none.
- Without a forbid, the sketch co-matches all three receipt manifests and the
  Rules manifest: a container may also engage x-deal-v0, composed/v1 or a rules
  profile. Ambiguity is resolved by forbids, never priority. **The build adds
  `x-history-selection/v0` to `forbids.extensions` of each of those four**, and
  the tests show that with that one token each, none co-matches.
- capsulectl's own deal view (`capsulectl.deal-view/v0`, capsule-cli) requires
  x-deal-v0 and forbids no extension, so as shipped it co-matches this module,
  and a registry holding both refuses the second. The fix is the same one
  token in that manifest, in capsule-cli; `tests/test_history_module.py` pins
  the current state against a vendored copy.

`x-history-selection/v0` is a private `x-` kind, local to this repository's
modules. It is not proposed to the neutral spec.

## 5. The fixtures

`tests/testdata/history/selection.bundle.json` (the first fixture, built by
`examples/history/build_fixture.py` through the account core): 8 selected
records across 7 synthetic deals (`deal-example-01` to `-07`), 2026-09-14 to
2026-10-09: 4 decided purchases (`effect.status:dispatched`), 2 booking notes
(`none`), 1 refund that cites the purchase it reverses
(`action_class:money.refund`), 1 outcome record (`outcome:mismatch`, an
unchecked action). It is flat, and **it cannot verify on real binaries**: each
real deal has its own log and checkpoint, and rc15 reports it INVALID
(`membership_record_unbound`). The module does not read its top-level records.

`tests/testdata/history/nested-selection.bundle.json` is the **stand-in** the
tests run on, pending the container verb: the same eight records regrouped
into seven member bundles under `deals`, nothing re-signed or re-sealed, built
by `examples/history/build_nested_fixture.py`. It has no checkpoints,
certificates or signatures and does not verify; its README says so.
`nested-mutant-flipped-outcome.bundle.json` is the same container with one
outcome flipped in what the card states. Once the verb exists, both are
rebuilt from real nested bundles it writes, and that container is held to
`capsulectl verify`.

The record shapes follow the x-deal-v0 history entries capsulectl writes
(v0.1.0-rc14 and capsule-cli main). Both the `x-deal-v0` form and the typed
`action-record/v0` form are present, for a purchase and for a booking. Every
value is synthetic: deal ids, amounts, counterparty fingerprints, key id,
producer commit and times. Record ids and disclosure digests are real digests
of those synthetic values.

Rebuild (the first needs source checkouts of capsule-emit and agent-action-capsule):

    PYTHONPATH=CAPSULE_EMIT/python:AGENT_ACTION_CAPSULE/python python3 examples/history/build_fixture.py
    PYTHONPATH=src python3 examples/history/build_nested_fixture.py

Both rebuilds are deterministic: the same bytes every time.

## 6. The container verb: a dependency, not designed here

Assembling a History container is a producer-side verb: list my deals, let me
pick records, and write a container that nests each picked deal's own bundle
under `x-history-selection/v0`'s `deals`, with the account over the picked
references. It is neutral `[deal-history-container-verb]`, it lives outside
this repository, and it does not exist yet. This design depends on it and does
not design it. Until it exists, the only containers are the stand-ins.

## Not in this design

- No wording pack: the module's words are compiled in.
- No change to capsule-emit; the core already has everything section 1 uses.
- No change to capsule-cli (the container verb, and the deal view's forbid, are its own items).
- Nothing proposed to the neutral spec.
