<!-- SPDX-License-Identifier: Apache-2.0 -->
# The receipt module's view model: fix `buildModel`, retire the duplicates (design note)

Status: draft for Ethan's decision, capsule-viewer#473. Nothing here is built yet, and no code PR
starts before Ethan has read this note. Read at capsule-viewer `d7e94f9`, evidencebook `6659606`,
evidencebook-skills `b0ec7c0`, capsule-cli `0c060be`, actionstate-site `f5edcf0` and loop `adfaa8c`
(all origin/main on 2026-11-27).

**Where this sits.** This note does not add a second presentation spec. PRD_VIEWER_PRESENTATION
v1.2 (actionstate-muse `docs/PRD_VIEWER_PRESENTATION.md` at `bbfc5ca`) already says each module
builds one view model from the verified bundle, derived and never sealed (§14.1), that L1 and L2
are flat sibling panels with no workflow controls in the HTML (§15.1 items 2 and 3), and that
disclosure is built before rendering (§15.2). This note applies those rules to the receipt and
History pages capsulectl and the ARD demo make today, with one owner change Steven has ruled:

- **The owner (u476, amended by u562).** PRD §14.2 and Steven's ruling u476 (ops
  `proprietary/inbox.md`, 2026-10-19, capsule-viewer#40) gave the view-model JSON to the Muse
  plugin. Steven amended it on 2026-11-27 (u562, ops commit `2438384`,
  buzz://message?channel=0d760ea3-529d-4dec-b309-24184967f8e0&id=5a60bef478fb02a319569eac19c7746733327a34fd787ce40b2719d18746c1f5):
  Muse is a host like Goose; the view-model shape for the neutral profiles (receipt, History,
  Results) lives in capsule-viewer's `buildModel`; the Muse plugin runs that same `buildModel` and
  only emits its JSON into Muse chat, with no Muse-only receipt or History code. This note is the
  capsule-viewer side of that. Sherlock2 also proposes folding this
  review's rules (its C11 to C18) into the PRD as v1.3
  (buzz://message?channel=0d760ea3-529d-4dec-b309-24184967f8e0&id=27cb5e160d6571767e6bf3e9495366bd5cad6e4a13f53109086802e31e3f2185&thread=29f39b3dd29d2c1318a1971af542afe0268d52588a881fb9854a9a45aca7eea6); if that lands, the PRD is the
  spec and this note is its implementation plan.

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

## 2. The view model: the receipt module's `buildModel`

No new function. The view model already exists: it is the receipt module's `buildModel(context)`
of the presentation contract (PRD §3 and §14.1; `receipt_core.js:4615`, which returns `build`, and
through it `buildDeal`, `buildReceipt`, `buildSeller`, `buildBilateral` and `buildProvider`), and
`render(model, host)` draws L0, L1 and L2 from it. Searched before proposing anything new:
capsule-viewer `go/receipt`, `ts/src` (the runtime's own modules also implement `buildModel`,
`evidence-graph-view.ts:2405-2705`), `docs/design`, and actionstate-muse's PRD. This note fixes that
`buildModel` in place: one model shape across the five kinds, every value carrying its source, and
the records it misses today. It is a pure function over the verified context (and the verifier's
report when one is given), never sealed, so it adds nothing a checker must trust (PRD §14.1). It
has no published schema and no `spec_version`, so it can change with the viewer; whether it lives
in capsule-viewer is ruled (u562, above). The module's drawers read only this model;
the core's banner and its part of L2 stay the core's (section 3).

`buildModel` keeps its input: the verified context plus the checked inputs the page is given
beside the bundle (capsulectl's verifier report, the countersigned copy and its signers, the
holder's offer while `deal_offer` lasts), so nothing the page draws today is lost.

Every value is a `Sourced<T>`:

```
{ value: T, src: { record: <capsule_id>, path: <JSON pointer into that record's pair> }
              | { report: <member of the verifier's report> }
              | { checked: <a side input the page checked itself, e.g. countersigned> }
              | { bundle: <JSON pointer into the bundle> } }
```

`record` points into a signed record (its `record`, `header` or `payload`, read only once the
header's digest is the one the record attests and the payload's digest is the header's commitment,
as `dealSteps` checks today, `receipt_core.js:1914-1936`; or, for a pair sent whole, `{record,
agent_input}` such as the sealed report or the carried offer, its `record` or `agent_input`, read
only once `agent_input`'s digest is the one the record attests). `report` marks a value capsulectl
reported and the page did not check; the page says so wherever it shows one. `checked` marks a
side input given beside the bundle that this page checked in the browser and put into the verified
context (the countersigned copy and its signers, `ts/src/verifier-report.ts:418-457`,
`withVerifierReport`), attributed as the page's own check. A value with no
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
| `item`, `quantity`, `price` | L0 | `O/body/terms/item`, `/quantity`, `/price_minor` with `/currency` (the price in the offer's own currency, never converted to the leg's unit) | item only, from `report: deal_offer` |
| `outcome` per term: `status`, `value`; `ruling {record, against, value, final, remedy_due}`; whether a remedy was made | L0 | `S/rows/<i>/status`, `/value`, `/ruling` (evidencebook `dealprofile/xdealv1/report.go`, `ReportRuling`), `/remedy`, `/remedy_made` | `dealRow` |
| `ruling.ordered` (what the ruling orders: kind, amount, currency, due) | L0 | the ruling record `R[S/rows/<i>/ruling/record]/payload/body/remedy` | not drawn |
| `waiting_on` per term | L0 | a member capsulectl's report adds to the row (PR 5); the model never derives it, so the viewer invents no status rule | absent ("Waiting for the other side" with no who) |
| `money` (each leg) | L0 | `R[id]/record/settlement/amount`, `/received`, `/receive_fee` (each `value`, `assetCode`, `assetScale`, as `readLeg` keeps them today; the seller's step reads `received`), each shown once in its recorded asset, never converted | `readLeg`; "1 sat" over "1,000 msat" today |
| `steps[]`: `record`, `book` (holder, other side, adjudicator), `kind`, `side`, `at`, `summary` (`at` on the keep copy only, see section 4) | L1 | every record the copy carries, once each by Capsule id: `bundle.records`, `A`, `R[*]`, and on a full adjudicator copy `book/records` and `book/received/records` (evidencebook `dealprofile/xdealv1/report_bundle.go`, `ReportBook`). Ordered causally on every copy, since shared copies carry no times (section 4) and `seq` orders only within one book: the agreement first, then each record after every record it cites, records of one book by its `seq`; the keep copy breaks remaining ties by `x-deal-v1/at` | `dealSteps` (records only); `dealBook` refuses `records` and `received` |
| step `summary` by kind | L1 | agree: `item` via `body/offer`; perform: `body/act`, `/observed`, `/statements`; settle: the leg; statement: `body/statements` and `body/names` (the ruling it names); dispute: `body/row`, `/forum`, `/adjudicator`; ruling: `body/row`, `/against`, `/value`, `/remedy`, `/final`, `/forum` | statements only |
| `agreement.state` | L1 | `S/start/state`, `/by` (the agreement's start, labelled so) | drawn as deal status |
| `as_of` (when the report was cut, never claimed as a witnessed time) | L1 | `S/as_of` | drawn as page time |
| `witness` | L0, L2 | keep copy only: `reported` (`report: book_witnessed`, worded "as capsulectl verify reported on your own book; this page did not check it", u219) (no witness receipt in any copy, u561 item 4); else `none`. Absent on counterparty and adjudicator copies | badge and runtime disagree |
| `checks[]`: `name`, `result`, `by` | L0 (cited) | the core's result: `report: checks` when capsulectl's report is given, else the page's own AAC checks; the core draws the list (section 3), the model only cites it | three lists |
| `countersigned` (a countersigned copy, its signers, whether each is independent) | L0, L2 | the checked inputs the page is given today beside the bundle (`checked: countersigned`, `countersigned_copy`; evidencebook `deal_v1_page.go:62-102`, injected by `withVerifierReport`), kept as they are | `pageAssurance` |
| `withheld` | L1, L2 | `S/rows_state`; steps whose payload the copy does not open; `bundle/completeness/suppressed_fields`, `payloads_mode` | partly |
| `share` (how to make the other side's copy) | L1 | `report: share_commands` (capsulectl names its own command, as it does `verify_command` today); drawn as words and command text only | absent |
| `records[]` (raw) | L2 | the same deduplicated collection `steps[]` reads (`bundle.records`, `A`, `R[*]`, `book/records`, `book/received/records`), so every step has its raw record | runtime |

## 3. Three depths, two drawers, one model

| Depth | What it shows | Drawn by |
| --- | --- | --- |
| L0 (always visible) | who, what, how many, how much, the outcome per term with whom it waits on, the witness state, one line on what this copy withholds | receipt module |
| L1 | one line per step, the ruling included, each opening to its sealed fields; the agreement's state; the share line | receipt module |
| L2 | the core's part first (contract §9): one check list, the witness line, the ladder once per page; then the module's appended detail (raw records) | generic runtime (core), then receipt module |

L1 and L2 are flat sibling panels, never a panel inside a panel (PRD §15.1 item 2). The generic
runtime's part of L2 stays the core's: a module "MUST NOT replace, reorder or reword it" and
may only append after it (`spec/presentation-contract-v0.md:729-731`), and the banner takes no
module data. So the direction is core to module, never the reverse: capsulectl's checks and its
witness report reach the core through the existing `verifierReport` option to
`renderEvidenceGraph` (`ts/src/evidence-graph-view.ts:2903`, read at :3622-3625), the core draws
the one check list and the witness line from them, and the module's L0 badge cites the core's
result, so the banner, the check list and the badge say one thing. Its per-record ladder is drawn once and with the receipt pack, not the
contract-report pack. On a page with no receipt module (a generic AAC bundle) the runtime is
unchanged.

## 4. Selective disclosure

What a copy carries stays capsulectl's rule over the audience (`--share keep|counterparty|adjudicator --to`,
u224: the viewer learns no role rule). The model only says what this copy holds:

- L0 names the audience in words and, when anything is withheld, one line ("This copy, made for
  the seller, leaves out ...") built from `withheld`.
- L1 gives the `share` command capsulectl reported for the other side's copy, so the holder knows
  how to make it: words and a command to copy, never a button or a link that acts (PRD §15.1
  item 3; Sherlock2 retracted its page action for this reason, 27cb5e16 item 2). A page without a
  verifier's report shows none. On x-deal-v1 that copy is a
  bundle, never a page: `deal report --html` refuses any `--share` but keep
  (evidencebook `capsulectl/internal/deal/deal_v1_report.go:54-55`), so the copy is
  `capsulectl deal report --deal <id> --bundle <file> --share counterparty --to <who>`, and the
  line also gives the command the recipient opens it with; PR 5's acceptance runs both.
- A field the copy withholds is absent in the model, never filled from elsewhere; the anti-hardcode
  test below holds that.
- Witness evidence follows u219, u225, u238 and u239 (ops `evidence-network/inbox.md`,
  2026-11-25): counterparty and adjudicator copies show no witness time, no record time and no
  named-witness column, so on those copies the model leaves `witness`, `steps[].at` and the
  relied-on times absent; the keep page keeps its attributed witness line.
- The counterparty copy keeps item, amount and order number and withholds names, payees and
  contact (u499, ops `proprietary/inbox.md`, 2026-10-22, ruled for x-deal-v0 copies).

### What the holder's own copy must carry (Steven's open (a)-(c), evidencebook#1031)

For the seller's name, the item and the quantity to show at all, the keep copy needs, in the
bundle itself (so the downloaded file shows them too):

1. **The offer record** as a book pair, `extensions/x-deal-v1/book/offer` (today section 9 of
   evidencebook `docs/design/461-deal-profile.md` allows `book` exactly `{agreement, relied_on}`,
   and `dealBook` refuses any other member, `receipt_core.js:1701-1713`). Checked by the
   agreement's `body.offer.digest`. Carries `terms.item`, `quantity`, `price_minor`, `currency`.
   The `deal_offer` side input of #461 then retires.
   The pair is the offer's sent pair `{record, agent_input}` (#498, evidencebook#1065): the form
   every holder of the offer has, where a buyer whose seller made the offer never holds the
   seller's `{record, header, payload}` journal pair. `deal_offer` stays until the copies
   capsulectl writes carry it.
   **Ruled yes** for the keep copy, and u499 extends to x-deal-v1 counterparty copies, so they
   carry it too (u561 (ops `proprietary/inbox.md`, Steven 2026-11-27, ops commit `fe2ae717`), items 2 and 5).
2. **The seller's name**, sealed by the holder's book bound to the counterparty key, in a record
   the agreement cites (evidencebook#1031). **Ruled yes**, keep copy (u561 item 3); u499 withholds
   names from the counterparty copy.
3. **What was delivered** ("150 of 200"): no structured sealed member holds a delivered quantity
   today (`PerformBody` has `act`, `observed`, `statements` and a `detail_commitment`, evidencebook
   `dealprofile/xdealv1/types.go`); the ruling's `value` says only met or not met. It is the
   seller's own claim, so it shows in the seller's voice from the seller's perform record, carried
   in the holder's copy, if what `detail_commitment` commits to holds the quantity and the copy
   opens it; no new member in the buyer's records. PR 5 checks that first; if it does not, the
   quantity member is Steven's what.
4. **The witness receipt (Steven's (a)): ruled no.** u219 stands: no copy carries a witness
   receipt, keep included, because a stamp proof exposes shelf position and cadence. The keep
   badge reads "reported by capsulectl, this page did not check it", drawn from the one `witness`
   field, so it cannot contradict the core's check list (u561 item 4).

Items 1, 2 and 4 are ruled (u561); item 1's shape inside `book` is engineering's. Item 3 stays as
written. Steven also asked for a no-PII or pseudonym step for outside readers who are not a party,
such as an external audit (u561 item 2). That is filed as evidencebook#1058 (an audit copy with
personal details removed and each party shown by its role and short key, for example
"Seller · 13sffh34", with the full key at L2; Steven, 2026-11-27) and is not part of this plan.

## 5. The anti-hardcode test

Every visible text node in the receipt region is either a wording-pack string or a `Sourced`
value, and every `Sourced` value resolves:

- The drawer tags each value node with its source, reusing the runtime's existing source tags
  (`ts/src/report-legend.ts`, `tagSource`, `data-src` = `pack`, `field`, `payload`, `producer`) and a
  `data-ptr` with the pointer.
- The drawer also tags each node with the pack key that produced it (`data-key`) and each
  placeholder value inside it. The test renders each fixture, walks the text nodes, and fails on
  any text that is not the named key's template with every placeholder filled by a tagged value,
  so a template that is only `{item}` (`deal.hero.item`) cannot pass hardcoded text.
- A tagged value passes when its pointer, resolved in the fixture's bundle, verifier report or
  checked side inputs (the `checked` source, which must keep the page's own-check attribution),
  gives the shown text through one of a closed list of formatters (amount in its asset, time,
  short id, token word), each with its own unit test; a value built from several members names
  each pointer. A negative test hardcodes one field while changing another and must fail.
- A differential check: fixture pairs written by evidencebook's test helpers (signed with
  generated keys, as `tests/testdata/deal-v1/offer` was) that differ in one semantic member (the
  item, an amount, a ruling's `against`). The test compares the semantic fields of the two models
  and the pack-keyed nodes that show them; record ids, digests and proofs also change with a
  valid regeneration, so for those nodes it checks only that each resolves against its own
  fixture. Editing a signed fixture by hand would only make the page refuse it.
- No literal from a fixture (party names, items, amounts) appears in `go/receipt`, `ts/src` or
  any wording pack.

Model tests (over `buildModel`) and page tests (the full page, signatures checked) are separate;
the existing tamper tests, which require an edited signed copy to be refused
(`ts/test/receipt-deal-v1-item.test.ts`), stay. Fixtures: a ruled dispute (from the ARD run's
bundle, with a ruling only in `relied_on`, the ruling at `seq` 1 of the adjudicator's book and the
dispute at a later `seq` of the holder's), a settled deal (new; `tests/testdata/deal-v1/keep-copy.bundle.json`
is not settled: `settled` false, its one row `not_due`), a full adjudicator copy (`book.records`), a counterparty copy
(`counterparty-copy.bundle.json`, asserting the causal step order with no times), a countersigned copy (`tests/testdata/deal-v1/countersigned`, whose nodes resolve to `checked` inputs), an adjudicator copy (rows withheld), and the #461 offer copy.
The full adjudicator fixture asserts every received record is both a step and an L2 raw record.
The counterparty and adjudicator fixtures also assert that no witness time, record time or
named-witness column is drawn (u219, u238, u239).

## 6. What retires, and in what order

The caller inventory, with file:line for every row, is on capsule-viewer#473
(https://github.com/action-state-group/capsule-viewer/issues/473#issuecomment-7223549241). What it
means for the retire list:

| Path | Status | Decision |
| --- | --- | --- |
| v1 `v1ReportPage` | live, the demo receipt | keep; it is the page this note rebuilds |
| v0 `dealReportHTML` | live for x-deal-v0 deals only (`deal set-version x-deal-v0`) | **proposed keep**: it is not a second renderer (same emitter, same receipt modules), so the model covers it when the v0 kinds move (PR 4). Sherlock2 proposed retiring it (c987ff76); removing it removes a released verb for v0 deals, so it stays; Sherlock2 withdrew its retire item in its review of this note |
| compose `deal compose --html` + eb `deal-view.js` | reachable, no caller outside tests | **retire** under u224, after evidencebook#850; the site installer change goes first |
| eb `capsulectl-deal-en.json` `page.*` | feeds compose only: `dealPageBoot` (deal_report.go:589) has one caller, deal_compose_page.go:89, and the v0 report page's bootstrap carries only the verifier report and verify command | retires with compose; nothing moves |
| book receipts (`--receipts`) | reachable, no caller outside tests; draws v1 receipts with no renderer | keep the flag; evidencebook adds `receipt.Deal` to the modules it loads (report_receipts.go:94-105) with an embedded v1 receipt test (PR 5b). Not on the critical path |
| `deal_share_gate.go` `DealViewJS` strip | no producer | delete with compose |
| Go `go/historyview` | dead, no importer | **retire** (PR 11) |
| frozen Python twin: receipt part | test oracle only | **kept README-retired** (u526, Steven 2026-11-17: any delete first freezes the Python output on the refusal, withheld and tamper cases into the receipt golden, then a PRD docs PR Steven approves; PRD §14.1 "nothing is deleted"). PR 4 does the freeze and stops; the delete is PR 12, gated on that PRD PR |
| frozen Python twin: `standard_history_card.js` | live: capsulectl's History page (eb ships its go/v0.18.3 copy) | **stops being used** once capsulectl draws History with the TS `history-view` (PR 10); deleting it takes the same u526 path (PR 12) |
| ebs demo `history_input()` | live | **retire**: the same rule applies to the History card. The TS `history-view` becomes a presentation module whose `buildModel` reads the `x-standard-history/v0` bundle, as the Python-built `standard_history_card.js` module already does (PR 8), so neither the demo nor capsulectl shapes the model |
| contract-report packs on receipt pages | live by accident | stop: receipt pages' record views take the receipt pack (PR 3) |

After this, a receipt has one renderer (the receipt module over its `buildModel`, with the runtime
drawing L2 from the same view) and two packs (receipt, History); a History card has one renderer
(the TS `history-view` module over its `buildModel`).

## 7. PRs, in order

Sizes: S under 150 changed lines, M 150 to 800, L over 800. A PR that depends on a door waits
for that door only; the rest keep building, stacked where needed.

| # | Repo | What | Size | Waits on |
| --- | --- | --- | --- | --- |
| 1 | capsule-viewer | the deal kind's `buildModel` fixed in place (`buildDeal`, `dealSteps`, `dealBook`): `Sourced` values; reads an optional `book.offer` (checked by the agreement's offer digest) beside the `deal_offer` input, and `book.records`/`book.received` of a full adjudicator copy; steps from `records` and `book.relied_on` (the ruling a step); statement `names` and dispute bodies drawn; `start` labelled as the agreement's state; each amount once, in its recorded asset. New ruled-dispute fixture from the ARD run's bundle | M | Sherlock2's wording for new lines |
| 2 | capsule-viewer | the anti-hardcode test (section 5) and the drawer's source tags | M | 1 |
| 3 | capsule-viewer | the core on a receipt page: its banner and L2 check list draw capsulectl's checks and witness report from `verifierReport` (one list; the module's badge cites the core's result; no contract change), ladder once per page, record views take the receipt pack, the checked section styled as a card | M | 1 |
| 4 | capsule-viewer | the v0 kinds (unilateral, seller, bilateral) and provider onto the same model shape; freeze the Python oracle's output on the refusal, withheld and tamper cases into the receipt golden (u526 step 1); nothing deleted | L | 2 |
| 5 | evidencebook | bump the capsule-viewer pin to 1's merge; then the keep copy carries `book.offer` (section 4 item 1, profile section 9 updated); the verifier report gives `share_commands` and each row's `waiting_on`; check what `detail_commitment` opens (section 4 item 3); stop sending `deal_offer` only after the pinned viewer reads `book.offer` | M | 1 (section 4 item 1 ruled yes, u561) |
| 5b | evidencebook | book receipts load `receipt.Deal`, with an embedded v1 receipt test | S | 1 |
| 6 | evidencebook | the seller's name sealed for the counterparty key (evidencebook#1031) | M | none (ruled yes, u561 item 3) |
| 7 | actionstate-site, then evidencebook | the installer accepts a deal-view tarball without `deal-view.js`/`.css`; then drop `deal compose --html`, `deal-view.js`, the `page.*` words and the `DealViewJS` strip (u224) | S, then M (deletion) | evidencebook#850 |
| 8 | capsule-viewer | the TS `history-view` as a presentation module (manifest, `canRender`, `buildModel` over the `x-standard-history/v0` bundle, `render`), reusing the Python module's reading rules; the shaped-input entry point stays for loop's 0.17.0 copy until it bumps | M | none |
| 9 | evidencebook-skills | the ARD demo hands the bundle to the History module (delete `history_input()`), moves to a released capsule-viewer, and its skill names the `--bundle --share counterparty --to` copy | S to M | 8 and a capsule-viewer release |
| 10 | evidencebook | capsulectl's History page through the TS `history-view` module, replacing the vendored go/v0.18.3 `standard-history` assets | M | 8 |
| 11 | capsule-viewer | delete `go/historyview` (dead, no importer; a Go package removal, so the next go/ tag is a minor bump) | S (deletion) | none |
| 12 | actionstate-muse, then capsule-viewer | a PRD_VIEWER_PRESENTATION docs PR for Steven retiring the Python receipt and `standard_history` modules (u526 step 2); then delete them, their parity tests and the release-go step (release-go.yml:75-79) | S, then L (deletion) | 4, 10, Steven's approval of the PRD PR |

loop's vendored `history-view` 0.17.0 (`site/vendor/capsule-viewer-0.17.0`) is loop's to bump
when it next needs it; it is not on this path. A capsule-viewer release after 1 to 3 is the
coordinator's call (asg-rules standing rule 3).

## 8. Doors and gates

- **Ruled (u561, Steven 2026-11-27):** the keep copy carries the offer and names the seller; u499
  extends to x-deal-v1 counterparty copies; u219 stands (no witness receipt in any copy); the v0
  page stays. PR 5 and PR 6 no longer wait on Steven.
- **Ruled (u562):** the view model for receipt, History and Results lives in capsule-viewer's
  `buildModel`; Muse runs it as a host and only emits the JSON into its chat. No question to Steven
  gates a PR in section 7. The audit copy is evidencebook#1058. The model itself (no schema, no
  `spec_version`, never sealed) carries no product meaning.
- **Open with the seller's records:** the delivered quantity (section 4 item 3), checked in PR 5.
- **Steven: the PRD docs PR of PR 12** (u526).
- Wording for new lines (the withheld line, the share line, "waiting on", the agreement-state
  label) is Sherlock2's under the wording delegation.
- Ethan reads this note before any PR in section 7 starts.
