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

## Contract reports: one module, wording packs

The Outcomes report and the EU AI Act Results are one module,
`ts/src/contract-report.ts`, drawn with one of two wording packs. The module
holds the layout (the front block, two levels of toggles, the proofs) and
computes every count, verdict and digest; the pack holds the module's own
words, not every word on the page (see "Not in the pack" below).

**How to tune the words.** Edit the pack, re-render. Outcomes:
`ts/src/wording/contract-report-outcomes.en.json`; EU AI Act:
`ts/src/wording/contract-report-eu-ai-act.en.json`. Either copy the file and
change entries, or write a small pack with only the entries you change (keys
the module does not know, such as `page.title`, are left to their owners).
Then `cd ts && npm run build && node scripts/render-report.mjs BUNDLE.json
--wording MY-PACK.json -o page.html`, or hand the pack to the presentation
builder (`wording`). The bundle is not touched, so no judge pin, Result digest
or verdict moves, and nothing is re-judged.

- **What can change:** any label, heading, plain-language line, help text or
  verdict word. `{name}` is where the module puts a count, digest, date or
  list; plurals are `<key>.one` / `<key>.other`.
- **What can't:** a pack holds strings only. Each entry it replaces must use
  exactly the placeholders of the default entry, in the same order, with at
  least one word between any two of them, so a count or denominator can be
  neither dropped, reordered, nor run into another on the page. Two verdicts
  may not share a word (the module's own `lines.verdict.*` and
  `groups.verdict.*`, each card's own prefix -- `verdict.*` itself is
  `contract-report/v1` §3's -- plus `lines.status.*`, `lines.pf.verdict.*`
  and the other sibling sets `contract-report-wording.ts` lists), as a
  reader reads it (case, spacing and punctuation ignored); no verdict may
  take another verdict's default word, nor may a count that should read as
  an exception or a miss read as the clean "met" or "no exceptions" instead,
  so met and not met cannot be swapped and an exceptions count cannot be
  relabelled clean. `layout.grouping` is fixed. A bidi or other invisible
  character anywhere in a pack's text, or in its `id`, is refused outright,
  never merely stripped for a check. The lines that say what the page
  checked or didn't ("stated by the bundle, not checked here", "which this
  page does not check", the withheld-report and "not stated" notices, the
  producer's-text and "not evidence" labels; the list is `LOCKED_ENTRIES` in
  `ts/src/contract-report-wording.ts`) are fixed, because they are the page's
  account of its own checking, and a reworded one could claim a check that
  never ran. A pack that breaks
  any of these, or does not hash to its `wording_sha256`, is refused before
  anything is drawn; `render-report.mjs` and the presentation builder name
  every problem. The raw
  verdict is on every element as data, whatever the words say.
- The page's proofs name every wording layer applied, by digest: a supplied
  pack's own id and `wording_sha256`, and the built-in default pack's id and
  digest underneath it -- named on a default-only page too, since
  `contract-report/v1` §3 records every layer applied, not only a supplied
  one.
- Not in the pack: what the bundle itself states (the producer's obligation
  titles and test names, in italics; sealed rule wording) and two lines
  agent-action-capsule's outcome model writes (the outcome statement and the
  resolution rule). The module never takes its own words from a bundle
  (presentation contract section 6).

One nesting rule holds on every report page (SEAMS ruling 11): a level-2
toggle may sit inside a level-1 toggle, never deeper (`nestingProblems`,
`capsule_viewer.kit.check_nesting`). `nestingProblems` also reads each
toggle's level, so a level-2 toggle inside another level-2 toggle fails.

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

### The receipt modules in the page: module-slot scripts

The three receipt modules (unilateral, seller, bilateral) also ship as module-slot
scripts, the form a page builder puts in a page (capsulectl `presentation build`, from
a plugin that carries them): `static/receipt_unilateral.js`, `static/receipt_seller.js`
and `static/receipt_bilateral.js`, pinned by `receipt/module-slot/manifest-*.json`
(`executable.carrier` `module-slot`, `script_sha256`, and `style_sha256` for the kit
stylesheet each script inserts once at render).

