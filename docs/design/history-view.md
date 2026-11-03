# History view: one History page for Muse, mesh-llm and Goose (design note)

Status: design for capsule-viewer#247, the component half of
actionstate-muse#334. Nothing here is built yet. The three callers move onto
it later, each in its own item (section 9).

## Sources

| Ref | Where | What it fixes |
| --- | --- | --- |
| [334] | actionstate-muse#334 (Steven, 2026-11-03) | the bar: the #203 anatomy on the mesh and Goose History pages, Muse's words where a part means the same, one headline, "How this was checked", the "What this node shares" block, dotted slots, two checkpoints with one "Cut at" second |
| [203] | actionstate-muse#203 | the anatomy: header, hero, chips, rows, the one callout, seal with a second-signature slot that is always present, flat panels; no crypto words above the panels; no script needed for layout |
| [207] | actionstate-muse#207 and the ops mock `report-mocks-2026-10-21/history.html` | the Muse History card: "History · Shared by <name>", hero count, chips, one row per item with its 🔏 proof line, "What this does not show", "Locked as it happened", "Countersigned by: no one yet" |
| [guide] | ops `report-mocks-2026-10-21/DESIGN_GUIDE.md` §16 to §19 | reader tiers; scope first, not negatives first; neutral surfaces use neutral names ("Second signature", never "countersign", no grading words); one name per thing |
| [333] | actionstate-muse#333 | a stamp fills only on a check that passed; a failure reads "Didn't verify"; anything else stays dotted "Not checked here" |
| [muse] | actionstate-muse `internal/plugin/history_page.go`, `wording/plugin.json` `history.page.*`, `wording/receipt.json` `stamp.*`, `seal.*` | today's Muse private History page and its words |
| [mesh] | Mesh-LLM/capsules-plugin `crates/evidence-plugin/src/history_page.rs`, `web-ui/src/features/capsules/lib/saved-pages.ts`, `history-verify.ts`, `banned-terms.ts` | today's saved History page: the node's own answer, checked in the page by its own verifier |
| [goose] | evidence-network/loop `scripts/history_cards.py`, `site/watch.py`, `site/watch.js` | today's Goose history cards: streams, witnesses, started date, "no history since" |

## 1. The problem, and what is shared

Three renderers draw one idea, "what this holder's log shows", with three
codebases and three vocabularies: a Go template in Muse (deal rows and
stamps), a TypeScript page in the mesh console (a verifier's audit log), and
a JavaScript ring view in loop. None follows [203], and only Muse's uses a
wording pack.

What they share is the page, not the data. Each caller already owns how it
gets and checks its history (capsulectl's `deal report`, the node's own
`history-page` answer and its in-page verifier, a commitment's stapled
cards). So the shared component **draws; it never fetches and never
verifies**. It takes a view model the caller builds from what it checked,
and it decides the layout, the words and the rule for which slots may fill.
That is the same split the viewer's History modules already use (the module
draws, the runtime or the producer decides).

The items differ by caller, so the view has two row kinds under one anatomy:

- `checkpoint`: one cut of a node's log (mesh, Goose);
- `deal`: one deal in a person's store (Muse).

A page holds one kind. The reader-facing name is "History" for both; spec
names (`history_card/1`, `service_history/1`) appear only under "How this was
checked" ([guide] §19).

## 2. Owner and layer

capsule-viewer owns it: its README keeps "the generic, neutral view of a
record", the History cards included, and the goldens and wording packs
product modules are held to. It ships in the two packages that already
exist, with no new package:

- **TypeScript**, `@action-state-group/capsule-viewer`: `ts/src/history-view.ts`
  builds the page as a small element tree, then serializes it two ways:
  `historyViewHtml(input)` returns the HTML text (static pages), and the
  page runtime's global `EvidenceGraph.renderHistoryView(input, container)`
  builds the same tree as DOM with `textContent` only (scripted pages). A
  subpath export, `@action-state-group/capsule-viewer/history-view`, has no
  dependencies, so a bundler inlines only this code.
- **Go**, `github.com/action-state-group/capsule-viewer/go`: a twin,
  `go/historyview`, `Render(input) (string, error)`, which writes the same
  bytes as `historyViewHtml`. Both are held to one set of vectors,
  `vectors/history-view/` (inputs and expected HTML), the way `go/chartspec`
  and `ts/src/chart-*.ts` share `vectors/chart-spec`.
- **Python** has no twin. A Python caller writes the input JSON and embeds
  the page runtime (section 7).

The wording pack is one file, `ts/src/wording/history-view.en.json`; the Go
module carries a copy generated from it, with a `--check` test that fails
when they differ (as `scripts/pageruntime.sh` does for the runtime).

## 3. The input contract: `history-view/v0`

One JSON object. Unknown members are refused, not ignored, so a caller
cannot pass words or a "filled" flag the view does not decide. Every string a
caller passes is drawn as text, never parsed as HTML.

