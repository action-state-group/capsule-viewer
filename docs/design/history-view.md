# History view: one History page for Muse, mesh-llm and Goose (design note)

Status: design for capsule-viewer#247, the component half of
actionstate-muse#334. The TypeScript view shipped in viewer 0.14.0 and the Go
twin, `go/historyview`, in capsule-viewer#253. The three callers move onto it
in their own items (section 9).

Retired: `go/historyview` was deleted in capsule-viewer#477 with no importer
(`docs/design/receipt-view-model.md` row 11); the Go twin text below is history.

## Sources

| Ref | Where | What it fixes |
| --- | --- | --- |
| [334] | actionstate-muse#334 (Steven, 2026-11-03) | the bar: the #203 anatomy on the mesh and Goose History pages, Muse's words where a part means the same, one headline, "How this was checked", the "What this node shares" block, dotted slots, two checkpoints with one "Cut at" second |
| [203] | actionstate-muse#203 | the anatomy: header, hero, chips, rows, the one callout, seal with a second-signature slot that is always present, flat panels; no crypto words above the panels; no script needed for layout |
| [207] | actionstate-muse#207 and its History card mock | the Muse History card: "History · Shared by <name>", hero count, chips, one row per item with its 🔏 proof line, "What this does not show", "Locked as it happened", "Countersigned by: no one yet" |
| [guide] | the report design guide behind actionstate-muse#203, §16 to §19 | reader tiers; scope first, not negatives first; neutral surfaces use neutral names ("Second signature", never "countersign", no grading words); one name per thing |
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

**Beside the existing History card.** `capsuleviewer.standard-history/v0`
(`docs/design/history-card.md`) draws AAC's `standard_history/1`, `/3` and `/4` cards from a
sealed bundle and stays as it is; this view does not read bundles. Muse's
History you send stays that card. This view is a viewer contract like
`chart-spec`, owned here; the README's note that the view-model JSON belongs
to the Muse plugin is about the receipt's view model, and the README says so
once this ships.

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
  `historyViewHtml(input, overlay?)` returns the HTML text (static pages), and the
  page runtime's global `EvidenceGraph.renderHistoryView(input, container, overlay?)`
  builds the same tree as DOM with `textContent` only (scripted pages). A
  subpath export, `@action-state-group/capsule-viewer/history-view`, has no
  dependencies, so a bundler inlines only this code.
- **Go**, `github.com/action-state-group/capsule-viewer/go`: a twin,
  `go/historyview`, `Render(input, overlay) (string, error)`, which writes
  the same bytes as `historyViewHtml(input, overlay)`. Both are held to one set of vectors,
  `vectors/history-view/` (inputs and expected HTML), the way `go/chartspec`
  and `ts/src/chart-*.ts` share `vectors/chart-spec`.
- **Python** has no twin. A Python caller writes the input JSON and embeds
  the page runtime (section 7).

The wording pack is one file, `ts/src/wording/history-view.en.json`, holding
neutral words only; the Go module carries a byte copy, held by a test that fails when they
differ. A product caller passes an overlay pack (section 4).

## 3. The input contract: `history-view/v0`

One JSON object. Unknown members are refused, not ignored, so a caller
cannot pass words or a "filled" flag the view does not decide. Every string a
caller passes is drawn as text, never parsed as HTML.

```json
{
  "view": "history-view/v0",
  "kind": "checkpoint",
  "surface": "neutral",
  "reader": "recipient",
  "holder": { "node": "3f9a…", "stream": "mesh-llm" },
  "audience": { "kind": "anyone" },
  "built_at": "2026-11-03T18:09:41Z",
  "checked": { "where": "page", "by": "capsules-plugin 0.1.13" },
  "outcome": { "kind": "answered" },
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
  "checks": [
    { "id": "checkpoint_signatures", "status": "pass" },
    { "id": "checkpoint_chain", "status": "pass" },
    { "id": "envelope_signature", "status": "not_run" }
  ],
  "periods": [{ "from": "2026-10-26", "to": "2026-11-02", "cells": [{ "what": "llama-3.1-8b", "value": "41" }] }],
  "sharing": {
    "standard_history": true,
    "history_segments": "counterparties",
    "record_at_completion": "counterparty",
    "adjudications": "deliver_to_subjects",
    "exchange_corroboration": true,
    "adjudicate_differing_twins": false,
    "witnesses": ["https://witness.example"]
  }
}
```

- `kind`: `checkpoint` or `deal`, the page's one row kind; every row's
  `kind` must equal it, and it picks the headline when there are no rows.
