# Property chips: mapping onto the current evidence contract (design note, not built)

Status: mapping only. No viewer code, no wording pack and no golden change.
This note maps the nine property rows and the five chip states of the proposed
per-property chip strip onto what the verifiers and the Evidence Result
contract say today. Rows that needed a product decision are marked
**DECISION** and collected in section 6. Steven ruled all twelve on
2026-10-19. The two cases the D3 ruling left open were decided non-stop on 2026-10-25 (section 6). The build is not
scheduled: capsule-viewer#39 holds it until an MVP-bar row names the chips.

The chip strip would show one row per property, each with one chip state:

- Rows: content binding, producer signature, local inclusion, checkpoint
  signature, external registration, continuity, identity/authority, capture
  coverage, outcome corroboration.
- States: `PASS`, `FAIL`, `NOT_PRESENT`, `NOT_CHECKED`, `INCONCLUSIVE`.

The chip vocabulary was drafted before the Evidence Result contract
(`met | not_met | not_evaluable`, with `NOT_APPLICABLE` as a population
exclusion) was published. This note re-derives it against that contract and
against the verifiers as they are.

## Sources

Every claim below cites one of these, at the commit named. Nothing in this
note changes them.

| Ref | Repository @ commit | Path |
| --- | --- | --- |
| [er] | agent-action-capsule @ `a726b9f5442fe507372ec3205bfbcb079b9c15e9` | `spec/evidence-result-v0.md` (sections 1, 3, 7, 9) |
| [er-schema] | agent-action-capsule @ `a726b9f` | `schemas/evidence-result-v0.json` |
| [aac-verify] | agent-action-capsule @ `a726b9f` | `ts/src/verify.ts` (line 68: `signature` and `key_id` are left out of the id; nothing in the file checks a signature) |
| [aac-page] | agent-action-capsule @ `a726b9f` | `ts/src/verification-page.ts` (`CheckStatus` line 15; `RECEIPT_GRADE_DISPLAY` lines 32-36; `FULL_VERIFIER_LINE` / `CHECKS_SCOPE_LINE` lines 394-398; `CHECKPOINT_NOT_CHECKED_NOTE` line 434; `producer-signatures` and `witness-receipts` always `notChecked`, lines 556-566) |
| [emit-file] | capsule-emit @ `16586f4c2989312bf4d392cd022a21c1df2000df` | `python/capsule_emit/evidence_file.py` (`_PLAIN` lines 67-102; `selection_not_checkable` line 279; `_witness_check` lines 319-383; `_unanchored` lines 390-395; `_checkpoint_check` lines 398-429; `_signature_check` lines 432-441) |
| [report] | capsule-viewer @ `c4f6dfd539da1ee2a5274feca9d3391fe837d8dc` | `src/capsule_viewer/evidence_report.py` (`_MARK`/`_WORD` lines 46-47; `_overall` line 116; "not shown" list lines 224-246) |
| [vreport] | capsule-viewer @ `c4f6dfd` | `src/capsule_viewer/verifier_report.py` (`CLAIMS` and `_OUTCOME`, lines 37-38) |
| [kit] | capsule-viewer @ `c4f6dfd` | `src/capsule_viewer/kit/components.py` (`verdict_pill` refuses `not_applicable`, line 205; `VERIFICATION_OUTCOMES` line 288) |
| [receipt-words] | capsule-viewer @ `c4f6dfd` | `src/capsule_viewer/receipt/wording-en.json` (`rung.*` keys) |
| [composed] | capsule-viewer @ `c4f6dfd` | `src/capsule_viewer/composed.py` (`Corroboration.result`, line 102) |
| [cli-composed] | capsule-cli @ `1f734d2246666b498ebf8b8301a1f547a4a370b5` | `internal/cli/composed_test.go` lines 228-230 (a one-sided join gives corroboration `not_applicable`) |
| [anchor] | capsule-anchor @ `b7e45df227d7e80fad4a46c300032b1374c632ef` | `README.md` lines 151-156 (the witness checks a checkpoint's consistency claim when it registers it) |

## 1. What a chip is, and what it is not

**A chip is presentation, never a verdict.** Each chip renders the result of
one verifier check over one exact bundle (bound by `bundle_digest`, as
[report] `bind_result` and [vreport] already require). None of the five chip
states is a value of the Evidence Result `verdict` or `sufficiency`
vocabularies, and no chip state may be read as one.

The Evidence Result layer is separate and keeps its own surfaces:

- `met | not_met | not_evaluable` render only through `verdict_pill` [kit],
  per claim, beside that claim's `tier` and `grade` ([er] section 3: "Assurance
  stays attached to each claim").
- A Result renders coverage first, then the three buckets. It never renders a
  single figure above them ([er] sections 3 and 7).
- `NOT_APPLICABLE` is a population exclusion. It appears only as the count
  `aggregate.coverage.excluded_not_applicable` ([er] sections 3, 7 and 9).
  It is never a claim, a verdict or a chip. `verdict_pill` already refuses it
  [kit], and the chip strip must refuse it the same way.
- `not_evaluable` is a verdict. It is not `INCONCLUSIVE` and must never be
  drawn as one. The two words answer different questions: a claim's judged
  outcome, against whether a check on the file could run.

So the property chips never summarize claims. A chip strip that showed one
chip for "the Result" would be the rollup that [er] section 3 forbids.

## 2. The five chip states

Every source status maps to exactly one chip state. Each chip with a held result names its
checker, so a reader can see who ran it. The AAC page's own statuses
produce no chips (D3, section 6).

| Chip state | Meaning (render-only) | Source statuses that produce it |
| --- | --- | --- |
| `PASS` | A named verifier ran this check over this exact bundle, and it passed. | capsule-emit `pass` [emit-file]; capsulectl `pass` [vreport] |
| `FAIL` | A named verifier ran this check over this exact bundle, and it did not pass. | capsule-emit `fail`; capsulectl `fail` |
| `NOT_PRESENT` | The bundle carries nothing for this check to run on. | capsule-emit `withheld` with an absence finding (table below) |
| `NOT_CHECKED` | The bundle carries what the check needs, but no verifier whose result the viewer holds ran it. | capsule-emit `withheld` with a "could not run" finding (table below); no capsulectl or capsule-emit result held for the check (D3) |
| `INCONCLUSIVE` | The check ran and its own arithmetic holds, but it rests on something that is not itself checked. So the result cannot stand either way. | capsule-emit `withheld` with `checkpoint_unverified` on a proof claim (`_unanchored`) |

**`withheld` is not a chip state.** capsule-emit and capsulectl use one word,
`withheld`, for three different situations. [report] draws all three as
"Not shown" (`_WORD`). [vreport] maps all three to `not_checked` (`_OUTCOME`),
so today it draws an absent signature as "Not checked". The chip strip must
split `withheld` by its finding:

| Check (capsule-emit name) | `withheld` finding | Chip state |
| --- | --- | --- |
| `checkpoint` | `checkpoint_signature_absent` | `NOT_PRESENT` |
| `checkpoint` | `checkpoint_verifier_unavailable` | `NOT_CHECKED` |
| `signatures` | `producer_signature_unclaimed:*` (every record) | `NOT_PRESENT` |
| `signatures` | `producer_signature_unclaimed:*` (some records) | **DECISION D2** |
| `witnesses` | `witness_receipt_absent` | `NOT_PRESENT` |
| `witnesses` | `witness_unverified:*` (no key for that witness in the supplied directory) | `NOT_CHECKED` |
| `witnesses` | `checkpoint_unverified` (receipt present, checkpoint not authenticated) | `NOT_CHECKED` |
| `interval_coverage`, `per_record_membership` | `checkpoint_unverified` | `INCONCLUSIVE` |
| `interval_coverage` | `selection_not_checkable` | `NOT_CHECKED` |
| `per_record_membership` | `membership_verifier_unavailable` | `NOT_CHECKED` |
| `graph_closure` | missing records declared and listed | no row; see D9 |

The AAC page's `CheckStatus` also has a `withheld`, and there it means
"still withheld pending producer disclosure" [aac-page]. That is a disclosure
state, not a check result. It is never a chip state either.

## 3. The nine rows

"Today" means what can honestly be drawn from the sources above. It assumes a
bundle as capsule-emit writes it, checked by capsule-emit or capsulectl, with
no witness directory unless one is stated.

| Row | Source check | PASS / FAIL | NOT_PRESENT | NOT_CHECKED | INCONCLUSIVE | AAC page reality [aac-page] | Today |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Content binding | capsule-emit `records` (id recomputes); capsulectl record identity | as reported | never: a bundle with no records is `FAIL` (`no_records`) | no capsule-emit or capsulectl result held (D3) | never | runs: `page` or `failed`; not a chip source (D3) | As reported. With only the page or the viewer's in-browser recompute, `NOT_CHECKED` with no "checked by" line. Disclosed values against their committed digest are a sub-line of this row, not a tenth row. |
| Producer signature | capsule-emit `signatures`; capsulectl `producer_signatures` | as reported | every record unsigned | never from capsule-emit | never | always `notChecked` when any record carries a signature: [aac-verify] checks no signature | From capsule-emit or capsulectl: as reported. On the AAC page alone: `NOT_CHECKED` with no "checked by" line, since nothing ran (D3, section 6). Mixed signed and unsigned: D2. |
| Local inclusion | capsule-emit `per_record_membership` | as reported, only under a `PASS` checkpoint | no membership entry for the record | `membership_verifier_unavailable`; no verifier result held | proof checks against an unsigned root (`checkpoint_unverified`) | runs when a certificate and checkpoint are carried | Unsigned checkpoint: `INCONCLUSIVE`, never `PASS`. |
| Checkpoint signature | capsule-emit `checkpoint` | as reported | no `checkpoint.cose` | verifier unavailable; no verifier result held | never | may pass the bundle without it (`CHECKPOINT_NOT_CHECKED_NOTE`) | As reported. When only the AAC page ran, the chip is `NOT_CHECKED` and the page's `CHECKPOINT_NOT_CHECKED_NOTE` stays beside it; the page's `checkpoint-signature` result is not a chip source (D3, section 6). |
| External registration | capsule-emit `witnesses` (only under a caller-supplied witness directory; no witness is trusted by default) | `PASS`: one receipt verifies under a directory key. `FAIL`: one receipt does not verify. | `witness_receipt_absent` | no key for the witness, or checkpoint not authenticated; no verifier result held | never | always `notChecked`; a receipt's grade word is shown as "claimed (not checked here)" | With no directory supplied, every receipt is `NOT_CHECKED`. A `PASS` must name the directory it was checked under (D12). No registration time is surfaced (section 4, D4). |
| Continuity | none. No verifier in the bundle path checks consistency between this checkpoint and an earlier one. | never today | **always today**: evidence-bundle/v2 carries the checkpoint's signed `prev_size`/`prev_root` but no consistency proof and no earlier checkpoint for a verifier to check | never today | never today | no check | **`NOT_PRESENT`.** The witness does check a checkpoint's consistency claim when it registers it [anchor], but no verifier result reports that to a page. This is the honest result, not a defect. A receipt grade word `consistency-verified` is a claim: D5. |
| Identity/authority | none. A key shows one holder signed; naming the holder needs a directory or a witness ([report] line 226; AAC `CHECKS_SCOPE_LINE`). | never today | **always today** | never | never | "None of these checks says who produced the records" | **`NOT_PRESENT`.** `signer_matches_checkpoint` (every record names the checkpoint's key) is a fact line under the row, not a chip state. A handle, an Agent Card or a connection is never shown as identity. D6. |
| Capture coverage | none. No verifier can check from the file whether the capture boundary saw every action. | never today | no capture boundary declared: render "capture: unknown", visibly | a producer-declared boundary or completeness statement (a claim nobody can check from the file) | never | not checked | `NOT_PRESENT` ("capture: unknown") or `NOT_CHECKED`, never `PASS`. D7. |
| Outcome corroboration | composed corroboration (capsulectl, [composed]). Never Evidence Result verdicts (section 1). | capsulectl `corroborating` | no countersignature and no second party's copy; capsulectl corroboration `not_applicable` (one-sided join [cli-composed]) maps here, and the words "not applicable" are never drawn on the chip | countersignature carried but not verified ([report]: "carried, not verified"), or no verifier result held | never | runs for typed countersignatures; not a chip source | Single-party bundle: `NOT_PRESENT`. `redundant` (same declared custody) is not `PASS`. D8: the row ships, renamed to say whose copy agrees. |

## 4. The five-nothings panel and registration lag: what can be said today

Two reworded lines are named in the source item. The other three are not
named in any public source this note could find. Per the D10 ruling, no
panel is built until those three lines have a source. The two lines below
are the wording for when it is.

**"Nothing missing from the committed range."** This can be drawn only when
`checkpoint` is `PASS` and `interval_coverage` is `PASS`. It must name the
range: "log positions a-b", the same positions [report] already prints. It is
followed by the line [report] already carries: "Records outside log positions
a-b: this file says nothing about them." In every other case the line reads:
"Not shown that no record is missing between these records." With
`selection_not_checkable`, the line says the selection could not be checked
by this verifier, as [emit-file] `_PLAIN` does.

**"Existed no later than T" (replaces "nothing backdated").** To be true,
this needs a verified witness receipt time T over a checkpoint whose range
holds the record, with the record's membership `PASS`. Today no verifier
result carries T. The `witnesses` entries in [emit-file] report `ts_url`,
`binding`, `status` and `reason` only, and the AAC page checks no receipt.
The checkpoint's own `timestamp` is signed by the log's key. It is the
producer's statement of time, not an outside one. So today the line can
honestly say only this: "The log's checkpoint is signed with the time T by
the log's own key. No outside registration time is shown." It must not say
"existed no later than" until a verifier reports a checked registration time
(D4). The label rule stands either way: "registered <= T", never a word that
implies the record was registered as it happened.

**Registration lag.** This is not renderable today, for the same reason: a
lag needs a checked registration time, and none is reported. A lag computed
against the record's own `timestamp` would subtract a producer-stated time
from a checked one, and would present the result as checked. The chip strip
shows no lag value and no "lag unknown" chip; the External registration
row's state already says what is known. The `capsule status` part of the
original item is a CLI surface, not this viewer (D11).

## 5. Rules the build must keep

1. No chip, row or panel renders `NOT_APPLICABLE`, `not_applicable` or
   "not applicable" as a state. Population exclusion appears only as the
   Result's coverage count.
2. No chip renders an Evidence Result verdict, and no single figure
   summarizes the nine rows: no count of passes and no badge for the whole
   strip.
3. Every chip with a held result names its checker (capsule-emit or
   capsulectl), and is drawn only from a result bound to this bundle's
   digest. The AAC page is never a checker, and where no
   capsule-emit or capsulectl result is held the chip shows no "checked by"
   line (D3, section 6).
4. `withheld` is split by finding (section 2), never drawn as one state.
5. Continuity reads `NOT_PRESENT` against today's witness. A test pins it.
6. The rendered words keep the repository's prose discipline
   (`tests/test_prose_word_discipline.py`).

## 6. Decisions

### Rulings (Steven, 2026-10-19)

Steven ruled all twelve decisions in one signed Buzz message:
`buzz://message?channel=0d760ea3-529d-4dec-b309-24184967f8e0&id=ac2c1c5ff8e72b62234bd329525b451b5a93ce8bdb8b738939ffe35ab46cee92&thread=c686c8798e7b9bce80d143cd4b242c11655780911c67036939075f6e907f419e`.
It accepts Sherlock2's review
`buzz://message?channel=0d760ea3-529d-4dec-b309-24184967f8e0&id=b75f7ea4b3b4737cf915edc7ce5a62ea642be6825d84ca6fdfaf2cbf336cf4a3&thread=c686c8798e7b9bce80d143cd4b242c11655780911c67036939075f6e907f419e`
(item 2), which agreed with the set put to Steven in
`buzz://message?channel=0d760ea3-529d-4dec-b309-24184967f8e0&id=6b9ea3e765ae9d195042fa5a0291115004f6e1ca84c3a526c6e690435e37bed4&thread=e324e0f89031e0bfa52cb138a209bf748f34de2cb73be01f54c4e8781f375b78`
(item 2). The ruling is recorded on capsule-viewer#39 and in the ops queue
as u538 (action-state-ops @ `a0f4ed7`, `company-oss/inbox.md` line 770). It
gates the build,
not this note. "As proposed" means the full proposal in the table below.

| # | Ruling |
| --- | --- |
| D1 | As proposed: keep `INCONCLUSIVE`. |
| D2 | As proposed: `NOT_PRESENT` with "n of m records unsigned". |
| D3 | Name the checker that actually ran: capsulectl on product pages, capsule-emit on the Python runtime pages (the PM's wording in the capsule-viewer#39 body, which the accepted set names). Never name the AAC page. |
| D4 | As proposed: yes, as a separate verifier item. Until it lands, section 4's wording holds. |
| D5 | As proposed: `NOT_PRESENT`, with the grade word shown as claimed. |
| D6 | As proposed: ship the row as a permanent `NOT_PRESENT`. |
| D7 | As proposed: `NOT_CHECKED`. |
| D8 | As proposed: keep the row, renamed to say whose copy agrees. |
| D9 | As proposed: a sub-line of Content binding. |
| D10 | No panel until the three missing lines have a source. |
| D11 | As proposed: out of scope here. |
| D12 | As proposed: show the witness directory's digest beside the chip. |

Reading of D3, not part of the ruling: "the AAC page" means AAC's
presentation shell wherever it lives, as it moves to capsule-viewer (the
How ack on capsule-viewer#39).

**Decided under D3 (non-stop, 2026-10-25).** The ruling was silent on two
cases; both are decided, with Sherlock2's view, in the
[decision on capsule-viewer#39](https://github.com/action-state-group/capsule-viewer/issues/39#issuecomment-6399359403).
Steven can override.

- When no capsulectl or capsule-emit result is held, nothing ran, so there is
  no "checked by" line. The `NOT_CHECKED` chip already says so, and any
  fallback line would name a check that did not happen.
- The AAC page's own results (section 2: `page`, `failed`, `notChecked`,
  `passedWithoutCheckpoint`) produce no chips, and rule 3 in section 5 drops
  "this page" as a checker. The page never checks producer signatures, and its other results are
  not chip sources.

### Questions and proposals as reviewed

| # | Row or state | Question | This note's proposal |
| --- | --- | --- | --- |
| D1 | `INCONCLUSIVE` | Keep it for "ran, but over an unsigned root", or fold that into `NOT_CHECKED`? | Keep. It is the only state that stops a proof checked against an unsigned root from reading as `PASS` or as never run. |
| D2 | Producer signature | Some records signed and checked, others unsigned (capsule-emit `withheld`). Which row state? | The row shows `NOT_PRESENT` with "n of m records unsigned". Per-record marks stay in the records table, as in [report]. |
| D3 | Producer signature, External registration | The AAC page deliberately names no product (`FULL_VERIFIER_LINE`), while [report] names `capsule-emit verify --bundle` and [vreport] names capsulectl. Which checker does "checked by ..., not by this page" name? | Name the verifier whose result the page actually holds. Where it holds none, use the AAC page's product-neutral line. (Superseded by the non-stop decision above: no line.) |
| D4 | External registration, five-nothings, lag | Ask capsule-emit and capsulectl to report a checked registration time per receipt, so "existed no later than T" and lag become drawable? | Yes, as a separate verifier item. Until it lands, use the wording in section 4. |
| D5 | Continuity | A receipt grade word `consistency-verified` is present but not checked by any verifier result the page holds. `NOT_PRESENT` or `NOT_CHECKED`? | `NOT_PRESENT` for the bundle, with the grade word shown as "claimed (not checked here)" per [aac-page]. |
| D6 | Identity/authority | No source can produce `PASS`. Ship a row that is always `NOT_PRESENT`, or move it to fixed text? | Ship the row. A permanent `NOT_PRESENT` is the honest statement and keeps the gap visible. |
| D7 | Capture coverage | When a producer declares a capture boundary, is that `NOT_CHECKED` or a fact line under `NOT_PRESENT`? | `NOT_CHECKED`. The boundary is carried, and no verifier can check it from the file. |
| D8 | Outcome corroboration | Keep the row (countersignatures and composed corroboration only), or drop it so that nobody reads it as the outcome? | Keep it, renamed to say whose copy agrees, with a link to the Result's coverage and buckets when a Result is present. |
| D9 | Graph closure | capsule-emit's `graph_closure` has no row. Where does it go? | A sub-line of Content binding: records cited and missing, listed. |
| D10 | Five-nothings | Only two of the five lines are named in any source found. What are the other three? | Needs the list before the panel is built. |
| D11 | Registration lag in `capsule status` | Is that part in scope here? | No. It belongs to capsule-cli and waits on D4. |
| D12 | External registration | A `PASS` depends on the caller's witness directory. Does the chip name the directory (file name or digest)? | Yes. Show the directory's digest beside the chip. |
