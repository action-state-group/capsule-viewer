# Adjudications page: design (v0)

Status: built for capsule-viewer#121. Draws Outcomes frame 4 (Adjudications) of
the Terms Pack report pages canvas as the canvas shows it, from the records a
bundle carries. The module is `capsuleviewer.adjudications/v0`
(`src/capsule_viewer/static/adjudications_card.js`, a module-slot script, so
Muse can vendor it; its package is `src/capsule_viewer/adjudications/`).

## Input

An `evidence-bundle/v2` with an `x-adjudications/v0` block (closed: `own: true`
marks the holder's own preview, drawn in the second person; a shared copy is
drawn in the third) and the AAC judge records, read by `record_version` from each
record's disclosed `agent_input`:

| Record | Read for |
| --- | --- |
| `calibration-summary/v1` (`schemas/judge/calibration-summary-v1.json`) | each clause's `agreement` k of n: the strip, By term |
| `human-rating/v1` | rater (`rater_ref`), `label`, `rated_at`, the report it cites (`case`): By adjudicator, the rows |
| `evaluation-report/v1` | the judge's verdict and `judge_pin.model_id` for the one case a rating cites; judged verdicts (met and not met) for the first tile's denominator; the act it grounds on, for "task N, trial M" |

Counting follows the weekly run: a rating counts when it and the judge's verdict
are both `met` or `not_met`. The page recounts the ratings against the report
cases and compares the result with the summaries' k and n; a mismatch draws none
of its counts. Without ratings in the bundle the page draws the summary and says
the records are not there; the recount reads "not checked here". The only
percentage drawn is computed from the k and n beside it (rounded half up in
integers) and never stored. A summary with n = 0 draws "No adjudication was
sampled", never 0%.

## What the canvas draws that the bundle cannot carry (producer gaps)

Named on the page, never faked:

| Canvas element | Why it is absent | Gap |
| --- | --- | --- |
| The judge's quoted words, "cites turns", rationale digest | an `evaluation-report/v1` case holds a verdict, not a rationale | agent-action-capsule: no record carries the judge's rationale |
| The adjudicator's quoted words, minutes on the record, turns cited | `human-rating/v1` holds `label` only | agent-action-capsule: no record carries an adjudicator's words |
| Rows grouped under their term | a report case carries no `clause_ref` | agent-action-capsule: a judged case does not name its term |
| Term wording, Judged / Informational chips, "of 244" per term | a clause is named by `clause_ref` only | agent-action-capsule / evidencebook-skills |
| Adjudicator book and controller | `rater_ref` is opaque by schema | evidencebook-skills: the roll-up must resolve it |
| CORE line's period, sample policy, "20% of not-met" | a calibration summary has no period; `sample-manifest/v1` is not read yet | follow-up |
| A monthly bundle that carries these records | the roll-up does not cite them | evidencebook-skills#73, evidencebook#168 |

The page's goldens (`tests/goldens/adjudications-*`) come from fixtures built in
`js-tests/adjudicationsFixture.js` from the AAC shapes, not from a producer's
bundle, until evidencebook#168 lands.

## Words

All strings are in `adjudications/wording-en.json`, compiled into the script
(pack `capsuleviewer.wording.adjudications-en/v0`). They are public text for
Sherlock2's wording review.