- **One source, three scripts.** `static/receipt_core.js` is the source;
  `python -m capsule_viewer.receipt.module_slot --write` writes each script from it with
  its manifest, the example pack's words compiled in (the script reads no pack) and the
  kit stylesheet, and writes the manifests (the Python modules' manifests, same ids and
  selection clauses, with the module-slot carrier). One script per module: a builder puts
  one script in a page per module it chose, so a shared script would register modules it
  did not choose. `tests/test_receipt_module_slot.py` fails when a committed file is not
  what the generator writes.
- **The Python modules are the test oracle.** `js-tests/receipt_parity.test.js` runs
  every receipt fixture, at every audience, and every copy whose seller kind was dropped
  or added, through both (`tests/receipt_oracle.py` prints the Python side): the same
  `canRender`, the same model field for field, and the same render at L0, L1 and L2 (both
  parsed and serialised one canonical way). `js-tests/receipt_module_slot.test.js` also
  holds the receipt goldens' pages to the same pixels in headless Chromium, and renders the
  copies capsulectl (capsule-cli main) cut.
- **What the page's runtime does not hand a module:** the page's audience (a copy is shown
  as the audience its own sealed report names, never relabelled), a witness result (the
  page's verifier reports none, and the witness line says so) and a composition's carried
  copies as contexts of their own (the bilateral script asks the page's runtime to verify
  each carried copy).
- **Selection beside capsulectl's deal view.** agent-action-capsule's registry never
  orders two modules of one tier: priority is not read, and a second module some
  descriptor could match together with a registered one is refused at registration
  (`ts/src/presentation-registry.ts`). `capsulectl.deal-view/v0` requires `x-deal-v0`,
  forbids no extension and serves `*`, so the unilateral and seller receipts co-match it
  (the bilateral one does not), and no forbids clause on either side can part them: a real
  copy's descriptor matches both. `presentation build` never puts the deal view in a page,
  so the three register there with no ambiguity and the page resolves each copy to its
  receipt; `presentation list`, which registers the deal view beside them, stops at
  registration (`tests/test_receipt_module_slot.py`).

## Evidence report page

`capsule_viewer.evidence_report` renders one readable, offline HTML page from
an evidence file (`evidence-bundle/v2`). It is the page capsule-emit's
`capsule-emit report` drew, moved here; the checking stays in capsule-emit.

- **It never checks.** The page is drawn from the result of capsule-emit's
  `capsule_emit.evidence_file.check_evidence_file`, read unchanged
  (`render_report_html(bundle, check)`), or `check_and_render(bundle)` calls
  that verifier and renders what it returns. A result altered after the check
  renders as altered (`tests/test_evidence_report.py`).
- **A result handed in is bound to the bundle it is drawn over.**
  `render_report_html(bundle, check)` raises `BundleMismatch` unless the
  result's `bundle_digest` equals agent-action-capsule's `bundle_digest` of the
  bundle supplied (that digest leaves out `countersignatures`, so the carried
  countersignature count is not bound). `check_and_render` and the command
  below run the verifier on the very file they render.
- **Check it yourself** points at the donated verifier,
  `capsule-emit verify --bundle FILE.json`, which needs nothing from this
  package.
- **The page is the one capsule-emit drew.** `tests/testdata/evidence-report/`
  freezes, per case, a bundle, capsule-emit's result for it and the page
  capsule-emit's own renderer drew from the two (capsule-emit 0.9.1, the
  renderer at capsule-emit main `35b2b42`). The page drawn here from the same
  pair must be byte-identical (`tests/test_evidence_report_golden.py`).
  `tests/test_evidence_report_cases.py` checks the same files live: tampered
  signatures, proofs and roots, a withheld payload, a malformed oversized
  `bundle_ref` and injected markup.
