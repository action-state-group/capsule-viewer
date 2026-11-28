<!-- SPDX-License-Identifier: Apache-2.0 -->
# One viewer: capsule-viewer makes the designed pages, the plugin's presentation layer retires (design note)

Status: draft, capsule-viewer#524. Design only: no code changes here. Read at origin/main on
2026-11-28: capsule-viewer `7bb5b55`, actionstate-muse `bbfc5ca`, capsule-cli `82d3283`,
actionstate-site `042d13a`, evidencebook `dfd0093`, evidencebook-skills `0e2bdad`,
Mesh-LLM/capsules-plugin `e7e9f50`, mesh-llm `74c8765c9`. Paths below are relative to each
repository's root; `muse:` is actionstate-muse, `cli:` capsule-cli, `site:` actionstate-site,
`eb:` evidencebook, `ebs:` evidencebook-skills.

**The ruling.** Steven, 2026-11-28 02:37Z
(buzz://message?channel=0d760ea3-529d-4dec-b309-24184967f8e0&id=332ec08ecc51706d6917b7e2c74579315f5f48d52c7769a0a6444b6e1e302fef&thread=b13883f9076d402ad5d762ea66c9052103c03560cc906f9d0c9890235775f48e):
"yes on the decision to simplify the viewer. If others want to use the code and change the look
they can, and yes it is not the moat. go". Recorded as ops `evidence-network/inbox.md` u276
(ops commit `54c99891`). It supersedes seams ruling 8 (ops `company-oss/inbox.md` u555, 2026-10-21:
"kit, tokens and the contract-report module live in capsule-viewer (basic, donatable); our pages,
logo and wording packs ship in the Action State plugin built on the kit"). It answers the
proposal Steven said yes to (Sherlock2, same thread, 02:15Z): one viewer, one look,
self-contained `.html` that verifies offline, wording kept as data, capsule-viewer kept Apache-2
and donatable as it is.

**Done when** (#524): every designed page the viewer makes (receipt, card, report)

1. says what it checked;
2. says how anyone can re-check it without us (the AAC verifier or capsulectl), by name;
3. never claims a check it did not run;

and the pages that came from the Action State plugin layer are made by capsule-viewer, with the
plugin layer retired or reduced to nothing.

**Where this sits.** The receipt view-model note (`docs/design/receipt-view-model.md`, #473)
already plans one receipt renderer and one History renderer inside capsule-viewer. This note does
not reopen it: it takes the rest of the plugin layer, orders it around #473's PRs, and adds the
acceptance check for the three points. "The plugin layer" here is only the presentation part of
the capsulectl-actionstate plugin (its page modules, page verbs, page wording and the capsulectl
wording pack it installs). The same binary is also the rules checker, `checkup lint`, limits,
disputes and the UCP/ACP checkouts (`muse: internal/plugin/plugin.go:129-160`, usage); none of that
is presentation and none of it moves.

## 1. Inventory: what the plugin layer makes today

All in actionstate-muse (private, no licence file), shipped as the capsulectl-actionstate binary
that actionstate.ai/plugin serves (`site: install/plugin.json:2`, `PLUGIN_VERSION` 0.0.18).

### 1.1 Page modules

Each is an AAC presentation module (a module-slot script plus stylesheet), generated from a
template and a wording file, its manifest pinning the bytes by sha256
(`muse: internal/presentation/presentation.go:507-512`, `module`). The plugin advertises them in
its `cli-plugin-metadata` `presentations` member (`muse: internal/plugin/plugin.go:179-190`) and
`capsulectl actionstate presentation install` writes them under
`capsulectl-actionstate.d/presentations/<id>-<sha12>/` beside the launcher
(`muse: internal/presentation/presentation.go:70`, `install.go:63-100`). capsulectl reads and
hashes them itself (`cli: cli/plugin_presentations.go:159`).

| Module id | Renders | Code, style, words | Built by |
| --- | --- | --- | --- |
| `actionstate.receipt.unilateral/v0` | a buyer's x-deal-v0 receipt, keep and counterparty copies | `receipt.js.tmpl` (1253 lines), `receipt.css`, `wording/receipt.json` (`presentation.go:116-141`, `receiptManifest` :418-452) | `actionstate receipt page --deal` (`muse: internal/plugin/receipt_page.go:60`, module pick :330-358, keep build :168, counterparty build :209-231) |
| `actionstate.receipt.seller/v0` | a seller's x-deal-v0 receipt (x-deal-seller/v0) | same files | same verb |
| `actionstate.receipt.bilateral/v0` | both halves (composed/v1) | same files | advertised only; no verb builds it (`receipt_page.go:39-40`) |
| `actionstate.receipt.sale/v0` | a whole sale (x-deal-sale/v0, `capsulectl deal sale bundle`, `eb: capsulectl/internal/deal/deal_sale_bundle.go`) | same files | `actionstate receipt page --sale` (`receipt_page.go:42-46`) |
| `actionstate.rules/v0` (keep), `actionstate.rules.standard/v0` (counterparty) | the rules comparison record `actionstate.rules_compare/v0` ("My Rules") | `rules.js.tmpl`, `myrules.css`, words from `internal/rules` and `wording/myrules.json` (`presentation.go:38-50`, `Generate` :340) | `actionstate report` (`muse: internal/plugin/report.go:436-449`, `writeRulesPage`), `actionstate presentation build` (`presentation_verbs.go:246-304`) |
| `actionstate.checkup.page/v0` | `actionstate.checkup/v0` | `checkup.js.tmpl`, `checkup.css`, `wording/checkup.json` (`presentation.go:52-58`) | `actionstate checkup` (`muse: internal/plugin/checkup.go:45`, build :160-191) |
| `actionstate.statement.page/v0` | `actionstate.statement/v0` | `statement.js.tmpl`, `statement.css`, `wording/statement.json` (`presentation.go:60-66`) | `actionstate statement` (`muse: internal/plugin/statement.go:118`, build :231-266) |
| `actionstate.history/v0` | a History the person sends (x-history-selection/v0) | `history.js.tmpl`, `history.css`, `wording/history.json` (`presentation.go:152-186`) | `actionstate history --deal ... --to` (`muse: internal/plugin/history.go:260`, build :404-408) |

The plugin's receipt modules render only x-deal-v0 bundles (`receipt_page.go:342-344` refuses any
other); x-deal-v1, the default deal version and the ARD demo's, is drawn only by capsule-viewer's
`capsuleviewer.receipt.deal/v1` through `capsulectl deal report --html`. For x-deal-v0,
capsule-viewer already has `capsuleviewer.receipt.unilateral/v0`, `.seller/v0` and `.bilateral/v0`
(`go/receipt/manifest-unilateral.json`, `manifest-seller.json`, `manifest-bilateral.json`) for the
same bundles, so the plugin's three are a second look at one receipt. capsule-viewer has no module
for x-deal-sale/v0, `actionstate.rules_compare/v0`, `actionstate.checkup/v0` or
`actionstate.statement/v0` (a search of `go/`, `ts/src` and `docs/` finds none of the four names).

### 1.2 Pages the plugin writes with no module

| Page | Code | Verb |
| --- | --- | --- |
| your own History, one row per deal, static, PRIVATE | `html/template` in `muse: internal/plugin/history_page.go:170` | `actionstate history page` (:199) |
| a UCP purchase's evidence view | `muse: internal/ucp/view.go` (`html/template`) | `actionstate ucp view` (`internal/plugin/ucp.go:393`, writes `ucp-evidence.html` :456) |
| an ACP purchase's evidence view | `muse: internal/acp/view.go` | `actionstate acp view` (`internal/plugin/acp.go:322`, writes `acp-evidence.html` :387) |

Two more pieces of the presentation layer sit outside `internal/presentation`:

- **The view-model JSON** the plugin writes beside My Rules, Checkup and the keep receipt
  (`muse: internal/plugin/viewmodel.go`, `docs/design/view-model-json.md`; the receipt's at
  `internal/plugin/receipt_page.go:238-244`). It is derived in Go from the same records
  (`viewmodel.go:212-236,255-270`), held to the page's JavaScript `buildModel` by a parity test, and
  the skill answers from it (`muse: skills/actionstate-rules/SKILL.md:258-274`). For the receipt this
  is a second model implementation, which u562 already rules out (`receipt-view-model.md` section 8:
  Muse runs capsule-viewer's `buildModel` and only emits its JSON).
- **`checkup lint`'s page check.** `checkup lint --page` checks that the My Rules page is the one
  the keep module drew (`muse: internal/plugin/lint.go:100`, `presentation.CheckRulesPage`,
  `internal/presentation/rulespage.go:109`). `checkup lint` is not presentation and stays, so this
  check moves with the page it checks.

### 1.3 Wording

- **Page wording**: `muse: wording/{receipt,history,checkup,statement,myrules,plugin,shared}.json`,
  compiled into each script (`presentation.go:478-500`, `fillTemplate`). Data already, but a second
  copy of words capsule-viewer's own packs also hold for the same receipt.
- **The rules report's wording layers**: `actionstate.rules.contract-report.wording/v0` (the
  user's own copy) and `actionstate.rules.contract-report.vocabulary/v0` (the Standard copy), text
  held in Go (`muse: internal/rulesresult/words.go:15-67`), handed with their sha256 to the
  contract-report page that capsule-viewer draws through evidencebook's report SDK
  (`muse: internal/plugin/report_result.go:119-124`). The page is already capsule-viewer's; these
  two are the plugin's words for it, and the one that says a "not met" row does not mean an agent
  broke a rule lives here.
- **The capsulectl wording pack**: `muse: wording/capsulectl.go` builds one pack from capsulectl's
  built-in pack vendored at capsule-cli `2cbea71a`, the deal plugin's pack vendored at evidencebook
  `f9e1d35e` (`muse: wording/capsulectl/PROVENANCE.json`) and three replaced entries
  (`muse: wording/capsulectl/actionstate.json`: `card.tag.ask` "ACTION STATE · PAUSED FOR YOU",
  `card.tag.deny`, `card.tag.stop`). `presentation install` writes it to
  `capsulectl-actionstate.d/wording/actionstate.capsulectl-en-<sha12>.json`
  (`muse: internal/presentation/install.go:111-130,175`) and the site installer pins it on the
  deal profile (`site: install/install.sh.tpl:808-832`; the install skill's line 6,
  `site: install/actionstate-install.SKILL.md.tpl:536`).
- **The known gap.** The 0.0.18 pack lacks `say.verify.not_read`, which capsulectl added
  (`cli: cli/assets/wording/capsulectl-en.json:31`) for the line that says which extensions verify
  did not interpret (`cli: cli/narration.go:681-688`, capsule-cli#428). A pinned pack that lacks a
  built-in key makes capsulectl use its built-in wording for everything, not only the missing key
  (`cli: cli/narration.go:383`, `builtinUntilUpdated`), and the install check warns
  ("the pinned wording pack lacks keys this release uses: say.verify.not_read"). So today the
  three Action State card tags are not shown on any install with a current capsulectl, and the
  pack only adds a warning. Each capsulectl key added later reopens the same gap, because the pack
  is a vendored copy (`PROVENANCE.json`, `used_for`).

### 1.4 Logo and other assets

None. The plugin carries no logo, image or font (a search of `muse: internal/presentation` and
`muse: wording` for `logo` and `svg` finds nothing); seams ruling 8 placed a logo there, but none
was made. The stylesheets in 1.1 are the only visual assets.

### 1.5 Consumers

| Consumer | What it uses | Where |
| --- | --- | --- |
| actionstate-site installer | runs `presentation install`, refuses a `presentations_refused` plugin, pins the capsulectl wording pack on the deal profile | `site: install/install.sh.tpl:799-832`; `install/actionstate-install.SKILL.md.tpl:526-583` (step 11, lines 5 and 6), :1086 (uninstall un-pin); `install/install.md:275`; test `scripts/install-wording-pin-test.sh` |
| the plugin's own skill | tells the agent to run the page verbs | `muse: skills/actionstate-rules/SKILL.md:221-373` (`report`, `presentation build`, `statement`, `checkup`, `receipt page`, `history page`, `history`); `skills/actionstate-rules/scripts/run-dry-run.sh:66-136`; `README.md:155-160`; `DEMO-UCP.md:230`, `DEMO-ACP.md:237` |
| plugin doctor | checks installed module files and the pinned pack | `muse: internal/plugin/doctor.go:349`; `internal/presentation/install.go:31` (`Check`) |
| capsulectl (capsule-cli) | loads any plugin's presentations from its trusted roots and builds pages with them; has no Action State code | `cli: cli/plugin_presentations.go:159`, `cli/presentation_build.go:387`, `cli/presentation_list.go:73`. No change needed: it stays the generic host, which is how anyone else may ship their own look |
| ARD demo | **not a consumer**: its History page is capsule-viewer's `history-view` vendored at 0.28.0, its receipts are `capsulectl deal report --html` drawn by capsule-viewer's Go receipt package | `ebs: demo/ard/pages.py:5-52`, `demo/ard/receipt.py:166-169` |
| Mesh | **not a consumer**: the capsules plugin's web UI pins `@action-state-group/capsule-viewer` 0.27.0 and its Rust plugin writes bundles capsule-viewer renders; mesh-llm has no reference to the plugin or its modules | `capsules-plugin: web-ui/package.json:21`, `crates/evidence-plugin/src/deal_receipt.rs:2` |
| evidencebook (capsulectl deal plugin) | **not a consumer**: its pages use capsule-viewer's Go module | `eb: capsulectl/go.mod:9` (capsule-viewer/go `335d67ab`) |
| evidencebook-skills | **not a consumer** (only a vendored capsule-viewer comment names actionstate-muse's packs) | `ebs: demo/ard/vendor/capsule-viewer-0.28.0/history-view.iife.js:46` |

So the plugin layer has two consumers outside its own repository's code: the site installer and
the plugin's skill (which ships from muse and is installed by the site).

## 2. Where each page lives after, and how it meets the three points

### 2.1 How a capsule-viewer page reaches a person

capsulectl's `presentation build` offers only the modules of installed plugins
(`cli: cli/presentation_build.go:374-410`); it has no path for capsule-viewer's own modules. The
path that works today is the one capsulectl's deal plugin uses: the program that holds the
bundle links capsule-viewer's Go module (`go/emitter`, `go/pageruntime`, `go/receipt`) and emits
the page itself (`eb: capsulectl/internal/deal/deal_report.go:521-540`, `deal report --html`,
pinned by `eb: capsulectl/go.mod:9`). This note keeps that one path for every moved page: **the
command that writes the bundle draws its page with capsule-viewer's Go module.** So the
x-deal-v0 receipts and the sale come from evidencebook's capsulectl; a page of a bundle the plugin
itself writes (My Rules, Checkup, Statement, if Q1 places them here) comes from the plugin linking
capsule-viewer/go at a pinned commit, after `capsulectl verify` passes on the bundle, the gate
`presentation build` gave it before. No capsule-viewer module is installed as a plugin file, so
nothing new is pinned by path or digest on a host.

### 2.2 The three points, held by one acceptance test

capsule-viewer gets one acceptance test over every page-producing entry point, not only the
presentation modules: each module's fixtures (receipt v0 kinds, deal v1, provider, History,
contract report, and each module this note adds) and the standalone entry points that draw a
whole page from shaped input (`ts/src/history-view.ts:3012` `historyViewHtml`, `:3124`
`historyViewDocument`, which #473 keeps for loop's copy). For each page it fails unless:

1. **It says what it checked, with who ran each check.** Every check the page names has a status
   and an attribution taken from the core's one check list (`receipt-view-model.md` section 3):
   run in this browser, reported by capsulectl (`report: checks`), or not run. Cases: checks the
   page ran; checks only capsulectl reported; a check absent from both; a failed check; a withheld
   input; and a verifier report for another bundle, which the page must refuse
   (`ts/src/verifier-report.ts:4-18`). A "this page checked it" line over a reported-only check
   fails the test.
2. **It names how to re-check it without us, and that command works.** The re-check line names a
   command from a closed set: `agent-action-capsule verify ...` (the AAC reference verifier) or a
   `capsulectl ... verify ...` command, either the one capsulectl reported (`verify_command`) or the
   pack's fallback (`deal.check.no_command`, `go/receipt/wording-en.json:652`). The test exports the
   page's bundle and runs the named AAC verifier over it (`@action-state-group/agent-action-capsule`
   is already a dependency, `ts/package.json:48`); the `capsulectl` form is run by evidencebook's
   page tests, where capsulectl is built.
3. **It never claims a check it did not run.** The anti-hardcode test (`receipt-view-model.md`
   section 5, capsule-viewer#495) extended to each new module, a negative fixture per module where a
   check did not run, and the page opened with the network blocked, so a page that says it verified
   offline did (the CSP browser tests, `ts/test/emitter-csp-browser.test.ts`, already open pages
   this way).

Today, point 2 is met in words on capsule-viewer's receipt (`go/receipt/wording-en.json:652,759`),
contract report ("Check it yourself", `ts/src/wording/contract-report-generic.en.json:348-390`) and
History card (`ts/src/wording/history-view.en.json:253`), but no test runs the named command. Point
3's three check counts on the receipt page (`receipt-view-model.md` section 1 item 1) became one
list in #473's PR 3 (capsule-viewer#493, merged). The plugin's packs name no re-check command
except History's "capsulectl verify" (`muse: wording/history.json`), so none of its pages meets
point 2 as it is.

### 2.3 Each page

| Page today | After | Drawn by |
| --- | --- | --- |
| `actionstate.receipt.unilateral/v0`, `.seller/v0` (x-deal-v0), keep and counterparty | capsule-viewer's existing `capsuleviewer.receipt.unilateral/v0`, `.seller/v0`: `receipt page` calls `capsulectl deal report --html` for the keep copy and `--share counterparty --to <who> --html` for the other (the call `receipt_page.go:211` already makes); the plugin's modules are deleted | evidencebook capsulectl |
| `actionstate.receipt.bilateral/v0` | capsule-viewer's `capsuleviewer.receipt.bilateral/v0`; nothing calls the plugin's | evidencebook capsulectl |
| the keep receipt's view-model JSON | the JSON of capsule-viewer's receipt `buildModel` (u562), written beside the page by the program that draws it, in the same shape the skill reads today or with the skill changed in the same PR; the Go projection in `viewmodel.go` for receipts is deleted. How a Go program gets `buildModel`'s output is E1 | evidencebook capsulectl |
| `actionstate.receipt.sale/v0` (x-deal-sale/v0) | a new capsule-viewer receipt kind on the receipt module's one `buildModel` (#473's PR 4, capsule-viewer#499, put the v0 kinds on it), worded in `go/receipt/wording-en.json`, drawn by a new `deal sale bundle --html`; or retired, if Q2 says so | evidencebook capsulectl |
| `actionstate.history/v0` (a sent History, x-history-selection/v0 from `capsulectl deal history`, `muse: internal/plugin/history.go:364-408`) | a capsule-viewer History module for x-history-selection/v0. #473's History work reads only x-standard-history/v0 (`receipt-view-model.md` section 7 row 8, capsule-viewer#490), a different bundle (the History card counts deals and carries no deal's content), so this needs its own reader rule, audiences and withheld fields, kept as the plugin's module has them (`presentation.go:169-183`); drawn by `deal history --html` | evidencebook capsulectl |
| `history page` (your own History, static, read-only: `deal report --read-only` per deal, no checkpoint, `history_page.go:20-28,199-223`) | capsule-viewer's History view over the same rows, keeping the read-only reads and the PRIVATE banner; the plugin draws it with capsule-viewer/go as a static page with no script, as today (`historyViewHtml`) | the plugin |
| My Rules (`actionstate.rules/v0`, `.standard/v0`), Checkup, Statement, with their view-model JSON and `checkup lint --page` | Q1. If they are designed pages of the one viewer: capsule-viewer modules keyed to their record kinds, words in capsule-viewer packs, drawn by the plugin through capsule-viewer/go; `checkup lint --page` checks the page against the capsule-viewer module's script digest instead of the plugin's (`rulespage.go:93-153`) | the plugin |
| the rules report's two wording layers (`internal/rulesresult/words.go`) | wording data: a capsule-viewer contract-report pack (a JSON file, as `ts/src/wording/contract-report-*.en.json` are), if Q1 is (a); else a JSON file in the plugin instead of Go strings. The "not met is not a broken rule" line is kept either way | evidencebook report SDK (unchanged) |
| `ucp view`, `acp view` | Q1, as above; the receipt each links is already capsulectl's own page (`muse: internal/plugin/ucp.go:441-445`) | the plugin |
| capsulectl wording pack | retired: no Action State pack is pinned; installs use capsulectl's built-in wording, which is what current installs already show (1.3). Q3 decides whether the three card tags survive, and where | (none) |

## 3. Order: PRs per repository

Sizes: S under 150 changed lines, M 150 to 800, L over 800. Each row is one lane. A row waits only
for what it names; the rest keep building, stacked where needed. `#473 PR n` is the row of
`receipt-view-model.md` section 7; PRs 1 to 4 and 11 have merged (capsule-viewer#483, #495, #493,
#499, #486), and PR 8 is capsule-viewer#490 (open).

| # | Repo | What | Size | Waits on |
| --- | --- | --- | --- | --- |
| 1 | capsule-viewer | this note | S | Codex, Sherlock2 |
| 2 | capsule-viewer | the acceptance test of 2.2 over today's modules and standalone entry points | M | none |
| 3 | actionstate-site | the installer tolerates a plugin with no `presentation install` verb and no wording pack: it runs the verb only when the plugin lists it, pins no Action State pack, and un-pins one an earlier install pinned (the `actionstate.capsulectl-en-*` case the uninstall steps already un-pin, `install/actionstate-install.SKILL.md.tpl:1086`, `install/install.md:275`), leaving a person's own pack as it is (`install.sh.tpl:815-826`). Tests: a fresh install, an upgrade from 0.0.18 with its Action State pin, and an upgrade with a person's own pin | S | Q3 only if Sherlock2 keeps the tags |
| 4 | actionstate-muse | `receipt page --deal` through capsulectl's `deal report --html` (keep and counterparty); the three x-deal-v0 receipt modules leave `ReceiptModules` and `cli-plugin-metadata`; the skill's receipt lines change with it. The receipt's view-model JSON stays the Go projection until row 6 | M | none (capsulectl already draws both copies) |
| 5 | actionstate-muse | drop `WordingPack`, `InstallWording`, the pack's doctor check and `presentation install`'s `capsulectl_wording` member | S | 3 deployed on the site |
| 6 | evidencebook, then actionstate-muse | the keep receipt's view-model JSON from capsule-viewer's `buildModel` (E1), written by `deal report`; then the plugin copies it and deletes its receipt projection from `viewmodel.go` | M, then S | E1 |
| 7 | capsule-viewer | the sale receipt kind (x-deal-sale/v0) on the one `buildModel`, words in `go/receipt/wording-en.json` | M | Q2; Sherlock2's words for new lines |
| 8 | capsule-viewer | a History module for x-history-selection/v0 (2.3), beside #490's x-standard-history/v0 module | M | none (stacks on #490 if it shares its code) |
| 9 | evidencebook | bump capsulectl's capsule-viewer pin to 7 and 8 (and the #473 rows merged by then); add `deal sale bundle --html` and `deal history --html`, each drawing with capsule-viewer/go | M | 7, 8 |
| 10 | actionstate-muse | `receipt page --sale` and `history --deal` through row 9's verbs; `history page` through capsule-viewer/go (a `go.mod` pin of capsule-viewer/go); delete `receipt.js.tmpl`, `receipt.css`, `wording/receipt.json`, `history.js.tmpl`, `history.css`, `wording/history.json`, the sale and History modules and `history_page.go`'s template | M (mostly deletion) | 9 in a capsulectl release |
| 11 | capsule-viewer | My Rules, Checkup, Statement and the UCP/ACP views as modules, and the rules report's two layers as a contract-report pack, if Q1 is (a) | M each, one lane each | Q1 |
| 12 | actionstate-muse | the remaining pages through capsule-viewer/go (or, if Q1 is (b), kept in the plugin and brought to the three points there); `checkup lint --page` re-pointed at the module the page now carries, with a valid page and a wrong-module or edited page refused; then delete `internal/presentation`, the `presentation install|list|build` verbs, `cli-plugin-metadata`'s `presentations` member and the remaining page packs, tests and harnesses; `doctor --repair` removes the plugin's old `capsulectl-actionstate.d/presentations/` and `wording/` files after the pin is gone | L (deletion) | 10, 11 (or Q1's (b)) |
| 13 | actionstate-site | drop the `presentation install` step and its `presentations_refused` check; bump `install/plugin.json` and the install skill to the plugin release that carries 12, in one install revision | S | 12 released |

**Ordering rule for the installer.** The site changes before the plugin removes anything it
calls: row 3 lands and deploys before row 5's plugin release, and row 13 only after the plugin
release that carries 12. Each install revision names one plugin version, one capsulectl tag and
one skill digest together (`install/plugin.json`), so no host gets a plugin with an installer that
expects another.

**What each consumer pins in between.** Internal consumers pin a commit on main, never an rc
(asg-rules standing rule 3):

- evidencebook's capsulectl (`capsulectl/go.mod`, `report/go.mod`) pins a capsule-viewer commit;
  row 9 moves it once for rows 7 and 8, as #473 PR 5 moved it for the receipt rows.
- The plugin calls the capsulectl on the host for receipts, sale and sent History, so rows 4 and
  10 name the capsulectl release they need and check for the verb, as the plugin already checks for
  `presentation build --module` (`muse: internal/plugin/checkup.go:228-231`). For the pages it
  draws itself (rows 10 and 12) it pins capsule-viewer/go by commit in its own `go.mod`
  (today only an indirect `v0.19.2`, `muse: go.mod:19`).
- The site pins the plugin by version and sha256 and capsulectl by tag (`install/plugin.json`);
  rows 3 and 13 change those, and its revision list (`install/rc*/`) keeps older installs
  reproducible.
- **Installed hosts.** Module files live at digest-named paths and are never overwritten
  (`muse: internal/presentation/presentation.go:218-220`, `install.go:119-128`); capsulectl loads
  only the presentations a plugin's `cli-plugin-metadata` advertises
  (`cli: cli/plugin_presentations.go:159-176`), so once a plugin stops advertising a module its file
  is inert. The pinned wording pack is not inert: row 3 un-pins it before row 12's `doctor --repair`
  removes the file, so no profile points at a deleted pack. Rows 3 and 12 each test an upgraded host
  that holds several old module generations and a pinned pack.

**Release batching** (standing rule 3, the coordinator's call): one capsule-viewer release (npm and
`go/`) after rows 2, 7 and 8; one capsulectl release carrying rows 6 and 9; one plugin release for
rows 4 and 5, one for rows 6, 10 and 12 (or one, if they are ready together); one site install
revision per plugin release. No row cuts a release on its own merge.

**What is deleted, in the end.** In actionstate-muse: `internal/presentation/` whole (templates,
generated scripts, stylesheets, `install.go`, `rulespage.go` once lint has its new check, tests,
harnesses), the page packs `wording/{receipt,history,checkup,statement,myrules}.json` (any entry
the plugin's own text output still speaks stays), `wording/capsulectl.go` and `wording/capsulectl/`,
the receipt part of `viewmodel.go`, `history_page.go`'s template, `internal/ucp/view.go` and
`internal/acp/view.go` if Q1 moves them, `internal/rulesresult/words.go`'s Go strings (to data),
and the `presentation install|list|build` verbs. In actionstate-site: the `presentation install`
and wording-pin steps and their test. In capsule-cli: nothing. In capsule-viewer: nothing beyond
what #473 already deletes.

## 4. Open questions

**For Steven (product: what a person sees, the product boundary).** None gates rows 1 to 10.

- **Q1. Are My Rules, Checkup, Statement and the UCP/ACP evidence views designed pages of the one
  viewer?** They draw Action State's own record kinds (`actionstate.rules_compare/v0`,
  `actionstate.checkup/v0`, `actionstate.statement/v0`) and the UCP/ACP checkouts, which today live
  only in the private actionstate-muse. (a) Yes: capsule-viewer gets a module for each, and the
  kinds' names and the pages' words become public (Apache-2). (b) No: they are Muse's own output,
  not receipt, card or report pages; they stay in the plugin, which is then not "nothing", and
  they are brought to the three points there. (c) They move once their records are neutral kinds
  (for example the rules comparison as a contract-report Result, which capsule-viewer already
  draws). The ruling's "out of scope: enterprise paid-product content stays off public surfaces" is
  why this is asked rather than assumed; the record is silent on whether these pages are
  paid-product content.
- **Q2. Is the whole-sale page still wanted?** `receipt page --sale` is the only page of an
  x-deal-sale/v0 bundle, and only on x-deal-v0 deals. (a) Yes: rows 7, 9 and 10 build it. (b) No:
  rows 7 and 9 drop it and row 10 only deletes it.

**For Sherlock2 (wording, under Steven's delegation).**

- **Q3. The approval-card tags.** "ACTION STATE · PAUSED FOR YOU", "ACTION STATE · NOT ALLOWED BY
  YOUR RULES", "ACTION STATE · STOP: CHECK THIS" (`muse: wording/capsulectl/actionstate.json`) are
  not shown today on current installs (1.3). (a) Drop them: capsulectl's built-in tags stand, and
  rows 3 and 5 retire the pack. (b) Keep them: they need a home that cannot fall behind
  capsulectl's keys (a capsulectl profile setting for the three tags alone, a capsule-cli change,
  or a pack the plugin rebuilds from the host's capsulectl at install), and rows 3 and 5 change to
  that.
- **Words for new capsule-viewer lines** (the sale kind, the x-history-selection module, and any
  module Q1 adds): Sherlock2's, each PR sending its new keys.

**Engineering's, left to the row's lane.**

- **E1. How a Go program gets the receipt `buildModel`'s output** (row 6). The plugin and
  capsulectl have no JavaScript runtime, and a Go port would be the second implementation u562
  rules out. Options: an embedded JavaScript engine running `go/receipt`'s module script in
  capsulectl; capsule-viewer publishing a model-only entry point the Go side runs the same way;
  or the skill reading the page's own model. The row's design note picks one.

**Engineering's, decided here.** capsule-viewer owns every page this note moves; capsulectl stays a
generic presentation host and nothing in capsule-cli changes; a moved page is drawn by the command
that writes its bundle, with capsule-viewer's Go module (2.1); the plugin's x-deal-v0 receipts are
replaced by capsule-viewer's existing modules rather than ported, so no code moves from the private
repository to the public one (only words, through Sherlock2, and only for pages Q1 places here).
Deleting the plugin's presentation layer and its `presentation` verbs carries out Steven's ruling,
so it is engineering's call with the ruling linked (asg-rules tracking.md, one-way doors). A muse
page verb that changes what draws it (rows 4 and 10) keeps its name and flags.