- `surface`: `neutral` or `product`. A `product` page draws with the
  overlay pack its caller passes (section 4); a `neutral` page takes none.
  It never changes what is drawn, only the words.
- `reader`: `owner` (the holder's own page; header `PRIVATE`) or `recipient`
  (someone shown it). `audience` is `{kind: "private"}`, `{kind: "shared",
  for: "<who>"}` or `{kind: "anyone"}` (a node's answer to any requester).
- `holder`: whose history: a person's `name`, or a node's key id `node`,
  drawn shortened with the full id behind the 🔏 chip. `stream` (optional)
  names the log when a node keeps more than one (Goose keeps one per
  community): one page draws one stream.
- `picked` (optional, deal pages): `true` when the holder picked these deals,
  so the headline puts the scope first ("6 deals Steven picked · steps
  recorded, not outcomes", [guide] §17).
- `checked.where`: `page` (the caller's script checked it when this page
  opened) or `builder` (the caller checked it when it built the page, at
  `built_at`). The page says which, but only when at least one check passed or failed; when every check is `not_run` it draws no such line ("As of {at}" wording, Sherlock2's ruling on #261). `checked.by` names the tool, in the
  panel only.
- `outcome` (checkpoint pages): `answered`, `refused` (with the node's own
  `reason` token, drawn as the node's text) or `unreadable`. Only `answered`
  draws rows; the other two draw their own hero and the panel. A node with no
  checkpoint yet that answers with a signed refusal is `refused`, drawn with
  its reason; "No checkpoints yet" is `answered` with no rows (a Goose stream
  with no checkpoint).
- `rows`: for `checkpoint`, `cut_at` (RFC 3339, any precision), `log_size`,
  `anchor` (hex), `signature` (`pass`, `fail`, `not_run`). For `deal`,
  `asked`, `outcome`, `money` (caller text, optional), `opened_at`,
  `last_at`, `record` (record id). Both kinds carry the two slots. Rows come
  in the caller's order; the view does not sort. Deal rows come newest
  first (the headline says so), so the caller orders them.
- A slot is `{state, by?, at?, through?}` with `state` one of `passed`,
  `failed`, `none` (the checker established there is none), `not_checked`.
  `through` is `{k, n}` for a check that covers part of the steps. A
  `passed` witness slot needs `at` (its `by` is optional: Muse's grade
  carries no witness name); a `passed` second-signature slot needs `by` and
  `at`.
- `checks`: one entry per check the caller ran or did not, each an `id` from
  the closed list in the pack (`readable`, `refusal`, `artifact_digest`,
  `card_digest`, `checkpoint_signatures`, `checkpoint_chain`, `consistency`,
  `anchor`, `period_counts`, `envelope_signature`, `key_is_node`,
  `reply_bound`, `witness`, `second_signature`, `deal_report`), a `status`
  (`pass`, `fail`, `not_run`) and optional `values` for the pack's
  placeholders. An unknown `id` is refused: the words for a check live in
  the pack, not in the caller. The mesh verifier's ids are this list's.
  Only the `witness` check, and only with status `not_run`, takes `values`
  (capsule-viewer#368, Sherlock2's ruling on capsules-plugin#358): `n`, a whole
  number, the 1-based place of the checkpoint row the witness has not
  registered yet, and `at`, that row's own `cut_at` as an RFC 3339 time (the
  view formats it like every cut time, so no preformatted text passes). Both
  are required; the page refuses them unless the page is a checkpoint page,
  `n` is one of its rows, that row's `witness` slot is not `passed`, and `at`
  is that row's `cut_at`, so the line and the chip cannot name two different
  checkpoints. The line then reads "Not checked here: A witness time-stamped
  these records. Checkpoint {n} (cut {at}) is not registered with the witness
  yet." Any other `values` is refused as before.
- `periods` (optional, checkpoint pages): the Service History's counts, one
  entry per closed week, each cell a caller-named `what` and its count, or
  `withheld: true` where the node withholds a count under 5 ("fewer than 5").
  Drawn as separate rows, never summed or compared ([guide] §18).
- `sharing` (checkpoint pages, required there): the node's live settings,
  section 5, with the values the node itself uses. Every member is optional;
  one the node does not state is named in one closing sentence, "This node's settings don't say: <a>; <b>.".
  A Goose node may also state `share_deal_half` and `stranger_safe`, each
  drawn as one line when present.
- `signer_directory` (optional, deal pages): the HTTPS address signers are
  looked up at, drawn with Muse's disclosure line.
- `period` (optional): `{from, to}`, drawn in the header.

**Refusal.** An input that breaks any rule in this section (an unknown
member, check id or setting value; a `passed` slot missing what it needs; a
malformed time; an overlay that does not check) draws no history.
`historyViewHtml` and `Render` return an error naming every reason, so a
static caller writes no page; `renderHistoryView` draws one visible refusal
line naming the reasons (`data-history="refused"`), never an empty or
partial page.

The contract is frozen once a release ships it. Additions are new optional
members in `v0`; a change of meaning is `v1`.

## 4. The anatomy, and its words

| Part | Checkpoint page (mesh, Goose) | Deal page (Muse) |
| --- | --- | --- |
| Header | "History · <holder>" · scope · audience badge | "Your History" (owner) or "History · Shared by <name>" · audience badge |
| Hero | one line: "2 checkpoints · 127 entries · last cut 18:07 UTC · every checkpoint signature checks" | "<n> deals" and "newest first" |
| Chips | signatures (all check / n don't verify / not checked here) · witness (time-stamped / not checked here) · started <date> | recorded · time-stamped count · not checked here |
| Rows | cut time to the minute, entries, 🔏 anchor; the two slots | asked, outcome and money, opened, last step, 🔏 record; the stamp row |
| Callout | "What this does not show" | "What this does not show" |
| Block | "What this node shares" (section 5) | none |
| Seal | "Locked as it happened", the second-signature slot | the same |
| Panel | "How this was checked": every check, checked and not checked | the same |

The hero's verdict is one verdict for the page ([203] kill list), from
every log check and every row: any `fail` of a check other than `witness`
and `second_signature`, or of a row's `signature`, reads "This history
didn't verify", and the page then draws none of its rows or counts, as the
mesh page does today, but keeps "How this was checked", so the reader sees
which check failed. A failed `witness` or `second_signature` (a check, or a
row's slot) is drawn in its chip or that row's slot only, so one deal's
failed stamp never hides the others; "every checkpoint signature checks" needs
every row `pass` and every check that ran `pass` ("every signature
checks, including the answer's own, by the node's published key" needs `envelope_signature`
and `key_is_node` to pass as well), and names the checks that
did not run under "How this was checked"; otherwise "signatures not checked
here". **No rows** has its own hero, never a vacuous pass: "No checkpoints
yet" (`answered`, no rows), "The node declined to answer" (`refused`, with
its reason), "This page could
not read the answer" (`unreadable`), and Muse's "There are no deals in this
store yet." for an empty deal page.

**One key set, Muse's words.** capsule-viewer is a public, neutral
repository, so its pack holds neutral words only. Where a part means the same
as on the Muse card and Muse's words are neutral, the entry is copied from
Muse's packs, with the source key and the Muse commit recorded in the pack's
provenance:
`history.page.*` from `plugin.json` (title, PRIVATE line, counts,
opened, last step, stamp lines) and `stamp.*`, `seal.*` from `receipt.json`.
Once Muse deletes its `history.page.*` (section 9), the viewer pack is the
source, and its provenance says so. New entries (the checkpoint hero and
rows, the sharing block, the check names, and the words that exist so far
only in the [207] mock: "What this does not show", "Locked as it happened")
are new copy for Sherlock2. One
thing has one name: the witness slot is "time-stamped" everywhere, as
actionstate-muse#333 shipped it, never "postmarked".

**Product overlay.** Product words stay with the product. A `product` caller
passes an overlay pack, keyed to the view's closed key set: Muse keeps its
overlay in actionstate-muse ("Countersigned by", "ask Muse to send it for a
second signature", "Not a rating"). The view checks it like any input: an
unknown key or a placeholder the base entry does not have is refused, so an
overlay changes words, never what fills. The neutral entries are the ones
the mesh console needs inside its banned terms ([guide] §18,
`banned-terms.ts`): "Second signature: none yet", no product name, and "this
is not a judgment of the node". A test draws every vector with `surface:
neutral` and fails on any banned term, including inside other words, and
the T8 History word gate (`docs/design/history-card.md`) runs over every
vector, as it holds Muse's History text today.

**Time.** A static page cannot know the reader's zone, so times are UTC in
Muse's format ("Nov 3, 2026, 18:07 UTC"); rows show the minute too. A scripted page
draws the same text, so static and scripted pages match.

## 5. "What this node shares"

Built from `sharing`, with Steven's five lines from [334] as the pack's
entries, in Sherlock2's wording (spec names such as "history card" stay in
the panel):

| Line | Drawn when |
| --- | --- |
| With anyone who asks: a summary of its checkpoints, meaning how much it has recorded and when, and nothing about any exchange | always |
| Only with the other side of an exchange: that exchange's half of the record | `share_deal_half` is `counterparty` (what a Goose node's policy states); nothing when absent |
| With anyone who asks, even a stranger: <items> | `stranger_safe` is stated (a list of short tokens); `history_card/1` is drawn as "the History Card", any other token as it is; when empty, "Nothing else goes to a stranger."; nothing when absent |
| With anyone: the Service History | `standard_history` is true (the product default is on); when false, "The Service History: only the other side of an exchange gets it (off for anyone else on this node)."; when absent, named in the closing "this node's settings don't say" line |
| Only with the other side of an exchange, when they ask: that exchange's record | `history_segments` is `counterparties`; `peers`: "With any node that signs its request: an exchange's record."; `off`: "The other side of an exchange can't ask for its record (off on this node). They still get the sealed record when it completes." (the last sentence only when `record_at_completion` is `counterparty`); when absent, named in the closing "this node's settings don't say" line |
| With any node that asks by an exchange's id: whether this node holds its half (ids and digests only) | `exchange_corroboration` is true; nothing when false; when absent, named in the closing "this node's settings don't say" line |
| Sent on its own: the sealed record when an exchange completes | `record_at_completion` is `counterparty`; when `off`, "The sealed record isn't sent when an exchange completes (off on this node)."; when absent, named in the closing "this node's settings don't say" line |
| If this node judges an exchange, its verdict goes to the node judged | `adjudications` is `deliver_to_subjects`; when `off`, "Verdicts this node reaches aren't sent to the nodes judged (off on this node)."; when absent, named in the closing "this node's settings don't say" line |
| When two copies of a model answer differently, this node sends the question and both answers to a referee | `adjudicate_differing_twins` is true; nothing when false (the default); when absent, named in the closing "this node's settings don't say" line |
| Signed checkpoints go to the witnesses named here: <witnesses> | `witnesses` is not empty; when empty, "No witnesses named in this node's settings now. A row's time-stamp may come from an earlier setting."; when absent, named in the closing "this node's settings don't say" line |
| Never: a record to anyone who doesn't prove who they are | `history_segments` is stated (the rule is the mesh plugin's signed-request rule, which its policy carries); when absent, named in the closing "this node's settings don't say" line, unless `stranger_safe` is stated: that allowlist already says what a stranger gets, so the page does not also say the rule is unstated |

The values are the node's own (`share_policy.rs`: `history_segments` is
`off`, `counterparties` or `peers`; `record_at_completion` is `counterparty`
or `off`; `adjudications` is `deliver_to_subjects` or `off`;
`exchange_corroboration` and `adjudicate_differing_twins` are on/off). Every
member is optional, because a node's advertised policy (`disclosure-policy/0`,
what Goose reads) carries only `share_deal_half` and `stranger_safe`, none of
these members; the five that mesh nodes advertise (`standard_history`,
`history_segments`, `record_at_completion`, `adjudications`,
`exchange_corroboration`) became optional in an additive change to `v0`, after
`adjudicate_differing_twins` and `witnesses` already were. When members are
absent the page draws one closing line for all of them, "This node's settings
don't say: <what the first decides>; <what the second decides>." (the words are
in the pack as `shares.unstated`, `shares.unstated.one` and `shares.unstated.*`; a single missing setting reads "This node's settings don't say <what it decides>.", with no colon; nothing is drawn when
none is absent), and never a default, so no disclosure is left out by omission or invented. A
member that is present keeps its line exactly as in the table; a present
member of the wrong type or outside its list is refused, never drawn as the
nearest line. Two more optional members carry what a Goose
policy does state: `share_deal_half` (`counterparty`, the only value) and
`stranger_safe` (a list of strings), drawn right after the first line; an absent one draws no line, since they
are not settings the page must account for, and a present one of the wrong
type or outside its list is refused. The Goose
vector `goose-policy-share-deal-half-only` states exactly those two and is the live Goose shape. The golden `goose-advertised-policy` is a fixture, not a real Goose policy: it carries the five mesh members a Goose policy does not have, to exercise those lines, so do not quote it as what a Goose node advertises. The block names when the settings were read
(`built_at`), since a static page is a snapshot.

## 6. Slots, and two checkpoints at one time

**Slots.** The view alone decides how a slot looks, from its state: `passed`
fills it, with `at` and, when given, `by` ("<at> · by <witness>", "<signer>
signed this record too · <at>, by their clock"), and `through` adds
"through step k of n";
`failed` reads "Didn't verify"; `none` reads "Not time-stamped yet" or "none
yet"; `not_checked` reads "Not checked here". Only `passed` fills, and a
`passed` slot missing what section 3 requires is refused ([333]). The view
cannot tell a self-countersignature; the caller draws it as `failed`, as
Muse's `stampsOf` does today. The seal's
second-signature slot is always present ([203] item 6). It sums the rows'
slots without filling: when some but not all of the rows that carry a second
signature (`passed` or `failed`) are `failed` it reads
"<k> of <n> didn't verify; see each row", when every such row (or the check
itself, with no failed row) is `failed` it reads "Didn't verify", any
`not_checked` reads "Not checked here", all `none` reads "None yet", and
otherwise it points to each row's slot.

**Same minute.** Each checkpoint is its own row, never merged by time. Every
checkpoint row shows its entry count and its 🔏 anchor, so two rows with the
same "Cut at" minute are told apart. Cut times show to the minute (a node may
record seconds), and each side of an exchange gets its own checkpoint, so two
rows can share a time; the "What this does not show" block says so (#281,
Sherlock2's wording on actionstate-muse#334).

## 7. Static and scripted pages, by caller

| Caller | Page | How it calls the view |
| --- | --- | --- |
| Muse (Go) | static, no script ("Your History", PRIVATE) | `historyview.Render(input, overlay)` from the Go module it already pins; Muse maps `deal report --read-only` and its `grade` to rows and slots, as `stampsOf` does today |
| mesh console (TypeScript) | scripted: the saved page checks itself when it opens | the saved page's inline script imports `renderHistoryView` from the subpath export, runs the node's own verifier as today, maps its verdict to `checks` and rows, then draws; `checked.where` is `page` |
| Goose, loop (Python) | scripted | one page per stream: `site/watch.py` writes the input JSON from each card's own checkpoints (`history_cards.py`'s `card_checkpoints` gives `issued_at` and `log_size`; the anchor is the SHA-256 of the checkpoint statement) and the node's advertised policy for `sharing`; the page embeds the pinned `history-view.iife.js` and calls `HistoryView.renderHistoryView` |

The view also ships alone as `dist/history-view.iife.js` (global
`HistoryView`, with its `.sha256`), with no verifier in it, so a page that
only draws a History does not embed the 1.2 MB page runtime. The view's
stylesheet ships beside the function, in TypeScript and Go
(`historyViewStyles`, held to the same vectors). `renderHistoryView` inserts
no style itself, so a page with a strict CSP lists the hash of the one
stylesheet it embeds. On a dark screen (`@media screen and
(prefers-color-scheme:dark)`) the stylesheet swaps in a dark palette and paints
its own background, so the view reads on any host page; print always uses the
light palette.

**Serialization.** TypeScript, Go and the browser write the same bytes
because the HTML is serialized by the HTML fragment serialization rules,
written out in the view itself: in text, escape `&`, `<`, `>` and U+00A0.
Caller text never goes in an attribute, except a card page's
validated values (section 11: a plain `.json` or `.html` file name, an
RFC 3339 time, a percent-encoded download): an attribute value may hold no
`<`, `>`, `"` or U+00A0, and its `&` is written `&amp;`, so attribute
escaping cannot differ between engines. Go writes it with its own serializer, never `html/template`, whose
`&#39;` and `&#34;` differ. The layout follows [203]: one column under 900px,
two above, and print; the first screen shows the header and the hero.

## 8. Tests and goldens

- `vectors/history-view/`: inputs for a mesh node (Service History on, the
  normal case; card only; counterparties on and off; a failed signature; a witness
  `passed`; two checkpoints in one second), a Goose node, and Muse's page
  (no grade, witnessed through part, countersigned, self-countersign drawn
  as failed, one failed stamp among passing deals, picked by the holder,
  empty store), refused and unreadable
  answers, a node with no checkpoint, `peers` and every setting off, a page
  built from an advertised policy alone (twins and witnesses absent), each
  with its expected HTML. Muse's vectors draw with a test
  overlay; the real overlay's goldens live in actionstate-muse. TypeScript and Go both render every
  vector and match the expected bytes.
- Refusals: an unknown member, an unknown check id, a `passed` witness slot
  without `at`, a `passed` second-signature slot without `by` or `at`, an unknown `history_segments` value, an overlay with an
  unknown key or placeholder; each returns an error (static) or draws the
  refusal line (scripted).
- Words: every pack key used is in the pack; every Muse-sourced entry equals
  a snapshot of its source vendored in this repository with its Muse commit
  (actionstate-muse is private, so CI cannot fetch it), dropped once Muse's
  migration makes this pack the source; no banned term on `neutral`; T8 over
  every vector.
- Scripted: the runtime's `renderHistoryView` builds DOM whose `outerHTML`
  equals the static HTML for every vector, under the CSP test pages the
  emitter tests already use.
- Goldens for Steven's gate on [334]: one page per caller, at 390px, 1280px
  and print, rendered from the vectors.

## 9. Release and the callers' items

The view ships in the next viewer release (`ts/vX` and `go/vX`, per
RELEASING.md). The TypeScript view and `history-view.iife.js` ship first,
since the mesh console needs them first; the Go twin may follow in the next
release, held to the same vectors. Each caller then moves in its own item and deletes its own
renderer:

- actionstate-muse: `history page` draws through `historyview.Render`;
  delete the template in `history_page.go` and the `history.page.*` words the
  view now owns.
- Mesh-LLM/capsules-plugin: the saved History page draws through the view;
  the route adds the node's sharing settings; the verifier returns each
  checkpoint's anchor and signature status (today it gives `{size, time}`
  and stops at the first failure); and the "same Cut at" export is explained
  (answered by #281: each side of an exchange gets its own checkpoint).
- evidence-network/loop: the Goose History card draws through the view, one
  page per stream, from each card's checkpoints and the node's advertised
  policy.

None touches the Devcon S08 image (capsules 0.1.10).

## 10. Doors

- The input contract, `history-view/v0`, is frozen once released.
  Engineering's call; Sherlock2 confirms it carries no product meaning and,
  as a neutral viewer contract, stays inside the neutrality boundary.
- The words, Muse-sourced and new, and the neutral forms: Sherlock2, under
  the wording delegation. Product words live in the caller's overlay, never
  in this repository.
- The "What this node shares" lines are Steven's own text from [334]; the
  off-state lines in section 5 are new copy for Sherlock2.
- The look follows the Muse History card ([207] mock). If review changes
  that, Steven sees it before the build.

## 11. The card page (capsule-viewer#384)

Status: built for #384 (Steven, 2026-11-25: one History view, yours and
their card by perspective, machine and .html forms; RECORDED means
checkpointed), with Sherlock2's answers on the open points
(buzz://message?channel=0d760ea3-529d-4dec-b309-24184967f8e0&id=92cd3346f2982f3630699fd0c56e98ff4ff54a773b4dc478fd0b80a1b4b14fbe&thread=0614ef5a39648aaf8b77d64801310f234657fdefc5c6f90c20c9e6016c04d0a8
and her correction on the seller's name,
buzz://message?channel=0d760ea3-529d-4dec-b309-24184967f8e0&id=1623c8d3ad4192d9736caae6bc470fd910460714e9375f634ec1294ec0e8573d&thread=0614ef5a39648aaf8b77d64801310f234657fdefc5c6f90c20c9e6016c04d0a8).

**One object, two forms.** A deal page that carries `machine` is a card
page, drawn from the signed object itself, in the x-deal-v1 receipt's look
(#382): header and tags, a plain top line, the stamp row, "Is this record
intact?", "Check it yourself", "What this does not prove", and the footer.
The machine form is that object: the page offers its exact bytes as the
download ("Download card") and the `capsulectl verify --bundle <file>` line
with the answer to expect. The .html form adds nothing the object or the
holder's own book does not carry.

```json
{
  "view": "history-view/v0", "kind": "deal", "surface": "neutral",
  "reader": "owner", "holder": {"name": "Maya"}, "audience": {"kind": "private"},
  "built_at": "2026-11-27T03:15:00Z",
  "checked": {"where": "builder", "by": "capsulectl verify"},
  "rows": [], "checks": [],
  "machine": {
    "file": "maya-history-card.json",
    "text": "<the card bundle's canonical JSON>",
    "verify": {
      "verdict": "VALID", "bundle_digest": "<64 hex>",
      "checks": {"producer_signatures": "pass", "interval_coverage": "pass",
                 "graph_closure": "pass", "per_record_membership": "pass",
                 "checkpoint": "pass", "witnesses": "pass"},
      "witness": {"by": "Action State's witness", "at": "2026-11-27T03:13:00Z"}
    }
  },
  "deals": {
    "deal-301": {
      "item": "200 conference badges",
      "amount": {"value": "1000000", "assetCode": "BTC", "assetScale": 11},
      "recorded": {"state": "passed", "at": "2026-11-27T03:12:00Z"},
      "time_stamped": {"state": "passed", "by": "Action State's witness", "at": "2026-11-27T03:13:00Z"},
      "countersigned": {"state": "not_checked"},
      "receipt": "maya-receipt-deal-301.html"
    }
  },
  "sample": 0
}
```

- `machine.text` is the card bundle as capsulectl wrote it, in canonical JSON
  (RFC 8785). `verify` is capsulectl verify's own answer on that bundle. The
  view takes the SHA-256 of `text` and refuses the page unless it is
  `verify.bundle_digest`, so one bundle's answer is never drawn beside another
  bundle. The view verifies no signature.
- The counts are the card's own `outcomes` tally (and `not_counted`'s
  `no_witness_time`, "waiting for a time-stamp"), never computed by the view,
  so whatever the card counts (shop_preauth purchases included, #372) is what
  the page says, in the words the demo's chat uses ("24 deals, 0 didn't go as
  agreed, 2 not final yet", "every one went as agreed"; Steven's words,
  evidencebook-skills#272 item 4), with "As <name> reported." under them.
- **Your History** (`reader: owner`, `audience: private`): the holder's own
  copy, whose `x-standard-history/v0` block carries the deal entries (AAC SH
  §5.2, §11.2). One row per entry, newest first: bought or sold, the item, the
  row's top line from its term results (the receipt's words where the meaning
  is the same), the amount, when it was agreed, each side's term result, "Their
  signed agreement is in your records." when the entry's `happened` is
  `stamped_by_both`, the stamp row and a link to that deal's receipt page.
- **Their History** (`reader: recipient`, `audience: shared`): the card the
  holder sent, counts only, no rows, no stamps and no seal (Steven's Q3 ruling:
  a sent card is counts only). An object carrying deal entries is refused on
  this page, so a counts-only page can never embed or offer private entries.
- `deals` (Your History only) adds, per entry id, what the entry does not carry
  and the holder's own book does: the agreement's `terms.item`, its agreed
  amount (AAC SH §5.2 names the entry's amount the agreed amount, but the
  one producer of /3 cards, evidencebook's capsulectl, fills it with the value
  band's floor until its design Q15 rules: `deal_standard_history3.go`
  `bandAmount`; so a /3 entry's amount is said as "from … (its value band)"
  when the holder's book gives no amount), the stamp slots and the receipt page's
  file name. An id that is not an entry of the object is refused. The other
  side's name is not drawn: no sealed record holds it yet (evidencebook#1031),
  and a key id is never shown as a name.
- `sample` is how many of the card's deals are sample history the operator
  made, said once.

**A row's top line and seal.** A deal entry carries no settlement facts, so a
row says only what its term results support: "Ruled: your side's term not met"
(with its remedy), "In dispute before the adjudicator", "The two sides'
statements differ", "Not met: …" for a term both sides or one uncontested side
say was not met, "Went as agreed: both sides say every term was met", "Nothing
is due yet", "No term has come due", else "Not final yet"; a /1 or /2 entry's
outcome otherwise. The harbour seal ("Didn't go as agreed", the receipt's own
shapes, decorative and said in words) shows only on a row with a final not-met
ruling, as the receipt draws it; the Done seal needs the settle record, which a
History row does not have, so a History never draws it.

**Stamps.** RECORDED means checkpointed: it fills only from the row's
`recorded` slot (a checkpoint that covers the deal's last step verified;
"Checkpointed through step k of n" when it covers part). TIME-STAMPED fills
from the `time_stamped` slot (the witness and its time). COUNTERSIGNED fills
only from a countersignature checked on that deal's bundle; the other side's
half of the deal is said in words, never as COUNTERSIGNED. A slot that covers part
of the deal's steps (`through`) says "… through step k of n" and is not drawn
filled. Every slot that is absent reads "Not checked here". On the legacy deal page the `deal_report`
check no longer fills RECORDED either: it says each deal was read with its own
report, not that a checkpoint covers it.

**The signature.** "Who signed this card" says what a signature shows only
when capsulectl verify reported the signature check passed; otherwise it says
the check failed or was not reported. "Is this record intact?" reads "No" when
any check it lists failed, the outside time stamp included.

**Times.** The static page (TypeScript or Go) draws every time in UTC and says
"Times are in UTC."; `renderHistoryView` rewrites each `time[data-time]` into
the reader's zone and says "Times are in your time zone." (pass
`{localTime: false}` to keep UTC). Pages without card times are unchanged.

**Layout order** (#448): the top line, then the rows' facts, then the proof
and the caveats ("What this does not prove"), then "Technical details" (the
card token, the signing key, the fingerprint and the deal ids), collapsed.

**Tests.** `vectors/history-view/make_cards.py` writes the card vectors (small
synthetic bundles; the cards and entries are AAC's /3 vector
`outcomes-from-rows` and the real /1 fixture `person-own`) and
`fill_card_reasons.mjs` their refusal reasons; both twins are held to the
goldens and reasons. `ts/test/history-view-card.test.ts` takes real
capsulectl bundles with their real verify output, a changed bundle, the
download's bytes, caller text in markup, the reader's zone, and the seal and
words shared with the receipt.


## 12. The History view as a presentation module (capsule-viewer#478)

Status: built for #478, the receipt view-model note's section 7 row 8
(`docs/design/receipt-view-model.md`).

**What it reads.** `historyViewModule` (`ts/src/history-view-module.ts`,
manifest `capsuleviewer.history-view/v0`) is a presentation module: the runtime
hands it the verified context of an `x-standard-history/v0` bundle, and it reads
the card itself. Its reading (`ts/src/standard-history-card.ts`) is the Python
module-slot History card's (`src/capsule_viewer/static/standard_history_card.js`):
the verification gate, the block's closed shape, the card as the root record's
disclosed `agent_input`, and the card's SH 4 to 6, 11 and 12 check, with the
states `unverified`, `unreadable`, `refused` and `card`. Then, in the Python
module's order, the card's signature (`readerCardSignature`; a failure is the
state `signature_failed`), the snapshot's witness under the reader's own list
(`readerAnchorWitness`; a block checkpoint that is not its anchor's makes the
block `unreadable`) and the card statements' registration (`readerCardRegistered`).
`test/history-view-module-parity.test.ts` and `test/history-view-module.test.ts`
hold both steps to the Python module on every committed bundle, every AAC /1, /3
and /4 vector and each refusal branch.

**The view model is the JSON.** `buildModel` returns plain JSON whose values are
`{value, src}`, the receipt view model's `Sourced` (receipt-view-model.md
section 2): `{record, path}` points into the root record (`/key_id`,
`/timestamp`) or, under `/agent_input`, into the card it discloses; `{bundle}`
into the `x-standard-history/v0` block (its `as_of`, each deal entry);
`{checked}` names a check this page ran (`card_check`, `signature`,
`anchor_witness`, `card_registered`, `membership`). Every member of a standard
card is in the model, sourced, even those the page does not draw, since an agent
answers from the JSON (PRD v1.3 section 3, H1). `historyViewModelJson` is that
JSON for a page writer to save beside the page (H3); the page draws only from
the model, so the parsed JSON draws the same page.

**What it draws.** The card anatomy of section 11, placed in the host's regions:
L0 the counts (and, on the holder's own copy, the rows), L1 "Who signed this
card" (from the page's own signature check) and "What this does not prove", L2
"Which checks ran" (the card's six properties as this page checked them, what
the block does not carry, the witness and registration lines) and the
technical details. The core runtime draws the page's title, the verification
section and the bundle's download, so the module draws no header, no
"Is this record intact?", no download and no footer. A row has no stamps: the
holder's book is not in the bundle. No sealed record names the holder
(evidencebook#1031), so the lines that name one have nameless variants. The
module inserts the view's stylesheet once per page; its manifest pins it
(`executable.style_sha256`), and a page that registers the module adds that
pin to its `style-src`, as for any module's stylesheets.

**Shipping.** Exported from the package and from the browser runtime
(`EvidenceGraph.historyViewModule`), not registered by default: it reads the
same bundles as the Python module, so one registry holds one of them. The
shaped-input entry points (`historyViewHtml`, `renderHistoryView`) keep their
contract and goldens for loop's 0.17.0 copy and the ARD demo's 0.27.2 copy.

**Not here.** The Python History card also draws size bands, roles, disputes,
the not-counted tallies and a reader witness-list editor. Whether capsulectl's
page (receipt-view-model.md PR 10) drops them or the anatomy grows first is
Steven's call through Sherlock2 before PR 10 merges.
