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
  as agreement: no agreed mark, no peer line, no cited peer record. A
  `CONTESTED` close never carries the agreed mark and never `UNILATERAL`'s
  wording. An `AGREED` or `CONTESTED` close with no peer or no cited peer
  record, or a `UNILATERAL` close that names one, is refused.
- **A claim whose `type` the card does not know is shown, never dropped**:
  its own `rv0-claim-unrecognized` row, labelled `unrecognized`, carrying
  the raw type and the claim's `contract_ref`. The rendered row count
  always equals the input claim count.

## Fixtures

`tests/testdata/` vendors the synthetic `OO` fixtures from
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
npm test
```

## Boundary

Zero pack code, zero company vocabulary. Renders any conforming record
generically -- it has no concept of a specific pack, contract catalog, or
customer. No network at render time (`tests/test_no_network.py` asserts no
`fetch`/`XMLHttpRequest`/`<script src>`/etc. appear in any shipped static
module or in an assembled artifact).

## Hosted verifier

This package produces the artifact; it does not itself deploy one.
Wiring `result/v0` rendering into the live hosted verifier
(`verify.agentactioncapsule.org`) is a separate, credentialed deploy step
against a production service -- same "deploy is Steven's click" precedent as
this repo family's other hosted-verifier changes.
