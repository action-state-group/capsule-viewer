# The receipt presentation rules (design note)

Status: capsule-viewer#373, from Steven's hand run of the deal receipt page (deal
998d912, 2026-11-24). One spec for the page capsule-viewer draws and for any other view
of the same evidence, so that no second view forks the wording: the mesh-llm console's
request-evidence components are held to these rules (follow-up issue linked from #373).

A view that shows a receipt, a request's evidence or a verifier's result follows rules
R1 to R8 below. Each rule names the wording keys that carry its words, in
`src/capsule_viewer/receipt_slot/wording-en.json` (the example English pack); a view
that words these lines differently says why in its own spec and sends the text to
Sherlock2 first. The Python twin (`src/capsule_viewer/receipt/`) and the page script
(`src/capsule_viewer/static/receipt_core.js`) draw the same page; `tests/test_receipt_373.py`
and `js-tests/receipt_373.test.js` hold each rule.

| Rule | What a view does | Wording keys | Held by |
| --- | --- | --- | --- |
| R1 top line | Opens with the verifier's outcome and says who reported it, what it tested (each check with its own result, the witness check left to R8) and that the page did not re-check any of it. Never a bare "Verified". | `verify.tested`, `verify.reported` | `test_the_top_line_says_what_the_verifier_tested...`, `test_an_incomplete_result_is_never_worded_as_verified` |
| R2 test money | A payment on a simulated rail (`rail` is exactly `simulated`) is stated once, near the top, and the rail is not repeated per step. | `money.test` | `test_test_money_is_said_once...` |
| R3 plain words | A sealed token (`proceed`, `money.purchase`, `out`, `pay`, `card`, `not_configured` and the like) reads as plain words with its code kept small beside them for checkers; a token with no word is shown as sealed. A long record id is shown in full in its own step and shortened (first 8, last 4) in the one records table. | `value.<fact>.<token, lower case>`, `record.short` | `test_raw_codes_read_as_words...`, `test_records_table_shortens_each_id...` |
| R4 table headers | A one-word column header is never broken across lines ("Ste" over "p"). | none (kit.css `.cv-table th`) | `js-tests/receipt_layout.test.js` (`brokenHeaders`) |
| R5 amounts | Amounts group thousands with a comma, by hand and not by locale ("2,000 msat", "2,000.00 USD"). | none | `test_amounts_group_thousands`, `js-tests/receipt_amount.test.js` |
| R6 times | A sealed instant is said in the reader's time zone where the page has a script ("Oct 27, 2026, 5:09 PM CDT"); a script-free page says it in words in UTC ("Oct 27, 2026, 22:09 UTC") and does not claim the reader's zone. The sealed instant stays on the element (`data-time`). | none | `test_an_instant_is_said_in_utc_words...`, `js-tests/receipt_373.test.js` |
| R7 problems | One section "Problems spotted". When nothing is listed it says "None found." once, not once per side. | `section.anomalies`, `anomalies.none` | `test_problems_are_one_section_with_one_none` |
| R8 time stamp | One sentence about the outside time stamp (the witness receipt), worded about this copy and not about the deal. | `rung.unwitnessed`, `rung.witness_verified`, `rung.witness_failed`, `rung.unreported` | `tests/test_receipt_golden.py` |

## What is not here

- Steven's items on the rules line and on "what you approved" are record fields, not
  presentation: evidencebook-skills#261.
- R6 is met for pages that run a script (the module-slot scripts, `receipt_*.js`). The
  script-free Python page keeps `default-src 'none'` (kit/components.py): a saved page
  that checks nothing and runs nothing is a property worth more than a time format
  (coordinator ruling, 2026-11-24), so it says UTC in words.
- The verifier's bare outcome badge that a host draws above a module (the Python shell is
  covered: a module with `states_outcome` takes its place) is the host's own; the TS page
  runtime and capsulectl are tracked in their own issues.
