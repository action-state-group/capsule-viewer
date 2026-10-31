Contract fixtures for the contract-report module's requirement tiers.

The bundles in `../show-evidence/` are signed copies of evidencebook's
`report/testdata/presentation/4-monthly-outcome` and `5-monthly-compliance`
fixtures. Their claims cite `example-support-outcomes/v1@1` and
`example-ai-act-obligations/v1@0.1.0`, which no compiled contract in
evidencebook-skills matches (`airline-support-outcomes@1.5.0`,
`eu-ai-act-obligations@0.2.2`), and re-sealing them is evidencebook's. These
two contracts take the compiled contracts' shape (`id`, `version`,
`requirements[]` with `id`, `profile`, `statement`, `tier`, `mode`) with the
`id@version` and requirement ids the bundles cite, so a test reads the tier
of every row:

- example-support-outcomes.json: two must-have rules, one informational
  (`resolution.right_change`), one listed with no tier.
- example-ai-act-obligations.json: two must-have tests, one informational
  (`art50.disclosure_before_first_turn`); `art26.allowed_action_rules` is
  not listed.
