<!-- SPDX-License-Identifier: Apache-2.0 -->
# Changelog

All notable changes to capsule-viewer's published packages, the npm package
`@action-state-group/capsule-viewer` (`ts/`) and the Go module
`github.com/action-state-group/capsule-viewer/go` (`go/`), are documented
here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/) once it reaches 1.0.

## Unreleased

### Breaking

- Python `capsule_viewer.ledger`: the page is drawn over an evidence file the
  ledger's producer wrote, such as `capsule-emit bundle LEDGER --all`; the
  viewer no longer builds one. `ledger_bundle()` is removed,
  `check_and_render(bundle, *, source, depth)` takes that bundle instead of
  the ledger's records, and `python -m capsule_viewer.ledger BUNDLE.json`
  reads a bundle file instead of a JSONL ledger. Requires capsule-emit 0.12
  (`capsule-emit>=0.12,<0.13` in the `evidence` and `dev` extras), which
  removes the `permalink.build_bundle` this used (capsule-emit#338).

### Changed

- The outcome report and EU AI Act obligations cards have two levels and no
  more. The summary states what was checked and the result per line in plain
  words. A first toggle on a line lists the conversations behind it in place,
  each one readable as it stands: the result, rule by rule or test by test
  with the test names, and the conversation as a chat (User, Agent, tool calls
  and tool results). A conversation is never a toggle of its own. The second
  toggle is that conversation's proofs: record ids, digests, the judge pin and
  how to recompute. One more second-level toggle at the foot of the page holds
  the proofs for the whole report. No `<details>` sits inside more than one
  other, and a first-level toggle never holds another. Toggle bodies are built
  when first opened, and each conversation's body when it scrolls near the
  view. Shared code is in `report-levels.ts`.
- The missed line still says why conversations missed: the producer's sealed
  reason code by its label in the terms, else the first rule not met, then
  the missed conversations under each reason, inside the same toggle.
- Tool arguments and tool results are shown exactly as sealed. JSON is
  indented only when that changes nothing but whitespace; a number JSON
  cannot hold exactly, a duplicate key or a differently written escape keeps
  the original text.
- A conversation that could not be decided, or where no rule applied, is no
  longer counted as missed. One with no rule result at all reads "could not
  decide", never "no rule applied".
- Results are worded met, not met, did not apply and could not decide. No
  bundle setting chooses the words (presentation contract section 6): the
  grade-ladder set (established, failed, not present, inconclusive, not
  checked) is the module's own vocabulary in `report-levels.ts`, off, for a
  viewer-side wording pack to select once packs reach the modules. A failed
  or unsupported claim reads "failed verification" or "evidence missing", and
  an undecided rule whose report is withheld reads "could not decide" with
  the note that the report is withheld, never "not checked".
- An EU obligation that no session met, with every result undecided, reads
  "Could not be checked" in a neutral tone, never "No exceptions"; a test
  with no result never reads as a pass.
- Pages built from bundles that withhold the reports read the period, the
  case record and the EU tiers from what the bundle does carry, and say the
  judge pin is withheld rather than "not stated". Only withheld reports are
  called withheld; a report that does not match what was sealed, cannot be
  read, or whose capsule is missing or does not check out, is named as such.
  A case taken from the claims (every report withheld) shows its conversation
  as the case every claim cites, never as the conversation the judge read. "Terms locked" and "Agreed with the counterparty"
  are drawn only when a bundle states them.
- Both card stylesheets changed, so `go/emitter/runtime-style-hashes.txt`
  and the Go goldens carry the new CSP hashes.
- Needs the agent-action-capsule release with the outcome report model
  change (model-named case ids, `reportState` and the withheld-report
  helpers, the `cited` transcript state).

### Fixed

- The outcome report counts the criteria each conversation was judged on
  instead of always saying "nine", and fits a 390px viewport: the header
  stacks at narrow widths, and the day calendar keeps each date on one line.
  Ported from agent-action-capsule#323. The Go emitter's CSP hash for
  `OUTCOME_REPORT_CSS` (`go/emitter/runtime-style-hashes.txt`) follows, so a
  page whose runtime carries the new stylesheet is not blocked.

## ts 0.1.0 and go 0.1.0 (2026-10-16)

The first release of the npm package and of the Go module (tag `go/v0.1.0`).

### Added

- The page emitter and presentation builder, moved from agent-action-capsule
  (agent-action-capsule#281) and still pinned to the same Go/TypeScript
  byte-parity goldens and CSP hashes:
  - Go: package `github.com/action-state-group/capsule-viewer/go/emitter`,
    the former `github.com/action-state-group/agent-action-capsule/go/emitter`,
    with the same API. It depends on agent-action-capsule's Go module v0.8.0.
  - TypeScript: `emitEvidenceGraphHtml`, `buildPresentation`,
    `offlineHtmlFromFragment` and the rest of agent-action-capsule's
    `emitter.ts` and `presentation-builder.ts` exports, from the package
    root. The in-browser renderer (`renderEvidenceGraph`) ships bundled as
    `dist/evidence-graph.iife.js`. Bundle verification comes from
    `@action-state-group/agent-action-capsule` 0.1.1, now a dependency, along
    with `@action-state-group/cll`, which that version needs to load.
- The moved files keep their BSD-3-Clause license (`ts/LICENSE-BSD-3-Clause`,
  `go/emitter/LICENSE`).

## ts 0.0.0

A placeholder, published by hand so npm could take a trusted publisher. It
holds no code; see RELEASING.md, "Registry configuration".