```json
{
  "view": "history-view/v0",
  "surface": "neutral",
  "reader": "recipient",
  "holder": { "node": "ed25519:3f9a…", "name": null },
  "audience": { "kind": "anyone" },
  "built_at": "2026-11-03T18:09:41Z",
  "checked": { "where": "page", "by": "capsules-plugin 0.1.13" },
  "rows": [
    {
      "kind": "checkpoint",
      "cut_at": "2026-11-03T18:07:12.418Z",
      "log_size": 127,
      "anchor": "9c41…e0",
      "signature": "pass",
      "witness": { "state": "not_checked" },
      "second_signature": { "state": "not_checked" }
    }
  ],
  "checks": [{ "id": "checkpoint_signatures", "status": "pass", "values": { "n": "2" } }],
  "sharing": { "standard_history": false, "history_segments": "counterparties" }
}
```

- `surface`: `action_state` or `neutral`. It picks the words that differ by
  surface (section 4); it never changes what is drawn.
- `reader`: `owner` (the holder's own page; header `PRIVATE`) or `recipient`
  (someone shown it). `audience` is `{kind: "private"}`, `{kind: "shared",
  for: "<who>"}` or `{kind: "anyone"}` (a node's answer to any requester).
- `holder`: whose history: a person's `name`, or a node's key id `node`,
  drawn shortened with the full id behind the 🔏 chip.
- `checked.where`: `page` (the caller's script checked it when this page
  opened) or `builder` (the caller checked it when it built the page, at
  `built_at`). The page says which. `checked.by` names the tool, in the
  panel only.
- `rows`: for `checkpoint`, `cut_at` (RFC 3339, any precision), `log_size`,
  `anchor` (hex), `signature` (`pass`, `fail`, `not_run`). For `deal`,
  `asked`, `outcome`, `money` (caller text, optional), `opened_at`,
  `last_at`, `record` (record id). Both kinds carry the two slots.
- A slot is `{state, by?, at?, through?}` with `state` one of `passed`,
  `failed`, `none` (the checker established there is none), `not_checked`.
  `through` is `{k, n}` for a check that covers part of the steps.
- `checks`: one entry per check the caller ran or did not, each an `id` from
  the closed list in the pack (`checkpoint_signatures`, `checkpoint_chain`,
  `card_digest`, `artifact_digest`, `anchor`, `key_is_node`, `reply_bound`,
  `witness`, `second_signature`, `deal_report`), a `status` (`pass`, `fail`,
  `not_run`) and `values` for the pack's placeholders. An unknown `id` is
  refused: the words for a check live in the pack, not in the caller.
- `sharing` (checkpoint pages only, required there): the node's live
  settings, section 5.
- `period` (optional): `{from, to}`, drawn in the header.

The contract is frozen once a release ships it. Additions are new optional
members in `v0`; a change of meaning is `v1`.

## 4. The anatomy, and its words

| Part | Checkpoint page (mesh, Goose) | Deal page (Muse) |
| --- | --- | --- |
| Header | "History · <holder>" · scope · audience badge | "Your History" (owner) or "History · Shared by <name>" · audience badge |
| Hero | one line: "2 checkpoints · 127 entries · last cut 18:07 UTC · every signature checks" | "<n> deals" and "newest first" |
| Chips | signatures (all check / n don't verify / not checked here) · witness (postmarked / not checked here) · started <date> | recorded · postmarked count · not checked here |
| Rows | cut time to the second, entries, 🔏 anchor; the two slots | asked, outcome and money, opened, last step, 🔏 record; the stamp row |
| Callout | "What this does not show" | "What this does not show" |
| Block | "What this node shares" (section 5) | none |
| Seal | "Locked as it happened", the second-signature slot | the same |
| Panel | "How this was checked": every check, checked and not checked | the same |

The hero's verdict is one verdict for the page ([203] kill list): "every
signature checks" only when every row's `signature` is `pass` and the
`checkpoint_signatures` check is `pass`; any `fail` reads "<n> signatures
don't verify"; otherwise "signatures not checked here".

**One pack, Muse's words.** Where a part means the same as on the Muse card,
its entry is copied from Muse's packs, with the source key recorded in the
pack's provenance: `history.page.*` from `plugin.json` (title, PRIVATE line,
built line, counts, opened, last step, stamp names and lines) and `stamp.*`,
`seal.*` from `receipt.json`. New entries (the checkpoint hero and rows, the
sharing block, the check names) are new copy for Sherlock2.

**Surface words.** A few entries have a neutral form, used when `surface` is
`neutral`, so the mesh console stays inside its banned terms ([guide] §18,
`banned-terms.ts`): "Second signature: none yet" for "Countersigned by: no
one yet", no product name ("ask Muse to…" is Action State only), and "this
is not a judgment of the node" where Muse says "Not a rating". A test draws
every vector with `surface: neutral` and fails on any banned term, including
inside other words.

**Time.** A static page cannot know the reader's zone, so times are UTC in
Muse's format ("Nov 3, 2026, 18:07 UTC"); rows show seconds. A scripted page
draws the same text, so static and scripted pages match.

## 5. "What this node shares"

Built from `sharing`, with Steven's five lines from [334] as the pack's
entries:

| Line | Drawn when |
| --- | --- |
| With anyone who asks: the checkpoint list and the history card | always |
| With anyone: the Service History | `standard_history` is true; when false, the line reads "The Service History: not shared (Standard History is off)" |
| Only with the other side of an exchange, when they ask: that exchange's record | `history_segments` is `counterparties`; when `none`, "No exchange's record is shared" |
| Sent on its own: the sealed record at completion, and verdicts to the nodes judged | always |
| Never: record bodies to strangers | always |

A `history_segments` value outside the pack's list is refused, never drawn as
the nearest line. The block names when the settings were read
(`built_at`), since a static page is a snapshot.

## 6. Slots, and two checkpoints in one second

**Slots.** The view alone decides how a slot looks, from its state: `passed`
fills it, with `by` and `at` ("by <witness>", "<signer> signed this record
too · <at>, by their clock"), and `through` adds "through step k of n";
`failed` reads "Didn't verify"; `none` reads "Not time-stamped yet" or "none
yet"; `not_checked` reads "Not checked here". Only `passed` fills, and a
`passed` slot without `by` and `at` is refused ([333]). The seal's
second-signature slot is always present ([203] item 6).

**Same second.** Each checkpoint is its own row, never merged by time. Every
checkpoint row shows its entry count and its 🔏 anchor, so two rows with the
same "Cut at" second are told apart. Where two rows share the displayed
second, the time shows its fraction when `cut_at` carries one. Why the
2026-11-03 export has two checkpoints in one second is a question about the
node's cadence, not the view; the mesh migration item answers it (section 9).

## 7. Static and scripted pages, by caller

| Caller | Page | How it calls the view |
| --- | --- | --- |
| Muse (Go) | static, no script ("Your History", PRIVATE) | `historyview.Render(input)` from the Go module it already pins; Muse maps `deal report --read-only` and its `grade` to rows and slots, as `stampsOf` does today |
| mesh console (TypeScript) | scripted: the saved page checks itself when it opens | the saved page's inline script imports `renderHistoryView` from the subpath export, runs the node's own verifier as today, maps its verdict to `checks` and rows, then draws; `checked.where` is `page` |
| Goose, loop (Python) | scripted | `site/watch.py` writes the input JSON from the cards it already reads; the page embeds the pinned page runtime (`go/pageruntime/evidence-graph.iife.js` at the release tag, with its `.sha256`) and calls `EvidenceGraph.renderHistoryView` |

The view's stylesheet ships beside the function (`historyViewStyles`, and its
SHA-256 in `go/emitter/runtime-style-hashes.txt`), so a page with a strict
CSP lists one style hash. The layout follows [203]: one column under 900px,
two above, and print; the first screen shows the header and the hero.

## 8. Tests and goldens

- `vectors/history-view/`: inputs for a mesh node (card only; with the
  Service History; counterparties on and off; a failed signature; a witness
  `passed`; two checkpoints in one second), a Goose node, and Muse's page
  (no grade, witnessed through part, countersigned, self-countersign
  refused), each with its expected HTML. TypeScript and Go both render every
  vector and match the expected bytes.
- Refusals: an unknown member, an unknown check id, a `passed` slot without
  `by` and `at`, an unknown `history_segments` value.
- Words: every pack key used is in the pack; every Muse-sourced entry equals
  its source at the pinned Muse commit; no banned term on `neutral`.
- Scripted: the runtime's `renderHistoryView` builds DOM whose `outerHTML`
  equals the static HTML for every vector, under the CSP test pages the
  emitter tests already use.
- Goldens for Steven's gate on [334]: one page per caller, at 390px, 1280px
  and print, rendered from the vectors.

## 9. Release and the callers' items

The view ships in the next viewer release (`ts/vX` and `go/vX`, per
RELEASING.md). Each caller then moves in its own item and deletes its own
renderer:

- actionstate-muse: `history page` draws through `historyview.Render`;
  delete the template in `history_page.go` and the `history.page.*` words the
  view now owns.
- Mesh-LLM/capsules-plugin: the saved History page draws through the view,
  the route adds the node's sharing settings, and the "same Cut at second"
  export is explained or fixed.
- evidence-network/loop: the Goose History card draws through the view from
  the cards `history_cards.py` reads.

None touches the Devcon S08 image (capsules 0.1.10).

## 10. Doors

- The input contract, `history-view/v0`, is frozen once released.
  Engineering's call; Sherlock2 confirms it carries no product meaning and,
  as a neutral viewer contract, stays inside the neutrality boundary.
- The words, Muse-sourced and new, and the neutral forms: Sherlock2, under
  the wording delegation.
- The "What this node shares" lines are Steven's own text from [334]; the
  off-state lines in section 5 are new copy for Sherlock2.
- The look follows the Muse History card ([207] mock). If review changes
  that, Steven sees it before the build.
