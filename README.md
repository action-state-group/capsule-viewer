# capsule-viewer

The offline, fragment-carried capsule/Result viewer. A single self-contained
HTML artifact -- no server, no external `<script src>`, no network at render
time -- that opens directly in a browser and lets a reader independently
check what it shows.

The **base** owns exactly what is the same for every record kind: URL
fragment carry (a browser never sends the part after `#` over the wire), the
page shell, and the one "show the security checks" toggle. A **domain
module** registers itself on `CapsuleViewer.register(kind, renderCard)` and
supplies only the per-record card body. Two modules ship today:

- `conversation_exchange` -- the tau2 / mesh-inference exchange view, for
  sealed AAC capsules.
- `result/v0` -- an [Evidence Result v0](https://github.com/action-state-group/agent-action-capsule/blob/main/spec/evidence-result-v0.md)
  document: aggregate coverage statement, the three verdict buckets
  (`met` / `not_met` / `not_evaluable`), and every claim with its `tier`
  (`recomputed` / `judged`), `grade` (`self-attested` / `witnessed` /
  `countersigned`), and `<contract_id>@<version>` contract reference.

## What "conforming" means for `result/v0`

This viewer renders any document conforming to `agent-action-capsule`'s
`schemas/evidence-result-v0.json` -- it does not validate against that
schema itself (the schema's own validator is
`agent-action-capsule/schemas/check_evidence_result_examples.py`); it is
deliberately defensive at render time instead, because a Result reaching a
sponsor may be hand-edited or tampered after it was validated. Concretely:

- **A claim missing a required field (most notably `tier`) is refused** --
  rendered as a visible refusal row naming every reason, never blank and
  never defaulted.
- **The stated `aggregate.coverage` / `aggregate.buckets` are independently
  recomputed** from the document's own `claims[]` array and compared. A
  Result has no top-level digest to recompute (unlike a sealed capsule) --
  this recompute-and-compare is the equivalent integrity signal for this
  kind: every count and every bucket entry is supposed to trace back to a
  real claim (spec section 1), so a hand-edited count or a claim moved to
  the wrong bucket disagrees with the recount, visibly, exactly like a
  tampered capsule's `capsule_id` chip goes red.
- **`aggregate.coverage.excluded_not_applicable` is shown as stated, not
  recomputed** -- by construction, a `NOT_APPLICABLE` requirement is never
  represented as a claim at all, so this one number cannot be checked
  against this document's own data. The card says so rather than faking a
  check.

See `js-tests/result_v0_card.test.js` for the refusal-path and tamper-vector
proofs (each a red-state assertion against a specific one-field mutant of
the fixture, several with the green-state fix reverted alongside).

### Claim types: `reconcile` and `close` (PROPOSED, ruling 2026-09-25)

A claim may carry `type` (`requirement` -- the default when absent --
`reconcile`, or `close`). The card renders the typed body beneath the
claim's ordinary tier / grade / sufficiency / verdict lines, under three
rules that are pinned by negative fixtures and tests, never by styling:

- **A reconcile row shows the six states as counts** (`MATCHED · A_ONLY ·
  B_ONLY · CONFLICTING · INSUFFICIENT · UNRESOLVED`, read from the claim's
  `tallies`, keyed lowercase as `schemas/judge/close-v1.json` keys them),
  one row each, always all six, never a ratio or a percentage. `A_ONLY` / `B_ONLY` render as
  *one side missing* (`rv0-rs-one-sided`); `CONFLICTING` renders as *both
  sides disagree* (`rv0-rs-finding`). The two share no class and no
  wording -- "one side missing isn't a finding; both sides disagreeing
  is." A `tallies` object missing any state is refused, never read as zero.
- **A close row renders the three Close states differently** --
  `UNILATERAL` (`rv0-close-unilateral`), `AGREED` (`rv0-close-agreed`),
  `CONTESTED` (`rv0-close-contested`, "contested -- peer rebuts"). The
  states are the Evidence Layer's, read from the links other records make
  to the Close (`acknowledges` -> AGREED, `rebuts` -> CONTESTED, neither ->
  UNILATERAL); the claim carries what the Result builder read, and the card
  shows it as given. A `UNILATERAL` close carries nothing that could read
  as agreement: no agreed mark, never `AGREED`'s wording. It may name the
  peer it was closed against and cite the peer's Close it reconciled with
  (both optional in the schema, after `close-v1.json`'s unconditional
  `peer_close`); when it does, the line says the peer has not responded. A
  `CONTESTED` close never carries the agreed mark and never `UNILATERAL`'s
  wording. An `AGREED` or `CONTESTED` close with no peer or no cited peer
  record is refused.
- **A claim whose `type` the card does not know is shown, never dropped**:
  its own `rv0-claim-unrecognized` row, labelled `unrecognized`, carrying
  the raw type and the claim's `contract_ref`. The rendered row count
  always equals the input claim count.

## Presentation component kit

`capsule_viewer.kit` is a small set of server-rendered, script-free building
blocks for presentation modules: `section`, `metric_grid`, `data_table`,
`calendar_grid`, `disclosure_badge` (DISCLOSED / COMMITTED (opening not
supplied) / WITHHELD / NOT PRESENT), `verdict_pill` (`met` / `not_met` /
`not_evaluable`; reads the retired `insufficient_evidence` as `not_evaluable`
and refuses `not_applicable`), `citation_list`, `drilldown` (native
`<details>`), `evidence_details`, `verification_details`, `party_card` and
`timeline`. `page()` wraps them in a self-contained document with the kit
stylesheet inlined under a hash-pinned Content-Security-Policy.

- **Components show what they are given.** None computes a verdict, a count,
  a disclosure state or a verification outcome; a value outside a component's
  closed vocabulary is rendered as a visible refusal, never dropped or
  defaulted (`tests/test_kit_components.py`).
- **Phone behaviour lives in the primitives.** Each responsive component
  reflows on its own width (`@container`), so a module never writes a media
  query. `js-tests/kit_layout.test.js` opens the every-component fixture page
  (`python -m capsule_viewer.kit fixture`) in headless Chromium at 360, 390
  and 1280 px and under emulated print media at a 680 px page width (layout
  only; it does not paginate), and fails on any horizontal overflow; it
  also opens a Drilldown with the page's scripting disabled. Set
  `CHROME_PATH` if Chromium is not in a standard location; without one the
  suite is skipped locally with a warning and fails under CI.
- **Tokens.** `kit/tokens.py` is the one source of the `--cv-*` design tokens.
  The block at the top of `static/kit.css` is generated from it
  (`python -m capsule_viewer.kit tokens --write`) and `tests/test_kit_tokens.py`
  fails if the two disagree, if a component rule hard-codes a colour, or if a
  text/background pair falls below WCAG AA (4.5:1).
- **Module contract (draft).** `kit/contract.py` declares the presentation
  module interface -- `manifest`, `canRender`, `buildModel`, `render` -- as
  `typing.Protocol`s, with `check_module` / `check_module_renders` as the
  conformance check every module must pass (`tests/test_kit_contract.py`). It
  is a local draft of the presentation contract being written in
  agent-action-capsule and is re-pointed at that contract when it lands.

## Rules module (`capsuleviewer.rules/v0`)

`capsule_viewer.rules` renders one page over a rules-comparison record: a
rules comparison whose every value is an id or an enum
(`RulesComparison/v0`: per rule, `rule_id`, `action_state.disposition` and
`.assurance`, `platform_baseline.status` and `.assurance`, `capability_refs`).
It reads the comparison from the root record's disclosed `agent_output`; the
root's disclosed `agent_input` names the record kind as its `spec_version`.
The record kind is the deployer's, supplied at render time like the wording
pack (`rules_page(context, pack_bytes, wording_sha256, record_kind)`); the
manifest requires the profile `spec_version:<record_kind>`, built by
`rules_manifest(record_kind)`. The fixtures use
`org.example.rules-comparison/v0`.

- **Words come only from a wording pack** (`aac.wording-pack/v0`), passed with
  its `wording_sha256`. The pack's exact bytes must hash to it, or the pack is
  refused, the page says so, and every label falls back to its key. The page
  carries the `wording_sha256` of the pack it used (`data-wording-sha256`, and
  in L2). `rules/wording-en.json` is an example English pack with neutral
  example wording; a product's own pack is supplied at render time and is not
  part of this repository. Swapping packs changes words and never an
  identifier (`tests/test_rules_module.py`).
- **Depth** is the caller's (`depth="L0" | "L1" | "L2"`), never the bundle's.
  L0 is one summary line with counts per disposition, recounted from the rows;
  L1 is one row per rule (what it covers, what happens, what the platform does
  today), each opening onto how it is decided, what it applies to and how the
  platform's part is known; L2, collapsed at the bottom, is the proof: the
  verifier's checks, the record's capsule id and every record's checkpoint position, pack id
  and definition digest, baseline envelope digest, each rule's raw tokens,
  every disclosure state, and any legacy `report/v1` rows the bundle also
  carries, shown as the producer wrote them. Every level is in the document at
  every depth, so it prints.
- **A value no pack knows is shown raw**, marked unrecognized, never dropped;
  so is an enum value spelled other than `RulesComparison/v0` spells it. A
  bundle that did not verify, or any of whose disclosures mismatched, gets the
  refusal and the verifier's checks and no level at all. The profile tokens
  are derived as agent-action-capsule's `describeContext` derives them, so a
  root that carries an Evidence Result is left to the Result presentations.
- **Manifest** (`rules/manifest.json`, every member except the required
  profile): `trusted-executable`, `html` only, requires
  `spec_version:<record_kind>` and forbids the Evidence
  Result profile, so it is never ambiguous with agent-action-capsule's built-in
  manifests (`tests/test_rules_manifest.py` runs the contract's static
  ambiguity test against them). Not `declarative`: a declarative module cannot
  count rows per disposition, reads only the root's `agent_input`, and has no
  module detail in L2.
- `python -m capsule_viewer.rules fixture [--depth L0|L1|L2]` prints the
  synthetic page `js-tests/rules_layout.test.js` holds to no horizontal
  overflow at 360, 390 and 1280 px and in print, at every depth.

The module never verifies: `capsule_viewer.context.build_context` takes a
verifier's result and the per-member disclosure statuses it reported, and
builds a read-only context from them.

## Receipt module

`capsule_viewer.receipt` is the unilateral deal receipt,
`capsuleviewer.receipt.unilateral/v0`: one party's own receipt for one deal, over an
`x-deal-v0` bundle. Its manifest (`receipt/manifest-unilateral.json`) requires the
`x-deal-v0` extension and forbids `composed/v1`, so a composition never resolves to it.
It serves the three audiences capsulectl cuts copies for (`keep`, `counterparty`,
`adjudicator`) in `html`.

- **Selection** goes through `registry.py`: agent-action-capsule's presentation contract
  (sections 3.2 and 4), with the static ambiguity test at registration and a hard error,
  never first-wins, at resolution (`tests/test_receipt_registry.py`).
- **The module never verifies.** Its context is built from what `capsulectl verify
  --bundle` reported (`verifier_report.py`), and that report is refused unless its
  `bundle_digest` is the digest of the exact bundle supplied (`digest.py`), so an
  edited copy never renders under the original's verdict. Committed words are shown
  only when the core's `sha256-jcs-nonce256` service (`binding.py`) opens them.
- **No producer is named in the manifest.** A deployment that also registers a module
  selected by a producer-named profile passes that profile at render time
  (`unilateral_manifest(forbid_profiles=...)`), like the wording pack.
- **A copy is shown only as its own audience's.** The copy's sealed report names the
  audience it was cut for; asked for as any other audience's page, the module declines.
- **Per record**, it shows DISCLOSED / COMMITTED / WITHHELD / NOT PRESENT and the
  record's place in the log. What a relying party gets is the share builder's decision,
  made when the copy was cut; the module shows it and never makes it
  (`tests/test_receipt_module.py`).
- **Depth:** L0 the deal, item, amount and state; L1 what was asked, proposed, approved
  and done, with the merchant's evidence; L2 the verifier's checks and every record.
- **Words** come from a wording pack (`receipt/wording-en.json` is a neutral English
  example) or are capsulectl's own sealed report lines, shown as such.
- `tests/test_receipt_golden.py` accounts for every line deal-view.js showed for
  capsule-cli's receipt golden; `js-tests/receipt_layout.test.js` holds every fixture
  to no horizontal overflow at 360, 390 and 1280 px and in print.

### Bilateral receipt (`capsuleviewer.receipt.bilateral/v0`)

`capsule_viewer.receipt.bilateral` is one deal as both parties hold it, over a
`composed/v1` bundle: the outer bundle carries `composed/v1` and no `x-deal-v0`, and each
carried member is one party's own `x-deal-v0` copy, byte for byte, with its own
completeness proof. Its manifest (`receipt/manifest-bilateral.json`) requires
`composed/v1` and forbids an outer `x-deal-v0`, so it and the unilateral module never
match one bundle (`tests/test_receipt_bilateral.py`). `receipt_page` registers both.

- **Each copy is read through its own context.** capsulectl verifies each carried member
  as an Evidence Bundle of its own; `composed.py` builds that member's context from the
  member's own report, refused unless the report is for that member's exact bytes. One
  copy never fills in what the other leaves out.
- **One deal or not.** The deals each copy's disclosed records name (a record's deal id,
  else its chain id): both naming the same one is one deal; otherwise the page says the
  copies name different deals and picks neither.
