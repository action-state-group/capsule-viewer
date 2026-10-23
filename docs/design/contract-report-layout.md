# Contract-report pages: information hierarchy and layout (design note, not built)

Status: design only. No module code, no wording pack and no golden change.
This note fixes the information hierarchy and visual clarity of the two
contract-report pages, Outcomes and EU AI Act. It maps every page element to
the evidencebook record it comes from, ranks the elements, and phases the
work. Code waits on two gates: capsule-viewer#58 must merge, and Steven sees
this layout direction first.

Ethan's direction: separate primary from secondary information, and make the
visual design clear. The earlier invoice-style statement mocks predate
evidencebook and deal, so this note does not copy them; it adapts to what the
records hold. It starts from Sherlock2's v2 mocks, which Steven has seen.

## Sources

| Ref | Repository @ commit | Path |
| --- | --- | --- |
| [pc] | agent-action-capsule @ `17f0c9f7e56a6d019c6bb50b0cbfc9da9d57b6e5` | `spec/presentation-contract-v0.md` §6 (the chrome rule; producer annotations "never in L0"), §6.1 (the core verification page is drawn after every module) |
| [cr] | agent-action-capsule @ `17f0c9f` | `spec/contract-report-v1.md` §2 (summary first; "no percentage and no single score"; applicability section), §3 (wording keys) |
| [er] | agent-action-capsule @ `17f0c9f` | `spec/evidence-result-v0.md` §4.3 (`applies_from` on a claim), §8 (`presentation/v1` header fields: producer name, logo, title; never data) |
| [m58] | capsule-viewer @ `99007797b3714d95d3969f165613ff0ebda18fd7` (PR #58 head) | `ts/src/outcome-report-view.ts` (`renderProducerNote` line 209), `ts/src/report-provenance.ts` (`judgeLine`, `witnessLine`, `verifierLine`), `ts/src/wording/contract-report-outcomes.en.json` (`lines.hc.*`) |
| [shell] | capsule-viewer @ `c48de50` (main, #61) | the shell's folded "How this page was checked" section. #58's head does not include it yet. |
| [ebs] | evidencebook-skills @ `757abc33b65d22e462d7ffc0b0c7aa2d4048570d` | `demo/eu-ai-act-obligations/presentation.json` (obligations, `applicability`, per-row `finding`), `scripts/wire_presentation.py` (`x-presentation-digest`, the producer note) |
| [bundle] | the tau2 demo bundles (30 sessions, 2026-10-01..03, mock judge) | observed fields of the disclosed records, listed in §2 |
| [v2] | Sherlock2's v2 mocks, Buzz `46aa2888`, screenshots `48c3b67e…png` (EU) and `73ff64fe…png` (Outcomes) | layout this note starts from |

## 1. What the pages do today

Rendered from the demo bundles with #58's module ([m58]). Top to bottom:

| Order | Outcomes page | EU AI Act page |
| --- | --- | --- |
| 1 | Producer note, "Added by this report's producer" | Regulation title as the page heading |
| 2 | "Outcome report" header with the conversation counts | "What was checked and what we found": one table per obligation, each with a "Show the N sessions" drill |
| 3 | "Results rule by rule": 9 rows, each with a drill | Proofs (method, test wording, what ran) |
| 4 | Day by day, Human spot checks, Proofs | Verification: receipts, a 745-record list, the ten checks, extensions |
| 5 | Verification: the same raw dump, 707 records | |

The answer to "how did the agent do" sits in the rule tables, and both pages
end in the full core verification dump. The producer note opens the Outcomes
page, although [pc] §6 says a producer annotation is shown "never in L0". On
Outcomes, the day view shows one tile dated 2025-06-05, because it groups by
the case records' own dates; the judgments' `period` says 1, 2 and 3 Oct.

## 2. Where each element comes from

**Exists** means a sealed record or the verifier's own result in the bundle
holds it today. **Gap** means nothing sealed holds it. **Door** means filling
it needs an AAC spec change, which §5 flags.

| Element | Source | State |
| --- | --- | --- |
| Report name | wording pack `report.title`, keyed by the claims' `contract_ref` ([cr] §3); the Result's `view.title` as fallback | Exists |
| Contract id and version | every claim's `contract_ref` (`eu-ai-act-obligations@0.2.1`) | Exists |
| Period | the judgment records' `period` (`day:2026-10-02`), first to last; the Result's `generated_at` as the as-of date | Exists |
| Population | distinct case ids in the claim ids (`<case>::<rule>`) | Exists |
| Issuer | each record's `operator` (`tau2-demo`) and `producer-key/v1`. `presentation/v1` defines `producer_name` ([er] §8), but evidencebook-skills doesn't emit it | Partial |
| Subject ("Airline support agent") | nothing sealed | Gap |
| "Prepared for" | nothing in this bundle. A Close names a counterparty, but here it is a sample placeholder and the Close isn't disclosed | Gap → Door |
| Statement number | nothing | Gap → Door |
| Verified | the core's ten checks, run by the page when it opens | Exists |
| Judge: live or mock | the judgment record's `judge_pin` model id, which today only says "(mock backend …)" in a free string. evidencebook-skills#26 asks for a recorded judge mode | Partial |
| Witness | checkpoint receipts. There are none here, which the page shows as "No witness" | Exists (as absence) |
| Human re-grades | `calibration-summary/v1` records. There are none here (capsule-viewer#62) | Exists (as absence) |
| Outcome KPIs (resolved, missed, undecided) | the claims' verdicts grouped per case, with the all-required rule | Exists |
| Undecided rule checks | claims with `not_evaluable`, out of all evaluations | Exists |
| EU in-force vs later | should be each claim's `applies_from` ([er] §4.3). The claims carry none today, so the only source is the presentation block's `applicability` ([ebs]) | Gap (evidencebook-skills follow-up, no door) |
| Rule and obligation rows | claims grouped by `requirement_ref` ([cr] §2) | Exists |
| Rule wording | the wording pack's `row.<ref>.label` and `.detail` | Exists |
| Severity, recommendation (EU findings) | the presentation block's per-row `finding`, sealed by digest in the Result (u553) | Exists, producer's |
| Finding owner and due date | `finding.owner_due` holds "Sample placeholder" only | Gap |
| Per-case verdicts | claims, plus the disclosed judgment record (`verdict`, `tier`, `judge_pin`, `rationale`, `source_capsule_id`) | Exists |
| Judge's reasoning | the judgment record's `rationale`. With the mock judge it is a probability sentence, not reasoning | Exists (thin on mock) |
| Transcript | `capsulectl/agent-input-originals/v1`, only when the bundle was built with `--attach-input-originals` | Optional |
| Verification anchors | bundle `checkpoint` (`log_id`, `root`, `mmr_size`), `producer-key/v1`, record count | Exists |

## 3. The hierarchy

Three tiers, the same on both pages. Depth (which levels start open) comes
only from the host ([pc] §6), so the tiers map to levels, not to hidden logic.

**Primary, L0, the first screen.** Who and what, the assurance, and the result.

1. Statement header: report name, contract id and version, period, population.
2. Assurance strip: Verified, judge (live or mock), witness, human re-grades.
   Each is a fact from §2, not a producer claim.
3. KPI band, every figure with its denominator:
   - Outcomes: resolved / N, missed / N, undecided / N, and undecided rule
     checks / all evaluations.
   - EU: in-force obligations with a gap / in-force, sessions with an
     in-force gap / N, obligations binding later, tests not checkable on
     this data.

**Secondary, L1.** Why.

4. The rule table (Outcomes) or obligations register (EU): one row per
   requirement, grouped (by check, or by in force / binding later), with a
   distribution bar and the four counts. No pass rate ([cr] §2).
5. EU only: the producer's findings, under a fixed "Producer's findings, not
   judged evidence" label (§4.3).
6. Phase 2: the case grid, one row per session or conversation and one
   column per rule, with a drill-down into the sealed records.

**Tertiary, L2, folded.** For checking and auditing.

7. Day by day and human re-grades (phase 3).
8. "Check this report yourself": four anchor cells (producer key, log,
   checkpoint root and size, record count) and four steps. The core's
   verification page folds under it, using the shell's existing fold
   ([shell]).
9. The producer note and the proofs: method, test wording and what ran.

## 4. Where this differs from the v2 mocks

The v2 mocks set the direction: header, status tags, KPI band, register or
scorecard, case grid, folded proofs. This note keeps that and changes five
things so the page draws only what the records hold.

1. **No pass rate.** The Outcomes mock has a "Pass rate" column. [cr] §2:
   "There is no percentage and no single score". Rows show the four counts
   with the denominator.
2. **No findings in the KPI band.** The EU mock's "11 open findings, 3 H 6 M
   2 L" tile is a producer annotation, and [pc] §6 keeps those out of L0.
   Findings move to L1 under the producer label. The KPI band uses only
   figures counted from claims.
3. **The producer's severity stays labelled as the producer's.** Severity and
   recommendation come from the presentation block. u553 seals them by digest
   in the Result, so they are signed, but they are the producer's
   assessment, not a judged verdict. The register shows severity in a column
   headed "Producer severity". The mock's "Act now / Gaps / Clear" status is
   dropped: it is a new status derived from producer severity and
   applicability, and nothing defines it.
4. **No owner or due column.** The pack carries only a sample placeholder.
5. **Distinct sessions.** "Sessions with a gap" counts distinct sessions per
   obligation. The live module sums tests: Art 26(1) shows 19 there, against
   17 distinct sessions. The v2 mock already counts distinct sessions.

The mocks also put the day view and the case grid first, ahead of rules.
This note keeps rules first, because the rule table answers "where did it
fail" in nine rows, and the grid needs 30 rows to say the same.

## 5. Decisions and one-way doors

- **D1, door: statement header fields.** "Prepared for", a statement number
  and a subject line are producer claims with no sealed source. `presentation/v1`
  allows only producer name, logo and title, and [er] §8 forbids data in
  `view`. Showing them needs new sealed fields: either new `presentation/v1`
  header fields (an [er] §8 and [pc] §6 change), or a sealed record such as
  the Close's counterparty in the bundle's closure. Either is an AAC spec
  change, and once published a header field can't be withdrawn. **For
  Steven.** Until then the header shows only the issuer (record `operator`)
  and nothing for "prepared for".
- **D2: issuer name.** evidencebook-skills could emit `presentation/v1`
  `producer_name` today ([er] §8 defines it). No door. Small follow-up.
- **D3: `applies_from` on claims.** evidencebook-skills should copy each
  obligation's applicability into its claims' `applies_from` ([er] §4.3), so
  the in-force split reads from the claims and not from the presentation
  block. No door: the field exists. Follow-up in evidencebook-skills.
- **D4: judge mode.** "Mock judge" today rests on a free model-id string.
  evidencebook-skills#26 already asks to record the judge mode. The strip
  waits on it or reads the string, labelled as the producer's.

## 6. Phases

Each phase is its own PR in capsule-viewer after #58 merges, with Sherlock2's
copy review for new wording keys.

**Phase 1, layout only.** Same data, new order and styling.
- Statement header, assurance strip and KPI band at the top (§3, 1 to 3).
- Rule table and register restyled with distribution bars and counts. No
  percentages.
- Producer note moved to L2 under its fixed label; EU findings to L1 under
  the producer label.
- Verification: anchor cells and steps, with the core page folded.
- Rebase on #61 so the shell's fold is in.
- New wording keys for the KPI labels and the strip go through Sherlock2.

**Phase 2, case-first rows.** The case grid and drill-down.
- One grid per page, cases × rules, grouped by day.
- A drill-down per case: per rule, the verdict, tier, judge pin, rationale,
  and the sealed record ids. The transcript shows when the bundle carries it;
  otherwise the page says it wasn't disclosed.
- With the mock judge the rationale is a probability. The drill-down shows it
  as the record holds it and says the judge was a mock. It never makes
  reasoning up.

**Phase 3, day and human-check view.**
- Day by day from the judgments' `period`, not the case records' dates.
- Human re-grades from `calibration-summary/v1`, with #62's empty-state
  wording.
- An as-of line when any claim carries `applies_from` ([cr] §2).

Not in any phase: D1's header fields, which wait for Steven.

## 7. Sketches

Both sketches are static pages drawn from the demo bundles' sealed Results:
every count is read from the claims, and the verdicts are placeholders
because the judge was a mock. The tier tags (Primary L0, Secondary L1,
Tertiary L2) mark this note's hierarchy and are not part of the design.

**Outcomes** (`contract-report-layout/outcomes-sketch.html`):

![Outcomes layout sketch](contract-report-layout/outcomes-sketch.png)

**EU AI Act** (`contract-report-layout/eu-sketch.html`):

![EU AI Act layout sketch](contract-report-layout/eu-sketch.png)

## 8. Rules the build must keep

- Every number traces to claims or a sealed record ([cr] §2). No figure comes
  from a presentation block.
- Wording only from the wording pack, depth only from the host ([pc] §6).
- Producer annotations only under their fixed label, never in L0.
- No percentage, no single score, and denominators on every count.
- An absence (no witness, no re-grade, no transcript) is stated, never hidden.
