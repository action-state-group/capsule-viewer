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
- The contract-report module's own words moved off the `report.*` prefix
  onto `card.*`: `report.*` is reserved by agent-action-capsule
  spec/contract-report-v1.md section 3 (`report.title`, `report.summary`),
  and the module's own words must stay off every section 3 prefix. A pack
  carrying the old `report.*` keys for the module's own concepts no longer
  reaches them.
- Both default wording packs bump to `@2`
  (`capsule-viewer/contract-report/outcomes@2`,
  `capsule-viewer/contract-report/eu-ai-act@2`); their `wording_sha256`
  changes (#52 adds section 3 enum defaults and the resolved-conversation
  out-of-scope header split). A pinned `@1` digest no longer matches.

### Added

- The contract-report module (`ts/src/contract-report.ts`): one view for the
  Outcomes report and the EU AI Act Results, with the module's own words
  taken from a wording pack (`aac.wording-pack/v0`). Not in the pack: what
  the bundle itself states (the producer's obligation titles and test
  names, in italics; sealed rule wording) and two lines
  agent-action-capsule's outcome model writes (the outcome statement and
  the resolution rule); the module never takes its own words from a bundle
  (presentation contract section 6). Two default packs ship
  with the viewer, never in a bundle: `ts/src/wording/contract-report-outcomes.en.json`
  and `ts/src/wording/contract-report-eu-ai-act.en.json`. A host passes its
  own pack as the page's `wording` (bound by `wording_sha256`, the pack the
  presentation builder already carries); its entries replace the default
  pack's. A pack changes words only: every entry it replaces must keep the
  same `{placeholders}`, two verdicts may not share a word or take another
  verdict's default word, and the grouping is fixed, or the pack is refused and no card is drawn. The lines that say what the page checked
  or didn't, what the bundle withholds or doesn't state, and which text is
  the producer's rather than evidence are locked (`LOCKED_ENTRIES`): a pack
  that rewords one is refused. The presentation builder refuses a pack that
  doesn't fit the selected report, naming every problem, as
  `ts/scripts/render-report.mjs` does; `render-report.mjs`
  draws a page from a bundle with a pack. The grade-ladder word set the cards
  kept behind a code flag (`LADDER_WORDS`, removed) is now just a pack.
- One nesting rule for every report page (SEAMS ruling 11): a level-2 toggle
  inside a level-1 toggle, never deeper (and, in `nestingProblems`, never
  inside another level 2). `nestingProblems` in
  `ts/src/report-levels.ts` and `capsule_viewer.kit.check_nesting` check it;
  both cards pass with every toggle open. The receipts adopt it in #47.
- Golden pages for both cards, closed and fully open
  (`ts/test/goldens/contract-report/`).
- The outcome report and EU AI Act obligations cards carry a short block on
  their front, outside every toggle, that says who judged, who witnessed and
  what verified:
  - **Judged by:** each distinct judge pin the cited reports state, with its
    count (never one picked for all); the model only where every report with
    that pin states the same components and they recompute to it, else why
    no model is shown. Withheld reports read "withheld" with their count,
    reports the bundle does not carry are counted with their judge "not
    stated", and results recomputed by a checker are named as such.
  - **Witnessed by:** the witness receipts in `checkpoint.witnesses` as the
    bundle states them (this page does not check them), else "not stated".
    Placeholder entries and entries that cannot be read are counted, never
    named as witnesses. Then the checkpoint's log id, size and root, and
    whether this page could check its signature.
  - **Verified by:** this page's code, by package name and version, at the
    commit the build was made from (the first 12 hex characters), or
    "commit not stated" when the build didn't supply one, with the
    verifier and its version (`ts/src/viewer-build.ts`, held to the
    installed packages by a test and by the page runtime build), and the
    tool that built the bundle as the bundle's own report names it, which
    this page does not check, with its version or "version not stated".

  Every value comes from the verified bundle or the viewer's build constants
  and is set as text only. Strings from the bundle (model ids, checker refs,
  witness addresses, log id, producer and version) are quoted and capped at
  120 characters, so they never read as the page's own words. New runtime
  style hashes in `go/emitter/runtime-style-hashes.txt` and the Go goldens.