- **Joins** are shown as the verifier reported them: the composer's declared state, the
  verifier's derived state and, for an agreement, corroborating or redundant. L2 carries
  the generic composition section in agent-action-capsule's words (`composed.py`).
- **Audiences:** a page shows the copies cut for its audience; the keep page also shows
  the other party's copy as it was handed over (its counterparty cut), beside at most
  one keep copy. Any other mix is declined.
- Fixtures: `examples/receipt/build_bilateral_fixtures.sh` (see
  `tests/testdata/receipt/README.md`).

## Fixtures

`tests/testdata/` vendors the synthetic `EXAMPLE-ORG` fixtures from
`agent-action-capsule`'s `vectors/evidence-result/` -- the round-0
comprehension example this package's tests render.

## Use

```python
from capsule_viewer import build_payload, encode_fragment, render_base_viewer_html
from capsule_viewer.result_v0 import build_result_entry

entry = build_result_entry(my_evidence_result_document)
fragment = encode_fragment(build_payload([entry]))
html = render_base_viewer_html(fragment)
# html is a complete, self-contained artifact -- write it to a file and open it.
```

## Test

```
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/pytest
.venv/bin/ruff check src tests

npm install
npm test   # the kit layout suite also needs Chromium (CHROME_PATH)
```

## Boundary

Zero pack code. The base and the kit render any conforming record
generically -- they have no concept of a specific pack, contract catalog, or
customer. The Rules module names no record kind and carries no pack either:
the record kind and the words for a pack's rules arrive at render time. No network at render time (`tests/test_no_network.py` asserts no
`fetch`/`XMLHttpRequest`/`<script src>`/etc. appear in any shipped static
module or in an assembled artifact).

## Hosted verifier

This package produces the artifact; it does not itself deploy one.
Wiring `result/v0` rendering into the live hosted verifier
(`verify.agentactioncapsule.org`) is a separate, credentialed deploy step
against a production service -- same "deploy is Steven's click" precedent as
this repo family's other hosted-verifier changes.
