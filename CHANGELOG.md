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

- The offline page carries the bundle in a `<script type="application/json">`
  element, and a fixed inline script sets `window.__BUNDLE__` from it with
  `JSON.parse` (the emitter shell and the Go emitter's `shell.html`;
  capsule-viewer#109). The page used to write the bundle as a JavaScript
  object literal, where a `"__proto__"` member became the object's prototype:
  the page verified the bundle without that member, yet could show the
  member's fields as if the record carried them. It now verifies and shows
  what any JSON reader sees. `window.__BUNDLE__` is still set before the
  bootstrap runs, so bootstraps that pass it keep working. Code that extracts
  the bundle from a page by the text `window.__BUNDLE__ = …;` must read the
  JSON element instead.
- The core strip (capsule-viewer#81). On a verified bundle whose root is an
  Evidence Result, the core draws the strip as the first thing in L0, before
  anything a module, a section or a composed layout writes. The strip holds
  the mock-judge mark when a cited report names a mock judge, then the
  Result's sealed coverage, then each bucket's count beside its denominator
  ("of N", the evaluated population). It shows no percentage. The outcome
  and EU cards no longer draw the aggregate or the mock-judge mark
  themselves, and the generic Result page drops its own coverage line. A
  bundle whose root is no Result draws no strip.
- A module is discarded for the "presentation failed" refusal if it puts
  anything before the strip or between the banner and L0, or if it changes,
  moves or hides the strip. On a page with no Result, a module that draws
  the Result's count marks is discarded the same way. Those marks are the
  strip, `data-bucket`, `data-bucket-count` and `data-count-mismatch`.
  Presentation contract §9.1 and contract-report module §2 say so.
- The strip's stylesheet (`CORE_STRIP_CSS`) joins `CORE_RUNTIME_STYLES`.
  The emitters' CSP, `go/emitter/runtime-style-hashes.txt` and the embedded
  snippet's `styleSources` list one more hash; a host page that pins the
  embedded snippet's style hashes must add it.
- Both default contract-report wording packs gain `front.agg.of`
  ("of {n}"), so their digests change. A page built with this version
  records the new digests; a supplied pack layered over a default needs no
  change. A supplied pack is refused if it puts a percentage in any
  `front.agg.*` word the strip draws.
- The outcome and EU frame stylesheets drop their aggregate and mock-mark
  rules, so their CSP hashes change.

### Added

- Show evidence on the contract report (capsule-viewer#83). Every count in
  L1 of both layouts (the Outcomes rules table; the EU summary's "Checked
  in" count and each verdict count its result states) carries a "Show
  evidence" toggle. It lists the records the counted claims cite, each a
  link to its entry in the records section, then any cited digest not
  disclosed in this bundle, how many were counted from a claim that cites
  no evidence, and how many were counted with no claim. The list is in the
  page's HTML, so the static package shows it with no script. A count whose
  claims cite no record in the bundle reads "Unsupported" instead, and one
  that no claim stands behind reads "Interpretation". Clicking inside the
  list leaves the row's own drill-down as it was. Where a host loaded the Show-evidence component
  (`static/show_evidence.js`), opening the toggle also draws each claim side
  by side. Each record's entry in the records section lists the counts that
  cite it, as "Cited by" links back. The default wording packs gain the
  `evidence.*` entries; the ones that say what a page does not show are
  locked.

### Changed

- The Show-evidence component's `side.unsupported` reads "not all disclosed
  in this bundle" rather than "not all in this bundle": a capsule carried
  by a record whose disclosure is withheld reads unsupported, though the
  bundle carries it.
- The page runtime and the npm package depend on
  `@action-state-group/agent-action-capsule` 0.9.0 and
  `@action-state-group/cll` 0.3.0 (were 0.8.0 and 0.2.1), and `go/pageruntime`
  ships a runtime built on them (capsule-viewer#115). AAC's strict verifier
  now checks a signed checkpoint in the browser, so a page whose records and
  checkpoint verify reads verified where it read incomplete ("checkpoint
  signature not checked here", `checkpoint_verifier_unavailable`), and a
  forged checkpoint reads failed. In a page with no SubtleCrypto the
  checkpoint signature is checked too (a forged one reads failed), but strict
  verification does not run there, so the producer signatures stay unchecked
  and the page reads incomplete. The runtime now also bundles `@noble/curves`
  and `@noble/hashes` 2.4.0 (MIT), which cll 0.3.0 uses for the Ed25519
  check; `go/pageruntime/THIRD_PARTY_NOTICES.md` reproduces their license.

## ts 0.3.0 and go 0.3.0 (2026-10-28)

The first release under RELEASING.md's pairing rule: `ts/v0.3.0` is tagged on
this merge, and `go/v0.3.0` follows on the commit that ships its page runtime.
Both state viewer 0.3.0. There was no ts 0.2.0, because the Go module had
already used 0.2.0. Go entries below include changes first tagged in
`go/v0.1.1` and `go/v0.2.0`, which had no CHANGELOG sections.

### Breaking

- The page shell (`renderEvidenceGraph`, the emitter shell and the Go
  emitter's `shell.html`; capsule-viewer#60):
  - Every page has a width and padding: the theme's `--aac-page-width` and
    `--aac-gutter` now default to 60rem and 1rem (they were `none` and `0`),
    and `--aac-page-pad-block` is new. A module's own `.cv-page` drops its
    width and padding inside it. The outcome and compliance cards keep their
    own frame (`#app.cv-shell-chrome`).
  - The verdict is a pill at the top of the page, after the presentation
    header, in the words of agent-action-capsule's presentation contract
    section 6.2 (capsule-viewer#79): one of its five states, drawn from
    AAC's `verificationBanner`, with each line exactly
    `vectors/viewer-core-text/core-text.json`. `data-verify` is `checking`
    while the checks run, then `verified` only for a `valid` verdict,
    `incomplete` when no check failed but some were not run (a bundle with
    unsigned records or an unsigned checkpoint, which earlier read as
    verified), `failed`, or `unable`; the pill also carries `data-verdict`
    and `data-checkpoint`, and a `[data-banner-detail]` line under the bar
    names the verifier's findings. The words "Contents checked" and "Check
    failed" are gone, as are the pill's `role="img"` and `aria-label`: its
    visible line is the whole verdict. A module that changes, moves, hides
    or restyles the banner or its details line while it renders, by its
    nodes or by a stylesheet, is discarded for the `presentation-failed`
    refusal, on the live page and when the static page is built. The static builder's `verification`
    is the same state (`"verified" | "incomplete" | "failed"`, type
    `StaticVerification`), as is its notice's `data-built-verification`.
    An embedded mount (`mountPresentation`) draws the same elements
    (`.cv-shell-bar`, `.cv-pill`, `details.cv-checked`) and leaves their
    styling to its host page: the viewer sets no page-level style on a page
    it does not own.
  - The verification page is folded into one `<details data-checked>`
    section, "How this page was checked", closed when the bundle verified.
    It is now the rendering's last element, with the
    `[data-page="verification"]` section inside it.

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

- `go/pageruntime` ships the page runtime (capsule-viewer#111): the
  `evidence-graph.iife.js` that `ts/scripts/build-iife.mjs` builds, committed
  as built at the commit `pageruntime.Commit` names, as `IIFE` with its
  `SHA256` pin, beside its NOTICE and THIRD_PARTY_NOTICES.
  `scripts/pageruntime.sh` rebuilds it there and compares it byte for byte
  (CI), or refreshes it with `--write`.
- The runtime's global `EvidenceGraph` carries the verifier functions a
  presentation module may call, beside `registerPresentation`:
  `buildResultRoot`, `disclosureOf`, `ed25519Available`, `verifiedPayload`,
  `verifyDisclosureEnvelope` and `verifyProducerEnvelope`,
  agent-action-capsule's own functions re-exported from `ts/src/browser.ts`.
- `go/presentation` declares the report page's block names:
  `CardExtension` (`report-card/v1`), `PresentationExtension`
  (`presentation/v1`) and `ContractReportExtension` (`contract-report/v1`).
- The embedded packaging writes a snippet a host page inlines
  (action-state-group/capsule-cli#254). Given the core runtime,
  `buildPresentation(..., {format: "embedded"})` also returns `html`, the
  snippet `emitEmbeddedHtml` writes. It makes `mount`'s
  `renderEvidenceGraph` call, with the bundle in a JSON data element. It
  also returns `scriptSources` and `styleSources`, the hash sources a strict
  host CSP must allow.
- The Go emitter writes the fragment and embedded packagings
  (action-state-group/capsule-cli#254). `BuildPresentationFragment` and
  `EncodePresentationFragment` write the `aac.presentation-fragment/v0`
  token and refuse an over-long token or URL with `*FragmentTooLargeError`.
  `BuildEmbeddedHTML` writes the embedded snippet. Both match the
  TypeScript builder byte for byte on seeded vectors that the TypeScript
  tests generate (`go/emitter/testdata/fragment-vectors.json`,
  `embedded-vectors.json`).
- The deal receipt modules (unilateral and seller; Python and the module-slot
  scripts) show the errand's journey under "How it went" (capsule-viewer#53):
  one row per move in the sealed report's `journey`, in order, as who moved
  ("You", "Your agent", "The other side") and what, opening to the step it was
  read from. A switch of merchant is the user's move. The words are the
  receipt pack's `journey.*` keys, mirrored from capsulectl's by test, and
  match capsulectl's own deal page for the same bundle. A shared copy and a
  report with no journey show no section.

- The Outcomes rule table draws each requirement of the cited contract that the
  Result's `requirements_covered` leaves out as a "not covered" row, in a group of
  its own (capsule-viewer#96; agent-action-capsule#355). It is in no
  conversation, count, column or sentence on the page, and a card without
  `requirements_covered` is unchanged. New wording keys
  `lines.rules.not-run` and `lines.rules.not-run.h` in the Outcomes pack
  (`@2`, still unreleased). `spec/contract-report-module-v1.md` §2 gains a bullet for it.
- The presentation contract's text, schema, examples and checkers, moved from
  agent-action-capsule at `60a5b11` (agent-action-capsule#379), with every
  public name unchanged: `spec/presentation-contract-v0.md` (without the
  parts that stay in agent-action-capsule, which it cites there: the
  "Verified" gate, the check lists and banner words, the refusal sentence,
  evidentiary words and `sha256-jcs-nonce256`, and I3, in
  agent-action-capsule's `spec/verification-display-v0.md`, and the
  deprecation table, in its `spec/REGISTRY.md` section 14),
  `spec/contract-report-module-v1.md` (sections 2 to 4 of
  agent-action-capsule's `spec/contract-report-v1.md`, which keeps the block),
  `spec/presentation-builder-v0.md`, `schemas/presentation-manifest-v0.json`
  and its examples, `schemas/check_presentation_manifest_examples.py`, and the
  wording-pack half of `schemas/check_contract_report_examples.py`, which
  reads byte copies of agent-action-capsule's Result schema and rendering
  cases pinned by SHA-256 (`schemas/README.md`). The moved text keeps its
  BSD-3-Clause licence (`LICENSE-BSD-3-Clause`). `scripts/check-moved-spec.py`
  checks that the text changed only by its declared edits, and CI runs it and
  both checkers on every pull request.
- A wording pack may not carry a key that begins `core.`: the prefix is
  reserved for the core's own text (presentation contract section 7.4), and
  `$defs/WordingPack` rejects such a pack (`neg-wording-pack-core-key.json`,
  with its mutant, and `wording-pack-core-key-cases.json`). Carried from
  Steven Mih's agent-action-capsule#356, with thanks.
- capsule-viewer now carries the presentation registry runtime, moved from
  agent-action-capsule at `60a5b11` unchanged, names included
  (agent-action-capsule#379): in TypeScript the registry
  (`ts/src/presentation-registry.ts`), the built-in manifests
  (`ts/src/builtin-manifests.ts`) and the fragment packaging
  (`ts/src/presentation-fragment.ts`), exported from the package and used by the
  viewer in place of agent-action-capsule's; in Go the package
  `github.com/action-state-group/capsule-viewer/go/presentation`. The
  presentation-resolution corpus moves with them to
  `vectors/presentation-resolution/`, regenerated byte for byte by
  its generator in `npm test` and run in full by both languages, with the
  agent-action-capsule bundle vectors and manifest examples it reads
  vendored under `ts/test/testdata/aac-vectors/`. The Go module now
  requires agent-action-capsule Go v0.14.0.
- The verification page's extension rows carry `data-interpreter`, the id of
  the interpreter that showed the block, when one did, as
  agent-action-capsule's renderer wrote it (agent-action-capsule#379).
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
  with the default layer and a visible notice. A `verdict.*` or `tier.*`
  word is read through the layout's own key and checked as it is, and may
  not differ from that key in the same pack; the claims' assurance words
  (`status.*`, `grade.*`, `sufficiency.*`) are locked. A Result whose
  claims the card cannot place one by one (claims under more than one
  `contract_ref`, a requirement judged more than once in one conversation,
  claims of another type or id shape) is drawn as the generic Result page
  with a note, so no claim is merged or left out. Tuning details in
  `ts/README.md`. By Jody Edmondson (#58), completed by Ethan Zhang.
- Requires `@action-state-group/agent-action-capsule` 0.8.0 (it was
  0.5.0; 0.6.1 adds the `contract-report` interpreter id, #72, 0.7.0
  exports `verificationBanner`, capsule-viewer#79, and 0.8.0 removes the
  presentation registry and the page renderers that moved here,
  agent-action-capsule#379), which
  carries the `contract-report/v1`
  registration (#352), `out_of_scope`/`applies_from` (#368, #363, 8732264) this release also ports onto `compliance.ts`,
  `compliance-view.ts`, `outcome-report-view.ts` and the generic Result
  page: a judged-out-of-scope claim is its own count, in the population,
  never "met" and never "not applicable"; a claim not yet in force is
  readiness only, outside the population, unless it failed verification.

- One record view in the core (capsule-viewer#76): the check section's
  "Records in this bundle" lists every record once, each with its own
  address `#record-<capsule id>`, its times, seal status and disclosed
  content. Content modules (`ts/src/record-content.ts`) draw content they
  recognise; the conversation module draws chats, and content no module
  recognises is shown as recorded, indented.

### Changed

- One token source (capsule-viewer#71, part 1): `tokens/tokens.json` now
  generates the kit's `TOKENS` and `--cv-*` stylesheet block, the emitter
  shell's `--aac-*` block (Go and TypeScript copies) and the outcome and
  compliance frames' variables, and `tests/test_tokens_sync.py` fails when a
  generated file differs. Emitted pages are byte-identical.

- Go: `presentation` takes the page's verification gate and its reading of
  a producer selection from agent-action-capsule's `go/bundle`
  (`bundle.Verified`, `bundle.VerifyBundleForPage`, in AAC Go v0.14.0)
  instead of carrying copies, so AAC owns the one verification reading
  (agent-action-capsule#379). `presentation.Verified` is removed; use
  `bundle.Verified`. `DescribeBundle` is unchanged.
- With agent-action-capsule 0.8.0 (agent-action-capsule#379), with no
  change on the page:
  - The verification gate is AAC's own `bundleVerified`, which
    `ts/src/presentation-registry.ts` re-exports in place of its copy.
  - AAC's verification page model no longer carries presentation refusals.
    The registry lays them over it: `presentationExtensionRows` replaces the
    row of an extension a refused module requires with its refusal row,
    taking the integrity words from the row's own `integrity`, and
    `presentationRefusalNotices` gives the line for each refused module with
    no row. `PresentationExtensionRow` and `PresentationRefusalNotice` are
    capsule-viewer's own types for them.
  - The deprecated aliases `outcome-report/v1` and `eu-ai-act-compliance/v1`
    keep their reader and their rows: `ts/src/outcome-report-presentation.ts`
    is AAC 0.7.0's reader, and `ts/src/alias-interpreters.ts` defines the
    `outcome-report-card` and `compliance-card` interpreters AAC removed,
    until the alias path is removed here.
  - The page runtime (`dist/evidence-graph.iife.js`) bundles AAC through
    its own browser entry, so the esbuild plugin `ts/scripts/aac-browser.mjs`
    is removed.
- AAC 0.8.0's outcome-report model reads a criterion with no claim as not
  applicable only when the Result's `excluded_not_applicable` accounts for
  every missing claim, and otherwise as the new verdict `no_claim`, a gap
  (agent-action-capsule#355). The outcome card draws a `no_claim` criterion
  in the words of one no judge decided ("could not decide"), counts it with
  the rule's undecided conversations, and names it in the conversation's
  sentence without a judge: "this bundle holds no rule result for {names}"
  (new keys `lines.sentence.undecided.gaps`,
  `lines.sentence.undecided.gap-note` and `lines.pf.verdict.no_claim`, "no
  claim", in the proofs). Such a Result's page changes: those criteria no
  longer read as not applicable.
- The moved spec text cites agent-action-capsule's
  `spec/verification-display-v0.md` and `spec/REGISTRY.md` section 14, now
  that they exist (agent-action-capsule#400), in place of the presentation
  contract sections they came from. The vendored agent-action-capsule files
  are re-copied at `b646f94`, and `scripts/check-vendored-aac.py` pins that
  revision itself (`--print-rev`), apart from the revision the spec text
  moved from.

- "Witnessed by" on the front of both cards says the witnesses are "stated by
  the bundle, not checked here" (SEAMS ruling 12), in place of "as the bundle
  states; this page does not check witness receipts".
- "Witnessed by" on the front of both cards follows agent-action-capsule's
  strict witness status alone, as the banner already did (capsule-viewer#46,
  from evidencebook#115). The contract-report modules now get AAC's strict
  result as `verification.strict`. A receipt AAC passed reads "receipt
  checked here, and it verifies". One AAC could not check keeps "stated by
  the bundle, not checked here". When AAC fails any entry, nothing on the
  line reads as witnessed: it says "not witnessed", and names each failing
  receipt with AAC's reason and counts the entries it cannot read (or, for
  any other failure, quotes AAC's findings). The folded line reads "witness
  receipts partly checked here" when only some receipts passed. A page's
  context has no witness directory, so on today's pages a well-formed
  receipt reads as not checked. The line carries the state in
  `data-witness` (`verified`, `not-checked`, `invalid` or `absent`). New
  locked keys in both default packs: `prov.witness.verified`,
  `prov.witness.invalid`, `prov.witness.failed`, `prov.witness.failed-entry`,
  `prov.witness.invalid.unreadable.one` and `.other`,
  `prov.witness.invalid.findings`, `prov.brief.witness.verified`,
  `prov.brief.witness.partly-checked` and `prov.brief.witness.invalid`. Both packs'
  digests change.
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

- The contract-report page layout (capsule-viewer#75): the mock-judge line
  is a mark under the report title; the provenance line opens the L1 card
  and no longer names the mock judge; every panel starts at one inset
  (`--aac-inset`); count headers stay on one line on wide screens; the EU
  report has the same white header as the outcome report.
- A conversation opens in place inside its card, with close controls at
  both ends and a link to its record (capsule-viewer#76). On a static page
  the card links to the record instead, so each conversation is in the page
  once.

### Fixed

- The verification section's summary line names the signature checks that
  were not run, each by its own words (for example "checkpoint signature not
  checked here"), instead of the fixed "signatures not checked here". Under
  AAC's strict verdict in a browser, where only the checkpoint signature
  cannot be checked, the line no longer says the producer signatures, listed
  as checked beneath it, were not (capsule-viewer#118).
- A report page's "Verified by" line says "plus unreleased changes" after the
  viewer version when the page runtime was built from a commit that no tag
  `ts/v<version>` points at, so a page drawn by code newer than `0.1.0` no
  longer reads as the `0.1.0` release (capsule-viewer#118). A build from the
  tagged release reads as before.
- The banner frame check discards a module that covers the banner with a
  layer the browser hit-tests, or clips it (capsule-viewer#125). After
  comparing computed properties, it hit-tests the centre of every character
  of the bar and the details line that is in view where the reader is. A
  layer of the module's, or a module rule laying out `<head>` or `<style>`,
  found over a character discards the module, unless it paints nothing there
  (a faded-out dialog, an empty container for toasts). The host's own
  elements are passed over. An overlay with `pointer-events: none` is found
  too. Every box that clips the banner, from `<html>` to the banner's own
  elements, may not shrink by more than a scrollbar, wherever the reader has
  scrolled. The bar's place now maps each scroll offset into viewport px
  through the transforms above it, which are compared exactly, instead of
  through the container's size ratio. Nothing is scrolled to measure, so a
  reader's scroll, smooth or not, is left as it was. The whole check runs
  again once the page settles (after the next frame and the timers then
  due), so a toolbar or modal a module opens just after its render returns is
  caught too. The routes capsule-viewer#117 left open are closed:
  - an opaque layer drawn by `head`, `style` or the module's own content;
  - a scrolling host shrunk to zero height;
  - a fractional host height skewing the place bound.

  An honest module now renders while the reader scrolls inside a rotated
  host. Not found:
  - paint the browser does not hit-test (an outline, a shadow, a reflection);
  - a layer whose `pointer-events: none` is set important inline or in the
    module's own cascade layer;
  - a layer over words out of view when the check runs;
  - anything a module draws after the settle.

  The check targets a module's mistakes, not trusted code written to hide the
  banner, which the builder's pin governs (see capsule-viewer#125). The Go
  module ships the runtime built with this fix (`go/pageruntime`).

- The banner frame check discards a module whose stylesheet scales, moves,
  clips or hides the banner by styling `html`, `body` or another ancestor of
  the page root, or pushes the banner's words out of view with padding or a
  border (capsule-viewer#117). Earlier it read only the root, the bar and the
  details line, and not their paddings or border widths, so `transform`,
  `scale`, `translate`, `opacity`, `filter`, `clip-path`, `mask-image`,
  `contain`, margins, paddings, borders or `position` kept the render while
  the banner shrank, left the page or was clipped. It now compares the same
  computed properties on every ancestor up to `<html>`, before and after the
  module renders, and adds `mask-image`, `contain`, the paddings and the
  border widths to what it compares on the banner and the root. On an
  ancestor, `top`, `left`, the vertical margins, paddings, border widths and a
  transform's translation are compared to within the same 9px as the side
  margins, since an embedded host that places its widget with percentages
  moves them when the page grows a scrollbar; `right` and `bottom` are not
  compared there. Because those shifts add up across ancestors, the bar's
  place in the document is bounded too: it may rise by at most 9px and move
  sideways by at most 18px, wherever the reader has scrolled. A host that
  centres a growing widget vertically lifts the banner by itself, and an
  honest module there is discarded (it fails closed). A module that restyles
  `html` or `body` in any other compared property is discarded. The routes it
  left open are closed by capsule-viewer#125 (above).

  The Go module ships the runtime built with this fix (`go/pageruntime`).

- The banner frame check no longer discards a module render when the page
  grows a classic scrollbar (capsule-viewer#113). A computed `auto` side margin
  is its used width, so the shell's centred page root and bar changed by half
  the scrollbar width; the side margins are now compared to within 9px
  instead of exactly. This assumes a classic scrollbar of up to about 18 CSS px;
  at a very low page zoom a module that makes the page scroll can still be
  discarded (it fails closed).

- The deal receipt modules (Python and the module-slot scripts) read a copy
  whose report capsulectl seals as a standalone record in `x-deal-report/v0`,
  on no log (capsule-cli#294; capsule-viewer#104). Earlier they matched no
  module for any copy capsulectl cut since that change. The signature of that
  record is checked by capsulectl verify, not by the module: the module reads
  the report only when the verifier reported its check as passed, and says
  only that reported status.

- The composition section (`composed/v1`) fits the page at 1280px and in
  print (capsule-viewer#57). Its tables were wider than the page because the
  ten-column members table, and the joins and agreement tables, carry
  unbroken 64-hex ids. A value cell may now break anywhere, with the full id
  still the cell's text, and on screen each table sits in a container that
  scrolls sideways instead of widening the page. The section inserts its own
  scoped stylesheet (`COMPOSED_CSS`), so the emitters' CSP lists one more
  core runtime style hash (`go/emitter/runtime-style-hashes.txt`).
- A static page shows every toggle's content when a reader opens it
  (capsule-viewer#67). The builder builds every body still pending before
  it writes the page (rule rows, test rows and their sessions, proofs),
  with the toggles' own builders, keeping each toggle open or closed as
  the depth left it; before, only the records section was built and a
  closed toggle at L0 or L1 opened empty. The static result now returns
  the page's size (`bytes`) and its budget (`limit`): 16 MiB by default
  (`STATIC_PAGE_DEFAULT_BUDGET`), changed with `maxStaticBytes`. A page
  over it is refused as `static-too-large`, and a body the builder cannot
  build as `static-body-unbuilt`; `availablePackagings` reports both.
- The two report notes on tampering (`groups.vd.note`, `lines.rp.tamper`) say
  what a bundle that did not verify now gets: no report, the red "Check
  failed" callout, the checks that failed and each record's id and status,
  with no record content. They said
  the whole page was replaced by a banner, which stopped being true with
  capsule-viewer#74 and #76.
- A capsule id the bundle lists more than once has one entry in "Records in
  this bundle", with one address and a note of how many times it is listed,
  and the summary counts ids, naming listings when they differ; it had an
  entry per listing and only one address.

- The verification page lists `contract-report/v1` as interpreted, shown by
  the page's module, when the contract-report module drew the page; the
  earlier `outcome-report/v1` or `eu-ai-act-compliance/v1` block it drew its
  card from is still listed as interpreted beside it. It read "not
  interpreted" before. Takes agent-action-capsule 0.6.1, which adds the
  `contract-report` interpreter id (agent-action-capsule#377). (#72)

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