- Needs the `evidence` extra (`pip install "capsule-viewer[evidence]"`).

```
python -m capsule_viewer.evidence_report bundle.json -o report.html
```

It exits as `capsule-emit verify --bundle` does: 0 VALID, 2 INCOMPLETE,
1 INVALID or unreadable.

## Ledger module (`capsuleviewer.ledger/v0`)

`capsule_viewer.ledger` is the page capsule-emit's `ledger view --html` wrote:
every record of a ledger's evidence file as one row, with the actor's lineage
label, the verdict, the effect, the chain label, each gate check and the time;
refusals are marked and counted.

- **The page is drawn over the ledger's evidence file.** The ledger's
  producer makes the file (`evidence-bundle/v2`), for example `capsule-emit
  bundle LEDGER --all -o bundle.json`, which proves every record under the
  log's signed checkpoint (and refuses a log with none); this package never
  builds one and holds no key. That file reads VALID only when every leaf up
  to the checkpoint is a record, as in an unpadded mesh ledger directory.
  Padding lines (the Mesh-LLM capsules plugin pads before every checkpoint)
  and a `ledger.jsonl`'s checkpoint stamps are leaves too, so with one at or
  below the newest checkpoint the file carries no range proof and reads
  INCOMPLETE. agent-action-capsule#339 will let a range cover padding;
  stamps stay uncovered until a draft defines the stamp record. The page
  shows the records the file carries: with `--all`, every record up to the
  newest checkpoint, so records appended since then appear once the next
  checkpoint covers them.
  `check_and_render(bundle)` runs capsule-emit's `check_evidence_file` on it;
  `ledger_page(bundle, check)` binds that result to the file as the report
  does, builds the context from it, and draws the page through the shell
  (`capsule_viewer.shell.present`) with the module resolved from its
  manifest.
- **The banner is the verifier's verdict.** VALID shows as verified,
  INCOMPLETE as incomplete (the kit's `incomplete` outcome: something the
  file claims is not proven; a file with no signed checkpoint is not tied to
  any committed log, and a `--all` file whose log has a leaf that is not a
  record, such as a padding line or an earlier checkpoint stamp, proves each
  record alone but not that none is missing), INVALID as the contract's
  refusal with the failing checks and no row. The shell follows the
  module with the verifier's checks on every path (`present(...,
  core_checks=True)`): every check, the witness check, what the file carries
  unchecked, and each record's log position, identity and signature. The
  module never verifies; if it throws or draws nothing, the verification is
  shown as it was.
- **Depth** is the caller's (`--depth L0|L1|L2`, default L1): L0 is the
  ledger's name and its record and refusal counts, L1 the rows in one
  disclosure (closed at L0), L2 the core's checks.
- **Manifest** (`ledger/manifest.json`): a fallback over any
  `evidence-bundle/v2`, `html` only. It is the floor of the ledger page's own
  registry and an alternative to agent-action-capsule's
  `aac.builtin.no-aggregate/v0`; a registry refuses to hold both.
- `tests/testdata/ledger/` freezes three pages (incomplete, tampered,
  hostile); `freeze.py` there rewrites them for an intended change.
  `js-tests/offline_pages.test.js` opens these and the report goldens in
  headless Chromium with the network emulated offline: no request but the
  page itself, no script, no console error.
- Needs the `evidence` extra.

```
capsule-emit bundle ledger.jsonl --all -o bundle.json
python -m capsule_viewer.ledger bundle.json -o ledger.html
```

It exits as the report does: 0 VALID, 2 INCOMPLETE, 1 INVALID or
unreadable.

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

`scripts/ci-local.sh` runs these plus the `ts/` package's `npm run check` and
the `go/` module's tests, as CI does.

## Packages and releases

Besides the Python package above, the repository holds the npm package
`@action-state-group/capsule-viewer` (`ts/`) and the Go module
`github.com/action-state-group/capsule-viewer/go` (`go/`).
[RELEASING.md](RELEASING.md) says how each is released.

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
