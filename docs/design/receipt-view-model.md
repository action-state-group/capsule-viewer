<!-- SPDX-License-Identifier: Apache-2.0 -->
# One receipt view: `bundle -> receipt view` (design note)

Status: draft for Ethan's decision, capsule-viewer#473. Nothing here is built yet, and no code PR
starts before Ethan has read this note. Read at capsule-viewer `d7e94f9`, evidencebook `6659606`,
evidencebook-skills `b0ec7c0`, capsule-cli `0c060be`, actionstate-site `f5edcf0` and loop `adfaa8c`
(all origin/main on 2026-11-27).

## 1. The problem

Steven asked, in the 2026-11-27 design thread
(buzz://message?channel=0d760ea3-529d-4dec-b309-24184967f8e0&id=68ff0bd40fc3b879cc59421173cf68dc21190c0be4080d50713378be48bb0470&thread=29f39b3dd29d2c1318a1971af542afe0268d52588a881fb9854a9a45aca7eea6),
for a design that is "human readable, easy selective disclosure, and technical depth when needed",
and simpler. Sherlock2's review
(buzz://message?channel=0d760ea3-529d-4dec-b309-24184967f8e0&id=c987ff76613161d16701c7a9dc3fd89e278ee468cddf9cc8f65fadb171af65f4&thread=29f39b3dd29d2c1318a1971af542afe0268d52588a881fb9854a9a45aca7eea6)
found three causes. Checked against the code, each holds, with one correction:

1. **Two renderers draw one page, each with its own words.** The receipt module
   (`go/receipt/receipt_core.js`, generated into five `receipt_<kind>.js` and into
   `ts/src/receipt-core.generated.ts`) draws L0 and its own L1/L2 into the module slot; the generic
   runtime (`ts/src/evidence-graph-view.ts`, built into `go/pageruntime/evidence-graph.iife.js`)
   draws the banner and "How this page was checked" around it. So one page says three check
   counts: the banner's "N of M checks passed" (`evidence-graph-view.ts:461`), "The ten checks"
   (`evidence-graph-view.ts:1040`, AAC's ten) and "Is this record intact?" (capsulectl's checks,
   `go/receipt/wording-en.json:626`). The runtime prints "self-witnessed: no transparency-service
   receipt" (`evidence-graph-view.ts:1347-1352`) beside the module's TIME-STAMPED badge, which reads
   capsulectl's report (`receipt_core.js:3864`). And every record view on a receipt page takes the
   contract-report wording pack (`evidence-graph-view.ts:4259-4262`, `contractReportWords`), which
   is where "accepted this Result's figures as the record of the month" (rung 11) and "Four
   implementations ... pass one vector corpus" come from
   (`ts/src/wording/contract-report-generic.en.json:414`), once per record.
2. **The module has a model, but no contract.** Correction to "no receipt view-model": each kind
   already builds one (`buildDeal`, `receipt_core.js:1786-1860`; `buildReceipt`, `buildSeller`,
   `buildBilateral`, `buildProvider`) and the drawer reads only it. What is missing is that the
   model is private, differs per kind, carries no pointer to where a value came from, and misses
   records: its steps are only `bundle.records` (`receipt_core.js:1948`), so a record the copy
   carries only in `extensions.x-deal-v1.book.relied_on` (the adjudicator's ruling) is never a
   step; a step's text is only its `statements[]` (`receipt_core.js:1961`), so a statement that
   names a ruling draws "-"; and the status card falls back to the agreement's `start.state`
   (`receipt_core.js:3787-3791`), so "Started" stands beside "Ruled".
3. **The holder's own copy leaves out what a person needs.** The agreement holds the offer only
   by digest (`body.offer.digest`); the item reaches the page only as capsulectl's side input
   `deal_offer` in its verifier report (`receipt_core.js:474`, checked by digest at
   `receipt_core.js:1867-1874`, #461), which "Download proof file" does not carry. The seller's
   name is sealed in no deal record (evidencebook#1031). Section 4 says what the copy must carry.

## 2. The receipt view

One function, `receiptView(bundle, verifierReport?) -> ReceiptView`, in capsule-viewer, replaces
the five private `build*` models. It is a pure function over the verified bundle (and, when a
verifier's report is given, that report), run on the page, so it adds nothing a checker must
trust: the view is never written into the bundle and has no signature of its own. It is internal
to capsule-viewer: no published schema, no `spec_version`, so it can change with the viewer.
Every drawer (receipt module L0/L1, runtime L2) reads only the view.

Every value is a `Sourced<T>`:

```
{ value: T, src: { record: <capsule_id>, path: <JSON pointer into that record's pair> }
              | { report: <member of the verifier's report> }
              | { bundle: <JSON pointer into the bundle> } }
```

`record` points into a signed record (its `record`, `header` or `payload`, read only once the
header's digest is the one the record attests and the payload's digest is the header's commitment,
as `dealSteps` checks today, `receipt_core.js:1914-1936`). `report` marks a value capsulectl
reported and the page did not check; the page says so wherever it shows one. A value with no
source is absent, never guessed.

### Fields (x-deal-v1; the v0 and provider kinds map the same way)

Paths below: `A` is the agreement pair `extensions/x-deal-v1/book/agreement`; `R[id]` a pair in
`extensions/x-deal-v1/book/relied_on/<id>`; `S` the sealed report's content
`extensions/x-deal-report/v0/agent_input` (named by `extensions/x-deal-v1/sealed_report`); `O` the
holder's offer record (section 4).

| Field | Depth | Source | Today |
| --- | --- | --- | --- |
| `deal_id` | L0 | `S/deal_id` | `buildDeal` |
| `copy.audience` (keep, counterparty, adjudicator) | L0 | `S/audience` | `buildDeal` |
| `holder.role`, `holder.side` | L0 | `A/payload/body/role`, `/side` | `roleOf` |
| `counterparty.name` | L0 | sealed record per evidencebook#1031 (none yet) | absent |
| `counterparty.key` | L2 | `A/payload/body/counterparty_key` | not drawn |
| `item`, `quantity`, `price`, `currency` | L0 | `O/body/terms/item`, `/quantity`, `/price_minor`, `/currency` | item only, from `report: deal_offer` |
| `outcome` per term: `status`, `value`, `ruling {against, value, remedy}` | L0 | `S/rows/<i>/status`, `/value`, `/ruling` | `dealRow` |
| `waiting_on` per term | L0 | the side whose record the term's `relied_on` lacks (`S/rows/<i>/relied_on/*/side` against `owed_by`) | not derived |
| `money` (each leg, in msat) | L0 | `R[id]/record/settlement/amount` (`value`, `assetCode`, `assetScale`) | `readLeg`; two units today |
| `steps[]`: `record`, `kind`, `side`, `at`, `summary` | L1 | every record in `bundle.records` **and** `R[*]`, once each, ordered by `x-deal-v1/seq` then `at` | `dealSteps` (records only) |
| step `summary` by kind | L1 | agree: `item` via `body/offer`; perform: `body/act`, `/observed`, `/statements`; settle: the leg; statement: `body/statements` and `body/names` (the ruling it names); dispute: `body/row`, `/forum`, `/adjudicator`; ruling: `body/row`, `/against`, `/value`, `/remedy`, `/final`, `/forum` | statements only |
| `agreement.state` | L1 | `S/start/state`, `/by` (the agreement's start, labelled so) | drawn as deal status |
| `as_of` (when the report was cut) | L1 | `S/as_of` | drawn as page time |
| `witness` | L0, L2 | `receipt` (a witness receipt in the bundle, checked), `reported` (`report: book_witnessed`, not in the file), `none` | badge and runtime disagree |
| `checks[]`: `name`, `result`, `by` | L2 | `report: checks` when capsulectl's report is given; else the page's own AAC checks | three lists |
| `withheld` | L1, L2 | `S/rows_state`; steps whose payload the copy does not open; `bundle/completeness/suppressed_fields`, `payloads_mode` | partly |
| `share` (how to make the other side's copy) | L1 | `report: share_commands` (capsulectl names its own command, as it does `verify_command` today) | absent |
| `records[]` (raw) | L2 | `bundle/records`, `R[*]`, `A` | runtime |

## 3. Three depths, two drawers, one view

| Depth | What it shows | Drawn by |
| --- | --- | --- |
| L0 | who, what, how many, how much, the outcome per term with whom it waits on, the witness state, one line on what this copy withholds | receipt module |
| L1 | one line per step, the ruling included, each opening to its sealed fields; the agreement's state; the share line | receipt module |
| L2 | one check list (the view's `checks`, one name per check everywhere), the witness line that matches L0, the ladder once per page, the raw records | generic runtime |

The generic runtime keeps only L2 on a receipt page, and on such a page reads `checks` and
`witness` from the view instead of its own model, so the banner, the check list and the badge
say one thing. Its per-record ladder is drawn once and with the receipt pack, not the
contract-report pack. On a page with no receipt module (a generic AAC bundle) the runtime is
unchanged.

## 4. Selective disclosure

What a copy carries stays capsulectl's rule over the audience (`--share keep|counterparty|adjudicator --to`,
u224: the viewer learns no role rule). The view only says what this copy holds:

- L0 names the audience in words and, when anything is withheld, one line ("This copy, made for
  the seller, leaves out ...") built from `withheld`.
- L1 gives the `share` command capsulectl reported for the other side's copy, so the holder knows
  how to make it. A page without a verifier's report shows none. On x-deal-v1 that copy is a
  bundle, never a page: `deal report --html` refuses any `--share` but keep
  (evidencebook `capsulectl/internal/deal/deal_v1_report.go:54-55`), so the copy is
  `deal report --bundle --share counterparty --to <who>`, and the line also says how the
  recipient opens it as a page.
- A field the copy withholds is absent in the view, never filled from elsewhere; the anti-hardcode
  test below holds that.

### What the holder's own copy must carry (Steven's open (a)-(c), evidencebook#1031)

For the seller's name, the item and the quantity to show at all, the keep copy needs, in the
bundle itself (so the downloaded file shows them too):

1. **The offer record** as a book pair, `extensions/x-deal-v1/book/offer` (today section 9 of
   evidencebook `docs/design/461-deal-profile.md` allows `book` exactly `{agreement, relied_on}`,
   and `dealBook` refuses any other member, `receipt_core.js:1701-1713`). Checked by the
   agreement's `body.offer.digest`. Carries `terms.item`, `quantity`, `price_minor`, `currency`.
   The `deal_offer` side input of #461 then retires.
2. **The seller's name**, sealed by the holder's book bound to the counterparty key, in a record
   the agreement cites (evidencebook#1031; Steven's go pending).
3. **What was delivered** ("150 of 200"): no sealed member holds a delivered quantity today
   (`PerformBody` has `act`, `observed` and a `detail_commitment` only, evidencebook
   `dealprofile/xdealv1/types.go`); the ruling's `value` says only met or not met. Showing it needs
   the seller's perform record in the copy and a quantity member, which is Steven's what.
4. **Steven's (a):** whether the keep copy carries the witness receipt so the badge is checkable
   on the page. With it, `witness` is `receipt`; without it, the page says "reported by
   capsulectl, receipt not in this file". Both are drawn from the one `witness` field.

Items 1 to 3 change what a copy discloses, so they are Steven's one-way doors, asked in the
thread; item 1's shape inside `book` is engineering's once he says yes. Which shared copies carry
them is the same question per audience.

## 5. The anti-hardcode test

Every visible text node in the receipt region is either a wording-pack string or a `Sourced`
value, and every `Sourced` value resolves:

- The drawer tags each value node with its source, reusing the runtime's existing source tags
  (`ts/src/report-legend.ts`, `tagSource`, `data-src` = `pack`, `field`, `payload`, `producer`) and a
  `data-ptr` with the pointer.
- The test renders each fixture, walks the text nodes, and fails on any node that is neither the
  output of a pack key (matched against the pack's templates) nor a tagged value whose pointer,
  resolved in the fixture's bundle or verifier report, gives the shown value.
- A mutation check per fixture: change one sourced member (the item, an amount, a ruling's
  `against`), recompute the digests the fixture tool computes, and assert the page text follows.
- No literal from a fixture (party names, items, amounts) appears in `go/receipt`, `ts/src` or
  any wording pack.

Fixtures: a ruled dispute (from the ARD run's bundle, with a ruling only in `relied_on`), a
clean settled deal (`tests/testdata/deal-v1/keep-copy.bundle.json`), a counterparty copy
(`counterparty-copy.bundle.json`), an adjudicator copy (rows withheld), and the #461 offer copy.

## 6. What retires, and in what order

The caller inventory, with file:line for every row, is on capsule-viewer#473
(https://github.com/action-state-group/capsule-viewer/issues/473#issuecomment-7223549241). What it
means for the retire list:

| Path | Status | Decision |
| --- | --- | --- |
| v1 `v1ReportPage` | live, the demo receipt | keep; it is the page this note rebuilds |
| v0 `dealReportHTML` | live for x-deal-v0 deals only (`deal set-version x-deal-v0`) | **keep**: it is not a second renderer (same emitter, same receipt modules), so the view covers it when the v0 kinds move (PR 4). Removing it removes a released verb for v0 deals, which is Steven's and is not needed for this goal |
| compose `deal compose --html` + eb `deal-view.js` | reachable, no caller outside tests | **retire** under u224, after evidencebook#850; the site installer change goes first |
| eb `capsulectl-deal-en.json` `page.*` | feeds deal-view.js and five v0 keys | retires with compose; the five keys move to the receipt pack |
| book receipts (`--receipts`) | reachable, no caller outside tests; draws v1 receipts with no renderer | keep the flag; it gets the deal kind when the view lands (PR 4). Not on the critical path |
| `deal_share_gate.go` `DealViewJS` strip | no producer | delete with compose |
| Go `go/historyview` | dead, no importer | **retire** (PR 11) |
| frozen Python twin: receipt part | test oracle only | **retire** once the view's goldens and the anti-hardcode test replace it (PR 4) |
| frozen Python twin: `standard_history_card.js` | live: capsulectl's History page (eb ships its go/v0.18.3 copy) | **retire** once capsulectl draws History with the TS `history-view` (PR 10) |
| ebs demo `history_input()` | live | **retire**: the same `bundle -> view` rule applies to the History card. capsule-viewer gets `historyView(bundle)` over an `x-standard-history/v0` bundle (PR 8), so neither the demo nor capsulectl shapes the model |
| contract-report packs on receipt pages | live by accident | stop: receipt pages' record views take the receipt pack (PR 3) |

After this, a receipt has one renderer (the receipt module over `receiptView`, with the runtime
drawing L2 from the same view) and two packs (receipt, History); a History card has one renderer
(TS `history-view` over `historyView`).

## 7. PRs, in order

Sizes: S under 150 changed lines, M 150 to 800, L over 800. A PR that depends on a door waits
for that door only; the rest keep building, stacked where needed.

| # | Repo | What | Size | Waits on |
| --- | --- | --- | --- | --- |
| 1 | capsule-viewer | `receiptView` for the v1 deal kind: extract `buildDeal` and `dealSteps` into the view with `Sourced` values; steps from `records` and `book.relied_on` (the ruling a step); statement `names` and dispute bodies drawn; `start` labelled as the agreement's state; one unit (msat). New ruled-dispute fixture from the ARD run's bundle | M | Sherlock2's wording for new lines |
| 2 | capsule-viewer | the anti-hardcode test (section 5) and the drawer's source tags | M | 1 |
| 3 | capsule-viewer | runtime on a receipt page: L2 reads the view's `checks` and `witness` (one list, badge and line agree), ladder once per page, record views take the receipt pack, the checked section styled as a card | M | 1 |
| 4 | capsule-viewer | the v0 kinds (unilateral, seller, bilateral) and provider onto the view; book receipts get the deal kind; delete the Python receipt oracle and its parity tests | L (mostly deletion) | 2 |
| 5 | evidencebook | the keep copy carries `book.offer` (section 4 item 1, profile section 9 updated); the verifier report gives `share_commands`; `deal_offer` side input retires; bump the capsule-viewer pin | M | Steven's go on section 4 item 1; 1 |
| 6 | evidencebook | the seller's name sealed for the counterparty key (evidencebook#1031) | M | Steven's go on #1031 |
| 7 | actionstate-site, then evidencebook | the installer accepts a deal-view tarball without `deal-view.js`/`.css`; then drop `deal compose --html`, `deal-view.js`, the `page.*` words and the `DealViewJS` strip (u224) | S, then M (deletion) | evidencebook#850 |
| 8 | capsule-viewer | `historyView(bundle)` over `x-standard-history/v0` in TS, the History card drawn from it | M | none |
| 9 | evidencebook-skills | the ARD demo draws History with `historyView` (delete `history_input()`), moves to a released capsule-viewer, and its skill names the `--bundle --share counterparty --to` copy | S to M | 8 and a capsule-viewer release |
| 10 | evidencebook | capsulectl's History page through the TS `history-view` module, replacing the vendored go/v0.18.3 `standard-history` assets | M | 8 |
| 11 | capsule-viewer | delete `go/historyview` and the Python `standard_history` module and its release-go step | M (deletion) | 10 |

loop's vendored `history-view` 0.17.0 (`site/vendor/capsule-viewer-0.17.0`) is loop's to bump
when it next needs it; it is not on this path. A capsule-viewer release after 1 to 3 is the
coordinator's call (asg-rules standing rule 3).

## 8. Doors and gates

- The view is internal to capsule-viewer: no public format, no product meaning; engineering's
  call once Sherlock2 confirms that.
- Section 4 items 1 to 3 are Steven's (what a copy discloses).
- Wording for new lines (the withheld line, the share line, "waiting on", the agreement-state
  label) is Sherlock2's under the wording delegation.
- Ethan reads this note before any PR in section 7 starts.
