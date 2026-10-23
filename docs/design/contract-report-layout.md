# Contract-report pages: information hierarchy and layout (design note, not built)

Status: design only. No module code, no wording pack and no golden change.
This note fixes the information hierarchy and visual clarity of the two
contract-report pages, Outcomes and EU AI Act. It maps every page element to
the evidencebook record it comes from, ranks the elements into the three
levels the presentation contract defines, and phases the work. Code waits on
two gates: capsule-viewer#58 must merge, and Steven sees this layout direction
first.

Ethan's direction: separate primary from secondary information, and make the
visual design clear. The earlier invoice-style statement mocks predate
evidencebook and deal, so this note does not copy them; it adapts to what the
records hold. It starts from Sherlock2's v2 mocks, which Steven has seen.

## Sources

| Ref | Repository @ commit | Path |
| --- | --- | --- |
| [pc] | agent-action-capsule @ `17f0c9f7e56a6d019c6bb50b0cbfc9da9d57b6e5` | `spec/presentation-contract-v0.md`: §6 (hints never supply data; producer annotations "never in L0"), §6.1 ("Modules MUST NOT restate verification"), §9.1 (L0, L1, L2; the core's part of L2 comes first; depth only from `host.depth`) |
| [cr] | agent-action-capsule @ `17f0c9f` | `spec/contract-report-v1.md`: §2 (summary first, rows, groups, per-claim tier, grade and status, applicability section, other sealed records, `x-` members never read), §3 (wording keys; a missing `report.title` shows no title) |
| [er] | agent-action-capsule @ `17f0c9f` | `spec/evidence-result-v0.md`: §3 (Steven's ruling of 2026-09-22: coverage first, then the buckets; "Nothing above the fold summarizes assurance"), §4.3 (`applies_from`, copied from the contract's `clause.effective_from`; absent means in force), §8 (`presentation/v1` header fields: producer name, logo, title; never data) |
| [m58] | capsule-viewer @ `99007797b3714d95d3969f165613ff0ebda18fd7` (PR #58 head) | `ts/src/contract-report.ts` (line 123, one wrapper with its own two levels), `ts/src/report-levels.ts`, `ts/src/outcome-report-view.ts` (`conversationStatus`, `renderProducerNote` line 209), `ts/src/wording/contract-report-eu-ai-act.en.json` (no `report.*`, `group.*` or `row.*` entries) |
| [shell] | capsule-viewer @ `c48de50` (main, #61) | the core's folded "How this page was checked" section in `ts/src/evidence-graph-view.ts`. #58's head doesn't include it. |
| [ebs] | evidencebook-skills @ `757abc33b65d22e462d7ffc0b0c7aa2d4048570d` | `demo/eu-ai-act-obligations/presentation.json`, `contracts/eu-ai-act-obligations/0.2.1.json` (no `clause.effective_from`) |
| [book] | capsule-cli @ main | `plugins/internal/plugin/book.go` (an evidencebook Close carries a `counterparty` book id) |
| [bundle] | the tau2 demo bundles (30 sessions, 2026-10-01..03, mock judge) | observed fields, listed in §2 |
| [v2] | Sherlock2's v2 mocks, Buzz `46aa2888`, screenshots `48c3b67e…png` (EU) and `73ff64fe…png` (Outcomes) | the layout this note starts from |

## 1. What the pages do today

Rendered from the demo bundles with #58's module ([m58]). Top to bottom:

| Order | Outcomes page | EU AI Act page |
| --- | --- | --- |
| 1 | Producer note, "Added by this report's producer" | Regulation title as the page heading |
| 2 | "Outcome report" header with the conversation counts | "What was checked and what we found": one table per obligation, each with a "Show the N sessions" drill |
| 3 | "Results rule by rule": 9 rows, each with a drill | Proofs (method, test wording, what ran) |
| 4 | Day by day, Human spot checks, Proofs | Verification: receipts, a 745-record list, the ten checks, extensions |
| 5 | Verification: the same raw dump, 707 records | |

Neither page shows the sealed aggregate (coverage, then buckets) that [cr] §2
and [er] §3 put first. The answer sits in the rule tables, and both pages end
in the full core verification section, unfolded, because #58 predates #61.
The producer note opens the Outcomes page, although [pc] §6 keeps producer
annotations out of L0. On Outcomes, the day view shows one tile dated
2025-06-05, because it groups by the case records' own dates; the judgments'
`period` says 1, 2 and 3 Oct.

## 2. Where each element comes from

**Exists**: a sealed record, the sealed Result, or the verifier's own result
holds it. **Gap**: nothing sealed holds it today; a producer change fills it.
**Door**: filling it needs an AAC spec change (§5).

| Element | Source | State |
| --- | --- | --- |
| Report name | wording pack `report.title`, chosen by the claims' `contract_ref` ([cr] §3). No fallback: a missing `report.title` shows no title. The EU default pack has no `report.*` entry yet ([m58]) | Exists for Outcomes; Gap in the EU pack |
| Contract id and version | every claim's `contract_ref` (`eu-ai-act-obligations@0.2.1`) | Exists |
| Period | the judgment records' `period` (`day:2026-10-02`), first to last; the Result's `generated_at` as the as-of date | Exists |
| Population | the case records the claims' evidence cites. Claim ids aren't used: [er] §4 defines `id` only as unique | Exists |
| Issuer | each record's `operator` (`tau2-demo`) and `producer-key/v1`. `presentation/v1` defines `producer_name` ([er] §8), but evidencebook-skills doesn't emit it | Exists (operator); Gap (`producer_name`) |
| Subject line ("Airline support agent") | nothing sealed. Words describing a contract belong in the wording pack (`report.summary`) | Gap (pack wording, no door) |
| "Prepared for" | an evidencebook Close names a `counterparty` book id ([book]). The AAC `close/v1` schema has no counterparty field. In this bundle the value is a placeholder and the Close isn't disclosed | Gap (§5, D1) |
| Statement number | nothing | Gap → Door (§5, D1) |
| Sealed aggregate | the Result's `aggregate`: coverage, then the met, not met and not evaluable buckets | Exists |
| Requirement count | distinct `requirement_ref` in the claims | Exists |
| Per-case status (resolved, missed, undecided) | claims grouped per case, with `conversationStatus` ([m58]), which also has `unverified` and `nothing-applied` | Exists (derived) |
| Rows and groups | one row per (`contract_ref`, `requirement_ref`), grouped by the part before the first `.` ([cr] §2) | Exists |
| Row and group wording | wording pack `row.<ref>.*` and `group.*`. The EU default pack has none yet; the module still takes test names from the presentation block ([m58]) | Gap in the EU pack |
| Per-claim tier, grade, status | each claim's `tier`, `grade` and carrier `status` | Exists |
| Judge: live or mock | the judgment record's `judge_pin` model id, a free string ("(mock backend …)"). evidencebook-skills#26 asks for a recorded judge mode | Partial |
| Witness receipts | checkpoint receipts. None in this bundle | Exists (as absence) |
| Human re-grade records | `calibration-summary/v1`. None in this bundle (capsule-viewer#62) | Exists (as absence) |
| EU in force vs binding later | each claim's `applies_from` ([er] §4.3), copied from the contract's `clause.effective_from`. Neither the claims nor contract 0.2.1 carry one. The only source today is the presentation block's `applicability`, a hint | Gap (§5, D3) |
| EU findings: severity, recommendation | the presentation block's per-row `finding`. That's a producer annotation. Its digest sits in the Result's `x-presentation-digest`, but a module never reads `x-` members ([cr] §2), so the page can't claim the binding | Exists (producer annotation) |
| Finding owner and due date | `finding.owner_due` holds "Sample placeholder" only | Gap |
| Judge's reasoning | the judgment record's `rationale`. With the mock judge it is a probability sentence | Exists (thin on mock) |
| Transcript | `capsulectl/agent-input-originals/v1`, only when the bundle was built with `--attach-input-originals` | Optional |
| Verification anchors | bundle `checkpoint` (`log_id`, `root`, `mmr_size`), `producer-key/v1`, record count | Exists |

## 3. The hierarchy

The three tiers are [pc] §9.1's three levels. The host creates the regions and
sets the depth; the module fills L0 and L1 and appends to L2 after the core.

**L0, what matters.** One screen. Every figure traces to L1.

1. Statement header: report name (wording pack), contract id and version,
   period, population, requirement count, and the issuer (`operator` and the
   producer key's short id).
2. The sealed aggregate, as is: "216 evaluations of 9 requirements · 54
   excluded as not applicable · 0 unresolved", then the met, not met and not
   evaluable buckets, each labelled with its unit (evaluations). Never
   recomputed.
3. One derived line, with its own unit: Outcomes "30 conversations: 0
   resolved · 29 missed · 1 undecided", where each count opens its list in L1
   (#58 already draws those lists); EU "29 / 30 sessions with at least one
   test not met", from phase 2, when the session grid exists to trace it to.

No assurance strip in L0. [er] §3 is Steven's ruling: "Nothing above the fold
summarizes assurance". No "Verified" pill: the core's banner and #61's
"Contents checked" pill already state it, and [pc] §6.1 says modules don't
restate verification. Decision D5 asks Steven whether he wants the v2 strip
anyway.

**L1, why.**

4. An assurance line at the top of L1, scoped to what the bundle holds:
   judge mock or live (rule D4), "Witness receipts: none in this bundle",
   "Human re-grade records: none in this bundle". Each claim's own tier,
   grade and status stay in its row and drill-down.
5. The rule table (Outcomes) or test table (EU): one row per requirement,
   grouped. EU groups are obligations (article and title), and each test is
   its own row. Every row shows the four counts as "n / N" and a distribution
   bar. No pass rate, no percentage ([cr] §2).
6. EU only: the producer's findings, as text under a fixed label, "Producer's
   findings, presentation text, not evidence". No tally, no severity column in
   the test table, no owner or due column.
7. Phase 2: the case grid, cases by rules, grouped by day, on both pages. A
   drill-down per case shows, per rule: verdict, tier, grade, carrier status,
   the judge's note as the record holds it, the sealed record ids, and the
   transcript when disclosed.

**L2, verify.**

8. The core's verification section, first and unchanged ([pc] §9.1), folded
   or open only by `host.depth`.
9. Then module detail: "Check this report yourself", four anchor cells
   (producer key, log, checkpoint root and size, record count) and the steps.
   The step "compare the root with the log's published checkpoint" shows only
   when a witness receipt exists. Otherwise it says there is no outside
   checkpoint to compare against.
10. Day by day and human re-grades (phase 3), the producer note under its
    label, and the proofs.

## 4. Where this differs from the v2 mocks

The v2 mocks set the direction: header, KPI band, register or scorecard, case
grid, folded proofs. This note keeps that and changes these, so the page
draws only what the records hold and keeps the specs:

1. **The sealed aggregate leads L0.** v2's tiles are derived figures. [cr] §2
   and [er] §3 put coverage and buckets first.
2. **No assurance strip in L0** ([er] §3). It becomes the L1 assurance line,
   unless Steven says otherwise (D5).
3. **No pass rate** ([cr] §2).
4. **No findings tile, no severity column.** Findings are producer
   annotations: text under their label in L1 ([pc] §6). v2's "Act now / Gaps /
   Clear" status is dropped: nothing defines it.
5. **One row per test.** v2 and the live module merge Art 50(1)'s and
   Art 26(1)'s two tests into one row. [cr] §2 makes each requirement a row.
6. **No in-force split yet** (D3). v2's "In force / Binding from 2 Dec 2027"
   sections read the presentation block, a hint.
7. **No "Test not checkable" tile.** Its only sources are producer text or a
   roll-up of one requirement into a status. The row's own not-evaluable
   count, with `row.<ref>.not_evaluable` from the pack, says it.
8. **Absences are scoped to the bundle.** "No re-grade records in this
   bundle", not "no person re-graded".

Rules come before the case grid, as in v2.

## 5. Decisions and one-way doors

- **D1, door, for Steven: statement header fields.** The header shows the
  issuer and the contract, and nothing for "prepared for" or a statement
  number. **Recommendation: keep both closed for now.**
  - "Prepared for" has a two-way route. An evidencebook Close names a
    counterparty book ([book]). [cr] §2 already lets a module "show other
    sealed records of the bundle", so showing a disclosed Close's
    counterparty is a view rule, not a spec change. What it needs is
    producer-side: disclose the Close in the report's closure, and label its
    counterparty as the producer's statement (a Close is a `producer_claim`).
    It gives a book id, not a display name.
  - A statement number, or a display name for the counterparty, has no
    sealed source. It would need a new `presentation/v1` header field, an
    [er] §8 change. A header field can't be withdrawn once published. That is
    the one door here.
- **D2: issuer name.** evidencebook-skills could emit `presentation/v1`
  `producer_name` ([er] §8). No door. Small follow-up.
- **D3: applicability, a hard gate for the EU in-force split.** Until the
  claims carry `applies_from`, the EU page draws every test as in force, as
  the sealed Result says ([er] §4.3: absent means in force), with no split
  and no in-force figures. The work is in evidencebook-skills: the contract
  gains `clause.effective_from`, which is a new contract version after
  0.2.1, and the claims copy it into `applies_from`. One question for Steven:
  the block's conditions ("Annex III high-risk systems only", "contested" for
  Art 86) don't fit a single date. Copying 2 Dec 2027 alone would say those
  obligations bind this system from that date. The note proposes the date in
  the contract clause and the condition in the pack's `row.<ref>.detail`.
  When D3 lands, the split ships as [cr] §2 defines it: its own section,
  readiness labels on every tally, nothing in the buckets, the as-of date and
  the copied-fact note.
- **D4: the judge line fails closed.** "Mock" may be drawn from the model-id
  string, because it weakens the claim. "Live" is never drawn from that
  string. Until evidencebook-skills#26 records the judge mode, the page shows
  the model id under "producer-stated".
- **D5, for Steven: the v2 assurance strip.** v2, which Steven saw, puts
  "Mock judge · No witness · No human review" above the fold. His
  2026-09-22 ruling ([er] §3) says nothing above the fold summarizes
  assurance. **Recommendation: keep the ruling**, with the strip as the first
  line of L1.

## 6. Phases

Each phase is its own PR in capsule-viewer after #58 merges. New wording keys
go to Sherlock2 for copy review.

**Phase 1, level structure and order.** This is not only a visual reorder.
#58 fills one wrapper with its own two toggle levels ([m58]). Phase 1:
- Moves the module onto the host's L0, L1 and L2 regions, takes open state
  from `host.depth`, and appends its L2 detail after the core's section
  ([pc] §9.1). Rebased on #61.
- L0: header, sealed aggregate, the Outcomes per-case line.
- L1: the assurance line, the rule and test tables with "n / N" counts, the
  EU findings under the producer label.
- L2: anchors and steps (step 3 conditional), the producer note, the proofs.
- Wording migration: the EU pack gains `report.*`, `group.*` and `row.*`
  entries, so test names stop coming from the presentation block, plus the
  new keys for the aggregate line, the assurance line and the steps.
- Goldens for both pages change.

**Phase 2, case-first rows.**
- The case grid in L1 on both pages, cases by rules, grouped by day.
- The drill-down per case (§3, item 7). With the mock judge the note is a
  probability, shown as the record holds it, beside the "mock" judge line.
- The EU per-session line in L0, now traceable to the grid.

**Phase 3, day and re-grades.**
- Day by day from the judgments' `period`.
- Human re-grades from `calibration-summary/v1`, with #62's wording.

**Gated separately:** the EU in-force split (D3), the header fields (D1), an
L0 assurance strip (D5).

## 7. Sketches

Both sketches are static pages drawn from the demo bundles' sealed Results:
the aggregate, rows and per-case states are read from the Result, and the
verdicts are placeholders because the judge was a mock. The purple level tags
mark this note's levels and aren't part of the design. Group and row names in
the EU sketch come from the presentation block only because the EU pack has no
`row.*` words yet; the build takes them from the pack.

**Outcomes** (`contract-report-layout/outcomes-sketch.html`):

![Outcomes layout sketch](contract-report-layout/outcomes-sketch.png)

**EU AI Act** (`contract-report-layout/eu-sketch.html`):

![EU AI Act layout sketch](contract-report-layout/eu-sketch.png)

## 8. Rules the build must keep

- L0 starts with the sealed aggregate, as is. Every figure traces to L1.
- Every count traces to the Result or a sealed record; none comes from a
  presentation block ([pc] §6).
- Wording only from the wording pack; depth only from `host.depth`.
- The core's verification section is first in L2 and untouched.
- Producer annotations only under their fixed label, never in L0, and
  without claiming a binding the page didn't check.
- No percentage, no single score, a denominator on every count.
- Each claim keeps its tier, grade and status.
- An absence is stated and scoped to the bundle, never hidden.