- The contract-report module resolves on `contract-report/v1`
  (agent-action-capsule#352), registered in place of
  `aac.builtin.result-contract-report/v0`, never beside it
  (spec/contract-report-v1.md section 4). It reads section 3's keys
  (`report.title`, `report.summary`, `group.<segment>.title`,
  `row.<requirement_ref>.label`/`.detail`/`.not_evaluable`,
  `verdict.<value>`, `sufficiency.<value>`, `tier.<value>`,
  `grade.<value>`, `status.<value>`), layered over the module's own
  default pack entry by entry: a host layer that does not check (digest,
  shape or fit) is refused and contributes no words, and the card draws
  with the default layer and a visible notice. `row.*`/`group.*` apply
  only when every claim cites one `contract_ref`; a Result citing more
  than one shows raw identifiers. Tuning details in `ts/README.md`.
- Pinned `@action-state-group/agent-action-capsule` to
  `main@db9de0f` (`ts/vendor/agent-action-capsule-db9de0f.tgz`, an
  `npm pack` of that commit), which carries the `contract-report/v1`
  registration (#352), `out_of_scope`/`applies_from` (#368, #363,
  8732264) this release also ports onto `compliance.ts`,
  `compliance-view.ts`, `outcome-report-view.ts` and the generic Result
  page: a judged-out-of-scope claim is its own count, in the population,
  never "met" and never "not applicable"; a claim not yet in force is
  readiness only, outside the population, unless it failed verification.
  Needs an agent-action-capsule ts release carrying #352 (and #368,
  8732264) to drop the vendored tgz for a normal dependency; until then
  this is a one-line `package.json` swap.

### Changed

- "Witnessed by" on the front of both cards says the witnesses are "stated by
  the bundle, not checked here" (SEAMS ruling 12), in place of "as the bundle
  states; this page does not check witness receipts".
- The report proofs name the wording pack that drew the card ("Words"), and
  now every wording layer applied, by digest -- the built-in default's too,
  even on a default-only page. A few default words moved with the rewrite:
  `judge.note.sure`, `lines.hc.lede`, `lines.line.added.help` and
  `lines.line.undecided`; no style changed, so no CSP hash moves.
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
- Tool results are shown exactly as sealed. JSON is indented only when that
  changes nothing but whitespace; a number JSON cannot hold exactly, a
  duplicate key or a differently written escape keeps the original text.
  Tool arguments are shown as the outcome report model hands them over, and
  the page says so: at agent-action-capsule 0.5.0 `transcriptTurns`
  re-serialises them, so a number JSON cannot hold exactly may already be
  rounded. They are never called verbatim.
- A conversation that could not be decided, or where no rule applied, is no
  longer counted as missed. One with no rule result at all reads "could not
  decide", never "no rule applied".
- Results are worded met, not met, did not apply and could not decide. No
  bundle setting chooses the words (presentation contract section 6): the
  grade-ladder set (established, failed, not present, inconclusive, not
  checked) is the module's own vocabulary in `report-levels.ts`, off, for a
  viewer-side wording pack to select once packs reach the modules. A failed
  or unsupported claim reads "failed verification" or "evidence missing", in
  a neutral tone. An undecided rule whose report is withheld reads "could
  not decide" with the note that the report is withheld; one whose report is
  in the bundle but cannot be read says that instead. Neither reads "not
  checked". The ladder never says "established in every session".
- A claim that failed verification, or whose cited evidence is not in the
  bundle, is its own state, never counted as "not met": the outcome card
  shows a "Could not verify" line and, when a bundle has any, its own column
  in the rule table; the EU card counts such sessions apart from the
  exceptions and draws no finding for them.
- An undecided conversation says no rule result was "not met", never "no
  rule was broken": the records do not show that an undecided rule was met.
- An EU obligation reads "No exceptions", in the ok tone, only when every
  one of its tests was met by at least one session. When none of its tests
  could be checked it reads "Could not be checked"; when some could not, the
  pill is neutral and says how many. A test with no result never reads as a
  pass.
- The EU card's obligation pill speaks only for the sealed counts. Whether
  an obligation is in force is the producer's `applicability`, shown in the
  producer's italic line beside the title, never in the pill. The regulation
  named in the heading, finding ids and severities are set as the
  producer's too; an unknown severity gets no colour of its own.
- The proofs say the judge's note is derived from its probabilities only
  when every rationale is the judge's probability line.
- A conversation body built lazily holds no print listener of its own: one
  `beforeprint` listener per page builds the bodies still in it, so a host
  that re-renders the card keeps no old model alive.
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
- Requires `@action-state-group/agent-action-capsule` 0.5.0 (ts), which
  carries the outcome report model change (model-named case ids,
  `reportState` and the withheld-report helpers, the `cited` transcript
  state). `ts/src/record-dating.ts` repeats three of its unexported
  functions until a release exports them.

### Fixed

- The outcome report counts the criteria each conversation was judged on
  instead of always saying "nine", and fits a 390px viewport: the header
  stacks at narrow widths, and the day calendar keeps each date on one line.
  Ported from agent-action-capsule#323. The Go emitter's CSP hash for
  `OUTCOME_REPORT_CSS` (`go/emitter/runtime-style-hashes.txt`) follows, so a
  page whose runtime carries the new stylesheet is not blocked.
- The EU AI Act obligations card dates each session by its cited case record,
  as the outcome card does, instead of by the day its reports were sealed: a
  backfilled record by its `source_asserted_at` ("source says",
  self-attested), with the import time and sealed day in the session's proofs;
  a plain record by its own timestamp; otherwise the sealed day. The header
  says "judged" only for sealed days, and What ran shows the period, the
  sealed days and the outcome card's dating note. Ported from
  agent-action-capsule#193. No style changes, so no CSP hash moves.

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
